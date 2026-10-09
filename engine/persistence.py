"""Persistence: keep a change only if it shows up in more than one later scene.

Construction, once built, stays. A cloud edge, a shadow or a field in the wrong colour on one
particular day does not. Requiring the change in at least `k` of the later scenes removes those
one-day artefacts. Floods are the exception (water recedes), so the flood preset does not use it.
"""
from __future__ import annotations

import numpy as np


def persistent(masks: list[np.ndarray], k: int = 2) -> np.ndarray:
    """Pixels flagged in at least k of the masks (all on one grid)."""
    if not masks:
        raise ValueError("need at least one mask")
    if not 1 <= k <= len(masks):
        raise ValueError(f"k must be between 1 and the number of scenes ({len(masks)}), got {k}")
    shape = masks[0].shape
    if any(m.shape != shape for m in masks):
        raise ValueError("all masks must be on the same grid")
    return np.sum(masks, axis=0) >= k
