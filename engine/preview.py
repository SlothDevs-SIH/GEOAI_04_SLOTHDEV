"""Write the files the web map needs for one analysed pair, in the same layout as the demo scenes.

A live job (an upload, or a box fetched from Sentinel-2) then opens on the same swipe map as the
demo scenes: before.webp, after.webp, bounds.json, meta.json, result_filtered.geojson, crops/.
"""
from __future__ import annotations

import json
import os
import shutil

import numpy as np
from PIL import Image
from rasterio.warp import transform as warp_transform

TOP_CROPS = 20


def webp(rgb: np.ndarray, path: str, max_side: int = 2048, quality: int = 82) -> None:
    im = Image.fromarray(rgb)
    if max(im.size) > max_side:
        s = max_side / max(im.size)
        im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    im.save(path, "WEBP", quality=quality)


def true_color(refl: np.ndarray, gain: float = 1 / 0.3, gamma: float = 0.8) -> np.ndarray:
    """Reflectance stack (blue, green, red, ...) to an 8-bit RGB image."""
    rgb = np.clip(np.dstack([refl[2], refl[1], refl[0]]) * gain, 0, 1) ** gamma
    return (rgb * 255).astype(np.uint8)


def corners_lonlat(transform, crs, h: int, w: int) -> list[list[float]]:
    """Image corners (TL, TR, BR, BL) in lon/lat, the order a MapLibre image source expects."""
    xs = [transform.c, transform.c + w * transform.a, transform.c + w * transform.a, transform.c]
    ys = [transform.f, transform.f, transform.f + h * transform.e, transform.f + h * transform.e]
    lon, lat = warp_transform(crs, "EPSG:4326", xs, ys)
    return [[round(x, 6), round(y, 6)] for x, y in zip(lon, lat, strict=True)]


def write_crops(rgb_b, rgb_a, gdf, transform, crs, out_dir: str, pad: int = 8) -> int:
    """Before/after crops of the top changes, around each polygon's bounding box. Returns how many were written."""
    os.makedirs(f"{out_dir}/crops", exist_ok=True)
    inv = ~transform
    h, w = rgb_b.shape[:2]
    n = 0
    for _, r in gdf.head(TOP_CROPS).iterrows():
        g = r.geometry
        if crs.to_epsg() != 4326:
            import geopandas as gpd
            g = gpd.GeoSeries([g], crs=4326).to_crs(crs).iloc[0]
        x0, y0, x1, y1 = g.bounds
        c0, r0 = inv @ (x0, y1)
        c1, r1 = inv @ (x1, y0)
        c0, r0 = max(int(c0) - pad, 0), max(int(r0) - pad, 0)
        c1, r1 = min(int(c1) + pad, w), min(int(r1) + pad, h)
        if c1 - c0 < 4 or r1 - r0 < 4:
            continue
        for side, img in (("before", rgb_b), ("after", rgb_a)):
            crop = Image.fromarray(img[r0:r1, c0:c1])
            crop.resize((160, max(1, int(160 * (r1 - r0) / (c1 - c0)))), Image.NEAREST).save(
                f"{out_dir}/crops/{int(r['id'])}_{side}.webp", "WEBP", quality=85)
        n += 1
    return n


def write_scene_files(res, out_dir: str, info: dict) -> dict:
    """Write the swipe-map files for an analysed pair into out_dir (which already has changes.geojson).

    `info` supplies the labels: name, place, event, before_date, after_date, kind, source.
    Returns the meta dict that was written.
    """
    pair = res.pair
    rgb_b, rgb_a = true_color(pair.before), true_color(pair.after)
    webp(rgb_b, f"{out_dir}/before.webp")
    webp(rgb_a, f"{out_dir}/after.webp")
    h, w = rgb_b.shape[:2]
    corners = corners_lonlat(pair.transform, pair.crs, h, w)
    with open(f"{out_dir}/bounds.json", "w") as f:
        json.dump({"corners": corners}, f)
    src = f"{out_dir}/changes.geojson"
    if os.path.exists(src):
        shutil.copy(src, f"{out_dir}/result_filtered.geojson")
    write_crops(rgb_b, rgb_a, res.gdf, pair.transform, pair.crs, out_dir)
    bd, ad = info.get("before_date") or "before", info.get("after_date") or "after"
    meta = {
        "id": info.get("id", "analysis"), "name": info.get("name", "Your analysis"),
        "place": info.get("place", "Custom area"), "event": info.get("event", "Change between two dates"),
        "kind": info.get("kind", "custom"), "mode": "spectral",
        "before_date": bd, "after_date": ad,
        "before_label": f"Before · Sentinel-2 · {bd}", "after_label": f"After · Sentinel-2 · {ad}",
        "source": info.get("source", "Sentinel-2 L2A (Copernicus)"),
        "corners": corners, "demo": False,
        "after_filter": res.summary.get("after_filter"), "raw_detections": res.summary.get("raw_detections"),
    }
    with open(f"{out_dir}/meta.json", "w") as f:
        json.dump(meta, f, indent=1)
    return meta
