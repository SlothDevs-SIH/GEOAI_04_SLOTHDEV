"""Radar before/after mode, the runner, frozen parameters and calibration, on synthetic dB scenes."""
import json

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from engine import radar, radar_run

T = from_origin(500000.0, 2950000.0, 10.0, 10.0)
THR = -16.0          # explicit: Otsu on a synthetic scene with a clean gap is ambiguous, and these tests are about the logic
LAKE, TARMAC, FLOOD = (slice(20, 60), slice(20, 60)), (slice(20, 60), slice(100, 140)), (slice(100, 150), slice(60, 130))


def scene(path, flood=True, lake=True, tarmac=True, shift=0, seed=0, transient=None):
    """Land -8 dB; a permanent lake and dark tarmac on both dates; a new flood only on the event date."""
    rng = np.random.default_rng(seed)
    vv = rng.normal(-8, 1.0, (200, 200)).astype(np.float32)
    if lake:
        vv[LAKE] = rng.normal(-24, 1.0, (40, 40))
    if tarmac:
        vv[TARMAC] = rng.normal(-25, 1.0, (40, 40))
    if flood:
        vv[FLOOD] = rng.normal(-24, 1.0, (50, 70))
    if transient is not None:
        vv[transient] = rng.normal(-24, 1.0, vv[transient].shape)
    with rasterio.open(path, "w", driver="GTiff", height=200, width=200, count=2, dtype="float32", crs="EPSG:32646",
                       transform=from_origin(500000.0 + 10 * shift, 2950000.0, 10, 10), nodata=np.nan) as d:
        d.write(np.stack([vv, vv - 6]))
    return str(path)


@pytest.fixture
def pair(tmp_path):
    after = scene(tmp_path / "after.tif", flood=True, seed=1)
    before = scene(tmp_path / "before.tif", flood=False, seed=2)
    return before, after


def centroid_in(feat, rows, cols):
    lon, lat = feat["properties"]["centroid_lon"], feat["properties"]["centroid_lat"]
    from pyproj import Transformer
    x, y = Transformer.from_crs(4326, 32646, always_xy=True).transform(lon, lat)
    col, row = (x - 500000) / 10, (2950000 - y) / 10
    return rows.start <= row < rows.stop and cols.start <= col < cols.stop


def test_single_date_cannot_tell_a_flood_from_a_lake_or_tarmac(pair):
    chip = radar.load_chip(pair[1])
    thr = THR
    mask, drops, vvs = radar.flood_mask(chip, thr)
    feats = radar.polygons(mask, vvs, thr, chip["transform"], chip["crs"])
    assert len(feats) == 3                                           # the premise: three dark blobs, one is a flood


def test_polygon_geometry_is_wgs84_even_for_a_projected_raster(pair):
    """Regression: polygons() once returned UTM metres labelled as GeoJSON for projected inputs."""
    chip = radar.load_chip(pair[1])
    thr = THR
    mask, _, vvs = radar.flood_mask(chip, thr)
    feats = radar.polygons(mask, vvs, thr, chip["transform"], chip["crs"])
    xs = [c[0] for f in feats for ring in f["geometry"]["coordinates"] for c in ring]
    ys = [c[1] for f in feats for ring in f["geometry"]["coordinates"] for c in ring]
    assert 92 < min(xs) and max(xs) < 94 and 26 < min(ys) and max(ys) < 28       # UTM 46N near 93 E, 26.6 N
    p = feats[0]["properties"]
    assert 92 < p["centroid_lon"] < 94 and 26 < p["centroid_lat"] < 28


def test_before_after_keeps_only_the_new_water(pair):
    before, after = pair
    chip = radar.load_chip(after)
    ref = radar.load_reference(before, chip)
    thr = THR
    mask, drops, vvs, ref_s = radar.flood_change_mask(chip, ref, thr)
    feats = radar.polygons(mask, vvs, thr, chip["transform"], chip["crs"], ref_s)
    assert len(feats) == 1 and centroid_in(feats[0], FLOOD[0], FLOOD[1])
    p = feats[0]["properties"]
    assert p["mean_ref_vv_db"] == pytest.approx(-8, abs=1) and p["drop_db"] < -9
    assert "darker than the dry-season reference" in p["reason"] and "JRC" not in p["reason"]
    assert drops["already_water_before"] > 0 and drops["no_reference"] == 0
    assert not mask[LAKE].any() and not mask[TARMAC].any() and mask[FLOOD].mean() > 0.9


def test_a_stricter_change_criterion_removes_the_flood_and_says_why(pair):
    before, after = pair
    chip = radar.load_chip(after)
    ref = radar.load_reference(before, chip)
    thr = THR
    mask, drops, *_ = radar.flood_change_mask(chip, ref, thr, change_db=20.0)
    assert not mask.any() and drops["backscatter_drop_too_small"] > 0


def test_median_of_several_references_ignores_a_one_off_dark_patch(tmp_path):
    after = scene(tmp_path / "after.tif", flood=True, seed=1)
    refs = [scene(tmp_path / f"r{i}.tif", flood=False, seed=10 + i, transient=FLOOD if i == 0 else None) for i in range(3)]
    chip = radar.load_chip(after)
    thr = THR
    one = radar.flood_change_mask(chip, radar.load_reference(refs[0], chip), thr)[0]
    med = radar.flood_change_mask(chip, radar.load_reference(refs, chip), thr)[0]
    assert one[FLOOD].mean() < 0.1 and med[FLOOD].mean() > 0.9        # one scene hides the flood; the median does not
    assert radar.load_reference(refs, chip)["n_scenes"] == 3


