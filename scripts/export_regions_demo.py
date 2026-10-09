"""Publish regional checks as static demo scenes, so the site shows other parts of India without the API.

python scripts/export_regions_demo.py [name ...]    (run eval/regions.py first: it fetches and caches the scenes)

Each region is analysed again from the cached scenes and written to web/public/demos/<name>/ in the same layout as the
other demo scenes (swipe images, polygons, crops, slider data, exports, summary), and added to index.json with
kind "regional". These are labelled regional CHECKS, not tuned demos: their limits are written into the scene story.
"""
import json
import os
import shutil
import sys

import rasterio

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "eval"))
from composites import CACHE  # noqa: E402
from engine import preview, run  # noqa: E402
from regions import NOTES, REGIONS  # noqa: E402

OUT = os.path.join(ROOT, "web", "public", "demos")
PUBLISH = {
    "delhi-ncr": dict(name="Delhi NCR (Noida): regional check", event="Urban growth, with a known river false alarm"),
    "bengaluru": dict(name="Bengaluru (Whitefield): regional check", event="Fast-growing urban fringe"),
    "guwahati": dict(name="Guwahati, Assam: regional check", event="River sandbar change, not encroachment"),
}


def publish(name):
    cfg, work = REGIONS[name], os.path.join(CACHE, "regions", name)
    res = run.analyze(f"{work}/before.tif", f"{work}/after.tif", "encroachment", "spectral", cfg["before"], cfg["after"])
    with rasterio.open(f"{work}/before.tif") as b, rasterio.open(f"{work}/after.tif") as a:
        bs, as_ = b.tags(), a.tags()
    bdate, adate = bs.get("date", cfg["before"]), as_.get("date", cfg["after"])
    d = os.path.join(OUT, name)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(f"{d}/exports")
    run.write_outputs(res, f"{d}/exports", inputs=[f"{work}/before.tif", f"{work}/after.tif"],
                      title=f"GEOAI 04 change report: {PUBLISH[name]['name']}", permalink=f"/scene/{name}")
    shutil.copy(f"{d}/exports/changes.geojson", f"{d}/changes.geojson")
    info = {"id": name, "name": PUBLISH[name]["name"], "place": cfg["label"], "event": PUBLISH[name]["event"],
            "kind": "regional", "before_date": bdate, "after_date": adate}
    pm = preview.write_scene_files(res, d, info)
    os.replace(f"{d}/changes.geojson", f"{d}/result_filtered.geojson")
    res.raw.to_file(f"{d}/result_raw.geojson", driver="GeoJSON")
    summary = dict(res.summary)
    summary["subtitle"] = f"{cfg['label']} | before {bdate} | after {adate}"
    summary["notes"] = [NOTES.get(name, "")]
    json.dump(summary, open(f"{d}/summary.json", "w"), indent=1, default=str)
    meta = dict(pm, scenes={"before": bs.get("scene", ""), "after": as_.get("scene", "")}, bbox=cfg["bbox"], preset="encroachment",
                story=f"Regional check ({cfg['climate']}). {NOTES.get(name, '')}", demo=True, mode="spectral",
                after_filter=summary["after_filter"], raw_detections=summary["raw_detections"])
    json.dump(meta, open(f"{d}/meta.json", "w"), indent=1)
    meta.pop("corners", None)
    print(f"{name}: {summary['raw_detections']} raw -> {summary['after_filter']} real", flush=True)
    return meta


def main(names):
    index_path = os.path.join(OUT, "index.json")
    index = json.load(open(index_path))
    for name in names or PUBLISH:
        entry = publish(name)
        index = [e for e in index if e["id"] != name] + [entry]
    json.dump(index, open(index_path, "w"), indent=1)
    print("index.json now lists", [e["id"] for e in index])


if __name__ == "__main__":
    main(sys.argv[1:])
