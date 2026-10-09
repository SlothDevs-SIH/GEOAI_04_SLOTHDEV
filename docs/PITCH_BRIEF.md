# GEOAI 04: Speaker Brief (what we built, what we will build, what we use, and why)

**For:** the team member presenting. **As of:** 9 Oct 2026, about 18:00 (rewritten after reviewing `main`). **Submission:** 10:00, 10 Oct 2026.
**How to use it:** each module below has a short "Say" script, the facts behind it, and a label for how solid each fact is.

**Labels used throughout:** **[built]** = exists in the repo today · **[measured]** = a number our code produced, saved in a file · **[published]** = a number from someone else's paper, not reproduced by us · **[planned]** = not built yet · **[unverified]** = still needs a check. **Never present a [planned] or [published] item as ours.**

---

## Module 1: The problem and why it matters (about 45 s)

**Say:** "After a flood or a construction boom, agencies compare two satellite images to see what changed. The trouble is that most pixel change is not real: crops grow, seasons turn, the sun moves, clouds pass. A naive comparison floods analysts with false alarms, and a raw pixel mask isn't something a GIS team can act on. The official statement asks us to take a before and an after tile, separate critical change from false alarms, and return attributed polygons in severity tiers on a before/after web map."

**Facts:** the five official requirements (input two co-registered GeoTIFFs; Siamese CNN, pretrained ViT difference or spectral index; morphological filtering and Rasterio polygonisation; polygons with area in m², magnitude and centroid; a GeoPackage or GeoJSON in severity tiers on a split-view web map) are pasted in `docs/PROJECT_PLAN.md` §2.1.

**Why the public cares:** emergency teams need to know **where, how much and what first**, not just that a flood happened. Rescuers know *that* an event occurred; they do not know the extent over hundreds of square kilometres, which roads are cut or how many hectares of farmland are under water.

**Honest limit to say out loud:** 10 m satellite imagery cannot detect people. We **prioritise where to look**; we do not find victims.

---

## Module 2: What we have built (about 1.5 min)

**Say:** "We already have a working, tested product: an engine, an API and a React website, running on real Sentinel-2 and Sentinel-1 data. It is deployed-ready and works even if the server is off."

| # | What | Status | Where |
|---|---|---|---|
| 1 | **Optical change engine** (Sentinel-2): reads and aligns a before/after pair, finds change by index rules (vegetation, built-up, water, sealed surfaces), filters false alarms, outputs polygons with area, magnitude, centroid, tier, reason and confidence | **[built]**, tested | `engine/` |
| 2 | **Radar flood engine M8** (Sentinel-1): event-level threshold, region growing, permanent-water mask, same polygon outputs | **[built]**, measured on Sen1Floods11 | `engine/radar.py` |
| 3 | **Impact and quality**: hectares changed, cropland and built-up land (ESA WorldCover) with sources, data-quality flags | **[built]** | `engine/impact.py`, `quality.py` |
| 4 | **Exports**: GeoPackage, GeoJSON, CSV field pack with map links, KML, audit file, **PDF report with a QR code** | **[built]** | `engine/export.py`, `report.py` |
| 5 | **API** (FastAPI): demos, upload jobs, results, exports, review, metrics | **[built]** | `api/main.py` |
| 6 | **React website**: swipe map, raw/filtered toggle, severity tiers, ranked list with reasons, impact panel, review, exports, permalink + QR, Accuracy page | **[built]** | `web/` |
| 7 | **Four demo scenes** with real data: Assam flood (radar), Navi Mumbai airport, Pune city edge, a farmland season control | **[built]** | `web/public/demos/` |
| 8 | **Evidence tools**: ablation (which rule removed how many false alarms), results file served to the Accuracy page | **[built]** | `eval/` |
| 9 | **Quality gates**: 37 backend tests, web tests, Playwright smoke test, GitHub Actions CI, Dockerfile | **[built]** | `tests/`, `web/`, `.github/` |
| 10 | **Plans and research**: master plan, options study, prior-art survey of 9 past projects, M8 data decision | **[built]** | `docs/` |
| 11 | **Analyse any area**: draw a box anywhere in India, pick two dates; the server finds the two clearest Sentinel-2 images, runs the engine, and opens the result on the swipe map. Checked against the live archive for six regions | **[built]**, tested | `engine/aoi.py`, `api/`, `web/` |
| 12 | **Offline PWA**: the site and demo scenes cache after one visit; an end-to-end test opens the demo with the network off | **[built]**, tested | `web/` |
| 13 | **Tech stack on the About page** with an honest status for every layer, plus the architecture diagram | **[built]** | `web/src/pages/About.tsx` |
| 14 | **Container verified**: the image builds, runs healthy and completes a live analysis (1,831 raw to 59 real changes for a Delhi box) | **[verified locally]** | `Dockerfile`, `docs/DEPLOY.md` |

