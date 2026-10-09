# GEOAI 04: 3-Minute Jury Pitch & Tech Stack Cheat Sheet
> **Team Slothdev · FUSION 2026 Hackathon**
> **Goal:** Deliver a high-impact, technically authoritative presentation in under 3 minutes.

---

## ⏱️ Section 1: The 30-Second Technical Stack (Say This First)

> *"Judges, here is our architecture from front to back in 30 seconds:*
>
> 1. **Frontend Architecture (`F3`, `X3`, `X5`, `X1`):**
>    - **`F3` Core:** React 19 + TypeScript + Tailwind CSS with a hardware-accelerated **MapLibre GL JS** interactive split swipe map.
>    - **`X3` Zero-Failure PWA:** Service worker (`vite-plugin-pwa`) precaches the app shell and demo datasets. **Even if venue Wi-Fi dies or our server sleeps, the entire demo runs 100% offline.**
>    - **`X5` Evidence & Verification Panel:** Live ablation breakdown, held-out accuracy with 95% confidence intervals, and explicit physical sensor limits.
>    - **`X1` Sensitivity Lab:** In-browser canvas raster processor allowing real-time sensitivity thresholding without round-trip latency.
>
> 2. **Backend & Compute Pipeline (`B1`, `B4`):**
>    - **`B4` Static-First Edge Architecture:** Instant precomputed payloads for zero-latency demo presentation.
>    - **`B1` Processing Engine:** **FastAPI** + **Rasterio / GDAL**, **GeoPandas**, **Shapely**, and **NumPy** for vector geometry polygonisation and geospatial indexing.
>
> 3. **Change Detection Engines (`M1`, `M3`, `M8`, `M7`):**
>    - **`M1` Physics Spectral Baseline:** Multi-band band math (NDVI, NDWI, NDBI) with Otsu thresholding.
>    - **`M3` Deep Siamese Neural Network:** PyTorch Siamese U-Net trained on OSCD, exported to **ONNX Runtime** for fast CPU serving without GPU bottlenecks.
>    - **`M8` Dual-Pol Synthetic Aperture Radar (SAR):** Sentinel-1 microwave radar (VV/VH backscatter + adaptive hysteresis region growing) for penetrating monsoon cloud cover.
>    - **`M7` Temporal Persistence & Compositing:** Multi-date Sentinel-2 cloud masking to eliminate transient shadows."*

---

## 🛰️ Section 2: The 4 Detectors Demystified (For the Judge Q&A)

When the judge points to the **Detector** pills on the screen:

| Detector | What It Is | How to Explain It to the Judge |
|---|---|---|
| **1. Spectral Rules** *(Default)* | **Physics-based spectral indices (NDVI, NDBI, NDWI) + Morphological filters** | *"100% transparent and explainable. No black box. We calculate vegetation (NDVI), built-up concrete (NDBI), and moisture (NDWI). If vegetation drops and concrete jumps, we trigger an encroachment alert with the mathematical reason attached."* |
| **2. Learned (PyTorch $\rightarrow$ ONNX)** | **Deep Siamese U-Net on 13 Sentinel-2 bands** | *"A deep convolutional neural network that compares twin feature representations of Before and After images. We trained it in PyTorch on the global OSCD benchmark and converted it to ONNX Runtime so it runs in milliseconds on any CPU without needing an expensive GPU."* |
| **3. Hybrid** | **Siamese U-Net candidates verified by Spectral Rules** | *"The best of both worlds: the neural network proposes candidate changes, and the spectral physics rules verify them to eliminate false alarms caused by bare farmland."* |
| **4. Radar Flood** | **Sentinel-1 SAR Microwave (VV/VH backscatter)** | *"Optical satellites cannot see through monsoon clouds. Sentinel-1 shoots radar beams through clouds. Flat water bounces radar away like a mirror (appears dark). We use automated thresholding plus region growing to map flood boundaries."* |

---

## 📈 Section 3: The Accuracy Numbers Decoded

When showing the **/accuracy** page, explain the numbers clearly and authoritatively:

### 1. IoU (Intersection over Union)
- **Meaning:** How closely our predicted polygon overlaps with the real ground-truth polygon.
- **On Screen:** Radar flood achieves **0.697 IoU** on unseen held-out countries (Bolivia) vs **0.31** for naive methods.

