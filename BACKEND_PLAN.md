# GEOAI 04: Backend, ML and Deployment Plan

> **Status (10 Oct 2026).** This is the backend design record. The integrated engine, API and web app are on `main`, deployed and tested; [`README.md`](README.md) has the current results, numbers and run instructions. Where this plan disagrees with the README, the README wins.

**What it is:** the change-detection engine (ingest → detect → filter → vectorise → attribute → impact) plus a FastAPI service around it, an ML track that **retrains a model on real Sentinel-2 change data**, an evaluation harness that produces the numbers we show judges, and the deployment recipe.
**Folders:** `engine/` (pure Python pipeline, no web code) · `api/` (FastAPI) · `ml/` (data loaders, models, training, evaluation) · `eval/` (metric scripts + `results.json`) · `demos/` (preloaded scenes) · `tests/` · `scripts/`
**Stack:** Python 3.11 · Rasterio · NumPy · OpenCV · scikit-image · Shapely 2 · GeoPandas · pyproj · PyTorch (CPU at serve time; GPU on Kaggle/Colab for training) · FastAPI + Uvicorn · pytest + ruff · Docker
**Starting point:** [`prototype/pipeline.py`](prototype/pipeline.py) (runs end to end on LEVIR-CD pairs) and `engine/s2.py` + `engine/config.py` (Sentinel-2 scene search and AOI reads, written, not yet tested end to end).
**Live:** https://geoai04.onrender.com
**Related:** [`FRONTEND_PLAN.md`](FRONTEND_PLAN.md) (the web app) · [`README.md`](README.md) · [presentation](PPT/FUS_016_GEO_AI_04_SlothDev.pptx)

> **What changed from the earlier plan.** (1) The client is a **website**, not an Android app, because the official statement asks for an interactive split-view **web** map. (2) We now **retrain a model** on real labelled Sentinel-2 change data (OSCD) and report held-out numbers, instead of relying only on pretrained weights. (3) A new **impact** stage turns polygons into numbers a public official cares about. (4) The architecture is **static-first**: demo results are precomputed, so the deployed site always works even if the live backend is asleep.

---

## 0. Locked scope (9 Oct 2026)

- **Core:** B4 static-first files + B1 FastAPI / Rasterio / PyTorch. Models: **M7** composites + persistence, **M9** confidence + ablation, **M3** OSCD-trained U-Net, **M1** spectral.
- **Optional layer:** **B3** browser-first compute (spectral engine + exported small model as ONNX), built only after the core demo and tests are green.
- **Gated:** **M8** Sentinel-1 radar flood mode, only after the full pipeline works end to end. **Data sourcing is decided** (Ayush, branch `backend-2`): train / calibrate on Microsoft Planetary Computer, test on NASA OPERA RTC-S1. Five live checks remain (section 13).

---

## 1. The backend in one picture

```
             ┌──────────────────── engine/ (importable, testable, no FastAPI) ─────────────────────┐
before.tif ─┤ ingest.py ──► change_spectral.py ─┐                                                  │
after.tif  ─┤ (validate,    change_learned.py  ─┼─► filters.py ─► vectorise.py ─► attributes.py ─► impact.py ─► export.py
            │  resample,    change_deep.py     ─┘   (season, SCL,   (shapes,        (area, magnitude,   (ha flooded,     (GPKG, GeoJSON,
            │  hist-match,                           morph, min-area)  simplify)       centroid, type,     buildings,       PDF, CSV/KML,
            │  shift check)                                                            reason, tier)       cropland, roads)  audit.json)
            └──────────────────────────────────────────────────────────────────────────────────────┘
                              ▲                                              │
                   api/ (FastAPI: demos, jobs, results, exports, review) ◀──┘ ──► web app (static demos + live API)

   ml/  (train + evaluate)  ──► models/*.pt (weights)  ──► engine/change_learned.py
   eval/ (metrics)          ──► eval/results.json      ──► GET /metrics and the Accuracy page
```

**Rule:** `engine/` never imports from `api/`. Every stage is a pure function over arrays or GeoDataFrames, so each stage is unit-testable and re-runnable from the CLI.

---

## 2. Requirements coverage

Checked against the official GEOAI 04 problem statement.

