"""engine/s1.py offline: dB conversion, reference selection, STAC search with a fake client, windowed read."""
import os
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


BASE = "https://cumulus.asf.earthdatacloud.nasa.gov/OPERA/OPERA_L2_RTC-S1/"


def burst(i, t, path=150, direction="DESCENDING", with_vh=True):
    name = f"OPERA_L2_RTC-S1_T{path}-3209{i:02d}-IW1_{t}_20260804T043038Z_S1A_30_v1.0"
    urls = [f"{BASE}{name}/{name}.iso.xml", f"{BASE}{name}/{name}_VV.tif", f"{BASE}{name}/{name}_mask.tif"]
    if with_vh:
        urls.append(f"{BASE}{name}/{name}_VH.tif")
    return SimpleNamespace(properties={"fileID": name, "startTime": f"{t[:4]}-{t[4:6]}-{t[6:8]}T{t[9:11]}:{t[11:13]}:{t[13:15]}Z",
                                       "pathNumber": path, "flightDirection": direction, "operaBurstID": f"t{path}_3209{i:02d}_iw1",
                                       "additionalUrls": urls})


def test_opera_search_reads_the_real_listing_layout_and_skips_scenes_without_both_polarisations():
    fake = [burst(60, "20260626T235523Z"), burst(61, "20260626T235525Z"), burst(62, "20260626T235528Z", with_vh=False)]
    out = s1.search_opera(s1.ASSAM_BOX, "2026-06-01", "2026-08-31", results=fake)
    assert len(out) == 2 and out[0].source == "opera" and out[0].orbit_state == "descending" and out[0].relative_orbit == 150
    assert out[0].hrefs["vv"].endswith("_VV.tif") and out[0].hrefs["vh"].endswith("_VH.tif") and out[0].burst_id == "t150_320960_iw1"


def test_bursts_of_one_pass_become_one_acquisition_and_other_passes_stay_apart():
    fake = [burst(60, "20260626T235523Z"), burst(61, "20260626T235525Z"), burst(62, "20260626T235528Z"),    # one pass, 3 bursts
            burst(60, "20260708T235523Z"),                                                                 # 12 days later
            burst(60, "20260626T115523Z", path=143, direction="ASCENDING")]                                # same day, other orbit
    acq = s1.group_acquisitions(s1.search_opera(s1.ASSAM_BOX, "2026-06-01", "2026-08-31", results=fake))
    assert len(acq) == 3
    first = next(a for a in acq if a.relative_orbit == 150 and a.datetime.day == 26)
    assert len(first.hrefs["vv"]) == 3 and len(first.hrefs["vh"]) == 3
    # acquisitions behave like scenes for reference picking
    dry = [s1.Scene(id="d", datetime=datetime(2026, 2, 3, tzinfo=timezone.utc), relative_orbit=150, orbit_state="descending")]
    assert s1.pick_reference(dry, first.datetime, 150, "descending")[0].id == "d"


class FakeResponse:
    def __init__(self, code=200, body=b"data"):
        self.status_code, self.body = code, body

    def iter_content(self, n):
        yield self.body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)


class FakeSession:
    def __init__(self, code=200):
        self.code, self.calls = code, []

    def get(self, url, **kw):
        self.calls.append(url)
        return FakeResponse(self.code)


def test_download_files_skips_existing_files_and_names_a_refused_token_without_echoing_it(tmp_path):
    ses = FakeSession()
    urls = [BASE + "x/x_VV.tif?token=1", BASE + "x/x_VH.tif"]
    paths = s1.download_files(urls, str(tmp_path), session=ses)
    assert [os.path.basename(p) for p in paths] == ["x_VV.tif", "x_VH.tif"] and all(os.path.getsize(p) > 0 for p in paths)
    s1.download_files(urls, str(tmp_path), session=ses)
    assert len(ses.calls) == 2                                    # the second call found both files and downloaded nothing
    with pytest.raises(PermissionError, match="refused the download \\(403\\)") as e:
        s1.download_files([BASE + "y/y_VV.tif"], str(tmp_path), session=FakeSession(403))
    assert "token" in str(e.value) and "eyJ" not in str(e.value)