### 2. Precision vs Recall vs F1
- **Precision (Few False Alarms):** When we flag an alert, is it actually real?
- **Recall (No Misses):** Did we catch all the disasters that occurred?
- **F1 Score:** The harmonic mean balancing Precision and Recall.
- **On Screen (OSCD Global Benchmark):**
  - **Naive Subtraction:** F1 = **0.24** (drowned in false alarms).
  - **Our Spectral Pipeline:** F1 = **0.38** (strict false-alarm suppression).
  - **Our Learned Siamese Model:** F1 = **0.54** (wins on 10 out of 10 held-out test cities).

### 3. 95% Confidence Intervals (`[0.48, 0.62]`)
- **Tell the Judge:** *"Most hackathon projects show a single fake '99%' accuracy. We publish 95% statistical confidence intervals across 10 globally diverse test cities. We show where our model is strong and openly state where it is weak."*

---

## 🚀 Section 4: The 4 Killer USPs to Highlight

1. **The False-Alarm Filter (The "Hero" Feature):**
   - Click the toggle: **2,185 raw detections $\rightarrow$ 265 verified changes**.
   - Tell them: *"Raw satellite subtraction drowns officers in noise. We filter out cloud edges, sun angles, and seasonal crop cycles."*
2. **Offline PWA Reliability (`X3`):**
   - Tell them: *"This app is a progressive web app with precached service workers. Even if judge venue connectivity drops, our demo never crashes."*
3. **Actionable GIS Exports (`F5`):**
   - One-click export to **GeoPackage (.gpkg)**, **GeoJSON**, **KML**, and **PDF report with QR code**.
   - Field teams can directly drop our outputs into **QGIS** or open them on a mobile browser.
4. **Honest Operational Limits:**
   - *"10-meter pixels cannot detect people or small shacks. We prioritize where disaster relief forces and municipal inspectors should look on the ground."*

---

## 🎙️ Section 5: The Exact 3-Minute Presentation Script

### Minute 0:00 - 0:30 $\rightarrow$ Problem & Tech Stack
> *"Good day judges. In satellite monitoring for flood disasters and land encroachment, the biggest hurdle is that **90% of pixel changes are false alarms**—seasonal grass drying, sun angle shifts, and clouds.
> We built **GEOAI 04**: a production-grade change intelligence system. Our frontend uses **React 19, TypeScript, and MapLibre GL JS** wrapped in an **Offline PWA**. Our backend uses **FastAPI, Rasterio, and GeoPandas**, paired with a **PyTorch Siamese U-Net** served via **ONNX Runtime** and **Sentinel-1 SAR Radar** pipelines."*

### Minute 0:30 - 1:30 $\rightarrow$ Live Demo & False-Alarm Story
*(Action: Open Navi Mumbai Airport)*
> *"Here is the Navi Mumbai airport construction. Left is 2019 Before, Right is 2024 After.
> Watch this toggle: without our filter, there are **2,185 raw detected blobs**—mostly agricultural changes. With our filter enabled, it drops to **265 genuine construction polygons**."*
>
> *(Action: Click a Critical polygon)*
> *"Every single polygon explains itself: its exact area in square meters, confidence score, and the physical reason (e.g., 'new building profile detected'). Officers can confirm or dismiss it, view the impact on hectares and cropland, and export a field-ready GeoPackage for QGIS or a PDF with a mobile QR code."*

### Minute 1:30 - 2:30 $\rightarrow$ Radar & The 4 Detectors
*(Action: Open Assam Flood 2016)*
> *"During monsoon floods, clouds block optical cameras. We built an M8 Radar pipeline using **Sentinel-1 microwave radar**. Water bounces radar away, appearing dark. Our hysteresis region-growing algorithm maps real flood extent through heavy cloud cover.
> We provide 4 detector engines: transparent **Spectral Rules** for 100% explainability, **Learned Siamese U-Net** for complex terrain, **Hybrid** for verified inference, and **Radar** for weather-independent monitoring."*

### Minute 2:30 - 3:00 $\rightarrow$ Measured Accuracy & Closing
*(Action: Switch to /accuracy)*
> *"Unlike black-box demos that claim 99% accuracy, every metric here is computed from reproducible evaluation scripts on held-out global benchmarks like OSCD and Sen1Floods11.
> We deliver actionable, verifiable intelligence to officers when it matters most. Thank you!"*
