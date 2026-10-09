"""Combine every measured result into eval/results.json (served by GET /metrics and the Accuracy page).

python eval/build_results.py

Inputs (all produced by scripts in this repo):
  eval/results/m8_sen1floods11_experiments.json   ml/m8_experiments.py
  eval/results/m8_sen1floods11_india.json         scripts/build_m8_demo.py
  web/public/demos/<id>/summary.json               scripts/export_demo_assets.py (false alarms per km²)
  eval/ablation.json                               eval/ablation.py
  eval/results/oscd_baselines.json                 eval/oscd_baselines.py     -> "oscd" (naive, spectral)
  eval/results/oscd_learned.json                   ml/train_siamunet.py --gate -> "oscd" (learned, default_method)
  eval/results/levir_bit.json                      eval/levir_eval.py         -> "levir"
  eval/results/m8_opera_2026_<event>.json, m8_mpc_<event>.json   eval/m8_opera.py   -> "m8_change"
Keys follow docs/packages/CONTRACTS.md Seam 3. A key is written only when its result file exists: numbers come
from code that ran, never from a placeholder, and `not_measured` lists what is still missing.
"""
import glob
import json
import os
import shutil
import subprocess
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMOS = os.path.join(ROOT, "web", "public", "demos")


def load(p, root=ROOT):
    p = os.path.join(root, p)
    return json.load(open(p)) if os.path.exists(p) else None


def false_alarms(root=ROOT):
    out = []
    for sid in ("season-control", "navi-mumbai-airport", "pune-hinjewadi"):
        s, m = load(f"web/public/demos/{sid}/summary.json", root), load(f"web/public/demos/{sid}/meta.json", root)
        if not s:
            continue
        km2 = s["area_km2"]
        out.append(dict(id=sid, name=m["name"], area_km2=km2, raw=s["raw_detections"], kept=s["after_filter"],
                        raw_per_km2=round(s["raw_detections"] / km2, 1), kept_per_km2=round(s["after_filter"] / km2, 2),
                        note=("Season control: farmland a few months apart (post-monsoon vs summer) where no real "
                              "construction is expected; remaining detections are not ground-verified."
                              if sid == "season-control" else "")))
    return {"scenes": out, "method": "spectral, encroachment preset"}


# Where each OSCD test location is (dataset facts), so a per-location table can say which regions work.
REGION = {"brasilia": "South America", "rio": "South America", "montpellier": "Europe", "norcia": "Europe",
          "saclay_w": "Europe", "valencia": "Europe", "milano": "Europe", "dubai": "Asia (Middle East)",
          "chongqing": "Asia (East)", "lasvegas": "North America"}


def per_location(base, learned):
    """OSCD results per test location (not only pooled), from the per-city scores the evaluations already wrote.

    One tile per location, so no interval here (the pooled results carry the bootstrap). Reports which method wins
    in how many locations and lists the weak ones, so the claim can be "evaluated on N worldwide locations", never
    "works everywhere".
    """
    methods = {k: v.get("per_city", {}) for k, v in base["methods"].items()}
    if learned:
        methods["learned"] = learned["learned"].get("per_city", {})
    cities = sorted(set.intersection(*(set(m) for m in methods.values()))) if methods else []
    rows = {}
    for c in cities:
        row = {"region": REGION.get(c, "unknown")}
        for name, m in methods.items():
            row[name] = {k: m[c][k] for k in ("f1", "precision", "recall", "iou")}
        rows[c] = row
    out = {"locations": rows, "n_locations": len(rows), "metric_note": "per-location scores on the test cities, one tile each"}
    if rows:
        f1 = lambda c, m: rows[c][m]["f1"]  # noqa: E731
        beats = lambda a, b: sum(f1(c, a) > f1(c, b) for c in rows)  # noqa: E731
        s = {"spectral_beats_naive": beats("spectral", "naive")}
        if learned:
            s.update(learned_beats_spectral=beats("learned", "spectral"), learned_beats_naive=beats("learned", "naive"),
                     learned_weak_locations_f1_below_0_25=sorted((c for c in rows if f1(c, "learned") < 0.25), key=lambda c: f1(c, "learned")),
                     learned_best_locations=sorted(rows, key=lambda c: -f1(c, "learned"))[:3])
        out["summary"] = s
        out["claim"] = f"evaluated on {len(rows)} worldwide locations; some work and some do not, see the per-location table"
    return out


