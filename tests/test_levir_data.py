"""ml/levir_data.py on a synthetic LEVIR-shaped folder."""
import numpy as np
import pytest
from PIL import Image

from ml import levir_data as L


def make(root, names=("test_1.png", "test_2.png"), extra=()):
    for d in ("A", "B", "label"):
        (root / d).mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(0)
    for n in names + tuple(extra):
        Image.fromarray(rng.integers(0, 255, (64, 80, 3), dtype=np.uint8)).save(root / "A" / n)
        Image.fromarray(rng.integers(0, 255, (64, 80, 3), dtype=np.uint8)).save(root / "B" / n)
        lab = np.zeros((64, 80), np.uint8)
        lab[10:30, 20:50] = 255
        Image.fromarray(lab).save(root / "label" / n)


def test_pairs_read_as_rgb_engine_pairs_with_half_metre_pixels_and_a_flagged_placeholder_grid(tmp_path):
    make(tmp_path)
    p = L.read_pair(str(tmp_path), "test_1.png")
    assert p.bands == ("red", "green", "blue") and p.before.shape == (3, 64, 80) and p.pixel_m == 0.5
    assert 0.0 <= p.before.min() and p.before.max() <= 1.0 and p.meta["placeholder_georeference"] is True
    assert L.PLACEHOLDER_GEOREF is True
    lab = L.read_label(str(tmp_path), "test_1.png")
    assert lab.dtype == bool and lab.sum() == 20 * 30


def test_only_labelled_test_files_are_listed_when_splits_are_mixed(tmp_path):
    make(tmp_path, names=("test_1.png", "test_2.png"), extra=("train_3.png", "val_4.png"))
    (tmp_path / "label" / "test_2.png").unlink()                       # an unlabelled test file is skipped too
    assert L.list_pairs(str(tmp_path)) == ["test_1.png"]


def test_a_folder_with_no_test_prefix_lists_everything_labelled(tmp_path):
    make(tmp_path, names=("a.png", "b.png"))
    assert L.list_pairs(str(tmp_path)) == ["a.png", "b.png"]


def test_before_and_after_of_different_size_are_refused(tmp_path):
    make(tmp_path, names=("test_1.png",))
    Image.fromarray(np.zeros((10, 10, 3), np.uint8)).save(tmp_path / "B" / "test_1.png")
    with pytest.raises(ValueError, match="differ in size"):
        L.read_pair(str(tmp_path), "test_1.png")


def test_georeference_sidecar_is_detected_only_when_present(tmp_path):
    make(tmp_path)
    assert L.find_georeference(str(tmp_path)) is None                  # the plain PNG copy: placeholder coordinates only
    (tmp_path / "sample_coordinates.csv").write_text("name,lat,lon\ntest_1,30.1,-97.7\n")
    assert L.find_georeference(str(tmp_path)).endswith("sample_coordinates.csv")