| Official requirement | Module | Test / evidence |
|---|---|---|
| Input: two co-registered orthorectified GeoTIFF tiles over the same bounding box | `ingest.py` | `test_ingest.py` |
| Siamese CNN, pretrained ViT feature difference, **or** spectral change index (NDVI change, optionally with a lightweight U-Net) | `change_spectral.py`, `change_learned.py` (our lightweight Siamese U-Net), `change_deep.py` (BIT) | `eval/` on OSCD and LEVIR-CD |
| Separate critical change from false alarms (seasonal vegetation, sun angle) | `filters.py`, histogram match in `ingest.py` | `eval/false_alarms.py`, `test_filters.py` |
| Morphological filtering to prune noise | `filters.py` | `test_filters.py` |
| Contour-to-polygon vectorisation with Rasterio | `vectorise.py` | `test_vectorise.py` |
| Attributed polygons: area (m²), change magnitude, centroid | `attributes.py` | `test_attributes.py` |
| GIS-ready GeoPackage / GeoJSON categorised into severity tiers | `export.py`, tiers in `config.py` | opens in QGIS (manual check, screenshot kept) |
| Interactive before/after split-view web map | API + web app | Playwright smoke test |

---

## 3. Modules

| Module | Input → output | Key details |
|---|---|---|
| `engine/ingest.py` | two paths → `Pair(a, b, transform, crs, meta, warnings)` | Check CRS, bounds, resolution; `rasterio.warp.reproject` after → before grid; `match_histograms`; windowed reads; **sub-pixel shift check** (`phase_cross_correlation`), warn if > 1 px |
| `engine/s2.py` *(exists)* | AOI + months → Sentinel-2 stacks | Scene search through the public COG bucket, AOI window reads (B02, B03, B04, B08, B11, SCL), DN-offset handling for baseline ≥ 04.00. **Test it on a normal laptop first.** The code contains sandbox-specific paths |
| `engine/change_spectral.py` | S2 bands → `magnitude`, `mask`, `type_map` | NDVI / NDBI / NDWI per date, differences, change-vector magnitude, **Otsu**; types: built-up gain, vegetation loss, water gain / loss. Thresholds live in `config.Params` |
| `engine/change_learned.py` | S2 bands → `prob`, `mask` | **Our retrained model (see §5).** Loaded once at startup; 128 px tiles with overlap, averaged stitching; threshold chosen on the validation cities |
| `engine/change_deep.py` | RGB pair (VHR) → `prob`, `mask` | BIT with LEVIR-CD weights, ported from the prototype (torchvision shim + `safe_globals` loader). Only for ≤ 2 m RGB |
| `engine/filters.py` | mask (+ indices, SCL) → clean mask + `drop_counts` | Seasonal-vegetation rule (NDVI changed, NDBI did not → drop); SCL cloud / shadow mask; morphological open / close; min-area; counts what each rule removed |
| `engine/vectorise.py` | clean mask → polygons | `rasterio.features.shapes`, simplify ≈ 1 px; optional watershed split of touching buildings |
| `engine/attributes.py` | polygons + rasters → GeoDataFrame | Area in **local UTM**; mean magnitude; centroid (WGS84); `change_type`; `reason`; `score = area × magnitude`; `tier`; `confidence`; `needs_review`; `review_status` |
| `engine/impact.py` | GeoDataFrame + context layers → impact summary | See §4. Hectares changed, hectares of **cropland** affected, **buildings** and **road segments** touched, per tier |
| `engine/context.py` *(stretch)* | GeoDataFrame + layers → enriched | Permit join (`permit_status`), no-build-zone escalation, ward name |
| `engine/export.py` | GeoDataFrame → files | GPKG (UTM), GeoJSON (WGS84), CSV/KML field pack, one-page PDF, `audit.json` |
| `engine/run.py` | CLI | `python -m engine.run before.tif after.tif --mode auto --out out/`; the API calls the same function |
| `engine/config.py` *(exists)* | | Tier thresholds, min area, kernel size, presets. Nothing hard-coded elsewhere |

