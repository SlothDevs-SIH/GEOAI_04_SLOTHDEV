"""Add the live sensitivity-slider data (sens.bin, sens.json) to the optical demo scenes.

python scripts/export_sensitivity.py [scene-id ...]

Needs the source stacks from scripts/fetch_demo_scenes.py (demos/<id>/before.tif, after.tif). For each scene it runs
the engine exactly as scripts/export_demo_assets.py does, and CHECKS that the result matches the published
web/public/demos/<id>/summary.json (same number of raw detections and real changes). If it does not, nothing is
written: the slider must never show numbers that disagree with the page it sits on.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from engine import impact, run, sensitivity  # noqa: E402
from export_demo_assets import OPTICAL  # noqa: E402


def main(names):
    impact.worldcover_on_grid = lambda *a, **k: None          # the slider does not use the impact layers
    failed = []
    for sid in names or OPTICAL:
        src = os.path.join(ROOT, "demos", sid)
        out = os.path.join(ROOT, "web", "public", "demos", sid)
        meta = json.load(open(os.path.join(src, "meta.json")))
        published = json.load(open(os.path.join(out, "summary.json")))
        res = run.analyze(f"{src}/before.tif", f"{src}/after.tif", OPTICAL[sid]["preset"], "spectral",
                          meta["before"]["date"], meta["after"]["date"])
        got = (res.summary["raw_detections"], res.summary["after_filter"])
        want = (published["raw_detections"], published["after_filter"])
        if got != want:
            print(f"{sid}: MISMATCH engine {got} vs published {want}: not writing slider data", flush=True)
            failed.append(sid)
            continue
        p = res.summary["params"]
        info = sensitivity.write(res, out, p["keep_types"], p["min_area_m2"])
        print(f"{sid}: matches the published result {got}; slider data written "
              f"({info['width']}x{info['height']}, browser mirror gives {info['mirror_after_filter']} at the defaults)", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
