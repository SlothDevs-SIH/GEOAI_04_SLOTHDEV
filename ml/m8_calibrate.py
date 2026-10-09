"""Freeze the radar mode's event-level parameters in engine/params_m8.json.

python ml/m8_calibrate.py --sen1floods11 data/sen1floods11 --region India     # the Assam 2016 record
python ml/m8_calibrate.py CHIP.tif [CHIP.tif ...]                             # any event's after scenes

What is frozen and why:
  * the method parameters (region-growing offsets chosen on the Sen1Floods11 VALID split, change criterion,
    minimum area): fixed before any test event is looked at;
  * NOT the dB threshold. Backscatter level depends on the product (GRD sigma0 vs RTC gamma0) and the event,
    so the threshold is derived per event, without labels, by Otsu on that event's scenes (`threshold_db: null`).
    The value found here is stored only as provenance (`calibration_event`).
Refuses to overwrite a frozen file unless --force, and records a forced refreeze in the file: parameters must
never be tuned on a test event.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from engine import radar  # noqa: E402

PARAMS = os.path.join(ROOT, "engine", "params_m8.json")
EXPERIMENTS = os.path.join(ROOT, "eval", "results", "m8_sen1floods11_experiments.json")


def calibrate(chip_paths, event_name, out=PARAMS, force=False, experiments=EXPERIMENTS) -> dict:
    if os.path.exists(out) and not force:
        raise SystemExit(f"{out} is frozen. Pass --force to refreeze (it is recorded); never tune on a test event.")
    chips = [radar.load_chip(p) for p in chip_paths]
    thr = radar.event_threshold(chips)                                # label-free: radar only
    with open(experiments) as f:
        hyst = json.load(f)["hysteresis"]
    prev = None
    if os.path.exists(out):
        with open(out) as f:
            prev = json.load(f).get("frozen_utc")
    rec = {"method": "hysteresis", "strict_db": hyst["strict_db"], "loose_db": hyst["loose_db"],
           "offsets_chosen_on": hyst["chosen_on"], "change_db": radar.CHANGE_DB,
           "change_db_note": "literature default for radar flood change (about a factor of two in backscatter); not tuned, "
                             "because Sen1Floods11 has no pre-event radar",
           "min_area_m2": radar.MIN_AREA_M2, "median_filter_px": 5, "threshold_db": None,
           "threshold_rule": "per event: Otsu on the speckle-filtered VV of that event's after scenes, no labels",
           "calibration_event": {"name": event_name, "chips": len(chips), "otsu_threshold_db": round(thr, 2)},
           "labels_used": False, "frozen_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "commit": subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True,
                                    cwd=ROOT).stdout.strip(),
           "refrozen_over": prev}
    with open(out, "w") as f:
        json.dump(rec, f, indent=1)
    return rec


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("chips", nargs="*")
    ap.add_argument("--sen1floods11", help="Sen1Floods11 folder (uses its S1Hand chips)")
    ap.add_argument("--region", default="India")
    ap.add_argument("--event", default=None)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    paths = a.chips or sorted(glob.glob(os.path.join(a.sen1floods11 or "", "S1Hand", f"{a.region}_*_S1Hand.tif")))
    if not paths:
        raise SystemExit("no chips given")
    r = calibrate(paths, a.event or (f"Sen1Floods11 {a.region}" if a.sen1floods11 else "custom"), force=a.force)
    print(json.dumps(r["calibration_event"]), "->", PARAMS)
