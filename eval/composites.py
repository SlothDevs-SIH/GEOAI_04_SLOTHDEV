"""Do median composites and persistence reduce false alarms on real imagery? (task S3)

python eval/composites.py            ->  eval/composites.json

For each test area, the same pair of dates is analysed four ways:
  single              the clearest scene per date (the default)
  composite3          median of the 3 clearest scenes per date
  persistence2        a change must also appear in a second, later scene
  composite3+persist  both

The season-control area (post-monsoon green crops vs the dry season, no large construction) is the false-alarm
test: fewer detections per km2 there is better, if the real change in the other area is kept. Scenes are cached
under eval/cache/ so reruns are quick. Nothing is tuned here: the numbers are reported as they come out.
"""
import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import rasterio

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from engine import aoi, impact, run, s2  # noqa: E402

CACHE = os.path.join(ROOT, "eval", "cache")
AREAS = {
    "season-control (Saswad farmland)": dict(bbox=[74.000, 18.330, 74.060, 18.380], before="2024-11-01",
                                             after="2025-03-25", preset="encroachment", window=25,
                                             note="different seasons on purpose: crops change, nothing large is built"),
    "pune-hinjewadi (real construction)": dict(bbox=[73.680, 18.560, 73.760, 18.620], before="2019-01-25",
                                               after="2025-02-17", preset="encroachment", window=25,
                                               note="same season, years apart: real urban growth"),
}
VARIANTS = {"single": dict(composite=1, persistence=0), "composite3": dict(composite=3, persistence=0),
            "persistence2": dict(composite=1, persistence=2), "composite3+persistence2": dict(composite=3, persistence=2)}


def cached_read(scene, bbox):
    """s2.read_aoi with an on-disk cache, so each scene over a box is downloaded once."""
    os.makedirs(CACHE, exist_ok=True)
    key = f"{scene.id}_{'_'.join(f'{v:.4f}' for v in bbox)}"
    path = os.path.join(CACHE, key + ".tif")
    if not os.path.exists(path):
        refl, scl, transform, crs = s2.read_aoi(scene, tuple(bbox))
        s2.write_stack(path, refl, scl, transform, crs, {"dn_offset": scene.dn_offset})
    with rasterio.open(path) as src:
        data = src.read()
        scene.dn_offset = int(src.tags().get("dn_offset", 0))
        return data[:5].astype(np.float32) / 10000.0, data[5].astype(np.uint8), src.transform, src.crs


def main():
    impact.worldcover_on_grid = lambda *a, **k: None          # impact numbers are not part of this test
    out = {"generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "areas": {}}
    for name, cfg in AREAS.items():
        print(name, flush=True)
        rows = {}
        for vname, v in VARIANTS.items():
            work = os.path.join(CACHE, "work", name.split()[0], vname)
            meta = aoi.fetch_pair(cfg["bbox"], cfg["before"], cfg["after"], work, cfg["window"], read_fn=cached_read, **v)
            res = run.analyze(os.path.join(work, "before.tif"), os.path.join(work, "after.tif"), cfg["preset"], "spectral",
                              meta["before"]["date"], meta["after"]["date"], extra_after_paths=meta.get("extra_after", []),
                              persistence=v["persistence"])
            s = res.summary
            rows[vname] = {
                "raw_detections": s["raw_detections"], "after_filter": s["after_filter"],
                "changed_ha": round(s["total_area_m2"] / 1e4, 1), "area_km2": s["area_km2"],
                "detections_per_km2": round(s["after_filter"] / s["area_km2"], 2),
                "persistence": s.get("persistence"), "composite_of": meta["before"].get("composite_of"),
                "scenes": {"before": meta["before"]["scene"], "after": meta["after"]["scene"],
                           "extra_after": meta.get("extra_after_dates", [])},
                "warnings": meta["warnings"],
            }
            print(f"   {vname:26s} raw {s['raw_detections']:5d} -> {s['after_filter']:4d} polygons  "
                  f"{rows[vname]['changed_ha']:7.1f} ha  {rows[vname]['detections_per_km2']:6.2f} per km2", flush=True)
        out["areas"][name] = {"note": cfg["note"], "bbox": cfg["bbox"], "before": cfg["before"], "after": cfg["after"],
                              "variants": rows}
    with open(os.path.join(ROOT, "eval", "composites.json"), "w") as f:
        json.dump(out, f, indent=1)
    print("wrote eval/composites.json")


if __name__ == "__main__":
    main()
