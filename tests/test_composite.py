"""Tests for median composites and persistence, on synthetic scenes with a known answer."""
import numpy as np
import pytest
from conftest import BUILT, SOIL, make_stack

from engine import composite, persistence, run

H = W = 40


def scene(value, scl_value=4):
    refl = np.empty((5, H, W), np.float32)
    for i, v in enumerate(value):
        refl[i] = v
    return refl, np.full((H, W), scl_value, np.uint8)


# ---------------------------------------------------------------- composite
def test_a_cloud_in_one_scene_is_removed_by_the_median():
    clean_a, scl_a = scene(SOIL)
    clean_b, scl_b = scene(SOIL)
    cloudy, scl_c = scene((0.5, 0.5, 0.5, 0.5, 0.5), scl_value=4)
    scl_c[10:20, 10:20] = 9                                     # high-probability cloud
    cloudy[:, 10:20, 10:20] = 0.9                               # bright cloud pixels
    refl, scl, n_valid = composite.median_composite([(clean_a, scl_a), (cloudy, scl_c), (clean_b, scl_b)])
    assert np.allclose(refl[:, 10:20, 10:20], np.array(SOIL)[:, None, None], atol=1e-6)
    assert (n_valid[10:20, 10:20] == 2).all() and (n_valid[0:5, 0:5] == 3).all()
    assert (scl == composite.CLEAR).all()


def test_pixels_no_scene_saw_clearly_become_no_data():
    a, sa = scene(SOIL)
    b, sb = scene(SOIL)
    sa[0:5, 0:5] = 3                                            # cloud shadow in both
    sb[0:5, 0:5] = 10                                           # cirrus in both
    refl, scl, n_valid = composite.median_composite([(a, sa), (b, sb)])
    assert (scl[0:5, 0:5] == composite.NO_DATA).all() and (n_valid[0:5, 0:5] == 0).all()
    assert (refl[:, 0:5, 0:5] == 0).all()
    assert (scl[5:, 5:] == composite.CLEAR).all()


def test_one_scene_composite_keeps_its_valid_pixels():
    a, sa = scene(SOIL)
    refl, scl, n_valid = composite.median_composite([(a, sa)])
    assert np.allclose(refl, a) and n_valid.max() == 1


def test_mismatched_grids_and_empty_input_are_rejected():
    a, sa = scene(SOIL)
    small = (np.zeros((5, 20, 20), np.float32), np.zeros((20, 20), np.uint8))
    with pytest.raises(ValueError, match="same grid"):
        composite.median_composite([(a, sa), small])
    with pytest.raises(ValueError, match="at least one"):
        composite.median_composite([])


# ---------------------------------------------------------------- persistence
def test_persistence_keeps_only_what_repeats():
    m1 = np.zeros((10, 10), bool)
    m2 = np.zeros((10, 10), bool)
    m3 = np.zeros((10, 10), bool)
    m1[0:3, 0:3] = m2[0:3, 0:3] = m3[0:3, 0:3] = True           # in all three
    m1[5:8, 5:8] = True                                         # in one only
    m2[8:10, 0:2] = m3[8:10, 0:2] = True                        # in two
    k2 = persistence.persistent([m1, m2, m3], 2)
    assert k2[0:3, 0:3].all() and k2[8:10, 0:2].all() and not k2[5:8, 5:8].any()
    k3 = persistence.persistent([m1, m2, m3], 3)
    assert k3[0:3, 0:3].all() and not k3[8:10, 0:2].any()
    assert persistence.persistent([m1], 1).sum() == m1.sum()


def test_persistence_rejects_bad_k_and_mismatched_masks():
    m = np.zeros((4, 4), bool)
    with pytest.raises(ValueError, match="between 1"):
        persistence.persistent([m, m], 3)
    with pytest.raises(ValueError, match="between 1"):
        persistence.persistent([m, m], 0)
    with pytest.raises(ValueError, match="same grid"):
        persistence.persistent([m, np.zeros((5, 5), bool)], 2)


# ---------------------------------------------------------------- in the pipeline
def test_a_change_seen_on_one_day_only_is_dropped_when_persistence_is_on(tmp_path):
    real, artefact = (10, 40, 10, 40), (60, 100, 60, 100)
    before = make_stack(str(tmp_path / "b.tif"), SOIL, seed=1)
    after1 = make_stack(str(tmp_path / "a1.tif"), SOIL, [(real, BUILT), (artefact, BUILT)], seed=2)
    after2 = make_stack(str(tmp_path / "a2.tif"), SOIL, [(real, BUILT)], seed=3)
    plain = run.analyze(before, after1, "encroachment")
    kept = run.analyze(before, after1, "encroachment", extra_after_paths=[after2], persistence=2)
    assert plain.summary["after_filter"] == 2 and plain.summary["persistence"] is None
    assert kept.summary["after_filter"] == 1
    assert kept.summary["persistence"]["k"] == 2 and kept.summary["persistence"]["removed_px"] > 0
    assert kept.summary["dropped"]["persistence"] == kept.summary["persistence"]["removed_px"]
    assert kept.summary["raw_detections"] == plain.summary["raw_detections"]    # raw stays the single-scene count
    top = kept.gdf.iloc[0]
    assert 8 < top["area_ha"] < 10                               # the 30 x 30 pixel patch: 300 m x 300 m = 9 ha


def test_persistence_does_nothing_without_extra_images(tmp_path):
    before = make_stack(str(tmp_path / "b.tif"), SOIL, seed=1)
    after = make_stack(str(tmp_path / "a.tif"), SOIL, [((10, 40, 10, 40), BUILT)], seed=2)
    res = run.analyze(before, after, "encroachment", persistence=2)
    assert res.summary["persistence"] is None and res.summary["after_filter"] == 1