def oscd_block(root=ROOT):
    """Seam 3 "oscd": held-out methods with 95% intervals. Present only once the baselines have been run."""
    base, learned = load("eval/results/oscd_baselines.json", root), load("eval/results/oscd_learned.json", root)
    if not base:
        return None
    meta = load("engine/weights/siamunet_oscd.json", root) or {}
    methods = {k: {m: v[m] for m in ("precision", "recall", "f1", "iou")} for k, v in base["methods"].items()}
    if learned:
        methods["learned"] = {m: learned["learned"][m] for m in ("precision", "recall", "f1", "iou")}
    var = load("eval/results/oscd_val_variants.json", root)
    fa = load("eval/results/learned_false_alarms.json", root)
    return {"split": {"train_cities": len(meta.get("trained_on", [])) or None, "val_cities": meta.get("val_cities"),
                      "test_cities": len(base["test_cities"])},
            "methods": methods, "default_method": learned["default_method"] if learned else "spectral",
            "default_rule": "learned only if it beats spectral on the test cities (used once); spectral otherwise",
            "threshold": learned["threshold"] if learned else None, "ece": learned["learned"].get("ece") if learned else None,
            "bootstrap": base["bootstrap"], "learned_trained": bool(learned),
            "per_location": per_location(base, learned),
            **({"validation_variants": var} if var else {}), **({"false_alarms_by_variant": fa} if fa else {})}


def levir_block(root=ROOT):
    r = load("eval/results/levir_bit.json", root)
    if not r:
        return None
    return {"bit": {k: r["bit"][k] for k in ("f1", "iou", "precision", "recall")}, "naive": {k: r["naive"][k] for k in ("f1", "iou")},
            "images": r["images"], "scope": r["scope"], "note": r["note"], "published_bit": r["published_bit"]}


def m8_change_block(root=ROOT):
    pats = ("m8_opera_2026_*.json", "m8_mpc_*.json")
    events = [json.load(open(p)) for pat in pats for p in sorted(glob.glob(os.path.join(root, "eval", "results", pat)))]
    if not events:
        return None
    note = ("scored with frozen parameters; " + ", ".join(sorted({e.get("source", "?") for e in events})))
    return {"events": events, "note": note}


def speed_block(root=ROOT, oscd=None):
    sp = []
    for p in glob.glob(os.path.join(root, "web", "public", "demos", "*", "summary.json")):
        s = json.load(open(p))
        if s.get("mode") == "spectral" and s.get("s_per_km2"):
            sp.append(s["s_per_km2"])
    out = {}
    if sp:
        out["spectral"] = round(sum(sp) / len(sp), 3)
    learned = load("eval/results/oscd_learned.json", root)
    if learned and learned["learned"].get("s_per_km2") is not None:
        out["learned"] = learned["learned"]["s_per_km2"]
    levir = load("eval/results/levir_bit.json", root)
    if levir:
        out["deep"] = levir["s_per_km2"]
    return out or None


def build(root=ROOT) -> dict:
    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=root).stdout.strip()
    res = {"generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "commit": commit, "seed": 0,
           "m8_experiments": load("eval/results/m8_sen1floods11_experiments.json", root),
           "m8_india": load("eval/results/m8_sen1floods11_india.json", root),
           "false_alarms": false_alarms(root),
           "ablation": load("eval/ablation.json", root)}
    for key, block in (("oscd", oscd_block(root)), ("levir", levir_block(root)), ("m8_change", m8_change_block(root)),
                       ("speed_s_per_km2", speed_block(root))):
        if block:
            res[key] = block
    nm = []
    if "oscd" not in res:
        nm.append("Optical change accuracy on OSCD test cities (dataset host blocked in the build environment)")
    elif not res["oscd"]["learned_trained"]:
        nm.append("PyTorch Siamese U-Net on OSCD: training and the test-city decision gate have not been run; "
                  "spectral stays the default")
    if "levir" not in res or res["levir"]["note"] != "reproduced":
        nm.append("BIT on the full LEVIR-CD test split (the published F1 89.31 is quoted, not reproduced"
                  + (f"; we measured {res['levir']['images']} labelled sample tiles" if "levir" in res else "") + ")")
    if not any("OPERA" in e.get("source", "") for e in res.get("m8_change", {}).get("events", [])):
        nm.append("M8 before/after change on NASA OPERA RTC-S1 2026 events (needs Earthdata access, V-M8-2)"
                  + ("; a Planetary Computer event is measured instead" if "m8_change" in res else ""))
    res["not_measured"] = nm
    return res


def main():
    res = build()
    os.makedirs(os.path.join(ROOT, "eval"), exist_ok=True)
    with open(os.path.join(ROOT, "eval", "results.json"), "w") as f:
        json.dump(res, f, indent=1)
    os.makedirs(os.path.join(ROOT, "web", "public", "eval"), exist_ok=True)
    shutil.copy(os.path.join(ROOT, "eval", "results.json"), os.path.join(ROOT, "web", "public", "eval", "results.json"))
    print(json.dumps({k: res[k] for k in res if k in ("oscd", "levir", "m8_change", "speed_s_per_km2", "not_measured")}, indent=1)[:3000])


if __name__ == "__main__":
    main()
