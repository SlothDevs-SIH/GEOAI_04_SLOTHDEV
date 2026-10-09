# GEOAI 04: Change Detection that Ignores False Alarms

**FUSION 2026 · GeoAI track · Problem statement GEOAI 04 · Team Slothdev**

A **web app** that shows what actually changed on the ground between two dates: flooding, new construction, encroachment, vegetation loss. It filters out the seasonal, lighting and cloud noise that makes naive comparisons useless. Every change comes back as a GIS-ready polygon with its area, a severity tier and a one-line reason, and each run ends with an **impact summary** (hectares changed, cropland affected, buildings and roads touched).

> **Status (9 Oct 2026, 12:30):** planning complete and re-planned for a **web app**; prototype pipeline works on LEVIR-CD; the engine, ML retraining, API and web app are being built to the schedule in [`docs/TASK_SPLIT.md`](docs/TASK_SPLIT.md). **Submission deadline: 10:00, 10 October 2026.**
>
> Live site: _to be added_ · API: _to be added_ · Demo video: _to be added_

---

## The problem

After a flood or a construction boom, agencies compare satellite images from two dates to find damage or illegal building. Most pixel-level change is not real: crops grow, seasons turn, the sun moves, clouds pass. Naive differencing floods analysts with false alarms, and a raw pixel mask isn't something a GIS team can act on.

## What the site does

1. **Pick a scene:** open a demo scene (flood, encroachment, season control), or upload two GeoTIFFs.
2. **Detect:** the service aligns the images, finds change (a spectral engine and a retrained Siamese model for Sentinel-2; a pretrained Siamese model for high-resolution images) and **filters out false alarms**.
3. **Explore:** a before/after **swipe map** with change polygons coloured by severity, a ranked list, and a detail card with area, magnitude, confidence, location, the **reason it was kept** and before/after crops.
4. **See the impact:** hectares changed, **cropland affected** (ESA WorldCover), buildings and road segments touched (OpenStreetMap), each with its source.
5. **Review and export:** confirm or dismiss changes; download GeoPackage / GeoJSON (opens in QGIS), a one-page PDF and a field pack.

**The demo moment:** toggle the false-alarm filter off and the map fills with noise (for example "412 raw detections"). Toggle it on and only the real changes remain (for example "37"). _The numbers shown in the app come from real runs; the ones here are illustrative._

**What it does not do:** 10 m satellite imagery cannot detect people. The site **prioritises where to look**; it does not find victims.

## Why it's different

1. **False-alarm-first, and measured:** a raw → filtered toggle, plus false alarms per km² reported alongside F1.
2. **Every change explains itself:** a plain-language reason, a confidence score and before/after crops.
3. **Decisions, not masks:** ranked polygons with area, location, type, severity and impact numbers, ready for QGIS or ArcGIS.
4. **Honest numbers:** held-out results on real labelled data (OSCD), naive vs spectral vs learned, with seed and commit recorded.
5. **Static-first and free:** demo scenes are precomputed, so the deployed site works even if the API sleeps; free Sentinel-2 imagery, open models and maps, no API keys, CPU-only.
6. **Right model for the right resolution:** automatic routing between the spectral / learned engine (Sentinel-2) and the Siamese transformer (high resolution).

## Proof so far

The prototype ran end to end on real before/after pairs (LEVIR-CD, 0.5 m/pixel, public BIT model, CPU):

| Method | F1 | IoU |
|---|---|---|
| Naive pixel difference | 0.30 | 0.17 |
| **Pretrained Siamese BIT + clean-up** | **0.93** | **0.86** |

- On a scene where nothing was built (only lighting and season changed), naive differencing raised **188 alerts**; our pipeline raised **0**.
- Speed: about 7 seconds for 11 tiles on a CPU.
- **Limits:** these figures come from 7 hand-picked sample tiles, and the no-change scene was in the model's training split. The published full-test-set F1 is about 0.89 (published, not reproduced by us). Details in [`docs/PROJECT_PLAN.md` §13.4](docs/PROJECT_PLAN.md#134-what-this-run-does-not-prove-be-upfront-about-these-with-judges).
- **Next:** held-out OSCD results for naive, spectral and a retrained model will be added here from `eval/results.json`.

## Architecture

```
 Web app (React + Vite + MapLibre GL)  ── Vercel                Processing service (Python) ── Hugging Face Space
 ┌──────────────────────────────────┐     static demo files     ┌──────────────────────────────────────┐
 │ scenes · swipe map · filters     │ ◀── public/demos/<id> ──  │ FastAPI: demos, jobs, results, exports│
 │ ranked list · impact · review    │                           │ engine: ingest → detect → filter →    │
 │ export · accuracy page           │ ──── HTTP/JSON (live) ──▶ │   vectorise → attributes → impact     │
 └──────────────────────────────────┘                           │ models: spectral, OSCD-trained U-Net, │
                                                                │   BIT (LEVIR-CD)                      │
                                                                │ data: Sentinel-2, OSM, WorldCover     │
                                                                └──────────────────────────────────────┘
```

