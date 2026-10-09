"""Analyse any area: from a bounding box and two dates to a pair of Sentinel-2 images.

The user draws a box anywhere (India, or anywhere Sentinel-2 reaches) and picks a "before" and an
"after" date. For each date this module finds the scenes whose real data footprint covers the whole
box and that were taken within a window of the date, prefers the clearest sky over the box, and
reads just the box (never the whole 100 km tile).

Every network call goes through an injectable function (`search_fn`, `scl_fn`, `read_fn`), so the
selection logic is tested without network access.
"""
from __future__ import annotations

import math
import os
from collections.abc import Callable
from datetime import date, timedelta

from . import s2

MAX_SIDE_KM = 15.0          # per side; larger areas need tiling (future work)
MIN_SIDE_KM = 0.5
EARLIEST = date(2017, 1, 1)  # Sentinel-2 L2A cloud-optimised archive starts here
CLOUDY_AOI_PCT = 25.0        # warn above this share of invalid pixels over the box
UNUSABLE_AOI_PCT = 70.0      # refuse above this share


class AoiError(ValueError):
    """The request cannot be served; the message is written for the user."""


def parse_date(text: str, name: str) -> date:
    try:
        d = date.fromisoformat(str(text)[:10])
    except ValueError as exc:
        raise AoiError(f"{name} must be a date like 2025-01-31") from exc
    if d < EARLIEST:
        raise AoiError(f"{name} is before {EARLIEST.isoformat()}: no Sentinel-2 L2A cloud-optimised data that early")
    if d > date.today():
        raise AoiError(f"{name} is in the future")
    return d


def size_km(bbox) -> tuple[float, float]:
    w, s, e, n = bbox
    mid = math.radians((s + n) / 2)
    return (e - w) * 111.32 * math.cos(mid), (n - s) * 110.57


def validate_bbox(bbox) -> tuple[float, float, float, float]:
    """Return (west, south, east, north) as floats, or raise AoiError with a plain message."""
    try:
        w, s, e, n = (float(v) for v in bbox)
    except (TypeError, ValueError) as exc:
        raise AoiError("the area must be four numbers: west, south, east, north (degrees)") from exc
    if not all(math.isfinite(v) for v in (w, s, e, n)):
        raise AoiError("the area contains an invalid number")
    if not (-180 <= w < e <= 180 and -85 <= s < n <= 85):
        raise AoiError("the area is outside valid longitude and latitude, or west/south are not below east/north")
    wkm, hkm = size_km((w, s, e, n))
    if wkm > MAX_SIDE_KM or hkm > MAX_SIDE_KM:
        raise AoiError(f"the area is {wkm:.1f} x {hkm:.1f} km; the limit is {MAX_SIDE_KM:g} x {MAX_SIDE_KM:g} km. "
                       "Draw a smaller box (larger areas need tiling, which is not built yet)")
    if wkm < MIN_SIDE_KM or hkm < MIN_SIDE_KM:
        raise AoiError(f"the area is {wkm:.2f} x {hkm:.2f} km; draw at least {MIN_SIDE_KM:g} x {MIN_SIDE_KM:g} km")
    return w, s, e, n


def candidate_tiles(bbox) -> list[str]:
    """MGRS tiles for the box centre and corners (centre first). Usually one; a box near an edge gives two."""
    w, s, e, n = bbox
    points = [((s + n) / 2, (w + e) / 2), (s, w), (s, e), (n, w), (n, e)]
    tiles: list[str] = []
    for lat, lon in points:
        t = s2.mgrs_tile(lat, lon)
        if t not in tiles:
            tiles.append(t)
    return tiles


def months_for(center: date, window_days: int) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    d = center - timedelta(days=window_days)
    end = center + timedelta(days=window_days)
    while d <= end:
        ym = (d.year, d.month)
        if ym not in out:
            out.append(ym)
        d += timedelta(days=1)
    return out


def find_scenes(bbox, target: date, window_days: int = 20, max_cloud: float = 70.0,
                search_fn: Callable = s2.search) -> list[s2.Scene]:
    """Scenes that cover the whole box within the window, best first (clearest, then closest in time)."""
    months = months_for(target, window_days)
    found: dict[str, s2.Scene] = {}
    for tile in candidate_tiles(bbox):
        for sc in search_fn(tile, months, max_cloud, bbox_ll=bbox):
            if abs((sc.date - target).days) <= window_days:
                found.setdefault(sc.id, sc)
    return sorted(found.values(), key=lambda sc: (round(sc.cloud_pct, 1), abs((sc.date - target).days)))


