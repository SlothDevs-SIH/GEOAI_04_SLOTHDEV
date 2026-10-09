"""Precompute the learned and hybrid detector results for the optical demo scenes, so the web app can
offer a detector switch with no server (static-first).

python scripts/export_detector_variants.py

Needs onnxruntime and the committed weights in engine/weights/. For each scene in demos/<id>/ writes
web/public/demos/<id>/variants/<mode>/{result_filtered.geojson, result_raw.geojson, summary.json, crops/}
for mode in learned, hybrid, and adds a "variants" list to web/public/demos/<id>/meta.json and index.json.
The spectral result stays the default and is not touched.
"""
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from engine import detectors, run  # noqa: E402
from export_demo_assets import OPTICAL, OUT, crops, true_color  # noqa: E402

MODES = ("learned", "hybrid")


def main():
    st = detectors.status()
    missing = [m for m in MODES if not st[m].get("available")]
    if missing:
        sys.exit(f"detector(s) not available: {missing}: {[st[m].get('reason') for m in missing]}")
    index_path = os.path.join(OUT, "index.json")
    index = json.load(open(index_path))
    for sid, cfg in OPTICAL.items():
        src = os.path.join(ROOT, "demos", sid)
        m = json.load(open(f"{src}/meta.json"))
        found = []
        for mode in MODES:
            res = run.analyze(f"{src}/before.tif", f"{src}/after.tif", cfg["preset"], mode,
                              m["before"]["date"], m["after"]["date"], worldcover_cache=f"{src}/worldcover.tif")
            d = os.path.join(OUT, sid, "variants", mode)
            shutil.rmtree(d, ignore_errors=True)
            os.makedirs(d, exist_ok=True)
            res.gdf.to_file(f"{d}/result_filtered.geojson", driver="GeoJSON")
            res.raw.to_file(f"{d}/result_raw.geojson", driver="GeoJSON")
            pair = res.pair
            crops(true_color(pair.before), true_color(pair.after), res.gdf, pair.transform, pair.crs, d)
            summary = dict(res.summary)
            summary["subtitle"] = f"{m['place']} | before {m['before']['date']} | after {m['after']['date']}"
            json.dump(summary, open(f"{d}/summary.json", "w"), indent=1, default=str)
            found.append(dict(mode=mode, raw_detections=summary["raw_detections"], after_filter=summary["after_filter"]))
            print(f"{sid:22s} {mode:8s} {summary['raw_detections']:>6} raw -> {summary['after_filter']:>4} real")
        meta_path = os.path.join(OUT, sid, "meta.json")
        meta = json.load(open(meta_path))
        meta["variants"] = found
        json.dump(meta, open(meta_path, "w"), indent=1)
        for e in index:
            if e["id"] == sid:
                e["variants"] = found
    json.dump(index, open(index_path, "w"), indent=1)


if __name__ == "__main__":
    main()
