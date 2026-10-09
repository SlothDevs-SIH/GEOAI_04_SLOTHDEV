# GEOAI 04: Tech Options and Differentiation Study

**Purpose:** list every realistic backend, model and frontend option, say what most competing teams will pick, and choose where **we** differ, with evidence a judge can check.
**Written:** 9 Oct 2026. **Read with:** [`BACKEND_PLAN.md`](../BACKEND_PLAN.md), [`FRONTEND_PLAN.md`](../FRONTEND_PLAN.md), [`TASK_SPLIT.md`](TASK_SPLIT.md).

> **How to read the confidence labels.** **[verified]** = found in a source listed in §8 during this study. **[from experience]** = commonly known, not re-checked today. **[unverified]** = needs a quick test before we depend on it. Nothing marked [unverified] should go into the pitch until it has been tested.

---

## 0. Locked decisions (9 Oct 2026)

| Area | Core (must ship) | Optional layer | Gated, after the core works |
|---|---|---|---|
| **Backend** | **B4** static-first files + **B1** FastAPI / Rasterio / PyTorch | **B3** browser-first compute on top of B1 and B4 | none |
| **Models** | **M7** composites + persistence, **M9** uncertainty + ablation, **M3** OSCD-trained U-Net, **M1** spectral indices | none | **M8** Sentinel-1 radar flood mode, only after the whole pipeline works end to end and a 2-hour data-access check passes |
| **Frontend** | **F3** React + MapLibre, **X5** evidence panel, **X3** offline PWA | **X1** live sensitivity lab (needs B3) | none |

**M8 update (Ayush, 9 Oct):** radar data sourcing is decided (train / calibrate on Planetary Computer, test on NASA OPERA RTC-S1, labels from Sen1Floods11); the Reliable score rises from 2 to 4 and moves to 5 only after the live checks V-M8-1 and V-M8-2 pass. See [`M8_RADAR_FLOOD_DATA.md`](M8_RADAR_FLOOD_DATA.md) and [`PRIOR_ART_TECH_STACKS.md`](PRIOR_ART_TECH_STACKS.md).

**Added to the core on 9 Oct (13:30):** **permalink**, **QR code** (send to phone) and **PDF export** (one-page report with a QR to the permalink). They are small, visible and useful for officers.

**What B3 does and does not do.** B3 does **not** make the model more accurate: the same model on the same pixels gives the same answer in the browser as on the server. What it adds is a **live threshold and minimum-area slider**, so a user can tune sensitivity on their own area and see the effect immediately, plus offline use and, for private uploaded imagery, privacy. Accuracy comes from M7, M9 and M3.

**Accuracy on the user's end.** A user running their own area has no ground-truth labels, so we cannot show them an F1 for their run. We show what we *can* honestly measure: (1) a **calibrated confidence** per polygon, (2) **data-quality flags** for their scene (cloud %, image shift, season mismatch, resolution), (3) the **ablation** of what each rule removed, and (4) the **held-out accuracy of the model on OSCD with 95 % confidence intervals** (bootstrap over test tiles), labelled as measured on those cities, not on their area.

**State and sharing (no sign-in).** The permalink holds the inputs (area, dates, scene IDs, mode, thresholds); public Sentinel-2 data lets any device rebuild the same result, and a QR code hands a result to a phone. Phones are view-first. Details in `BACKEND_PLAN.md` section 12 and `FRONTEND_PLAN.md` section 13.

---

## 1. The principle: differentiate where judges can see and check it

Most teams on this problem will build the same shape: **React or Streamlit + MapLibre/Leaflet + FastAPI + Rasterio + a pretrained Siamese model**. A good version of that stack does not stand out, and a stack choice alone never wins. Judges notice differences in five places:

| Layer | What judges can verify | Where most teams stop |
|---|---|---|
| **Method** | Does the false-alarm story rest on something real and measured? | "We threshold NDVI and run a pretrained model" |
| **Evidence** | Held-out numbers, ablations, honest limits | One F1 on sample tiles |
| **Architecture** | Does it work without a server, offline, with private data? | "Works on my laptop" or a sleeping free-tier API |
| **Experience** | Can a non-GIS person understand and trust a result in ten seconds? | A map with coloured blobs |
| **Engineering** | Tests, CI, one-command reproduce, standard formats | None |