def choose_scene(bbox, target: date, window_days: int = 20, tries: int = 4,
                 search_fn: Callable = s2.search, scl_fn: Callable = s2.read_scl) -> dict:
    """Pick the scene with the least invalid (cloud, shadow, no-data) pixels over the box.

    Returns {scene, aoi_invalid_pct, days_from_target, candidates}. Raises AoiError if nothing usable exists.
    """
    scenes = find_scenes(bbox, target, window_days, search_fn=search_fn)
    if not scenes:
        raise AoiError(f"no Sentinel-2 scene covers this box within {window_days} days of {target.isoformat()}; "
                       "try a wider date, or a box that does not sit on the edge of a satellite pass")
    scored = []
    for sc in scenes[:tries]:
        try:
            invalid = s2.aoi_cloud_pct(scl_fn(sc, bbox))
        except Exception:        # unreadable file: skip this date and try the next
            continue
        scored.append((invalid, sc))
    if not scored:
        raise AoiError("the satellite images for those dates could not be read; try other dates")
    scored.sort(key=lambda t: (round(t[0], 1), abs((t[1].date - target).days)))
    invalid, best = scored[0]
    if invalid > UNUSABLE_AOI_PCT:
        raise AoiError(f"the best image near {target.isoformat()} is {invalid:.0f}% cloud or no-data over this box; "
                       "try other dates (in the monsoon, use the radar flood mode)")
    return {"scene": best, "aoi_invalid_pct": round(invalid, 2), "days_from_target": (best.date - target).days,
            "candidates": [{"id": sc.id, "date": sc.date.isoformat(), "aoi_invalid_pct": round(i, 2)} for i, sc in scored]}


def describe(choice: dict) -> dict:
    sc = choice["scene"]
    return {"scene": sc.id, "date": sc.date.isoformat(), "tile_cloud_pct": round(sc.cloud_pct, 2),
            "aoi_invalid_pct": choice["aoi_invalid_pct"], "days_from_target": choice["days_from_target"]}


def check_pair(before: dict, after: dict, bbox) -> list[str]:
    """Plain-language warnings about a chosen pair."""
    warnings = []
    for label, c in (("before", before), ("after", after)):
        if c["aoi_invalid_pct"] > CLOUDY_AOI_PCT:
            warnings.append(f"the {label} image is {c['aoi_invalid_pct']:.0f}% cloud or no-data over this box; "
                            "clouded areas are removed, not analysed (for floods under monsoon cloud, use the radar mode)")
    if before["scene"].date >= after["scene"].date:
        warnings.append("the before image is not older than the after image")
    gap = abs((after["scene"].date - before["scene"].date).days)
    if gap < 30:
        warnings.append(f"only {gap} days between the two images: little real change is likely")
    return warnings


def preview(bbox, before_date: str, after_date: str, window_days: int = 20,
            search_fn: Callable = s2.search, scl_fn: Callable = s2.read_scl) -> dict:
    """What would be analysed, without downloading the bands. Safe to call before the user confirms."""
    box = validate_bbox(bbox)
    bd, ad = parse_date(before_date, "before date"), parse_date(after_date, "after date")
    if bd >= ad:
        raise AoiError("the before date must be earlier than the after date")
    before = choose_scene(box, bd, window_days, search_fn=search_fn, scl_fn=scl_fn)
    after = choose_scene(box, ad, window_days, search_fn=search_fn, scl_fn=scl_fn)
    wkm, hkm = size_km(box)
    return {"bbox": list(box), "size_km": [round(wkm, 2), round(hkm, 2)],
            "before": describe(before), "after": describe(after), "warnings": check_pair(before, after, box)}


def fetch_pair(bbox, before_date: str, after_date: str, out_dir: str, window_days: int = 20,
               search_fn: Callable = s2.search, scl_fn: Callable = s2.read_scl,
               read_fn: Callable = s2.read_aoi) -> dict:
    """Download the box for both dates into out_dir/before.tif and after.tif (6-band stacks the engine reads)."""
    box = validate_bbox(bbox)
    bd, ad = parse_date(before_date, "before date"), parse_date(after_date, "after date")
    if bd >= ad:
        raise AoiError("the before date must be earlier than the after date")
    os.makedirs(out_dir, exist_ok=True)
    meta: dict = {"bbox": list(box)}
    choices = {}
    for side, target in (("before", bd), ("after", ad)):
        choice = choose_scene(box, target, window_days, search_fn=search_fn, scl_fn=scl_fn)
        sc = choice["scene"]
        refl, scl, transform, crs = read_fn(sc, box)
        s2.write_stack(os.path.join(out_dir, f"{side}.tif"), refl, scl, transform, crs,
                       {"scene": sc.id, "date": sc.date.isoformat(), "baseline": sc.baseline})
        choices[side] = choice
        meta[side] = describe(choice) | {"processing_baseline": sc.baseline, "dn_offset_removed": sc.dn_offset}
    meta["warnings"] = check_pair(choices["before"], choices["after"], box)
    return meta
