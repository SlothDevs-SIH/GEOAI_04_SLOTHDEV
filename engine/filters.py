"""False-alarm filters for optical change. Every rule counts what it removed (drop_counts),
so the UI can show "N raw detections -> M real" and the ablation can say which rule mattered."""
from __future__ import annotations

import numpy as np
from scipy.ndimage import binary_closing, binary_opening, label

from .change_spectral import CODE
from .config import SCL_INVALID, Params


def components(mask) -> int:
    return int(label(mask)[1])


def apply(det, pair, p: Params, rules=("cloud", "seasonal", "preset", "speckle", "min_area")):
    """Returns (clean mask, type_map restricted to the mask, drop_counts in pixels, raw_blobs)."""
    m = det["candidate"].copy()
    t = det["type_map"]
    drops = {}
    raw_blobs = components(m)

    if "cloud" in rules and pair.scl_before is not None:
        bad = np.isin(pair.scl_before, SCL_INVALID) | np.isin(pair.scl_after, SCL_INVALID)
        drops["cloud"] = int((m & bad).sum())
        m &= ~bad
    if "seasonal" in rules:
        # change explained only by vegetation greening, or by nothing at all (lighting, moisture)
        seasonal = (t == CODE["vegetation_gain"]) | (t == CODE["other"])
        drops["seasonal"] = int((m & seasonal).sum())
        m &= ~seasonal
    if "preset" in rules:
        keep = np.isin(t, [CODE[k] for k in p.keep_types])
        drops["not_in_preset"] = int((m & ~keep).sum())
        m &= keep
    if "speckle" in rules:
        k = np.ones((3, 3), bool)
        opened = binary_opening(m, k)                  # remove specks thinner than 3 px
        cleaned = binary_closing(opened, k) & (opened | m)   # close small gaps inside real change only
        drops["speckle"] = int((m & ~cleaned).sum())
        m = cleaned
    if "min_area" in rules:
        lab, n = label(m)
        if n:
            sizes = np.bincount(lab.ravel()) * pair.pixel_m ** 2
            small = (lab > 0) & (sizes[lab] < p.min_area_m2)
            drops["min_area"] = int(small.sum())
            m &= ~small
    return m, np.where(m, t, 0).astype(np.uint8), drops, raw_blobs