### Confidence, reasons, tiers
- `confidence`: mean model probability inside the polygon (learned / deep) or the polygon's mean change-vector magnitude as a percentile of the scene (spectral). Mid-range confidence → `needs_review = true`.
- `reason` is built from what actually fired, e.g. `"water index rose (+0.42), vegetation fell (−0.31)"` or `"model confidence 0.91 over 1,089 m²"`.
- Tiers use `score = area_m2 × magnitude`: critical ≥ 1000, high ≥ 300, medium ≥ 120, else low. **These thresholds are guesses**: tune them on the demo scenes and write the final values in `config.py`.

### Mode selection (`--mode auto`)

| Condition | Mode |
|---|---|
| ≥ 4 bands incl. NIR/SWIR **and** pixel size ≥ 5 m | `learned` if `eval/results.json` shows it beating spectral on the OSCD test cities, else `spectral` |
| 3-band RGB **and** pixel size ≤ 2 m | `deep` (BIT) |
| Sentinel-1 RTC pair (VV/VH, flood preset) *(gated)* | `radar` (M8): reports **open-water flood extent**, not full flood damage |
| Anything else | Reject with a clear message (never run a model at the wrong resolution) |

---

## 4. Impact stage: turning polygons into numbers

The point of the disaster framing is that officials act on **quantities**, so every run also produces an `impact` block.

| Quantity | Source | Notes |
|---|---|---|
| Area changed (ha), by tier and type | the polygons | Always available |
| **Cropland affected (ha)** | **ESA WorldCover 2021** (10 m, class 40), windowed read from the open COG bucket | Ties the work to farmers; cache a crop per demo AOI |
| **Buildings touched** | OpenStreetMap building footprints (Overpass), intersected with the polygons | Pre-fetch and cache as GPKG for each demo AOI so deployment never depends on a live Overpass call |
| **Road segments touched** | OSM roads | Same caching rule |
| Population (stretch) | WorldPop 100 m raster | Only if time remains |

Honesty rules: label OSM and WorldCover figures as **estimates from open data**; show the source and date next to each number; never present synthetic or placeholder values as real.

---

## 5. ML track: retrain on real data

**Why:** the pretrained BIT model was trained on 0.5 m RGB building change (LEVIR-CD). It does not transfer to 10 m Sentinel-2, so for the disaster and encroachment demos we currently rely on thresholded spectral indices. Training on **OSCD** (Onera Satellite Change Detection: Sentinel-2 pairs with pixel-level urban-change labels; official split of 14 training and 10 test cities) gives us a learned model on the right resolution and an honest held-out score.

| Step | What | Output |
|---|---|---|
| **M0** | Download OSCD (Kaggle: `soumikrakshit/onera-satellite-change-detection-dataset`). Write `ml/oscd_data.py`: reads the 13-band pairs, normalises per band, makes 128 px patches with stride, random flips / 90° rotations, and **holds out 3 training cities as validation** | Loader + a unit test on shapes |
| **M1** | **Baselines on the 10 test cities:** (a) our spectral mode; (b) naive differencing; (c) pretrained BIT on RGB bands without training | `eval/oscd_baselines.json`: precision, recall, F1, IoU on the change class |
| **M2a** | Train a **lightweight Siamese U-Net** (FC-Siam-diff style, ~1 to 2 M parameters) on the 13 bands (or the 10 usable bands), loss = weighted BCE + Dice, AdamW, cosine schedule, early stopping on the validation cities, on a free Kaggle or Colab GPU | `models/siamunet_oscd.pt` |
| **M2b** *(parallel if a second person has GPU time)* | **Fine-tune BIT** on OSCD RGB patches starting from the LEVIR weights | `models/bit_oscd.pt` |
| **M3 (decision gate)** | Pick the winner **by validation F1, then report once on the test cities**. Choose the probability threshold on validation, never on test. If neither beats the spectral baseline on test, **ship spectral as default and report the learned result honestly** | `eval/results.json` |
| **M4** *(stretch)* | Flood water model check: NDWI + Otsu water IoU on a labelled flood set (Sen1Floods11 hand-labelled Sentinel-2 chips) | Number for the flood claim |

