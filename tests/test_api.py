"""API tests: health, measured results, the web UI, and a live radar analysis on a synthetic GeoTIFF."""
import io
import json
import time

import numpy as np
import pytest
import rasterio
from fastapi.testclient import TestClient
from rasterio.transform import from_origin

import api.main as api_main
from api.main import app
from tests.conftest import BUILT, CROP_GREEN, SOIL, VEG, make_stack

client = TestClient(app)
REQUIRED = {"id", "area_m2", "magnitude", "confidence", "needs_review", "centroid_lat", "centroid_lon",
            "change_type", "reason", "score", "tier", "review_status"}


def synthetic_s1_geotiff():
    """2-band float32 GeoTIFF (VV, VH in dB) in UTM: land ~ -8 dB, one 60x60 px flood ~ -20 dB."""
    rng = np.random.default_rng(0)
    vv = rng.normal(-8, 1.5, (200, 200)).astype(np.float32)
    vv[50:110, 50:110] = rng.normal(-20, 1.5, (60, 60))
    buf = io.BytesIO()
    with rasterio.MemoryFile() as mem:
        with mem.open(driver="GTiff", height=200, width=200, count=2, dtype="float32",
                      crs="EPSG:32646", transform=from_origin(500000, 2950000, 10, 10)) as dst:
            dst.write(np.stack([vv, vv - 6]))
        buf.write(mem.read())
    return buf.getvalue()


def test_health_at_root_and_under_api():
    for path in ("/health", "/api/health"):
        r = client.get(path)
        assert r.status_code == 200 and r.json()["ok"] is True
        assert set(r.json()["models"]) == {"learned", "deep"}


def test_results_are_the_measured_file():
    r = client.get("/api/results")
    assert r.status_code == 200
    d = r.json()
    assert d["chips"] == 68 and d["labels_used_for_fitting"] is False
    assert d["m8"]["flood_only"]["iou"] > d["naive_per_chip_otsu"]["flood_only"]["iou"]


def test_metrics_is_eval_results_json():
    r = client.get("/metrics")
    assert r.status_code == 200
    assert r.json() == json.load(open("eval/results.json"))


def test_demo_routes_serve_the_static_files():
    ids = [d["id"] for d in client.get("/demos").json()]
    assert "navi-mumbai-airport" in ids and "assam-flood-2016" in ids
    s = client.get("/demos/navi-mumbai-airport/summary").json()
    assert s["after_filter"] < s["raw_detections"]
    fc = client.get("/demos/navi-mumbai-airport/result").json()
    assert fc["type"] == "FeatureCollection" and len(fc["features"]) == s["after_filter"]
    assert REQUIRED <= set(fc["features"][0]["properties"])
    assert client.get("/demos/navi-mumbai-airport/result?filtered=false").status_code == 200
    r = client.get("/demos/navi-mumbai-airport/preview/after")
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    assert client.get("/demos/navi-mumbai-airport/files/meta.json").json()["id"] == "navi-mumbai-airport"


def test_demo_routes_reject_unknown_and_path_traversal():
    assert client.get("/demos/nowhere/summary").status_code == 404
    assert client.get("/demos/navi-mumbai-airport/files/../../../../api/main.py").status_code == 404
    assert client.get("/demos/navi-mumbai-airport/files/..%2F..%2Findex.json").status_code == 404
    assert client.get("/demos/navi-mumbai-airport/preview/side").status_code == 400


def test_analyze_radar_returns_flood_polygon():
    r = client.post("/api/analyze/radar", files={"s1": ("scene.tif", synthetic_s1_geotiff(), "image/tiff")})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["type"] == "FeatureCollection"
    assert d["summary"]["polygons"] == 1
    p = d["features"][0]["properties"]
    assert 30 < p["area_ha"] < 42                     # 60x60 px at 10 m = 36 ha
    assert -90 <= p["centroid_lat"] <= 90 and -180 <= p["centroid_lon"] <= 180


def test_analyze_radar_rejects_non_geotiff():
    r = client.post("/api/analyze/radar", files={"s1": ("x.tif", b"not a tiff", "image/tiff")})
    assert r.status_code == 400


def test_analyze_radar_method_param():
    tif = synthetic_s1_geotiff()
    r = client.post("/api/analyze/radar?method=threshold", files={"s1": ("s.tif", tif, "image/tiff")})
    assert r.status_code == 200 and r.json()["summary"]["method"] == "threshold"
    r = client.post("/api/analyze/radar?method=bogus", files={"s1": ("s.tif", tif, "image/tiff")})
    assert r.status_code == 400


