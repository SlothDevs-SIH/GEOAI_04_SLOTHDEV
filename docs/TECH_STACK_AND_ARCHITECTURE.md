# GEOAI 04: Tech Stack and System Architecture (the explainer)

**Team Slothdev · FUSION 2026 · Problem statement GEOAI 04**
**Purpose:** one file that lets you explain the whole project to anyone, even someone who knows nothing about satellites or GIS: what we are building, which modules we use, what each module does inside the backend, why we picked it over the alternatives, and exactly how data flows through the system.

**Honesty labels used below:** **[built]** exists and is tested in the repo · **[measured]** a number our own code produced (saved in `eval/`) · **[published]** someone else's number, not reproduced by us · **[optional]** extra layer, product works without it · **[open]** not finished or not verified yet.

---

## 0. The 60-second version (say this first)

> After a flood or a construction boom, government agencies compare two satellite photos, "before" and "after", to see what changed. The problem: **most of what changes between two photos is not real**. Crops grow, seasons turn, the sun is at a different angle, clouds pass. A naive comparison produces thousands of false alarms, and a raw pixel mask is not something a GIS team can act on.
>
> We built a web app that takes two dates, finds what **really** changed, throws away the false alarms, and hands back **polygons**: each one with its area in square metres, a severity tier (critical / high / medium / low), a one-line reason it was kept, and a confidence. Officers see it on a before/after swipe map and can export it to QGIS, as a PDF report, or send it to a phone with a QR code.
>
> The extra thing that makes us different: **we measure our false-alarm suppression** and show the numbers (and our limits) on the page.

**What it does NOT do (say this out loud, it earns trust):** 10-metre satellite imagery cannot see people or single small buildings. We **prioritise where to look**; we do not find victims.

---

## 1. Plain-English glossary (for the "explain it to anyone" moment)

| Word | What it means in one line |
|---|---|
| **Satellite image (Sentinel-2)** | A free photo of the Earth from the European Copernicus programme. Each pixel is 10 m x 10 m, and it has 13 colour bands including ones humans cannot see (infrared). |
| **Radar (Sentinel-1)** | A different satellite that "pings" the ground instead of taking a photo, so it **sees through clouds**. Calm water looks dark to radar. |
| **Change detection** | Comparing a "before" and "after" image of the same place to find what changed. |
| **False alarm** | A pixel that changed in the image but not on the ground (a crop that grew, a shadow, a cloud). |
| **Polygon** | The shape of a changed area drawn on a map, with numbers attached (area, severity). |
| **GeoTIFF / COG** | An image file that knows where on Earth it is. COG = Cloud Optimized GeoTIFF: you can read a small window of it over the internet without downloading everything. |
| **GeoJSON / GeoPackage** | Standard map-data files that QGIS and every GIS tool opens. |
| **NDVI / NDBI / NDWI** | Simple formulas on image bands: vegetation (NDVI), built-up land (NDBI), water (NDWI). When these jump between dates, something real may have changed. |
| **Otsu threshold** | A classic automatic way to pick the cut-off between "changed" and "not changed" without any training. |
| **U-Net / Siamese network** | A small neural network that looks at the "before" and "after" images side by side and outputs a change map. |
| **ONNX** | A universal file format for trained models, so we can **train in PyTorch but run anywhere** (light, no PyTorch needed on the server). |
| **PWA** | A website that behaves like an app: it caches itself and works offline. |
| **Held-out / unseen** | Test data the model never saw during training. This is the honest way to report accuracy. |

---

## 2. The tech stack at a glance (read this out)

| Layer | Module codes | What we use |
|---|---|---|
| **Frontend** | **F3, X5, X3** (+ **X1** optional) | React 19 + Vite + TypeScript + Tailwind + **MapLibre GL JS** (swipe map), Zustand state, React Router, vite-plugin-pwa |
| **Backend** | **B4, B1** (+ **B3** optional) | **B4** static-first precomputed files; **B1** FastAPI + Rasterio + GeoPandas (+ PyTorch for training, ONNX Runtime for serving) |
| **Models / methods** | **M7, M9, M3, M8** (+ **M1** baseline, BIT secondary) | **M7** composites + persistence · **M9** uncertainty + ablation · **M3** OSCD-trained Siamese U-Net · **M8** Sentinel-1 radar flood mode · **M1** spectral indices + Otsu |
| **Data** | n/a | Sentinel-2, Sentinel-1, ESA WorldCover, OpenStreetMap; training/eval sets OSCD, LEVIR-CD, Sen1Floods11 |
| **DevOps** | n/a | GitHub Actions CI, Docker, Vercel (site), Hugging Face Docker Space or Render (API) |

