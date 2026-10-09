"""API tests for analysing any area (POST /fetch-s2) and for the swipe-map files of a finished job.

The satellite archive is replaced by fakes that write synthetic stacks, so no network is used.
"""
import os
import shutil
import time

import pytest
from conftest import BUILT, SOIL, VEG, make_stack
from fastapi.testclient import TestClient

import api.main as api_main
from api.main import app

client = TestClient(app)
BOX = [77.10, 28.50, 77.17, 28.56]


@pytest.fixture
def offline(tmp_path, monkeypatch):
    monkeypatch.setattr(api_main, "RUNS", str(tmp_path / "runs"))
    monkeypatch.setattr("engine.impact.worldcover_on_grid", lambda *a, **k: None)

    def fake_fetch_pair(bbox, before_date, after_date, out_dir, window_days=20, **_):
        os.makedirs(out_dir, exist_ok=True)
        make_stack(os.path.join(out_dir, "before.tif"), VEG, [((10, 40, 10, 40), SOIL)])
        make_stack(os.path.join(out_dir, "after.tif"), VEG, [((10, 40, 10, 40), BUILT)], seed=1)
        return {"bbox": list(bbox), "before": {"scene": "S2_early", "date": before_date},
                "after": {"scene": "S2_late", "date": after_date}, "warnings": ["only 12 days between the two images"]}

    monkeypatch.setattr(api_main.aoi, "fetch_pair", fake_fetch_pair)
    return tmp_path


def wait(job_id, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = client.get(f"/jobs/{job_id}").json()
        if j["status"] in ("done", "error"):
            return j
        time.sleep(0.2)
    raise AssertionError("job did not finish")


def body(**kw):
    return {"bbox": BOX, "before_date": "2024-11-01", "after_date": "2025-01-10", "preset": "encroachment", **kw}


def test_health_says_any_area_is_available():
    assert client.get("/health").json()["fetch_s2"] is True


@pytest.mark.parametrize("change,words", [
    ({"bbox": [77.1, 28.5, 78.0, 29.2]}, "limit"),
    ({"bbox": [77.2, 28.5, 77.1, 28.6]}, "outside valid"),
    ({"before_date": "not a date"}, "date like"),
    ({"after_date": "2999-01-01"}, "future"),
    ({"preset": "nonsense"}, "preset"),
    ({"window_days": 99}, "window_days"),
])
def test_bad_requests_are_rejected_before_any_download(change, words):
    for path in ("/fetch-s2", "/fetch-s2/preview"):
        r = client.post(path, json=body(**change))
        assert r.status_code == 400 and words in r.json()["detail"], (path, r.text)


def test_preview_returns_the_chosen_scenes(monkeypatch):
    fake = {"bbox": BOX, "size_km": [6.8, 6.6], "before": {"scene": "a", "date": "2024-11-02"},
            "after": {"scene": "b", "date": "2025-01-09"}, "warnings": []}
    monkeypatch.setattr(api_main.aoi, "preview", lambda *a, **k: fake)
    r = client.post("/fetch-s2/preview", json=body())
    assert r.status_code == 200 and r.json()["before"]["scene"] == "a"


def test_preview_reports_user_errors_as_400_and_archive_failures_as_502(monkeypatch):
    def user_error(*a, **k):
        raise api_main.aoi.AoiError("no Sentinel-2 scene covers this box")

    def outage(*a, **k):
        raise OSError("connection reset")

    monkeypatch.setattr(api_main.aoi, "preview", user_error)
    assert client.post("/fetch-s2/preview", json=body()).status_code == 400
    monkeypatch.setattr(api_main.aoi, "preview", outage)
    r = client.post("/fetch-s2/preview", json=body())
    assert r.status_code == 502 and "satellite archive" in r.json()["detail"]


def test_fetch_job_runs_end_to_end_and_opens_on_the_swipe_map(offline):
    r = client.post("/fetch-s2", json=body())
    assert r.status_code == 200, r.text
    jid = r.json()["job_id"]
    j = wait(jid)
    assert j["status"] == "done", j
    assert j["bbox"] == BOX and j["fetch"]["before"]["scene"] == "S2_early"
    assert "only 12 days between the two images" in j["warnings"]
    s = client.get(f"/jobs/{jid}/summary").json()
    assert s["after_filter"] >= 1 and s["by_type"].get("built_up_gain", 0) >= 1
    # the same file layout as a demo scene, so the web map can open it
    meta = client.get(f"/jobs/{jid}/files/meta.json").json()
    assert meta["id"] == jid and meta["demo"] is False and len(meta["corners"]) == 4
    assert meta["after_date"] == "2025-01-10"
    for name in ("before.webp", "after.webp"):
        f = client.get(f"/jobs/{jid}/files/{name}")
        assert f.status_code == 200 and f.headers["content-type"] == "image/webp"
    fc = client.get(f"/jobs/{jid}/files/result_filtered.geojson").json()
    assert len(fc["features"]) == s["after_filter"]
    assert client.get(f"/jobs/{jid}/files/exports/changes.gpkg").status_code == 200
    assert client.get(f"/jobs/{jid}/files/exports/report.pdf").status_code == 200


def test_job_files_do_not_leak_inputs_state_or_other_folders(offline):
    jid = client.post("/fetch-s2", json=body()).json()["job_id"]
    assert wait(jid)["status"] == "done"
    for bad in ("job.json", "review.json", "before.tif", "after.tif", "../../api/main.py", "..%2F..%2Fapi%2Fmain.py",
                "nothing.webp"):
        assert client.get(f"/jobs/{jid}/files/{bad}").status_code == 404, bad


def test_a_job_that_is_not_done_has_no_files(offline, monkeypatch):
    def slow(*a, **k):
        time.sleep(1.0)
        raise api_main.aoi.AoiError("no Sentinel-2 scene covers this box")

    monkeypatch.setattr(api_main.aoi, "fetch_pair", slow)
    jid = client.post("/fetch-s2", json=body()).json()["job_id"]
    assert client.get(f"/jobs/{jid}/files/meta.json").status_code == 409
    j = wait(jid)
    assert j["status"] == "error" and "no Sentinel-2 scene covers" in j["error"]


def test_nothing_left_behind_in_the_repo(offline):
    # jobs live under the temp RUNS dir set by the fixture, never in the repo
    jid = client.post("/fetch-s2", json=body()).json()["job_id"]
    wait(jid)
    assert not os.path.exists(os.path.join("runs", jid))
    shutil.rmtree(str(offline / "runs"), ignore_errors=True)
