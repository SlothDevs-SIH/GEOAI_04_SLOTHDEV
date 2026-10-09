"""M8 accuracy experiments on Sen1Floods11 (official hand-labelled splits).

Protocol (no test leakage):
  * event threshold: Otsu on speckle-filtered VV of each (split, country) group; radar only, no labels
  * hysteresis offsets and the learned model's probability cut-off: chosen on the VALID split
  * learned model (gradient boosting on 7 pixel features): trained on the TRAIN split only
  * reported on TEST, on BOLIVIA (country held out of all splits by the dataset authors) and on
    the India chips (all India for label-free methods; India-in-test for the learned model)

python ml/m8_experiments.py data/sen1floods11
"""
import csv
import json
import os
import sys
import time
from collections import defaultdict

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from engine import radar  # noqa: E402

DATA = sys.argv[1]
RNG = np.random.default_rng(42)


def load_split(name):
    ids = [r[0].replace("_S1Hand.tif", "") for r in csv.reader(open(f"{DATA}/flood_{name}_data.csv"))]
    out = []
    for cid in ids:
        perm = f"{DATA}/JRCWaterHand/{cid}_JRCWaterHand.tif"
        c = radar.load_chip(f"{DATA}/S1Hand/{cid}_S1Hand.tif", f"{DATA}/LabelHand/{cid}_LabelHand.tif",
                            perm if os.path.exists(perm) else None)
        if c["valid"].sum() < 1000:
            continue
        c["id"], c["country"] = cid, cid.split("_")[0]
        c["vvs"] = radar.smooth(c["vv"], c["valid"])
        out.append(c)
    groups = defaultdict(list)
    for c in out:
        groups[c["country"]].append(c)
    for g in groups.values():           # one label-free threshold per flood event
        thr = radar.event_threshold(g)
        for c in g:
            c["thr"] = thr
    return out


def evaluate(chips, predict):
    acc = {"all_water": [0, 0, 0], "flood_only": [0, 0, 0]}
    per_chip = []
    for c in chips:
        p = predict(c)
        s = radar.scores(p, c)
        for k in acc:
            acc[k][0] += s[k]["tp"]; acc[k][1] += s[k]["fp"]; acc[k][2] += s[k]["fn"]  # noqa: E702
        if s["all_water"]["tp"] + s["all_water"]["fn"] > 0:
            per_chip.append(s["all_water"]["iou"])

    def f(t):
        tp, fp, fn = t
        return dict(iou=round(tp / max(tp + fp + fn, 1), 3), precision=round(tp / max(tp + fp, 1), 3),
                    recall=round(tp / max(tp + fn, 1), 3))
    return dict(all_water=f(acc["all_water"]), flood_only=f(acc["flood_only"]),
                mean_chip_iou=round(float(np.mean(per_chip)), 3) if per_chip else None, chips=len(chips))


def sample_pixels(chips, per_class=1500):
    X, y = [], []
    for c in chips:
        f = radar.features(c, c["thr"])
        gt = (c["label"] == 1) & c["valid"]
        for cls, m in ((1, gt), (0, c["valid"] & ~gt)):
            idx = np.flatnonzero(m)
            if idx.size:
                pick = RNG.choice(idx, min(per_class, idx.size), replace=False)
                X.append(f.reshape(-1, f.shape[-1])[pick]); y.append(np.full(pick.size, cls))  # noqa: E702
    return np.concatenate(X), np.concatenate(y)


