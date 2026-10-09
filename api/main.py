"""FastAPI service (BACKEND_PLAN §6): demo data, live analysis jobs, exports, review, and the built web app.

uvicorn api.main:app --port 8000   ->  http://127.0.0.1:8000

Every route is served at the root (as in the plan) and again under /api, so the React build can call the
same origin with VITE_API_URL=/api when this server also hosts the site (Dockerfile).

Environment:
  ALLOWED_ORIGINS   comma-separated CORS allow-list (e.g. https://geoai04.vercel.app); default "*"
  RUNS_DIR          where jobs are kept (default ./runs); one folder + job.json per job, no database
  MAX_UPLOAD_MB     upload limit per file (default 200)
"""
import json
import os
import shutil
import tempfile
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace

from fastapi import APIRouter, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from engine import aoi, detectors, preview, radar
from engine.config import params_for

VERSION = "1.0.0"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMOS = os.path.join(ROOT, "web", "public", "demos")
WEB_DIST = os.path.join(ROOT, "web", "dist")
RUNS = os.environ.get("RUNS_DIR", os.path.join(ROOT, "runs"))
MAX_UPLOAD = int(os.environ.get("MAX_UPLOAD_MB", "200")) * 1024 * 1024
EVENT_THRESHOLD_DB = -14.06   # fitted on the Assam 2016 event (eval/results/m8_sen1floods11_india.json)
PRESETS = ("encroachment", "flood", "deforestation", "general")
EXPORTS = {"geojson": ("changes.geojson", "application/geo+json"), "gpkg": ("changes.gpkg", "application/geopackage+sqlite3"),
           "csv": ("changes.csv", "text/csv"), "kml": ("changes.kml", "application/vnd.google-earth.kml+xml"),
           "pdf": ("report.pdf", "application/pdf"), "audit": ("audit.json", "application/json")}
REVIEW = ("pending", "confirmed", "dismissed")

app = FastAPI(title="GEOAI 04 change detection API", version=VERSION)
origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)
api = APIRouter()
pool = ThreadPoolExecutor(max_workers=int(os.environ.get("JOB_WORKERS", "2")))
lock = threading.Lock()


def _retry(fn, attempts=20, wait=0.02):
    """Windows cannot replace or open a file another thread has open for a moment; retry briefly instead of failing a job."""
    for i in range(attempts):
        try:
            return fn()
        except PermissionError:
            if i == attempts - 1:
                raise
            time.sleep(wait)


def _json(path):
    def read():
        with open(path) as f:
            return json.load(f)
    return _retry(read)


# ---------- health and measured results ----------

ANALYZE_MODES = detectors.MODES + ("radar",)


def _measured_default():
    """Which method the held-out OSCD evaluation chose (eval/results.json), for information; the API default stays spectral."""
    try:
        return _json(os.path.join(ROOT, "eval", "results.json")).get("oscd", {}).get("default_method")
    except (OSError, ValueError):
        return None


def _need_mode(mode):
    """400 for an unknown mode, 501 (with the reason) for a known one that cannot run on this server."""
    if mode not in ANALYZE_MODES:
        raise HTTPException(400, f"mode must be one of {', '.join(ANALYZE_MODES)}")
    if mode in detectors.MODES:
        try:
            detectors.require(mode)
        except detectors.ModeUnavailable as e:
            raise HTTPException(501, str(e)) from e


@api.get("/health")
def health():
    st = detectors.status()
    return {"ok": True, "version": VERSION, "fetch_s2": True,
            "modes": [m for m, s in st.items() if s.get("available")] + ["radar"],
            "models": {"learned": bool(st["learned"].get("available")), "deep": bool(st["deep"].get("available"))},
            "model_status": {k: st[k] for k in ("learned", "deep")},
            "default_mode": "spectral", "measured_default_method": _measured_default()}


@api.get("/metrics")
def metrics():
    p = os.path.join(ROOT, "eval", "results.json")
    if not os.path.exists(p):
        raise HTTPException(404, "run eval/build_results.py first")
    return _json(p)


@api.get("/results")
def results():
    """Round-1 route kept for the prototype: the Assam M8 evaluation."""
    p = os.path.join(ROOT, "eval", "results", "m8_sen1floods11_india.json")
    if not os.path.exists(p):
        raise HTTPException(404, "run scripts/build_m8_demo.py first")
    return _json(p)


