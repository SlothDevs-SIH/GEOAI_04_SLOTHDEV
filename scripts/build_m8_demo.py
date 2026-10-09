"""Run M8 on the Sen1Floods11 India chips (Assam, Sentinel-1 2016-08-12) and build:
  eval/results/m8_sen1floods11_india.json   measured metrics, all 68 chips
  web/demo_data.js                          demo payload for the web prototype

python scripts/fetch_m8_chips.py DATA_DIR      # once, public bucket, no login
python scripts/build_m8_demo.py DATA_DIR
"""
import base64
import glob
import io
import json
import os
import sys
import time

import numpy as np
import rasterio
from PIL import Image
from scipy.ndimage import label

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from engine import radar  # noqa: E402

DATA = sys.argv[1]
DEMO = ["India_747992", "India_804466", "India_1050276", "India_383430", "India_500266",
        "India_1018327", "India_773682"]


def png(rgb):
    b = io.BytesIO()
    Image.fromarray(rgb).save(b, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


def radar_rgb(vv):
    g = (np.clip((np.nan_to_num(vv, nan=-25) + 25) / 25, 0, 1) * 255).astype(np.uint8)
    return np.dstack([g, g, g])


def optical_rgb(path):
    with rasterio.open(path) as s:
        a = s.read([4, 3, 2]).astype(float)  # B4 B3 B2
    rgb = np.clip(a / 2500.0, 0, 1) ** 0.8
    return (rgb.transpose(1, 2, 0) * 255).astype(np.uint8)


def mask_rgba(m, color):
    out = np.zeros(m.shape + (4,), np.uint8)
    out[m] = color
    return out


def pixel_polys(feats, transform):
    inv = ~transform
    out = []
    for f in feats:
        g = f["geometry"]
        rings = g["coordinates"] if g["type"] == "Polygon" else [r for p in g["coordinates"] for r in p]
        out.append(dict(props=f["properties"],
                        rings=[[[round(c, 1) for c in inv * (x, y)] for x, y in ring] for ring in rings]))
    return out


def main():
    t0 = time.time()
    chips = {}
    for f in sorted(glob.glob(f"{DATA}/S1Hand/India_*_S1Hand.tif")):
        cid = os.path.basename(f).replace("_S1Hand.tif", "")
        chips[cid] = radar.load_chip(f, f"{DATA}/LabelHand/{cid}_LabelHand.tif",
                                     f"{DATA}/JRCWaterHand/{cid}_JRCWaterHand.tif")
    thr = radar.event_threshold(chips.values())
    tot = {k: {"all_water": [0, 0, 0], "flood_only": [0, 0, 0]} for k in ("naive", "m8")}
    demo = []
    raw_blobs = kept_polys = 0
    for cid, c in chips.items():
        naive = radar.naive_mask(c)
        m8, drops, vvs = radar.flood_mask(c, thr)
        for k, p in (("naive", naive), ("m8", m8)):
            sc = radar.scores(p, c)
            for part in ("all_water", "flood_only"):
                for i, key in enumerate(("tp", "fp", "fn")):
                    tot[k][part][i] += sc[part][key]
        nb = label(naive)[1]
        feats = radar.polygons(m8, vvs, thr, c["transform"], c["crs"])
        raw_blobs += nb
        kept_polys += len(feats)
        if cid in DEMO:
            s2 = f"{DATA}/S2Hand/{cid}_S2Hand.tif"
            demo.append(dict(
                id=cid, bounds=list(rasterio.transform.array_bounds(512, 512, c["transform"])),
                optical=png(optical_rgb(s2)) if os.path.exists(s2) else None,
                radar=png(radar_rgb(c["vv"])),
                raw_mask=png(mask_rgba(naive, (255, 140, 0, 150))),
                label_mask=png(mask_rgba((c["label"] == 1) & c["valid"], (0, 220, 120, 140))),
                polygons=pixel_polys(feats, c["transform"]),
                raw_blobs=int(nb), drops=drops,
                score_naive=radar.scores(naive, c), score_m8=radar.scores(m8, c),
                water_pct=round(float(((c["label"] == 1) & c["valid"]).sum() / c["valid"].sum() * 100), 1)))

    def agg(t):
        tp, fp, fn = t
        return dict(iou=round(tp / (tp + fp + fn), 3), precision=round(tp / (tp + fp), 3),
                    recall=round(tp / (tp + fn), 3))
    results = dict(
        dataset="Sen1Floods11 v1.1 hand-labelled chips, India (Assam, Brahmaputra flood), "
                "Sentinel-1 IW GRD 2016-08-12, descending orbit 77",
        chips=len(chips), event_threshold_vv_db=round(thr, 2),
        labels_used_for_fitting=False,
        naive_per_chip_otsu=dict(all_water=agg(tot["naive"]["all_water"]), flood_only=agg(tot["naive"]["flood_only"])),
        m8=dict(all_water=agg(tot["m8"]["all_water"]), flood_only=agg(tot["m8"]["flood_only"])),
        raw_blobs_naive=int(raw_blobs), polygons_m8=int(kept_polys),
        runtime_s=round(time.time() - t0, 1),
        note="Single-date water mapping (no pre-event radar in Sen1Floods11): a lower bound for M8 change detection.")
    os.makedirs(f"{ROOT}/eval/results", exist_ok=True)
    json.dump(results, open(f"{ROOT}/eval/results/m8_sen1floods11_india.json", "w"), indent=1)
    os.makedirs(f"{ROOT}/web", exist_ok=True)
    with open(f"{ROOT}/web/demo_data.js", "w") as f:
        f.write("window.M8 = " + json.dumps(dict(results=results, chips=demo)) + ";\n")
    print(json.dumps(results, indent=1))


if __name__ == "__main__":
    main()
