"""Run the FROZEN radar parameters on one flood event and score them (V-M8-2: NASA OPERA RTC-S1 2026; or, with
--source mpc, a Planetary Computer event from before its April 2026 cut-off, fetched by ml/fetch_s1_event.py).

python eval/m8_opera.py --event assam_2026 --after AFTER.tif --before REF1.tif REF2.tif REF3.tif \
       [--labels FLOOD_MASK.tif] [--points CHECKS.geojson] [--dry-after DRY.tif]
  -> eval/results/m8_opera_2026_<event>.json   (--source opera)   or   eval/results/m8_mpc_<event>.json   (--source mpc)

Inputs are 2-band VV/VH dB GeoTIFFs (see engine/s1.py to fetch and convert). Scoring, each optional:
  --labels   a raster flood mask for the event (e.g. from GFM / Copernicus EMS), nonzero = flooded:
             IoU, precision, recall of the new-water mask, pixels outside the label's coverage ignored
  --points   GeoJSON of hand-checked points with a boolean property `flooded`: recall on flooded points,
             false-positive rate on dry points
  --dry-after  a dry-season scene compared against the same reference: every detection is a false alarm,
             reported per km2 (the radar twin of the optical season-control scene)
Parameters come from engine/params_m8.json and are never tuned here; the dB threshold is derived from the
event's own after scene without labels. The script refuses to write a second result for an event unless --force.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

import numpy as np
import rasterio
from rasterio.warp import Resampling, reproject

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from engine import radar, radar_run  # noqa: E402
from eval import metrics  # noqa: E402


def detect(after, before, p, thr=None):
    chip = radar.load_chip(after)
    thr = thr if thr is not None else (p["threshold_db"] if p.get("threshold_db") is not None else radar.event_threshold([chip]))
    ref = radar.load_reference(before, chip)
    mask, drops, vvs, _ = radar.flood_change_mask(chip, ref, thr, change_db=p["change_db"], strict_db=p["strict_db"],
                                                  loose_db=p["loose_db"], min_area_m2=p["min_area_m2"],
                                                  px_area_m2=radar_run._pixel_m2(chip))
    return chip, mask, drops, thr


def single_date(chip, thr, p):
    """The same event or scene mapped without a reference (open water on the after image only)."""
    m, _, _ = radar.flood_mask(chip, thr, strict_db=p["strict_db"], loose_db=p["loose_db"], min_area_m2=p["min_area_m2"],
                               px_area_m2=radar_run._pixel_m2(chip))
    return m


def summarise(mask, chip):
    from scipy.ndimage import label as cc
    return {"polygons": int(cc(mask)[1]), "flooded_km2": round(float(mask.sum() * radar_run._pixel_m2(chip) / 1e6), 2)}


def label_on_grid(path, chip):
    """(flooded, covered) boolean rasters on the chip grid. Pixels the label does not cover are ignored."""
    h, w = chip["vv"].shape
    out = np.full((h, w), -1, np.int16)
    with rasterio.open(path) as s:
        reproject(s.read(1).astype(np.int16), out, src_transform=s.transform, src_crs=s.crs, dst_transform=chip["transform"],
                  dst_crs=chip["crs"], resampling=Resampling.nearest, src_nodata=s.nodata, dst_nodata=-1)
    return out > 0, out >= 0


def score_points(path, chip, mask):
    from pyproj import Transformer
    with open(path) as f:
        pts = json.load(f)["features"]
    to_crs = Transformer.from_crs(4326, chip["crs"], always_xy=True).transform
    hit = {True: [], False: []}
    h, w = mask.shape
    for ft in pts:
        x, y = to_crs(*ft["geometry"]["coordinates"][:2])
        c, r = ~chip["transform"] * (x, y)
        if 0 <= int(r) < h and 0 <= int(c) < w:
            hit[bool(ft["properties"]["flooded"])].append(bool(mask[int(r), int(c)]))
    return {"flooded_points": len(hit[True]), "flooded_detected": int(sum(hit[True])),
            "recall": round(sum(hit[True]) / len(hit[True]), 3) if hit[True] else None,
            "dry_points": len(hit[False]), "dry_flagged": int(sum(hit[False])),
            "false_positive_rate": round(sum(hit[False]) / len(hit[False]), 3) if hit[False] else None}


SOURCES = {"opera": ("m8_opera_2026", "NASA OPERA RTC-S1 (30 m, Earthdata)"),
           "mpc": ("m8_mpc", "Planetary Computer sentinel-1-rtc (10 m, anonymous)")}


def run(event, after, before, labels=None, points=None, dry_after=None, out_dir=os.path.join(ROOT, "eval", "results"),
        force=False, threshold_db=None, source="opera"):
    prefix, source_name = SOURCES[source]
    out = os.path.join(out_dir, f"{prefix}_{event}.json")
    if os.path.exists(out) and not force:
        raise SystemExit(f"{out} exists: this event was already scored. Pass --force to rerun (recorded).")
    p = radar_run.frozen_params()
    chip, mask, drops, thr = detect(after, before, p, threshold_db)
    km2 = float(chip["valid"].sum() * radar_run._pixel_m2(chip) / 1e6)
    res = {"event": event, "source": source_name, "after": os.path.basename(after), "reference_scenes": [os.path.basename(b) for b in before],
           "params": {**p, "threshold_db": round(thr, 2)}, "params_source": "engine/params_m8.json (frozen; not tuned here)",
           "area_km2": round(km2, 2), "flooded_km2_detected": round(float(mask.sum() * radar_run._pixel_m2(chip) / 1e6), 2),
           "dropped": drops, "forced_rerun": bool(force)}
    res["before_after"] = summarise(mask, chip)
    res["single_date"] = summarise(single_date(chip, thr, p), chip)       # what mapping the same event without a reference gives
    if labels:
        gt, covered = label_on_grid(labels, chip)
        v = chip["valid"] & covered
        res["labels"] = {"source": os.path.basename(labels), "covered_km2": round(float(v.sum() * radar_run._pixel_m2(chip) / 1e6), 2),
                         **{k: round(val, 4) for k, val in metrics.scores(*metrics.confusion(mask, gt, v)[:3]).items()}}
    if points:
        res["points"] = {"source": os.path.basename(points), **score_points(points, chip, mask)}
    if dry_after:
        dry_chip, dry_mask, _, _ = detect(dry_after, before, p, thr)       # same threshold: it is an event parameter
        n = summarise(dry_mask, dry_chip)["polygons"]
        sd = summarise(single_date(dry_chip, thr, p), dry_chip)             # single-date on a scene with no flood at all
        res["dry_season_pair"] = {"after": os.path.basename(dry_after), "false_alarm_polygons": n,
                                  "false_alarms_per_km2": round(n / max(km2, 1e-6), 3),
                                  "false_alarm_km2": round(float(dry_mask.sum() * radar_run._pixel_m2(chip) / 1e6), 4),
                                  "single_date_polygons": sd["polygons"], "single_date_per_km2": round(sd["polygons"] / max(km2, 1e-6), 3),
                                  "single_date_km2": sd["flooded_km2"]}
    res["commit"] = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    res["note"] = "open-water flood extent against the stated reference, single event; not a general accuracy claim"
    os.makedirs(out_dir, exist_ok=True)
    with open(out, "w") as f:
        json.dump(res, f, indent=1)
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--event", required=True)
    ap.add_argument("--source", choices=sorted(SOURCES), default="opera", help="which archive the scenes came from")
    ap.add_argument("--after", required=True)
    ap.add_argument("--before", nargs="+", required=True)
    ap.add_argument("--labels")
    ap.add_argument("--points")
    ap.add_argument("--dry-after")
    ap.add_argument("--threshold-db", type=float)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    print(json.dumps(run(a.event, a.after, a.before, a.labels, a.points, a.dry_after, force=a.force, threshold_db=a.threshold_db, source=a.source), indent=1))
