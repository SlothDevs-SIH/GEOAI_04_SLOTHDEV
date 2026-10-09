"""Unit tests for engine/radar.py on synthetic Sentinel-1 chips (no network, no data files)."""
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from engine import radar

PX = 10.0
TRANSFORM = from_origin(500000.0, 2950000.0, PX, PX)   # UTM 46N metres, 10 m pixels


def synthetic_chip(seed=0, perm=False):
    """Land ~ -8 dB with speckle; a 60x60 px (36 ha) flood square ~ -20 dB; optional permanent river."""
    rng = np.random.default_rng(seed)
    vv = rng.normal(-8, 1.5, (200, 200)).astype(np.float32)
    vv[50:110, 50:110] = rng.normal(-20, 1.5, (60, 60))
    perm_mask = np.zeros((200, 200), bool)
    if perm:
        vv[150:160, :] = rng.normal(-22, 1.0, (10, 200))
        perm_mask[150:160, :] = True
    label = np.zeros((200, 200), np.int16)
    label[50:110, 50:110] = 1
    if perm:
        label[150:160, :] = 1
    return dict(vv=vv, vh=vv - 6, valid=np.ones_like(perm_mask), label=label,
                perm=perm_mask if perm else None, transform=TRANSFORM, crs=rasterio.crs.CRS.from_epsg(32646))


def test_event_threshold_separates_water_from_land():
    thr = radar.event_threshold([synthetic_chip(1), synthetic_chip(2)])
    assert -18 < thr < -10


def test_flood_mask_finds_the_flood_square():
    c = synthetic_chip()
    thr = radar.event_threshold([c])
    mask, drops, _ = radar.flood_mask(c, thr)
    s = radar.scores(mask, c)["all_water"]
    assert s["iou"] > 0.9
    assert s["precision"] > 0.95


def test_permanent_water_is_removed():
    c = synthetic_chip(perm=True)
    mask, drops, _ = radar.flood_mask(c, radar.event_threshold([c]))
    assert not mask[150:160, :].any()
    assert drops["permanent_water"] > 0
    assert mask[60:100, 60:100].all()


def test_min_area_drops_small_blobs():
    c = synthetic_chip()
    c["vv"][10:13, 10:13] = -22          # 9 px = 900 m2 < 2000 m2
    mask, drops, _ = radar.flood_mask(c, -14.0)
    assert not mask[10:13, 10:13].any()


def test_polygon_area_and_attributes():
    c = synthetic_chip()
    thr = radar.event_threshold([c])
    mask, _, vvs = radar.flood_mask(c, thr)
    feats = radar.polygons(mask, vvs, thr, c["transform"], c["crs"])
    assert len(feats) == 1
    p = feats[0]["properties"]
    assert p["area_m2"] == pytest.approx(60 * 60 * PX * PX, rel=0.1)
    assert p["tier"] == "high"                        # 36 ha: 10-50 ha band
    assert 0.5 <= p["confidence"] <= 0.99
    assert "below the event water threshold" in p["reason"]
    assert p["mean_vv_db"] < thr


def test_naive_baseline_overflags_a_dry_chip():
    """Per-chip Otsu forces a split even when there is no water: the false-alarm problem M8 fixes."""
    rng = np.random.default_rng(3)
    dry = dict(vv=rng.normal(-8, 1.5, (200, 200)).astype(np.float32), valid=np.ones((200, 200), bool),
               perm=None, label=np.zeros((200, 200), np.int16), transform=TRANSFORM, crs=None)
    assert radar.naive_mask(dry).mean() > 0.2
    mask, _, _ = radar.flood_mask(dry, -14.0)
    assert mask.sum() == 0


def test_hysteresis_grows_connected_edges_but_not_isolated_dark_patches():
    """Region growing keeps a flood's slightly-less-dark edge (connected to a dark seed) and drops an
    isolated patch that is only slightly below the threshold."""
    thr = -14.0
    vv = np.full((100, 100), -8.0, np.float32)
    vv[20:40, 20:40] = -20.0          # core: 6 dB below threshold -> seed
    vv[20:40, 40:50] = -14.5          # edge: just below threshold, touches the core
    vv[70:85, 70:85] = -14.5          # isolated, just below threshold, no seed
    chip = dict(vv=vv, valid=np.ones_like(vv, bool), perm=None, label=None, transform=TRANSFORM, crs=None)
    grown = radar.hysteresis_water(radar.smooth(vv, chip["valid"]), chip["valid"], thr)
    assert grown[25:35, 42:48].all()
    assert not grown[72:83, 72:83].any()
    plain = radar.smooth(vv, chip["valid"]) < thr
    assert plain[72:83, 72:83].all()  # the plain threshold would have kept the isolated patch


def test_flood_mask_rejects_unknown_method():
    with pytest.raises(ValueError):
        radar.flood_mask(synthetic_chip(), -14.0, method="magic")