# ---------- demo scenes (same files the static site reads) ----------

def _demo_dir(demo_id):
    d = os.path.realpath(os.path.join(DEMOS, demo_id))
    if not d.startswith(os.path.realpath(DEMOS) + os.sep) or not os.path.isdir(d):
        raise HTTPException(404, f"no demo scene '{demo_id}'")
    return d


@api.get("/demos")
def demos():
    out = []
    for m in _json(os.path.join(DEMOS, "index.json")):
        b = os.path.join(DEMOS, m["id"], "bounds.json")
        out.append({**m, "bounds": _json(b)["corners"] if os.path.exists(b) else m.get("corners")})
    return out


@api.get("/demos/{demo_id}/result")
def demo_result(demo_id: str, filtered: bool = True):
    d = _demo_dir(demo_id)
    return FileResponse(os.path.join(d, "result_filtered.geojson" if filtered else "result_raw.geojson"),
                        media_type="application/geo+json")


@api.get("/demos/{demo_id}/summary")
def demo_summary(demo_id: str):
    return _json(os.path.join(_demo_dir(demo_id), "summary.json"))


@api.get("/demos/{demo_id}/preview/{side}")
def demo_preview(demo_id: str, side: str):
    if side not in ("before", "after"):
        raise HTTPException(400, "side must be before or after")
    return FileResponse(os.path.join(_demo_dir(demo_id), f"{side}.webp"), media_type="image/webp")


@api.get("/demos/{demo_id}/files/{path:path}")
def demo_file(demo_id: str, path: str):
    d = _demo_dir(demo_id)
    p = os.path.realpath(os.path.join(d, path))
    if not p.startswith(d + os.sep) or not os.path.isfile(p):
        raise HTTPException(404, "file not found")
    return FileResponse(p)


# ---------- live analysis jobs ----------

def _job_dir(job_id):
    if not job_id.isalnum():
        raise HTTPException(404, "no such job")
    d = os.path.join(RUNS, job_id)
    if not os.path.exists(os.path.join(d, "job.json")):
        raise HTTPException(404, "no such job")
    return d


def _set(job_id, **kw):
    p = os.path.join(RUNS, job_id, "job.json")
    with lock:
        j = _json(p) if os.path.exists(p) else {}
        j.update(kw, updated=time.time())
        tmp = p + ".tmp"
        with open(tmp, "w") as f:
            json.dump(j, f, default=str)
        _retry(lambda: os.replace(tmp, p))
    return j


def _run(job_id, before, after, preset, mode, before_date, after_date, min_area_m2, info=None, extra_warnings=(),
         extra_after=(), persistence=0):
    from engine import run
    out = os.path.join(RUNS, job_id)
    try:
        if mode == "radar":
            _set(job_id, status="running", stage="detecting", progress=0.3)
            if before:      # before/after change against a dry-season reference (Seam 2)
                from engine import radar_run
                summary = radar_run.run(before, after, out, preset="flood")
                summary.setdefault("flooded_ha", summary.get("impact", {}).get("changed_ha", 0.0))
                with open(os.path.join(out, "summary.json"), "w") as f:
                    json.dump(summary, f, indent=1, default=str)
                _set(job_id, status="done", stage="done", progress=1.0, warnings=summary.get("warnings", []))
            else:
                run.run_radar(after, out, None)
                _set(job_id, status="done", stage="done", progress=1.0, warnings=[])
            return
        _set(job_id, status="running", stage="detecting", progress=0.2)
        p = params_for(preset)
        if min_area_m2 is not None:
            p = replace(p, min_area_m2=float(min_area_m2))
        res = run.analyze(before, after, preset=preset, mode=mode, before_date=before_date, after_date=after_date,
                          worldcover_cache=os.path.join(out, "worldcover.tif"), params=p,
                          extra_after_paths=list(extra_after), persistence=persistence)
        _set(job_id, stage="vectorising", progress=0.8)
        res.gdf["review_status"] = "pending"
        run.write_outputs(res, out, inputs=[before, after], title=f"GEOAI 04 · {preset}")
        res.raw.to_file(os.path.join(out, "result_raw.geojson"), driver="GeoJSON")
        notes = list(extra_warnings) + list(res.summary.get("warnings", []))
        try:   # the swipe-map files; a failure here must not lose the analysis itself
            preview.write_scene_files(res, out, {"id": job_id, "before_date": before_date, "after_date": after_date,
                                                 **(info or {})})
        except Exception as e:  # noqa: BLE001
            notes.append(f"map preview not written: {type(e).__name__}: {e}")
        _set(job_id, status="done", stage="done", progress=1.0, warnings=notes)
    except Exception as e:  # report the failure on the job instead of losing it in a worker thread
        _set(job_id, status="error", error=f"{type(e).__name__}: {e}", trace=traceback.format_exc()[-2000:])


