"""Mask -> polygons (rasterio.features.shapes), simplified by about one pixel."""
from __future__ import annotations

import numpy as np
from rasterio.features import shapes
from scipy.ndimage import label
from shapely.geometry import shape


def polygons(mask, transform):
    """Returns a list of (shapely polygon, component mask) for each connected changed region."""
    lab, n = label(mask)
    out = []
    for geom, val in shapes(lab.astype(np.int32), mask=mask, transform=transform):
        g = shape(geom).simplify(abs(transform.a), preserve_topology=True)
        if not g.is_empty:
            out.append((g, int(val)))
    return out, lab