## Tech stack

| Part | Stack |
|---|---|
| **Web app** | React 19, Vite, TypeScript, Tailwind CSS, **MapLibre GL JS** (+ compare plugin), TanStack Query, Zustand; Vitest, Testing Library, Playwright |
| **Processing service** | Python 3.11, FastAPI, Rasterio (GDAL), GeoPandas, Shapely, pyproj, NumPy, OpenCV, scikit-image, PyTorch (CPU), pytest, ruff |
| **Models** | NDVI / NDBI / NDWI + Otsu (spectral); lightweight Siamese U-Net trained on OSCD; BIT Siamese transformer (LEVIR-CD weights) |
| **Data** | Sentinel-2 L2A (Copernicus, public COGs), OSCD and LEVIR-CD for training and evaluation, OpenStreetMap, ESA WorldCover |
| **Outputs** | GeoPackage, GeoJSON, PDF, CSV/KML |
| **Deployment** | Vercel (web), Hugging Face Spaces (API, Docker), GitHub Actions (CI) |

Why each piece was chosen over its alternatives is in [`docs/PROJECT_PLAN.md` §14](docs/PROJECT_PLAN.md#14-tech-stack-what-we-use-why-and-why-not-the-alternatives).

## Repository layout

```
.
├── README.md
├── FRONTEND_PLAN.md       ← the web app: stack, pages, build phases, tests, done criteria
├── BACKEND_PLAN.md        ← engine, ML retraining, API contract, tests, deployment
├── docs/
│   ├── PROJECT_PLAN.md    ← full plan: problem, solution, risks, demo script, judge Q&A
│   └── TASK_SPLIT.md      ← hour-by-hour 24-hour schedule, roles, checkpoints, submission checklist
├── prototype/             ← working pipeline from the worked example
├── engine/                ← config and Sentinel-2 search exist; the rest is being built
├── scripts/               ← demo scene fetching (and, planned, demo asset export)
└── (planned) api/  web/  ml/  eval/  tests/  demos/
```

## Getting started

### Run the prototype pipeline (works today)

Requires Python 3.11+.

```bash
git clone --depth 1 https://github.com/justchenhao/BIT_CD.git     # sample pairs + pretrained checkpoint
pip install -r prototype/requirements.txt
python prototype/pipeline.py ./BIT_CD ./out    # → out/changes_all.gpkg, changes_all.geojson, summary.json
python prototype/figures.py ./out              # → out/walkthrough.png, out/more_cases.png
```

Open `out/changes_all.gpkg` in QGIS to see the attributed polygons.

### Fetch the demo Sentinel-2 scenes

```bash
python scripts/fetch_demo_scenes.py            # all scenes → demos/<name>/before.tif, after.tif, meta.json
```

### API and web app (once `api/` and `web/` exist)

```bash
# API
pip install -r requirements.txt
uvicorn api.main:app --port 8000

# Web app
cd web && npm install && npm run dev
```

### Tests

```bash
ruff check . && pytest -m "not slow"       # backend
cd web && npm run lint && npm test && npm run build   # frontend
```

## Documents

| Read this | For |
|---|---|
| [`docs/TASK_SPLIT.md`](docs/TASK_SPLIT.md) | **Start here for who does what, and when** |
| [`BACKEND_PLAN.md`](BACKEND_PLAN.md) | Engine modules, the ML retraining plan, API, tests, deployment |
| [`FRONTEND_PLAN.md`](FRONTEND_PLAN.md) | The web app |
| [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) | The whole picture, including the official statement (§2.1) |

## Open items

- [x] Official GEOAI 04 statement pasted into [`docs/PROJECT_PLAN.md` §2.1](docs/PROJECT_PLAN.md#21-official-statement).
- [ ] Judging rubric and submission rules (format, repo visibility, required files): fill in [`docs/TASK_SPLIT.md` §5](docs/TASK_SPLIT.md).
- [ ] Choose the flood scene (post-event cloud < 5 %) and the encroachment scene.
- [ ] Assign names to the four roles in `docs/TASK_SPLIT.md` §1.

## Credits

- BIT change-detection model and weights: [justchenhao/BIT_CD](https://github.com/justchenhao/BIT_CD) (Chen et al., IEEE TGRS 2021)
- LEVIR-CD dataset (Chen & Shi, Remote Sensing 2020); Onera Satellite Change Detection dataset (Daudt et al., 2018)
- Sentinel-2 imagery: Copernicus programme, via Element84 Earth Search; ESA WorldCover
- Map data © OpenStreetMap contributors; base map styles by OpenFreeMap