Why the codes exist: for each layer we wrote down every realistic option (F1..F7, B1..B7, M1..M9, X1..X6), scored them, and picked. The full study is in `docs/TECH_OPTIONS.md`.

---

## 3. System architecture

### 3.1 The diagram

![GEOAI 04 system architecture](img/geoai04_architecture_final.png)

> **Note on the picture:** the diagram shows the *layout and data flow*; it does not show how finished each box is. **Section 9 of this file is the authoritative status.** In particular: step 2 lists Spectral, Composites, Siamese U-Net, BIT and Radar, and all five exist in the engine, but **composites are off by default**, **BIT needs PyTorch and a separate weights download**, and the **learned U-Net is not the default** (spectral is). The "browser-first engine" and "ONNX Runtime Web" ideas (B3) are only partly built, see Section 6.

### 3.2 How to read the diagram (walk the room through it)

The diagram has **four zones** (the colour legend at the bottom right: green = CORE, yellow = OPTIONAL, purple = GATED, only after the core works):

1. **Top row, the "product" path:** Users → Web app ⇄ Backend API → Storage.
2. **Middle row, the "brain":** Data sources → **GEOAI Engine** (5 numbered steps) → What the officer gets.
3. **Bottom row, the "factory":** Train · Evaluate · Ship. This runs **offline, at build time**, not when a user clicks.
4. **Caption:** *Static-first: the deployed demo works even if the API is offline. No database in v1.*

### 3.3 The big idea: static-first

Most teams run a server and hope it stays alive at the venue. We **precompute** the demo scenes as files (images, GeoJSON, JSON) and ship them with the website. So:

- The website **reads files**, it does not need the server for the demo.
- If the API sleeps, crashes or the Wi-Fi dies, the demo still works (and the PWA caches it for offline).
- The **API only adds live analysis** (draw any box in India, upload your own images).

That is B4 + B1 working together: **B4 is the safety net, B1 is the engine.**

### 3.4 Each box, what it is and what it does

| Box | What it is | What it does for the project |
|---|---|---|
| **Users** | Officer laptop, field phone (browser) | No install, no sign-in. A **permalink + QR code** moves a result from laptop to phone. |
| **Web app** | React + Vite + TypeScript + Tailwind + MapLibre | The swipe map, severity colours, false-alarm toggle, ranked list, impact panel, evidence panel, exports, area picker, offline PWA. Hosted on Vercel. |
| **Backend API** | FastAPI (Python) in a Docker container | Receives "analyse this area" or "analyse these files", runs the engine as a **job**, serves results and exports. |
| **Storage** | Plain files, **no database** | GeoJSON, GeoPackage, COG, JSON. Simple, reliable, opens in QGIS. A database (PostGIS) is future work for district-scale. |
| **Data sources** | Free, public | Sentinel-2 (optical), Sentinel-1 (radar), OpenStreetMap (buildings, roads), ESA WorldCover (cropland), training labels, user upload, or any area drawn on the map. |
| **GEOAI Engine** | Python (Rasterio, GeoPandas, NumPy, SciPy, scikit-image) | The 5-step pipeline in Section 3.5. This is where all the thinking happens. |
| **What the officer gets** | The result screens | Swipe map, false-alarm toggle, ranked list with reasons, impact numbers, evidence panel, export and share. |
| **Train · Evaluate · Ship** | Offline scripts, GitHub Actions | Fetch scenes, train the U-Net, measure it on unseen locations, export demo files and weights, run CI, deploy. |

### 3.5 Inside the engine: the five steps

This is the heart of the architecture. It lives in `engine/` and is a chain of pure functions (`engine/run.py` calls them in this order).