**Rules for the numbers we show judges:**
- Test cities are touched **once**. Everything is tuned on validation.
- OSCD is small and hard: published F1 values are modest. We report what we measure and do not compare against LEVIR numbers, which are on an easier task.
- Always show **spectral vs learned vs naive** side by side, plus false alarms per km² with the filter off and on.
- Record seed, commit hash, training time and hardware in `eval/results.json`.
- Full-test-split LEVIR-CD for BIT (`eval/levir_eval.py`) is optional. If we skip it, quote the published value and label it **published, not reproduced**.

**Training budget (rough):** 1 to 2 hours of GPU for M2a. If the first run is poor, check normalisation, the positive-class weight and patch sampling before changing the architecture.

---

## 6. API contract (FastAPI, `api/main.py`)

The web app works **without** this API for the demo scenes (see §8). The API adds live analysis, uploads and exports.

| Method | Path | Request | Response |
|---|---|---|---|
| `GET` | `/health` | | `{ ok, models: { learned, deep }, version }` |
| `GET` | `/metrics` | | Contents of `eval/results.json` |
| `GET` | `/demos` | | `[{ id, name, place, event, before_date, after_date, mode, bounds }]` |
| `GET` | `/demos/{id}/result` | `filtered=true\|false` | GeoJSON FeatureCollection (WGS84) |
| `GET` | `/demos/{id}/summary` | | `summary` + `impact` |
| `GET` | `/demos/{id}/preview/{before\|after}` | | WebP + bounds |
| `POST` | `/analyze` | multipart `before`, `after` **or** `demo_id`; `mode`, `preset`, `min_area_m2` | `{ job_id }` |
| `POST` | `/fetch-s2` *(stretch)* | `{ aoi (GeoJSON), date_before, date_after }` | `{ job_id }` |
| `GET` | `/jobs/{id}` | | `{ status, stage, progress, warnings[], error? }` |
| `GET` | `/jobs/{id}/result` · `/summary` · `/preview/{side}` · `/crop/{fid}/{side}` | | Same shapes as the demo routes |
| `PATCH` | `/jobs/{id}/features/{fid}` | `{ review_status }` | Updated feature (idempotent) |
| `GET` | `/jobs/{id}/export` | `format=gpkg\|geojson\|pdf\|csv\|kml`, `confirmed_only` | File |

**`summary` shape** (numbers illustrative):
```json
{
  "raw_detections": 412, "after_filter": 37,
  "dropped": { "seasonal": 260, "cloud": 41, "min_area": 74 },
  "total_area_m2": 12410.0,
  "by_tier": { "critical": 2, "high": 8, "medium": 17, "low": 10 },
  "by_type": { "built_up_gain": 30, "vegetation_loss": 5, "water_gain": 2 },
  "mode": "spectral", "runtime_s": 18.4, "area_km2": 4.2, "s_per_km2": 4.4,
  "impact": { "cropland_ha": 0.0, "buildings": 0, "road_segments": 0, "sources": ["ESA WorldCover 2021", "OSM 2026-10"] },
  "warnings": []
}
```

**Feature properties:** `id, area_m2, magnitude, confidence, needs_review, centroid_lat, centroid_lon, change_type, reason, score, tier, review_status`.

**Jobs:** in-process thread pool, state as one JSON file per job under `runs/<job_id>/`, no database. CORS allow-list from an environment variable (`ALLOWED_ORIGINS`) so the Vercel site can call the Space. Responses use `GZipMiddleware`; the `filtered=false` layer is simplified and capped at the 2,000 largest blobs while the true count is reported. Upload limit 200 MB by default.

---

## 7. Tests

Run `ruff check .` and `pytest -m "not slow"` locally and in CI on every push.

