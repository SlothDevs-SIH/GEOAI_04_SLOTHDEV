# NETRA: Official 3-Minute Jury Pitch & Defense Playbook
> **Team Slothdevs · FUSION 2026 · Problem Statement GEOAI 04**  
> *Follow this file directly during your presentation. It follows the exact slide order of `NETRA_review2.pptx` and includes every question and concept covered.*

---

## 🕒 Master Presentation Timeline (3 Minutes Total)
* **0:00 – 0:30** $\rightarrow$ **Slide 1 & 2:** Team, Objective, Problem & 5-Step Solution Framework
* **0:30 – 1:00** $\rightarrow$ **Slide 3:** Technical Architecture & Tech Stack (F3, X3, B1, ONNX)
* **1:00 – 2:00** $\rightarrow$ **Slide 4 + Live App Demo:** The 4 Detectors, How We Killed False Alarms & Scenario Mapping
* **2:00 – 2:40** $\rightarrow$ **Slide 5:** Accuracy Numbers Decoded (IoU, F1, Precision/Recall, Held-out Splits)
* **2:40 – 3:00** $\rightarrow$ **Slide 6 & Close:** Top 3 USPs & Q&A Defense

---

# 📑 Slide 1: Introduction (0:00 – 0:10)
**On Screen:** *Title Slide — Problem Statement GEOAI 04 | Slothdevs | NETRA*

### 🗣️ What to Say:
> *"Good day respected jury. We are Team Slothdevs, led by Soham, with Ayush, Vedashree, and Shreyas. Today we present **NETRA**: Bi-Temporal Satellite Change Detection for Rapid Urban Encroachment and Disaster Impact."*

---

# 📑 Slide 2: Objective, Problem & Solution Framework (0:10 – 0:30)
**On Screen:** *Slide 2 — Objective, The 3 Big Problems & 5-Step Pipeline*

### 🗣️ What to Say:
> *"Every year, **7.4 million hectares of India floods**, but disaster teams are blinded because monsoon clouds block optical satellites. At the same time, Indian cities are exploding toward **951 million citizens by 2050**, causing illegal encroachment on wetlands and drains.
> 
> When agencies run naive pixel comparison, they get **over 86 false alarms per km²** from dry grass, shadows, and crop cycles.
> 
> **NETRA solves this through an end-to-end 5-Step Pipeline:**
> 1. **Ingest & Align:** Automated CRS alignment, grid matching, and cloud/shadow masking using Rasterio.
> 2. **Detect Change:** Dual-engine—Optical physics rules + Sentinel-1 Synthetic Aperture Radar.
> 3. **Filter False Alarms:** 5-stage cascade filter eliminating speckle, crop cycles, and sensor noise.
> 4. **Vectorise & Rank:** Converts raw pixels into GIS-ready polygons ranked from Low to Critical severity.
> 5. **Impact & Export:** Calculates submerged cropland and hit structures via ESA WorldCover, with 1-click GeoPackage export."*

---

# 📑 Slide 3: Technical Approach & Architecture (0:30 – 1:00)
**On Screen:** *Slide 3 — Technology Stack & Modules*

> 💡 **Quick Full Forms for this Slide (Memorize these!):**
> - **OSCD:** **Onera Satellite Change Detection** *(Global benchmark dataset of 24 cities with ground-truth change labels)*
> - **ONNX:** **Open Neural Network Exchange** *(High-performance format to run AI models on normal CPUs in milliseconds without GPUs)*

