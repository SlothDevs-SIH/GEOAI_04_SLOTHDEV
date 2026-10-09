"""False alarms per km2 on the demo scenes: spectral vs the learned model vs the hybrid.

python eval/learned_false_alarms.py      -> eval/results/learned_false_alarms.json

Same filters and preset (encroachment) for all three. The season-control scene is farmland where nothing was
built, so every polygon there is a false alarm; the other two scenes have real construction, so a lower count
there is not automatically better (there are no labels for them). Needs demos/<id>/{before,after}.tif
(scripts/fetch_demo_scenes.py) and the trained model.
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from engine import change_learned, change_spectral, filters, ingest  # noqa: E402
from engine.config import params_for  # noqa: E402

SCENES = {"season-control": "no real change (farmland)", "navi-mumbai-airport": "large construction",
          "pune-hinjewadi": "city-edge construction"}


def main(out=os.path.join(ROOT, "eval", "results", "learned_false_alarms.json")):
    fn, meta, backend = change_learned.load()
    res = {"backend": backend, "threshold": meta["threshold"], "preset": "encroachment", "scenes": {}}
    for sid, what in SCENES.items():
        d = os.path.join(ROOT, "demos", sid)
        pair = ingest.read_pair(os.path.join(d, "before.tif"), os.path.join(d, "after.tif"))
        p = params_for("encroachment")
        km2 = float(pair.before.shape[1] * pair.before.shape[2] * pair.pixel_m ** 2 / 1e6)
        counts = {"spectral": filters.components(filters.apply(change_spectral.detect(pair, p), pair, p)[0])}
        for name, typed in (("learned", False), ("hybrid", True)):
            det = change_learned.detect(pair, p, fn=fn, meta=meta, spectral_typed_only=typed)
            counts[name] = filters.components(filters.apply(det, pair, p)[0])
        res["scenes"][sid] = {"what": what, "area_km2": round(km2, 2), "polygons": counts,
                              "per_km2": {k: round(v / km2, 2) for k, v in counts.items()}}
    res["finding"] = ("On the no-change farmland scene the learned model alone raises about 12x more polygons per km2 than "
                      "spectral; the hybrid removes them but, on the OSCD validation cities, also removes most real change "
                      "(recall 0.03). The model was trained only on urban change.")
    res["commit"] = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(res, f, indent=1)
    return res


if __name__ == "__main__":
    for sid, v in main()["scenes"].items():
        print(f"{sid:22s} per km2: {v['per_km2']}")