@pytest.fixture
def offline_jobs(tmp_path, monkeypatch):
    """Jobs write under a temp dir and skip the WorldCover download."""
    monkeypatch.setattr(api_main, "RUNS", str(tmp_path / "runs"))
    monkeypatch.setattr("engine.impact.worldcover_on_grid", lambda *a, **k: None)
    return tmp_path


def _wait(job_id, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = client.get(f"/jobs/{job_id}").json()
        if j["status"] in ("done", "error"):
            return j
        time.sleep(0.2)
    raise AssertionError("job did not finish")


def _pair(tmp_path):
    """Bare soil paved over (real construction) plus a harvested field (a seasonal false alarm)."""
    b = make_stack(str(tmp_path / "b.tif"), VEG, [((10, 40, 10, 40), SOIL), ((60, 100, 60, 100), CROP_GREEN)])
    a = make_stack(str(tmp_path / "a.tif"), VEG, [((10, 40, 10, 40), BUILT), ((60, 100, 60, 100), SOIL)], seed=1)
    return open(b, "rb").read(), open(a, "rb").read()


def test_analyze_job_runs_to_done_with_exports_and_review(offline_jobs):
    b, a = _pair(offline_jobs)
    r = client.post("/analyze", files={"before": ("b.tif", b), "after": ("a.tif", a)},
                    data={"preset": "encroachment", "before_date": "2024-11-01", "after_date": "2025-01-10"})
    assert r.status_code == 200, r.text
    jid = r.json()["job_id"]
    j = _wait(jid)
    assert j["status"] == "done", j
    s = client.get(f"/jobs/{jid}/summary").json()
    assert s["after_filter"] >= 1 and s["by_type"].get("built_up_gain", 0) >= 1
    fc = client.get(f"/jobs/{jid}/result").json()
    assert all(f["properties"]["change_type"] == "built_up_gain" for f in fc["features"])  # harvest not reported
    assert REQUIRED <= set(fc["features"][0]["properties"])
    for fmt in ("geojson", "gpkg", "csv", "kml", "pdf", "audit"):
        e = client.get(f"/jobs/{jid}/export?format={fmt}")
        assert e.status_code == 200 and len(e.content) > 50, fmt
    fid = fc["features"][0]["properties"]["id"]
    for _ in range(2):  # idempotent
        p = client.patch(f"/jobs/{jid}/features/{fid}", json={"review_status": "confirmed"})
        assert p.status_code == 200 and p.json()["properties"]["review_status"] == "confirmed"
    assert client.get(f"/jobs/{jid}/result").json()["features"][0]["properties"]["review_status"] == "confirmed"
    conf = client.get(f"/jobs/{jid}/export?format=geojson&confirmed_only=true").json()
    assert [f["properties"]["id"] for f in conf["features"]] == [fid]
    assert client.patch(f"/jobs/{jid}/features/{fid}", json={"review_status": "maybe"}).status_code == 400
    assert client.patch(f"/jobs/{jid}/features/99999", json={"review_status": "confirmed"}).status_code == 404


def test_analyze_min_area_override_and_bad_input(offline_jobs):
    b, a = _pair(offline_jobs)
    r = client.post("/analyze", files={"before": ("b.tif", b), "after": ("a.tif", a)},
                    data={"preset": "encroachment", "min_area_m2": "1000000"})
    j = _wait(r.json()["job_id"])
    assert j["status"] == "done", j
    assert client.get(f"/jobs/{r.json()['job_id']}/summary").json()["after_filter"] == 0
    bad = client.post("/analyze", files={"before": ("b.tif", b"not a tiff"), "after": ("a.tif", b"nope")})
    jb = _wait(bad.json()["job_id"])
    assert jb["status"] == "error" and jb["error"] and "trace" not in jb
    assert client.get(f"/jobs/{bad.json()['job_id']}/summary").status_code == 409
    assert client.post("/analyze", data={"preset": "general"}).status_code == 400
    assert client.post("/analyze", data={"preset": "nonsense"}).status_code == 400
    assert client.get("/jobs/doesnotexist").status_code == 404
    assert client.get("/jobs/..%2F..%2Fetc").status_code == 404


def test_radar_job(offline_jobs):
    r = client.post("/analyze", files={"after": ("s1.tif", synthetic_s1_geotiff())}, data={"mode": "radar"})
    j = _wait(r.json()["job_id"])
    assert j["status"] == "done", j
    assert client.get(f"/jobs/{r.json()['job_id']}/summary").json()["after_filter"] == 1


def test_cors_and_gzip():
    r = client.get("/demos/navi-mumbai-airport/result",
                   headers={"Origin": "https://x.vercel.app", "Accept-Encoding": "gzip"})
    assert r.headers.get("access-control-allow-origin") in ("*", "https://x.vercel.app")
    assert r.headers.get("content-encoding") == "gzip"
