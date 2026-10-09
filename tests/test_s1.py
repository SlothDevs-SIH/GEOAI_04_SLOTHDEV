"""engine/s1.py offline: dB conversion, reference selection, STAC search with a fake client, windowed read."""
from datetime import datetime, timezone
from types import SimpleNamespace

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import transform_bounds

from engine import s1


def test_to_db_masks_zero_negative_and_nan_before_the_log():
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("error")                      # a log of zero would raise a RuntimeWarning here
        out = s1.to_db(np.array([1.0, 0.1, 0.0, -0.5, np.nan, np.inf]))
    assert out[0] == pytest.approx(0.0) and out[1] == pytest.approx(-10.0)
    assert np.isnan(out[2:]).all() and not np.isinf(out).any()


def S(i, y, m, d, orbit=77, state="descending"):
    return s1.Scene(id=f"s{i}", datetime=datetime(y, m, d, tzinfo=timezone.utc), relative_orbit=orbit, orbit_state=state)


def test_pick_reference_matches_orbit_season_and_age_and_takes_the_closest():
    event = datetime(2025, 8, 12, tzinfo=timezone.utc)
    scenes = [S(1, 2025, 1, 5), S(2, 2025, 2, 10), S(3, 2025, 3, 3), S(4, 2024, 12, 20),      # dry season, right orbit
              S(5, 2025, 2, 9, orbit=12), S(6, 2025, 2, 9, state="ascending"),                  # wrong geometry
              S(7, 2025, 6, 1), S(8, 2025, 8, 20),                                              # monsoon / after the event
              S(9, 2023, 12, 1)]                                                                 # too old
    ref = s1.pick_reference(scenes, event, 77, "descending", n=3)
    assert [r.id for r in ref] == ["s3", "s2", "s1"]                                            # closest first
    assert len(s1.pick_reference(scenes, event, 77, "descending", n=2)) == 2


def test_pick_reference_raises_instead_of_returning_a_bad_reference():
    with pytest.raises(LookupError, match="no dry-season scenes"):
        s1.pick_reference([S(1, 2025, 7, 1)], datetime(2025, 8, 12, tzinfo=timezone.utc), 77, "descending")


class FakeItem:
    def __init__(self, i, dt, vh=True):
        self.id, self.datetime = i, dt
        self.properties = {"sat:relative_orbit": 77, "sat:orbit_state": "descending"}
        self.assets = {"vv": SimpleNamespace(href=f"https://x/{i}_vv.tif")}
        if vh:
            self.assets["vh"] = SimpleNamespace(href=f"https://x/{i}_vh.tif")


class FakeClient:
    def __init__(self, items):
        self.items, self.kw = items, None

    def search(self, **kw):
        self.kw = kw
        return SimpleNamespace(items=lambda: iter(self.items))


def test_search_mpc_builds_the_query_and_parses_items_newest_last():
    c = FakeClient([FakeItem("b", datetime(2025, 2, 1)), FakeItem("a", datetime(2025, 1, 1)), FakeItem("novh", datetime(2025, 3, 1), vh=False)])
    out = s1.search_mpc(s1.ASSAM_BOX, "2025-01-01", "2025-03-31", client=c)
    assert c.kw["collections"] == ["sentinel-1-rtc"] and c.kw["datetime"] == "2025-01-01/2025-03-31"
    assert c.kw["bbox"] == list(s1.ASSAM_BOX)
    assert [s.id for s in out] == ["a", "b"] and out[0].datetime.tzinfo is not None      # need both polarisations
    assert out[0].relative_orbit == 77 and out[0].orbit_state == "descending" and set(out[0].hrefs) == {"vv", "vh"}


def _linear_tif(path, vv, vh):
    t = from_origin(375000.0, 2892000.0, 10.0, 10.0)
    for p, a in ((path[0], vv), (path[1], vh)):
        with rasterio.open(p, "w", driver="GTiff", height=a.shape[0], width=a.shape[1], count=1, dtype="float32",
                           crs="EPSG:32646", transform=t, nodata=0) as d:
            d.write(a.astype(np.float32), 1)
    return t


def test_read_chip_reads_only_a_window_converts_to_db_and_masks_zeros(tmp_path):
    vv, vh = np.full((300, 300), 0.1, np.float32), np.full((300, 300), 0.01, np.float32)
    vv[100:120, 100:120] = 0                                   # nodata block
    paths = (str(tmp_path / "vv.tif"), str(tmp_path / "vh.tif"))
    _linear_tif(paths, vv, vh)
    # a lon/lat box around a 100 x 100 px area inside the raster
    bbox = transform_bounds("EPSG:32646", "EPSG:4326", 375500, 2890500, 376500, 2891500)
    out = s1.read_chip(paths[0], paths[1], bbox, str(tmp_path / "chip.tif"))
    with rasterio.open(out) as s:
        a = s.read()
        assert s.count == 2 and s.crs.to_epsg() == 32646 and 90 <= a.shape[1] <= 110
    assert np.nanmedian(a[0]) == pytest.approx(-10.0, abs=0.01) and np.nanmedian(a[1]) == pytest.approx(-20.0, abs=0.01)
    assert not np.isinf(a).any()
    from engine import radar
    chip = radar.load_chip(out)                                 # the radar engine can read it
    assert chip["vv"].shape == a.shape[1:] and chip["valid"].any()


