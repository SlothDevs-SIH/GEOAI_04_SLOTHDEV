"""Integration of the two backends: learned, hybrid and deep modes through the engine and the API, and radar
before/after. Models are replaced by small fakes, so this runs without torch or onnxruntime."""
import io
import time

import numpy as np
import pytest
import rasterio
from conftest import BUILT, SOIL, VEG, make_stack
from fastapi.testclient import TestClient
from rasterio.transform import from_origin

import api.main as api_main
from engine import change_deep, change_learned, detectors, run

client = TestClient(api_main.app)
UP = {"available": True, "backend": "fake"}
DOWN = {"available": False, "reason": "FileNotFoundError: no weights"}
REAL, ART = (10, 40, 10, 40), (60, 100, 60, 100)


def pair_files(tmp_path):
    before = make_stack(str(tmp_path / "b.tif"), VEG, [(REAL, SOIL), (ART, SOIL)], seed=1)
    after = make_stack(str(tmp_path / "a.tif"), VEG, [(REAL, BUILT), (ART, BUILT)], seed=2)
    return before, after


def fake_model(monkeypatch):
    """A learned model that flags pixels whose two dates differ a lot (stands in for the ONNX network)."""
    meta = {"mean": [0.1] * 5, "std": [0.05] * 5, "threshold": 0.5, "base": 8}
    fn = lambda b: (np.abs(b[0, :5] - b[0, 5:]).mean(0) > 0.4).astype(np.float32)  # noqa: E731
    monkeypatch.setattr(change_learned, "load", lambda: (fn, meta, "fake"))
    monkeypatch.setattr(change_learned, "status", lambda: UP)


@pytest.fixture()
def offline(tmp_path, monkeypatch):
    monkeypatch.setattr(api_main, "RUNS", str(tmp_path / "runs"))
    monkeypatch.setattr("engine.impact.worldcover_on_grid", lambda *a, **k: None)
    return tmp_path


