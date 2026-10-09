"""M8: Sentinel-1 radar flood mode (open-water flood extent).

Radar sees through monsoon cloud. Calm open water reflects the radar pulse away
from the satellite, so flooded ground appears dark (low VV backscatter, in dB).

Pipeline (pure functions, no web code):
  1. speckle filter (median 5x5) on VV dB
  2. event-level threshold: one Otsu threshold fitted on all chips of the event
     (no labels used), then region growing (hysteresis): seeds 3 dB darker than the
     threshold grow through connected pixels below it. Per-chip Otsu is kept only as the "naive" baseline:
     on Assam 2016 it over-flags because it forces a split on dry chips.
  3. false-alarm filters: drop permanent water (JRC), morphological open/close,
     minimum area
  4. vectorise, then attribute every polygon: area, mean backscatter, depth below
     threshold, confidence, reason, severity tier
"""
from __future__ import annotations

import numpy as np
import rasterio
from rasterio.features import shapes
from scipy.ndimage import binary_closing, binary_opening, label, median_filter
from shapely.geometry import mapping, shape
from skimage.filters import threshold_otsu

TIERS_HA = [(50.0, "critical"), (10.0, "high"), (2.0, "medium"), (0.0, "low")]
# Region-growing offsets chosen on the Sen1Floods11 VALID split (ml/m8_experiments.py,
# eval/results/m8_sen1floods11_experiments.json): best flood-only IoU on test, held-out Bolivia
# and India among the label-free methods.
STRICT_DB, LOOSE_DB = 3.0, 0.0
MIN_AREA_M2 = 2000.0          # ~20 Sentinel-1 pixels at 10 m


def load_chip(s1_path, label_path=None, perm_path=None):
    with rasterio.open(s1_path) as s:
        a = s.read().astype(np.float32)
        transform, crs = s.transform, s.crs
    vv, vh = a[0], a[1]
    valid = np.isfinite(vv) & np.isfinite(vh)
    lab = perm = None
    if label_path:
        with rasterio.open(label_path) as s:
            lab = s.read(1)
        valid &= lab != -1
    if perm_path:
        with rasterio.open(perm_path) as s:
            perm = s.read(1) == 1
    return dict(vv=vv, vh=vh, valid=valid, label=lab, perm=perm, transform=transform, crs=crs)


def smooth(vv, valid):
    return median_filter(np.where(valid, vv, np.nanmedian(vv[valid])), 5)


def event_threshold(chips) -> float:
    """One Otsu threshold for the whole event, from speckle-filtered VV of every chip."""
    return float(threshold_otsu(np.concatenate([smooth(c["vv"], c["valid"])[c["valid"]] for c in chips])))


def naive_mask(chip):
    """Baseline most tools use: per-chip Otsu on raw VV, no filters."""
    v = chip["valid"]
    return (chip["vv"] < threshold_otsu(chip["vv"][v])) & v


def hysteresis_water(vvs, valid, thr, strict_db=STRICT_DB, loose_db=LOOSE_DB):
    """Region growing: seeds darker than thr - strict_db, grown through connected pixels darker
    than thr + loose_db. Recovers flood edges a single threshold cuts off, without adding
    isolated dark speckle."""
    from skimage.filters import apply_hysteresis_threshold
    return apply_hysteresis_threshold(-vvs, -(thr + loose_db), -(thr - strict_db)) & valid


def features(chip, thr):
    """Per-pixel features for the learned classifier. Backscatter is expressed relative to the
    event threshold so the model transfers between events and processors."""
    from scipy.ndimage import uniform_filter
    v = chip["valid"]
    fill = lambda a: np.where(v, a, np.nanmedian(a[v]))  # noqa: E731
    vv, vh = fill(chip["vv"]), fill(chip["vh"])
    vvm, vhm = median_filter(vv, 5), median_filter(vh, 5)
    mean11 = uniform_filter(vv, 11)
    std5 = np.sqrt(np.maximum(uniform_filter(vv ** 2, 5) - uniform_filter(vv, 5) ** 2, 0))
    f = np.stack([vv - thr, vh - thr, vv - vh, vvm - thr, vhm - thr, mean11 - thr, std5], -1)
    return f.astype(np.float32)


FEATURE_NAMES = ["vv_rel", "vh_rel", "vv_minus_vh", "vv_med5_rel", "vh_med5_rel", "vv_mean11_rel", "vv_std5"]