Our USP should therefore combine **one method idea, one architecture idea and an evidence habit**, not a fancier framework.

---

## 2. Backend options

| # | Option | Strengths | Weaknesses | Crowded? | Verdict |
|---|---|---|---|---|---|
| B1 | **FastAPI + Rasterio + PyTorch** (our current plan) | Fast to build, we know it, full GDAL | Needs a host that can run torch and GDAL; the demo depends on that host staying up | **Yes, the default** | Keep as the engine and the live-analysis path |
| B2 | **Hosted container** (Hugging Face Docker Space, Render, Cloud Run, Railway, Fly) | Normal deployment | **Hugging Face: official docs say Docker and Gradio Spaces need a paid plan, and forum posts from July 2026 say free accounts cannot create them; the docs and posts conflict, and I found no official announcement** [verified, conflicting]. The CPU Basic tier itself is 2 vCPU, 16 GB RAM, free, and sleeps when idle [verified]. Render free is about 512 MB RAM, too small for torch [from experience] | Yes | **Check the Space creation dialog today.** If Docker is paid, use B3 or serve spectral mode only from Render |
| B3 | **Browser-first compute:** read a Sentinel-2 AOI as a Cloud Optimized GeoTIFF in the page (range requests via `geotiff.js`), run the spectral engine and a small ONNX model with **ONNX Runtime Web** on **WebGPU, with a WebAssembly fallback**, vectorise in JS | **No server to host or keep alive; deploys as a static site; imagery never leaves the user's machine (privacy for agencies); works offline once cached** | ONNX Runtime Web: WebGPU needs a recent Chromium; the WASM backend supports all standard operators, so it is the safe fallback [verified]. Raster size is limited by browser memory, so use AOIs of a few km. `geotiff.js` COG range reading is [from experience]. Rasterio under Pyodide is [unverified] and we should not rely on it | **Rare** | **Our architecture USP**, scoped to the small model and the spectral engine (§5, U3) |
| B4 | **Static-first catalogue:** precomputed results as files (COG, GeoJSON, later GeoParquet / PMTiles) described by a **STAC** item | Zero-risk demo, standard formats, interoperable with QGIS and other tools | Not live | Rare to do it properly | **Adopt (already planned)**; add STAC metadata (cheap) |
| B5 | **Google Earth Engine** | Huge archive, no downloads | Needs an account and approval, not an open stack, hard to test and reproduce in CI | Common in remote sensing teams | Skip for the core; use only if a teammate already has access |
| B6 | **Serverless GPU** (Modal, Replicate, etc.) | Easy big models | Cost, accounts, cold starts, and we do not need a GPU at serve time | Some | Skip |
| B7 | **Laptop + tunnel** as the live API | Works on any network that allows it | Fragile at the venue; depends on the presenter's machine | Common | Backup only |

**Data access options for imagery:** Earth Search / public Sentinel-2 COG bucket (already used in `engine/s2.py`) · Microsoft Planetary Computer (STAC, free, needs token signing, also hosts Sentinel-1 RTC) [from experience, [unverified] for the current signing flow] · Copernicus Data Space (account) · manual download of two scenes as the last resort.

---

## 3. Method and model options

