"""Tests for ingest, change_spectral, filters, vectorise, attributes, quality, impact and the CLI."""
import json

import numpy as np
import pytest
import rasterio
from conftest import BUILT, CROP_GREEN, SOIL, TRANSFORM, VEG, WATER, make_stack
from rasterio.transform import from_origin

from engine import attributes, change_spectral, filters, impact, ingest, quality, run, vectorise
from engine.change_spectral import CODE
from engine.config import params_for


def _pair(tmp, before_patches, after_patches, base=SOIL, **kw):
    b = make_stack(str(tmp / "b.tif"), base, before_patches, seed=1, **kw)
    a = make_stack(str(tmp / "a.tif"), base, after_patches, seed=2, **kw)
    return b, a


# ---------------------------------------------------------------- ingest
def test_ingest_reads_stack_and_scl(tmp):
    b, a = _pair(tmp, [], [])
    p = ingest.read_pair(b, a)
    assert p.bands == ("blue", "green", "red", "nir", "swir1")
    assert p.before.shape == (5, 120, 120) and 0 < p.before.max() <= 1
    assert p.scl_before is not None and p.pixel_m == 10.0


def test_ingest_reprojects_mismatched_grid(tmp):
    b = make_stack(str(tmp / "b.tif"), SOIL)
    a = make_stack(str(tmp / "a.tif"), SOIL, shape=(60, 60), transform=from_origin(300000.0, 2100000.0, 20.0, 20.0))
    p = ingest.read_pair(b, a)
    assert p.after.shape == p.before.shape
    assert any("resampled" in w for w in p.warnings)


def test_shift_is_detected_and_corrected(tmp):
    patch = [((40, 80), (40, 80))]
    b = make_stack(str(tmp / "b.tif"), SOIL, [((40, 80, 40, 80), VEG)], seed=1)
    a = make_stack(str(tmp / "a.tif"), SOIL, [((40, 80, 43, 83), VEG)], seed=1)   # 3 px to the right
    p = ingest.read_pair(b, a)
    assert abs(abs(p.shift_px[1]) - 3) < 0.5 and abs(p.shift_px[0]) < 0.5
    assert any("shifted" in w for w in p.warnings)
    assert patch


# ---------------------------------------------------------------- change_spectral
@pytest.mark.parametrize("before_sig,after_sig,expected", [
    (SOIL, BUILT, "built_up_gain"),       # soil paved over (surface sealing)
    (SOIL, WATER, "water_gain"),          # flooding
    (VEG, SOIL, "vegetation_loss"),       # dense vegetation cleared
])
def test_change_types(tmp, before_sig, after_sig, expected):
    b, a = _pair(tmp, [((40, 80, 40, 80), before_sig)], [((40, 80, 40, 80), after_sig)])
    d = change_spectral.detect(ingest.read_pair(b, a), params_for("general"))
    core = d["type_map"][50:70, 50:70]
    assert np.mean(core == CODE[expected]) > 0.9
    assert d["candidate"][50:70, 50:70].all()


def test_harvest_is_not_called_construction(tmp):
    """Green crops -> bare soil raises the built-up index; it must not be typed built_up_gain."""
    b, a = _pair(tmp, [((40, 80, 40, 80), CROP_GREEN)], [((40, 80, 40, 80), SOIL)])
    d = change_spectral.detect(ingest.read_pair(b, a), params_for("encroachment"))
    assert not (d["type_map"][40:80, 40:80] == CODE["built_up_gain"]).any()


# ---------------------------------------------------------------- filters
def test_filters_keep_construction_drop_season_speckle_cloud(tmp):
    scl = np.full((120, 120), 4, np.uint16)
    scl[0:20, 0:20] = 9                                       # cloud in the after image
    before = [((40, 80, 40, 80), SOIL), ((90, 110, 90, 110), CROP_GREEN), ((5, 15, 5, 15), SOIL),
              ((100, 101, 10, 11), SOIL)]
    after = [((40, 80, 40, 80), BUILT), ((90, 110, 90, 110), VEG), ((5, 15, 5, 15), BUILT),
             ((100, 101, 10, 11), BUILT)]                     # 1-px speck
    b = make_stack(str(tmp / "b.tif"), SOIL, before, seed=1)
    a = make_stack(str(tmp / "a.tif"), SOIL, after, seed=2, scl=scl)
    pair = ingest.read_pair(b, a)
    p = params_for("encroachment")
    det = change_spectral.detect(pair, p)
    mask, tmap, drops, raw = filters.apply(det, pair, p)
    assert mask[45:75, 45:75].all()                           # construction kept
    assert not mask[90:110, 90:110].any()                     # greening dropped (seasonal / preset)
    assert not mask[5:15, 5:15].any() and drops["cloud"] > 0  # under cloud dropped
    assert not mask[100, 10]                                  # speck dropped
    assert raw >= 3 and filters.components(mask) == 1


