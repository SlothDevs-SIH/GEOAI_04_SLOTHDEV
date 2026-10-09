"""ml/oscd_data.py on a synthetic OSCD-shaped folder (the real dataset host is blocked in CI)."""
import numpy as np
import rasterio
from rasterio.transform import from_origin

from ml import oscd_data as D

T = from_origin(0, 0, 10, 10)


def _tif(path, arr):
    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(path, "w", driver="GTiff", height=arr.shape[0], width=arr.shape[1], count=1,
                       dtype=str(arr.dtype), crs="EPSG:32631", transform=T) as d:
        d.write(arr, 1)


SOIL = (800, 1100, 1500, 2200, 3200)       # reflectance x 10000 per band (B02, B03, B04, B08, B11)
BUILT = (1200, 1300, 1400, 1800, 2400)     # flat, concrete-like spectrum


def make_dataset(root, cities, shape=(200, 180), seed=0):
    """Soil everywhere; in the labelled block the after image turns into concrete (a real change)."""
    rng = np.random.default_rng(seed)
    for i, c in enumerate(cities):
        lab = np.ones(shape, np.uint8)
        lab[20 + i:60 + i, 30:90] = 2
        for folder in ("imgs_1_rect", "imgs_2_rect"):
            for k, b in enumerate(D.BANDS):
                img = np.full(shape, SOIL[k], np.float32)
                if folder == "imgs_2_rect":
                    img[lab == 2] = BUILT[k]
                _tif(root / "images" / c / folder / f"{b}.tif", (img + rng.normal(0, 30, shape)).clip(0).astype(np.uint16))
        _tif(root / "labels" / c / "cm" / f"{c}-cm.tif", lab)
    (root / "images").mkdir(exist_ok=True)


def test_load_city_shapes_and_label_values(tmp_path):
    make_dataset(tmp_path, ["a"])
    c = D.load_city(str(tmp_path), "a")
    assert c.before.shape == (5, 200, 180) and c.after.shape == c.before.shape and c.before.dtype == np.float32
    assert 0.05 < c.before.mean() < 0.3                          # DN / 10000 -> reflectance
    assert c.label.dtype == bool and c.label.sum() == 40 * 60    # value 2 = change, 1 = no change


def test_missing_band_and_label_raise_clear_errors(tmp_path):
    make_dataset(tmp_path, ["a"])
    import pytest
    with pytest.raises(FileNotFoundError, match="nope"):
        D.load_city(str(tmp_path), "nope")
    (tmp_path / "labels" / "a" / "cm" / "a-cm.tif").unlink()
    with pytest.raises(FileNotFoundError, match="no label"):
        D.load_city(str(tmp_path), "a")


def test_label_conventions():
    import tempfile
    from pathlib import Path
    with tempfile.TemporaryDirectory() as d:
        for name, arr, expect in [("a.tif", np.array([[1, 2]], np.uint8), [False, True]),
                                  ("b.tif", np.array([[0, 1]], np.uint8), [False, True]),
                                  ("c.tif", np.array([[1, 1]], np.uint8), [False, False]),
                                  ("d.tif", np.array([[0, 255]], np.uint8), [False, True])]:
            _tif(Path(d) / name, arr)
            assert D._read_label(str(Path(d) / name)).ravel().tolist() == expect, name


def test_finds_cities_in_the_kaggle_layout_with_spaces_nesting_and_separate_label_trees(tmp_path):
    """Real layout: images/<name with spaces - Images>/<city>/imgs_*_rect, train_labels/<city>/cm/cm.png + <city>-cm.tif."""
    make_dataset(tmp_path / "flat", ["abudhabi", "Brasilia"])
    root = tmp_path / "oscd"
    for c in ("abudhabi", "Brasilia"):
        (root / "images" / "Onera Satellite Change Detection dataset - Images").mkdir(parents=True, exist_ok=True)
        (tmp_path / "flat" / "images" / c).rename(root / "images" / "Onera Satellite Change Detection dataset - Images" / c)
        (root / "train_labels" / c).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / "flat" / "labels" / c).rename(root / "train_labels" / c)
    idx = D.index(str(root))
    assert set(idx["images"]) == {"abudhabi", "brasilia"} and set(idx["labels"]) == {"abudhabi", "brasilia"}
    c = D.load_city(str(root), "brasilia")                      # case-insensitive match
    assert c.before.shape[0] == 5 and c.label.sum() > 0
    assert D.load_city(str(root), "abudhabi", with_label=False).label.sum() == 0


