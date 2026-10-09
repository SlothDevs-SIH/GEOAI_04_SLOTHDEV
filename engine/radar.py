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
# Before/after mode: new water must also be at least this much darker than the dry-season reference.
# 3 dB is the usual radar-flood change criterion (a factor of two in backscatter). It is a literature
# default, NOT tuned: Sen1Floods11 has no pre-event radar, so it cannot be fitted or measured there.
CHANGE_DB = 3.0


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


def load_reference(paths, like) -> dict:
    """Dry-season reference from one or more Sentinel-1 files (VV, VH in dB), resampled onto `like`'s grid.

    Several scenes are combined with a per-pixel median, which suppresses speckle and one-off events. Use
    scenes from the same relative orbit and direction as the after image so the viewing geometry matches.
    """
    from rasterio.warp import Resampling, reproject
    paths = [paths] if isinstance(paths, str) else list(paths)
    if not paths:
        raise ValueError("no reference scenes given")
    h, w = like["vv"].shape
    stacks = {"vv": [], "vh": []}
    for path in paths:
        with rasterio.open(path) as s:
            a = s.read([1, 2]).astype(np.float32)
            src_t, src_crs = s.transform, s.crs
        for i, k in enumerate(("vv", "vh")):
            out = np.full((h, w), np.nan, np.float32)
            reproject(a[i], out, src_transform=src_t, src_crs=src_crs, dst_transform=like["transform"],
                      dst_crs=like["crs"], resampling=Resampling.bilinear, src_nodata=np.nan, dst_nodata=np.nan)
            stacks[k].append(out)
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)               # all-NaN pixels are expected at scene edges
        vv, vh = (np.nanmedian(np.stack(stacks[k]), 0) for k in ("vv", "vh"))
    return dict(vv=vv, vh=vh, valid=np.isfinite(vv) & np.isfinite(vh), n_scenes=len(paths))


def flood_change_mask(chip, ref, thr, method="hysteresis", change_db=CHANGE_DB, **kw):
    """New open water: water on the after image that was NOT water on the dry-season reference.

    A pixel is kept only if (1) the single-date detector calls it water, (2) the reference at that pixel was
    not water (above the same threshold), and (3) it is at least `change_db` darker than the reference.
    This removes what single-date mapping cannot tell apart from a flood: permanent water without a JRC
    mask, radar shadow, smooth tarmac and dry sand, which are dark on both dates.
    Returns (mask, drop_counts, speckle-filtered VV after, speckle-filtered VV reference).
    """
    water, drops, vvs = flood_mask(chip, thr, method, **kw)
    ref_s = smooth(ref["vv"], ref["valid"])
    rv = ref["valid"]
    drop_db = vvs - ref_s                                             # negative = darker than the reference
    was_water = rv & (ref_s < thr)
    weak = rv & ~was_water & (drop_db > -change_db)
    drops["no_reference"] = int((water & ~rv).sum())
    drops["already_water_before"] = int((water & was_water).sum())
    drops["backscatter_drop_too_small"] = int((water & weak).sum())
    new = water & rv & ~was_water & (drop_db <= -change_db)
    mask, again = postprocess(new, chip, **{k: v for k, v in kw.items() if k in ("min_area_m2", "px_area_m2")})
    drops["speckle_morphology"] = drops.get("speckle_morphology", 0) + again["speckle_morphology"]
    drops["below_min_area"] = drops.get("below_min_area", 0) + again.get("below_min_area", 0)
    return mask, drops, vvs, ref_s


def _utm_epsg(lon, lat):
    return (32600 if lat >= 0 else 32700) + int((lon + 180) // 6) + 1


def polygons(mask, vvs, thr, transform, crs, ref_vvs=None):
    """Vectorise and attribute. Areas are computed in the local UTM zone.

    With `ref_vvs` (the speckle-filtered dry-season reference) every polygon also reports how far it fell
    from that reference, and its reason says so.
    """
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
    # output geometry is always WGS84 (GeoJSON): simplify in the source CRS, then reproject
    simple = gpd.GeoSeries([g.simplify(transform.a, preserve_topology=True) for g in gdf.geometry], crs=gdf.crs).to_crs(4326)
    out = []
    for g, gu, gw, gs in zip(gdf.geometry, utm.geometry, wgs.geometry, simple):
        m = rasterio.features.geometry_mask([g], mask.shape, transform, invert=True)
        mean_db = float(vvs[m].mean())
        depth = thr - mean_db                      # dB below the water threshold
        conf = float(np.clip(0.5 + depth / 8.0, 0.5, 0.99))
        area_ha = gu.area / 1e4
        tier = next(t for lim, t in TIERS_HA if area_ha >= lim)
        extra, ref_txt = {}, ""
        if ref_vvs is not None:
            ref_db = float(ref_vvs[m].mean())
            extra = dict(mean_ref_vv_db=round(ref_db, 2), drop_db=round(mean_db - ref_db, 2))
            ref_txt = f"{ref_db - mean_db:.1f} dB darker than the dry-season reference ({ref_db:.1f} dB), which was not water"
        out.append(dict(
            geometry=mapping(gs),
            properties=dict(
                area_m2=round(gu.area, 1), area_ha=round(area_ha, 2), mean_vv_db=round(mean_db, 2),
                depth_db=round(depth, 2), confidence=round(conf, 2), needs_review=bool(conf < 0.7),
                centroid_lat=round(gw.centroid.y, 6), centroid_lon=round(gw.centroid.x, 6),
                change_type="water_gain", tier=tier,
                reason=f"radar backscatter {mean_db:.1f} dB, {depth:.1f} dB below the event water "
                       f"threshold ({thr:.1f} dB); grown from a seed {STRICT_DB:.0f} dB darker; "
                       + (ref_txt or "not permanent water (JRC)"), **extra)))
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
