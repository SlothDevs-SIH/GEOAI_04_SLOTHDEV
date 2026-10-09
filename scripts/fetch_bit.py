"""Fetch the BIT change-detection model (Chen et al., IEEE TGRS 2021) for the high-resolution deep mode.

python scripts/fetch_bit.py                   -> engine/weights/BIT_CD/ (code) + engine/weights/bit_levir.pt (checkpoint)
python scripts/fetch_bit.py --demo            -> also writes demos/levir-sample/{before,after}.tif from one sample tile

Neither is committed (see .gitignore). The checkpoint ships inside the authors' repository, trained on
LEVIR-CD (0.5 m RGB, Texas). `--demo` wraps one sample PNG pair as a GeoTIFF pair with a PLACEHOLDER
georeference near Austin: LEVIR-CD ships as plain PNG, so areas and shapes are real but latitude and
longitude are illustrative.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from engine import config_ml  # noqa: E402

REPO_DIR = os.path.join(config_ml.WEIGHTS, "BIT_CD")


def fetch(repo_dir=REPO_DIR, ckpt=config_ml.BIT_CKPT) -> str:
    if not os.path.isdir(os.path.join(repo_dir, "models")):
        subprocess.run(["git", "clone", "--depth", "1", config_ml.BIT_REPO, repo_dir], check=True)
    src = os.path.join(repo_dir, config_ml.BIT_CKPT_IN_REPO)
    if not os.path.exists(src):
        raise FileNotFoundError(f"checkpoint not found in the cloned repo: {src}")
    os.makedirs(os.path.dirname(ckpt), exist_ok=True)
    shutil.copyfile(src, ckpt)
    return ckpt


def demo_pair(repo_dir=REPO_DIR, out_dir=os.path.join(ROOT, "demos", "levir-sample"), name="test_121_0768_0256.png"):
    """One LEVIR-CD sample tile as a GeoTIFF pair (placeholder georeference)."""
    import numpy as np
    import rasterio
    from PIL import Image
    from rasterio.transform import from_origin
    os.makedirs(out_dir, exist_ok=True)
    for side, folder in (("before", "A"), ("after", "B")):
        img = np.asarray(Image.open(os.path.join(repo_dir, "samples", folder, name)).convert("RGB"))
        with rasterio.open(os.path.join(out_dir, f"{side}.tif"), "w", driver="GTiff", height=img.shape[0],
                           width=img.shape[1], count=3, dtype="uint8", crs="EPSG:32614",
                           transform=from_origin(621000.0, 3350000.0, config_ml.BIT_PIXEL_M, config_ml.BIT_PIXEL_M)) as d:
            d.write(img.transpose(2, 0, 1))
    return out_dir


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--demo", action="store_true", help="also write one sample tile as a GeoTIFF pair")
    a = ap.parse_args()
    print("checkpoint:", fetch())
    if a.demo:
        print("demo pair:", demo_pair())
