"""Download the before/after Sentinel-2 stacks for the demo scenes into demos/<name>/.

python scripts/fetch_demo_scenes.py            # all scenes
python scripts/fetch_demo_scenes.py pune-hinjewadi
"""
import json
import os
import sys

import rasterio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine import s2  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "demos")

# bbox = (west, south, east, north). Same-season dates (Dec-Feb, dry, low cloud)
# for real change; deliberately mismatched seasons for the false-alarm control.
SCENES = {
    "navi-mumbai-airport": dict(
        place="Navi Mumbai International Airport site, Maharashtra",
        story="Large construction project: land levelling and airport build-out",
        bbox=(73.040, 18.965, 73.100, 19.015), center=(19.0, 73.07),
        before=[(2019, 1), (2019, 2), (2018, 12)], after=[(2025, 1), (2025, 2), (2024, 12)],
        preset="encroachment"),
    "pune-hinjewadi": dict(
        place="Hinjewadi / Maan, Pune, Maharashtra",
        story="Fast urban growth on the city edge: IT parks and housing",
        bbox=(73.680, 18.560, 73.760, 18.620), center=(18.59, 73.72),
        before=[(2019, 1), (2019, 2), (2018, 12)], after=[(2025, 1), (2025, 2), (2024, 12)],
        preset="encroachment"),
    "season-control": dict(
        place="Farmland near Saswad, Pune district, Maharashtra",
        story="False-alarm control: green post-monsoon crops vs dry season, a few months apart",
        bbox=(74.000, 18.330, 74.060, 18.380), center=(18.355, 74.03),
        before=[(2024, 10), (2024, 11)], after=[(2025, 3), (2025, 4)],
        preset="encroachment"),
}


def best_scene(tile, months, bbox, tries=4):
    best = None
    for sc in s2.search(tile, months, max_cloud=30)[:tries]:
        with rasterio.open(sc.href("SCL")) as _:
            pass
        refl, scl, tr, crs = s2.read_aoi(sc, bbox)
        cc = s2.aoi_cloud_pct(scl)
        print(f"   {sc.id} tile cloud {sc.cloud_pct:.1f}%  AOI invalid {cc:.2f}%")
        if best is None or cc < best[0]:
            best = (cc, sc, refl, scl, tr, crs)
        if cc < 0.5:
            break
    return best


def fetch(name, cfg):
    d = os.path.join(ROOT, name)
    os.makedirs(d, exist_ok=True)
    tile = s2.mgrs_tile(*cfg["center"])
    meta = {"name": name, "place": cfg["place"], "story": cfg["story"], "bbox": cfg["bbox"],
            "tile": tile, "preset": cfg["preset"], "source": "Sentinel-2 L2A (Copernicus), "
            "via the Element84 Earth Search COG bucket"}
    for which in ("before", "after"):
        print(f"{name} {which}: tile {tile}")
        cc, sc, refl, scl, tr, crs = best_scene(tile, cfg[which], cfg["bbox"])
        s2.write_stack(os.path.join(d, f"{which}.tif"), refl, scl, tr, crs,
                       {"scene": sc.id, "date": sc.date, "baseline": sc.baseline})
        meta[which] = {"scene": sc.id, "date": sc.date.isoformat(), "tile_cloud_pct": sc.cloud_pct,
                       "aoi_invalid_pct": round(cc, 3), "processing_baseline": sc.baseline,
                       "dn_offset_removed": sc.dn_offset}
    json.dump(meta, open(os.path.join(d, "meta.json"), "w"), indent=1)
    print(json.dumps(meta, indent=1))


if __name__ == "__main__":
    for n in sys.argv[1:] or SCENES:
        fetch(n, SCENES[n])