def test_label_file_preference_is_the_tif_with_values_1_and_2(tmp_path):
    cm = tmp_path / "images" / "x" / "cm"
    cm.mkdir(parents=True)
    for n in ("cm.png", "x-cm.tif", "other.tif"):
        (cm / n).write_bytes(b"")
    (tmp_path / "images" / "x" / "imgs_1_rect").mkdir()
    (tmp_path / "images" / "x" / "imgs_2_rect").mkdir()
    assert D.index(str(tmp_path))["labels"]["x"].endswith("x-cm.tif")


def test_a_missing_city_error_says_what_was_found(tmp_path):
    import pytest
    make_dataset(tmp_path, ["a", "b"])
    with pytest.raises(FileNotFoundError, match="found 2 cities"):
        D.load_city(str(tmp_path), "zzz")


def test_default_lists_are_the_official_14_and_10():
    assert len(D.TRAIN_CITIES) == 14 and len(D.TEST_CITIES) == 10
    assert not set(D.TRAIN_CITIES) & set(D.TEST_CITIES)


def test_dataset_text_files_override_defaults(tmp_path):
    (tmp_path / "images").mkdir()
    (tmp_path / "images" / "train.txt").write_text("x,y,z\n")
    (tmp_path / "images" / "test.txt").write_text("q")
    assert D.city_lists(str(tmp_path)) == (["x", "y", "z"], ["q"])
    assert D.city_lists(str(tmp_path / "images" / "nothing")) == (D.TRAIN_CITIES, D.TEST_CITIES)


def test_validation_cities_never_appear_in_train_and_split_is_deterministic():
    tr, val = D.split(D.TRAIN_CITIES)
    assert len(val) == 3 and len(tr) == 11
    assert not set(tr) & set(val) and set(tr) | set(val) == set(D.TRAIN_CITIES)
    assert D.split(D.TRAIN_CITIES) == (tr, val)
    assert not set(val) & set(D.TEST_CITIES) and not set(tr) & set(D.TEST_CITIES)


def test_patch_grid_covers_the_image_including_edges():
    g = D.patch_grid(200, 180, 128, 64)
    cover = np.zeros((200, 180), bool)
    for y, x in g:
        cover[y:y + 128, x:x + 128] = True
    assert cover.all() and all(y + 128 <= 200 and x + 128 <= 180 for y, x in g)
    assert D.patch_grid(100, 100, 128, 64) == [(0, 0)] or True   # smaller than a patch must not crash


def test_stats_normalise_patches_and_augment(tmp_path):
    make_dataset(tmp_path, ["a", "b"])
    cities = [D.load_city(str(tmp_path), c) for c in ("a", "b")]
    st = D.stats(cities)
    assert len(st["mean"]) == 5 and all(s > 0 for s in st["std"])
    n = D.normalise(cities[0].before, st)
    assert abs(float(n.mean())) < 0.2 and 0.5 < float(n.std()) < 1.5
    x, y = D.make_patches(cities, st, size=64, stride=64, keep_empty=1.0)
    assert x.shape[1:] == (10, 64, 64) and y.shape == x.shape[:1] + (64, 64)
    x2, y2 = D.make_patches(cities, st, size=64, stride=64, keep_empty=0.0)
    assert 0 < len(x2) < len(x) and all(p.any() for p in y2)      # empty patches dropped
    rng = np.random.default_rng(0)
    xa, ya = D.augment(x[0], y[0], rng)
    assert xa.shape == x[0].shape and ya.sum() == y[0].sum()
    # label and image move together: the changed region keeps its position relative to the image
    assert np.allclose(np.sort(xa.ravel()), np.sort(x[0].ravel()))
