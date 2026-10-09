"""Median composites: one clean image from several scenes taken close together.

A single scene can hold a cloud, a shadow or a bad pixel anywhere. Taking the per-pixel median of
several scenes from the same period, using only the pixels each scene marks as valid, removes those
one-off problems without any model. Pixels that no scene saw clearly are marked no-data, so the
false-alarm filters remove them instead of guessing.
"""
from __future__ import annotations

import warnings

import numpy as np

from .config import SCL_INVALID

CLEAR = 4          # SCL value written for pixels with at least one valid observation (vegetation class)
NO_DATA = 0


def median_composite(stacks: list[tuple[np.ndarray, np.ndarray]]):
    """stacks: [(reflectance [5, H, W], scl [H, W]), ...] on one grid.

    Returns (reflectance [5, H, W], scl [H, W], n_valid [H, W]).
    """
    if not stacks:
        raise ValueError("need at least one scene to build a composite")
    shape = stacks[0][0].shape
    for refl, scl in stacks:
        if refl.shape != shape or scl.shape != shape[1:]:
            raise ValueError("all scenes of a composite must be on the same grid and the same size")
    refl = np.stack([r for r, _ in stacks]).astype(np.float32)                     # (n, 5, H, W)
    bad = np.stack([np.isin(s, SCL_INVALID) | (r.sum(0) <= 0) for r, s in stacks])  # (n, H, W)
    refl[np.broadcast_to(bad[:, None], refl.shape)] = np.nan
    n_valid = (~bad).sum(0).astype(np.uint8)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)        # pixels no scene saw clearly are all-NaN on purpose
        out = np.nanmedian(refl, axis=0)
    out = np.nan_to_num(out, nan=0.0).astype(np.float32)
    scl = np.where(n_valid > 0, CLEAR, NO_DATA).astype(np.uint8)
    return out, scl, n_valid
