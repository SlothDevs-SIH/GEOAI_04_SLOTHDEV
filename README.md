# GEOAI 04: Change Detection that Ignores False Alarms

**FUSION 2026 · GeoAI track · Problem statement GEOAI 04 · Team Slothdevs**

A **web app** that shows what actually changed on the ground between two dates: flooding, new construction, encroachment, vegetation loss. It filters out the seasonal, lighting, cloud and radar-speckle noise that makes naive comparisons useless. Every change comes back as a GIS-ready polygon with its area, a severity tier and a one-line reason, plus an **impact summary** (hectares changed, cropland and built-up land affected).

> **Status (9 Oct 2026):** engine, radar flood mode (M8), API and web app work end to end and are tested. **Submission deadline: 10:00, 10 October 2026.**
>
> Live site: _to be added_ · API: _to be added_ · Demo video: _to be added_

## The problem

After a flood or a construction boom, agencies compare satellite images from two dates. Most pixel-level change is not real: crops grow, seasons turn, the sun moves, clouds pass, radar speckles. Naive differencing floods analysts with false alarms, and a raw pixel mask isn't something a GIS team can act on.

## What the site does

1. **Pick a scene:** four demo scenes (Assam flood on radar, Navi Mumbai airport build-out, Pune city edge, a farmland season control), or upload your own before/after GeoTIFFs.
2. **Swipe map:** before/after compare with change polygons coloured by severity tier.
3. **The demo moment:** toggle the false-alarm filter. Navi Mumbai: **2,185 raw detections → 265 real changes**; Assam flood (radar): **3,490 → 37**; the season control, where nothing was built: **3,083 → 22**.
4. **Explore:** ranked list, detail card with area, confidence, location, the **reason it was kept** and before/after crops; confirm or dismiss each change.
5. **Impact:** hectares changed, cropland and built-up land affected (ESA WorldCover), each with its source and caveats. Unknown is shown as "unknown", never as zero.
6. **Export:** GeoPackage, GeoJSON (all or confirmed only), one-page PDF, CSV field pack with map links, KML, audit trail; permalink + QR code for phones.
7. **Accuracy page:** every number comes from a results file in this repo.

**What it does not do:** 10 m imagery cannot see people or single small buildings. The site **prioritises where to look**.

## Measured results

| Check | Naive | Ours |
|---|---|---|
| Radar flood (M8), Sen1Floods11 **unseen country** (Bolivia), flood IoU | 0.337 | **0.697** |
| Radar flood (M8), India test chips, flood IoU | 0.273 | **0.571** |
| Radar flood (M8), Sen1Floods11 official test split, flood IoU | 0.141 | **0.287** (0.433 with the optional learned classifier) |
| Optical false alarms on the season-control scene (no real construction), per km² | 86.9 | **0.62** |

The thresholds were fitted without labels, and the held-out splits were never used for fitting. The ablation (`eval/ablation.py`) shows the change-type rules and the speckle filter do almost all the false-alarm removal. **Not measured yet:** optical accuracy against labels (the OSCD download host is blocked in our build environment), and before/after radar change on 2026 NASA OPERA data. Details: [`eval/README.md`](eval/README.md), [`docs/M8_RADAR_FLOOD_DATA.md`](docs/M8_RADAR_FLOOD_DATA.md).

## Model status

| Mode | Input | Method | Status |
|---|---|---|---|
| Spectral | Sentinel-2 (≥ 4 bands incl. NIR, ≥ 5 m) | NDVI / NDBI / NDWI / SWIR-blue change vector, Otsu, type rules, false-alarm filters | **Working**, used by 3 demo scenes and live uploads |
| Radar flood (M8) | Sentinel-1 VV/VH dB | Event-level threshold + region growing, JRC permanent-water mask, morphology | **Working**, evaluated on Sen1Floods11 |
| Learned (M8) | Sentinel-1 | Gradient-boosted pixel classifier (`engine/weights/m8_gbm.joblib`) | Optional; better on the test split, worse on Bolivia |
| OSCD-trained / BIT deep model | Sentinel-2 / high-res RGB | Siamese networks | Not in this build (data host blocked) |

## Architecture

```
 Web app (React + Vite + MapLibre)           static demo files            FastAPI (api/main.py)
 scenes · swipe map · filter toggle   ◀── web/public/demos/<id> ──    /demos  /analyze  /jobs  /metrics
 ranked list · impact · review                                        engine/: ingest → detect → filter →
 exports · accuracy page              ──── HTTP/JSON (optional) ──▶     vectorise → attributes → impact → export
```

