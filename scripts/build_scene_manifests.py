"""Write web/public/demos/<id>/files.json: every file the website needs to open a scene offline.

Run after scripts/export_demo_assets.py / export_detector_variants.py (and whenever a scene changes).
The "Save for offline" button downloads exactly these files into the scene cache. exports/ (PDF, GPKG, CSV, ...) is
left out on purpose: those are large downloads, not part of viewing a scene.
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "demos")
SKIP_DIRS = {"exports"}
SKIP_FILES = {"files.json"}


def scene_files(scene_dir: str) -> list[dict]:
    out = []
    for dirpath, dirnames, names in os.walk(scene_dir):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for n in sorted(names):
            if n in SKIP_FILES or n.startswith("."):
                continue
            p = os.path.join(dirpath, n)
            out.append({"path": os.path.relpath(p, scene_dir).replace(os.sep, "/"), "bytes": os.path.getsize(p)})
    return out


def main(root: str = ROOT) -> int:
    n = 0
    for sid in sorted(os.listdir(root)):
        d = os.path.join(root, sid)
        if not os.path.isdir(d) or not os.path.exists(os.path.join(d, "meta.json")):
            continue
        files = scene_files(d)
        with open(os.path.join(d, "files.json"), "w") as f:
            json.dump({"id": sid, "count": len(files), "bytes": sum(x["bytes"] for x in files), "files": files}, f, separators=(",", ":"))
        n += 1
        print(f"{sid}: {len(files)} files, {sum(x['bytes'] for x in files) / 1e6:.1f} MB")
    return n


if __name__ == "__main__":
    sys.exit(0 if main(sys.argv[1] if len(sys.argv) > 1 else ROOT) else 1)