| # | Option | What it gives | Cost and risk | Evidence we have | Verdict |
|---|---|---|---|---|---|
| M1 | **Spectral indices + Otsu** (NDVI, NDBI, NDWI differences, change-vector magnitude) | Fast, interpretable, no training, works anywhere | Threshold sensitivity, season confusion | Planned baseline | Keep (default fallback) |
| M2 | **Classical ML on spectral features** (random forest or gradient boosting on band differences) | Strong small-data baseline on OSCD; fast to train | Needs careful validation splits | None yet | Optional baseline if time |
| M3 | **Lightweight Siamese U-Net trained on OSCD** (FC-Siam-diff style) | Matches the statement's "lightweight U-Net"; right resolution; small enough for in-browser ONNX | Small dataset (14 training cities); modest scores expected | Our plan, `BACKEND_PLAN` §5 | **Core ML deliverable** |
| M4 | **Pretrained BIT / ChangeFormer / other VHR models** | Strong on 0.5 m RGB building change | Wrong resolution for Sentinel-2 | Prototype: sample-tile F1 0.93, published about 0.89 | Keep for VHR input only |
| M5 | **Remote-sensing foundation models** (Prithvi-EO-2.0 and similar; TorchGeo hosts multispectral Sentinel-2 pretrained models) | Pretrained on large multispectral archives; may help small data | Heavy for 24 h; **I found no published Prithvi-EO-2.0 result on OSCD, only a small thesis-level signal** [verified]. TorchGeo documents ChangeStar models, but I found no OSCD-trained or Sentinel-2-specific ChangeStar weights [verified, absence] | Weak | **Do not depend on it.** Mention as future work |
| M6 | **AlphaEarth Foundations embeddings:** 64-dimensional annual embeddings at 10 m, CC-BY 4.0, 2017 to 2025 on a Google Cloud bucket (requester-pays); 2018 to 2024 as COGs on Source Cooperative [verified]. Change = distance between a place's embeddings in two years | **Training-free, uses a foundation model, robust to clouds and season by construction because it is an annual summary** | **Annual only, so it cannot map an event within a year (a flood)**; I found no official change-detection guidance [verified, absence]; OSCD images are mostly 2015 to 2018, so a proper benchmark overlap is limited and **evaluation would be a qualitative case study, not a leaderboard number** [from experience, unverified] | None | **Optional "year-over-year encroachment" panel if a teammate has time** (§5, U4) |
| M7 | **Temporal composites + persistence:** instead of one before and one after scene, use the **median of several least-cloudy scenes** in a window before and after, and require a change to **persist** across more than one post-event scene (for encroachment) | Removes clouds, haze, one-day lighting and harvest artefacts without any deep model; directly attacks the false-alarm problem | Needs several scenes per period; flood is transient, so persistence applies to encroachment, not to floods | `engine/s2.py` already searches scenes | **Method USP, low effort** (§5, U1) |
| M8 | **Sentinel-1 radar flood mode:** water has very low radar backscatter, and radar sees through cloud, so a drop in VV or VH between dates maps new water | **Works under monsoon clouds, the exact case where optical fails** | New data pipeline; access and preprocessing unverified. Published context: the Sen1Floods11 benchmark (4,831 chips, 14 biomes); an attentive U-Net on single-date SAR reported 67 % IoU, and a Siamese pre/post design reported about 6 % IoU higher than single-date [verified]. A training-free log-ratio + Otsu version is [from experience] | None | **Method USP, medium risk; gate it behind a 2-hour data spike** (§5, U2) |
| M9 | **Uncertainty and abstention:** calibrated confidence per polygon, a "needs review" band, and an ablation table of which rule removed how many false alarms | Judges see *why* we trust the output | Cheap | Planned | **Adopt** (U1) |

OSCD reference for expectations: in a self-supervised-learning paper with a frozen backbone and U-Net head, OSCD F1 ranged roughly **41 to 53** depending on the backbone [verified]. Expect modest numbers and report them without inflation.

---

## 4. Frontend options

| # | Option | Strengths | Weaknesses | Crowded? | Verdict |
|---|---|---|---|---|---|
| F1 | **Streamlit / Gradio** | Fastest to build | Looks like a data-science demo; weak custom map interaction; no swipe or live-filter polish | Very | Avoid |
| F2 | **React + Leaflet** | Easy, many tutorials | No vector filter expressions; heavier with many polygons | Very | Avoid |
| F3 | **React + MapLibre GL JS** (our plan) | Open source, no key, live filter expressions, compare plugin | The default among serious teams | Yes | Keep as the base |
| F4 | **deck.gl on MapLibre** | GPU layers for huge point or polygon sets, nice transitions | More code; unnecessary at our scale | Some | Skip unless many thousands of polygons |
| F5 | **OpenLayers** | Powerful GIS features | Steeper learning curve | Few | Skip |
| F6 | **CesiumJS (3D globe)** | Flashy | Heavy, little value for a before/after comparison | Few | Skip |
| F7 | **Next.js / SvelteKit** | SSR, routing | We are a static site plus an API; adds concerns | Common | Skip |

