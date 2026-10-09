"""GEOAI 04 worked example: bi-temporal change detection -> GIS-ready polygons.

Runs on real LEVIR-CD image pairs (Google Earth imagery, 0.5 m/px, Texas).
Stages: wrap as GeoTIFF -> validate -> radiometric match -> change engine
(pixel-difference baseline and pretrained Siamese BIT model) -> morphological
clean-up -> vectorise -> attributes + severity tiers -> GeoJSON / GeoPackage.
"""
import json
import os
import sys

import cv2
import geopandas as gpd
import numpy as np
import rasterio
from rasterio.features import shapes
from rasterio.transform import from_origin
from shapely.geometry import shape
from skimage.exposure import match_histograms
from skimage.filters import threshold_otsu

REPO, OUT = sys.argv[1], sys.argv[2]
SAMPLES = os.path.join(REPO, "samples")
PX = 0.5                    # LEVIR-CD ground resolution, metres per pixel
CRS = "EPSG:32614"          # UTM 14N (central Texas)
# LEVIR-CD patches ship without coordinates, so the origin is a placeholder
# near Austin. Areas and shapes are real; absolute lat/lon is illustrative.
ORIGIN_E, ORIGIN_N = 621000.0, 3350000.0
MIN_AREA_M2 = 20.0
TIERS = [(1000, "critical"), (300, "high"), (120, "medium"), (0, "low")]


# ---------- 1. ingest: wrap the PNG pair as co-registered GeoTIFFs ----------
def to_geotiff(png, tif, idx):
    img = cv2.cvtColor(cv2.imread(png), cv2.COLOR_BGR2RGB)
    h, w, _ = img.shape
    tr = from_origin(ORIGIN_E + idx * 400, ORIGIN_N, PX, PX)
    with rasterio.open(tif, "w", driver="GTiff", height=h, width=w, count=3,
                       dtype="uint8", crs=CRS, transform=tr) as dst:
        dst.write(img.transpose(2, 0, 1))


def read_pair(before_tif, after_tif):
    with rasterio.open(before_tif) as a, rasterio.open(after_tif) as b:
        assert a.crs == b.crs, "CRS mismatch"
        assert a.transform == b.transform and a.shape == b.shape, "grids differ"
        return (a.read().transpose(1, 2, 0), b.read().transpose(1, 2, 0),
                a.transform, a.crs)


# ---------- 2. change engines ----------
def baseline_change(a, b):
    """Histogram-match, then change-vector magnitude + Otsu threshold."""
    b_m = match_histograms(b, a, channel_axis=-1)
    mag = np.linalg.norm(a.astype(float) - b_m.astype(float), axis=2)
    mag = cv2.GaussianBlur(mag, (5, 5), 0)
    return mag / mag.max(), mag > threshold_otsu(mag)


def load_bit():
    import torch
    import types
    sys.path.insert(0, REPO)
    # the repo targets an old torchvision; provide the module path it expects
    shim = types.ModuleType("torchvision.models.utils")
    shim.load_state_dict_from_url = torch.hub.load_state_dict_from_url
    sys.modules["torchvision.models.utils"] = shim
    import models as repo_models
    # ImageNet weights are not needed: the checkpoint overwrites the backbone.
    _r18 = repo_models.resnet18
    repo_models.resnet18 = lambda pretrained=True, **kw: _r18(pretrained=False, **kw)
    from models.networks import BASE_Transformer
    net = BASE_Transformer(input_nc=3, output_nc=2, token_len=4,
                           resnet_stages_num=4, with_pos="learned",
                           enc_depth=1, dec_depth=8, decoder_dim_head=8)
    # the checkpoint also stores a numpy scalar (best val score); allow just that
    import numpy.core.multiarray as ncm
    safe = [(ncm.scalar, "numpy.core.multiarray.scalar"), np.dtype,
            type(np.dtype("float64")), type(np.dtype("float32"))]
    with torch.serialization.safe_globals(safe):
        ck = torch.load(os.path.join(REPO, "checkpoints/BIT_LEVIR/best_ckpt.pt"),
                        map_location="cpu", weights_only=True)
    net.load_state_dict(ck["model_G_state_dict"])
    return net.eval()


def deep_change(net, a, b, tile=256):
    """Siamese BIT inference, tiled so any image size works."""
    import torch
    h, w, _ = a.shape
    prob = np.zeros((h, w), np.float32)
    t = lambda x: torch.from_numpy(x.transpose(2, 0, 1)).float().div(255).sub(0.5).div(0.5)[None]
    with torch.no_grad():
        for y in range(0, h, tile):
            for x in range(0, w, tile):
                pa, pb = a[y:y + tile, x:x + tile], b[y:y + tile, x:x + tile]
                out = net(t(pa), t(pb))
                prob[y:y + tile, x:x + tile] = torch.softmax(out, 1)[0, 1].numpy()
    return prob, prob > 0.5


# ---------- 3. false-alarm suppression ----------
def clean(mask):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    m = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, k)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    keep = np.zeros_like(m)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] * PX * PX >= MIN_AREA_M2:
            keep[lab == i] = 1
    return keep.astype(bool)


