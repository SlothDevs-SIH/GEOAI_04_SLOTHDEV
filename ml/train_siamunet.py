"""Train the Siamese U-Net on OSCD, choose the threshold on validation, and run the decision gate once.

  python ml/train_siamunet.py ROOT                 # train; early stopping on the 3 validation cities
  python ml/train_siamunet.py ROOT --gate          # run the TEST cities once; decide the default method

Why two steps: the test cities are touched exactly once. `--gate` refuses to run a second time (it keeps
eval/results/oscd_learned.json as the lock) unless you pass --force, and says so in the file.

Training: weighted BCE + Dice, AdamW, cosine schedule, early stopping on validation F1 (at the best
validation threshold), fixed seed. The threshold is chosen on validation only.
Outputs: engine/weights/siamunet_oscd.pt (+ .json with band stats, threshold, provenance),
         eval/results/oscd_train_log.json.   Then:  python ml/export_onnx.py
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
import time

import numpy as np
try:
    import torch
except ImportError as e:  # the trainers and the exporter need PyTorch; the engine and the evals do not
    raise ImportError("PyTorch is required for this tool: pip install -r requirements-ml.txt "
                      "(use the CUDA build from pytorch.org for a GPU)") from e
from torch import nn

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from engine import change_learned, config_ml  # noqa: E402
from eval import metrics, oscd_baselines  # noqa: E402
from ml import oscd_data  # noqa: E402
from ml.siamunet import SiamUNet, n_params  # noqa: E402

RESULTS = os.path.join(ROOT, "eval", "results")


def seed_all(seed):
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def dice_loss(logits, y, eps=1.0):
    p = torch.sigmoid(logits)
    inter = (p * y).sum((1, 2, 3))
    return (1 - (2 * inter + eps) / (p.sum((1, 2, 3)) + y.sum((1, 2, 3)) + eps)).mean()


def torch_predictor(model, device):
    """`fn([1, 10, h, w]) -> [h, w]` probabilities, the shape `change_learned.predict_tiled` and `detect` expect."""
    def f(batch):
        with torch.no_grad():
            return torch.sigmoid(model(torch.from_numpy(batch).to(device)))[0, 0].cpu().numpy()
    return f


def city_probability(model, city, st, device):
    """Full-city probability map (tiled, blended)."""
    x = np.concatenate([oscd_data.normalise(city.before, st), oscd_data.normalise(city.after, st)])
    return change_learned.predict_tiled(torch_predictor(model, device), x)


def validate(model, cities, st, device):
    """(best-F1 threshold, F1 at it, ece) pooled over the validation cities."""
    model.eval()
    probs = [city_probability(model, c, st, device) for c in cities]
    valid = [oscd_baselines.valid_mask(c) for c in cities]
    p = np.concatenate([a[v] for a, v in zip(probs, valid)])
    y = np.concatenate([c.label[v] for c, v in zip(cities, valid)])
    thr = metrics.best_threshold(p, y)
    s = metrics.scores(*metrics.confusion(p >= thr, y)[:3])
    return thr, s["f1"], metrics.ece(p, y)


def train(root, epochs=60, batch=32, lr=2e-3, patience=10, size=128, stride=64, seed=0, base=24, device=None, pos_weight_cap=50.0, split_seed=0,
          out_pt=config_ml.LEARNED_PT, out_meta=config_ml.LEARNED_META, log_path=os.path.join(RESULTS, "oscd_train_log.json")):
    seed_all(seed)
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    train_names, test_names = oscd_data.city_lists(root)
    tr_names, val_names = oscd_data.split(train_names, 3, split_seed)     # the split seed is separate: a seed study must keep the same validation locations
    tr = [oscd_data.load_city(root, n) for n in tr_names]
    val = [oscd_data.load_city(root, n) for n in val_names]
    st = oscd_data.stats(tr)                                           # statistics from training cities only
    x, y = oscd_data.make_patches(tr, st, size, stride, seed=seed)
    if len(x) == 0:
        raise RuntimeError("no training patches")
    pos_w = float(np.clip((1 - y.mean()) / max(y.mean(), 1e-6), 1, pos_weight_cap))
    model = SiamUNet(base=base).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)
    bce = nn.BCEWithLogitsLoss(pos_weight=torch.tensor(pos_w, device=device))
    rng = np.random.default_rng(seed)
    best, bad, hist, t0 = {"f1": -1}, 0, [], time.time()
    for ep in range(epochs):
        model.train()
        order = rng.permutation(len(x))
        losses = []
        for i in range(0, len(order), batch):
            xb, yb = zip(*(oscd_data.augment(x[j], y[j], rng) for j in order[i:i + batch]))
            xb = torch.from_numpy(np.stack(xb)).to(device)
            yb = torch.from_numpy(np.stack(yb)[:, None].astype(np.float32)).to(device)
            if len(xb) < 2:
                continue
            opt.zero_grad()
            logits = model(xb)
            loss = bce(logits, yb) + dice_loss(logits, yb)
            loss.backward()
            opt.step()
            losses.append(float(loss.detach()))
        sched.step()
        thr, f1, ece = validate(model, val, st, device)
        hist.append({"epoch": ep + 1, "loss": round(float(np.mean(losses)), 4), "val_f1": round(f1, 4), "val_thr": thr})
        print(hist[-1], flush=True)
        if f1 > best["f1"]:
            best, bad = {"f1": f1, "thr": thr, "ece": ece, "epoch": ep + 1,
                         "state": {k: v.cpu().clone() for k, v in model.state_dict().items()}}, 0
        else:
            bad += 1
            if bad >= patience:
                break
    model.load_state_dict(best["state"])
    os.makedirs(os.path.dirname(out_pt), exist_ok=True)
    torch.save(best["state"], out_pt)
    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    meta = {**st, "threshold": best["thr"], "base": base, "params": n_params(model), "trained_on": tr_names,
            "val_cities": val_names, "val_f1": round(best["f1"], 4), "val_ece": best["ece"], "best_epoch": best["epoch"],
            "seed": seed, "commit": commit, "note": "threshold chosen on validation cities only"}
    with open(out_meta, "w") as fh:
        json.dump(meta, fh, indent=1)
    log = {"history": hist, "device": device, "gpu": torch.cuda.get_device_name(0) if device == "cuda" else None,
           "cpu": platform.processor() or platform.machine(), "torch": torch.__version__, "seconds": round(time.time() - t0),
           "epochs_run": len(hist), "patches": int(len(x)), "positive_fraction": round(float(y.mean()), 4),
           "pos_weight": round(pos_w, 2), "pos_weight_cap": pos_weight_cap, "split_seed": split_seed, **{k: meta[k] for k in ("seed", "commit", "params")}}
    os.makedirs(RESULTS, exist_ok=True)
    with open(log_path, "w") as fh:
        json.dump(log, fh, indent=1)
    return model, meta, log


def gate(root, force=False, device=None, out=os.path.join(RESULTS, "oscd_learned.json"),
         baselines=os.path.join(RESULTS, "oscd_baselines.json"), pt=config_ml.LEARNED_PT, meta_path=config_ml.LEARNED_META):
    """Run the test cities ONCE with the validation-chosen threshold; pick the default method."""
    if os.path.exists(out) and not force:
        raise SystemExit(f"{out} exists: the test cities were already used. Pass --force to rerun (it is recorded).")
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    with open(meta_path) as fh:
        meta = json.load(fh)
    model = SiamUNet(base=meta["base"]).to(device)
    model.load_state_dict(torch.load(pt, map_location=device, weights_only=True))
    model.eval()
    _, test_names = oscd_data.city_lists(root)
    cities = [oscd_data.load_city(root, n) for n in test_names]
    t0, tiles, probs, ys = time.time(), [], [], []
    for c in cities:
        p = city_probability(model, c, meta, device)
        v = oscd_baselines.valid_mask(c)
        tiles.append((p >= meta["threshold"], c.label, v))
        probs.append(p[v])
        ys.append(c.label[v])
    res = metrics.evaluate(tiles)
    res["ece"] = metrics.ece(np.concatenate(probs), np.concatenate(ys))
    res["s_per_km2"] = round((time.time() - t0) / sum(c.label.size * 100 / 1e6 for c in cities), 3)
    res["per_city"] = {c.name: {k: round(v, 4) for k, v in metrics.scores(*metrics.confusion(*t)[:3]).items()}
                       for c, t in zip(cities, tiles)}
    spec_f1 = None
    if os.path.exists(baselines):
        with open(baselines) as fh:
            spec_f1 = json.load(fh)["methods"]["spectral"]["f1"]["value"]
    learned_f1 = res["f1"]["value"]
    decision = "learned" if spec_f1 is not None and learned_f1 > spec_f1 else "spectral"
    record = {"learned": res, "threshold": meta["threshold"], "default_method": decision,
              "rule": "learned becomes the default only if its test F1 beats the spectral method's test F1",
              "spectral_f1": spec_f1, "test_cities": test_names, "forced_rerun": bool(force),
              "model": {k: meta[k] for k in ("params", "val_f1", "best_epoch", "seed", "commit", "val_cities")}}
    os.makedirs(RESULTS, exist_ok=True)
    with open(out, "w") as fh:
        json.dump(record, fh, indent=1)
    print(json.dumps({k: record[k] for k in ("default_method", "spectral_f1")}), "learned F1", res["f1"])
    return record


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", help="folder containing the OSCD images and labels")
    ap.add_argument("--gate", action="store_true", help="run the test cities once and decide the default method")
    ap.add_argument("--force", action="store_true", help="rerun the gate (recorded in the results file)")
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--patience", type=int, default=10)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--pos-weight-cap", type=float, default=50.0, help="upper limit on the weight of the rare change class")
    a = ap.parse_args()
    if a.gate:
        gate(a.root, a.force)
    else:
        train(a.root, a.epochs, a.batch, a.lr, a.patience, seed=a.seed, pos_weight_cap=a.pos_weight_cap)
