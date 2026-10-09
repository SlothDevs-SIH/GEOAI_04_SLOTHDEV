"""Ablation of the false-alarm rules on the three optical demo scenes (BACKEND_PLAN §12).

python eval/ablation.py            -> eval/ablation.json

For each scene the change detector runs once; then the filter chain is re-applied
  * cumulatively (no rules, +cloud, +seasonal, +preset, +speckle, +min_area), and
  * leaving one rule out of the full chain,
and the number of reported change polygons is counted. On the season-control scene nothing real
changed, so every polygon there is a false alarm: that column is the false-alarm rate per km².
Source stacks come from scripts/fetch_demo_scenes.py (demos/<id>/before.tif, after.tif).
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from engine import change_spectral, filters, ingest  # noqa: E402
from engine.config import params_for  # noqa: E402

RULES = ("cloud", "seasonal", "preset", "speckle", "min_area")
SCENES = {"season-control": "encroachment", "navi-mumbai-airport": "encroachment", "pune-hinjewadi": "encroachment"}


def scene(sid, preset):
    d = os.path.join(ROOT, "demos", sid)
    pair = ingest.read_pair(os.path.join(d, "before.tif"), os.path.join(d, "after.tif"))
    p = params_for(preset)
    det = change_spectral.detect(pair, p)
    km2 = det["valid"].sum() * pair.pixel_m ** 2 / 1e6

    def count(rules):
        mask, *_ = filters.apply(det, pair, p, rules=rules)
        return filters.components(mask)

    cumulative = [{"rules": list(RULES[:i]), "added": RULES[i - 1] if i else None, "polygons": count(RULES[:i])}
                  for i in range(len(RULES) + 1)]
    full = cumulative[-1]["polygons"]
    leave_one_out = [{"without": r, "polygons": count(tuple(x for x in RULES if x != r)),
                      "extra_vs_full": count(tuple(x for x in RULES if x != r)) - full} for r in RULES]
    for c in cumulative:
        c["per_km2"] = round(c["polygons"] / km2, 2)
    return {"preset": preset, "valid_km2": round(float(km2), 2), "cumulative": cumulative,
            "leave_one_out": leave_one_out, "no_change_scene": sid == "season-control"}


def main():
    out = {"what": "Polygons reported as each false-alarm rule is added, and with each rule left out",
           "scenes": {}}
    for sid, preset in SCENES.items():
        if not os.path.exists(os.path.join(ROOT, "demos", sid, "after.tif")):
            print(f"skip {sid}: run scripts/fetch_demo_scenes.py first")
            continue
        out["scenes"][sid] = scene(sid, preset)
        c = out["scenes"][sid]["cumulative"]
        print(sid, " -> ".join(f"{x['added'] or 'none'}:{x['polygons']}" for x in c))
    p = os.path.join(ROOT, "eval", "ablation.json")
    with open(p, "w") as f:
        json.dump(out, f, indent=1)
    print("wrote", p)


if __name__ == "__main__":
    main()
