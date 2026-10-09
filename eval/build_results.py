"""Combine every measured result into eval/results.json (served by GET /metrics and the Accuracy page).

python eval/build_results.py

Inputs (all produced by scripts in this repo):
  eval/results/m8_sen1floods11_experiments.json   ml/m8_experiments.py
  eval/results/m8_sen1floods11_india.json         scripts/build_m8_demo.py
  web/public/demos/<id>/summary.json               scripts/export_demo_assets.py (false alarms per km²)
"""
import json
import os
import shutil
import subprocess
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMOS = os.path.join(ROOT, "web", "public", "demos")


def load(p):
    p = os.path.join(ROOT, p)
    return json.load(open(p)) if os.path.exists(p) else None


def false_alarms():
    out = []
    for sid in ("season-control", "navi-mumbai-airport", "pune-hinjewadi"):
        s, m = load(f"web/public/demos/{sid}/summary.json"), load(f"web/public/demos/{sid}/meta.json")
        if not s:
            continue
        km2 = s["area_km2"]
        out.append(dict(id=sid, name=m["name"], area_km2=km2, raw=s["raw_detections"], kept=s["after_filter"],
                        raw_per_km2=round(s["raw_detections"] / km2, 1), kept_per_km2=round(s["after_filter"] / km2, 2),
                        note=("Season control: farmland a few months apart (post-monsoon vs summer) where no real "
                              "construction is expected; remaining detections are not ground-verified."
                              if sid == "season-control" else "")))
    return {"scenes": out, "method": "spectral, encroachment preset"}


def main():
    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    res = {"generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "commit": commit,
           "m8_experiments": load("eval/results/m8_sen1floods11_experiments.json"),
           "m8_india": load("eval/results/m8_sen1floods11_india.json"),
           "false_alarms": false_alarms(),
           "not_measured": ["Optical change accuracy on OSCD test cities (dataset host blocked in the build "
                            "environment)", "M8 before/after change on NASA OPERA RTC-S1 2026 events"]}
    os.makedirs(os.path.join(ROOT, "eval"), exist_ok=True)
    with open(os.path.join(ROOT, "eval", "results.json"), "w") as f:
        json.dump(res, f, indent=1)
    os.makedirs(os.path.join(ROOT, "web", "public", "eval"), exist_ok=True)
    shutil.copy(os.path.join(ROOT, "eval", "results.json"), os.path.join(ROOT, "web", "public", "eval", "results.json"))
    print(json.dumps(res["false_alarms"], indent=1))


if __name__ == "__main__":
    main()
