"""Build the static demo data the web app reads (BACKEND_PLAN section 8).

python scripts/export_demo_assets.py [--radar-data DATA_DIR]

For each optical scene in demos/<id>/ (fetched by scripts/fetch_demo_scenes.py) and the Assam radar
flood chip (Sen1Floods11, fetched by scripts/fetch_m8_chips.py) writes web/public/demos/<id>/:
  meta.json  before.webp  after.webp  bounds.json  result_filtered.geojson  result_raw.geojson
  summary.json  crops/<fid>_{before,after}.webp  exports/{changes.gpkg,.geojson,.csv,.kml,report.pdf,audit.json}
and web/public/demos/index.json.
"""
import argparse
import io
import json
import os
import shutil
import sys

import numpy as np
import rasterio
from PIL import Image
from rasterio.warp import transform as warp_transform

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from engine import radar, run  # noqa: E402

OUT = os.path.join(ROOT, "web", "public", "demos")
OPTICAL = {
    "navi-mumbai-airport": dict(name="Navi Mumbai airport build-out", event="Large construction project",
                                kind="encroachment", preset="encroachment"),
    "pune-hinjewadi": dict(name="Pune city edge (Hinjewadi)", event="Urban growth on the city edge",
                           kind="encroachment", preset="encroachment"),
    "season-control": dict(name="Saswad farmland (season control)", event="False-alarm test: only crops changed",
                           kind="control", preset="encroachment"),
}
RADAR_CHIP = "India_1018327"
TOP_CROPS = 20


def webp(rgb, path, max_side=2048, quality=82):
    im = Image.fromarray(rgb)
    if max(im.size) > max_side:
        s = max_side / max(im.size)
        im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    im.save(path, "WEBP", quality=quality)


def true_color(stack_refl, gain=1 / 0.3, gamma=0.8):
    rgb = np.clip(np.dstack([stack_refl[2], stack_refl[1], stack_refl[0]]) * gain, 0, 1) ** gamma
    return (rgb * 255).astype(np.uint8)


def corners_lonlat(transform, crs, h, w):
    """Image corners (TL, TR, BR, BL) in lon/lat, the order a MapLibre image source expects."""
    xs = [transform.c, transform.c + w * transform.a, transform.c + w * transform.a, transform.c]
    ys = [transform.f, transform.f, transform.f + h * transform.e, transform.f + h * transform.e]
    lon, lat = warp_transform(crs, "EPSG:4326", xs, ys)
    return [[round(x, 6), round(y, 6)] for x, y in zip(lon, lat)]


def crops(rgb_b, rgb_a, gdf, transform, crs, d, pad=8):
    """Before/after crops of the top changes, around each polygon's bounding box."""
    os.makedirs(f"{d}/crops", exist_ok=True)
    inv = ~transform
    h, w = rgb_b.shape[:2]
    for _, r in gdf.head(TOP_CROPS).iterrows():
        g = r.geometry
        if crs.to_epsg() != 4326:
            import geopandas as gpd
            g = gpd.GeoSeries([g], crs=4326).to_crs(crs).iloc[0]
        x0, y0, x1, y1 = g.bounds
        c0, r0 = inv * (x0, y1)
        c1, r1 = inv * (x1, y0)
        c0, r0 = max(int(c0) - pad, 0), max(int(r0) - pad, 0)
        c1, r1 = min(int(c1) + pad, w), min(int(r1) + pad, h)
        if c1 - c0 < 4 or r1 - r0 < 4:
            continue
        for side, img in (("before", rgb_b), ("after", rgb_a)):
            Image.fromarray(img[r0:r1, c0:c1]).resize((160, int(160 * (r1 - r0) / (c1 - c0)) or 1),
                                                      Image.NEAREST).save(f"{d}/crops/{int(r['id'])}_{side}.webp",
                                                                          "WEBP", quality=85)


