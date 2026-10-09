"""Label-free baselines on the OSCD test cities: naive (raw difference + Otsu) and spectral (our engine).

python eval/oscd_baselines.py ROOT            -> eval/results/oscd_baselines.json

Neither method is fitted on OSCD (naive uses a per-city Otsu threshold; the spectral rules were fixed
before OSCD was touched), so using the test cities here does not touch the "test cities used once"
rule for the learned model. The spectral method is the engine's `encroachment` preset: change detector
+ false-alarm filters, i.e. what the product reports.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time

import numpy as np
from rasterio.transform import from_origin
from skimage.filters import threshold_otsu

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from engine import change_spectral, filters  # noqa: E402
from engine.config import params_for  # noqa: E402
from engine.ingest import Pair  # noqa: E402
from eval import metrics  # noqa: E402
from ml import oscd_data  # noqa: E402

PX = 10.0
BANDS = ("blue", "green", "red", "nir", "swir1")


def to_pair(c) -> Pair:
    """An OSCD city as an engine Pair (10 m grid, placeholder CRS: OSCD ships no usable georeference here)."""
    return Pair(before=c.before, after=c.after, transform=from_origin(0, 0, PX, PX), crs="EPSG:32631", bands=BANDS)


def valid_mask(c):
    return np.isfinite(c.before).all(0) & np.isfinite(c.after).all(0) & (c.before.sum(0) > 0)


def naive(c):
    """Raw change-vector magnitude + Otsu: the 'just subtract the images' baseline."""
    mag = np.sqrt(((c.after - c.before) ** 2).sum(0))
    v = valid_mask(c)
    return (mag > threshold_otsu(mag[v])) & v


def spectral(c, preset="encroachment"):
    p, pair = params_for(preset), to_pair(c)
    det = change_spectral.detect(pair, p)
    mask, *_ = filters.apply(det, pair, p)
    return mask


def evaluate_method(cities, fn):
    t0, tiles, per_city = time.time(), [], {}
    km2 = 0.0
    for c in cities:
        pred = fn(c)
        tiles.append((pred, c.label, valid_mask(c)))
        s = metrics.scores(*metrics.confusion(pred, c.label, valid_mask(c))[:3])
        per_city[c.name] = {k: round(v, 4) for k, v in s.items()}
        km2 += c.label.size * PX * PX / 1e6
    res = metrics.evaluate(tiles)
    res["per_city"] = per_city
    res["s_per_km2"] = round((time.time() - t0) / km2, 3)
    return res


def run(root, out, cities=None):
    train, test = oscd_data.city_lists(root)
    names = cities or test
    loaded = [oscd_data.load_city(root, n) for n in names]
    res = {"dataset": "OSCD (Onera Satellite Change Detection), Sentinel-2", "test_cities": names, "seed": 0,
           "bootstrap": "95% percentile interval over test cities, 2000 resamples",
           "methods": {"naive": evaluate_method(loaded, naive), "spectral": evaluate_method(loaded, spectral)},
           "commit": subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True,
                                    cwd=ROOT).stdout.strip()}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(res, f, indent=1)
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", help="folder containing the OSCD images and labels")
    ap.add_argument("--out", default=os.path.join(ROOT, "eval", "results", "oscd_baselines.json"))
    r = run(**vars(ap.parse_args()))
    for m, v in r["methods"].items():
        print(f"{m:9s} F1 {v['f1']['value']} {v['f1']['ci95']}  IoU {v['iou']['value']}  P {v['precision']['value']}  R {v['recall']['value']}")
