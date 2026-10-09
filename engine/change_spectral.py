"""Spectral change mode (Sentinel-2, 10 m): index differences + change-vector magnitude + Otsu.

No training. Each changed pixel gets a type from what moved:
  water_gain / water_loss   NDWI crossed zero and rose / fell by d_ndwi_water
  built_up_gain             NDBI rose, vegetation is low after AND was low before (harvested crops
                            also raise NDBI, so green-to-bare is never called construction)
                            or: bare on both dates and the spectrum flattened (SWIR1/blue fell below
                            sealed_swir_blue_max): soil paved or built over
  vegetation_loss           dense vegetation (NDVI before >= before_ndvi_dense) dropped
  vegetation_gain           NDVI rose (crops growing: seasonal, filtered out by default)
  other                     magnitude changed but no index explains it (lighting, moisture)
"""
from __future__ import annotations

import numpy as np
from skimage.filters import threshold_otsu

from .config import Params

TYPES = ["none", "water_gain", "water_loss", "built_up_gain", "vegetation_loss", "vegetation_gain", "other"]
CODE = {t: i for i, t in enumerate(TYPES)}


def _nd(a, b):
    return (a - b) / np.maximum(a + b, 1e-6)


def indices(stack, bands):
    g = lambda n: stack[bands.index(n)]  # noqa: E731
    out = {"ndvi": _nd(g("nir"), g("red")), "ndwi": _nd(g("green"), g("nir"))}
    if "swir1" in bands:
        out["ndbi"] = _nd(g("swir1"), g("nir"))
    return out


def detect(pair, p: Params):
    """Returns dict(magnitude 0..1, candidate bool, type_map int, deltas, ib, ia, threshold)."""
    ib, ia = indices(pair.before, pair.bands), indices(pair.after, pair.bands)
    d = {k: ia[k] - ib[k] for k in ib}
    if "swir1" in pair.bands:
        flat_b = pair.band("before", "swir1") / np.maximum(pair.band("before", "blue"), 1e-3)
        flat_a = pair.band("after", "swir1") / np.maximum(pair.band("after", "blue"), 1e-3)
        d["swir_blue"] = flat_a - flat_b
        sealed = ((ib["ndvi"] < p.bare_ndvi_max) & (ia["ndvi"] < p.bare_ndvi_max)
                  & (flat_a < p.sealed_swir_blue_max) & (d["swir_blue"] < p.d_swir_blue_sealed))
    else:
        sealed = np.zeros(pair.before.shape[1:], bool)
    valid = np.isfinite(pair.before).all(0) & np.isfinite(pair.after).all(0) & (pair.before.sum(0) > 0)
    cva = np.sqrt(((np.nan_to_num(pair.after) - np.nan_to_num(pair.before)) ** 2).sum(0))
    scale = float(np.percentile(cva[valid], 99)) or 1.0
    magnitude = np.clip(cva / scale, 0, 1).astype(np.float32)
    thr = float(threshold_otsu(magnitude[valid]))
    candidate = (magnitude > thr) & valid

    t = np.full(magnitude.shape, CODE["other"], np.uint8)
    ndbi_up = d["ndbi"] > p.d_ndbi_built if "ndbi" in d else np.zeros_like(candidate)
    rules = [  # later rules win, so order from weakest to strongest evidence
        ("vegetation_gain", d["ndvi"] > -p.d_ndvi_veg_loss),
        ("vegetation_loss", (d["ndvi"] < p.d_ndvi_veg_loss) & (ib["ndvi"] >= p.before_ndvi_dense)),
        ("built_up_gain", (ndbi_up & (ia["ndvi"] < p.after_ndvi_max_built) & (ib["ndvi"] < p.before_ndvi_max_built))
         | sealed),
        ("water_loss", (ib["ndwi"] > p.ndwi_water) & (ia["ndwi"] <= p.ndwi_water) & (d["ndwi"] < -p.d_ndwi_water)),
        ("water_gain", (ia["ndwi"] > p.ndwi_water) & (ib["ndwi"] <= p.ndwi_water) & (d["ndwi"] > p.d_ndwi_water)),
    ]
    for name, m in rules:
        t[m] = CODE[name]
    type_raw = t.copy()               # the type every pixel would get, before the threshold decides who counts as changed
    t[~candidate] = CODE["none"]
    return dict(magnitude=magnitude, candidate=candidate, type_map=t, type_raw=type_raw, deltas=d, ib=ib, ia=ia,
                threshold=thr, valid=valid, cva_scale=scale)