| Step | Name | What happens | Code |
|---|---|---|---|
| **1** | **Ingest and align** | Read the two images, check they share the same coordinate system (CRS), resample so pixels line up, match brightness (histogram match), check for image shift, and record **data-quality flags** (cloud %, shift, season mismatch, resolution). | `ingest.py`, `quality.py` |
| **2** | **Detect change** | Pick a detector (see below) and produce a per-pixel "candidate change" mask plus a magnitude (how big the change is). | `detectors.py`, `change_*.py`, `radar.py` |
| **3** | **False-alarm filters** | Remove what is not real: seasonal-vegetation rule, cloud/shadow mask, morphology (remove speckle), minimum area. **Count how many each rule removed** (that count is the ablation, M9). | `filters.py` |
| **4** | **Vectorise and attribute** | Turn the surviving pixels into polygons (Rasterio). Attach area (m²), magnitude, centroid, severity tier, reason, confidence. | `vectorise.py`, `attributes.py` |
| **5** | **Impact and export** | Compute hectares changed, cropland / built-up affected (ESA WorldCover), then write GeoPackage, GeoJSON, CSV, KML, PDF with QR, and `audit.json`. | `impact.py`, `export.py`, `report.py` |

**Every result carries a calibrated confidence and an `audit.json`** (inputs, versions, thresholds), so any number on screen can be traced and reproduced.

**Step 2 has several detectors**, chosen automatically from the input (`choose_mode`), each failing soft with a plain reason if its model or runtime is missing:

| Detector | Input it needs | Method | Status |
|---|---|---|---|
| **spectral** (M1) | Sentinel-2, 10 m | NDVI / NDBI / NDWI change vector + Otsu + change-type rules | **[built]**, the default and the safe fallback |
| **learned** (M3) | Sentinel-2, 10 m | Siamese U-Net trained on OSCD, served with ONNX Runtime | **[built]**, wired into the engine and API |
| **hybrid** | Sentinel-2, 10 m | The learned model proposes, the spectral rules must also name a real change type | **[built]**, fewer farmland false alarms |
| **deep** (BIT) | RGB at about 0.5 m only | Bitemporal Image Transformer (authors' LEVIR-CD weights) | **[built]**, secondary mode, needs PyTorch and `scripts/fetch_bit.py` |
| **radar** (M8) | Sentinel-1 VV dB | Event threshold + region growing + permanent-water mask | **[built]**, evaluated on Sen1Floods11 |

---

## 4. How the data flows (the part judges care about)

There are **six flows**. Learn the first three; they cover 90 % of questions.

### Flow A: Demo scenes (static-first, the guaranteed path)

```
 BUILD TIME (offline, once)                                 RUN TIME (judge opens the site)
 ───────────────────────────                                ──────────────────────────────
 Sentinel-2 / Sentinel-1 demo scenes                          Browser (React app)
        │                                                          │  reads files directly
        ▼                                                          ▼
 scripts/export_demo_assets.py ──runs the engine──▶  web/public/demos/<scene>/
        │                                              ├─ before.webp / after.webp (image previews)
        │                                              ├─ changes.geojson (polygons)
        ▼                                              ├─ result.json + summary (counts, tiers, impact)
 results + audit.json + PDF + crops                    ├─ audit.json (what removed what)
                                                       └─ exports (GPKG, CSV, KML, PDF)
                                                           │
                                                           ▼
                                              Vercel CDN  ──▶  MapLibre swipe map
```

**In words:** at build time we run the real engine on each demo scene and save every output as a file. At run time the website just reads those files. **No server, no database, nothing to crash.** This is why we say "the demo cannot fail".

### Flow B: Analyse any area in India (the live path)

```
 1. User draws a box on the map + picks two dates         (web: AreaPicker, lib/aoi.ts)
        │  POST /fetch-s2/preview   → shows which two clearest scenes will be used
        ▼
 2. User confirms                                         POST /fetch-s2
        │
        ▼
 3. FastAPI creates a JOB and returns a job id            (api/main.py)
        │
        ▼
 4. Engine finds the two least-cloudy Sentinel-2 scenes   (engine/aoi.py, s2.py)
    from the public Earth Search COG bucket, reading only the window of the box
        │
        ▼
 5. Engine pipeline: ingest → detect → filter → vectorise → impact → export   (Section 3.5)
        │
        ▼
 6. Outputs written into the job folder                   GET /jobs/{id}/files/…
        │
        ▼
 7. Browser polls GET /jobs/{id}, then opens /job/:id on the SAME swipe map as the demo scenes
    (changes via GET /jobs/{id}/result, per-polygon detail via /jobs/{id}/features/{fid},
     exports via /jobs/{id}/export)
```

**Limits to say:** box up to about 15 km x 15 km inside one Sentinel-2 tile; larger areas need tiling (future work). Checked against the live archive for six regions (Delhi NCR, Jaipur, Chennai, Kochi, Guwahati, Bengaluru).

### Flow C: User uploads their own two images

```
 Browser: two co-registered GeoTIFFs  ──POST /analyze──▶  FastAPI job
        ▶ engine: ingest (CRS check, resample, histogram match, shift check)
        ▶ detect (auto-routed: Sentinel-2 → spectral/learned/hybrid; 0.5 m RGB → deep)
        ▶ filter ▶ vectorise ▶ impact ▶ export
        ▶ same swipe-map result page
```

Radar flood upload uses `POST /analyze/radar` with a single Sentinel-1 image.

### Flow D: Radar flood mode (M8), flooding under monsoon cloud

```
 Sentinel-1 VV backscatter (dB)
   │
   ▼  1. median speckle filter (5x5)
   ▼  2. ONE event-level Otsu threshold for the whole event (radar only, no labels)
   ▼  3. region growing: seeds 3 dB below the threshold grow through connected dark pixels
   ▼  4. drop permanent water (JRC mask), morphology clean-up
   ▼  5. vectorise ▶ polygons with area, tier, reason
   ▼  6. same exports and same swipe map
```

**Why it matters:** optical satellites are blind under monsoon cloud, which is exactly when floods happen. Radar is not.

### Flow E: The sensitivity lab (X1), in the browser

```
 At build time: engine saves a small "magnitude raster" per scene  (scripts/export_sensitivity.py → sens.bin / sens.json)
        │
        ▼
 Browser downloads it once
        │
        ▼  user drags "change threshold" and "smallest change" sliders
 web/src/lib/sensitivity.ts recomputes mask, polygons and counts IN THE BROWSER (no server call)
        │
        ▼  live counts update; false alarms visibly disappear as the slider moves
```

A test proves the browser gives **identical counts and pixel totals as the Python engine at 9 slider settings**. It is an interactive preview; the server result stays the source of truth.

### Flow F: Train, evaluate, ship (the offline factory at the bottom of the diagram)

```
 OSCD training pairs ──PyTorch on Ayush's RTX 4050──▶ Siamese U-Net (1.09 M parameters)
        │
        ├─ export to ONNX (matches PyTorch to 1.2e-5)  ─▶ engine/weights/  (committed, a few MB)
        │
        ├─ evaluate on 10 HELD-OUT OSCD locations on four continents, with 95 % bootstrap intervals  ─▶ eval/results.json
        │
        ├─ ablation of every false-alarm rule ─▶ eval/ablation
        │
        └─ export demo files ─▶ web/public/demos ─▶ GitHub Actions (tests) ─▶ Vercel + API container
```

The Accuracy page in the website reads straight from `eval/results.json`, so **every number on screen is traceable to a script in the repo.**

---

## 5. Frontend modules (F3, X5, X3, X1)

### F3: React + MapLibre GL JS (the base)

- **What it is:** React renders the pages; MapLibre GL JS draws the interactive map. Open-source, no API key, supports live filter expressions and a before/after compare plugin.
- **What it does for us:** the **swipe map** (drag a slider to see before vs after), polygons coloured by severity, the **false-alarm toggle** that flips between raw detections and real changes without re-fetching.
- **Options we had:** F1 Streamlit/Gradio (fast, but looks like a notebook demo), F2 React + Leaflet (no vector filter expressions, slow with many polygons), F4 deck.gl (unneeded at our scale), F5 OpenLayers (steeper), F6 CesiumJS 3D globe (flashy, no value for before/after), F7 Next.js (we are a static site plus an API, so SSR adds nothing).
- **Why F3:** reliable and the right tool. Honest note: **it is also what most serious teams will pick**, so we do not claim the framework is our USP. The difference comes from what we put on top of it (X5, X3, X1, the trust layer).
- **Supporting libraries:** TypeScript, Tailwind, Zustand (state), React Router, Vitest + Testing Library + Playwright for tests. **[built]**

### X5: Evidence panel (the honesty made visible)

- **What it is:** screens that show **how we know** a result is trustworthy: the **Accuracy page** (held-out metrics with confidence intervals, baselines, limits) and per-scene counts of **how many false alarms each rule removed**.
- **Why it matters:** most teams show one F1 on a sample. We show the table. Example numbers **[measured]**: Navi Mumbai airport **2,185 raw detections → 265 real changes**; Assam flood (radar) **3,490 → 37**; no-construction farmland control **3,083 → 22**.
- **Status:** **[built]**

### X3: Offline PWA

- **What it is:** a Progressive Web App built with `vite-plugin-pwa`. After one visit, the site and the demo scenes are cached by the browser.
- **What it does for us:** the demo **works with no network**, which matches the real field-use story (officers in poor coverage) and protects us from venue Wi-Fi. A Playwright end-to-end test opens the demo with the network switched off.
- **Status:** **[built]**, tested.

### X1: Live sensitivity lab (optional layer)

- **What it is:** two sliders (change threshold, smallest change) that **recompute the result inside the browser**.
- **What it does for us:** it **shows** the false-alarm problem instead of describing it. A judge drags the slider and watches detections appear and vanish in real time.
- **Needs:** browser-side compute (the B3 idea). Implemented as `web/src/lib/sensitivity.ts`, mirrored by `engine/sensitivity.py`, UI in `SensitivityLab.tsx` on the Result page.
- **Status:** **[built]**, **[optional]**, proven equal to the server at 9 settings. Available on the optical scenes.

### Also built (small, visible wins added to the core)

Permalink (the URL carries area, dates, mode, thresholds), **QR code** to send a result to a phone, **one-page PDF report** with a QR to the permalink, confirm/dismiss per change, CSV field pack with map links, KML.

---

## 6. Backend modules (B4, B1, B3)

### B4: Static-first files (core)

- **What it is:** results are precomputed and shipped as ordinary files (GeoJSON, GeoPackage, COG, JSON), described with STAC-style metadata.
- **What it does for us:** the deployed demo needs **nothing running**. Opens in QGIS. Zero-risk at the venue.
- **Options we had:** a live database (PostGIS, SQLite) or a hosted GIS service. Skipped for v1: more moving parts, no benefit for a demo, hard to reproduce. PostGIS is our answer to "how does it scale to a district?".
- **Status:** **[built]**

### B1: FastAPI + Rasterio + GeoPandas + PyTorch/ONNX (core)

- **FastAPI:** the Python web server. Endpoints include `/health`, `/demos`, `/analyze`, `/analyze/radar`, `/fetch-s2/preview`, `/fetch-s2`, `/jobs/{id}`, `/jobs/{id}/result`, `/jobs/{id}/export`, `/metrics`. Long analyses run as **jobs** so the browser polls instead of waiting.
- **Rasterio (+ GDAL):** reads and writes geo-referenced images, windowed reads of COGs, and **polygonises** the change mask. This is what turns pixels into GIS-ready shapes.
- **GeoPandas / NumPy / SciPy / scikit-image:** attributes, geometry maths, morphology and filters.
- **PyTorch:** used to **train** the OSCD U-Net on Ayush's RTX 4050 laptop (kept out of the core install in `requirements-ml.txt`).
- **ONNX Runtime:** used to **serve** the trained model. Much lighter than PyTorch, so the cloud container does not need PyTorch.
- **Why B1:** it is the engine that produces every number we quote, and it handles big scenes and every GIS format.
- **Honest note:** B1 is the default stack for this problem, so it is not unique on its own. Where it needs a host that stays up, **B4 covers the demo**.
- **Options we had:** B2 hosted container (needed anyway to run B1: Hugging Face Docker Space first, Render as fallback), B5 Google Earth Engine (needs an approved account, cannot be reproduced in CI), B6 serverless GPU (we do not need a GPU at serve time), B7 laptop plus tunnel (fragile; backup only).
- **Status:** **[built]**, tested, Dockerfile verified (live Delhi analysis completed: 1,831 raw → 59 real changes).

### B3: Browser-first compute (optional layer)

- **What it is:** doing the analysis **in the user's browser**: read the image window straight from the public bucket, run the filters (and eventually a small ONNX model with ONNX Runtime Web on WebGPU, WebAssembly fallback) on the user's own machine.
- **What it gives that a server cannot:** a **live sensitivity slider**, **offline use**, and, for private uploaded imagery, **the imagery never leaves the machine** (privacy for agencies). No server to keep alive.
- **What it does NOT do (say this):** it does **not** make the model more accurate. The same model on the same pixels gives the same answer in the browser or on the server. Accuracy comes from M7, M9 and M3.
- **Limits:** browser memory restricts it to small areas of a few km.
- **Status, honestly:** the **browser-side recompute that powers X1 is built and proven equal to the server**. The **full in-browser engine (reading COGs with `geotiff.js` and running the U-Net with ONNX Runtime Web) is NOT built**; it is not in the web dependencies today. Say "browser-first sensitivity lab is live; full in-browser inference is the next step". **[optional]**

---

## 7. Model and method modules (M1, M7, M9, M3, M8, + BIT)

### M1: Spectral indices + Otsu (the baseline and safe default)

- **What it is:** simple formulas on image bands (NDVI vegetation, NDBI built-up, NDWI water, SWIR-blue) combined into a change vector; Otsu picks the cut-off automatically; type rules label the change (vegetation loss, built-up gain, water gain...).
- **Why we keep it:** fast, interpretable, needs no training, works anywhere. If a model ever loses to it, **spectral stays the default** and we report both numbers.
- **Status:** **[built]**. Used by the demo scenes and live uploads.

### M7: Temporal composites + persistence (method idea, off by default)

- **What it is:** instead of one "before" and one "after" scene, use the **median of several clear scenes** (composite) and require a change to **repeat across more than one later scene** (persistence). Construction, once built, stays; a cloud edge or a one-day shadow does not.
- **Why:** attacks the false-alarm problem directly with no deep model.
- **Honest result [measured]** (`eval/composites.py`): persistence cut false detections on a no-construction control by **27 %** (11 → 8 polygons) **but also removed about 15 % of the real changed area** on a real-construction area (Pune 142 → 121 ha). **Median composites of 3 did not help.** One test area each: a measurement, not a guarantee. Therefore **both are OFF by default**, and we say so. Floods are excluded because water recedes.
- **Status:** **[built]**, **[measured]**, off by default.

### M9: Uncertainty + ablation (the trust layer)

- **What it is:** a **calibrated confidence per polygon**, a "needs review" band, data-quality flags (cloud %, shift, season mismatch, resolution), and an **ablation table**: for every filter rule, how many false alarms it removed.
- **Why:** turns "false-alarm-first" from a slogan into a **table a judge can check**. Also, a user analysing their own area has no ground-truth labels, so we cannot honestly show them an F1; confidence plus quality flags is what we can honestly measure.
- **Finding [measured]:** the change-type rules and the speckle filter do almost all the false-alarm removal.
- **Status:** **[built]**, surfaced in the UI through X5.

### M3: OSCD-trained Siamese U-Net (the learned model)

- **What it is:** a small neural network (1.09 million parameters) that looks at the "before" and "after" Sentinel-2 images together and outputs a change map. Trained on **OSCD** (Onera Satellite Change Detection: Sentinel-2 urban-change pairs with pixel labels: 14 train / 10 test locations worldwide).
- **Why:** the statement asks for a lightweight U-Net; OSCD is the right resolution (10 m). Trained with PyTorch, exported to **ONNX** and served by ONNX Runtime so the server stays light.
- **Result [measured]** on **10 held-out OSCD locations on four continents**: **F1 0.54 [0.34, 0.66]** vs **0.38** for our spectral engine vs **0.24** for plain subtraction. It wins in all 10 locations, but is **weak in 3** (Valencia, Norcia, Saclay).
- **Honest trade-off [measured]:** on our no-construction **farmland control scene** the learned model alone raises **263 polygons vs 22** for spectral (the hybrid mode brings it to 12). So **spectral stays the default**, and we offer `learned` and `hybrid` as modes.
- **For context [published]:** frozen-backbone baselines on OSCD score roughly F1 41-53, so modest numbers are normal.
- **Status:** **[built]**, **[measured]**, wired into engine and API (`/health` reports availability).

### M8: Sentinel-1 radar flood mode (the social-impact USP)

- **What it is:** radar sees through cloud, and calm water reflects the radar pulse away, so flooded ground looks **dark**. We find new open water by thresholding that.
- **Pipeline:** speckle filter → one **event-level Otsu threshold** (no labels) → **region growing** → drop permanent water → morphology → polygons.
- **Data decision (Ayush):** train/calibrate on Microsoft **Planetary Computer** (no account), test on **NASA OPERA RTC-S1** (a different processor, so it tests generalisation), labels from **Sen1Floods11** (hand-labelled).
- **Results [measured]** (flood IoU, ours vs naive):

  | Test set | Naive | Ours |
  |---|---|---|
  | Unseen country (Bolivia) | 0.337 | **0.697** |
  | India test chips | 0.273 | **0.571** |
  | Official test split | 0.141 | **0.287** (0.433 with the optional learned classifier) |

  Assam demo scene (all 68 chips): 0.175 → **0.410**. Call this "the demo scene", **not** a held-out result.
- **Status, honestly:** the **engine is built, wired into the app, and measured on the public Sen1Floods11 benchmark**; there is a radar demo scene (Assam 2016) and a radar upload tab. **Still open:** the live 2026 NASA OPERA download check, and a before/after radar-change evaluation with labels. Do not say "50 % done" on stage; say **"built and benchmarked; live 2026 verification is the open item"**.
- **Limits to say out loud:** this is **single-date open-water mapping**, not before/after change; flooded crops and streets can be missed (recall is moderate by design: we favour precision, meaning few false alarms); the Assam scene is a 2016 event.

### BIT / deep mode (secondary, for high-resolution input)

- **What it is:** Bitemporal Image Transformer for 0.5 m RGB aerial imagery (LEVIR-CD building change). **Only works on about 0.5 m RGB**; anything else is rejected with a plain message.
- **Why we keep it:** the official PDF lists **LEVIR-CD** as a reference dataset, so judges expect it.
- **Result [measured]:** F1 **0.90 [0.89, 0.91]** on the full LEVIR-CD test split (128 images), against **0.89 published**: we reproduced it.
- **Status:** **[built]**, needs PyTorch and `scripts/fetch_bit.py`, so it is unavailable on the default light server.

### Why not the other options? (quick answers)

| Option | Why not |
|---|---|
| M2 Random forest on spectral features | Optional extra baseline only if time allows |
| M4 Pretrained VHR models alone | Wrong resolution for Sentinel-2; we keep BIT only for 0.5 m input |
| M5 Foundation models (Prithvi, etc.) | Heavy for 24 h; no published OSCD result found |
| M6 AlphaEarth embeddings | Annual only, so it cannot map a flood; optional future case study |

---

## 8. What makes us different (three things a judge can verify)

Most teams will submit **React + a map + FastAPI + a pretrained model**. That is fine, but it does not stand out. We differ where it can be checked:

1. **Method: the trust layer.** False alarms are removed by named rules (M1, M7, M9) and each rule's contribution is a **table**, with an unseen no-change scene that gives close to zero polygons.
2. **Evidence: honest numbers.** Held-out results with 95 % confidence intervals, limits written on the page, "published" never confused with "ours", "demo scene" never confused with "held-out".
3. **Architecture: static-first + offline + radar.** The demo cannot fail, it works offline, a QR hands a result to a phone with no sign-in, and **radar flood mode works under monsoon cloud when optical fails**.

**On the PyTorch competitor:** another team highlights PyTorch. **We use PyTorch too**, to train the model. What we add is what a judge can verify: held-out evaluation with confidence intervals, an ablation of the false-alarm rules, ONNX serving so the model runs anywhere, and the radar mode.

---

## 9. Status board (authoritative, as of 9 Oct 2026)

| Module | What | Status |
|---|---|---|
| **F3** | React + MapLibre swipe map, severity tiers, false-alarm toggle | **[built]**, tested |
| **X5** | Evidence panel and Accuracy page | **[built]** |
| **X3** | Offline PWA | **[built]**, offline end-to-end test passes |
| **X1** | Live sensitivity lab | **[built]**, **[optional]**, equal to server at 9 settings |
| **B4** | Static-first precomputed files | **[built]** |
| **B1** | FastAPI + Rasterio + GeoPandas, ONNX serving, Docker | **[built]**, container verified |
| **B3** | Browser-first compute | **[optional]**: sensitivity recompute built; full in-browser ONNX inference **[open]** |
| **M1** | Spectral indices + Otsu | **[built]**, default detector |
| **M7** | Composites + persistence | **[built]**, **[measured]**, **off by default** |
| **M9** | Calibrated confidence + ablation + quality flags | **[built]** |
| **M3** | OSCD Siamese U-Net (PyTorch → ONNX) | **[built]**, **[measured]** F1 0.54, wired in as `learned` / `hybrid` |
| **M8** | Sentinel-1 radar flood mode | **[built]**, benchmarked on Sen1Floods11; live 2026 OPERA check and before/after labels **[open]** |
| **BIT** | High-resolution deep mode | **[built]**, F1 0.90 reproduced, needs PyTorch |
| **Any-area (India)** | Draw a box, pick dates, live analysis | **[built]**, checked on six regions, **not claimed to work everywhere** |
| **Deployment** | Vercel (site) + Hugging Face Docker Space or Render (API) | Prepared; needs team accounts **[open]** |

---

## 10. Honest limits (say these before the judge asks)

- 10 m imagery **cannot detect people or single small buildings**. We prioritise where to look.
- **Radar is single-date open-water mapping.** Flooded crops and streets can be missed; the Assam scene is a 2016 event; the 0.41 is a demo-scene score, not held-out.
- The **learned model beats spectral on OSCD F1 but raises far more false alarms on our farmland control** (263 vs 22 polygons), is weak in 3 of 10 locations, so **spectral remains the default**.
- Spectral thresholds were **tuned on Maharashtra scenes**. Six other regions were checked by eye: plausible in fast-growing urban areas; **known confusers are river channels and sandbars (Yamuna, Brahmaputra) and bare soil in arid regions (Jaipur)**. So we say "validated on N regions", **never "works everywhere"**.
- **Persistence** removes some false alarms but also about 15 % of real changed area; **median composites did not help**, so both are off by default.
- **Area cap** about 15 km x 15 km per request; larger areas need tiling (future work). PostGIS and a job queue are the answer to district scale.
- **LEVIR-CD is academic-use only** (Google Earth terms); credits say so.
- Our early building-change prototype scored F1 0.93 on **seven hand-picked tiles**; the published full-test figure is about 0.89. Never quote 0.93 as our headline.

---

## 11. Likely judge questions (short answers)

| Question | Answer |
|---|---|
| Why a web app and not a mobile app? | The statement asks for an interactive split-view **web** map; a link works on any device with no install, and the PWA covers offline use. |
| What if the server is down or the Wi-Fi fails? | The deployed demo uses **precomputed files** and works offline as a PWA. The API only adds live analysis. |
| Why no database? | Results are files (GeoJSON, GeoPackage, COG). Simple, reliable, opens in QGIS. PostGIS is the scale-up path. |
| How do you handle seasons and clouds? | A seasonal-vegetation rule, a cloud/shadow mask, optional composites and persistence, and **radar for floods**. |
| How do you know false alarms are really removed? | The **ablation table** shows each rule's contribution, and the no-change farmland scene drops 3,083 → 22 detections. |
| Is your accuracy real? | Held-out OSCD locations with 95 % intervals (F1 0.54 vs 0.38 spectral); radar tested on an unseen country (0.697 vs 0.337). Published numbers are labelled "published". |
| Why not just use the best pretrained model? | The pretrained BIT is for 0.5 m RGB, not 10 m Sentinel-2. OSCD has real Sentinel-2 labels, so we trained on it; BIT stays for high-resolution input. |
| Does it find victims? | No. It prioritises where to look. 10 m imagery cannot see people. |
| Privacy? | The sensitivity recompute runs in the browser; sharing is opt-in and only derived polygons are shared. |
| Does it work for all of India? | The engine is region-agnostic (Sentinel-2 covers India) and any box up to about 15 km can be analysed. We have checked six regions and say so; we do not claim it works everywhere. |
| What is actually new? | The ingredients are public. Our contribution is **measured false-alarm suppression, a reason per polygon, impact numbers, honest evidence and a working radar flood mode**. A survey of 10 past projects found none that reports false alarms per km². |

---

## 12. Where things live (for the "show me the code" moment)

| Thing | Where |
|---|---|
| Engine pipeline and its steps | `engine/run.py`, `ingest.py`, `detectors.py`, `change_spectral.py`, `change_learned.py`, `change_deep.py`, `radar.py`, `filters.py`, `vectorise.py`, `attributes.py`, `impact.py`, `quality.py`, `export.py`, `report.py` |
| M7 composites / persistence | `engine/composite.py`, `engine/persistence.py`, `eval/composites.py` |
| X1 sensitivity lab | `engine/sensitivity.py`, `web/src/lib/sensitivity.ts`, `web/src/components/panel/SensitivityLab.tsx` |
| API | `api/main.py` |
| Web app | `web/src/pages` (Scenes, Result, Analyse, Accuracy, About), `web/src/components`, `web/src/lib`, `web/src/store` |
| Model weights | `engine/weights/` (U-Net + ONNX, committed); BIT downloaded by `scripts/fetch_bit.py` |
| Evidence | `eval/results.json`, `eval/README.md` |
| Demo data | `web/public/demos/` |
| Options study (every F/B/M/X code) | `docs/TECH_OPTIONS.md` |
| Decisions | `docs/DECISIONS.md` |
| Speaker script | `docs/PITCH_BRIEF.md`, `docs/DEMO_SCRIPT.md` |