async def _save(upload: UploadFile, path):
    size = 0
    with open(path, "wb") as f:
        while chunk := await upload.read(1 << 20):
            size += len(chunk)
            if size > MAX_UPLOAD:
                raise HTTPException(413, f"upload larger than {MAX_UPLOAD // 2**20} MB")
            f.write(chunk)


@api.post("/analyze")
async def analyze(before: UploadFile | None = File(None), after: UploadFile | None = File(None),
                  demo_id: str | None = Form(None), mode: str = Form("spectral"), preset: str = Form("general"),
                  min_area_m2: float | None = Form(None), before_date: str | None = Form(None),
                  after_date: str | None = Form(None)):
    if preset not in PRESETS:
        raise HTTPException(400, f"preset must be one of {', '.join(PRESETS)}")
    _need_mode(mode)
    job_id = uuid.uuid4().hex[:16]
    d = os.path.join(RUNS, job_id)
    os.makedirs(d)
    try:
        if demo_id:
            # demo jobs re-run the engine on the source stacks when present (*.tif is not in git)
            src = os.path.join(ROOT, "demos", demo_id)  # written by scripts/fetch_demo_scenes.py
            b, a = os.path.join(src, "before.tif"), os.path.join(src, "after.tif")
            if not (os.path.exists(b) and os.path.exists(a)):
                raise HTTPException(404, f"source images for demo '{demo_id}' are not on this server; "
                                         f"use /demos/{demo_id}/result for the precomputed result")
            meta = _json(os.path.join(_demo_dir(demo_id), "meta.json"))
            before_date, after_date = before_date or meta.get("before_date"), after_date or meta.get("after_date")
        else:
            if after is None or (mode != "radar" and before is None):
                raise HTTPException(400, "upload 'before' and 'after' GeoTIFFs, or give a demo_id")
            a = os.path.join(d, "after.tif")
            await _save(after, a)
            b = None
            if before is not None:
                b = os.path.join(d, "before.tif")
                await _save(before, b)
    except HTTPException:
        shutil.rmtree(d, ignore_errors=True)
        raise
    _set(job_id, id=job_id, status="queued", stage="queued", progress=0.0, warnings=[], mode=mode, preset=preset,
         created=time.time())
    pool.submit(_run, job_id, b, a, preset, mode, before_date, after_date, min_area_m2)
    return {"job_id": job_id}


# ---------- any area: a box and two dates, fetched from Sentinel-2 ----------

class FetchBody(BaseModel):
    bbox: list[float]
    before_date: str
    after_date: str
    preset: str = "encroachment"
    window_days: int = 20
    min_area_m2: float | None = None
    mode: str = "spectral"  # spectral (default) | learned | hybrid
    composite: int = 1      # build each image as the median of this many clear scenes (1 = single scene)
    persistence: int = 0    # 0 = off; 2 to 4 = a change must appear in this many later images


def _check_fetch(body: FetchBody):
    if body.preset not in PRESETS:
        raise HTTPException(400, f"preset must be one of {', '.join(PRESETS)}")
    if not 1 <= body.window_days <= 45:
        raise HTTPException(400, "window_days must be between 1 and 45")
    if body.mode not in detectors.SENTINEL2_MODES:
        raise HTTPException(400, f"mode must be one of {', '.join(detectors.SENTINEL2_MODES)} for a Sentinel-2 area")
    _need_mode(body.mode)
    if not 1 <= body.composite <= 5:
        raise HTTPException(400, "composite must be between 1 and 5 scenes")
    if body.persistence not in (0, 2, 3, 4):
        raise HTTPException(400, "persistence must be 0 (off) or 2 to 4 later images")
    if body.persistence and body.preset == "flood":
        raise HTTPException(400, "persistence is not used for floods: flood water recedes, so it would remove real change")
    try:
        aoi.validate_bbox(body.bbox)
        bd = aoi.parse_date(body.before_date, "before date")
        ad = aoi.parse_date(body.after_date, "after date")
        if bd >= ad:
            raise aoi.AoiError("the before date must be earlier than the after date")
    except aoi.AoiError as e:
        raise HTTPException(400, str(e)) from e


