# GEOAI 04: Change Detection that Ignores False Alarms

**FUSION 2026 · GeoAI track · Problem statement GEOAI 04 · Team Slothdev**

An **Android app** that shows what actually changed on the ground between two dates: new construction, encroachment, vegetation loss, flooding. It filters out the seasonal, lighting and cloud noise that makes naive comparisons useless. Every change comes back as a GIS-ready polygon with its area, a severity tier and a one-line reason.

> **Status:** planning complete, prototype pipeline working. The app and the service are being built from the two plan files below.

---

## The problem

Agencies compare satellite or aerial images from two dates to find illegal construction, disaster damage or forest loss. Most pixel-level change is not real: crops grow, seasons turn, the sun moves, clouds pass. Naive differencing floods analysts with false alarms, and a raw pixel mask isn't something a GIS team can act on.

## What the app does

1. **Pick an input:** draw an area on the map and choose two dates (Sentinel-2 is fetched automatically), upload two GeoTIFFs, or open a demo scene.
2. **Detect:** the service aligns the images, finds change (a pretrained Siamese model for high-resolution images, spectral indices for Sentinel-2) and **filters out false alarms**.
3. **Explore:** a before/after **swipe map** with change polygons coloured by severity (low → critical), a ranked list, and a detail sheet with area, confidence, location, the **reason it was kept** and before/after crops.
4. **Review:** confirm or dismiss each change, even offline in the field.
5. **Share:** GeoPackage / GeoJSON (opens in QGIS or QField), a one-page PDF report and a field pack with navigation links.

**The demo moment:** toggle the false-alarm filter off and the map fills with noise ("412 raw detections"). Toggle it on and only the real changes remain ("37").

## Why it's different (USPs)

1. **False-alarm-first, and we prove it:** a "412 raw → 37 real" toggle, plus false alarms per km² reported alongside F1.
2. **Every change explains itself:** a plain-language reason, a confidence score and before/after crops.
3. **Decisions, not masks:** ranked polygons with area, location, type and severity, ready for QGIS, ArcGIS or QField.
4. **Knows where change matters:** no-build zones escalate a change, approved permits de-escalate it, every change gets a ward tag.
5. **Office to field on a phone:** offline review, navigate to the site, share a field pack.
6. **Free and works anywhere:** free Sentinel-2 imagery, open models and maps, CPU-only, no API keys.
7. **Right model for the right resolution:** automatic routing between a spectral engine and a Siamese deep model.
8. **Evidence-grade:** an audit trail makes every result reproducible.