| File | Checks |
|---|---|
| `test_ingest.py` | A mismatched CRS is reprojected; identical grids pass untouched; a synthetic 2 px shift is detected |
| `test_spectral.py` | A synthetic pair with a known built-up square gives `built_up_gain` at that location; a flooded square gives `water_gain` |
| `test_filters.py` | Specks under the minimum area are removed; an NDVI-only change is dropped by the seasonal rule; cloud pixels are masked |
| `test_vectorise.py` | A known square mask gives one polygon with the right area in m² (± 1 pixel) |
| `test_attributes.py` | Score and tier boundaries; centroid round-trips WGS84 ↔ UTM |
| `test_impact.py` | A polygon over a known cropland patch and a known building footprint returns the expected hectares and counts |
| `test_oscd_data.py` | Loader shapes, normalisation and that validation cities never appear in train |
| `test_learned.py` *(slow)* | Weights load; a small fixture patch gives a probability map in [0, 1]; F1 on a fixture is within tolerance |
| `test_deep.py` *(slow)* | BIT loads; a sample tile's F1 is within tolerance of the prototype |
| `test_api.py` | `/health`; a demo job runs to `done`; result is valid GeoJSON with all required properties; each export format downloads; review `PATCH` is idempotent |
| `test_radar.py` *(gated)* | A synthetic dB pair with a known dark square gives a water-gain polygon there; permanent water and high ground are masked; the dB conversion masks zeros first |
| `test_s1_access.py` *(gated, marked `integration`, needs network)* | Lists `sentinel-1-rtc` scenes for an Assam box and reads a small window |
| `test_e2e_cli.py` | `python -m engine.run` on a tiny synthetic pair produces GPKG + GeoJSON + summary + audit |

CI (`.github/workflows/ci.yml`): Python 3.11, install CPU torch, `ruff`, `pytest -m "not slow"`, then the web job from `FRONTEND_PLAN.md`.

---

## 8. Static-first demo data

For each demo scene the script `scripts/export_demo_assets.py` runs the engine once and writes:

```
web/public/demos/<id>/
  meta.json          place, event, dates, scene ids, cloud %, source, mode
  before.webp  after.webp   (≤ 2048 px long side) + bounds.json
  result_filtered.geojson   result_raw.geojson
  summary.json       counts, drop counts, tiers, types, impact block
  crops/<fid>_before.webp  <fid>_after.webp   (top 20 changes)
```

The web app reads these static files directly. The live API is an **optional extra**: if the Space is asleep, over quota or unreachable, the demo still works. The `/demos/*` API routes serve the same files.

**Demo scenes (decide in the first two hours; verify with `engine/s2.py` that the area is clear of cloud):**

| Scene | Purpose | Notes |
|---|---|---|
| **Flood / disaster event** (optical, or radar once M8 lands: Assam / Bihar / Kerala monsoon events are the M8 targets) | Main story: ranked flood polygons, hectares of cropland affected, buildings and roads touched | Candidates: a recent flood in India or a clear-sky event elsewhere. **Pick by the post-event AOI cloud percentage (< 5 %) and a before date from the same season.** Floods during the monsoon are often cloudy, so test several |
| **Urban encroachment** | Second story: new construction on a city edge | `pune-hinjewadi` and `navi-mumbai-airport` are already defined in `scripts/fetch_demo_scenes.py` |
| **Season control** | False-alarm proof: nothing real changed, only crops and lighting | `season-control` (Saswad) is defined; also try an **unseen** no-change pair |

---

## 9. Deployment

| Piece | Where | How |
|---|---|---|
| **Web app** | **Vercel** (free) | Connect the repo, root directory `web/`, build `npm run build`, env `VITE_API_URL`. Static demo data ships inside the build |
| **API** | **Hugging Face Spaces** (Docker SDK). **Check first:** the official docs and July 2026 forum posts say Docker Spaces may now need a paid plan, so confirm in the Space creation dialog before building around it. If it is paid, use the fallbacks below or the browser-first design | `Dockerfile` based on `python:3.11-slim`, CPU torch wheels, `uvicorn api.main:app --host 0.0.0.0 --port 7860`. Weights and cropped demo TIFFs live in the Space (Git LFS) or are downloaded in the Dockerfile from a GitHub Release |
| Fallback API | Render or a laptop with a tunnel | Render's free tier has about 512 MB RAM, which is too small for torch. Use it only for spectral mode |

**Rules:**
1. **Deploy a skeleton by the first checkpoint, and redeploy often.** Do not leave deployment to the last hours.
2. The deployed demo must work with the backend **off** (static-first).
3. `/health` is the Space's health check; add a cold-start note in the UI ("first live analysis can take about a minute").
4. No secrets in the repo. Use `.env` locally and the host's secret store in production. `.env.example` is committed.
5. Keep large files out of git: weights and TIFFs via LFS or release assets, and reflect that in `.gitignore`.

---

## 10. Build phases

