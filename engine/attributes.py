"""Attribute every polygon: area (local UTM), magnitude, confidence, centroid (WGS84), type, reason,
score, tier, needs_review, review_status. Returns a GeoDataFrame in WGS84."""
from __future__ import annotations

import geopandas as gpd
import numpy as np

from .change_spectral import TYPES

# Severity: score = area_m2 * mean magnitude (0..1). Tuned on the demo scenes (10 m Sentinel-2):
# a 1 ha change at full magnitude scores 10,000. See config for the radar (hectare) tiers.
TIERS = [(20000.0, "critical"), (5000.0, "high"), (1500.0, "medium"), (0.0, "low")]
REVIEW_BAND = (0.5, 0.7)
TYPE_LABEL = {"water_gain": "new water / flooding", "water_loss": "water receded",
              "built_up_gain": "new construction / built-up", "vegetation_loss": "vegetation cleared",
              "vegetation_gain": "vegetation growth", "other": "unexplained change"}


def utm_epsg(lon, lat):
    return (32600 if lat >= 0 else 32700) + int((lon + 180) // 6) + 1


def tier_of(score, tiers=TIERS):
    return next(t for lim, t in tiers if score >= lim)


def _reason(change_type, dmean):
    parts = []
    for k, label, fmt in (("ndbi", "built-up index", "{:+.2f}"), ("ndvi", "vegetation index", "{:+.2f}"),
                          ("ndwi", "water index", "{:+.2f}"),
                          ("swir_blue", "SWIR/blue ratio (paved surfaces are flatter)", "{:+.2f}")):
        if k in dmean and abs(dmean[k]) >= 0.05:
            parts.append(f"{label} {'rose' if dmean[k] > 0 else 'fell'} ({fmt.format(dmean[k])})")
    head = TYPE_LABEL.get(change_type, change_type)
    return f"{head}: " + (", ".join(parts) if parts else "large change in reflectance")


def build(polys, lab, det, type_map, pair, scene_mag_values):
    """polys: [(geometry in pair.crs, component id)]. Returns WGS84 GeoDataFrame sorted by score."""
    if not polys:
        return gpd.GeoDataFrame(columns=["geometry"], geometry="geometry", crs=4326)
    gdf = gpd.GeoDataFrame({"cid": [c for _, c in polys]}, geometry=[g for g, _ in polys], crs=pair.crs)
    if gdf.crs.is_projected:
        metric = gdf
    else:
        c = gdf.to_crs(4326).union_all().centroid
        metric = gdf.to_crs(utm_epsg(c.x, c.y))
    wgs = gdf.to_crs(4326)
    sorted_mag = np.sort(scene_mag_values)
    rows = []
    for (geom, cid), gm, gw in zip(polys, metric.geometry, wgs.geometry):
        m = lab == cid
        mag = float(det["magnitude"][m].mean())
        codes = type_map[m]
        codes = codes[codes > 0]
        ctype = TYPES[int(np.bincount(codes).argmax())] if codes.size else "other"
        dmean = {k: float(v[m].mean()) for k, v in det["deltas"].items()}
        conf = float(np.searchsorted(sorted_mag, mag) / max(len(sorted_mag), 1))
        area = float(gm.area)
        score = area * mag
        rows.append(dict(
            area_m2=round(area, 1), area_ha=round(area / 1e4, 3), magnitude=round(mag, 3),
            confidence=round(conf, 3), needs_review=bool(REVIEW_BAND[0] <= conf < REVIEW_BAND[1]),
            centroid_lat=round(gw.centroid.y, 6), centroid_lon=round(gw.centroid.x, 6),
            change_type=ctype, reason=_reason(ctype, dmean), score=round(score, 1), tier=tier_of(score),
            review_status="pending", **{f"d_{k}": round(v, 3) for k, v in dmean.items()},
            cid=cid, geometry=gw))
    out = gpd.GeoDataFrame(rows, geometry="geometry", crs=4326).sort_values("score", ascending=False)
    out.insert(0, "id", range(1, len(out) + 1))
    return out.reset_index(drop=True)
