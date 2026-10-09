"""API tests: health, measured results, the web UI, and a live radar analysis on a synthetic GeoTIFF."""
import io

import numpy as np
import rasterio
from fastapi.testclient import TestClient
from rasterio.transform import from_origin

from api.main import app

client = TestClient(app)


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


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_results_are_the_measured_file():
    r = client.get("/api/results")
    assert r.status_code == 200
    d = r.json()
    assert d["chips"] == 68 and d["labels_used_for_fitting"] is False
    assert d["m8"]["flood_only"]["iou"] > d["naive_per_chip_otsu"]["flood_only"]["iou"]


def test_web_ui_and_demo_data_are_served():
    assert client.get("/").status_code == 200
    assert "Flood Monitor" in client.get("/").text
    assert client.get("/demo_data.js").status_code == 200


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