| Phase | Deliverable | Done when |
|---|---|---|
| **B1** | Spectral mode end to end on one Sentinel-2 pair, `engine.run` CLI, GPKG + GeoJSON | The GPKG opens in QGIS with the right CRS and attributes |
| **B2** | `export_demo_assets.py` produces the static demo folder for two scenes; API skeleton (`/health`, `/demos`, `/analyze`, `/jobs`) | The web app renders a demo from the static folder |
| **B3** | False-alarm rules, drop counts, raw and filtered layers, tiers, impact block | The counter shows raw → filtered; the no-change pair gives about 0 polygons |
| **B4** | ML: OSCD loader, baselines, trained model, decision gate, `eval/results.json` | Numbers are generated by one command and served by `/metrics` |
| **B5** | Live `/analyze` with `learned` and `deep` modes, review `PATCH`, exports (GPKG, GeoJSON, PDF, CSV/KML), `audit.json` | Every endpoint in §6 passes `test_api.py` |
| **B6** | Dockerfile, Space deploy, CORS, health check, CI green | The Vercel site calls the Space successfully |
| **B7** *(stretch)* | `/fetch-s2` area + dates, no-build zones, permits, Sentinel-1 radar flood mode | Only if everything above is green |

---

## 11. Definition of done

- [ ] `python -m engine.run` produces GPKG + GeoJSON + summary + audit for every mode that ships.
- [ ] Every polygon has area, magnitude, centroid, type, reason, score and tier.
- [ ] Raw vs filtered layers and drop counts are produced; the unseen no-change pair gives about 0 polygons.
- [ ] `eval/results.json` holds held-out OSCD results for spectral, naive and the learned model, with seed and commit, and the API serves it.
- [ ] The impact block is filled for the flood scene, with sources named.
- [ ] `ruff` and `pytest -m "not slow"` are green in CI; slow tests were run once locally and the result noted in the README.
- [ ] The API is live on a public URL and the deployed web app works with and without it.
- [ ] The GPKG opens in QGIS (screenshot in `docs/img/`).

---

## 12. Added modules for the locked scope

| Module / script | What | Phase |
|---|---|---|
| `engine/composite.py` | Search several least-cloudy scenes per period (`engine/s2.py`), mask with SCL, take the per-pixel **median** to build the before and after images; record scene ids and dates | B3-core |
| `engine/persistence.py` | For encroachment mode, keep a change only if it appears in at least 2 post-event scenes (or composites of different weeks); flood mode skips it because floods are transient | B3-core |
| `eval/ablation.py` | On a matched-season pair, a mismatched-season pair and an **unseen no-change pair**, report raw detections and what each rule (histogram match, seasonal rule, cloud mask, composite, persistence, morphology, min area) removes; writes `eval/ablation.json` | B4-ML |
| `eval/bootstrap.py` | **95 % confidence intervals** for precision, recall, F1 and IoU on the OSCD test cities (bootstrap over test tiles, fixed seed) | B4-ML |
| `engine/quality.py` | **Data-quality flags** per scene: cloud %, co-registration shift, season gap, resolution; returned in `summary.warnings` | B3-core |
| `ml/export_onnx.py` | Export the chosen model to ONNX; `tests/test_onnx_parity.py` checks the ONNX output matches PyTorch within tolerance on fixture patches | Optional (B3) |
| `engine/report.py` | One-page **PDF report** with **fpdf2** (pure Python, no system libraries, so it also installs on Windows; WeasyPrint needs GTK there): map snapshot image, totals, impact block, top 10 changes, sources, limits, and a QR code (`qrcode`) to the permalink. Called by `export.py` and by `scripts/export_demo_assets.py` for prebuilt demo PDFs | Core |
| `engine/s1.py` *(gated)* | Sentinel-1 data access: **Planetary Computer** `sentinel-1-rtc` through `pystac-client` + `planetary-computer` (anonymous token, no account; sign right before reading), and **NASA OPERA RTC-S1** through `asf_search` / Earthdata login (credentials in `.env` only). Windowed reads of `vv` and `vh` | After the core works |
| `engine/radar.py` *(gated)* | M8 radar flood mode (see section 13): dB conversion, 5x5 median speckle filter, log-ratio, event-level Otsu, permanent-water and HAND masks, then the same morphology, vectorise, attributes and tiers chain | After the core works |

