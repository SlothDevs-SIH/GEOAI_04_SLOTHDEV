"""ml/fetch_s1_event.py with a fake STAC client and local rasters standing in for Planetary Computer."""
import json
from datetime import datetime, timezone

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import transform_bounds

from ml import fetch_s1_event as F

BOX = transform_bounds("EPSG:32646", "EPSG:4326", 375500, 2890500, 376500, 2891500)


def tif(path, level):
    with rasterio.open(path, "w", driver="GTiff", height=300, width=300, count=1, dtype="float32", crs="EPSG:32646",
                       transform=from_origin(375000.0, 2892000.0, 10.0, 10.0), nodata=0) as d:
        d.write(np.full((300, 300), level, np.float32), 1)
    return str(path)


class Item:
    def __init__(self, tmp, i, dt, orbit=77, state="descending"):
        from types import SimpleNamespace as NS
        self.id, self.datetime = f"s{i}", dt
        self.properties = {"sat:relative_orbit": orbit, "sat:orbit_state": state}
        self.assets = {"vv": NS(href=tif(tmp / f"{i}_vv.tif", 0.1)), "vh": NS(href=tif(tmp / f"{i}_vh.tif", 0.01))}


class Client:
    def __init__(self, items):
        self.items = items

    def search(self, **kw):
        from types import SimpleNamespace as NS
        lo, hi = (datetime.fromisoformat(x).replace(tzinfo=timezone.utc) for x in kw["datetime"].split("/"))
        return NS(items=lambda: iter([i for i in self.items if lo <= i.datetime.replace(tzinfo=timezone.utc) <= hi]))


def D(y, m, d):
    return datetime(y, m, d, tzinfo=timezone.utc)


def items(tmp, extra=()):
    base = [Item(tmp, 1, D(2024, 7, 6)),                                             # the flood scene
            Item(tmp, 2, D(2024, 3, 20)), Item(tmp, 3, D(2024, 3, 8)), Item(tmp, 4, D(2024, 2, 25)),   # dry, same orbit
            Item(tmp, 5, D(2024, 2, 13)),                                            # the older dry scene for false alarms
            Item(tmp, 6, D(2024, 3, 1), orbit=12), Item(tmp, 7, D(2024, 3, 2), state="ascending"),     # wrong geometry
            Item(tmp, 8, D(2024, 5, 20)), Item(tmp, 9, D(2024, 6, 20))]               # pre-monsoon, not dry season
    return base + list(extra)


def test_fetch_picks_the_event_scene_three_references_and_a_separate_dry_scene(tmp_path):
    out = tmp_path / "out"
    m = F.fetch_event(BOX, "2024-07-05", str(out), client=Client(items(tmp_path)))
    assert m["after"]["id"] == "s1" and [r["id"] for r in m["references"]] == ["s2", "s3", "s4"]
    assert m["dry_after"]["id"] == "s5" and m["relative_orbit"] == 77 and m["orbit_state"] == "descending"
    for n in ("after", "ref1", "ref2", "ref3", "dry_after"):
        with rasterio.open(out / f"{n}.tif") as s:
            a = s.read()
            assert s.count == 2 and np.nanmedian(a[0]) == pytest.approx(-10, abs=0.01) and np.nanmedian(a[1]) == pytest.approx(-20, abs=0.01)
    assert json.loads((out / "meta.json").read_text())["event_date"] == "2024-07-05"
    from engine import radar
    chip = radar.load_chip(str(out / "after.tif"))                                  # the radar engine reads the output
    assert radar.load_reference([str(out / f"ref{i}.tif") for i in (1, 2, 3)], chip)["n_scenes"] == 3


def test_fetch_fails_clearly_when_there_is_no_event_scene_or_too_few_dry_scenes(tmp_path):
    with pytest.raises(LookupError, match="no Sentinel-1 scene"):
        F.fetch_event(BOX, "2024-08-20", str(tmp_path / "a"), client=Client(items(tmp_path)))
    few = [i for i in items(tmp_path) if i.id not in ("s5",)]                       # only 3 dry scenes: need 4
    with pytest.raises(LookupError, match="need 4"):
        F.fetch_event(BOX, "2024-07-05", str(tmp_path / "b"), client=Client(few))


# ---------------------------------------------------------------- OPERA path (bursts, downloads, mosaic) with fakes
from engine import s1  # noqa: E402
from tests.test_s1 import BASE, FakeSession, burst, burst_tif  # noqa: E402,F401

OBOX = transform_bounds("EPSG:32646", "EPSG:4326", 375000.0, 2890200.0, 376800.0, 2892000.0)


class LocalSession:
    """Serves the 'download' from local rasters: the file name decides which burst and polarisation it is."""

    def __init__(self, folder):
        self.folder, self.calls = folder, []

    def get(self, url, **kw):
        from types import SimpleNamespace as NS
        self.calls.append(url)
        name = url.split("/")[-1]
        level = 0.1 if "_VV" in name else 0.01
        src = burst_tif(self.folder / f"src_{len(self.calls)}.tif", 375000.0, level)
        return NS(status_code=200, iter_content=lambda n: iter([open(src, "rb").read()]), raise_for_status=lambda: None)


def opera_results():
    bursts = []
    for t, i in (("20260626T235523Z", 60), ("20260626T235525Z", 61),                   # the flood pass: two bursts
                 ("20260308T235523Z", 60), ("20260225T235523Z", 60), ("20260120T235523Z", 60), ("20260108T235523Z", 60)):
        bursts.append(burst(i, t))
    bursts.append(burst(60, "20260301T115523Z", path=143, direction="ASCENDING"))     # another orbit: ignored
    return bursts


def test_opera_event_plan_downloads_mosaics_and_writes_the_same_files_as_the_mpc_path(tmp_path):
    out = tmp_path / "out"
    ses = LocalSession(tmp_path)
    m = F.fetch_opera_event(OBOX, "2026-06-25", str(out), cache_dir=str(tmp_path / "dl"),
                            search=lambda b, start, end: s1.search_opera(b, start, end, results=[
                                r for r in opera_results()
                                if start <= datetime.fromisoformat(r.properties["startTime"].replace("Z", "+00:00")) <= end]),
                            session=ses)
    assert m["relative_orbit"] == 150 and m["orbit_state"] == "descending" and "OPERA" in m["source"]
    assert len(m["references"]) == 3 and m["after"]["datetime"].startswith("2026-06-26") and m["dry_after"]["datetime"].startswith("2026-01-08")
    assert "t150_320960_iw1,t150_320961_iw1" in m["after"]["bursts"]                  # two bursts joined into one acquisition
    for n in ("after", "ref1", "ref2", "ref3", "dry_after"):
        with rasterio.open(out / f"{n}.tif") as s:
            a = s.read()
            assert s.count == 2 and abs(s.transform.a) == 30.0 and np.nanmedian(a[0]) == pytest.approx(-10, abs=0.1)
    assert len(ses.calls) == 2 * 2 + 4 * 2                                            # after: 2 bursts x 2 pols; 4 dry acquisitions x 2 pols
    assert json.loads((out / "meta.json").read_text())["event_date"] == "2026-06-25"
    from engine import radar
    chip = radar.load_chip(str(out / "after.tif"))
    assert radar.load_reference([str(out / f"ref{i}.tif") for i in (1, 2, 3)], chip)["n_scenes"] == 3


def test_opera_event_fails_clearly_without_an_event_pass(tmp_path):
    with pytest.raises(LookupError, match="no Sentinel-1 scene"):
        F.fetch_opera_event(OBOX, "2026-09-25", str(tmp_path / "o"), search=lambda b, s, e: [], session=FakeSession())
