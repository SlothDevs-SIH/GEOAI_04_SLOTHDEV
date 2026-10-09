"""Seed and loss-weight study for the OSCD Siamese U-Net, judged on the VALIDATION locations only.

python ml/variant_study.py data/oscd                    # 3 loss-weight variants x 3 seeds (about 40 min on an RTX 4050)
python ml/variant_study.py data/oscd --seeds 0 --quick  # one seed, 25 epochs: a fast look

Two questions the single trained model cannot answer:
  1. How stable is it? Same data, different random seeds: how much does validation F1 move?
  2. Does a lower weight on the rare "change" pixels (`pos_weight_cap`) cut false alarms without losing accuracy?
     The shipped model uses a cap of 50 and, on our farmland no-change scene, raised 7.4 polygons per km2 against 0.6
     for the spectral engine.
Every number here comes from the validation locations (and, where the files exist, the demo scenes for false alarms).
The 10 test locations are NOT touched: they were used once, for the gate, and stay that way. So this study can
inform a decision but cannot by itself replace the shipped model: a different model would need its own gate, which
means reusing the test locations, and that would have to be declared as a second use. Models are trained into a scratch
folder; `engine/weights/` is never written.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from engine import change_learned, ingest  # noqa: E402
from engine.config import params_for  # noqa: E402
from eval import metrics, oscd_baselines  # noqa: E402
from ml import eval_variants_val, oscd_data, train_siamunet as T  # noqa: E402

VARIANTS = {"cap50 (shipped)": 50.0, "cap10": 10.0, "cap3": 3.0}


def farmland_per_km2(fn, meta, demo_dir):
    """Polygons per km2 the learned model raises on a scene where nothing really changed (None if the scene is absent)."""
    before, after = os.path.join(demo_dir, "before.tif"), os.path.join(demo_dir, "after.tif")
    if not (os.path.exists(before) and os.path.exists(after)):
        return None
    from engine import filters
    pair, p = ingest.read_pair(before, after), params_for("encroachment")
    det = change_learned.detect(pair, p, fn=fn, meta=meta)
    km2 = pair.before.shape[1] * pair.before.shape[2] * pair.pixel_m ** 2 / 1e6
    return round(filters.components(filters.apply(det, pair, p)[0]) / km2, 2)


def one_run(root, cap, seed, workdir, val_cities, demo_dir, device=None, **kw):
    pt, js, log = (os.path.join(workdir, f"m_{cap}_{seed}{ext}") for ext in (".pt", ".json", "_log.json"))
    model, meta, tlog = T.train(root, seed=seed, pos_weight_cap=cap, device=device, out_pt=pt, out_meta=js, log_path=log, **kw)
    assert set(meta["val_cities"]) == set(val_cities)                            # same split in every run
    fn = T.torch_predictor(model.eval(), next(model.parameters()).device)
    masks = [(eval_variants_val.variant_masks(c, fn, meta)["learned"], c.label, oscd_baselines.valid_mask(c)) for c in val_cities_data(root, val_cities)]
    sc = metrics.scores(*np.sum([metrics.confusion(*t)[:3] for t in masks], axis=0))
    return {"seed": seed, "pos_weight_cap": cap, "train_val_f1": meta["val_f1"], "threshold": meta["threshold"], "epochs_run": tlog["epochs_run"],
            "seconds": tlog["seconds"], "val_pipeline": {k: round(v, 4) for k, v in sc.items()},
            "farmland_polygons_per_km2": farmland_per_km2(fn, meta, demo_dir)}


_cache: dict = {}


def val_cities_data(root, names):
    key = (root, tuple(names))
    if key not in _cache:
        _cache[key] = [oscd_data.load_city(root, n) for n in names]
    return _cache[key]


def summarise(runs):
    def ms(vals):
        vals = [v for v in vals if v is not None]
        return None if not vals else {"mean": round(float(np.mean(vals)), 4), "sd": round(float(np.std(vals)), 4), "n": len(vals)}
    return {"train_val_f1": ms([r["train_val_f1"] for r in runs]), "pipeline_f1": ms([r["val_pipeline"]["f1"] for r in runs]),
            "pipeline_precision": ms([r["val_pipeline"]["precision"] for r in runs]), "pipeline_recall": ms([r["val_pipeline"]["recall"] for r in runs]),
            "farmland_polygons_per_km2": ms([r["farmland_polygons_per_km2"] for r in runs])}


def study(root, seeds=(0, 1, 2), variants=VARIANTS, out=os.path.join(ROOT, "eval", "results", "oscd_variant_study.json"),
          demo_dir=os.path.join(ROOT, "demos", "season-control"), device=None, **kw):
    train_names, _ = oscd_data.city_lists(root)
    _, val_names = oscd_data.split(train_names, 3, 0)                              # the same 3 validation locations as the shipped model
    work = tempfile.mkdtemp(prefix="variant_study_")
    try:
        runs = {name: [one_run(root, cap, s, work, val_names, demo_dir, device, **kw) for s in seeds] for name, cap in variants.items()}
    finally:
        shutil.rmtree(work, ignore_errors=True)
    res = {"split": "validation locations only", "val_locations": val_names, "seeds": list(seeds),
           "variants": {name: {"pos_weight_cap": variants[name], "summary": summarise(r), "runs": r} for name, r in runs.items()},
           "reference": "shipped model: pos_weight_cap 50, seed 0; farmland false alarms 7.41 polygons/km2 (spectral 0.62)",
           "note": "validation only; the test locations were used once (the gate) and are not touched here; trained into a scratch folder, engine/weights/ untouched",
           "commit": subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(res, f, indent=1)
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", help="folder containing the OSCD images and labels")
    ap.add_argument("--seeds", type=int, nargs="+", default=[0, 1, 2])
    ap.add_argument("--quick", action="store_true", help="25 epochs, patience 5")
    a = ap.parse_args()
    kw = {"epochs": 25, "patience": 5} if a.quick else {}
    r = study(a.root, tuple(a.seeds), **kw)
    for name, v in r["variants"].items():
        s = v["summary"]
        print(f"{name:16s} val F1 {s['pipeline_f1']['mean']} +/- {s['pipeline_f1']['sd']}   P {s['pipeline_precision']['mean']}   R {s['pipeline_recall']['mean']}   "
              f"farmland {s['farmland_polygons_per_km2'] and s['farmland_polygons_per_km2']['mean']} polygons/km2")
