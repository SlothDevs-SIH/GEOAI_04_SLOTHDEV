"""eval/m8_opera.py on a synthetic event with a label raster, check points and a dry-season pair."""
import json

import numpy as np
import pytest
import rasterio
from pyproj import Transformer

from eval import m8_opera
from tests.test_radar_change import FLOOD, THR, scene


@pytest.fixture
def event(tmp_path):
    after = scene(tmp_path / "after.tif", flood=True, seed=1)
    refs = [scene(tmp_path / f"r{i}.tif", flood=False, seed=20 + i) for i in range(3)]
    dry = scene(tmp_path / "dry.tif", flood=False, seed=5)
    gt = np.zeros((200, 200), np.uint8)
    gt[FLOOD] = 1                                                   # the labelled flood
    with rasterio.open(after) as s:
        profile = dict(s.profile, count=1, dtype="uint8", nodata=255)
    with rasterio.open(tmp_path / "gt.tif", "w", **profile) as d:
        d.write(gt, 1)
    to_ll = Transformer.from_crs(32646, 4326, always_xy=True).transform

    def pt(row, col, flooded):
        lon, lat = to_ll(500000 + 10 * col + 5, 2950000 - 10 * row - 5)
        return {"type": "Feature", "properties": {"flooded": flooded}, "geometry": {"type": "Point", "coordinates": [lon, lat]}}
    pts = {"type": "FeatureCollection", "features": [pt(120, 90, True), pt(130, 100, True), pt(30, 30, False), pt(180, 20, False)]}
    (tmp_path / "pts.geojson").write_text(json.dumps(pts))
    return dict(after=after, before=refs, labels=str(tmp_path / "gt.tif"), points=str(tmp_path / "pts.geojson"), dry_after=dry), tmp_path


def test_scores_labels_points_and_dry_season_false_alarms(event, tmp_path):
    kw, tmp = event
    r = m8_opera.run("synthetic", out_dir=str(tmp / "res"), threshold_db=THR, **kw)
    assert r["labels"]["iou"] > 0.85 and r["labels"]["precision"] > 0.9 and r["labels"]["recall"] > 0.9
    p = r["points"]
    assert p["flooded_points"] == 2 and p["flooded_detected"] == 2 and p["dry_points"] == 2 and p["dry_flagged"] == 0
    assert r["dry_season_pair"]["false_alarm_polygons"] == 0                # the lake is dark on both dates: not new water
    # single-date mapping on the same data cannot tell lake or tarmac from a flood: that is what the reference buys
    assert r["before_after"]["polygons"] == 1 and r["single_date"]["polygons"] == 3
    assert r["dry_season_pair"]["single_date_polygons"] == 2 and r["dry_season_pair"]["single_date_per_km2"] > 0
    assert r["params_source"].startswith("engine/params_m8.json") and r["params"]["strict_db"] == 3.0
    saved = json.loads((tmp / "res" / "m8_opera_2026_synthetic.json").read_text())
    assert saved["event"] == "synthetic" and saved["area_km2"] > 0


def test_dry_season_scene_with_a_real_change_is_reported_as_false_alarms(event):
    kw, tmp = event
    kw = dict(kw, dry_after=scene(tmp / "dry2.tif", flood=True, seed=6))      # pretend the 'dry' scene has new water
    r = m8_opera.run("dry_bad", out_dir=str(tmp / "res"), threshold_db=THR, **kw)
    assert r["dry_season_pair"]["false_alarm_polygons"] == 1 and r["dry_season_pair"]["false_alarms_per_km2"] > 0


def test_an_event_is_scored_once_unless_forced_and_the_rerun_is_recorded(event):
    kw, tmp = event
    m8_opera.run("once", out_dir=str(tmp / "res"), threshold_db=THR, **kw)
    with pytest.raises(SystemExit, match="already scored"):
        m8_opera.run("once", out_dir=str(tmp / "res"), threshold_db=THR, **kw)
    assert m8_opera.run("once", out_dir=str(tmp / "res"), threshold_db=THR, force=True, **kw)["forced_rerun"] is True


def test_labels_outside_coverage_are_ignored_not_counted_as_dry(event):
    kw, tmp = event
    with rasterio.open(kw["labels"], "r+") as d:                              # blank out the flood's label coverage
        a = d.read(1)
        a[:, :] = 255
        a[0:50, 0:50] = 0
        d.write(a, 1)
    r = m8_opera.run("cov", out_dir=str(tmp / "res"), threshold_db=THR, **{**kw, "points": None, "dry_after": None})
    assert r["labels"]["covered_km2"] == pytest.approx(0.25, abs=0.01)         # only the 50 x 50 px block is covered
    assert r["labels"]["precision"] == 0.0 and r["labels"]["recall"] == 0.0


def test_source_switch_names_the_result_file_and_records_where_the_scenes_came_from(event):
    kw, tmp = event
    r = m8_opera.run("assam_2024", out_dir=str(tmp / "res"), threshold_db=THR, source="mpc", **{**kw, "points": None, "labels": None})
    assert (tmp / "res" / "m8_mpc_assam_2024.json").exists() and "Planetary Computer" in r["source"]
    assert m8_opera.run("x", out_dir=str(tmp / "res"), threshold_db=THR, **{**kw, "points": None, "labels": None})["source"].startswith("NASA OPERA")
    assert (tmp / "res" / "m8_opera_2026_x.json").exists()