# ---------- 4. vectorise + attribute ----------
def vectorise(mask, magnitude, transform, crs, scene):
    rows = []
    for geom, val in shapes(mask.astype(np.uint8), mask=mask, transform=transform):
        poly = shape(geom).simplify(PX, preserve_topology=True)
        rows.append({"geometry": poly})
    if not rows:
        return gpd.GeoDataFrame({"scene": []}, geometry=[], crs=crs)
    g = gpd.GeoDataFrame(rows, crs=crs)
    g["scene"] = scene
    g["area_m2"] = g.area.round(1)
    # mean change magnitude inside each polygon
    inv = ~transform
    mags = []
    for poly in g.geometry:
        m = rasterio.features.geometry_mask([poly], mask.shape, transform, invert=True)
        mags.append(float(magnitude[m].mean()) if m.any() else 0.0)
    g["magnitude"] = np.round(mags, 3)
    c = g.centroid.to_crs(4326)
    g["centroid_lon"], g["centroid_lat"] = c.x.round(6), c.y.round(6)
    g["score"] = (g.area_m2 * g.magnitude).round(1)
    g["tier"] = [next(t for lim, t in TIERS if s >= lim) for s in g.score]
    return g.sort_values("score", ascending=False).reset_index(drop=True)


def metrics(pred, gt):
    tp = int((pred & gt).sum()); fp = int((pred & ~gt).sum()); fn = int((~pred & gt).sum())
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * p * r / (p + r) if p + r else 0.0
    iou = tp / (tp + fp + fn) if tp + fp + fn else 0.0
    return dict(tp=tp, fp=fp, fn=fn, precision=p, recall=r, f1=f1, iou=iou)


def main():
    os.makedirs(OUT, exist_ok=True)
    names = sorted(f[:-4] for f in os.listdir(os.path.join(SAMPLES, "label")))
    net = load_bit()
    summary, layers, pooled = {}, [], {}
    for i, n in enumerate(names):
        d = os.path.join(OUT, n); os.makedirs(d, exist_ok=True)
        to_geotiff(f"{SAMPLES}/A/{n}.png", f"{d}/before.tif", i)
        to_geotiff(f"{SAMPLES}/B/{n}.png", f"{d}/after.tif", i)
        a, b, tr, crs = read_pair(f"{d}/before.tif", f"{d}/after.tif")
        gt = cv2.imread(f"{SAMPLES}/label/{n}.png", 0) > 127

        mag, base_raw = baseline_change(a, b)
        prob, deep_raw = deep_change(net, a, b)
        stages = {"baseline_raw": base_raw, "baseline_clean": clean(base_raw),
                  "deep_raw": deep_raw, "deep_clean": clean(deep_raw)}
        np.savez_compressed(f"{d}/stages.npz", mag=mag, prob=prob, gt=gt, **stages)

        g = vectorise(stages["deep_clean"], prob, tr, crs, n)
        layers.append(g)
        if len(g):
            g.to_crs(4326).to_file(f"{d}/changes.geojson", driver="GeoJSON")
        summary[n] = {k: metrics(v, gt) for k, v in stages.items()}
        summary[n]["changed_px_pct"] = {k: round(100 * float(v.mean()), 2) for k, v in stages.items()}
        summary[n]["gt_px_pct"] = round(100 * float(gt.mean()), 2)
        summary[n]["polygons"] = len(g)
        summary[n]["raw_components"] = {
            k: int(cv2.connectedComponents(stages[k].astype(np.uint8))[0] - 1)
            for k in ("baseline_raw", "deep_raw")}
        if n.startswith("test_"):
            for k, v in stages.items():
                acc = pooled.setdefault(k, dict(tp=0, fp=0, fn=0))
                for key in acc:
                    acc[key] += summary[n][k][key]

    for k, acc in pooled.items():
        tp, fp, fn = acc["tp"], acc["fp"], acc["fn"]
        p, r = tp / (tp + fp), tp / (tp + fn)
        acc.update(precision=p, recall=r, f1=2 * p * r / (p + r), iou=tp / (tp + fp + fn))
    summary["_pooled_test_tiles"] = pooled

    import pandas as pd
    allg = gpd.GeoDataFrame(pd.concat([g for g in layers if len(g)], ignore_index=True), crs=CRS)
    allg.to_file(f"{OUT}/changes_all.gpkg", layer="changes", driver="GPKG")
    allg.to_crs(4326).to_file(f"{OUT}/changes_all.geojson", driver="GeoJSON")
    json.dump(summary, open(f"{OUT}/summary.json", "w"), indent=1)

    for k, v in pooled.items():
        print(f"{k:15s} P={v['precision']:.3f} R={v['recall']:.3f} F1={v['f1']:.3f} IoU={v['iou']:.3f}")
    for n in names:
        s = summary[n]
        print(n, "gt%", s["gt_px_pct"], "px%", s["changed_px_pct"], "comp", s["raw_components"], "polys", s["polygons"])
    print(allg.tier.value_counts().to_dict(), "total m2", round(allg.area_m2.sum(), 1))


if __name__ == "__main__":
    main()