# ---------------------------------------------------------------- vectorise + attributes
def test_polygon_area_reason_tier(tmp):
    b, a = _pair(tmp, [((40, 80, 40, 80), SOIL)], [((40, 80, 40, 80), BUILT)])
    pair = ingest.read_pair(b, a)
    p = params_for("encroachment")
    det = change_spectral.detect(pair, p)
    mask, tmap, _, _ = filters.apply(det, pair, p)
    polys, lab = vectorise.polygons(mask, pair.transform)
    gdf = attributes.build(polys, lab, det, tmap, pair, det["magnitude"][det["valid"]])
    assert len(gdf) == 1
    r = gdf.iloc[0]
    assert r["area_m2"] == pytest.approx(40 * 40 * 100, rel=0.05)    # 16 ha
    assert r["change_type"] == "built_up_gain" and "construction" in r["reason"]
    assert r["tier"] in ("critical", "high") and 0 <= r["confidence"] <= 1
    assert -90 < r["centroid_lat"] < 90 and gdf.crs.to_epsg() == 4326


def test_tier_boundaries():
    assert attributes.tier_of(20000) == "critical" and attributes.tier_of(19999) == "high"
    assert attributes.tier_of(5000) == "high" and attributes.tier_of(1500) == "medium"
    assert attributes.tier_of(0) == "low"


# ---------------------------------------------------------------- quality
def test_quality_flags_season_mismatch(tmp):
    b, a = _pair(tmp, [], [])
    q, warn = quality.flags(ingest.read_pair(b, a), "2024-11-19", "2025-03-14")
    assert q["season_before"] == "post-monsoon" and q["season_after"] == "summer"
    assert any("different seasons" in w for w in warn)


# ---------------------------------------------------------------- impact
def test_impact_cropland_from_worldcover(tmp):
    b, a = _pair(tmp, [((40, 80, 40, 80), SOIL)], [((40, 80, 40, 80), BUILT)])
    pair = ingest.read_pair(b, a)
    p = params_for("encroachment")
    det = change_spectral.detect(pair, p)
    mask, tmap, _, _ = filters.apply(det, pair, p)
    polys, lab = vectorise.polygons(mask, pair.transform)
    gdf = attributes.build(polys, lab, det, tmap, pair, det["magnitude"][det["valid"]])
    wc = np.full(mask.shape, 30, np.uint8)
    wc[40:60, 40:80] = impact.CROPLAND                      # half the change area was cropland
    imp = impact.compute(gdf, lab, pair.transform, pair.crs, mask.shape, wc)
    assert imp["cropland_ha"] == pytest.approx(8.0, rel=0.1)
    assert imp["buildings"] is None and imp["sources"]
    assert gdf.iloc[0]["cropland_ha"] == pytest.approx(8.0, rel=0.1)


def test_impact_without_worldcover_is_unknown_not_zero(tmp):
    import geopandas as gpd
    imp = impact.compute(gpd.GeoDataFrame(columns=["area_ha", "geometry"], geometry="geometry"),
                         np.zeros((5, 5), int), TRANSFORM, rasterio.crs.CRS.from_epsg(32643), (5, 5), None)
    assert imp["cropland_ha"] is None


def test_worldcover_tile_name():
    assert impact.wc_tile(18.99, 73.07) == "N18E072"
    assert impact.wc_tile(26.6, 93.0) == "N24E093"
    assert impact.wc_tile(-1.0, -60.5) == "S03W063"


# ---------------------------------------------------------------- end to end (CLI)
def test_cli_writes_all_outputs(tmp):
    b, a = _pair(tmp, [((40, 80, 40, 80), SOIL)], [((40, 80, 40, 80), BUILT)])
    out = tmp / "out"
    run.main([b, a, "--out", str(out), "--preset", "encroachment",
              "--before-date", "2019-01-10", "--after-date", "2025-01-12"])
    for f in ("changes.geojson", "changes.gpkg", "changes.csv", "changes.kml", "summary.json", "audit.json",
              "report.pdf"):
        assert (out / f).exists() and (out / f).stat().st_size > 0, f
    s = json.loads((out / "summary.json").read_text())
    assert s["after_filter"] == 1 and s["raw_detections"] >= 1 and s["mode"] == "spectral"
    assert (out / "report.pdf").read_bytes()[:4] == b"%PDF"
    gj = json.loads((out / "changes.geojson").read_text())
    props = gj["features"][0]["properties"]
    for k in ("id", "area_m2", "magnitude", "confidence", "needs_review", "centroid_lat", "centroid_lon",
              "change_type", "reason", "score", "tier", "review_status"):
        assert k in props, k
    audit = json.loads((out / "audit.json").read_text())
    assert set(audit["inputs"]) == {"b.tif", "a.tif"}


def test_mode_auto_rejects_unsupported_input(tmp):
    path = str(tmp / "x.tif")
    with rasterio.open(path, "w", driver="GTiff", height=10, width=10, count=2, dtype="float32",
                       crs="EPSG:32643", transform=TRANSFORM) as d:
        d.write(np.zeros((2, 10, 10), np.float32))
    with pytest.raises(ValueError):
        ingest.read_pair(path, path)