def main():
    t0 = time.time()
    S = {n: load_split(n) for n in ("train", "valid", "test", "bolivia")}
    india_all = [c for n in ("train", "valid", "test") for c in S[n] if c["country"] == "India"]
    india_test = [c for c in S["test"] if c["country"] == "India"]
    print({k: len(v) for k, v in S.items()}, "india", len(india_all), "india_test", len(india_test))

    def thr_pred(c):
        return radar.postprocess(c["vvs"] < c["thr"], c)[0]

    def hyst_pred(a, b):
        return lambda c: radar.postprocess(radar.hysteresis_water(c["vvs"], c["valid"], c["thr"], a, b), c)[0]

    # 1. tune hysteresis on VALID
    grid = [(a, b) for a in (0.0, 0.5, 1.0, 1.5, 2.0, 3.0) for b in (0.0, 0.5, 1.0, 1.5, 2.0, 3.0)]
    tuned = sorted(((evaluate(S["valid"], hyst_pred(a, b))["flood_only"]["iou"], a, b) for a, b in grid), reverse=True)
    _, A, B = tuned[0]
    print("hysteresis best on valid:", tuned[:3])

    # 2. learned model on TRAIN, cut-off on VALID
    X, y = sample_pixels(S["train"])
    model = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.1, early_stopping=True,
                                           validation_fraction=0.1, random_state=0).fit(X, y)
    probs = {}
    for c in S["valid"] + S["test"] + S["bolivia"]:
        f = radar.features(c, c["thr"])
        probs[c["id"]] = model.predict_proba(f.reshape(-1, f.shape[-1]))[:, 1].reshape(c["valid"].shape)
    cut = max(((evaluate(S["valid"], lambda c, p=p: radar.postprocess(probs[c["id"]] >= p, c)[0])["flood_only"]["iou"], p)
               for p in (0.3, 0.4, 0.5, 0.6, 0.7, 0.8)))[1]
    print("learned cut-off on valid:", cut, "train samples", len(y))

    def learned_pred(c):
        if c["id"] not in probs:
            f = radar.features(c, c["thr"])
            probs[c["id"]] = model.predict_proba(f.reshape(-1, f.shape[-1]))[:, 1].reshape(c["valid"].shape)
        return radar.postprocess(probs[c["id"]] >= cut, c)[0]

    methods = {"naive_per_chip_otsu": radar.naive_mask, "m8_threshold": thr_pred,
               "m8_hysteresis": hyst_pred(A, B), "m8_learned_gbm": learned_pred}
    res = {}
    for m, fn in methods.items():
        res[m] = {"test": evaluate(S["test"], fn), "bolivia_heldout": evaluate(S["bolivia"], fn),
                  "india_test": evaluate(india_test, fn)}
        if m != "m8_learned_gbm":
            res[m]["india_all_68"] = evaluate(india_all, fn)
        print(m, json.dumps({k: (v["flood_only"]["iou"], v["flood_only"]["precision"], v["flood_only"]["recall"])
                             for k, v in res[m].items()}))
    out = dict(dataset="Sen1Floods11 v1.1 hand-labelled, official splits", split_sizes={k: len(v) for k, v in S.items()},
               hysteresis={"strict_db": A, "loose_db": B, "chosen_on": "valid"},
               learned={"model": "HistGradientBoostingClassifier", "features": radar.FEATURE_NAMES,
                        "train_pixels": int(len(y)), "prob_cutoff": cut, "cutoff_chosen_on": "valid"},
               results=res, runtime_s=round(time.time() - t0, 1),
               metric_note="IoU/precision/recall pooled over pixels; flood_only excludes JRC permanent water; "
                           "mean_chip_iou averages chips that contain water.")
    os.makedirs(f"{ROOT}/eval/results", exist_ok=True)
    json.dump(out, open(f"{ROOT}/eval/results/m8_sen1floods11_experiments.json", "w"), indent=1)
    os.makedirs(f"{ROOT}/engine/weights", exist_ok=True)
    joblib.dump({"model": model, "prob_cutoff": cut, "features": radar.FEATURE_NAMES,
                 "hysteresis": {"strict_db": A, "loose_db": B}}, f"{ROOT}/engine/weights/m8_gbm.joblib")
    print("done in", out["runtime_s"], "s")


if __name__ == "__main__":
    main()
