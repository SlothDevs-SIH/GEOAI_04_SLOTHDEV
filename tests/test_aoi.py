"""Tests for analysing any area: box validation, date handling, scene choice and the fetch of a pair.

The satellite archive is never touched: search, cloud reads and band reads are replaced by fakes.
"""
from datetime import date

import numpy as np
import pytest
from conftest import SOIL, TRANSFORM, make_stack

from engine import aoi, ingest, s2


def scene(sid, d, cloud=5.0, baseline="05.00"):
    return s2.Scene(id=sid, prefix=f"x/{sid}/", date=d, cloud_pct=cloud, baseline=baseline, offset_applied=False)


def fake_search(scenes):
    return lambda tile, months, max_cloud=20.0, bbox_ll=None: list(scenes)


def clear(_scene, _bbox):
    return np.full((50, 50), 4, np.uint8)


# ---------------------------------------------------------------- box and dates
def test_valid_box_is_returned_as_floats():
    assert aoi.validate_bbox(["77.1", "28.5", "77.2", "28.6"]) == (77.1, 28.5, 77.2, 28.6)


@pytest.mark.parametrize("bad,words", [
    ([77.2, 28.5, 77.1, 28.6], "outside valid"),            # west is not below east
    ([77.0, 28.0, 77.5, 28.5], "limit"),                    # about 50 km wide
    ([77.100, 28.500, 77.101, 28.501], "at least"),         # about 100 m
    ([77.1, 28.5, 77.2], "four numbers"),
    (["a", "b", "c", "d"], "four numbers"),
    ([float("nan"), 28.5, 77.2, 28.6], "invalid number"),
    ([-190, 28.5, -189.9, 28.6], "outside valid"),
])
def test_bad_boxes_are_rejected_with_a_clear_message(bad, words):
    with pytest.raises(aoi.AoiError, match=words):
        aoi.validate_bbox(bad)


def test_size_is_in_kilometres():
    w, h = aoi.size_km((77.0, 28.0, 77.1, 28.1))
    assert 9.5 < w < 10.0 and 10.9 < h < 11.2          # 0.1 degree is about 11 km, a little less across at 28 N


def test_dates_are_checked():
    assert aoi.parse_date("2025-02-17", "d") == date(2025, 2, 17)
    with pytest.raises(aoi.AoiError, match="date like"):
        aoi.parse_date("yesterday", "after date")
    with pytest.raises(aoi.AoiError, match="before 2017"):
        aoi.parse_date("2015-01-01", "before date")
    with pytest.raises(aoi.AoiError, match="future"):
        aoi.parse_date("2999-01-01", "after date")


def test_months_cover_the_window_across_a_year_end():
    assert aoi.months_for(date(2025, 1, 5), 20) == [(2024, 12), (2025, 1), (2025, 2)] or \
        aoi.months_for(date(2025, 1, 5), 20) == [(2024, 12), (2025, 1)]
    ms = aoi.months_for(date(2025, 1, 5), 20)
    assert (2024, 12) in ms and (2025, 1) in ms


# ---------------------------------------------------------------- tiles
@pytest.mark.parametrize("name,lat,lon,prefix", [
    ("Delhi", 28.61, 77.21, "43R"), ("Mumbai", 19.07, 72.88, "43Q"), ("Bengaluru", 12.97, 77.59, "43P"),
    ("Chennai", 13.08, 80.27, "44P"), ("Kolkata", 22.57, 88.36, "45Q"), ("Guwahati", 26.14, 91.74, "46R"),
    ("Jaipur", 26.91, 75.79, "43R"), ("Kochi", 9.93, 76.27, "43P"),
])
def test_indian_regions_map_to_the_right_sentinel_zone_and_band(name, lat, lon, prefix):
    box = (lon - 0.03, lat - 0.03, lon + 0.03, lat + 0.03)
    tiles = aoi.candidate_tiles(box)
    assert tiles[0].startswith(prefix), (name, tiles)


def test_a_box_on_a_tile_edge_gives_more_than_one_candidate():
    # 78.0 E is a 100 km square boundary in zone 43 near x = 300 km; pick a box straddling a square edge
    tiles = aoi.candidate_tiles((72.0, 19.0, 72.1, 19.1))
    assert len(tiles) >= 1 and len(set(tiles)) == len(tiles)


# ---------------------------------------------------------------- scene choice
def test_scenes_outside_the_window_are_ignored_and_clearest_comes_first():
    target = date(2025, 2, 17)
    found = aoi.find_scenes((77.1, 28.5, 77.2, 28.6), target, 20, search_fn=fake_search([
        scene("far", date(2025, 4, 1), 1), scene("near_cloudy", date(2025, 2, 16), 40),
        scene("near_clear", date(2025, 2, 10), 2), scene("same_clear_later", date(2025, 2, 25), 2)]))
    assert [s.id for s in found] == ["near_clear", "same_clear_later", "near_cloudy"]