**Numbers we can quote (each [measured] and saved in `eval/results.json`):**

| Result | Naive | Ours |
|---|---|---|
| Radar flood, unseen country (Bolivia), flood IoU | 0.337 | **0.697** |
| Radar flood, India test chips, flood IoU | 0.273 | **0.571** |
| Radar flood, official test split, flood IoU | 0.141 | **0.287** (0.433 with the optional learned classifier) |
| Optical false alarms on the no-change season control, per km2 | 86.9 | **0.62** |
| Raw to filtered detections, Navi Mumbai airport | 2,185 | **265** |
| Raw to filtered detections, Assam flood (radar) | 3,490 | **37** |
| Raw to filtered detections, season control | 3,083 | **22** |

**Say the limits out loud:**
- "The radar number is single-date open-water mapping, so flooded crops and streets can be missed. The Assam scene is a 2016 event, evaluated on a public hand-labelled dataset."
- "The Assam score of 0.41 is the demo scene, not a held-out result. The held-out results are the three rows above."
- "We measured optical accuracy on 10 held-out OSCD locations from four continents: our learned model scores F1 0.54 against 0.38 for our rule-based engine and 0.24 for plain subtraction. It wins in all ten, but it is weak in three (Valencia, Norcia, Saclay), and on our farmland no-change scene it raises more false alarms than the rules, so we offer both."
- "Our early building-change prototype scored F1 0.93 on seven hand-picked tiles; the published full-test figure is about 0.89, which we did not reproduce."

**How we did the research:** Ayush cloned and inspected **10 past projects** (stacks, datasets, whether results were real). **Nobody ships the full solution with real results**; several use simulated data or ship no trained weights, and **none reports false alarms per km2 or a reason per polygon**. (Source: `docs/PRIOR_ART_TECH_STACKS.md`.)

---

## Module 3: What we will build next (about 2 min)

**Say:** "The product works. What remains is the part that adds the most evidence and the most trust: a trained PyTorch model with held-out accuracy, a stronger false-alarm method, a deployed site and the tech-stack story."

### 3.1 Remaining components

| # | Component | What it does | Owner | Status |
|---|---|---|---|---|
| R1 | **OSCD-trained Siamese U-Net (PyTorch)** | Learned change model on real Sentinel-2 labels; trained on an RTX 4050; held-out F1 with 95% intervals | Ayush | **Done and measured** (F1 0.54 vs 0.38 spectral on 10 locations); API wiring is Soham's |
| R2 | **ONNX serving** | Export the model to ONNX so the server does not need PyTorch | Ayush | **Export done** (matches PyTorch to 1.2e-5, runs on CPU with onnxruntime); serving it in the API is Soham's |
| R3 | **BIT deep mode + LEVIR-CD evaluation** | Building change on 0.5 m imagery; the official PDF lists LEVIR-CD | Ayush | **Done and reproduced** (F1 0.90 on the full test split); API wiring is Soham's |
| R4 | **Radar before/after mode + OPERA test** | Move radar from one date to change detection; test on 2026 events | Ayush | Next; live checks pending |
| R5 | **Composites + persistence** | Median of several clear scenes; keep a change only if it repeats | Soham | **Built and measured; off by default** (persistence: -27% false detections on a control area, -15% real changed area; median composites did not help) |
| R6 | **Visual QA of demo results** | Check polygons on real ground; tune thresholds on the demo scenes only | Soham | **Done** (findings logged; threshold changes await a team decision) |
| R7 | **Tech-stack visibility** | Stack card and diagram on the About page; stack slide for the deck | Soham | **Done** (site); slide text is in module 4.0 |
| R8 | **Offline PWA + radar upload** | Demo works with no network; radar option in the Analyse page | Soham | **Done** |
| R9 | **Live deployment** | Vercel for the site; a Hugging Face Docker Space (Render as fallback) for the API | Soham | **Prepared** (container verified, guide written); needs the team accounts |
| R10 | **Browser-first sensitivity slider (optional)** | Drag a threshold and watch false alarms vanish, computed in the page | Soham | Optional |