@api.post("/fetch-s2/preview")
def fetch_preview(body: FetchBody):
    """Which scenes would be used (date, cloud over the box), without downloading the bands."""
    _check_fetch(body)
    try:
        return aoi.preview(body.bbox, body.before_date, body.after_date, body.window_days)
    except aoi.AoiError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"could not reach the satellite archive: {type(e).__name__}: {e}") from e


def _run_fetch(job_id: str, body: dict):
    out = os.path.join(RUNS, job_id)
    try:
        _set(job_id, status="running", stage="fetching", progress=0.05)
        meta = aoi.fetch_pair(body["bbox"], body["before_date"], body["after_date"], out, body["window_days"],
                              composite=body["composite"], persistence=body["persistence"])
        _set(job_id, fetch=meta, progress=0.3)
        info = {"name": "Your area", "place": "{:.3f}, {:.3f} (lat, lon)".format(
                    (body["bbox"][1] + body["bbox"][3]) / 2, (body["bbox"][0] + body["bbox"][2]) / 2),
                "event": f"{body['preset']} between {meta['before']['date']} and {meta['after']['date']}",
                "kind": body["preset"], "source": "Sentinel-2 L2A (Copernicus), via the Element84 Earth Search COG bucket"}
        _run(job_id, os.path.join(out, "before.tif"), os.path.join(out, "after.tif"), body["preset"], body["mode"],
             meta["before"]["date"], meta["after"]["date"], body.get("min_area_m2"), info, meta["warnings"],
             meta.get("extra_after", []), body["persistence"])
    except aoi.AoiError as e:
        _set(job_id, status="error", error=str(e))
    except Exception as e:  # noqa: BLE001
        _set(job_id, status="error", error=f"{type(e).__name__}: {e}", trace=traceback.format_exc()[-2000:])


@api.post("/fetch-s2")
def fetch_s2(body: FetchBody):
    """Analyse any area: fetch the two scenes for a box and dates, then run the normal engine as a job."""
    _check_fetch(body)
    job_id = uuid.uuid4().hex[:16]
    os.makedirs(os.path.join(RUNS, job_id))
    _set(job_id, id=job_id, status="queued", stage="queued", progress=0.0, warnings=[], mode="spectral",
         preset=body.preset, bbox=body.bbox, before_date=body.before_date, after_date=body.after_date,
         created=time.time())
    pool.submit(_run_fetch, job_id, body.model_dump())
    return {"job_id": job_id}


FILE_TYPES = {".json": "application/json", ".geojson": "application/geo+json", ".webp": "image/webp",
              ".gpkg": "application/geopackage+sqlite3", ".csv": "text/csv",
              ".kml": "application/vnd.google-earth.kml+xml", ".pdf": "application/pdf",
              ".bin": "application/octet-stream"}   # sens.bin: the sensitivity slider's per-pixel data


@api.get("/jobs/{job_id}/files/{path:path}")
def job_file(job_id: str, path: str):
    """The swipe-map files of a finished job, in the same layout as a demo scene (exports/ maps to the job folder)."""
    d = os.path.realpath(_done(job_id))
    rel = path[len("exports/"):] if path.startswith("exports/") else path
    p = os.path.realpath(os.path.join(d, rel))
    ext = os.path.splitext(p)[1].lower()
    if (not p.startswith(d + os.sep) or not os.path.isfile(p) or ext not in FILE_TYPES
            or os.path.basename(p) in ("job.json", "review.json")):
        raise HTTPException(404, "file not found")
    return FileResponse(p, media_type=FILE_TYPES[ext])


@api.get("/jobs/{job_id}")
def job(job_id: str):
    j = _json(os.path.join(_job_dir(job_id), "job.json"))
    j.pop("trace", None)
    return j