def test_sign_function_is_applied_to_each_href(tmp_path):
    vv = np.full((50, 50), 0.1, np.float32)
    paths = (str(tmp_path / "vv.tif"), str(tmp_path / "vh.tif"))
    _linear_tif(paths, vv, vv)
    seen = []
    bbox = transform_bounds("EPSG:32646", "EPSG:4326", 375100, 2891600, 375400, 2891900)
    s1.read_chip(paths[0], paths[1], bbox, str(tmp_path / "c.tif"), sign=lambda h: (seen.append(h), h)[1])
    assert seen == [paths[0], paths[1]]


def test_opera_search_parses_results_and_download_needs_a_token(monkeypatch, tmp_path):
    fake = [SimpleNamespace(properties={"fileID": "OPERA_L2_RTC-S1_X", "startTime": "2026-07-02T00:11:22Z",
                                        "pathNumber": 77, "flightDirection": "DESCENDING", "url": "https://asf/x.h5"})]
    out = s1.search_opera(s1.ASSAM_BOX, "2026-06-01", "2026-08-31", results=fake)
    assert out[0].source == "opera" and out[0].orbit_state == "descending" and out[0].relative_orbit == 77
    monkeypatch.delenv("EARTHDATA_TOKEN", raising=False)
    with pytest.raises(PermissionError, match="EARTHDATA_TOKEN"):
        s1.download_opera(fake, str(tmp_path))
    monkeypatch.chdir(tmp_path)                                  # no .env here
    monkeypatch.setattr(s1.os.path, "isfile", lambda p: False)   # nor in the repository root
    r = s1.check_opera()
    assert r["ok"] is False and "EARTHDATA_TOKEN is not set" in r["error"]


def test_dotenv_is_loaded_without_overriding_and_never_echoed(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("\ufeff# comment\nEARTHDATA_TOKEN=\"abc.def.ghi\"\nexport OTHER=value with spaces\nEMPTY=\nnot a line\nPRESET=from_file\n",
                   encoding="utf-8")
    for k in ("EARTHDATA_TOKEN", "OTHER", "EMPTY"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("PRESET", "already_set")
    names = s1.load_dotenv([str(env)])
    import os
    assert os.environ["EARTHDATA_TOKEN"] == "abc.def.ghi" and os.environ["OTHER"] == "value with spaces"
    assert os.environ["PRESET"] == "already_set"                  # a real environment variable wins over the file
    assert "EMPTY" not in os.environ and sorted(names) == ["EARTHDATA_TOKEN", "OTHER"]
    assert "abc.def.ghi" not in repr(names)                       # only names come back, never values
    for k in ("EARTHDATA_TOKEN", "OTHER"):
        monkeypatch.delenv(k, raising=False)


def test_a_token_in_dotenv_reaches_the_opera_check(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("EARTHDATA_TOKEN=tok\n")
    monkeypatch.delenv("EARTHDATA_TOKEN", raising=False)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(s1, "search_opera", lambda *a, **k: [])    # no network: just prove the token was found
    r = s1.check_opera()
    assert r == {"ok": False, "scenes": 0, "first": None}
    monkeypatch.delenv("EARTHDATA_TOKEN", raising=False)


def test_inspect_opera_lists_only_known_fields_urls_and_property_names():
    fake = [SimpleNamespace(properties={"fileID": "OPERA_L2_RTC-S1_X", "url": "https://asf/x.h5", "bytes": 123, "secret_internal": "x",
                                        "additionalUrls": ["https://asf/x_VV.tif", "https://asf/x_VH.tif"], "pathNumber": 150,
                                        "flightDirection": "ASCENDING", "empty": ""},
                            geometry={"coordinates": [[[93.0, 26.0], [94.0, 26.0]]]})] * 5
    out = s1.inspect_opera(results=fake, n=2)
    assert len(out) == 2 and out[0]["additionalUrls"] == ["https://asf/x_VV.tif", "https://asf/x_VH.tif"]
    assert "secret_internal" not in out[0] and "secret_internal" in out[0]["_all_property_names"]   # names visible, values not
    assert out[0]["_geometry_bbox"] == [93.0, 26.0]
