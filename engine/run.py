"""Run the change pipeline end to end.

python -m engine.run BEFORE.tif AFTER.tif --out out/ [--preset encroachment] [--mode auto]
python -m engine.run --mode radar AFTER_S1.tif --out out/          # M8, Sentinel-1 VV/VH in dB

Writes changes.geojson (WGS84), changes.gpkg (local UTM), changes.csv + changes.kml (field pack),
summary.json, audit.json and report.pdf.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import asdict, dataclass, replace

import geopandas as gpd
import numpy as np
from scipy.ndimage import label

from . import attributes, detectors, export, filters, impact, ingest, quality, vectorise
from .config import params_for

LIMITS_OPTICAL = ["Optical imagery cannot see through cloud; flagged areas with cloud are removed, not analysed.",
                  "Change type comes from spectral index rules (no training); check critical changes on the ground.",
                  "10 m pixels cannot resolve single small buildings or people.",
                  "Rivers, sandbars and lake edges move between dates and can be flagged as change; bare soil in dry "
                  "regions can look like construction. Check flagged areas near water."]


@dataclass
class Result:
    pair: object
    det: dict
    mask: np.ndarray
    lab: np.ndarray
    gdf: gpd.GeoDataFrame
    raw: gpd.GeoDataFrame
    summary: dict


DEEP_MIN_AREA_M2 = 20.0      # smallest change kept in deep mode (very-high-resolution imagery)

MODE_LIMITS = {
    "learned": ["The learned model was trained on OSCD urban change (Sentinel-2, 2015 to 2018). On farmland with no real "
                "construction it can raise many more false alarms than the spectral rules; check results on the ground."],
    "hybrid": ["Hybrid: the learned model proposes changes and the spectral rules must also name a real change type. This "
               "removes most farmland false alarms but also removes some real change."],
    "deep": ["Deep mode (BIT) detects building change in very-high-resolution RGB (about 0.5 m) only; it gives no "
             "land-cover types, and impact layers are not computed."],
}


def choose_mode(pair, mode="auto"):
    if mode != "auto":
        if mode not in detectors.MODES:
            raise ValueError(f"unknown mode '{mode}'; choose one of {', '.join(detectors.MODES)}")
        return mode
    if "nir" in pair.bands and pair.pixel_m >= 5:
        return "spectral"
    if pair.bands == ("red", "green", "blue") and pair.pixel_m <= 2:
        return "deep"
    raise ValueError(f"no mode fits this input ({len(pair.bands)} bands at {pair.pixel_m:.1f} m): spectral "
                     "needs >= 4 bands incl. NIR at >= 5 m; deep needs RGB at <= 2 m")


def raw_layer(candidate, transform, crs, cap=2000):
    """The unfiltered detections as polygons (largest `cap` blobs) for the raw/filtered toggle."""
    lab, n = label(candidate)
    if not n:
        return gpd.GeoDataFrame(columns=["geometry"], geometry="geometry", crs=4326)
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    keep = np.argsort(sizes)[::-1][:cap]
    keep = keep[sizes[keep] > 0]
    m = np.isin(lab, keep)
    polys, _ = vectorise.polygons(m, transform)
    g = gpd.GeoDataFrame(geometry=[p for p, _ in polys], crs=crs).to_crs(4326)
    return g


def analyze(before_path, after_path, preset="general", mode="auto", before_date=None, after_date=None,
            worldcover_cache=None, rules=None, params=None, extra_after_paths=(), persistence=0):
    """Run the optical pipeline.

    `extra_after_paths` + `persistence` (k): keep a change only if it is also detected in at least k-1 of the
    extra later scenes (see engine/persistence.py). Off by default.
    """
    t0 = time.time()
    quality.check_dates(before_date, after_date)
    p = params or params_for(preset)
    pair = ingest.read_pair(before_path, after_path)
    mode = choose_mode(pair, mode)
    if mode == "deep" and p.min_area_m2 > DEEP_MIN_AREA_M2:
        # the presets' minimum areas are meant for 10 m pixels (300 m2 = 3 pixels); at 0.5 m that removes whole houses
        p = replace(p, min_area_m2=DEEP_MIN_AREA_M2)
    det = detectors.detect(mode, pair, p)          # raises ModeUnavailable, with the reason, when a model cannot run
    raw_candidate = det["candidate"]          # the raw layer always shows the single-scene detections
    persist_note = None
    if persistence and extra_after_paths:
        from . import persistence as pers
        masks = [det["candidate"]]
        for extra in extra_after_paths:
            masks.append(detectors.detect(mode, ingest.read_pair(before_path, extra), p)["candidate"])
        k = min(int(persistence), len(masks))
        single = det["candidate"]
        det = {**det, "candidate": pers.persistent(masks, k) & single}
        persist_note = {"k": k, "scenes": len(masks), "removed_px": int(single.sum() - det["candidate"].sum()),
                        "raw_blobs_single_scene": filters.components(single)}
    mask, tmap, drops, raw_blobs = filters.apply(det, pair, p, **({"rules": rules} if rules else {}))
    if persist_note:
        drops = {"persistence": persist_note["removed_px"], **drops}
        raw_blobs = persist_note["raw_blobs_single_scene"]    # the raw count stays the single-scene detections
    polys, lab = vectorise.polygons(mask, pair.transform)
    gdf = attributes.build(polys, lab, det, tmap, pair, det["magnitude"][det["valid"]])
    wc = impact.worldcover_on_grid(mask.shape, pair.transform, pair.crs, worldcover_cache) if pair.pixel_m >= 5 else None
    imp = impact.compute(gdf, lab, pair.transform, pair.crs, mask.shape, wc, before_date)
    q, warnings = quality.flags(pair, before_date, after_date)
    h, w = mask.shape
    area_km2 = h * w * pair.pixel_m ** 2 / 1e6
    runtime = time.time() - t0
    summary = dict(
        mode=mode, preset=preset, raw_detections=raw_blobs, after_filter=int(len(gdf)), dropped=drops,
        total_area_m2=round(float(gdf["area_m2"].sum()), 1) if len(gdf) else 0.0,
        by_tier={t: int((gdf["tier"] == t).sum()) for t in ("critical", "high", "medium", "low")} if len(gdf) else {},
        by_type=gdf["change_type"].value_counts().to_dict() if len(gdf) else {},
        runtime_s=round(runtime, 2), area_km2=round(area_km2, 2), s_per_km2=round(runtime / area_km2, 3),
        change_threshold=round(det["threshold"], 4), impact=imp, quality=q, warnings=warnings,
        persistence=persist_note,
        sources=["Copernicus Sentinel-2 L2A (ESA), via the Element84 Earth Search COG bucket"] if mode != "deep"
        else ["Very-high-resolution RGB imagery supplied by the user"],
        limits=LIMITS_OPTICAL + MODE_LIMITS.get(mode, []), params=asdict(p))
    raw = raw_layer(raw_candidate, pair.transform, pair.crs)
    return Result(pair, det, mask, lab, gdf, raw, summary)


def write_outputs(res: Result, out_dir, inputs=(), title="GEOAI 04 change report", permalink=None,
                  snapshot_png=None):
    os.makedirs(out_dir, exist_ok=True)
    gdf = res.gdf
    if len(gdf):
        c = gdf.union_all().centroid
        epsg = attributes.utm_epsg(c.x, c.y)
        export.geojson(gdf, f"{out_dir}/changes.geojson")
        export.gpkg(gdf, f"{out_dir}/changes.gpkg", epsg)
        export.csv(gdf, f"{out_dir}/changes.csv")
        export.kml(gdf, f"{out_dir}/changes.kml", title)
    else:
        with open(f"{out_dir}/changes.geojson", "w") as f:
            json.dump({"type": "FeatureCollection", "features": []}, f)
    with open(f"{out_dir}/summary.json", "w") as f:
        json.dump(res.summary, f, indent=1, default=str)
    export.audit(f"{out_dir}/audit.json", inputs, res.summary.get("params"), res.summary)
    from . import report
    report.build(f"{out_dir}/report.pdf", title, res.summary, gdf, snapshot_png, permalink,
                 res.summary.get("limits"))
    return out_dir


def run_radar(after_path, out_dir, threshold_db=None):
    from . import radar
    chip = radar.load_chip(after_path)
    thr = threshold_db if threshold_db is not None else radar.event_threshold([chip])
    mask, drops, vvs = radar.flood_mask(chip, thr)
    feats = radar.polygons(mask, vvs, thr, chip["transform"], chip["crs"])
    os.makedirs(out_dir, exist_ok=True)
    fc = {"type": "FeatureCollection", "features": [dict(type="Feature", **f) for f in feats]}
    with open(f"{out_dir}/changes.geojson", "w") as f:
        json.dump(fc, f)
    summary = {"mode": "radar", "after_filter": len(feats), "threshold_db": round(thr, 2), "dropped": drops,
               "flooded_ha": round(sum(f["properties"]["area_ha"] for f in feats), 2)}
    with open(f"{out_dir}/summary.json", "w") as f:
        json.dump(summary, f, indent=1)
    return summary


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("images", nargs="+", help="BEFORE AFTER [MORE_AFTER ...] (or one Sentinel-1 file with --mode radar)")
    ap.add_argument("--persistence", type=int, default=0,
                    help="keep a change only if found in this many of the later images (needs MORE_AFTER images)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--mode", default="auto", choices=["auto", "spectral", "radar"])
    ap.add_argument("--preset", default="general", choices=["general", "encroachment", "flood", "deforestation"])
    ap.add_argument("--before-date")
    ap.add_argument("--after-date")
    a = ap.parse_args(argv)
    if a.mode == "radar":
        print(json.dumps(run_radar(a.images[-1], a.out), indent=1))
        return
    if len(a.images) < 2:
        ap.error("spectral mode needs BEFORE and AFTER")
    if a.persistence and len(a.images) < 3:
        ap.error("--persistence needs at least one more later image after BEFORE AFTER")
    res = analyze(a.images[0], a.images[1], a.preset, a.mode, a.before_date, a.after_date,
                  extra_after_paths=a.images[2:], persistence=a.persistence)
    write_outputs(res, a.out, inputs=a.images)
    s = res.summary
    print(json.dumps({k: s[k] for k in ("mode", "raw_detections", "after_filter", "dropped", "by_tier",
                                        "by_type", "impact", "warnings", "runtime_s")}, indent=1, default=str))


if __name__ == "__main__":
    main()