**Frontend differentiators that fit on top of F3 (none needs a new framework):**

| # | Feature | Why it matters | Effort |
|---|---|---|---|
| X1 | **Live sensitivity lab:** a slider for the change threshold and minimum area that **recomputes the mask, polygons and counts in the browser** from a magnitude raster, so judges drag it and watch false alarms disappear in real time | It *shows* the false-alarm problem instead of describing it; needs browser-side compute (B3); `d3-contour` or a small marching-squares routine for polygons | Medium |
| X2 | **Shareable permalink:** scene, filters, swipe position and selected polygon in the URL | Judges can send a link to a specific finding | Low |
| X3 | **PWA / offline demo cache** (`vite-plugin-pwa`) | Works with no network at the venue; matches the field-use story | Low to medium |
| X4 | **Language switch** for the main labels (English plus Hindi or Marathi) | The users are Indian district officials; shows we thought about them | Low |
| X5 | **Evidence panel in the UI:** the ablation table (false alarms removed by each rule), held-out F1, limits | Makes the honesty visible inside the product | Low |
| X6 | **Accessibility basics** (keyboard, contrast, tier shown as text) | Quietly signals quality | Low |

---

## 5. USP candidates, scored

Scores 1 to 5 (5 = best). **Impact** = how much a judge notices. **Feasible** = chance of finishing inside the 21 hours with tests. **Evidence** = how well we can back it with numbers. **Unique** = how few teams will do it.

| # | USP | Impact | Feasible | Evidence | Unique | Total | Notes |
|---|---|---|---|---|---|---|---|
| **U1** | **Trust layer:** temporal composites + persistence (M7), calibrated confidence, needs-review band, and an **ablation table of each false-alarm rule** (M9) | 5 | 5 | 5 | 3 | **18** | Cheapest big win; makes "false-alarm-first" a measured fact |
| **U3** | **Browser-first compute:** the spectral engine plus the small OSCD-trained model as ONNX in the page (B3), with the **live sensitivity lab** (X1) | 5 | 3 | 4 | 5 | **17** | Also removes the hosting risk; scope it to small AOIs |
| **U2** | **Radar flood mode** (M8): optical-plus-radar so floods map under cloud | 5 | 2 | 3 | 4 | **14** | Highest social-impact claim, but data access is unverified; gate it |
| **U5** | **Standards and reproducibility:** STAC item per scene, COG and GeoJSON outputs, `audit.json`, one-command reproduce, CI badge | 3 | 5 | 5 | 4 | **17** | Mostly paperwork we already planned; do it |
| **U6** | **Impact numbers:** cropland hectares, buildings, roads, with sources | 4 | 4 | 3 | 3 | **14** | Already planned; keep |
| **U4** | **Foundation-model embeddings** for year-over-year encroachment (M6) | 4 | 3 | 2 | 5 | **14** | Qualitative case study only; do after everything else |
| **U7** | **Review-feedback loop:** confirmed and dismissed polygons recalibrate thresholds or a small re-ranker | 3 | 3 | 3 | 4 | **13** | Stretch |
| **X3 / X2 / X4** | PWA offline, permalink, language switch | 3 | 4 | 1 | 3 | **11** | Small polish items; pick two |

---

## 6. Recommended stack: the default, plus three differentiators

**Keep (needed for everyone):** React + Vite + TypeScript + MapLibre GL JS (+ compare plugin) · FastAPI + Rasterio + GeoPandas · pytest, ruff, Vitest, Playwright, GitHub Actions · static-first demo data.

**Differentiators to commit to (in this order):**