### 🗣️ What to Say:
> *"Here is our complete architecture from front to back, showing what each module does:
> 
> - **Frontend Modules (`F3`, `X3`, `X5`, `X1`):**
>   - **`F3` [Interactive Split-View Swipe Map]:** Hardware-accelerated **MapLibre GL JS** synced double-canvas with a draggable divider comparing 'Before' and 'After' satellite feeds side-by-side in real time.
>   - **`X3` [Zero-Crash Offline PWA]:** Service worker caching (`vite-plugin-pwa`) that stores the app shell and demo data locally in CacheStorage. Even if the venue Wi-Fi dies or our backend sleeps, **the entire demo runs 100% offline with zero crash risk**.
>   - **`X5` [Evidence & Audit Panel]:** The live verification engine on the Accuracy page—displays the rule-by-rule ablation table showing exactly which false-alarm rule removed how many pixels, paired with 95% statistical confidence intervals.
>   - **`X1` [Sensitivity Lab Slider]:** An in-browser HTML5 canvas raster processor where officers can drag threshold and minimum-area sliders to instantly recompute change masks without waiting for a server round-trip.
> 
> - **Backend & Compute Pipeline (`B1`, `B4`):**
>   - **`B4` [Static-First Edge Storage]:** Precomputes GeoJSON polygon geometries, WebP image crops, and impact metadata so the demo loads in under 200 milliseconds.
>   - **`B1` [Core Geospatial Processing Engine]:** High-performance **FastAPI** backend orchestrating **Rasterio / GDAL** for multi-band satellite raster math, and **GeoPandas + Shapely** for vector polygonisation, spatial indexing, and GeoPackage generation.
> 
> - **AI, ML & Change Detection Engines (`M1`, `M3`, `M8`, `M7`):**
>   - **`M1` [Physics Spectral Baseline]:** Calculates normalized difference indices (NDVI for trees, NDBI for concrete, NDWI for water) with automated Otsu thresholding for 100% transparent, explainable change detection.
>   - **`M3` [Deep Siamese Neural Network (PyTorch $\rightarrow$ ONNX)]:** A twin-branch convolutional neural net trained on the global **OSCD** benchmark. We exported it from **PyTorch to ONNX Runtime**, allowing deep learning inference to run in **milliseconds on low-cost CPUs** with zero expensive GPU servers.
>   - **`M8` [Sentinel-1 Radar Flood Engine]:** Dual-polarisation (VV/VH) microwave radar processing with adaptive hysteresis region-growing to penetrate monsoon clouds and map open water.
>   - **`M7` [Temporal Persistence & Compositing]:** Multi-temporal scene stacking that checks if a change persists across multiple dates to eliminate transient vehicle shadows and cloud fringe artifacts."*

---

# 📑 Slide 4 + LIVE APP DEMO: The Detectors & False-Alarm Killer (1:00 – 2:00)
**Action:** *Switch to the live website running at `http://127.0.0.1:5173`!*

### Part A: The 4 Detectors Demystified

| Detector | What It Is | How to Explain It to the Judge |
|---|---|---|
| **1. Spectral Rules** *(Default)* | **Physics-based spectral indices (NDVI, NDBI, NDWI) + Morphological filters** | *"100% transparent and explainable. No black box. We calculate vegetation (**NDVI**), concrete/buildings (**NDBI**), and water (**NDWI**). If NDVI drops and NDBI jumps, we flag an encroachment alert with the exact mathematical reason."* |
| **2. Learned (PyTorch $\rightarrow$ ONNX)** | **Deep Siamese U-Net on 13 Sentinel-2 bands** | *"A deep convolutional neural network comparing twin feature representations of Before and After images. Trained on global OSCD data and served via ONNX Runtime for CPU millisecond execution."* |
| **3. Hybrid** | **Siamese U-Net candidates verified by Spectral Rules** | *"The best of both worlds: the neural network proposes candidate changes, and spectral physics rules verify them to eliminate false alarms from bare farmland."* |
| **4. Radar Flood** | **Sentinel-1 SAR Microwave (VV/VH backscatter)** | *"Optical satellites cannot see through monsoon clouds. Sentinel-1 shoots radar beams through rain. Flat water acts like a mirror and bounces radar away (appears dark). We use automated thresholding + region growing to map flood boundaries."* |

---

### Part B: Which Model is Best for WHICH Scenario?

```text
┌──────────────────────────────────────┬─────────────────────────────────────┐
│ SCENARIO                             │ WINNING MODEL TO USE                │
├──────────────────────────────────────┼─────────────────────────────────────┤
│ 1. Monsoon Floods & Cyclone Damage   │ 🛰️ Sentinel-1 Radar Mode            │
│ 2. City Encroachment & New Buildings │ 🟣 Learned (Siamese U-Net / BIT)    │
│ 3. Farmland, Forests & Rural Land    │ 🟢 Spectral Rules (Default)         │
│ 4. High-Stakes Municipal Eviction    │ 🟡 Hybrid (Learned + Spectral)      │
└──────────────────────────────────────┴─────────────────────────────────────┘
```
> **Say this:**  
> *"We do not force one model on every problem. For monsoon floods, Radar is mandatory because optical is blind. For urban cities, our Learned Siamese model wins on complex geometry. But for farmland and forests, our Spectral Rules are default because neural nets over-flag dry soil by 7.4 false alarms/km²."*

---

### Part C: How Did We Kill 99% of False Alarms? (The 5-Stage Cascade)
*(Point to the False-Alarm toggle: **2,185 raw detections $\rightarrow$ 265 real changes**)*