### State and sharing (no sign-in)

- A **permalink** stores the *inputs*: AOI, dates, scene ids, mode, thresholds. The same inputs give the same output on any device, because Sentinel-2 is public.
- Results are also **portable files** (GeoJSON / GPKG), and a small result can ride in the URL fragment (never sent to a server).
- An **opt-in share** uploads only the derived polygons to static storage under an unguessable id; the API needs no accounts.
- Phones are **view-first**: they open a shared or precomputed result; recompute is for small areas only.
- Pitch wording: "analysis can run locally; sharing is opt-in". The privacy claim applies to private uploaded imagery only.

### Honest accuracy reporting

Report held-out OSCD metrics **with 95 % confidence intervals**, the ablation table, and calibrated per-polygon confidence. A user's own run has no labels, so do not show them an F1 for it.

---

## 13. M8 radar flood mode: data and method decisions (from Ayush, `backend-2`, 9 Oct 2026)

Status: **built and evaluated on Sen1Floods11 (results in the README); the live 2026 NASA OPERA fetch is not verified.**

### Why
Optical imagery is blind under monsoon cloud, the season when floods happen. Radar sees through cloud. Calm open water scatters the radar pulse away, so **new water is a sharp drop in backscatter** between a before and an after image. Ayush's survey found none of nine prior projects ships a working Sentinel-1 flood pipeline.

### Data split (train on one source, test on another)