How this compares with manual comparison, desktop GIS, Earth Engine, research models and commercial platforms, and the research gaps it targets, is in [`docs/PROJECT_PLAN.md` §5–§7](docs/PROJECT_PLAN.md#5-existing-solutions-and-where-they-fall-short).

## Features

| Core (from the problem statement) | Extras that make it stand out |
|---|---|
| GeoTIFF pair input, CRS/grid checks, resampling | Area + dates picker, least-cloudy Sentinel-2 scenes |
| Siamese deep model + spectral index modes | Image-shift check before detecting |
| False-alarm suppression (season, cloud, noise) | "Inside a no-build zone" escalation (lakes, rivers, forests) |
| Morphological clean-up + vectorisation | Authorised vs unauthorised check against a permits layer |
| Area, magnitude, centroid for every polygon | Ward/village tag on every change |
| Severity tiers | Field pack with Google Maps directions |
| Before/after split-view map | Needs-review queue, use-case presets |
| GeoPackage / GeoJSON export | Audit trail per run, in-app accuracy screen, bilingual PDF |
| | Radar flood mode that sees through monsoon clouds (stretch) |

## Proof so far

The prototype ran end to end on real before/after pairs (LEVIR-CD, 0.5 m/pixel, using the public BIT model on a CPU):

| Method | F1 | IoU |
|---|---|---|
| Naive pixel difference | 0.30 | 0.17 |
| **Our pipeline (pretrained Siamese BIT + clean-up)** | **0.93** | **0.86** |

- On a scene where nothing was built (only lighting and season changed), naive differencing raised **188 alerts**. Our pipeline raised **0**.
- Speed: about 7 seconds for 11 tiles on a CPU.
- These figures come from 7 sample tiles. The published full-test-set F1 is about 0.89. The limits are listed in [`docs/PROJECT_PLAN.md` §13.4](docs/PROJECT_PLAN.md#134-what-this-run-does-not-prove-be-upfront-about-these-with-judges).

## Architecture

```
 Android app (Kotlin + Compose + MapLibre)          Processing service (Python)
 ┌──────────────────────────────────┐   HTTP/JSON  ┌──────────────────────────────────────┐
 │ area+dates · upload · demo       │ ───────────▶ │ FastAPI: jobs, results, exports       │
 │ swipe map · filters · ranked list│ ◀─────────── │ engine: ingest → detect → filter →    │
 │ review (offline queue) · share   │  GeoJSON,    │   vectorise → attributes → tiers      │
 └──────────────────────────────────┘  previews,   │ models: BIT (LEVIR-CD) + spectral     │
                                       files       │ data: Sentinel-2 via STAC, OSM layers │
                                                   └──────────────────────────────────────┘
```

## Tech stack

| Part | Stack |
|---|---|
| **Android app** | Kotlin, Jetpack Compose, Material 3, **MapLibre Android SDK**, Retrofit + OkHttp, kotlinx.serialization, Coroutines/Flow, Coil, DataStore |
| **Processing service** | Python 3.11+, FastAPI, Rasterio (GDAL), GeoPandas, Shapely, pyproj, NumPy, OpenCV, scikit-image, PyTorch (CPU) |
| **Models** | BIT Siamese transformer (pretrained on LEVIR-CD); NDVI / NDBI / NDWI + Otsu for Sentinel-2 |
| **Data** | Sentinel-2 L2A via Earth Search STAC (pystac-client), OpenStreetMap context layers, LEVIR-CD / OSCD for evaluation |
| **Outputs** | GeoPackage, GeoJSON, PDF (WeasyPrint), CSV/KML field pack |

Why each piece was chosen over its alternatives (24 decisions, from Kotlin vs React Native vs Flutter to BIT vs ChangeFormer and Sentinel-2 vs Landsat) is in [`docs/PROJECT_PLAN.md` §14](docs/PROJECT_PLAN.md#14-tech-stack-what-we-use-why-and-why-not-the-alternatives).

## Repository layout

```
.
├── README.md              ← you are here
├── FRONTEND_PLAN.md       ← the Android app: stack choice, screens, 10 build phases, structure, done criteria
├── BACKEND_PLAN.md        ← the pipeline + API: modules, API contract, 6 build phases, tests, done criteria
├── docs/
│   └── PROJECT_PLAN.md    ← full plan: problem, solution, results, risks, additions, demo script, judge Q&A
└── prototype/             ← working pipeline from the worked example
    ├── pipeline.py
    ├── figures.py
    └── requirements.txt
```

Planned folders, as the build progresses: `app/` (Android), `engine/` and `api/` (service), `eval/` (metrics), `demos/` (preloaded scenes).

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

### Processing service (once `api/` exists, see BACKEND_PLAN)

```bash
pip install -r requirements.txt
uvicorn api.main:app --host 0.0.0.0 --port 8000
```

### Android app (once `app/` exists, see FRONTEND_PLAN)

Requires Android Studio (latest), JDK 17 and Android SDK 35.

```bash
cd app
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

In the app, go to **Settings** and set the backend URL to `http://<laptop-ip>:8000` (same Wi-Fi or phone hotspot). Demo scenes work with no backend at all.

## Documents

| Read this | For |
|---|---|
| [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) | The whole picture: problem, stakeholders, existing solutions, research gaps, USPs, pipeline, results, every tech-stack decision, evaluation, risks, the 12 proposed additions, demo script, judge Q&A |
| [`FRONTEND_PLAN.md`](FRONTEND_PLAN.md) | Building the Android app |
| [`BACKEND_PLAN.md`](BACKEND_PLAN.md) | Building the processing pipeline and API |

## Open items

- [ ] Paste the official GEOAI 04 statement and judging rubric into [`docs/PROJECT_PLAN.md` §2.1](docs/PROJECT_PLAN.md#21-official-statement), then re-check the requirement tables in both plans.
- [ ] Confirm the hackathon duration and assign owners in [`docs/PROJECT_PLAN.md` §19](docs/PROJECT_PLAN.md#19-team-split).
- [ ] Choose the two demo locations and dates (one encroachment, one flood).

## Credits

- BIT change-detection model and weights: [justchenhao/BIT_CD](https://github.com/justchenhao/BIT_CD) (Chen et al., IEEE TGRS 2021)
- LEVIR-CD dataset (Chen & Shi, Remote Sensing 2020)
- Sentinel-2 imagery: Copernicus programme, via Element84 Earth Search
- Map data © OpenStreetMap contributors; base map styles by OpenFreeMap
