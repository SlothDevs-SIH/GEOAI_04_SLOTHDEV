"""Radar runner (Seam 2): Sentinel-1 flood mapping, single-date or before/after, with the standard outputs.

    from engine import radar_run
    radar_run.run(before, after, out_dir, preset="flood", **overrides) -> summary dict (Seam 5 keys)

  before  None (single-date: open water on the after image only), one file, or a list of dry-season files
          (per-pixel median). Files are 2-band GeoTIFFs: VV and VH in dB (see engine/s1.py to fetch them).
  after   the event scene.

Writes changes.geojson, changes.gpkg, changes.csv, changes.kml, summary.json, audit.json and report.pdf with
the helpers in engine/export.py and engine/report.py. Method parameters are frozen in engine/params_m8.json;
the dB threshold is derived per event without labels (Otsu on the after scene) unless `threshold_db` is given.
"""
from __future__ import annotations

import json
import os
import time

import geopandas as gpd
import numpy as np
from scipy.ndimage import label
from shapely.geometry import shape

from . import export, radar, report
from .attributes import utm_epsg

PARAMS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "params_m8.json")
LIMITS = ["Open-water flood extent estimate: flooded crops, vegetation and streets can look bright on radar and may "
          "be missed.",
          "Radar sees through cloud, but wet soil, wind-roughened water and radar shadow can still cause errors; "
          "check critical polygons on the ground."]
COLUMNS = ["id", "tier", "change_type", "area_m2", "area_ha", "magnitude", "confidence", "needs_review",
           "centroid_lat", "centroid_lon", "reason", "score", "review_status"]


def frozen_params(path=PARAMS_PATH) -> dict:
    """Frozen method parameters; falls back to the module defaults if the file is missing."""
    base = {"strict_db": radar.STRICT_DB, "loose_db": radar.LOOSE_DB, "change_db": radar.CHANGE_DB,
            "min_area_m2": radar.MIN_AREA_M2, "threshold_db": None}
    if os.path.exists(path):
        with open(path) as f:
            base.update({k: v for k, v in json.load(f).items() if k in base})
    return base


def _pixel_m2(chip):
    t = chip["transform"]
    return abs(t.a * t.e) if chip["crs"] is not None and chip["crs"].is_projected else 100.0   # Sentinel-1 chips are 10 m


def _frame(feats, with_ref):
    rows = []
    for f in feats:
        p = f["properties"]
        mag = float(np.clip((-p["drop_db"] if with_ref else p["depth_db"]) / 6.0, 0, 1))
        rows.append({**{k: p[k] for k in ("id", "tier", "change_type", "area_m2", "area_ha", "confidence", "needs_review",
                                           "centroid_lat", "centroid_lon", "reason", "mean_vv_db")},
                     "magnitude": round(mag, 3), "score": round(p["area_m2"] * mag, 1), "review_status": "pending",
                     **({"mean_ref_vv_db": p["mean_ref_vv_db"], "drop_db": p["drop_db"]} if with_ref else {}),
                     "geometry": shape(f["geometry"])})
    if not rows:
        return gpd.GeoDataFrame(columns=COLUMNS + ["geometry"], geometry="geometry", crs=4326)
    return gpd.GeoDataFrame(rows, geometry="geometry", crs=4326)


def run(before, after, out_dir, preset="flood", **overrides) -> dict:
    t0 = time.time()
    p = {**frozen_params(), **overrides}
    chip = radar.load_chip(after)
    if not chip["valid"].any():
        raise ValueError("the after scene has no valid pixels")
    thr = float(p["threshold_db"]) if p.get("threshold_db") is not None else radar.event_threshold([chip])
    kw = dict(strict_db=p["strict_db"], loose_db=p["loose_db"], min_area_m2=p["min_area_m2"],
              px_area_m2=_pixel_m2(chip))
    warnings = []
    ref = ref_s = None
    if before:
        ref = radar.load_reference(before, chip)
        covered = float((ref["valid"] & chip["valid"]).sum() / chip["valid"].sum())
        if covered < 0.5:
            warnings.append(f"the reference covers only {covered:.0%} of the scene: the rest is dropped as 'no_reference'")
        mask, drops, vvs, ref_s = radar.flood_change_mask(chip, ref, thr, change_db=p["change_db"], **kw)
        mode_txt = f"before/after: new water against a dry-season reference of {ref['n_scenes']} scene(s)"
    else:
        mask, drops, vvs = radar.flood_mask(chip, thr, **kw)
        mode_txt = "single date: open water on the after image only"
        warnings.append("single-date mode: no before reference, so dark surfaces that are always dark can be reported")
    feats = radar.polygons(mask, vvs, thr, chip["transform"], chip["crs"], ref_s)
    gdf = _frame(feats, ref is not None)
    naive = radar.naive_mask(chip)
    km2 = float(chip["valid"].sum() * _pixel_m2(chip) / 1e6)
    summary = dict(
        mode="radar", preset=preset, raw_detections=int(label(naive)[1]), after_filter=int(len(gdf)), dropped=drops,
        total_area_m2=round(float(gdf["area_m2"].sum()), 1) if len(gdf) else 0.0,
        by_tier={t: int((gdf["tier"] == t).sum()) for t in ("critical", "high", "medium", "low")} if len(gdf) else {},
        by_type={"water_gain": int(len(gdf))} if len(gdf) else {}, area_km2=round(km2, 2),
        change_threshold=round(thr, 2), threshold_db=round(thr, 2), variant="before_after" if ref is not None else "single_date",
        impact={"changed_ha": round(float(gdf["area_ha"].sum()), 2) if len(gdf) else 0.0, "cropland_ha": None,
                "built_up_ha": None, "buildings": None, "road_segments": None, "sources": [],
                "notes": ["Impact layers are not computed in the radar runner: shown as unknown, not zero"]},
        quality={"pixel_m": round(float(_pixel_m2(chip) ** 0.5), 1), "reference_scenes": ref["n_scenes"] if ref else 0,
                 "valid_fraction": round(float(chip["valid"].mean()), 3)},
        warnings=warnings, subtitle=mode_txt,
        sources=["Copernicus Sentinel-1 (ESA), VV backscatter in dB", "JRC Global Surface Water (permanent water), when supplied"],
        limits=LIMITS, params={**p, "threshold_db": round(thr, 2), "method": "hysteresis"})
    summary["runtime_s"] = round(time.time() - t0, 2)
    summary["s_per_km2"] = round(summary["runtime_s"] / max(km2, 1e-6), 3)
    os.makedirs(out_dir, exist_ok=True)
    if len(gdf):
        c = gdf.union_all().centroid
        export.geojson(gdf, f"{out_dir}/changes.geojson")
        export.gpkg(gdf, f"{out_dir}/changes.gpkg", utm_epsg(c.x, c.y))
        export.csv(gdf, f"{out_dir}/changes.csv")
        export.kml(gdf, f"{out_dir}/changes.kml", "GEOAI 04 radar flood")
    else:
        with open(f"{out_dir}/changes.geojson", "w") as f:
            json.dump({"type": "FeatureCollection", "features": []}, f)
    with open(f"{out_dir}/summary.json", "w") as f:
        json.dump(summary, f, indent=1, default=str)
    inputs = [after] + ([before] if isinstance(before, str) else list(before or []))
    export.audit(f"{out_dir}/audit.json", inputs, summary["params"], summary)
    report.build(f"{out_dir}/report.pdf", "GEOAI 04 radar flood report", summary, gdf, None, None, LIMITS)
    return summary
