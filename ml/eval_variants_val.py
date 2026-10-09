"""Compare detector variants on the VALIDATION cities only (the test cities are spent after the gate).

python ml/eval_variants_val.py data/oscd      -> eval/results/oscd_val_variants.json

Variants, each followed by the engine's false-alarm filters (encroachment preset):
  spectral   the rule-based engine
  learned    the Siamese U-Net alone
  hybrid     the U-Net proposes, and the spectral rules must also name a real change type
Why: the gate picked `learned` on OSCD test F1, but on our farmland no-change scene it raised about 12x more
polygons per km2 than spectral, and false alarms are the product's headline. This script gives the team
evidence to choose a default for the demo without reusing the test cities. Three validation cities is a tiny
sample: read the intervals, not just the means. The validation cities were also used to stop training and
pick the threshold, so the learned numbers here are slightly optimistic.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from engine import change_learned, change_spectral, filters  # noqa: E402
from engine.config import params_for  # noqa: E402
from eval import metrics, oscd_baselines  # noqa: E402
from ml import oscd_data  # noqa: E402


def variant_masks(city, fn, meta, preset="encroachment"):
    p, pair = params_for(preset), oscd_baselines.to_pair(city)
    out = {"spectral": filters.apply(change_spectral.detect(pair, p), pair, p)[0]}
    for name, typed in (("learned", False), ("hybrid", True)):
        det = change_learned.detect(pair, p, fn=fn, meta=meta, spectral_typed_only=typed)
        out[name] = filters.apply(det, pair, p)[0]
    return out


def evaluate_variants(cities, fn, meta):
    tiles = {"spectral": [], "learned": [], "hybrid": []}
    for c in cities:
        v = oscd_baselines.valid_mask(c)
        for name, mask in variant_masks(c, fn, meta).items():
            tiles[name].append((mask, c.label, v))
    return {name: metrics.evaluate(t) for name, t in tiles.items()}


def run(root, out=os.path.join(ROOT, "eval", "results", "oscd_val_variants.json")):
    fn, meta, backend = change_learned.load()
    names = meta["val_cities"]
    cities = [oscd_data.load_city(root, n) for n in names]
    res = {"cities": names, "split": "validation (not the test cities)", "backend": backend, "threshold": meta["threshold"],
           "variants": evaluate_variants(cities, fn, meta),
           "note": "3 validation cities: intervals are very wide; learned is slightly optimistic (val cities picked the epoch and threshold)"}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(res, f, indent=1)
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root")
    r = run(ap.parse_args().root)
    for k, v in r["variants"].items():
        print(f"{k:9s} F1 {v['f1']['value']} {v['f1']['ci95']}  P {v['precision']['value']}  R {v['recall']['value']}")
