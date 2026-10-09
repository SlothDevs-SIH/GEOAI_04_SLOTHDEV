"""Ingest: read a before/after pair, put both on one grid, check alignment.

Accepts:
  * our Sentinel-2 stacks (scripts/fetch_demo_scenes.py): 6 bands = blue, green, red, nir, swir1
    as reflectance x 10000, plus the SCL cloud band
  * any multi-band GeoTIFF with at least blue, green, red, nir (reflectance or DN)
  * 3-band RGB (8-bit), which only the deep (VHR) mode can use
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import rasterio
from rasterio.warp import Resampling, reproject

S2_STACK = ("blue", "green", "red", "nir", "swir1", "scl")


@dataclass
class Pair:
    before: np.ndarray            # float32 [bands, H, W], reflectance 0..1 (or 0..1 scaled RGB)
    after: np.ndarray
    transform: object
    crs: object
    bands: tuple                  # names of the reflectance bands
    scl_before: np.ndarray | None = None
    scl_after: np.ndarray | None = None
    shift_px: tuple = (0.0, 0.0)
    warnings: list = field(default_factory=list)
    meta: dict = field(default_factory=dict)

    @property
    def pixel_m(self) -> float:
        return float(abs(self.transform.a))

    def band(self, which: str, name: str) -> np.ndarray:
        return getattr(self, which)[self.bands.index(name)]


def _read(path):
    with rasterio.open(path) as s:
        data = s.read().astype(np.float32)
        desc = tuple((d or "").lower() for d in s.descriptions)
        return data, s.transform, s.crs, s.shape, desc, s.tags(), s.dtypes[0]


def _split(data, desc, dtype):
    """Return (reflectance bands, band names, scl or None)."""
    if desc[:6] == S2_STACK or (data.shape[0] == 6 and not any(desc)):
        return data[:5] / 10000.0, S2_STACK[:5], data[5]
    if data.shape[0] == 3:
        scale = 255.0 if dtype == "uint8" else max(float(np.percentile(data, 99.5)), 1.0)
        return data / scale, ("red", "green", "blue"), None
    if data.shape[0] >= 4:
        scale = 10000.0 if data.max() > 2 else 1.0
        names = ("blue", "green", "red", "nir", "swir1")[: min(5, data.shape[0])]
        return data[: len(names)] / scale, names, None
    raise ValueError(f"unsupported band count {data.shape[0]}: need 3 (RGB) or >= 4 (B,G,R,NIR[,SWIR])")


def read_pair(before_path: str, after_path: str, check_shift: bool = True) -> Pair:
    a, ta, ca, sha, da, tags_a, dt_a = _read(before_path)
    b, tb, cb, shb, db, tags_b, dt_b = _read(after_path)
    warnings = []
    if ca is None or cb is None:
        raise ValueError("both images must be georeferenced (CRS missing)")
    if (ca, ta, sha) != (cb, tb, shb):
        dst = np.zeros((b.shape[0],) + sha, np.float32)
        for i in range(b.shape[0]):
            reproject(b[i], dst[i], src_transform=tb, src_crs=cb, dst_transform=ta, dst_crs=ca,
                      resampling=Resampling.nearest if (db[i:i + 1] == ("scl",)) else Resampling.bilinear)
        b = dst
        warnings.append("after image resampled onto the before grid (different CRS, bounds or resolution)")
    ra, names_a, scl_a = _split(a, da, dt_a)
    rb, names_b, scl_b = _split(b, db, dt_b)
    if names_a != names_b:
        raise ValueError(f"band layouts differ: {names_a} vs {names_b}")
    pair = Pair(ra, rb, ta, ca, names_a, scl_a, scl_b, warnings=warnings,
                meta={"before": dict(tags_a), "after": dict(tags_b)})
    if check_shift:
        align(pair)
    return pair


def estimate_shift(a: np.ndarray, b: np.ndarray) -> tuple:
    """Global (dy, dx) shift of b relative to a, sub-pixel, by phase cross-correlation."""
    from skimage.registration import phase_cross_correlation
    sh, _, _ = phase_cross_correlation(a, b, upsample_factor=10, normalization=None)
    return float(sh[0]), float(sh[1])


def align(pair: Pair, max_ok_px: float = 1.0, max_fix_px: float = 10.0) -> Pair:
    """Estimate the shift on the NIR (or green) band and correct it when it is between max_ok_px and
    max_fix_px. A 1-2 px misregistration makes every edge look like change (Goudemant et al. 2026).
    Larger estimates are reported, not applied: between co-registered tiles they usually mean the
    correlation had too little shared structure, and applying them would misalign everything."""
    from scipy.ndimage import shift as nd_shift
    name = "nir" if "nir" in pair.bands else "green"
    a, b = pair.band("before", name), pair.band("after", name)
    dy, dx = estimate_shift(np.nan_to_num(a), np.nan_to_num(b))
    pair.shift_px = (round(dy, 2), round(dx, 2))
    if max(abs(dy), abs(dx)) > max_fix_px:
        pair.warnings.append(f"estimated shift ({dy:.0f}, {dx:.0f}) px is implausibly large; not applied. "
                             "Check that both images cover the same area")
        return pair
    if max(abs(dy), abs(dx)) > max_ok_px:
        pair.after = np.stack([nd_shift(x, (dy, dx), order=1, mode="nearest") for x in pair.after])
        if pair.scl_after is not None:
            pair.scl_after = nd_shift(pair.scl_after, (dy, dx), order=0, mode="nearest")
        pair.warnings.append(f"after image shifted by ({dy:.1f}, {dx:.1f}) px relative to before; corrected")
    return pair
