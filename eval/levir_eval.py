"""Evaluate the BIT deep mode (and a naive baseline) on LEVIR-CD image pairs.

python eval/levir_eval.py ROOT                 # ROOT has A/ (before), B/ (after), label/ (and optionally list/test.txt)
python eval/levir_eval.py ROOT --full-split    # assert ROOT is the full official LEVIR-CD TEST split

Writes eval/results/levir_bit.json. The result is labelled honestly:
  * with --full-split: "reproduced" (we ran BIT on the whole test split ourselves);
  * without it: "published, not reproduced", with the number of sample tiles we did measure.
The published BIT figure on the test split (F1 89.31, IoU 80.68; Chen et al. 2021) is stored for reference
as a published number, never as ours. The LEVIR-CD download host is not reachable from our build
environment, so the default run is the 12 sample tiles that ship with the BIT repository.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time

import numpy as np
from PIL import Image
from rasterio.transform import from_origin
from scipy.ndimage import gaussian_filter
from skimage.exposure import match_histograms
from skimage.filters import threshold_otsu

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from engine import change_deep, config_ml  # noqa: E402
from engine.ingest import Pair  # noqa: E402
from eval import metrics  # noqa: E402

PUBLISHED = {"f1": 0.8931, "iou": 0.8068, "source": "Chen, Qi, Shi (2021), IEEE TGRS, BIT on the LEVIR-CD test split"}


def files(root):
    """Image names to evaluate: labelled pairs only, and only `test_*` files when the folder mixes splits
    (the BIT sample folder also holds train_* tiles the model was trained on, which must not be scored)."""
    lst = os.path.join(root, "list", "test.txt")
    if os.path.exists(lst):
        names = [n.strip() for n in open(lst) if n.strip()]
    else:
        names = sorted(os.listdir(os.path.join(root, "A")))
    names = [n for n in names if all(os.path.exists(os.path.join(root, d, n)) for d in ("A", "B", "label"))]
    tests = [n for n in names if n.startswith("test_")]
    return tests or names


def read_pair(root, name) -> Pair:
    rgb = lambda d: np.asarray(Image.open(os.path.join(root, d, name)).convert("RGB")).astype(np.float32).transpose(2, 0, 1) / 255.0  # noqa: E731
    return Pair(before=rgb("A"), after=rgb("B"), transform=from_origin(0, 0, config_ml.BIT_PIXEL_M, config_ml.BIT_PIXEL_M),
                crs="EPSG:32614", bands=("red", "green", "blue"))


def naive(pair):
    """Histogram-match, change-vector magnitude, blur, Otsu: the 'just subtract the images' baseline."""
    after = match_histograms(pair.after, pair.before, channel_axis=0)
    mag = gaussian_filter(np.sqrt(((after - pair.before) ** 2).sum(0)), 1.5)
    return mag > threshold_otsu(mag)


def run(root, out, full_split=False, limit=None):
    names = files(root)[:limit]
    if not names:
        raise SystemExit(f"no image pairs found under {root}")
    t0, bit_tiles, naive_tiles = time.time(), [], []
    for n in names:
        pair = read_pair(root, n)
        gt = np.asarray(Image.open(os.path.join(root, "label", n)).convert("L")) > 127
        bit_tiles.append((change_deep.detect(pair, None)["candidate"], gt))
        naive_tiles.append((naive(pair), gt))
    km2 = sum(g.size for _, g in bit_tiles) * config_ml.BIT_PIXEL_M ** 2 / 1e6
    res = {"dataset": "LEVIR-CD", "images": len(names), "scope": "full official test split" if full_split else
           f"{len(names)} sample tiles from the BIT repository (NOT the full test split)",
           "bit": metrics.evaluate(bit_tiles), "naive": metrics.evaluate(naive_tiles), "published_bit": PUBLISHED,
           "note": "reproduced" if full_split else "published, not reproduced",
           "bootstrap": "95% percentile interval over images, 2000 resamples, seed 0",
           "s_per_km2": round((time.time() - t0) / km2, 1),
           "commit": subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(res, f, indent=1)
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", nargs="?", default=os.path.join(config_ml.WEIGHTS, "BIT_CD", "samples"))
    ap.add_argument("--out", default=os.path.join(ROOT, "eval", "results", "levir_bit.json"))
    ap.add_argument("--full-split", action="store_true")
    ap.add_argument("--limit", type=int)
    a = ap.parse_args()
    r = run(a.root, a.out, a.full_split, a.limit)
    for m in ("bit", "naive"):
        print(f"{m:6s} F1 {r[m]['f1']['value']} {r[m]['f1']['ci95']}  IoU {r[m]['iou']['value']}  ({r['scope']})")