def test_reference_on_a_shifted_grid_is_resampled_and_uncovered_pixels_are_dropped(tmp_path):
    after = scene(tmp_path / "after.tif", flood=True, seed=1)
    before = scene(tmp_path / "before.tif", flood=False, shift=40, seed=2)       # 400 m east: left strip uncovered
    chip = radar.load_chip(after)
    ref = radar.load_reference(before, chip)
    assert not ref["valid"][:, :30].any() and ref["valid"][:, 60:].all()
    thr = THR
    _, drops, *_ = radar.flood_change_mask(chip, ref, thr)
    assert drops["no_reference"] > 0                                  # the lake and tarmac on the left strip
    with pytest.raises(ValueError, match="no reference"):
        radar.load_reference([], chip)


def test_run_before_after_writes_the_standard_files_and_seam_5_keys(pair, tmp_path):
    before, after = pair
    out = tmp_path / "out"
    s = radar_run.run(before, after, str(out), preset="flood", threshold_db=THR)
    for f in ("changes.geojson", "changes.gpkg", "changes.csv", "changes.kml", "summary.json", "audit.json", "report.pdf"):
        assert (out / f).exists() and (out / f).stat().st_size > 0, f
    for k in ("mode", "preset", "raw_detections", "after_filter", "dropped", "total_area_m2", "by_tier", "by_type",
              "runtime_s", "area_km2", "s_per_km2", "change_threshold", "impact", "quality", "warnings", "sources",
              "limits", "params"):
        assert k in s, k
    assert s["mode"] == "radar" and s["variant"] == "before_after" and s["after_filter"] == 1
    assert s["raw_detections"] >= s["after_filter"] and s["impact"]["cropland_ha"] is None   # unknown, not zero
    assert s["quality"]["reference_scenes"] == 1 and s["params"]["threshold_db"] == s["threshold_db"]
    gj = json.loads((out / "changes.geojson").read_text())
    props = gj["features"][0]["properties"]
    for k in ("id", "area_m2", "area_ha", "magnitude", "confidence", "needs_review", "centroid_lat", "centroid_lon",
              "change_type", "reason", "score", "tier", "review_status"):
        assert k in props, k                                          # Seam 4
    assert props["change_type"] == "water_gain" and props["review_status"] == "pending"
    audit = json.loads((out / "audit.json").read_text())
    assert set(audit["inputs"]) == {"after.tif", "before.tif"}
    assert (out / "report.pdf").read_bytes()[:4] == b"%PDF"


def test_run_single_date_is_the_fallback_and_warns(pair, tmp_path):
    s = radar_run.run(None, pair[1], str(tmp_path / "o"), threshold_db=THR)
    assert s["variant"] == "single_date" and s["after_filter"] == 3 and s["quality"]["reference_scenes"] == 0
    assert any("single-date" in w for w in s["warnings"])


def test_run_with_no_water_still_writes_valid_outputs(tmp_path):
    dry = scene(tmp_path / "dry.tif", flood=False, lake=False, tarmac=False)
    s = radar_run.run(None, dry, str(tmp_path / "o"), threshold_db=-15.0)
    assert s["after_filter"] == 0 and s["by_tier"] == {} and s["total_area_m2"] == 0.0
    assert json.loads((tmp_path / "o" / "changes.geojson").read_text())["features"] == []


def test_overrides_beat_frozen_params_and_a_given_threshold_is_used(pair, tmp_path):
    s = radar_run.run(pair[0], pair[1], str(tmp_path / "o"), threshold_db=-14.0, change_db=20.0)
    assert s["threshold_db"] == -14.0 and s["after_filter"] == 0 and s["params"]["change_db"] == 20.0


def test_frozen_params_file_and_defaults(tmp_path):
    p = radar_run.frozen_params()
    assert p["strict_db"] == 3.0 and p["threshold_db"] is None            # method frozen; threshold is per event
    assert radar_run.frozen_params(str(tmp_path / "missing.json"))["change_db"] == radar.CHANGE_DB
    frozen = json.load(open(radar_run.PARAMS_PATH))
    assert frozen["labels_used"] is False and "Otsu" in frozen["threshold_rule"]


def test_calibrate_freezes_once_and_records_a_forced_refreeze(pair, tmp_path):
    from ml import m8_calibrate as C
    exp = tmp_path / "exp.json"
    exp.write_text(json.dumps({"hysteresis": {"strict_db": 3.0, "loose_db": 0.0, "chosen_on": "valid"}}))
    out = tmp_path / "params.json"
    r = C.calibrate([pair[1]], "synthetic", out=str(out), experiments=str(exp))
    assert r["threshold_db"] is None and r["labels_used"] is False and -28 < r["calibration_event"]["otsu_threshold_db"] < -8
    with pytest.raises(SystemExit, match="frozen"):
        C.calibrate([pair[1]], "synthetic", out=str(out), experiments=str(exp))
    again = C.calibrate([pair[1]], "synthetic", out=str(out), experiments=str(exp), force=True)
    assert again["refrozen_over"] == r["frozen_utc"]
