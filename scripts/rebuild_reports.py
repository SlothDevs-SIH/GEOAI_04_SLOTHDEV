"""Rebuild every demo scene's PDF report from the committed scene files (no satellite images needed).

python scripts/rebuild_reports.py [scene-id ...]

Reads web/public/demos/<id>/{meta,summary}.json, result_filtered.geojson, after.webp and crops/, and writes
web/public/demos/<id>/exports/report.pdf (and the variants' reports, if any).
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from engine import report  # noqa: E402

DEMOS = os.path.join(ROOT, "web", "public", "demos")


def main(ids):
    ids = ids or [m["id"] for m in json.load(open(os.path.join(DEMOS, "index.json"), encoding="utf-8"))]
    for sid in ids:
        d = os.path.join(DEMOS, sid)
        out = report.build_from_dir(d)
        print(f"{sid:32s} {os.path.getsize(out) / 1024:7.0f} KB  {out}")


if __name__ == "__main__":
    main(sys.argv[1:])
