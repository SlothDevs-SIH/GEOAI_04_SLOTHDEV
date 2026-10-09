"""Fetch one flood event for the radar before/after test: Planetary Computer (no account) or NASA OPERA (Earthdata token).

python ml/fetch_s1_event.py --bbox 91.7 26.1 91.9 26.3 --event-date 2024-07-05 --out data/s1_events/assam_2024

Writes into --out:
  after.tif        the event scene: first acquisition on or after --event-date
  ref1..ref3.tif   the three closest dry-season scenes before it, SAME relative orbit and direction
  dry_after.tif    a fourth, older dry-season scene: compared against the references it should show no new
                   water, so every detection on it is a false alarm
  meta.json        scene ids, dates, orbit: what the result is based on
All are 2-band (VV, VH) dB GeoTIFFs that `engine.radar.load_chip` reads. Then score it:
  python eval/m8_opera.py --source mpc --event assam_2024 --after data/s1_events/assam_2024/after.tif \
      --before data/s1_events/assam_2024/ref1.tif data/s1_events/assam_2024/ref2.tif data/s1_events/assam_2024/ref3.tif \
      --dry-after data/s1_events/assam_2024/dry_after.tif

Planetary Computer stopped ingesting on 17 Apr 2026, so use an event before that, or --source opera for 2026
(OPERA scenes are 30 m bursts: each is downloaded, a few MB per file, and mosaicked over the box; token from `.env`). Keep the box small (about
0.2 x 0.2 degrees): the files are read as windows, one per scene. Reading five 10 m windows still takes a minute.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from engine import s1  # noqa: E402


def plan(search, bbox, event_date, n_ref=3, after_window_days=12, dry_months=s1.DRY_MONTHS, max_age_days=400):
    """Pick the event scene, `n_ref` dry-season references on the same orbit, and one older dry scene for false alarms.

    `search(bbox, start, end)` returns Scenes (or acquisitions): Planetary Computer scenes or grouped OPERA bursts.
    """
    event = datetime.fromisoformat(event_date).replace(tzinfo=timezone.utc)
    after_scenes = search(bbox, event, event + timedelta(days=after_window_days))
    if not after_scenes:
        raise LookupError(f"no Sentinel-1 scene over the box in the {after_window_days} days from {event_date}")
    after = after_scenes[0]
    history = search(bbox, event - timedelta(days=max_age_days), event)
    # need n_ref references plus one older dry scene for the false-alarm test, all on the event's orbit
    dry = s1.pick_reference(history, after.datetime, after.relative_orbit, after.orbit_state, n=n_ref + 1,
                            dry_months=dry_months, max_age_days=max_age_days)
    if len(dry) < n_ref + 1:
        raise LookupError(f"only {len(dry)} dry-season scenes on relative orbit {after.relative_orbit} "
                          f"({after.orbit_state}); need {n_ref + 1}. Widen the window or the dry months")
    return after, dry[:n_ref], dry[n_ref]


def _meta(source, bbox, event_date, after, refs, dry_after, dry_months):
    scene = lambda sc: {"id": sc.id, "datetime": sc.datetime.isoformat(), **({"bursts": sc.burst_id} if sc.burst_id else {})}  # noqa: E731
    return {"source": source, "bbox": list(bbox), "event_date": event_date, "relative_orbit": after.relative_orbit,
            "orbit_state": after.orbit_state, "dry_months": list(dry_months), "after": scene(after),
            "references": [scene(r) for r in refs], "dry_after": scene(dry_after)}


def fetch_event(bbox, event_date, out_dir, n_ref=3, after_window_days=12, dry_months=s1.DRY_MONTHS, client=None,
                sign=None, max_age_days=400):
    """Planetary Computer (10 m, anonymous)."""
    def search(b, start, end):
        return s1.search_mpc(b, start, end, client=client)
    after, refs, dry_after = plan(search, bbox, event_date, n_ref, after_window_days, dry_months, max_age_days)
    os.makedirs(out_dir, exist_ok=True)
    jobs = [("after.tif", after)] + [(f"ref{i + 1}.tif", r) for i, r in enumerate(refs)] + [("dry_after.tif", dry_after)]
    for name, sc in jobs:
        s1.read_chip(sc.hrefs["vv"], sc.hrefs["vh"], bbox, os.path.join(out_dir, name), sign=sign)
    meta = _meta("Planetary Computer sentinel-1-rtc (gamma0 RTC, 10 m)", bbox, event_date, after, refs, dry_after, dry_months)
    with open(os.path.join(out_dir, "meta.json"), "w") as f:
        json.dump(meta, f, indent=1)
    return meta


def fetch_opera_event(bbox, event_date, out_dir, cache_dir=None, n_ref=3, after_window_days=12, dry_months=s1.DRY_MONTHS,
                      search=None, session=None, max_age_days=400):
    """NASA OPERA RTC-S1 (30 m, needs an Earthdata token): bursts are downloaded, then mosaicked over the box."""
    cache_dir = cache_dir or os.path.join(out_dir, "downloads")
    raw = search or (lambda b, start, end: s1.search_opera(b, start, end))

    def grouped(b, start, end):
        return s1.group_acquisitions(raw(b, start, end))
    after, refs, dry_after = plan(grouped, bbox, event_date, n_ref, after_window_days, dry_months, max_age_days)
    os.makedirs(out_dir, exist_ok=True)
    jobs = [("after.tif", after)] + [(f"ref{i + 1}.tif", r) for i, r in enumerate(refs)] + [("dry_after.tif", dry_after)]
    for name, acq in jobs:
        vv = s1.download_files(acq.hrefs["vv"], cache_dir, session=session)
        vh = s1.download_files(acq.hrefs["vh"], cache_dir, session=session)
        s1.mosaic_chip(vv, vh, bbox, os.path.join(out_dir, name))
    meta = _meta("NASA OPERA RTC-S1 (gamma0 RTC, 30 m, via ASF)", bbox, event_date, after, refs, dry_after, dry_months)
    with open(os.path.join(out_dir, "meta.json"), "w") as f:
        json.dump(meta, f, indent=1)
    return meta


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bbox", type=float, nargs=4, required=True, metavar=("W", "S", "E", "N"))
    ap.add_argument("--event-date", required=True, help="YYYY-MM-DD, the day the flood image should be on or after")
    ap.add_argument("--out", required=True)
    ap.add_argument("--dry-months", type=int, nargs="+", default=list(s1.DRY_MONTHS))
    ap.add_argument("--source", choices=["mpc", "opera"], default="mpc",
                    help="mpc: Planetary Computer, 10 m, no account. opera: NASA OPERA, 30 m, needs EARTHDATA_TOKEN in .env")
    a = ap.parse_args()
    if a.source == "opera":
        meta = fetch_opera_event(tuple(a.bbox), a.event_date, a.out, dry_months=tuple(a.dry_months))
    else:
        import planetary_computer
        meta = fetch_event(tuple(a.bbox), a.event_date, a.out, dry_months=tuple(a.dry_months), sign=planetary_computer.sign)
    print(json.dumps(meta, indent=1))