### 3.2 Frontend parts

| Part | Choice | Status |
|---|---|---|
| Framework | React 19 + Vite + TypeScript | In use |
| Styling | Tailwind CSS | In use |
| Map | MapLibre GL JS (before/after compare) | In use |
| State and routing | Zustand, React Router | In use |
| Tests | Vitest, Testing Library, Playwright | In use |
| Hosting | Vercel | Planned |
| Offline | vite-plugin-pwa | Planned |
| Permalink + QR, PDF export | URL state, fpdf2 and qrcode | In use |
| Live sensitivity slider (optional) | Web Worker + in-browser compute | Optional |

| R11 | **Analyse any area in India** | Draw a box, pick two dates, get a result; more demo scenes from other regions and climates | Soham | **Built**; regional checks in progress (not yet validated everywhere) |

**Say:** "The four scenes you see are examples. The engine works on any Sentinel-2 pair, so we are adding a box-and-dates picker to analyse any area in India. We will say exactly how many regions we validated on, not that it works everywhere."

### 3.3 Order of work
1. **Core:** the PyTorch OSCD model and its held-out numbers, composites, QA, deployment, stack visibility, offline PWA.
2. **Optional:** the browser sensitivity slider; BIT demo tile; radar before/after (done on a real July 2024 event; the 2026 OPERA run is pending).
3. **Cut first if behind:** the slider, OpenAerialMap pairs, then the radar before/after.

---

## Module 4: What we will be using, and what we considered (about 2.5 min)

**Say:** "For every layer we listed the realistic options, scored them on how unique, reliable and good in results they are, and chose. Where a harder option gives something the easy ones cannot, we picked it as an optional layer and kept a safe fallback."

### 4.0 The stack on one slide (judges asked for this)

| Layer | What we use | Status |
|---|---|---|
| Web | React 19, Vite, TypeScript, Tailwind, MapLibre GL, Zustand | In use |
| Engine | Python, Rasterio / GDAL, GeoPandas, NumPy, SciPy, scikit-image, scikit-learn | In use |
| API | FastAPI, Uvicorn | In use |
| **ML** | **PyTorch** (train the OSCD Siamese U-Net on an RTX 4050), **ONNX Runtime** (serve it) | **Trained and measured; serving in the API is next** |
| Data | Sentinel-2, Sentinel-1, ESA WorldCover, OpenStreetMap, Sen1Floods11, OSCD, LEVIR-CD | In use |
| DevOps | GitHub Actions, Docker, Vercel, Hugging Face Space or Render | CI in use; deploy planned |

**Say:** "Another team may stress PyTorch. We use PyTorch too, for the learned model. What we add is what a judge can verify: a held-out evaluation with confidence intervals, an ablation of the false-alarm rules, ONNX serving so the model runs anywhere, and a radar mode that works under monsoon cloud."

### 4.1 Backend and architecture

| Option | What it is | Chosen? | Why |
|---|---|---|---|
| **B4 Static-first files** | Precompute results, ship as files; the site just reads them | **Yes, core** | The deployed demo cannot fail, because nothing has to be running |
| **B1 FastAPI + Rasterio + PyTorch** | Python server with the real GIS and ML libraries | **Yes, core** | Handles big scenes and all formats; the engine that produces our numbers |
| **B3 Browser-first compute** | The browser reads the image area and runs the analysis itself (ONNX Runtime Web, WebGPU with WebAssembly fallback) | **Yes, optional layer** | Hard, but gives what a server cannot: a live sensitivity slider, offline use and, for private uploads, imagery that never leaves the machine. It does **not** raise accuracy. Limited to small areas |
| B2 Hosted container (Hugging Face, Render, Cloud Run) | Where the Python server lives | Needed for B1 | **Hugging Face Docker Spaces may now need a paid plan** (docs and July 2026 forum posts conflict), so the host is confirmed first |
| B5 Google Earth Engine | Google's archive and compute | No | Needs an approved account; cannot be reproduced in CI |
| B6 Serverless GPU | Rent a GPU per request | No | We do not need a GPU at serve time |
| B7 Laptop + tunnel | Run the API on a laptop | Backup only | Fragile at a venue |

