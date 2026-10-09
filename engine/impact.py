"""Impact: turn polygons into numbers an official acts on.

Cropland affected comes from ESA WorldCover 2021 (10 m, class 40 = cropland), read as a window from
the public COG bucket (no login) and cached next to the scene. Buildings and roads need OpenStreetMap;
when OSM is not available they are reported as None (unknown), never as zero.
"""
from __future__ import annotations

import math
import os

import numpy as np
import rasterio
from rasterio.warp import Resampling, reproject, transform_bounds
from rasterio.windows import from_bounds

WC_URL = ("https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
          "ESA_WorldCover_10m_2021_v200_{tile}_Map.tif")
CROPLAND, BUILT_UP = 40, 50
SOURCE = "ESA WorldCover 2021 v200 (10 m), CC-BY 4.0"


def wc_tile(lat, lon):
    la, lo = math.floor(lat / 3) * 3, math.floor(lon / 3) * 3
    return f"{'N' if la >= 0 else 'S'}{abs(la):02d}{'E' if lo >= 0 else 'W'}{abs(lo):03d}"


def worldcover_on_grid(shape, transform, crs, cache_path=None):
    """WorldCover classes resampled (nearest) onto the scene grid. Returns uint8 array or None."""
    if cache_path and os.path.exists(cache_path):
        with rasterio.open(cache_path) as s:
            return s.read(1)
    h, w = shape
    west, south, east, north = transform_bounds(crs, "EPSG:4326", *rasterio.transform.array_bounds(h, w, transform))
    lat, lon = (south + north) / 2, (west + east) / 2
    try:
        with rasterio.open("/vsicurl/" + WC_URL.format(tile=wc_tile(lat, lon))) as src:
            win = from_bounds(west, south, east, north, src.transform)
            data = src.read(1, window=win, boundless=True, fill_value=0)
            wtr = src.window_transform(win)
            out = np.zeros(shape, np.uint8)
            reproject(data, out, src_transform=wtr, src_crs=src.crs, dst_transform=transform, dst_crs=crs,
                      resampling=Resampling.nearest)
    except Exception:
        return None
    if cache_path:
        with rasterio.open(cache_path, "w", driver="GTiff", height=h, width=w, count=1, dtype="uint8",
                           crs=crs, transform=transform, compress="deflate") as dst:
            dst.write(out, 1)
    return out


def pixel_area_m2(transform, crs, shape):
    if crs.is_projected:
        return np.full(shape, abs(transform.a * transform.e), np.float32)
    rows = np.arange(shape[0])
    lats = transform.f + (rows + 0.5) * transform.e
    a = abs(transform.a * transform.e) * (111320.0 ** 2) * np.cos(np.radians(lats))
    return np.repeat(a[:, None], shape[1], 1).astype(np.float32)


WC_YEAR = 2021


def compute(gdf, lab, transform, crs, shape, worldcover=None, before_date=None):
    """Adds cropland_ha per polygon (in place) and returns the scene impact block.
    WorldCover describes the land in 2021. When the before image is older, land that was already
    being cleared or built on may be mislabelled (the levelled Navi Mumbai airport site is mapped as
    cropland), so cropland is then flagged as an upper bound."""
    impact = {"changed_ha": round(float(gdf["area_ha"].sum()), 2) if len(gdf) else 0.0,
              "cropland_ha": None, "built_up_ha": None, "buildings": None, "road_segments": None,
              "sources": [], "notes": []}
    if worldcover is None:
        impact["notes"].append("ESA WorldCover not available for this area: cropland not computed")
        return impact
    px = pixel_area_m2(transform, crs, shape)
    crop_px, built_px = worldcover == CROPLAND, worldcover == BUILT_UP
    if "cid" in gdf:
        crops = [float(px[(lab == c) & crop_px].sum() / 1e4) for c in gdf["cid"]]
        gdf["cropland_ha"] = np.round(crops, 3)
    changed = lab > 0
    impact["cropland_ha"] = round(float(px[changed & crop_px].sum() / 1e4), 2)
    impact["built_up_ha"] = round(float(px[changed & built_px].sum() / 1e4), 2)
    impact["sources"].append(SOURCE)
    impact["cropland_reliability"] = "ok"
    if before_date and int(str(before_date)[:4]) < WC_YEAR:
        impact["cropland_reliability"] = "upper_bound"
        impact["notes"].append(f"Land cover is ESA WorldCover {WC_YEAR}, newer than the before image "
                               f"({str(before_date)[:4]}): land already cleared or under construction can be "
                               "mislabelled as cropland, so treat cropland as an upper bound")
    impact["notes"].append("Buildings and road segments need OpenStreetMap, which was not reachable when this "
                           "result was built: shown as unknown, not zero")
    return impact