def snapshot_png(rgb, gdf, transform, crs, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from rasterio.plot import plotting_extent
    colors = {"critical": "#b5179e", "high": "#e03131", "medium": "#f08a24", "low": "#e0b100"}
    h, w = rgb.shape[:2]
    fig, ax = plt.subplots(figsize=(5, 5 * h / w))
    ext = plotting_extent(np.zeros((1, h, w)), transform)
    ax.imshow(rgb, extent=ext)
    if len(gdf):
        g = gdf.to_crs(crs)
        for t, c in colors.items():
            sub = g[g["tier"] == t]
            if len(sub):
                sub.plot(ax=ax, facecolor=c + "66", edgecolor=c, linewidth=0.8)
    ax.axis("off")
    fig.savefig(path, dpi=110, bbox_inches="tight", pad_inches=0)
    plt.close(fig)
    return path


def export_optical(sid, cfg):
    src = os.path.join(ROOT, "demos", sid)
    m = json.load(open(f"{src}/meta.json"))
    res = run.analyze(f"{src}/before.tif", f"{src}/after.tif", cfg["preset"], "spectral",
                      m["before"]["date"], m["after"]["date"], worldcover_cache=f"{src}/worldcover.tif")
    d = os.path.join(OUT, sid)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(f"{d}/exports", exist_ok=True)
    pair = res.pair
    rgb_b, rgb_a = true_color(pair.before), true_color(pair.after)
    webp(rgb_b, f"{d}/before.webp")
    webp(rgb_a, f"{d}/after.webp")
    h, w = rgb_b.shape[:2]
    corners = corners_lonlat(pair.transform, pair.crs, h, w)
    snap = snapshot_png(rgb_a, res.gdf, pair.transform, pair.crs, f"{d}/exports/snapshot.png")
    run.write_outputs(res, f"{d}/exports", inputs=[f"{src}/before.tif", f"{src}/after.tif"],
                      title=f"GEOAI 04 change report: {cfg['name']}", snapshot_png=snap,
                      permalink=f"/scene/{sid}")
    shutil.copy(f"{d}/exports/changes.geojson", f"{d}/result_filtered.geojson")
    res.raw.to_file(f"{d}/result_raw.geojson", driver="GeoJSON")
    crops(rgb_b, rgb_a, res.gdf, pair.transform, pair.crs, d)
    summary = dict(res.summary)
    summary["subtitle"] = f"{m['place']} | before {m['before']['date']} | after {m['after']['date']}"
    json.dump(summary, open(f"{d}/summary.json", "w"), indent=1, default=str)
    meta = dict(id=sid, name=cfg["name"], place=m["place"], event=cfg["event"], kind=cfg["kind"], mode="spectral",
                before_date=m["before"]["date"], after_date=m["after"]["date"],
                before_label=f"Before · Sentinel-2 · {m['before']['date']}",
                after_label=f"After · Sentinel-2 · {m['after']['date']}",
                scenes={"before": m["before"]["scene"], "after": m["after"]["scene"]},
                source=m["source"], corners=corners, bbox=m["bbox"], preset=cfg["preset"],
                story=m["story"], demo=True)
    json.dump(meta, open(f"{d}/meta.json", "w"), indent=1)
    json.dump({"corners": corners}, open(f"{d}/bounds.json", "w"))
    return meta, summary


def export_radar(data_dir):
    cid = RADAR_CHIP
    chip = radar.load_chip(f"{data_dir}/S1Hand/{cid}_S1Hand.tif", f"{data_dir}/LabelHand/{cid}_LabelHand.tif",
                           f"{data_dir}/JRCWaterHand/{cid}_JRCWaterHand.tif")
    india = json.load(open(os.path.join(ROOT, "eval/results/m8_sen1floods11_india.json")))
    thr = india["event_threshold_vv_db"]          # fitted on all 68 Assam chips, radar only
    mask, drops, vvs = radar.flood_mask(chip, thr)
    feats = radar.polygons(mask, vvs, thr, chip["transform"], chip["crs"])
    naive = radar.naive_mask(chip)
    sid = "assam-flood-2016"
    d = os.path.join(OUT, sid)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(f"{d}/exports", exist_ok=True)
    with rasterio.open(f"{data_dir}/S2Hand/{cid}_S2Hand.tif") as s:
        opt = s.read([4, 3, 2]).astype(float)
    rgb_opt = (np.clip(opt / 2500.0, 0, 1) ** 0.8 * 255).astype(np.uint8).transpose(1, 2, 0)
    g = (np.clip((np.nan_to_num(chip["vv"], nan=-25) + 25) / 25, 0, 1) * 255).astype(np.uint8)
    rgb_rad = np.dstack([g, g, g])
    webp(rgb_opt, f"{d}/before.webp")
    webp(rgb_rad, f"{d}/after.webp")
    corners = corners_lonlat(chip["transform"], chip["crs"], 512, 512)
    # numbered, scored GeoJSON in the same property schema as the optical scenes
    import geopandas as gpd
    from shapely.geometry import shape
    rows = []
    for f in feats:
        p = dict(f["properties"])
        score = p["area_m2"] * min(max(p["depth_db"] / 6.0, 0), 1)
        rows.append(dict(id=p["id"], tier=p["tier"], change_type="water_gain", area_m2=p["area_m2"],
                         area_ha=p["area_ha"], magnitude=round(min(max(p["depth_db"] / 6.0, 0), 1), 3),
                         confidence=p["confidence"], needs_review=p["needs_review"],
                         centroid_lat=p["centroid_lat"], centroid_lon=p["centroid_lon"],
                         reason="open-water flood: " + p["reason"], score=round(score, 1),
                         review_status="pending", mean_vv_db=p["mean_vv_db"], geometry=shape(f["geometry"])))
    gdf = gpd.GeoDataFrame(rows, geometry="geometry", crs=4326)
    gdf.to_file(f"{d}/result_filtered.geojson", driver="GeoJSON")
    from engine import vectorise
    rp, _ = vectorise.polygons(naive, chip["transform"])
    gpd.GeoDataFrame(geometry=[p for p, _ in rp], crs=4326).to_file(f"{d}/result_raw.geojson", driver="GeoJSON")
    from engine import export as ex, report
    c = gdf.union_all().centroid
    from engine.attributes import utm_epsg
    ex.geojson(gdf, f"{d}/exports/changes.geojson")
    ex.gpkg(gdf, f"{d}/exports/changes.gpkg", utm_epsg(c.x, c.y))
    ex.csv(gdf, f"{d}/exports/changes.csv")
    ex.kml(gdf, f"{d}/exports/changes.kml", "Assam flood 2016 (M8 radar)")
    sc_m8, sc_naive = radar.scores(mask, chip), radar.scores(naive, chip)
    from scipy.ndimage import label
    by_tier = {t: int((gdf["tier"] == t).sum()) for t in ("critical", "high", "medium", "low")}
    summary = dict(
        mode="radar", preset="flood", raw_detections=int(label(naive)[1]), after_filter=len(gdf), dropped=drops,
        total_area_m2=round(float(gdf["area_m2"].sum()), 1), by_tier=by_tier, by_type={"water_gain": len(gdf)},
        threshold_db=thr, impact={"changed_ha": round(float(gdf["area_ha"].sum()), 2), "cropland_ha": None,
                                  "built_up_ha": None, "buildings": None, "road_segments": None, "sources": [],
                                  "notes": ["Impact layers are not computed for this 2016 test chip"]},
        evaluation={"against": "Sen1Floods11 expert hand labels (flood water, JRC permanent water excluded)",
                    "m8": sc_m8["flood_only"], "naive": sc_naive["flood_only"]},
        warnings=[], quality={"pixel_m": 10},
        sources=["Copernicus Sentinel-1 IW GRD (dB) and Sentinel-2, via Sen1Floods11 v1.1 (CC-BY 4.0)",
                 "JRC Global Surface Water (permanent water mask)"],
        limits=["Open-water flood extent estimate: flooded crops and streets can look bright on radar and may "
                "be missed.", "Single date shown; the full M8 compares before/after radar scenes."],
        subtitle="Brahmaputra flood, Assam, India | Sentinel-1 radar 2016-08-12 | expert labels: Sen1Floods11")
    json.dump(summary, open(f"{d}/summary.json", "w"), indent=1, default=str)
    report.build(f"{d}/exports/report.pdf", "GEOAI 04 flood report: Assam 2016 (radar)", summary, gdf,
                 snapshot_png(rgb_rad, gdf, chip["transform"], chip["crs"], f"{d}/exports/snapshot.png"),
                 f"/scene/{sid}", summary["limits"])
    rgb_lab = rgb_rad.copy()
    crops(rgb_opt, rgb_rad, gdf, chip["transform"], chip["crs"], d)
    del rgb_lab
    lab_rgba = np.zeros((512, 512, 4), np.uint8)
    lab_rgba[(chip["label"] == 1) & chip["valid"]] = (0, 220, 120, 150)
    Image.fromarray(lab_rgba).save(f"{d}/labels.png")
    meta = dict(id=sid, name="Assam flood 2016 (radar, M8)", place="Brahmaputra floodplain, Assam, India",
                event="Monsoon flood mapped through cloud with Sentinel-1 radar", kind="flood", mode="radar",
                before_date="2016-08-12", after_date="2016-08-12",
                before_label="Optical · Sentinel-2 · 2016-08-12 (same day)",
                after_label="Radar · Sentinel-1 VV · 2016-08-12", scenes={"chip": cid},
                source="Sen1Floods11 v1.1 hand-labelled chip (Copernicus Sentinel-1/2)", corners=corners,
                preset="flood", story="Flood water is dark on radar. Expert labels available: toggle them on.",
                labels="labels.png", demo=True)
    json.dump(meta, open(f"{d}/meta.json", "w"), indent=1)
    json.dump({"corners": corners}, open(f"{d}/bounds.json", "w"))
    return meta, summary


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--radar-data", default=os.path.join(ROOT, "data", "sen1floods11"))
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    index = []
    if os.path.exists(f"{a.radar_data}/S2Hand/{RADAR_CHIP}_S2Hand.tif"):
        meta, s = export_radar(a.radar_data)
        index.append({**meta, "after_filter": s["after_filter"], "raw_detections": s["raw_detections"]})
        print("assam-flood-2016", s["raw_detections"], "->", s["after_filter"])
    else:
        print("radar chip not found; run scripts/fetch_m8_chips.py", a.radar_data)
    for sid, cfg in OPTICAL.items():
        meta, s = export_optical(sid, cfg)
        index.append({**meta, "after_filter": s["after_filter"], "raw_detections": s["raw_detections"]})
        print(sid, s["raw_detections"], "->", s["after_filter"], s["impact"].get("cropland_ha"))
    for k in ("corners",):
        for e in index:
            e.pop(k, None)
    json.dump(index, open(f"{OUT}/index.json", "w"), indent=1)


if __name__ == "__main__":
    main()
