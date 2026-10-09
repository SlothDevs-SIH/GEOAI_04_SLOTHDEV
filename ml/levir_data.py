"""LEVIR-CD loader: 0.5 m RGB image pairs with building-change labels (numpy and PIL only; no torch).

Layout (the official split folders, e.g. `test/`):  <root>/A/<name>.png  before,  <root>/B/<name>.png  after,
<root>/label/<name>.png  change mask (white = change). Optional <root>/list/test.txt names the files.

LEVIR-CD is **academic use only**; imagery follows Google Earth terms. The PNGs carry NO coordinates (a March 2023
update added latitude and longitude per sample as a separate file; `find_georeference` reports whether the copy you
downloaded has one). Without it, `read_pair` places the tile at a PLACEHOLDER location near Austin: areas and shapes are
real, latitude and longitude are illustrative, and anything shown to a user must say so.
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image
from rasterio.transform import from_origin

from engine.ingest import Pair

PIXEL_M = 0.5
PLACEHOLDER_CRS = "EPSG:32614"                    # UTM 14N, central Texas
PLACEHOLDER_ORIGIN = (621000.0, 3350000.0)        # near Austin: illustrative only
PLACEHOLDER_GEOREF = True


def list_pairs(root) -> list[str]:
    """Image names to use: labelled pairs only, and only `test_*` files when the folder mixes splits
    (the BIT sample folder also holds train_* tiles the model was trained on, which must not be scored)."""
    lst = os.path.join(root, "list", "test.txt")
    if os.path.exists(lst):
        names = [n.strip() for n in open(lst) if n.strip()]
    else:
        names = sorted(os.listdir(os.path.join(root, "A")))
    names = [n for n in names if all(os.path.exists(os.path.join(root, d, n)) for d in ("A", "B", "label"))]
    tests = [n for n in names if n.startswith("test_")]
    return tests or names


def _rgb(root, folder, name):
    return np.asarray(Image.open(os.path.join(root, folder, name)).convert("RGB")).astype(np.float32).transpose(2, 0, 1) / 255.0


def read_pair(root, name, origin=PLACEHOLDER_ORIGIN) -> Pair:
    """The pair as an engine Pair: RGB in 0..1, 0.5 m pixels, on a placeholder grid (see the module note)."""
    before, after = _rgb(root, "A", name), _rgb(root, "B", name)
    if before.shape != after.shape:
        raise ValueError(f"{name}: before {before.shape} and after {after.shape} differ in size")
    return Pair(before=before, after=after, transform=from_origin(origin[0], origin[1], PIXEL_M, PIXEL_M),
                crs=PLACEHOLDER_CRS, bands=("red", "green", "blue"), meta={"placeholder_georeference": True, "name": name})


def read_label(root, name) -> np.ndarray:
    """True where the label marks change."""
    return np.asarray(Image.open(os.path.join(root, "label", name)).convert("L")) > 127


def find_georeference(root) -> str | None:
    """A sidecar file with per-sample latitude and longitude (the March 2023 update), or None if this copy has none."""
    for dirpath, _, files in os.walk(root):
        if os.path.basename(dirpath) in ("A", "B", "label"):
            continue
        for f in files:
            if f.lower().endswith((".csv", ".json", ".geojson", ".txt")) and any(k in f.lower() for k in ("geo", "coord", "latlon", "lonlat")):
                return os.path.join(dirpath, f)
    return None
