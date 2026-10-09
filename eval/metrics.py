"""Metrics for change detection, with bootstrap confidence intervals and calibration error.

All functions are numpy-only. The unit of resampling in `evaluate` is the **tile** (an OSCD city, a
LEVIR-CD patch), never the pixel: pixels in one city are strongly correlated, so a pixel bootstrap
would give intervals that are far too narrow.

  tiles = [(pred_bool, gt_bool) or (pred_bool, gt_bool, valid_bool), ...]
  evaluate(tiles)  ->  {"precision": {"value", "ci95"}, "recall": ..., "f1": ..., "iou": ...}
"""
from __future__ import annotations

import numpy as np

KEYS = ("precision", "recall", "f1", "iou")


def confusion(pred, gt, valid=None) -> tuple[int, int, int, int]:
    """(tp, fp, fn, tn) on the change class; pixels outside `valid` are ignored."""
    pred, gt = np.asarray(pred, bool), np.asarray(gt, bool)
    if pred.shape != gt.shape:
        raise ValueError(f"shape mismatch {pred.shape} vs {gt.shape}")
    if valid is not None:
        valid = np.asarray(valid, bool)
        pred, gt = pred[valid], gt[valid]
    tp = int((pred & gt).sum())
    fp = int((pred & ~gt).sum())
    fn = int((~pred & gt).sum())
    return tp, fp, fn, int(pred.size - tp - fp - fn)


def scores(tp, fp, fn) -> dict:
    """Precision, recall, F1 and IoU from pooled counts. An empty denominator gives 0.0, not NaN."""
    def div(a, b):
        return float(a / b) if b else 0.0

    p, r = div(tp, tp + fp), div(tp, tp + fn)
    return {"precision": p, "recall": r, "f1": div(2 * p * r, p + r), "iou": div(tp, tp + fp + fn)}


def bootstrap(counts, n_boot=2000, seed=0, level=0.95) -> dict:
    """Percentile interval over tiles. `counts` is a list of per-tile (tp, fp, fn, tn)."""
    c = np.asarray(counts, np.int64)
    if len(c) == 0:
        raise ValueError("no tiles to evaluate")
    rng = np.random.default_rng(seed)
    point = scores(*c[:, :3].sum(0))
    draws = {k: np.empty(n_boot) for k in KEYS}
    for b in range(n_boot):
        s = scores(*c[rng.integers(0, len(c), len(c)), :3].sum(0))
        for k in KEYS:
            draws[k][b] = s[k]
    lo, hi = (1 - level) / 2 * 100, (1 + level) / 2 * 100
    return {k: {"value": round(point[k], 4),
                "ci95": [round(float(np.percentile(draws[k], lo)), 4), round(float(np.percentile(draws[k], hi)), 4)]}
            for k in KEYS}


def evaluate(tiles, n_boot=2000, seed=0) -> dict:
    """Pooled metrics with bootstrap intervals over tiles."""
    counts = [confusion(*t) for t in tiles]
    out = bootstrap(counts, n_boot, seed)
    out["tiles"] = len(counts)
    return out


def ece(prob, gt, valid=None, bins=10) -> float:
    """Expected calibration error of change probabilities: weighted gap between confidence and frequency."""
    prob, gt = np.asarray(prob, np.float64), np.asarray(gt, bool)
    if valid is not None:
        prob, gt = prob[np.asarray(valid, bool)], gt[np.asarray(valid, bool)]
    prob, gt = prob.ravel(), gt.ravel()
    if prob.size == 0:
        return 0.0
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(prob, edges[1:-1]), 0, bins - 1)
    total = 0.0
    for b in range(bins):
        m = idx == b
        if m.any():
            total += m.mean() * abs(prob[m].mean() - gt[m].mean())
    return round(float(total), 4)


def best_threshold(prob, gt, valid=None, grid=None) -> float:
    """Threshold maximising F1 on the given pixels. Call this on VALIDATION data only."""
    prob, gt = np.asarray(prob), np.asarray(gt, bool)
    if valid is not None:
        prob, gt = prob[np.asarray(valid, bool)], gt[np.asarray(valid, bool)]
    best, best_f1 = 0.5, -1.0
    for t in (grid if grid is not None else np.linspace(0.05, 0.95, 19)):
        pred = prob >= t
        f1 = scores(int((pred & gt).sum()), int((pred & ~gt).sum()), int((~pred & gt).sum()))["f1"]
        if f1 > best_f1:
            best, best_f1 = float(t), f1
    return round(best, 3)