### 4.2 Storage

| Option | Chosen? | Why |
|---|---|---|
| **Plain files** (GeoJSON, GPKG, COG) | **Yes** | Simple, reliable, opens in QGIS |
| GeoParquet + DuckDB-WASM | Stretch | Judges could query results with SQL in the browser; medium effort |
| SQLite | Only if needed | For review state |
| PMTiles / vector tiles | Only for huge polygon counts | Not needed at our scale |
| **PostGIS** | **No, future work** | A hard option that gives real multi-user, multi-scene spatial queries. Mention it as the answer to "how does this scale to a district?" |

### 4.3 Models and methods

| Option | What it is | Chosen? | Why |
|---|---|---|---|
| **M7 Composites + persistence** | Median of several clear scenes; keep a change only if it repeats | **Yes, core** | Attacks false alarms directly with no deep model; cheap; reliable |
| **M9 Uncertainty + ablation** | Calibrated confidence and a table of what each rule removed | **Yes, core** | Turns "false-alarm-first" from a claim into a measured table |
| **M3 Siamese U-Net on OSCD** | Our own small model on real Sentinel-2 change labels | **Yes, core** | Matches the statement's "lightweight U-Net"; right resolution. OSCD is small, so expect modest numbers |
| **M1 Spectral indices + Otsu** | NDVI/NDBI/NDWI differences | **Yes, core** | Fast, interpretable, the safe fallback |
| **M8 Sentinel-1 radar flood mode** | Radar sees through cloud; new water is a drop in backscatter | **Gated, engine built** | Highest social impact (monsoon floods), and Ayush's survey found no past project ships it. Data sourcing is decided |
| M2 Random forest baseline | Classic ML | Optional | Extra baseline only if time |
| M4 BIT / pretrained VHR | Strong on 0.5 m aerial images | Only for VHR input | Wrong resolution for Sentinel-2 |
| M6 AlphaEarth embeddings | Compare a place's yearly vector between years | Optional case study | Annual only, so it cannot map a flood; no benchmark overlap with OSCD |
| M5 Foundation models (Prithvi) | Huge pretrained model | No | Heavy for 24 h; I found no published OSCD result |

### 4.4 Frontend options

| Option | Chosen? | Why |
|---|---|---|
| **React + MapLibre (F3)** | **Yes** | Reliable, live filter expressions, compare plugin; not unique, so the difference comes from what we put on it |
| Live sensitivity lab (X1) | Optional | Unique and visual; needs the browser engine |
| Evidence panel (X5) | **Yes** | Cheap; makes the honesty visible |
| Offline PWA (X3) | **Yes** | Demo works with no network |
| Permalink, QR, PDF | **Yes (added)** | Phone hand-off with no sign-in; a report an officer can forward |
| Streamlit / Gradio, Leaflet | No | Looks like a notebook demo / weak at filtering many polygons |
| deck.gl, OpenLayers, Cesium, Next.js | No | Unneeded at our scale, steeper, or flashy with no value |

### 4.5 The M8 data decision (Ayush)

| Role | Source | Why |
|---|---|---|
| Train / calibrate | **Microsoft Planetary Computer** `sentinel-1-rtc` (about 2016 to April 2026) | Free, **no account**, already terrain corrected |
| Test | **NASA OPERA RTC-S1** via ASF (free Earthdata login; 2026 scenes) | Has 2026 scenes; a **different processor**, so it tests generalisation |
| Labels | **Sen1Floods11** (public bucket; includes 68 Assam chips) | Hand-labelled ground truth |
| Reference | **Copernicus GFM** | Independent flood map for 2026 events |

