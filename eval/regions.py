"""Run the whole pipeline on areas across India and keep a picture of each, for visual checking (task S9).

python eval/regions.py [name ...]   ->  eval/regions.json and docs/img/qa_region_<name>.jpg

This is NOT an accuracy measurement: there are no labels. It shows how many changes are found, how much area,
and whether the polygons sit on real change when you look at the picture. Dates are in the dry season for both
years, so crops do not dominate. Scenes are cached under eval/cache/.
"""
import json
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "eval"))
from composites import CACHE, cached_read  # noqa: E402
from engine import aoi, impact, preview, run  # noqa: E402
from qa_overlay import draw_panel  # noqa: E402

REGIONS = {
    "delhi-ncr": dict(label="Delhi NCR (Noida)", climate="semi-arid, dense urban growth",
                      bbox=[77.31, 28.50, 77.39, 28.57], before="2019-01-20", after="2025-01-20"),
    "jaipur": dict(label="Jaipur edge, Rajasthan", climate="arid",
                   bbox=[75.72, 26.78, 75.80, 26.85], before="2019-01-20", after="2025-01-20"),
    "chennai": dict(label="Chennai OMR coast", climate="tropical coastal",
                    bbox=[80.20, 12.88, 80.27, 12.95], before="2019-02-01", after="2025-02-01"),
    "kochi": dict(label="Kochi, Kerala", climate="humid, heavy vegetation",
                  bbox=[76.30, 9.97, 76.37, 10.03], before="2019-02-01", after="2025-02-01"),
    "guwahati": dict(label="Guwahati, Assam", climate="humid, river valley",
                     bbox=[91.70, 26.12, 91.78, 26.19], before="2019-01-15", after="2025-01-15"),
    "bengaluru": dict(label="Bengaluru (Whitefield)", climate="tropical plateau, urban growth",
                      bbox=[77.72, 12.95, 77.80, 13.02], before="2019-02-01", after="2025-02-01"),
}


# Human review of each picture (docs/img/qa_region_<name>.jpg), 9 Oct 2026. Edit when the code or the pictures change.
NOTES = {
    "delhi-ncr": "Mixed. New development and the landfill edge look real, but a long strip along the Yamuna riverbed is "
                 "flagged as built-up gain (a moving river channel and sandbars, not construction).",
    "jaipur": "Mostly scattered small detections in an arid scene; a few clusters on warehouse and industrial areas look real. "
              "Bare soil can look like construction, and thin haze in the after image adds some noise.",
    "chennai": "Sparse and plausible: small detections on new buildings; water-loss polygons sit on filled or drained ponds. "
               "The large wetland change in the north is mostly not flagged.",
    "kochi": "Conservative in dense humid vegetation: few detections, mostly on construction sites and earthworks.",
    "guwahati": "The big water-loss polygons trace the Brahmaputra sandbar: real river change, but not encroachment. "
                "Haze over the hills produced few false alarms. Urban detections are tiny and sparse.",
    "bengaluru": "Plausible for a fast-growing urban fringe: clusters on new buildings and earthworks, plus many small "
                 "detections that are partly noise.",
}


def main(names):
    impact.worldcover_on_grid = lambda *a, **k: None
    out_path = os.path.join(ROOT, "eval", "regions.json")
    out = json.load(open(out_path)) if os.path.exists(out_path) else {"regions": {}}
    out["generated_utc"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for name in names or REGIONS:
        cfg = REGIONS[name]
        print(name, flush=True)
        work = os.path.join(CACHE, "regions", name)
        try:
            meta = aoi.fetch_pair(cfg["bbox"], cfg["before"], cfg["after"], work, 25, read_fn=cached_read)
            res = run.analyze(f"{work}/before.tif", f"{work}/after.tif", "encroachment", "spectral",
                              meta["before"]["date"], meta["after"]["date"])
            run.write_outputs(res, work, inputs=[f"{work}/before.tif", f"{work}/after.tif"])
            preview.write_scene_files(res, work, {"id": name, "before_date": meta["before"]["date"],
                                                  "after_date": meta["after"]["date"]})
            img = os.path.join(ROOT, "docs", "img", f"qa_region_{name}.jpg")
            tiers = draw_panel(work, img)
            s = res.summary
            out["regions"][name] = {
                "label": cfg["label"], "climate": cfg["climate"], "bbox": cfg["bbox"],
                "before": meta["before"], "after": meta["after"], "warnings": meta["warnings"],
                "raw_detections": s["raw_detections"], "after_filter": s["after_filter"],
                "changed_ha": round(s["total_area_m2"] / 1e4, 1), "area_km2": s["area_km2"],
                "by_type": s["by_type"], "by_tier": tiers, "runtime_s": s["runtime_s"],
                "picture": f"docs/img/qa_region_{name}.jpg", "reviewed_by_eye": NOTES.get(name),
            }
            r = out["regions"][name]
            print(f"   raw {r['raw_detections']} -> {r['after_filter']} polygons, {r['changed_ha']} ha in {r['area_km2']} km2, "
                  f"types {r['by_type']}", flush=True)
        except Exception as exc:  # keep going: one region failing must not hide the others
            out["regions"][name] = {"label": cfg["label"], "error": f"{type(exc).__name__}: {exc}"}
            print("   FAILED:", exc, flush=True)
        with open(out_path, "w") as f:
            json.dump(out, f, indent=1)
    print("wrote eval/regions.json")


if __name__ == "__main__":
    main(sys.argv[1:])