The site is **static-first**: the demo works with the API switched off. The API adds live uploads.

## Tech stack

| Part | Stack |
|---|---|
| Web app | React 19, Vite 7, TypeScript, Tailwind CSS 4, MapLibre GL, Zustand, React Router; Vitest + Testing Library, Playwright |
| Engine and API | Python 3.11, FastAPI, Rasterio (GDAL), GeoPandas, Shapely, pyproj, NumPy, SciPy, scikit-image, scikit-learn, fpdf2; pytest, ruff |
| Data | Sentinel-2 L2A (public COGs), Sentinel-1 via Sen1Floods11, ESA WorldCover 2021, JRC Global Surface Water |
| Deployment | Vercel (web, `web/vercel.json`), one Docker container for the API + site (`Dockerfile`, port 7860), GitHub Actions CI |

## Repository layout

```
api/        FastAPI service (routes in BACKEND_PLAN.md §6)
engine/     change engine: s2, ingest, change_spectral, filters, vectorise, attributes, impact, quality, export, report, radar, run
web/        React app; web/public/demos = precomputed demo scenes; web/e2e = Playwright
eval/       results.json, ablation.py, build_results.py, results/ (M8 experiments)
ml/         M8 experiments on the official Sen1Floods11 splits
scripts/    fetch demo scenes, build demo assets, fetch M8 chips
tests/      pytest (engine, radar, API)
prototype/  round-1 pipeline and static prototype
docs/       plans, research, UI speaking guide
```

## Run it

```bash
# API + engine (Python 3.11+)
pip install -r requirements.txt
uvicorn api.main:app --port 8000

# Web app
cd web && npm install && npm run dev          # set VITE_API_URL=http://localhost:8000 for live uploads

# One container (API + built site), as on a Hugging Face Docker Space
docker build -t geoai04 . && docker run -p 7860:7860 geoai04

# Command line
python -m engine.run demos/navi-mumbai-airport/before.tif demos/navi-mumbai-airport/after.tif \
  --out out/airport --preset encroachment --before-date 2019-01-13 --after-date 2024-12-17
python -m engine.run chip.tif --mode radar --out out/flood
```

Rebuild the data: `python scripts/fetch_demo_scenes.py` → `python scripts/export_demo_assets.py` → `python eval/ablation.py` → `python eval/build_results.py`.

## Tests

```bash
ruff check . && pytest -q                                            # 37 tests
cd web && npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

CI runs all of these on every push (`.github/workflows/ci.yml`).

## Documents

| Read this | For |
|---|---|
| [`BACKEND_PLAN.md`](BACKEND_PLAN.md) · [`FRONTEND_PLAN.md`](FRONTEND_PLAN.md) | What was built and why, API contract, tests, deployment |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) · [`docs/packages/`](docs/packages/CONTRACTS.md) | **Decisions made and the two work packages (models vs product) with their interfaces** |
| [`docs/PITCH_BRIEF.md`](docs/PITCH_BRIEF.md) | Speaker brief: built, next, stack and why |
| [`docs/UI_EXPLANATION.md`](docs/UI_EXPLANATION.md) | Walkthrough of the UI for presenting |
| [`docs/M8_RADAR_FLOOD_DATA.md`](docs/M8_RADAR_FLOOD_DATA.md) | Radar flood mode: data, access, evidence |
| [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) · [`docs/TASK_SPLIT.md`](docs/TASK_SPLIT.md) · [`docs/TECH_OPTIONS.md`](docs/TECH_OPTIONS.md) | Full plan, schedule, options compared |
| [`docs/PRIOR_ART_TECH_STACKS.md`](docs/PRIOR_ART_TECH_STACKS.md) | What past projects built and the gaps we close |

## Credits

- Sentinel-2 and Sentinel-1 imagery: Copernicus programme (ESA), Sentinel-2 COGs via Element84 Earth Search
- Sen1Floods11 (Bonafilia et al., CVPR Workshops 2020), CC-BY 4.0; JRC Global Surface Water (Pekel et al., 2016)
- ESA WorldCover 2021 v200, CC-BY 4.0
- Map data © OpenStreetMap contributors
- Round-1 prototype: BIT model ([justchenhao/BIT_CD](https://github.com/justchenhao/BIT_CD)), LEVIR-CD dataset