Planetary Computer reportedly stopped ingesting new scenes on 17 April 2026 (GitHub issues #473, #472; **[unverified]** by us), so it is used only for training and OPERA for 2026 testing. **Five live checks are still open (V-M8-1 to V-M8-5).**

---

## Module 5: What makes us different (about 1 min)

**Say:** "Most teams will submit React, a map and a pretrained model. We differ in three places that a judge can check: the method, the evidence and the architecture."

1. **Trust layer.** Composites and persistence, calibrated confidence, and an ablation table showing how many false alarms each rule removes, plus an unseen no-change pair that should give about zero polygons.
2. **Honest evidence.** Held-out numbers with 95 % confidence intervals, limits written on the page. A user's own run has no labels, so we show calibrated confidence and data-quality flags, not a made-up F1.
3. **Architecture.** Static-first so the demo never fails; browser-first compute as an optional layer; permalink and QR so a result moves to a phone with no sign-in.
4. **Radar flood mode.** Works under monsoon cloud, the season when optical fails.

---

## Module 6: Timeline and what remains (about 45 s)

| When | Milestone |
|---|---|
| Now (about 18:00) | Engine, radar mode, API and React site on `main`, tested; two backend packages defined (models and product) |
| 19:00 | OSCD data, metrics and baselines ready; model training starts on the RTX 4050; real-scene QA under way |
| 21:00 | ML decision gate: choose the model on validation, then use the test cities **once** |
| 00:00 | Both packages merge-ready |
| 02:00 | Integrated: learned model and ONNX in the API; Accuracy page shows the new rows; deployed |
| 03:00 | Feature freeze |
| 07:00 | Repo freeze; 08:15 submit; 09:00 to 10:00 buffer |

**Open risks to name honestly:** the learned model beats spectral on OSCD F1 but raises about 12x more false alarms on our farmland no-change scene (we offer both and say so); it is weak in 3 of 10 locations; the radar flood result is single-date and from 2016, and the before/after result is from a 2024 event without hand labels; the live 2026 OPERA download is not yet verified (search works); the API host choice (Hugging Face Docker Spaces may need a paid plan; Render is the fallback).

---

## Likely questions, with short answers

| Question | Answer |
|---|---|
| Why not just let rescuers inspect? | They know *that* it happened, not the extent, access or quantities over hundreds of km². We rank where to go first and how many hectares and buildings are affected. |
| Your F1 of 0.93 looks high | Seven hand-picked tiles, pretrained model. The published full-test value is about 0.89. We also report held-out results on a harder dataset with intervals. |
| Why retrain on OSCD? | The pretrained BIT model is for 0.5 m RGB, not 10 m Sentinel-2. OSCD has real Sentinel-2 change labels. Published frozen-backbone results are roughly F1 41 to 53, so we expect modest numbers and report them honestly. |
| How do you handle seasons and clouds? | Composites of several clear scenes, persistence across more than one later scene, a seasonal-vegetation rule, a cloud and shadow mask, and radar for floods. |
| Does it find victims? | No. It prioritises search zones. 10 m imagery cannot see people. |
| What if the server is down? | The deployed demo uses precomputed files and works offline as a PWA. |
| What about privacy? | Analysis can run in the browser; imagery stays local. Sharing is opt-in and uploads only derived polygons. |
| Is this new? | The ingredients are public. Our contribution is measured false-alarm suppression, a reason per polygon, impact numbers, honest evidence and a working radar flood mode. A 10-repo survey found none that reports false alarms per km². |
| Why not a mobile app? | The statement asks for a web map; a link works on any device with no install. |
| Does it work for all of India? | The engine is region-agnostic because Sentinel-2 covers the whole country, and the area picker lets anyone analyse any box. We have validated on a few regions so far (three in Maharashtra, one in Assam, plus more being added) and will report how many; the OSCD test locations give worldwide evidence. |
| How does it scale to a district? | Tiled and windowed processing now; PostGIS and a job queue as future work. |

---

## Sources behind the claims

- Official statement and datasets: `docs/PROJECT_PLAN.md` §2.1
- Prior-art survey: `docs/PRIOR_ART_TECH_STACKS.md`
- M8 data decision: `docs/M8_RADAR_FLOOD_DATA.md`; measured results: `eval/README.md`, `eval/results/*.json`
- Options and scores: `docs/TECH_OPTIONS.md`
- Published context used in the options study: OSCD frozen-backbone baselines (arXiv 2303.06670), Prithvi-EO-2.0 (arXiv 2412.02732), Sen1Floods11 (CVPRW 2020), ONNX Runtime Web docs, Hugging Face Spaces docs and forum, AlphaEarth Foundations (DeepMind and Earth Engine docs)