def test_the_scene_with_the_clearest_sky_over_the_box_wins():
    target = date(2025, 2, 17)
    cloudy = np.full((50, 50), 9, np.uint8)
    scl = {"a": cloudy, "b": clear(None, None)}
    c = aoi.choose_scene((77.1, 28.5, 77.2, 28.6), target, search_fn=fake_search(
        [scene("a", date(2025, 2, 17), 1), scene("b", date(2025, 2, 12), 3)]), scl_fn=lambda sc, bb: scl[sc.id])
    assert c["scene"].id == "b" and c["aoi_invalid_pct"] == 0 and c["days_from_target"] == -5


def test_no_scene_gives_a_helpful_error():
    with pytest.raises(aoi.AoiError, match="no Sentinel-2 scene covers"):
        aoi.choose_scene((77.1, 28.5, 77.2, 28.6), date(2025, 2, 17), search_fn=fake_search([]), scl_fn=clear)


def test_a_box_that_is_mostly_cloud_is_refused():
    cloudy = lambda sc, bb: np.full((50, 50), 9, np.uint8)  # noqa: E731
    with pytest.raises(aoi.AoiError, match="cloud or no-data"):
        aoi.choose_scene((77.1, 28.5, 77.2, 28.6), date(2025, 2, 17),
                         search_fn=fake_search([scene("a", date(2025, 2, 17))]), scl_fn=cloudy)


def test_an_unreadable_scene_is_skipped_not_fatal():
    def scl(sc, bb):
        if sc.id == "bad":
            raise OSError("404")
        return clear(sc, bb)
    c = aoi.choose_scene((77.1, 28.5, 77.2, 28.6), date(2025, 2, 17), search_fn=fake_search(
        [scene("bad", date(2025, 2, 17), 0), scene("good", date(2025, 2, 15), 4)]), scl_fn=scl)
    assert c["scene"].id == "good"


def test_pair_warnings():
    bbox = (77.1, 28.5, 77.2, 28.6)
    mk = lambda d, inv: {"scene": scene("x", d), "aoi_invalid_pct": inv, "days_from_target": 0}  # noqa: E731
    w = aoi.check_pair(mk(date(2025, 2, 1), 40.0), mk(date(2025, 2, 10), 0.0), bbox)
    text = " ".join(w)
    assert "before image is 40% cloud" in text and "only 9 days" in text
    assert aoi.check_pair(mk(date(2019, 1, 25), 0.0), mk(date(2025, 2, 17), 0.0), bbox) == []


# ---------------------------------------------------------------- preview and fetch
def test_preview_needs_the_before_date_to_be_earlier():
    with pytest.raises(aoi.AoiError, match="earlier"):
        aoi.preview((77.1, 28.5, 77.2, 28.6), "2025-02-17", "2025-01-01")


def test_preview_describes_both_dates_without_reading_bands():
    scenes = [scene("early", date(2019, 1, 25), 1), scene("late", date(2025, 2, 17), 1)]
    search = lambda tile, months, max_cloud=20.0, bbox_ll=None: [s for s in scenes if (s.date.year, s.date.month) in months]  # noqa: E731
    p = aoi.preview((77.1, 28.5, 77.2, 28.6), "2019-01-25", "2025-02-17", search_fn=search, scl_fn=clear)
    assert p["before"]["scene"] == "early" and p["after"]["scene"] == "late"
    assert p["size_km"][0] < aoi.MAX_SIDE_KM and p["warnings"] == []


def test_fetch_pair_writes_two_stacks_the_engine_can_read(tmp_path):
    scenes = [scene("early", date(2019, 1, 25), 1), scene("late", date(2025, 2, 17), 1)]
    search = lambda tile, months, max_cloud=20.0, bbox_ll=None: [s for s in scenes if (s.date.year, s.date.month) in months]  # noqa: E731

    def read(sc, bbox):
        path = make_stack(str(tmp_path / f"{sc.id}.tif"), SOIL, seed=1)
        import rasterio
        with rasterio.open(path) as src:
            data = src.read()
        return data[:5].astype(np.float32) / 10000.0, data[5], TRANSFORM, rasterio.crs.CRS.from_epsg(32643)

    meta = aoi.fetch_pair((77.1, 28.5, 77.2, 28.6), "2019-01-25", "2025-02-17", str(tmp_path / "out"),
                          search_fn=search, scl_fn=clear, read_fn=read)
    assert meta["before"]["scene"] == "early" and meta["after"]["scene"] == "late"
    pair = ingest.read_pair(str(tmp_path / "out" / "before.tif"), str(tmp_path / "out" / "after.tif"))
    assert pair.before.shape == (5, 120, 120) and pair.bands[:3] == ("blue", "green", "red")
