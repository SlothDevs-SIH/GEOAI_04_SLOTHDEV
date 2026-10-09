# GEOAI 04 — Backend & Pipeline Plan

**What it is:** the change-detection engine (ingest → detect → filter → vectorise → attribute) plus a FastAPI service around it.
**Folders:** `engine/` (pure Python pipeline, no web code) · `api/` (FastAPI) · `eval/` (metrics) · `demos/` (preloaded scenes)
**Stack:** Python 3.11+ · Rasterio · NumPy · OpenCV · scikit-image · Shapely 2 · GeoPandas · pyproj · PyTorch (CPU) · FastAPI + Uvicorn · pystac-client · WeasyPrint
**Starting point:** [`prototype/pipeline.py`](prototype/pipeline.py). It already runs end to end on real pairs (F1 0.93 on sample tiles, about 7 s on CPU for 11 tiles).
**Master doc:** [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) · **Overview:** [`README.md`](README.md) · **Android app:** [`FRONTEND_PLAN.md`](FRONTEND_PLAN.md)

---

## 1. The backend in one picture

```
            ┌──────────────── engine/ (importable, testable, no FastAPI) ────────────────┐
before.tif ─┤ ingest.py → change_spectral.py ┐                                           │
after.tif  ─┤   (validate,  change_deep.py  ─┴→ filters.py → vectorise.py → attributes.py ├─→ result.gpkg / .geojson
            │   resample,                        (season, SCL, morph,  (shapes, simplify)  (area, magnitude,  │    summary.json
            │   hist-match,                       min-area, shift)                         centroid, type,    │    audit.json
            │   shift check)                                                               reason, tier)      │
            └────────────────────────────────────────────────────────────────────────────┘
                                   ▲                                        │
                         api/ (FastAPI: jobs, results, exports, review) ◀───┘ → Android app
```

**Rule:** `engine/` never imports from `api/`. Every stage is a pure function that takes arrays and returns arrays, so each one can be unit-tested and re-run from the CLI.

---

## 1a. Requirements coverage

| Requirement (master doc §2.3) | Module | Phase |
|---|---|---|
| R1 Accept co-registered GeoTIFF pairs | `ingest.py` (check, resample, shift check) | 1 |
| R2 Siamese model or spectral index | `change_deep.py`, `change_spectral.py`, mode routing | 1, 3 |
| R3 Suppress false alarms | `filters.py` (seasonal rule, SCL), histogram match in `ingest.py` | 4 |
| R4 Morphological clean-up | `filters.py` | 1 |
| R5 Vectorise with Rasterio | `vectorise.py` | 1 |
| R6 Area, magnitude, centroid | `attributes.py` | 1 |
| R7 Severity tiers | `attributes.py` + `config.py` | 4 |
| R8 Data for the split-view map | `/preview`, `/result`, `/crop` | 2 |
| R9 GIS-ready export | `export.py` (GPKG, GeoJSON) | 1, 5 |
| Measured accuracy (winning feature) | `eval/` → `GET /metrics` | 3, 4 |

> Re-check this table once the official GEOAI 04 text is pasted into the master doc.

---

## 2. Modules and what each does