def _done(job_id):
    d = _job_dir(job_id)
    j = _json(os.path.join(d, "job.json"))
    if j["status"] != "done":
        raise HTTPException(409, f"job is {j['status']}")
    return d


@api.get("/jobs/{job_id}/summary")
def job_summary(job_id: str):
    return _json(os.path.join(_done(job_id), "summary.json"))


def _features(d):
    return _json(os.path.join(d, "changes.geojson"))


def _with_review(d, fc):
    rp = os.path.join(d, "review.json")
    rv = _json(rp) if os.path.exists(rp) else {}
    for f in fc["features"]:
        fid = str(f["properties"].get("id"))
        if fid in rv:
            f["properties"]["review_status"] = rv[fid]
    return fc


@api.get("/jobs/{job_id}/result")
def job_result(job_id: str, filtered: bool = True):
    d = _done(job_id)
    if not filtered:
        p = os.path.join(d, "result_raw.geojson")
        return _json(p) if os.path.exists(p) else {"type": "FeatureCollection", "features": []}
    return _with_review(d, _features(d))


class Review(BaseModel):
    review_status: str


@api.patch("/jobs/{job_id}/features/{fid}")
def review(job_id: str, fid: int, body: Review):
    if body.review_status not in REVIEW:
        raise HTTPException(400, f"review_status must be one of {', '.join(REVIEW)}")
    d = _done(job_id)
    feats = {f["properties"].get("id"): f for f in _features(d)["features"]}
    if fid not in feats:
        raise HTTPException(404, f"no feature {fid}")
    rp = os.path.join(d, "review.json")
    with lock:
        rv = _json(rp) if os.path.exists(rp) else {}
        rv[str(fid)] = body.review_status
        with open(rp, "w") as f:
            json.dump(rv, f)
    feat = feats[fid]
    feat["properties"]["review_status"] = body.review_status
    return feat


@api.get("/jobs/{job_id}/export")
def job_export(job_id: str, format: str = "geojson", confirmed_only: bool = False):
    if format not in EXPORTS:
        raise HTTPException(400, f"format must be one of {', '.join(EXPORTS)}")
    d = _done(job_id)
    name, media = EXPORTS[format]
    if confirmed_only:
        if format != "geojson":
            raise HTTPException(400, "confirmed_only is available for geojson")
        fc = _with_review(d, _features(d))
        fc["features"] = [f for f in fc["features"] if f["properties"].get("review_status") == "confirmed"]
        return JSONResponse(fc, media_type=media,
                            headers={"Content-Disposition": f'attachment; filename="confirmed_{job_id}.geojson"'})
    p = os.path.join(d, name)
    if not os.path.exists(p):
        raise HTTPException(404, f"{format} not produced for this job (no changes found?)")
    return FileResponse(p, media_type=media, filename=f"{job_id}_{name}")


# ---------- round-1 radar route (single upload, synchronous) ----------

@api.post("/analyze/radar")
async def analyze_radar(s1: UploadFile = File(...), threshold_db: float = EVENT_THRESHOLD_DB,
                        method: str = "hysteresis"):
    """Upload a Sentinel-1 GeoTIFF (band 1 = VV dB, band 2 = VH dB). Returns flood polygons as GeoJSON."""
    if method not in ("hysteresis", "threshold"):
        raise HTTPException(400, "method must be 'hysteresis' or 'threshold'")
    data = await s1.read()
    # write and close first: Windows cannot reopen a NamedTemporaryFile that is still open
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "scene.tif")
        with open(path, "wb") as f:
            f.write(data)
        try:
            chip = radar.load_chip(path)
        except Exception as e:
            raise HTTPException(400, f"could not read GeoTIFF: {e}") from e
    mask, drops, vvs = radar.flood_mask(chip, threshold_db, method=method)
    feats = radar.polygons(mask, vvs, threshold_db, chip["transform"], chip["crs"])
    return {"type": "FeatureCollection", "features": [dict(type="Feature", **f) for f in feats],
            "summary": {"polygons": len(feats), "flooded_ha": round(sum(f["properties"]["area_ha"] for f in feats), 2),
                        "filter_drops_px": drops, "threshold_db": threshold_db, "method": method}}


app.include_router(api)
app.include_router(api, prefix="/api")

# The built React app (npm run build in web/). Mounted last so API routes win.
if os.path.isdir(WEB_DIST):
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")