def wait(job_id, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = client.get(f"/jobs/{job_id}").json()
        if j["status"] in ("done", "error"):
            return j
        time.sleep(0.2)
    raise AssertionError("job did not finish")


# ---------------------------------------------------------------- registry
def test_status_lists_every_mode_and_spectral_is_always_available(monkeypatch):
    monkeypatch.setattr(change_learned, "status", lambda: DOWN)
    monkeypatch.setattr(change_deep, "status", lambda: DOWN)
    st = detectors.status()
    assert set(st) == {"spectral", "learned", "hybrid", "deep"}
    assert st["spectral"]["available"] and not st["learned"]["available"] and not st["deep"]["available"]
    assert detectors.available_modes() == ["spectral"]


def test_an_unavailable_model_gives_a_plain_reason_not_a_crash(tmp_path, monkeypatch):
    monkeypatch.setattr(change_learned, "status", lambda: DOWN)
    before, after = pair_files(tmp_path)
    with pytest.raises(detectors.ModeUnavailable, match="learned model is not available"):
        run.analyze(before, after, "encroachment", mode="learned")
    with pytest.raises(detectors.ModeUnavailable, match="no weights"):
        detectors.require("hybrid")
    with pytest.raises(detectors.ModeUnavailable, match="unknown mode"):
        detectors.require("quantum")


# ---------------------------------------------------------------- engine modes
def test_learned_and_hybrid_modes_run_end_to_end(tmp_path, monkeypatch):
    fake_model(monkeypatch)
    monkeypatch.setattr("engine.impact.worldcover_on_grid", lambda *a, **k: None)
    before, after = pair_files(tmp_path)
    spectral = run.analyze(before, after, "encroachment", mode="spectral")
    learned = run.analyze(before, after, "encroachment", mode="learned")
    hybrid = run.analyze(before, after, "encroachment", mode="hybrid")
    assert spectral.summary["mode"] == "spectral" and learned.summary["mode"] == "learned" and hybrid.summary["mode"] == "hybrid"
    assert learned.summary["after_filter"] == 2 and hybrid.summary["after_filter"] == 2
    assert any("OSCD" in x for x in learned.summary["limits"]) and any("Hybrid" in x for x in hybrid.summary["limits"])
    assert all(k in learned.gdf.columns for k in ("tier", "reason", "confidence", "area_m2", "change_type"))
    assert "OSCD" not in " ".join(spectral.summary["limits"])


def test_deep_mode_runs_on_a_high_resolution_rgb_pair(tmp_path, monkeypatch):
    monkeypatch.setattr(change_deep, "status", lambda: UP)
    monkeypatch.setattr(change_deep, "probability",
                        lambda pair, fn=None: (np.abs(pair.before - pair.after).mean(0) > 0.2).astype(np.float32))
    rng = np.random.default_rng(0)
    base = rng.integers(90, 110, (3, 200, 200)).astype(np.uint8)
    changed = base.copy()
    changed[:, 40:120, 40:120] = 250                      # a bright new roof, 40 m x 40 m at 0.5 m per pixel
    paths = []
    for name, data in (("b", base), ("a", changed)):
        path = str(tmp_path / f"{name}.tif")
        with rasterio.open(path, "w", driver="GTiff", height=200, width=200, count=3, dtype="uint8",
                           crs="EPSG:32643", transform=from_origin(500000, 2000000, 0.5, 0.5)) as dst:
            dst.write(data)
        paths.append(path)
    res = run.analyze(paths[0], paths[1], "encroachment", mode="deep")
    assert res.summary["mode"] == "deep" and res.summary["after_filter"] == 1
    assert res.summary["impact"] is not None and any("Deep mode" in x for x in res.summary["limits"])
    assert res.summary["sources"] == ["Very-high-resolution RGB imagery supplied by the user"]


def test_deep_mode_refuses_a_sentinel2_pair_with_a_clear_message(tmp_path, monkeypatch):
    monkeypatch.setattr(change_deep, "status", lambda: UP)
    before, after = pair_files(tmp_path)
    with pytest.raises(ValueError, match="3-band RGB"):
        run.analyze(before, after, "encroachment", mode="deep")


# ---------------------------------------------------------------- API
def test_health_reports_the_real_state_of_the_models(monkeypatch):
    monkeypatch.setattr(change_learned, "status", lambda: DOWN)
    monkeypatch.setattr(change_deep, "status", lambda: DOWN)
    h = client.get("/health").json()
    assert h["models"] == {"learned": False, "deep": False} and h["modes"] == ["spectral", "radar"]
    assert h["default_mode"] == "spectral" and h["model_status"]["learned"]["reason"].startswith("FileNotFoundError")
    monkeypatch.setattr(change_learned, "status", lambda: UP)
    h = client.get("/health").json()
    assert h["models"]["learned"] is True and {"spectral", "learned", "hybrid", "radar"} <= set(h["modes"])
    assert h["measured_default_method"] in (None, "learned", "spectral")


def test_unknown_mode_is_400_and_an_unavailable_model_is_501(offline, monkeypatch):
    monkeypatch.setattr(change_learned, "status", lambda: DOWN)
    before, after = pair_files(offline)
    files = {"before": ("b.tif", open(before, "rb").read()), "after": ("a.tif", open(after, "rb").read())}
    assert client.post("/analyze", files=files, data={"mode": "quantum"}).status_code == 400
    r = client.post("/analyze", files=files, data={"mode": "learned"})
    assert r.status_code == 501 and "learned model is not available" in r.json()["detail"]
    body = {"bbox": [77.1, 28.5, 77.17, 28.56], "before_date": "2024-11-01", "after_date": "2025-01-10"}
    assert client.post("/fetch-s2", json={**body, "mode": "deep"}).status_code == 400
    assert client.post("/fetch-s2", json={**body, "mode": "learned"}).status_code == 501
    assert client.post("/fetch-s2/preview", json={**body, "mode": "learned"}).status_code == 501


def test_a_learned_job_runs_and_opens_on_the_swipe_map_without_slider_data(offline, monkeypatch):
    fake_model(monkeypatch)
    before, after = pair_files(offline)
    files = {"before": ("b.tif", open(before, "rb").read()), "after": ("a.tif", open(after, "rb").read())}
    jid = client.post("/analyze", files=files, data={"mode": "hybrid", "preset": "encroachment"}).json()["job_id"]
    assert wait(jid)["status"] == "done"
    s = client.get(f"/jobs/{jid}/summary").json()
    assert s["mode"] == "hybrid" and s["after_filter"] == 2
    meta = client.get(f"/jobs/{jid}/files/meta.json").json()
    assert meta["mode"] == "hybrid" and client.get(f"/jobs/{jid}/files/before.webp").status_code == 200
    assert client.get(f"/jobs/{jid}/files/sens.json").status_code == 404           # the slider mirrors the spectral rules only
    spectral = client.post("/analyze", files=files, data={"mode": "spectral", "preset": "encroachment"}).json()["job_id"]
    assert wait(spectral)["status"] == "done"
    assert client.get(f"/jobs/{spectral}/files/sens.json").status_code == 200
    sens = client.get(f"/jobs/{spectral}/files/sens.json").json()
    bin_ = client.get(f"/jobs/{spectral}/files/sens.bin")                    # regression: the slider's data file was a 404
    assert bin_.status_code == 200 and len(bin_.content) == sens["width"] * sens["height"] * 3


def s1_tiff(flooded):
    rng = np.random.default_rng(1 if flooded else 2)
    vv = rng.normal(-8, 1.5, (200, 200)).astype(np.float32)   # same land and water statistics as tests/test_api.py
    if flooded:
        vv[50:110, 50:110] = rng.normal(-20, 1.5, (60, 60))
    with rasterio.MemoryFile() as mem:
        with mem.open(driver="GTiff", height=200, width=200, count=2, dtype="float32", crs="EPSG:32646",
                      transform=from_origin(500000, 2950000, 10, 10)) as dst:
            dst.write(np.stack([vv, vv - 6]))
        buf = io.BytesIO(mem.read())
    return buf.getvalue()


def test_radar_before_after_uses_the_dry_reference_and_keeps_the_ui_summary_keys(offline):
    r = client.post("/analyze", files={"before": ("b.tif", s1_tiff(False)), "after": ("a.tif", s1_tiff(True))},
                    data={"mode": "radar"})
    assert r.status_code == 200, r.text
    jid = r.json()["job_id"]
    j = wait(jid)
    assert j["status"] == "done", j
    s = client.get(f"/jobs/{jid}/summary").json()
    assert s["mode"] == "radar" and s["variant"] == "before_after" and s["after_filter"] >= 1
    assert s["flooded_ha"] > 30                                   # the 60 x 60 pixel flood is about 36 ha
    assert client.get(f"/jobs/{jid}/export?format=geojson").status_code == 200


def test_radar_single_date_still_works_as_before(offline):
    r = client.post("/analyze", files={"after": ("a.tif", s1_tiff(True))}, data={"mode": "radar"})
    jid = r.json()["job_id"]
    assert wait(jid)["status"] == "done"
    assert client.get(f"/jobs/{jid}/summary").json()["after_filter"] == 1


def test_deep_mode_keeps_house_sized_changes_under_the_encroachment_preset(tmp_path, monkeypatch):
    """Regression (found by running real BIT sample tiles): the preset minimum area of 300 m2 is for 10 m pixels and
    removed every house at 0.5 m. Deep mode must keep changes of about 50 m2."""
    monkeypatch.setattr(change_deep, "status", lambda: UP)
    monkeypatch.setattr(change_deep, "probability",
                        lambda pair, fn=None: (np.abs(pair.before - pair.after).mean(0) > 0.2).astype(np.float32))
    rng = np.random.default_rng(3)
    base = rng.integers(90, 110, (3, 200, 200)).astype(np.uint8)
    changed = base.copy()
    changed[:, 60:74, 60:74] = 250                         # 14 x 14 pixels at 0.5 m = 49 m2: one house
    paths = []
    for name, data in (("hb", base), ("ha", changed)):
        path = str(tmp_path / f"{name}.tif")
        with rasterio.open(path, "w", driver="GTiff", height=200, width=200, count=3, dtype="uint8",
                           crs="EPSG:32643", transform=from_origin(500000, 2000000, 0.5, 0.5)) as dst:
            dst.write(data)
        paths.append(path)
    res = run.analyze(paths[0], paths[1], "encroachment", mode="deep")
    assert res.summary["after_filter"] == 1 and 40 < res.gdf.iloc[0]["area_m2"] < 60
    assert res.summary["params"]["min_area_m2"] == run.DEEP_MIN_AREA_M2


def test_fetch_rejects_reversed_dates_before_starting_a_job():
    """Regression (found by the black-box system test): /fetch-s2 accepted before >= after and failed later inside the job."""
    body = {"bbox": [77.1, 28.5, 77.17, 28.56], "before_date": "2025-02-01", "after_date": "2025-01-01"}
    r = client.post("/fetch-s2", json=body)
    assert r.status_code == 400 and "earlier" in r.json()["detail"]
    assert client.post("/fetch-s2", json={**body, "after_date": "2025-02-01"}).status_code == 400