def test_download_files_needs_a_token_when_no_session_is_given(tmp_path, monkeypatch):
    monkeypatch.delenv("EARTHDATA_TOKEN", raising=False)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(s1.os.path, "isfile", lambda p: False)
    with pytest.raises(PermissionError, match="EARTHDATA_TOKEN"):
        s1.download_files([BASE + "z/z_VV.tif"], str(tmp_path))


def burst_tif(path, x0, level, size=60, res=30.0, nodata_block=None):
    a = np.full((size, size), level, np.float32)
    if nodata_block:
        a[nodata_block] = np.nan
    with rasterio.open(path, "w", driver="GTiff", height=size, width=size, count=1, dtype="float32", crs="EPSG:32646",
                       transform=from_origin(x0, 2892000.0, res, res)) as d:
        d.write(a, 1)
    return str(path)


def test_mosaic_joins_adjacent_bursts_averages_overlaps_in_power_and_returns_db(tmp_path):
    # two bursts side by side with a 10 px overlap: left is 0.1 (-10 dB), right is 0.3 (about -5.2 dB)
    a = (burst_tif(tmp_path / "a_vv.tif", 375000.0, 0.1), burst_tif(tmp_path / "a_vh.tif", 375000.0, 0.01))
    b = (burst_tif(tmp_path / "b_vv.tif", 375000.0 + 50 * 30, 0.3), burst_tif(tmp_path / "b_vh.tif", 375000.0 + 50 * 30, 0.03))
    bbox = transform_bounds("EPSG:32646", "EPSG:4326", 375000.0, 2890200.0, 375000.0 + 110 * 30, 2892000.0)
    out = s1.mosaic_chip([a[0], b[0]], [a[1], b[1]], bbox, str(tmp_path / "chip.tif"))
    with rasterio.open(out) as s:
        v = s.read(1)
        assert s.count == 2 and abs(s.transform.a) == 30.0
    assert np.isfinite(v).mean() > 0.85                                       # corners of the lon/lat box lie outside the bursts
    assert v[30, 5] == pytest.approx(-10.0, abs=0.05) and v[30, 100] == pytest.approx(10 * np.log10(0.3), abs=0.05)
    assert v[30, 55] == pytest.approx(10 * np.log10(0.2), abs=0.05)          # overlap: mean of 0.1 and 0.3 in power
    from engine import radar
    assert radar.load_chip(out)["valid"].any()                                # the radar engine reads it


def test_mosaic_refuses_db_values_and_uncovered_boxes_with_a_clear_message(tmp_path):
    bbox = transform_bounds("EPSG:32646", "EPSG:4326", 375000.0, 2890200.0, 376800.0, 2892000.0)
    neg = (burst_tif(tmp_path / "n_vv.tif", 375000.0, -10.0), burst_tif(tmp_path / "n_vh.tif", 375000.0, -20.0))   # already dB
    with pytest.raises(ValueError, match="almost no valid pixels"):
        s1.mosaic_chip([neg[0]], [neg[1]], bbox, str(tmp_path / "c1.tif"))
    far = (burst_tif(tmp_path / "f_vv.tif", 900000.0, 0.1), burst_tif(tmp_path / "f_vh.tif", 900000.0, 0.01))
    with pytest.raises(ValueError, match="almost no valid pixels"):
        s1.mosaic_chip([far[0]], [far[1]], bbox, str(tmp_path / "c2.tif"))
    with pytest.raises(ValueError, match="same non-empty number"):
        s1.mosaic_chip([neg[0]], [], bbox, str(tmp_path / "c3.tif"))


def test_check_opera_without_a_token_says_where_to_put_it(monkeypatch, tmp_path):
    monkeypatch.delenv("EARTHDATA_TOKEN", raising=False)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(s1.os.path, "isfile", lambda p: False)
    assert s1.check_opera()["ok"] is False


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
