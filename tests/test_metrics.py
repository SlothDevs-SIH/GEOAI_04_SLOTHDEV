"""eval/metrics.py on hand-made arrays."""
import numpy as np
import pytest

from eval import metrics as M


def test_confusion_and_scores_by_hand():
    pred = np.array([[1, 1, 0, 0]], bool)
    gt = np.array([[1, 0, 1, 0]], bool)
    assert M.confusion(pred, gt) == (1, 1, 1, 1)
    s = M.scores(1, 1, 1)
    assert s["precision"] == 0.5 and s["recall"] == 0.5 and s["f1"] == 0.5
    assert s["iou"] == pytest.approx(1 / 3)


def test_valid_mask_ignores_pixels():
    pred = np.array([[1, 1, 0, 0]], bool)
    gt = np.array([[1, 0, 1, 0]], bool)
    assert M.confusion(pred, gt, valid=np.array([[1, 0, 0, 1]], bool)) == (1, 0, 0, 1)


def test_empty_denominators_are_zero_not_nan():
    assert M.scores(0, 0, 0) == {"precision": 0.0, "recall": 0.0, "f1": 0.0, "iou": 0.0}


def test_perfect_and_empty_predictions():
    gt = np.zeros((20, 20), bool)
    gt[5:10, 5:10] = True
    r = M.evaluate([(gt, gt)] * 3, n_boot=50)
    assert r["f1"]["value"] == 1.0 and r["f1"]["ci95"] == [1.0, 1.0] and r["tiles"] == 3
    assert M.evaluate([(np.zeros_like(gt), gt)] * 3, n_boot=50)["recall"]["value"] == 0.0


def test_bootstrap_is_seeded_and_contains_the_point_estimate():
    rng = np.random.default_rng(1)
    tiles = []
    for _ in range(10):
        gt = rng.random((40, 40)) < 0.2
        pred = gt ^ (rng.random((40, 40)) < 0.1)        # 10% of pixels flipped
        tiles.append((pred, gt))
    a, b = M.evaluate(tiles, n_boot=300, seed=7), M.evaluate(tiles, n_boot=300, seed=7)
    assert a == b
    for k in M.KEYS:
        lo, hi = a[k]["ci95"]
        assert lo <= a[k]["value"] <= hi and hi > lo


def test_interval_widens_with_fewer_tiles():
    rng = np.random.default_rng(2)
    tiles = []
    for _ in range(12):
        gt = rng.random((30, 30)) < 0.3
        tiles.append((gt ^ (rng.random((30, 30)) < 0.15), gt))
    def w(r):
        return r["f1"]["ci95"][1] - r["f1"]["ci95"][0]
    assert w(M.evaluate(tiles[:3], n_boot=400)) > w(M.evaluate(tiles, n_boot=400))


def test_ece_perfectly_calibrated_vs_overconfident():
    gt = np.array([1, 0] * 500, bool)
    assert M.ece(np.full(1000, 0.5), gt) == pytest.approx(0.0, abs=1e-6)
    assert M.ece(np.full(1000, 0.99), gt) > 0.45
    assert M.ece(np.array([]), np.array([], bool)) == 0.0


def test_best_threshold_finds_the_separating_cut():
    rng = np.random.default_rng(0)
    gt = rng.random(5000) < 0.3
    prob = np.where(gt, rng.normal(0.8, 0.05, 5000), rng.normal(0.2, 0.05, 5000)).clip(0, 1)
    assert 0.3 <= M.best_threshold(prob, gt) <= 0.7


def test_shape_mismatch_raises():
    with pytest.raises(ValueError):
        M.confusion(np.zeros((2, 2), bool), np.zeros((3, 3), bool))
