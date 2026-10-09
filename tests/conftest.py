"""Synthetic Sentinel-2 stacks (same layout as scripts/fetch_demo_scenes.py) for engine tests."""
import os
import sys

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# reflectance signatures: blue, green, red, nir, swir1
VEG = (0.03, 0.06, 0.04, 0.40, 0.20)          # NDVI ~0.82
SOIL = (0.08, 0.11, 0.15, 0.22, 0.32)         # bare soil, SWIR/blue = 4.0
BUILT = (0.12, 0.13, 0.14, 0.18, 0.24)        # concrete, flat spectrum, SWIR/blue = 2.0
WATER = (0.06, 0.07, 0.05, 0.02, 0.01)        # NDWI > 0
CROP_GREEN = (0.04, 0.08, 0.05, 0.35, 0.22)   # crops before harvest
TRANSFORM = from_origin(300000.0, 2100000.0, 10.0, 10.0)


def make_stack(path, base, patches=(), scl=None, shape=(120, 120), seed=0, transform=TRANSFORM):
    rng = np.random.default_rng(seed)
    refl = np.empty((5,) + shape, np.float32)
    for i, v in enumerate(base):
        refl[i] = v
    for (r0, r1, c0, c1), sig in patches:
        for i, v in enumerate(sig):
            refl[i, r0:r1, c0:c1] = v
    refl = np.clip(refl * (1 + rng.normal(0, 0.02, refl.shape)), 0, 1)
    s = np.full(shape, 4, np.uint16) if scl is None else scl
    data = np.concatenate([(refl * 10000).astype(np.uint16), s[None].astype(np.uint16)])
    with rasterio.open(path, "w", driver="GTiff", height=shape[0], width=shape[1], count=6, dtype="uint16",
                       crs="EPSG:32643", transform=transform) as dst:
        dst.write(data)
        for i, n in enumerate(("blue", "green", "red", "nir", "swir1", "scl"), 1):
            dst.set_band_description(i, n)
    return path


@pytest.fixture
def tmp(tmp_path):
    return tmp_path
