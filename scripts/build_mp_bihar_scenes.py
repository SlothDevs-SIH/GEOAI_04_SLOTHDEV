"""Build Madhya Pradesh (Bhopal) and Bihar (Patna) encroachment demo scenes with full assets.

Generates:
  demos/madhya-pradesh-encroachment/
  demos/bihar-encroachment/
  web/public/demos/madhya-pradesh-encroachment/ (swipe webp, polygons, crops, sensitivity data, exports, variants)
  web/public/demos/bihar-encroachment/
and updates index.json with the requested priority:
  1. madhya-pradesh-encroachment (Encroachment #1 Priority)
  2. assam-flood-2016 (Disaster / Flood #2 Priority)
  3. bihar-encroachment
  4. navi-mumbai-airport
  5. pune-hinjewadi
  6. season-control
  7. delhi-ncr
  8. bengaluru
  9. guwahati
"""
import json
import os
import shutil
import sys

import rasterio

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))

from engine import detectors, run, sensitivity  # noqa: E402
from export_demo_assets import corners_lonlat, crops, snapshot_png, true_color, webp  # noqa: E402

OUT = os.path.join(ROOT, "web", "public", "demos")

NEW_SCENES = {
    "madhya-pradesh-encroachment": {
        "name": "Madhya Pradesh (Bhopal lake & fringe)",
        "place": "Bhopal (Bhojtal catchment & Kolar corridor), Madhya Pradesh",
        "story": "Urban and catchment encroachment into eco-sensitive waterbody buffer and forest fringe. High real-estate sprawl flagged by the National Green Tribunal.",
        "event": "Eco-sensitive lake catchment & urban fringe encroachment",
        "kind": "encroachment",
        "preset": "encroachment",
        "bbox": [77.35, 23.17, 77.45, 23.25],
        "tile": "43QGF",
        "source_cache": "test_mp_bhopal",
        "source": "Sentinel-2 L2A (Copernicus), via the Element84 Earth Search COG bucket",
    },
    "bihar-encroachment": {
        "name": "Bihar (Patna Ganga floodplain)",
        "place": "Patna (Danapur & Ganga riverfront fringe), Bihar",
        "story": "Peri-urban sprawl and construction across river floodplain and sensitive agricultural wetlands along the Ganges corridor.",
        "event": "Floodplain & peri-urban encroachment",
        "kind": "encroachment",
        "preset": "encroachment",
        "bbox": [85.05, 25.58, 85.15, 25.65],
        "tile": "45RUJ",
        "source_cache": "test_bihar_patna",
        "source": "Sentinel-2 L2A (Copernicus), via the Element84 Earth Search COG bucket",
    },
}


def setup_demos_dir(sid, cfg):
    demos_dir = os.path.join(ROOT, "demos", sid)
    os.makedirs(demos_dir, exist_ok=True)
    cache_dir = os.path.join(ROOT, "eval", "cache", cfg["source_cache"])
    shutil.copy(os.path.join(cache_dir, "before.tif"), os.path.join(demos_dir, "before.tif"))
    shutil.copy(os.path.join(cache_dir, "after.tif"), os.path.join(demos_dir, "after.tif"))

    with rasterio.open(os.path.join(demos_dir, "before.tif")) as b, rasterio.open(os.path.join(demos_dir, "after.tif")) as a:
        bt = b.tags()
        at = a.tags()

    meta = {
        "name": sid,
        "place": cfg["place"],
        "story": cfg["story"],
        "bbox": cfg["bbox"],
        "tile": cfg["tile"],
        "preset": cfg["preset"],
        "source": cfg["source"],
        "before": {
            "scene": bt.get("scene", ""),
            "date": bt.get("date", "2019-01-22"),
            "tile_cloud_pct": 0.0,
            "aoi_invalid_pct": 0.0,
            "processing_baseline": bt.get("baseline", "02.11"),
            "dn_offset_removed": 0,
        },
        "after": {
            "scene": at.get("scene", ""),
            "date": at.get("date", "2025-01-25"),
            "tile_cloud_pct": 0.0,
            "aoi_invalid_pct": 0.0,
            "processing_baseline": at.get("baseline", "05.11"),
            "dn_offset_removed": 0,
        },
    }
    with open(os.path.join(demos_dir, "meta.json"), "w") as f:
        json.dump(meta, f, indent=1)
    return meta


