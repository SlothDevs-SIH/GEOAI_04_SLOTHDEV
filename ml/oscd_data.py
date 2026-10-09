"""OSCD (Onera Satellite Change Detection) loader: Sentinel-2 city pairs with change labels.

Numpy only (no torch), so the loader and its tests run in CI. Train/eval scripts wrap it for PyTorch.

Expected layout (the official zips, or the Kaggle copy `soumikrakshit/onera-satellite-change-detection-dataset`):
  <root>/**/<city>/imgs_1_rect/B02.tif ... B11.tif     before image, 13 bands, co-registered
  <root>/**/<city>/imgs_2_rect/B02.tif ...             after image
  <root>/**/<city>/cm/<city>-cm.tif  (or cm.png)       label: 1 = no change, 2 = change  (png: 0 / 255)
  <root>/**/train.txt, test.txt                        optional comma-separated city lists (they win over the defaults)

We keep the 5 bands the engine uses (blue, green, red, nir, swir1 = B02, B03, B04, B08, B11), as
reflectance (DN / 10000), so a model trained here reads an `engine.ingest.Pair` directly.

Split: official 14 train / 10 test cities. Three train cities are held out as validation
(`split`, fixed seed) for early stopping and the threshold. The test cities are used once.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass

import numpy as np
import rasterio
from scipy.ndimage import zoom

BANDS = ("B02", "B03", "B04", "B08", "B11")                 # blue, green, red, nir, swir1
# Defaults from the dataset paper; the dataset's own train.txt / test.txt override them if present.
TRAIN_CITIES = ["abudhabi", "aguasclaras", "beihai", "beirut", "bercy", "bordeaux", "cupertino", "hongkong",
                "mumbai", "nantes", "paris", "pisa", "rennes", "saclay_e"]
TEST_CITIES = ["brasilia", "chongqing", "dubai", "lasvegas", "milano", "montpellier", "norcia", "rio",
               "saclay_w", "valencia"]


@dataclass
class City:
    name: str
    before: np.ndarray            # float32 [5, H, W] reflectance 0..1
    after: np.ndarray
    label: np.ndarray             # bool [H, W], True = change


def _walk_files(root, name):
    for dirpath, _, files in os.walk(root):
        if name in files:
            yield os.path.join(dirpath, name)


def city_lists(root):
    """(train, test) city names: the dataset's own text files if found, else the paper's lists."""
    lists = {}
    for name in ("train", "test"):
        hit = next(_walk_files(root, f"{name}.txt"), None)
        if hit:
            txt = open(hit).read()
            lists[name] = [c.strip() for c in txt.replace("\n", ",").split(",") if c.strip()]
    return lists.get("train", list(TRAIN_CITIES)), lists.get("test", list(TEST_CITIES))


def split(train, n_val=3, seed=0):
    """(train, val): hold out `n_val` train cities, chosen by a fixed seed from the sorted list."""
    train = sorted(train)
    if not 0 < n_val < len(train):
        raise ValueError("n_val must leave at least one training city")
    rng = np.random.default_rng(seed)
    val = sorted(rng.choice(train, n_val, replace=False).tolist())
    return [c for c in train if c not in val], val


def index(root) -> dict:
    """Locate every city under `root` with a plain folder walk (no glob: spaces, nesting and slash style are fine).

    Returns {"images": {city: folder holding imgs_1_rect and imgs_2_rect}, "labels": {city: label file}}.
    City names are matched case-insensitively. The label is the file in <city>/cm/: `<city>-cm.tif` first
    (values 1 / 2), then cm.png (0 / 255), then any other tif or png.
    """
    images, labels = {}, {}
    for dirpath, dirs, files in os.walk(root):
        base = os.path.basename(dirpath)
        if "imgs_1_rect" in dirs and "imgs_2_rect" in dirs:
            images[base.lower()] = dirpath
        if base.lower() == "cm":
            cands = [f for f in files if f.lower().endswith((".tif", ".tiff", ".png"))]
            cands.sort(key=lambda f: (not f.lower().endswith("-cm.tif"), f.lower() != "cm.png", f.lower()))
            if cands:
                labels[os.path.basename(os.path.dirname(dirpath)).lower()] = os.path.join(dirpath, cands[0])
    return {"images": images, "labels": labels}


def _band(idx, root, city, folder, band, shape=None):
    base = idx["images"].get(city.lower())
    if base is None:
        raise FileNotFoundError(f"{city}/{folder}/{band}.tif not found under {root} "
                                f"(found {len(idx['images'])} cities: {', '.join(sorted(idx['images'])[:6])}...)")
    path = os.path.join(base, folder, f"{band}.tif")
    if not os.path.exists(path):
        raise FileNotFoundError(f"{city}/{folder}/{band}.tif not found under {root}")
    with rasterio.open(path) as s:
        a = s.read(1).astype(np.float32)
    if shape is not None and a.shape != shape:
        a = zoom(a, (shape[0] / a.shape[0], shape[1] / a.shape[1]), order=1)[: shape[0], : shape[1]]
    return a


def _read_label(path):
    """True where the label says change. Official cm.tif: 1 = no change, 2 = change; 0/1 and png 0/255 also work."""
    if path.lower().endswith(".png"):
        from PIL import Image
        a = np.asarray(Image.open(path))
        a = a[..., 0] if a.ndim == 3 else a
    else:
        with rasterio.open(path) as s:
            a = s.read(1)
    mx = int(a.max())
    if mx > 2:
        return a > 127
    if mx == 2:
        return a == 2
    return (a == 1) if (a == 0).any() else np.zeros(a.shape, bool)   # {0,1}: 1 = change; all 1s: no change


def load_city(root, city, with_label=True) -> City:
    idx = index(root)
    ref = _band(idx, root, city, "imgs_1_rect", BANDS[0])
    shape = ref.shape

    def stack(folder):
        return np.stack([ref if (folder == "imgs_1_rect" and b == BANDS[0]) else _band(idx, root, city, folder, b, shape)
                         for b in BANDS]) / 10000.0

    before, after = stack("imgs_1_rect").astype(np.float32), stack("imgs_2_rect").astype(np.float32)
    label = np.zeros(shape, bool)
    if with_label:
        lp = idx["labels"].get(city.lower())
        if lp is None:
            raise FileNotFoundError(f"no label for {city} under {root} (labels found for {len(idx['labels'])} cities)")
        label = _read_label(lp)
        if label.shape != shape:
            raise ValueError(f"{city}: label {label.shape} does not match image {shape}")
    return City(city, before, after, label)


def stats(cities) -> dict:
    """Per-band mean/std over the given cities (training cities only), in reflectance units."""
    px = np.concatenate([np.concatenate([c.before, c.after], axis=2).reshape(len(BANDS), -1) for c in cities], 1)
    return {"bands": list(BANDS), "mean": px.mean(1).round(6).tolist(), "std": (px.std(1) + 1e-6).round(6).tolist()}


def normalise(x, st):
    m = np.asarray(st["mean"], np.float32).reshape(-1, 1, 1)
    s = np.asarray(st["std"], np.float32).reshape(-1, 1, 1)
    return ((x - m) / s).astype(np.float32)


def patch_grid(h, w, size=128, stride=64):
    """Top-left corners of overlapping patches that cover the whole image, edges included."""
    ys = list(range(0, max(h - size, 0) + 1, stride))
    xs = list(range(0, max(w - size, 0) + 1, stride))
    if ys[-1] + size < h:
        ys.append(h - size)
    if xs[-1] + size < w:
        xs.append(w - size)
    return [(y, x) for y in ys for x in xs]


def make_patches(cities, st, size=128, stride=64, min_pos=0.0, seed=0, keep_empty=0.25):
    """Stack patches from cities. Returns x [N, 10, size, size] (before then after), y [N, size, size] bool.

    Patches with fewer than `min_pos` changed pixels are kept with probability `keep_empty` (OSCD is
    about 98% no-change, so most of the data would otherwise be empty).
    """
    rng = np.random.default_rng(seed)
    xs, ys = [], []
    for c in cities:
        b, a = normalise(c.before, st), normalise(c.after, st)
        h, w = c.label.shape
        for y0, x0 in patch_grid(h, w, size, stride):
            lab = c.label[y0:y0 + size, x0:x0 + size]
            if lab.mean() <= min_pos and rng.random() > keep_empty:
                continue
            xs.append(np.concatenate([b[:, y0:y0 + size, x0:x0 + size], a[:, y0:y0 + size, x0:x0 + size]]))
            ys.append(lab)
    if not xs:
        return np.zeros((0, 2 * len(BANDS), size, size), np.float32), np.zeros((0, size, size), bool)
    return np.stack(xs), np.stack(ys)


def augment(x, y, rng):
    """Random flips and 90-degree rotations, applied identically to both dates and the label."""
    k = int(rng.integers(0, 4))
    x, y = np.rot90(x, k, axes=(-2, -1)), np.rot90(y, k, axes=(-2, -1))
    if rng.random() < 0.5:
        x, y = x[..., ::-1], y[..., ::-1]
    return np.ascontiguousarray(x), np.ascontiguousarray(y)


def save_stats(st, path):
    with open(path, "w") as f:
        json.dump(st, f)