1. **U1, the trust layer.** Build composites and the persistence test in `engine/`, produce the **ablation table** in `eval/`, show it in the UI (X5). *Claim we can defend:* "each rule removes this many false alarms on this pair; here is the unseen no-change result."
2. **U3, browser-first compute with the live sensitivity lab (X1).** Ship the spectral engine and the exported small U-Net as ONNX in the browser, with a WASM fallback. *Claim we can defend:* "the analysis runs on your machine, so agency imagery never leaves it, there is no server to keep alive, and you can tune the sensitivity and watch the result change." Keep the API as the path for large scenes.
3. **U5, standards and reproducibility** (STAC, COG, GeoJSON, `audit.json`, one command).

**Gated stretch (only after checkpoint C2 in `TASK_SPLIT.md`):** U2 (radar flood mode) after a 2-hour data spike by R4 to confirm free Sentinel-1 access and a clean flood pair; then U4 (embedding case study).

**Cheap polish (pick two):** permalink (X2), PWA offline cache (X3), language switch (X4).

**What this changes in the schedule (rough):**
- R2 adds composites + persistence and the ablation script (about 3 h), and STAC metadata (about 1 h).
- R1 exports the trained model to ONNX and checks parity with PyTorch (about 2 h; add it to M3), and tests it in the browser.
- R3 builds the in-browser engine and the sensitivity lab (about 5 to 6 h); this replaces time that would have gone to the PDF and Hindi PDF, which move to the cut list.
- R4 runs the Sentinel-1 data spike (about 2 h) and documents the source of every number.

If `U3` slips, fall back cleanly: the site still works from the static demo data, and the API path covers live analysis. **Never let an USP break the guaranteed demo.**

---

## 7. Pitch lines this supports

- "False-alarm suppression is not a claim here; it is a **table**: each rule, how many alarms it removed, and an unseen no-change pair that now gives about zero."
- "The analysis can run **entirely in your browser**: no upload, no server, no key. An agency can analyse sensitive imagery without it leaving the building."
- "Drag the sensitivity slider and watch false alarms vanish. That is the problem the statement describes, made visible."
- "Our numbers are **held-out** and our limits are on the page."

---

## 8. Sources used in this study

- Prithvi-EO-2.0 paper: <https://arxiv.org/pdf/2412.02732>
- Self-supervised learning baselines on OSCD (frozen backbone + U-Net, F1 about 41 to 53): <https://arxiv.org/pdf/2303.06670>
- TorchGeo models documentation (ChangeStar, multispectral pretrained weights): <https://torchgeo.readthedocs.io/en/v0.4.0/api/models.html>
- ONNX Runtime Web (WebGPU, WebAssembly backends): <https://www.npmjs.com/package/onnxruntime-web>
- Hugging Face Spaces overview and the Docker-Space plan discussion: <https://huggingface.co/docs/hub/en/spaces-overview> · <https://discuss.huggingface.co/t/docker-sdk-now-marked-as-paid-when-creating-a-new-space/177580>
- AlphaEarth Foundations embeddings: <https://deepmind.google/blog/alphaearth-foundations-helps-map-our-planet-in-unprecedented-detail/> · <https://developers.google.com/earth-engine/guides/aef_on_gcs_readme> · <https://source.coop/tge-labs/aef>
- Sen1Floods11 (CVPRW 2020): <https://openaccess.thecvf.com/content_CVPRW_2020/papers/w11/Bonafilia_Sen1Floods11_A_Georeferenced_Dataset_to_Train_and_Test_Deep_Learning_CVPRW_2020_paper.pdf>
- Uni-temporal Sentinel-1 flood detection, Attentive U-Net (67 % IoU on Sen1Floods11): <https://www.frontiersin.org/journals/remote-sensing/articles/10.3389/frsen.2022.1060144/full>

**Still to verify before relying on it:** `geotiff.js` COG range reads and polygonisation speed in the browser on a 500 × 500 pixel AOI · ONNX export parity of the trained U-Net · Sentinel-1 RTC access and token flow on Planetary Computer · whether a free Hugging Face Docker Space can be created today · the OSCD image dates versus AlphaEarth coverage.