def build_scene(sid, cfg):
    m = setup_demos_dir(sid, cfg)
    src = os.path.join(ROOT, "demos", sid)
    d = os.path.join(OUT, sid)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, "exports"), exist_ok=True)

    print(f"Analyzing {sid} (spectral)...", flush=True)
    res = run.analyze(
        f"{src}/before.tif",
        f"{src}/after.tif",
        cfg["preset"],
        "spectral",
        m["before"]["date"],
        m["after"]["date"],
    )

    pair = res.pair
    rgb_b, rgb_a = true_color(pair.before), true_color(pair.after)
    webp(rgb_b, f"{d}/before.webp")
    webp(rgb_a, f"{d}/after.webp")
    h, w = rgb_b.shape[:2]
    corners = corners_lonlat(pair.transform, pair.crs, h, w)

    snap = snapshot_png(rgb_a, res.gdf, pair.transform, pair.crs, f"{d}/exports/snapshot.png")
    run.write_outputs(
        res,
        f"{d}/exports",
        inputs=[f"{src}/before.tif", f"{src}/after.tif"],
        title=f"GEOAI 04 change report: {cfg['name']}",
        snapshot_png=snap,
        permalink=f"/scene/{sid}",
    )
    shutil.copy(f"{d}/exports/changes.geojson", f"{d}/result_filtered.geojson")
    res.raw.to_file(f"{d}/result_raw.geojson", driver="GeoJSON")
    crops(rgb_b, rgb_a, res.gdf, pair.transform, pair.crs, d)

    summary = dict(res.summary)
    summary["subtitle"] = f"{m['place']} | before {m['before']['date']} | after {m['after']['date']}"
    summary["notes"] = [f"Focus: {cfg['story']}"]
    with open(f"{d}/summary.json", "w") as f:
        json.dump(summary, f, indent=1, default=str)

    # Sensitivity slider data
    p = res.summary["params"]
    sensitivity.write(res, d, p["keep_types"], p["min_area_m2"])
    print(f"{sid}: sensitivity data written", flush=True)

    # Precompute variants (learned, hybrid)
    variants = []
    st = detectors.status()
    for mode in ("learned", "hybrid"):
        if not st.get(mode, {}).get("available"):
            continue
        print(f"Analyzing {sid} ({mode})...", flush=True)
        vres = run.analyze(
            f"{src}/before.tif",
            f"{src}/after.tif",
            cfg["preset"],
            mode,
            m["before"]["date"],
            m["after"]["date"],
        )
        vd = os.path.join(d, "variants", mode)
        os.makedirs(vd, exist_ok=True)
        vres.gdf.to_file(f"{vd}/result_filtered.geojson", driver="GeoJSON")
        vres.raw.to_file(f"{vd}/result_raw.geojson", driver="GeoJSON")
        crops(rgb_b, rgb_a, vres.gdf, vres.pair.transform, vres.pair.crs, vd)
        vsummary = dict(vres.summary)
        vsummary["subtitle"] = f"{m['place']} | before {m['before']['date']} | after {m['after']['date']}"
        with open(f"{vd}/summary.json", "w") as f:
            json.dump(vsummary, f, indent=1, default=str)
        variants.append({
            "mode": mode,
            "raw_detections": vsummary["raw_detections"],
            "after_filter": vsummary["after_filter"],
        })

    meta = {
        "id": sid,
        "name": cfg["name"],
        "place": m["place"],
        "event": cfg["event"],
        "kind": cfg["kind"],
        "mode": "spectral",
        "before_date": m["before"]["date"],
        "after_date": m["after"]["date"],
        "before_label": f"Before · Sentinel-2 · {m['before']['date']}",
        "after_label": f"After · Sentinel-2 · {m['after']['date']}",
        "scenes": {"before": m["before"]["scene"], "after": m["after"]["scene"]},
        "source": m["source"],
        "corners": corners,
        "bbox": m["bbox"],
        "preset": cfg["preset"],
        "story": m["story"],
        "demo": True,
        "after_filter": summary["after_filter"],
        "raw_detections": summary["raw_detections"],
    }
    if variants:
        meta["variants"] = variants

    with open(f"{d}/meta.json", "w") as f:
        json.dump(meta, f, indent=1)
    with open(f"{d}/bounds.json", "w") as f:
        json.dump({"corners": corners}, f)

    entry = dict(meta)
    entry.pop("corners", None)
    return entry


def main():
    entries = {}
    for sid, cfg in NEW_SCENES.items():
        entries[sid] = build_scene(sid, cfg)

    index_path = os.path.join(OUT, "index.json")
    old_index = json.load(open(index_path)) if os.path.exists(index_path) else []
    existing_by_id = {e["id"]: e for e in old_index}

    # Desired order:
    # 1. madhya-pradesh-encroachment (Priority 1: Encroachment)
    # 2. assam-flood-2016 (Priority 2: Disaster / Flood)
    # 3. bihar-encroachment (Encroachment)
    # 4. navi-mumbai-airport
    # 5. pune-hinjewadi
    # 6. season-control
    # 7. delhi-ncr
    # 8. bengaluru
    # 9. guwahati
    ordered_ids = [
        "madhya-pradesh-encroachment",
        "assam-flood-2016",
        "bihar-encroachment",
        "navi-mumbai-airport",
        "pune-hinjewadi",
        "season-control",
        "delhi-ncr",
        "bengaluru",
        "guwahati",
    ]

    new_index = []
    for sid in ordered_ids:
        if sid in entries:
            new_index.append(entries[sid])
        elif sid in existing_by_id:
            new_index.append(existing_by_id[sid])

    # Any remaining
    for e in old_index:
        if e["id"] not in ordered_ids:
            new_index.append(e)

    with open(index_path, "w") as f:
        json.dump(new_index, f, indent=1)
    print("Updated index.json order:", [e["id"] for e in new_index])


if __name__ == "__main__":
    main()
