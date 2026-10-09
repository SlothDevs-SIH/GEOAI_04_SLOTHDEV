"""Visual QA: draw the detected polygons on the before and after images of each demo scene.

python scripts/qa_overlay.py [scene-id ...]     ->  docs/img/qa_<id>.jpg and a text summary

Left: before. Right: after with polygons coloured by change type (outline thickness = tier).
Use it to check, by eye, that polygons sit on real change before trusting any number.
"""
import json
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMOS = os.path.join(ROOT, "web", "public", "demos")
OUT = os.path.join(ROOT, "docs", "img")
COLOR = {"built_up_gain": (230, 30, 30), "water_gain": (20, 90, 255), "water_loss": (0, 200, 220),
         "vegetation_loss": (255, 150, 0), "vegetation_gain": (60, 200, 60), "other": (200, 0, 200)}
WIDTH = {"critical": 4, "high": 3, "medium": 2, "low": 1}


def to_px(lon, lat, bbox, size):
    w, h = size
    return ((lon - bbox[0]) / (bbox[2] - bbox[0]) * w, (bbox[3] - lat) / (bbox[3] - bbox[1]) * h)


def rings(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"][0]]
    if geom["type"] == "MultiPolygon":
        return [p[0] for p in geom["coordinates"]]
    return []


def qa(scene):
    d = os.path.join(DEMOS, scene)
    meta = json.load(open(os.path.join(d, "meta.json")))
    bbox = meta.get("bbox") or [min(c[0] for c in meta["corners"]), min(c[1] for c in meta["corners"]),
                                max(c[0] for c in meta["corners"]), max(c[1] for c in meta["corners"])]
    before = Image.open(os.path.join(d, "before.webp")).convert("RGB")
    after = Image.open(os.path.join(d, "after.webp")).convert("RGB")
    fc = json.load(open(os.path.join(d, "result_filtered.geojson")))
    draw = ImageDraw.Draw(after)
    stats = {}
    for f in fc["features"]:
        p = f["properties"]
        kind, tier = p.get("change_type", "other"), p.get("tier", "low")
        for ring in rings(f["geometry"]):
            pts = [to_px(x, y, bbox, after.size) for x, y in ring]
            draw.line(pts + [pts[0]], fill=COLOR.get(kind, (255, 255, 255)), width=WIDTH.get(tier, 1))
        s = stats.setdefault(kind, {"n": 0, "ha": 0.0})
        s["n"] += 1
        s["ha"] += float(p.get("area_ha") or (p.get("area_m2", 0) / 1e4))
    canvas = Image.new("RGB", (before.width * 2 + 10, before.height), (30, 30, 30))
    canvas.paste(before, (0, 0))
    canvas.paste(after, (before.width + 10, 0))
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"qa_{scene}.jpg")
    canvas.save(path, quality=88)
    tiers = {}
    for f in fc["features"]:
        t = f["properties"].get("tier", "?")
        tiers[t] = tiers.get(t, 0) + 1
    print(f"{scene}: {len(fc['features'])} polygons, tiers {tiers}")
    for k, v in sorted(stats.items(), key=lambda kv: -kv[1]["ha"]):
        print(f"   {k:16s} {v['n']:4d} polygons  {v['ha']:8.1f} ha")
    return path


if __name__ == "__main__":
    scenes = sys.argv[1:] or sorted(x for x in os.listdir(DEMOS) if os.path.isdir(os.path.join(DEMOS, x)))
    for s in scenes:
        print(qa(s))
