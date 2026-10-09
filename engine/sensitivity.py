"""Data for the live sensitivity slider, and a Python mirror of the browser algorithm.

The browser lets a user drag the change threshold and the minimum area and see the detections change at once.
For that it needs, per pixel: how strong the change is (magnitude), what kind of change the rules say it is, and
whether the pixel is usable (not cloud, not no-data). `write` saves exactly that as a compact binary file:

  sens.bin   3 bytes per pixel, row by row.  bytes 0 and 1 = magnitude * 65535 (unsigned 16 bit, little endian),
             byte 2 = change type code (low 3 bits, see change_spectral.CODE) + 128 when the pixel is usable.
             16 bits keep the slider exactly equal to the server at the default settings (8 bits were off by a few).
  sens.json  width, height, pixel size, the default threshold and minimum area, the type codes the preset keeps,
             and the counts the server produced at those defaults.

`apply` is the same algorithm the browser runs (web/src/lib/sensitivity.ts), so tests can prove that at the default
settings it reproduces the server's own result. It is an interactive preview: the server stays the source of truth.
"""
from __future__ import annotations

import json
import os

import numpy as np
from scipy.ndimage import binary_closing, binary_opening, label

from .change_spectral import CODE
from .config import SCL_INVALID

VALID_BIT = 128


def usable(det: dict, pair) -> np.ndarray:
    """Pixels with data in both images and no cloud, shadow or cirrus in either (what the filters keep)."""
    ok = det["valid"].copy()
    if pair.scl_before is not None:
        ok &= ~(np.isin(pair.scl_before, SCL_INVALID) | np.isin(pair.scl_after, SCL_INVALID))
    return ok


def encode(det: dict, pair) -> np.ndarray:
    """(H, W, 3) uint8: magnitude as a little-endian uint16 (two bytes), then type + usable bit."""
    mag = np.clip(np.round(det["magnitude"].astype(np.float64) * 65535), 0, 65535).astype("<u2")
    lo, hi = (mag & 0xFF).astype(np.uint8), (mag >> 8).astype(np.uint8)
    kind = (det["type_raw"] & 7).astype(np.uint8) | np.where(usable(det, pair), VALID_BIT, 0).astype(np.uint8)
    return np.stack([lo, hi, kind], axis=-1)


def apply(data: np.ndarray, threshold: float, min_area_px: int, keep_codes) -> tuple[np.ndarray, int]:
    """The browser algorithm. Returns (final mask, number of changes).

    candidate = usable and magnitude above the threshold and a wanted type; then open and close with a 3 x 3 square
    (removes specks), then drop blobs smaller than the minimum area.
    """
    mag = (data[..., 0].astype(np.uint16) | (data[..., 1].astype(np.uint16) << 8)).astype(np.float64) / 65535.0
    kind = data[..., 2]
    ok = (kind & VALID_BIT) > 0
    cand = ok & (mag > threshold) & np.isin(kind & 7, list(keep_codes))
    sq = np.ones((3, 3), bool)
    opened = binary_opening(cand, sq)
    cleaned = binary_closing(opened, sq) & (opened | cand)
    lab, n = label(cleaned)
    if n:
        sizes = np.bincount(lab.ravel())
        keep = sizes >= max(1, min_area_px)
        keep[0] = False
        cleaned = keep[lab]
        _, n = label(cleaned)
    return cleaned, int(n)


def write(res, out_dir: str, preset_keep_types, min_area_m2: float) -> dict:
    """Write sens.bin and sens.json for an analysed pair. Returns the JSON that was written."""
    data = encode(res.det, res.pair)
    h, w = data.shape[:2]
    keep = sorted(CODE[t] for t in preset_keep_types)
    min_px = int(np.ceil(min_area_m2 / res.pair.pixel_m ** 2))
    _, n_default = apply(data, float(res.det["threshold"]), min_px, keep)
    info = {"width": w, "height": h, "pixel_m": res.pair.pixel_m, "default_threshold": round(float(res.det["threshold"]), 4),
            "default_min_area_px": min_px, "min_area_m2": min_area_m2, "keep_codes": keep,
            "type_names": {str(v): k for k, v in CODE.items()}, "format": "3 bytes per pixel: magnitude (uint16, little endian), type|128 if usable",
            "server_after_filter": res.summary["after_filter"], "mirror_after_filter": n_default}
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "sens.bin"), "wb") as f:
        f.write(data.tobytes())
    with open(os.path.join(out_dir, "sens.json"), "w") as f:
        json.dump(info, f, indent=1)
    return info