| Module | Input → Output | Key details |
|---|---|---|
| `engine/ingest.py` | two paths → `Pair(a, b, transform, crs, meta, warnings)` | Check CRS/bounds/resolution; `rasterio.warp.reproject` after → before grid; `match_histograms`; windowed reads for large scenes; **sub-pixel shift check** with `phase_cross_correlation`, warning if > 1 px (A5) |
| `engine/change_spectral.py` | Sentinel-2 bands → `magnitude`, `mask`, `type_map` | NDVI/NDBI/NDWI per date, differences, change-vector magnitude, **Otsu** per index; `type_map` = built-up gain / vegetation loss / water gain |
| `engine/change_deep.py` | RGB pair → `prob`, `mask` | BIT (LEVIR-CD weights) loaded once at startup; 256 px tiles **with overlap** + averaged stitching; threshold 0.5; the torchvision shim + `safe_globals` loader from the prototype |
| `engine/filters.py` | mask (+ indices, SCL) → clean mask + `drop_counts` | Seasonal-vegetation rule (NDVI changed, NDBI didn't → drop); SCL cloud/shadow mask; morph open/close (5×5 ellipse); min-area; counts of what each rule removed |
| `engine/vectorise.py` | clean mask → polygons | `rasterio.features.shapes`, simplify ≈ 1 px; optional **watershed split** of touching buildings (A7) |
| `engine/attributes.py` | polygons + rasters → GeoDataFrame | Area in **local UTM**; mean magnitude; centroid (WGS84); `change_type`; `reason` string; `score = area × magnitude`; `tier`; `confidence`; `needs_review`; `review_status = pending` |
| `engine/context.py` *(additions)* | GeoDataFrame + layers → enriched GeoDataFrame | Permit join → `permit_status` (A1); no-build-zone join → tier +1 and reason (A2); ward/village name (A3) |
| `engine/export.py` | GeoDataFrame → files | GPKG (UTM), GeoJSON (WGS84), CSV/KML field pack (A4), PDF report, `audit.json` (A10) |
| `engine/run.py` | CLI: `python -m engine.run before.tif after.tif --mode auto --out out/` | Runs the whole chain; the API calls the same function |
| `engine/config.py` | | Tier thresholds, min area, kernel size, prob threshold, presets (A9). Nothing hardcoded elsewhere |

### Confidence

`confidence` is the mean model probability inside the polygon (deep mode), or the polygon's mean change-vector magnitude as a percentile of the scene (spectral mode). Polygons with confidence between 0.5 and 0.7 get `needs_review = true` (A8).

### Reason strings (explainability)

`attributes.py` builds the reason from what actually fired, for example:
- spectral: `"built-up index rose (+0.21), vegetation fell (−0.34)"`
- deep: `"model confidence 0.91 over 1,089 m²"`
- context: `"… · inside lake buffer (50 m)"`

### Tiers (defaults; preset-configurable)

| Tier | `score = area_m2 × magnitude` |
|---|---|
| critical | ≥ 1000 |
| high | 300–999 |
| medium | 120–299 |
| low | < 120 |

---

## 3. Mode selection (`--mode auto`)

| Condition | Mode |
|---|---|
| ≥ 4 bands incl. NIR/SWIR **and** pixel size ≥ 5 m | `spectral` |
| 3-band RGB **and** pixel size ≤ 2 m | `deep` |
| Anything else | Reject with a clear message (never run a model on the wrong resolution) |

---

## 4. Data and model setup

- **BIT weights:** `models/BIT_LEVIR/best_ckpt.pt` (from the BIT_CD repo). Loaded once per process.
- **Demo scenes** (`demos/<name>/`): `before.tif`, `after.tif`, `meta.json` (dates, place, source), prerendered previews, and a cached result so the demo never waits.
- **Sentinel-2 fetch** (A6, `engine/fetch_s2.py`): `pystac-client` on Earth Search, filtered by AOI and date ±15 days, sorted by `eo:cloud_cover`. Reads only the AOI window from the COGs (B02, B03, B04, B08, B11, SCL), then resamples B11/SCL to 10 m.
- **Context layers:** OSM water bodies, parks/forest and admin boundaries for the demo areas, saved as GPKG in `demos/context/`.

---

## 5. API contract (FastAPI, `api/main.py`)

| Method | Path | Request | Response |
|---|---|---|---|
| `GET` | `/health` | | `{ ok, model_loaded, version }` |
| `GET` | `/metrics` | | Contents of `eval/results.json`: LEVIR-CD test F1/IoU/P/R, false alarms per km² with filter off/on, no-change result, seconds per km² per mode |
| `GET` | `/demos` | | `[{ id, name, place, before_date, after_date, mode }]` |
| `POST` | `/analyze` | multipart `before`, `after` **or** `demo_id`; `mode`, `preset`, `min_area_m2`; optional `permits`, `zones` files | `{ job_id }` |
| `GET` | `/jobs/{id}` | | `{ status: queued|running|done|error, stage, progress 0–1, warnings[], error? }` |
| `GET` | `/jobs/{id}/result` | `filtered=true|false` | GeoJSON FeatureCollection (WGS84) + `summary` |
| `GET` | `/jobs/{id}/preview/{before|after}` | | PNG/WebP + bounds |
| `GET` | `/jobs/{id}/crop/{fid}/{before|after}` | | PNG crop of one polygon |
| `PATCH` | `/jobs/{id}/features/{fid}` | `{ review_status }` | Updated feature |
| `GET` | `/jobs/{id}/export` | `format=gpkg|geojson|pdf|csv|kml`, `confirmed_only`, `lang=en|en-hi` (PDF only, A11) | File |
| `POST` | `/fetch-s2` *(A6)* | `{ aoi (GeoJSON), date_before, date_after, preview_only? }` | `preview_only=true`: the chosen scenes `[{ date, cloud_pct }]`; otherwise `{ job_id }` (then same flow) |

**`summary` shape:**
```json
{
  "raw_detections": 412, "after_filter": 37,
  "dropped": { "seasonal": 260, "cloud": 41, "min_area": 74 },
  "total_area_m2": 12410.0,
  "by_tier": { "critical": 2, "high": 8, "medium": 17, "low": 10 },
  "by_type": { "built_up_gain": 30, "vegetation_loss": 5, "water_gain": 2 },
  "mode": "spectral", "runtime_s": 18.4, "area_km2": 4.2, "s_per_km2": 4.4,
  "warnings": []
}
```
_Numbers are illustrative._

**Feature properties:** `id, area_m2, magnitude, confidence, needs_review, centroid_lat, centroid_lon, change_type, reason, score, tier, review_status` (+ `permit_status, zone, ward` when context layers are given).

**Jobs:** in-process background tasks (`BackgroundTasks` / a thread pool), with results under `runs/<job_id>/`. That is enough for a hackathon. No database: job state is a JSON file per job.

**Serving a mobile client (the Android app):**
- **Small payloads.** Previews are WebP capped at 2048 px on the long side, with bounds in the response. Crops are ≤ 512 px. GeoJSON coordinates are rounded to 6 decimals, and responses are gzip-compressed (`GZipMiddleware`).
- **Raw layer cap.** The `filtered=false` layer can hold thousands of noise blobs. Simplify it harder and cap it at the 2,000 largest, while reporting the true count in `summary.raw_detections`, so the toggle stays instant on a phone.
- **Resumable jobs.** Job state lives on disk, so the app can reopen and poll the same `job_id` after being closed.
- **Idempotent review.** `PATCH` with the same status twice is a no-op, so the app's offline review queue can safely retry.
- **Upload limit** configurable (default 500 MB); temporary files deleted after the export window. CORS open only if a web client is added later.

---

## 6. Build phases

### Phase 1: Spectral mode end to end (CLI)
- **Implementation:** `ingest.py` + `change_spectral.py` + `filters.py` (morph, min-area) + `vectorise.py` + `attributes.py` + `export.py` (GeoJSON/GPKG) on **one Sentinel-2 pair**.
- **Done when:** the GPKG opens correctly in QGIS, with the right CRS, areas and attributes.

### Phase 2: API skeleton + demo scenes
- **Implementation:** `/health`, `/demos`, `/analyze`, `/jobs/{id}`, `/jobs/{id}/result`, `/preview`. Two demo scenes with cached results.
- **Done when:** the Android app switches from its bundled demo data to the real API by changing the backend URL in Settings.

### Phase 3: Deep mode
- **Implementation:** port `prototype/pipeline.py`'s BIT loader and inference into `change_deep.py` (load once, tiled with overlap); `mode=auto` routing.
- **Eval:** `eval/levir_eval.py` on the **full LEVIR-CD test split**, reporting P/R/F1/IoU and seconds per km² in `eval/results.md` and `eval/results.json` (served by `GET /metrics`).

### Phase 4: False-alarm suppression + tiers
- **Implementation:** seasonal rule, SCL mask, drop counters, `filtered=false` raw layer, reason strings, tiers from `config.py`, shift check (A5).
- **Eval:** `eval/false_alarms.py` reports raw vs filtered detections per km² on a matched-season pair, a mismatched-season pair and an **unseen no-change pair**.

### Phase 5: Review + exports
- **Implementation:** `PATCH` review, `confirmed_only` export, PDF report (map snapshot, totals, top 10), field pack CSV/KML with Maps links (A4), `audit.json` (A10).

### Phase 6: Additions (pick by priority)
- **A6** S2 fetch (the main phone input; move it earlier if the app depends on it) → **A2** no-build zones → **A1** permits → **A3** wards → **A7** watershed split → **A9** presets → **A11** bilingual PDF (stretch).

---

## 7. Tests (`tests/`, pytest)

| Test | Checks |
|---|---|
| `test_ingest.py` | Mismatched CRS gets resampled; identical grids pass untouched; a synthetic 2 px shift is detected |
| `test_spectral.py` | A synthetic pair with a known built-up square gives `built_up_gain` at that location |
| `test_filters.py` | Specks under the min area are removed; an NDVI-only change is dropped by the seasonal rule |
| `test_vectorise.py` | A known square mask gives one polygon with the right area in m² (±1 px) |
| `test_attributes.py` | Score and tier boundaries; centroid round-trips WGS84 ↔ UTM |
| `test_api.py` | The demo job runs to `done`; result is valid GeoJSON; export formats download |
| `test_deep.py` *(slow, marked)* | BIT loads; a sample tile's F1 is within tolerance of the prototype's |

Run `ruff check` + `pytest -m "not slow"` in CI on every push.

---

## 8. Performance and limits

- Load the model once. Use windowed reads and tiled inference so memory is bounded by tile size, not scene size.
- Target under 2 minutes for a demo scene on a laptop CPU. Measure and report seconds per km² per mode.
- The deep model is for buildings only. Floods and vegetation go through spectral mode (state this in the UI and the pitch).
- LEVIR-CD has no coordinates, so use it **for metrics only**. Live demos use real GeoTIFFs.

---

## 9. Hosting

- **Demo:** run on the presenter's laptop with `uvicorn api.main:app --host 0.0.0.0 --port 8000`, with demo scenes and weights on disk. The phone connects over the same Wi-Fi or the phone's hotspot (`http://<laptop-ip>:8000`, set in the app's Settings). If even that fails, the app's bundled demo mode still runs the demo.
- **Optional deploy:** a Docker image (`python:3.11-slim` + GDAL wheels via rasterio) on Render, Railway or a VM. A CPU instance is enough for the demo scenes.

---

## 10. Definition of done

- [ ] `python -m engine.run` produces GPKG + GeoJSON + summary + audit for both modes.
- [ ] Every polygon has area, magnitude, centroid, type, reason, score and tier.
- [ ] The raw vs filtered layers and drop counts are returned; the no-change pair gives ~0 polygons.
- [ ] Full-test-split LEVIR-CD metrics and speed are recorded in `eval/results.md`.
- [ ] Every endpoint in §5 works with the Android app (including `/metrics`); exports open in QGIS / QField.
- [ ] `pytest -m "not slow"` and `ruff` are green in CI.