| Role | Source | Product | Use |
|---|---|---|---|
| Training / calibration | **Microsoft Planetary Computer** | `sentinel-1-rtc` (terrain corrected, archive 2014 to about April 2026) | Fit thresholds and rules on historical floods. **No account needed** (anonymous token, maintainer-confirmed in Discussion #351) |
| Labels | **Sen1Floods11** | Hand-labelled chips, including **68 Indian chips (Assam, 12 Aug 2016)** | Ground truth for calibration. Public bucket `gs://sen1floods11`, no login |
| Testing | **NASA OPERA RTC-S1** (via ASF) | `OPERA_L2_RTC-S1`, global land since April 2016, current through 2026 | **2026 flood events never used for tuning.** A different processor, so it also tests generalisation. Needs a free Earthdata login |
| Reference | **Copernicus GFM** | Automated flood extent | Independent comparison map for 2026 test events (free registration and API token) |
| Masks | JRC Global Surface Water; Copernicus DEM / HAND | Permanent water; height above nearest drainage | Remove rivers that were already water and false water on high ground and hill shadow |

**Why MPC is not used for 2026:** GitHub issue #473 (opened 2026-04-22, open) reports that MPC Sentinel-1 and Sentinel-2 ingestion stopped on 17 April 2026, and #472 reports missing RTC scenes for Jan to Feb 2026. We have not independently confirmed either issue.

### Method (threshold-and-rules, calibrated, not a big network)
1. Convert to dB (`10*log10`, mask zeros first), 5x5 median speckle filter, reproject both sources to the local UTM zone at **30 m**, same polarisation choice (VV primary, VH secondary) in training and testing.
2. Compute the **log-ratio** (post minus pre, in dB) and the post-event backscatter.
3. Flag new water where post-event backscatter is below an **event-level Otsu threshold** and the log-ratio shows a clear drop. Use **relative** features, not absolute dB thresholds, because they transfer between processors better.
4. Remove pixels that were already water (JRC permanent water, or water in the pre image) and high ground (HAND, slope).
5. Morphological clean-up, vectorise, attributes (`reason`, for example "backscatter fell 6.2 dB; not permanent water"), tiers. Pre-event reference: the **median of 2 to 3 dry-season scenes from the same orbit**.
6. If time allows, gradient boosting on the same features, still tested only on OPERA 2026 events.
7. **Freeze** the calibrated parameters in a versioned file (`engine/params_m8.json`); never tune on a test event.

### Evidence so far (measured by Ayush, not re-run by us)
Single-date water mapping on the 68 Indian Sen1Floods11 chips, IoU against hand labels:

| Method | IoU, all water | IoU, flood only (permanent water removed) |
|---|---|---|
| Per-chip Otsu on VV | 0.22 | 0.18 |
| Fixed -15 dB on VV | 0.50 | 0.41 |
| **Event-level Otsu on VV + 5x5 median** (-14.06 dB) | **0.52** | **0.43** |
| Event-level Otsu on VH + 5x5 median (-19.45 dB) | 0.52 | **0.44** |

- Thresholds **must be fitted at event level**; per-chip Otsu more than halves accuracy.
- This is a **single-date lower bound**; Sen1Floods11 has no pre-event radar, so the before/after version was measured label-free on a real July 2024 Assam event (see `eval/README.md`): new water against a dry-season reference, with no hand labels and therefore no IoU.
- **Radar misses flooded vegetation and flooded streets** (double bounce can raise backscatter). Report M8 as **"open-water flood extent estimate"**, never as complete flood damage.
- Quote **only numbers that exist in `eval/results/`**. Compare against GFM as "compared with GFM (an automated product)", not as accuracy against ground truth, unless hand-checked points were used.

### Eval and test plan
- `ml/m8_calibrate.py`: fit event-level thresholds on MPC scenes + Sen1Floods11 labels, write `engine/params_m8.json`.
- `eval/m8_opera.py`: run the frozen parameters on 2 to 3 OPERA 2026 events; score IoU, precision, recall against GFM and against 200 to 500 hand-checked points on any near-date cloud-free Sentinel-2 image; **false alarms per km2 on a dry-season pair** of the same area; runtime per km2. Output `eval/results/m8_opera_2026_<event>.json` with scene IDs, dates, parameter version and GFM product IDs.
- Cross-processor sanity check on one overlapping pre-April-2026 scene: compare backscatter histograms over a stable area; correct a systematic offset above about 1 dB and report it.

### Open checks (owner: Ayush, branch `backend-2`)

| ID | Check | Status |
|---|---|---|
| V-M8-1 | Run the anonymous MPC token script on a laptop: list `sentinel-1-rtc` scenes for an Assam box and read a small window (script in the M8 doc, section 8) | Open |
| V-M8-2 | Create the team Earthdata Login; download one OPERA RTC-S1 scene over the same area for 2026 | Open |
| V-M8-3 | Check whether MPC ingestion resumed after 17 April 2026 (latest `sentinel-1-rtc` item date) | Open |
| V-M8-4 | Register for Copernicus GFM and fetch the flood extent for one 2026 test event | Open |
| V-M8-5 | Cross-processor sanity check on one overlapping scene | Open |

### Credentials and secrets
Earthdata token and GFM token go in `.env` only (git-ignored); add `EARTHDATA_TOKEN` and `GFM_TOKEN` to `.env.example` as empty placeholders. MPC needs none.

### Risks
MPC ingestion stays stopped (use OPERA for 2026; MPC for 2016 to early 2026 training) · MPC policy changes (OPERA has the same archive since 2016; Earth Engine `COPERNICUS/S1_GRD` is a third option) · processor differences (harmonise, relative features) · flooded vegetation and urban areas missed (state the limit) · no same-orbit pre-event scene (use a dry-season median) · hill shadow and layover (HAND and slope masks).

### Updated M8 score
Reliable: **2 to 4** (free no-account training source, free-login test source with 2026 data, public labels verified; **not 5 until V-M8-1 and V-M8-2 pass**). Result quality: **5 to 4** for floods. Effort: **4 to 3**.

---

## 14. Borrowed ideas from the prior-art survey (credit them)

From a survey of ten similar open-source projects, adopted where cheap:
- **Shift check at ingest** by phase cross-correlation (Goudemant et al. 2026): already in `ingest.py`.
- **Expected calibration error (ECE)** to justify the `confidence` attribute (P3): add to `eval/results.json`.
- **Change threshold and minimum-area sliders** (P1): the X1 sensitivity lab.
- **Mask pre-existing water** and GMM threshold (Byun et al. 2015): flood rules, also reused in M8.
- **Optional, only if time remains:** Shield-style class-aware scoring in the spectral engine (Tang et al. 2026). It is unsupervised and untested on Sentinel-2, so it is a stretch, credited as adapted, not invented.
- **A model-status table** ("what actually runs") in the README, as P5 does.