def postprocess(water, chip, min_area_m2=MIN_AREA_M2, px_area_m2=100.0):
    """Shared false-alarm filters for every detector. Returns (mask, drop_counts)."""
    v = chip["valid"]
    water = water & v
    drops = {}
    if chip["perm"] is not None:
        drops["permanent_water"] = int((water & chip["perm"]).sum())
        water &= ~chip["perm"]
    cleaned = binary_closing(binary_opening(water, np.ones((3, 3))), np.ones((3, 3))) & v
    drops["speckle_morphology"] = int((water & ~cleaned).sum())
    lab, n = label(cleaned)
    if n:
        sizes = np.bincount(lab.ravel())
        small = np.isin(lab, np.where(sizes * px_area_m2 < min_area_m2)[0]) & (lab > 0)
        drops["below_min_area"] = int(small.sum())
        cleaned &= ~small
    return cleaned, drops


def flood_mask(chip, thr, method="hysteresis", model=None, prob=0.5, **kw):
    """Detect open-water flood and apply the false-alarm filters.
    method: "threshold" (event Otsu), "hysteresis" (region growing) or "learned" (needs model).
    Returns (mask, drop_counts, speckle-filtered VV)."""
    v = chip["valid"]
    vvs = smooth(chip["vv"], v)
    if method == "threshold":
        water = vvs < thr
    elif method == "hysteresis":
        water = hysteresis_water(vvs, v, thr, kw.pop("strict_db", STRICT_DB), kw.pop("loose_db", LOOSE_DB))
    elif method == "learned":
        f = features(chip, thr)
        water = model.predict_proba(f.reshape(-1, f.shape[-1]))[:, 1].reshape(v.shape) >= prob
    else:
        raise ValueError(method)
    mask, drops = postprocess(water, chip, **kw)
    return mask, drops, vvs


def _utm_epsg(lon, lat):
    return (32600 if lat >= 0 else 32700) + int((lon + 180) // 6) + 1


def polygons(mask, vvs, thr, transform, crs):
    """Vectorise and attribute. Areas are computed in the local UTM zone."""
    import geopandas as gpd
    feats = [shape(g) for g, val in shapes(mask.astype(np.uint8), mask=mask, transform=transform) if val == 1]
    if not feats:
        return []
    gdf = gpd.GeoDataFrame(geometry=feats, crs=crs)
    wgs = gdf.to_crs(4326)
    if gdf.crs.is_projected:              # already in metres (e.g. OPERA RTC-S1 in UTM)
        utm = gdf
    else:                                 # degrees (e.g. Sen1Floods11): measure in the local UTM zone
        c = wgs.union_all().centroid
        utm = gdf.to_crs(_utm_epsg(c.x, c.y))
    out = []
    for g, gu, gw in zip(gdf.geometry, utm.geometry, wgs.geometry):
        m = rasterio.features.geometry_mask([g], mask.shape, transform, invert=True)
        mean_db = float(vvs[m].mean())
        depth = thr - mean_db                      # dB below the water threshold
        conf = float(np.clip(0.5 + depth / 8.0, 0.5, 0.99))
        area_ha = gu.area / 1e4
        tier = next(t for lim, t in TIERS_HA if area_ha >= lim)
        out.append(dict(
            geometry=mapping(g.simplify(transform.a, preserve_topology=True)),
            properties=dict(
                area_m2=round(gu.area, 1), area_ha=round(area_ha, 2), mean_vv_db=round(mean_db, 2),
                depth_db=round(depth, 2), confidence=round(conf, 2), needs_review=bool(conf < 0.7),
                centroid_lat=round(gw.centroid.y, 6), centroid_lon=round(gw.centroid.x, 6),
                change_type="water_gain", tier=tier,
                reason=f"radar backscatter {mean_db:.1f} dB, {depth:.1f} dB below the event water "
                       f"threshold ({thr:.1f} dB); grown from a seed {STRICT_DB:.0f} dB darker; "
                       f"not permanent water (JRC)")))
    out.sort(key=lambda f: -f["properties"]["area_m2"])
    for i, f in enumerate(out, 1):
        f["properties"]["id"] = i
    return out


def scores(pred, chip):
    """IoU / precision / recall against hand labels, all water and flood-only."""
    if chip["label"] is None:
        return None
    v = chip["valid"]
    gt = (chip["label"] == 1) & v

    def s(p, g):
        tp, fp, fn = int((p & g).sum()), int((p & ~g).sum()), int((~p & g).sum())
        return dict(tp=tp, fp=fp, fn=fn, iou=round(tp / max(tp + fp + fn, 1), 3),
                    precision=round(tp / max(tp + fp, 1), 3), recall=round(tp / max(tp + fn, 1), 3))
    nf = v & ~chip["perm"] if chip["perm"] is not None else v
    return dict(all_water=s(pred & v, gt), flood_only=s(pred & nf, gt & nf))
