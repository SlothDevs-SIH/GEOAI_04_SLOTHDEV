"""FastAPI service: serves the web prototype and the M8 radar flood engine.

uvicorn api.main:app --port 8000   ->  http://127.0.0.1:8000
"""
import json
import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from engine import radar

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app = FastAPI(title="GEOAI 04 Flood Monitor", version="0.1.0")
EVENT_THRESHOLD_DB = -14.06   # fitted on the Assam 2016 event (eval/results/m8_sen1floods11_india.json)


@app.get("/api/health")
def health():
    return {"ok": True, "modes": ["radar_flood_m8"]}


@app.get("/api/results")
def results():
    p = os.path.join(ROOT, "eval/results/m8_sen1floods11_india.json")
    if not os.path.exists(p):
        raise HTTPException(404, "run scripts/build_m8_demo.py first")
    return json.load(open(p))


@app.post("/api/analyze/radar")
async def analyze_radar(s1: UploadFile = File(...), threshold_db: float = EVENT_THRESHOLD_DB,
                        method: str = "hysteresis"):
    """Upload a Sentinel-1 GeoTIFF (band 1 = VV dB, band 2 = VH dB). Returns flood polygons as GeoJSON."""
    with tempfile.NamedTemporaryFile(suffix=".tif") as f:
        f.write(await s1.read())
        f.flush()
        try:
            chip = radar.load_chip(f.name)
        except Exception as e:
            raise HTTPException(400, f"could not read GeoTIFF: {e}")
    if method not in ("hysteresis", "threshold"):
        raise HTTPException(400, "method must be 'hysteresis' or 'threshold'")
    mask, drops, vvs = radar.flood_mask(chip, threshold_db, method=method)
    feats = radar.polygons(mask, vvs, threshold_db, chip["transform"], chip["crs"])
    return {"type": "FeatureCollection", "features": [dict(type="Feature", **f) for f in feats],
            "summary": {"polygons": len(feats), "flooded_ha": round(sum(f["properties"]["area_ha"] for f in feats), 2),
                        "filter_drops_px": drops, "threshold_db": threshold_db, "method": method}}


@app.get("/")
def index():
    return FileResponse(os.path.join(ROOT, "web/index.html"))


app.mount("/", StaticFiles(directory=os.path.join(ROOT, "web")), name="web")