> *"When a judge asks: 'How did you remove the false alarms?', tell them:
> We built a **5-stage filtering pipeline** using `scipy.ndimage` and `numpy` where every rule counts what it drops:
> 1. **Cloud & Shadow Masking:** Uses Sentinel-2 Scene Classification (SCL) to remove clouds and moving shadows.
> 2. **Seasonal Greening Filter:** Flags and drops natural vegetation growth and ambient moisture changes.
> 3. **Preset Relevance Filter:** For urban encroachment, normal farm crop harvesting is automatically discarded.
> 4. **Morphological Opening & Closing:** A $3 \times 3$ kernel removes sensor speckle and boundary noise thinner than 30 meters.
> 5. **Connected Component Thresholding:** Uses `scipy.ndimage.label` to drop tiny, isolated specks ($< 300\text{ m}^2$)."*

---

# 📑 Slide 5: Performance Qualification & Accuracy Decoded (2:00 – 2:40)
**On Screen:** *Slide 5 — Performance Qualification & Benchmark Tables*

### What All the Numbers Mean:

1. **IoU (Intersection over Union = Overlap Score):**
   - **On Unseen Countries (Bolivia held-out, 15 chips):** Our Radar model scored **0.70 IoU vs 0.34 Naive**. This proves our radar engine works globally on unseen terrain.
   - **On Indian Test Chips (14 chips):** We achieved **0.57 IoU vs 0.27 Naive** (over 2x better).
   - **On Assam 2016 (All 68 chips):** Naive had **0.18 Precision** (82% false noise!). Our model scored **0.79 Precision** (slashing noise by 4x).
   - *(Note: A "Chip" is a standardized $512 \times 512$ pixel tile from a satellite pass).*

2. **Optical Change Benchmarks (OSCD — 10 Held-out Global Cities):**
   - **Naive (Subtract + Otsu):** $\text{F1} = \mathbf{0.24}$ (Drowned in false alarms).
   - **Spectral Rules:** $\text{F1} = \mathbf{0.38}$, Precision = **57%** (Strict false-alarm suppression).
   - **Learned Siamese U-Net:** $\text{F1} = \mathbf{0.54}$, Recall = **67%** (Wins across all 10 held-out test cities).

3. **High-Res Building Change (LEVIR-CD with BIT Transformer):**
   - **Naive:** $\text{F1} = \mathbf{0.14}$
   - **BIT Model:** $\text{F1} = \mathbf{0.90}$

4. **False Alarms per km² (Farmland Control Test):**
   - Slashed from **86.9 down to 0.62 per km²**!

---

# 📑 Slide 6 & Close: The TOP 3 USPs & Judge Q&A Defense (2:40 – 3:00)

### 🥊 Your TOP 3 USPs (Deliver These with Impact):
1. **False-Alarm Killer:** Cuts fake alerts from **86.9 down to 0.62 per km²** (turning 2,185 noisy blobs into 265 actionable polygons).
2. **Sees Through Monsoon Clouds:** Uses Sentinel-1 microwave radar to map active flood boundaries and submerged cropland when optical satellites are 100% blind.
3. **Field-Ready & Zero-Crash:** Built as an Offline PWA (`X3`), runs CPU-only in milliseconds via ONNX (no expensive GPU servers needed), and exports directly to **QGIS GeoPackages** and PDF reports with mobile QR codes.

---

## 🛡️ Quick Q&A Counter-Punches for the Jury:

| Judge Question | Your Winning Answer |
|---|---|
| **"What are NDVI, NDBI, and NDWI?"** | *"They are normalized difference spectral indices: **NDVI** measures vegetation (greenery), **NDBI** measures built-up concrete/structures, and **NDWI** measures open water and floods."* |
| **"Why not use Deep Learning for everything?"** | *"Because on dry farmland with zero construction, neural nets over-flag soil variations by 7.4 false alarms/km². Our physics-based spectral rules produce only 0.62. We keep spectral as the reliable default and use deep learning for dense urban textures."* |
| **"Can your satellite see people or small shacks?"** | *"No, and we are honest about it. Sentinel-2 pixels are 10 meters (the size of a bus). NETRA prioritizes macro encroachment and flood zones so government rescue teams know **exactly where** to go on the ground."* |
| **"Does the government need expensive GPU cloud servers?"** | *"No. We exported our models to ONNX Runtime. Standard government laptops can run the entire pipeline on CPU in milliseconds."* |
