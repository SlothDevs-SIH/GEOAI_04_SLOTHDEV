"""Sentinel-2 L2A scene search and area-of-interest reads.

The Earth Search STAC API is not always reachable, but the public COG bucket
behind it is, so scenes are found by listing the bucket and reading each
item's JSON. Only the area-of-interest window of each band is downloaded.
"""
from __future__ import annotations

import json
import os
import re
import urllib.request
from dataclasses import dataclass
from datetime import date

import numpy as np
import rasterio
import rasterio.errors
from rasterio.enums import Resampling
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds

BUCKET = "https://sentinel-cogs.s3.us-west-2.amazonaws.com"
ROOT = "sentinel-s2-l2a-cogs"
BANDS_10M = ("B02", "B03", "B04", "B08")
BANDS_20M = ("B11",)  # resampled to 10 m
BAND_NAMES = ("blue", "green", "red", "nir", "swir1")

for _k, _v in {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
               "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
               "GDAL_HTTP_MAX_RETRY": "3"}.items():
    os.environ.setdefault(_k, _v)
if os.environ.get("HTTPS_PROXY"):
    os.environ.setdefault("GDAL_HTTP_PROXY", os.environ["HTTPS_PROXY"])
if os.path.exists("/root/.ccr/ca-bundle.crt"):
    os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")


@dataclass
class Scene:
    id: str
    prefix: str
    date: date
    cloud_pct: float          # whole tile
    baseline: str
    offset_applied: bool

    dn_offset: int = 0        # set by read_aoi from the pixels themselves

    def href(self, band: str) -> str:
        return f"/vsicurl/{BUCKET}/{self.prefix}{band}.tif"


def mgrs_tile(lat: float, lon: float) -> str:
    import mgrs
    return mgrs.MGRS().toMGRS(lat, lon, MGRSPrecision=0)  # e.g. 43QBB


def _list(prefix: str) -> list[str]:
    url = f"{BUCKET}/?list-type=2&prefix={prefix}&delimiter=/&max-keys=1000"
    with urllib.request.urlopen(url, timeout=60) as r:
        xml = r.read().decode()
    return [p for p in re.findall(r"<Prefix>([^<]*)</Prefix>", xml) if p != prefix]


def _item(prefix: str) -> dict:
    sid = prefix.rstrip("/").rsplit("/", 1)[1]
    with urllib.request.urlopen(f"{BUCKET}/{prefix}{sid}.json", timeout=60) as r:
        return json.load(r)


def search(tile: str, months: list[tuple[int, int]], max_cloud: float = 20.0) -> list[Scene]:
    """Scenes for an MGRS tile in the given (year, month) list, least cloudy first."""
    zone, band, sq = tile[:2], tile[2], tile[3:]
    out = []
    for y, m in months:
        for p in _list(f"{ROOT}/{int(zone)}/{band}/{sq}/{y}/{m}/"):
            try:
                props = _item(p)["properties"]
            except Exception:
                continue
            cc = float(props.get("eo:cloud_cover", 100))
            if cc > max_cloud:
                continue
            out.append(Scene(
                id=p.rstrip("/").rsplit("/", 1)[1], prefix=p,
                date=date.fromisoformat(props["datetime"][:10]), cloud_pct=cc,
                baseline=props.get("s2:processing_baseline", "00.00"),
                offset_applied=bool(props.get("earthsearch:boa_offset_applied", False))))
    return sorted(out, key=lambda s: s.cloud_pct)


def _open(href: str, attempts: int = 4):
    """Open a remote COG, retrying: the bucket/proxy occasionally answers a burst with an error page."""
    import time
    for i in range(attempts):
        try:
            return rasterio.open(href)
        except rasterio.errors.RasterioIOError:
            if i == attempts - 1:
                raise
            time.sleep(2 ** (i + 1))


def read_aoi(scene: Scene, bbox_ll: tuple[float, float, float, float]):
    """Read an AOI (lon/lat bbox) at 10 m. Returns (reflectance[5,H,W], scl[H,W], transform, crs)."""
    with _open(scene.href("B04")) as ref:
        crs = ref.crs
        b = transform_bounds("EPSG:4326", crs, *bbox_ll)
        win = from_bounds(*b, ref.transform).round_offsets().round_lengths()
        transform = ref.window_transform(win)
        shape = (int(win.height), int(win.width))
    raw = []
    for band in BANDS_10M + BANDS_20M:
        with _open(scene.href(band)) as s:
            w = from_bounds(*b, s.transform)
            raw.append(s.read(1, window=w, out_shape=shape, resampling=Resampling.bilinear,
                              boundless=True, fill_value=0).astype(np.float32))
    scene.dn_offset = detect_offset(scene.baseline, raw[0])
    layers = [np.clip((a - scene.dn_offset) / 10000.0, 0, 1.5) for a in raw]
    with _open(scene.href("SCL")) as s:
        scl = s.read(1, window=from_bounds(*b, s.transform), out_shape=shape,
                     resampling=Resampling.nearest, boundless=True, fill_value=0)
    return np.stack(layers), scl, transform, crs


def detect_offset(baseline: str, blue_dn: np.ndarray) -> int:
    """DN offset to remove, decided from the pixels.

    Processing baseline 04.00+ defines reflectance = (DN - 1000) / 10000, but the
    bucket mixes items that store that offset with items that don't, and the item
    metadata (earthsearch:boa_offset_applied, raster:bands offset) is not reliable:
    S2C_43QCA_20250217 says offset -0.1 yet its blue median DN is 476. Real surface
    reflectance is almost never negative, so if the 1st percentile of valid blue DNs
    is below 1000 the offset is not in the data.
    """
    if baseline < "04.00":
        return 0
    v = blue_dn[blue_dn > 0]
    return 1000 if v.size and np.percentile(v, 1) >= 1000 else 0


def aoi_cloud_pct(scl: np.ndarray) -> float:
    from .config import SCL_INVALID
    return float(np.isin(scl, SCL_INVALID).mean() * 100)


def write_stack(path: str, refl: np.ndarray, scl: np.ndarray, transform, crs, meta: dict):
    """6-band GeoTIFF: blue, green, red, nir, swir1 (reflectance x10000, uint16) + SCL."""
    data = np.concatenate([np.round(refl * 10000).clip(0, 65535).astype(np.uint16),
                           scl[None].astype(np.uint16)])
    with rasterio.open(path, "w", driver="GTiff", height=data.shape[1], width=data.shape[2],
                       count=6, dtype="uint16", crs=crs, transform=transform,
                       compress="deflate") as dst:
        dst.write(data)
        for i, n in enumerate(BAND_NAMES + ("scl",), 1):
            dst.set_band_description(i, n)
        dst.update_tags(**{k: str(v) for k, v in meta.items()})
