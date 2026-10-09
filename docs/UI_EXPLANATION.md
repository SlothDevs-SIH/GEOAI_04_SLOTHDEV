# GEOAI 04 Flood Monitor: UI Walkthrough for the Judges

**What this is:** a speaking guide for the round 1 prototype. Read the **bold "Say:"** lines out loud. The rest is background, so you can answer follow-up questions.
**Open the prototype:** double-click `GEOAI04_Flood_Monitor_prototype.html` (works offline), or run `uvicorn api.main:app` and open http://127.0.0.1:8000.

---

## 1. Opening (30 seconds)

**Say:** "Our problem statement is GEOAI 04: find what really changed between two satellite images, and separate real change from false alarms. We focused on floods, because in India they happen during the monsoon, when clouds block normal optical satellites. So we use **radar** (Sentinel-1), which sees through clouds, day and night. What you're looking at is real radar data from the **Brahmaputra flood in Assam on 12 August 2016**, compared against flood maps drawn by experts."

**Say:** "Everyone can detect *something* that changed. Our point is telling you **which detections are real, why, and how sure we are**."

---

## 2. Screen tour (what each part is)

### Top bar
- **Title:** "GEOAI 04 · Flood Monitor (M8 radar mode)". M8 is our name for the radar flood mode.
- **Badges:** "Team Slothdevs · prototype" and the data source: Sen1Floods11 (a public dataset with expert hand-drawn flood maps) and Copernicus Sentinel-1/2 (free European satellites).

### Left panel: "Scenes (Assam, India)"
- Seven scenes. Each is a **5 km × 5 km** area with a radar image, a same-day optical image, and an expert's flood map.
- Each button shows how many flood polygons we found and how much water the expert marked.

**Say:** "Each scene is a real 5 by 5 km area of Assam on the day of the flood."

### Left panel: "Whole event (68 scenes)"
Our accuracy over **all 68 Assam scenes**, compared with the naive method most tools use:

| | Naive | Ours (M8) |
|---|---|---|
| IoU (overlap with the expert map) | 0.175 | **0.41** |
| Precision (share of our detections that are real flood) | 0.187 | **0.791** |
| Recall (share of the real flood we found) | 0.744 | 0.46 |
| Detections | 129,765 | **1,477** |

**Say:** "Over the whole event, the naive method produces almost 130,000 detections, and only about one in five is real flood. Ours produces about 1,500 clean flood areas, and almost **8 out of 10 are real**. Our overlap with the expert map more than doubles."

The line under the table says the water threshold (−14.06 dB) was **fitted from the radar alone**, and the whole event takes about **25 seconds on a normal laptop CPU**.

### Top cards (for the selected scene)
Four numbers: **flooded area in hectares**, **number of flood polygons**, **how many are critical or high severity**, and our **precision vs the naive method**.
Example, Scene 1018327: 139.1 ha flooded, 37 polygons, 6 critical/high, precision **0.95** vs 0.535.

### The controls
- **False-alarm filter (the big blue toggle):** our main feature, see section 3.
- **Show expert labels:** overlays the expert's flood map in green so judges can compare.
- **Flood polygons:** shows or hides our detections.
- **Counter:** e.g. "3,490 raw detections → 37 real flood polygons".

### The map (centre)
- **Swipe view:** optical (Sentinel-2) on the left, radar (Sentinel-1) on the right. **Drag the white handle** in the middle.
- On radar, **flood water looks dark**: calm water reflects the radar signal away from the satellite.
- **Coloured shapes** are our flood polygons, coloured by severity.

**Say:** "Left is a normal photo-like image, right is radar. Drag the handle and you can see that the dark areas on radar match the water. In a monsoon, the left image is often just cloud; the right one still works."

### Legend (under the map)
Severity by flooded area: **Critical ≥ 50 ha** (purple), **High ≥ 10 ha** (red), **Medium ≥ 2 ha** (orange), **Low** (yellow). Also: orange for raw detections (filter off) and green for expert labels.

### "Accuracy on this scene vs expert labels"
The same comparison for one scene. Example, Scene 1018327:

| Method | IoU | Precision | Recall | False-alarm pixels |
|---|---|---|---|---|
| Naive | 0.421 | 0.535 | 0.663 | 19,547 |
| **M8** | **0.427** | **0.95** | 0.437 | **781** |

**Say:** "On this scene, false-alarm pixels drop from almost 20,000 to under 800, and 95% of what we report is real flood. Permanent rivers are excluded, because a river isn't a flood."

### Right panel: "Flood polygons, ranked"
- Every flood area, **biggest first**, with severity tier, area in hectares and confidence (0.5–0.99).
- **Click a row** and the map highlights that polygon.
- **Download GeoJSON** exports the polygons in a standard GIS format that opens in QGIS, ArcGIS or Google Earth.

### Right panel: "Selected polygon"
For the clicked flood area:
- **Severity tier** and **area** (hectares and m²)
- **Confidence**, plus a **"needs review"** flag when confidence is low
- **Why it was flagged**, in plain words. Example: *"radar backscatter −19.9 dB, 5.9 dB below the event water threshold (−14.1 dB); grown from a seed 3 dB darker; not permanent water (JRC)"*
- **Location** (lat/lon) and an **"open in Maps"** link for field teams

**Say:** "Every detection explains itself. An officer can see why we flagged it and how sure we are, then open it in Google Maps and send a team."

### Right panel: "Why radar · honest limits"
- Why radar: it sees through monsoon cloud.
- Limits: the output is an **open-water flood-extent estimate**. Flooded crops and flooded streets can look bright on radar and may be missed. This demo uses a single date; the full system compares before and after.

**Say:** "We'd rather tell you our limits than have you find them."

---

## 3. The key moment: the false-alarm filter (show this live)

1. Pick **Scene 1018327** (the first one).
2. **Turn the False-alarm filter OFF.** The map fills with orange speckle and the counter says **"Filter OFF: 3,490 raw detections"**.
   **Say:** "This is what a normal approach gives you: thousands of alerts, most of them radar noise. No officer can act on this."
3. **Turn the filter ON.** It drops to **37 real flood polygons**.
   **Say:** "With our filter on, 3,490 detections become 37 real flood areas, ranked by size, each with a reason."
4. Tick **Show expert labels**.
   **Say:** "Green is what a human expert drew. Our polygons sit on the expert's flood areas, and 95% of what we report is correct."
5. **Click polygon #1** in the list and read the "Why" line.
6. Click **Download GeoJSON**.
   **Say:** "This file opens directly in any GIS tool, so it plugs into what agencies already use."

---

## 4. How it works (if they ask "what's under the hood?")

**The pipeline, in plain words:**
1. **Read the radar image** (VV polarisation, in decibels).
2. **Remove speckle**, the grainy noise radar always has, using a 5×5 median filter.
3. **Find one water threshold for the whole flood event**, automatically (Otsu's method), from the radar alone. We use **one threshold for the whole area, not one per tile**, because a per-tile threshold forces a split even where there's no water, which is exactly where the naive method's false alarms come from.
4. **Region growing:** start from pixels clearly darker than the threshold (3 dB below) and grow into connected dark pixels. This keeps the edges of real floods and drops isolated dark specks.
5. **False-alarm filters:** remove **permanent water** (rivers and lakes, from the JRC Global Surface Water map), clean small noise with **morphological filtering**, and drop anything **smaller than 2,000 m²**.
6. **Turn the result into polygons** and give each one an area, mean radar value, confidence, reason, location and severity tier.

**Tech stack:**

| Part | Technology |
|---|---|
| Engine | Python: NumPy, SciPy, scikit-image, Rasterio, GeoPandas, Shapely |
| Backend | **FastAPI**: `/api/health`, `/api/results` (measured accuracy), `/api/analyze/radar` (upload a Sentinel-1 GeoTIFF, get flood polygons back) |
| Web UI | HTML/JavaScript; runs fully offline |
| Tests | 14 automated tests (engine and API), all passing |

**Data:**

| Use | Data |
|---|---|
| This demo | Sen1Floods11: public, expert hand-labelled Sentinel-1 flood data; 68 Assam scenes |
| Training / calibration | Microsoft Planetary Computer, Sentinel-1 RTC: free, no account needed, archive up to April 2026 |
| Testing on 2026 floods | NASA OPERA RTC-S1: free NASA Earthdata login, current through 2026 |

---

## 5. Mapping to the five evaluation criteria

| Criterion | What to point at |
|---|---|
| **Innovation and originality** | Radar instead of optical, so it works in monsoon cloud; **none of the 9 earlier projects we surveyed has a working radar flood mode**. The false-alarm filter with a visible "raw → real" counter. A **reason and confidence on every polygon** |
| **Technical implementation** | Working engine plus FastAPI backend plus UI; 14 passing tests; accuracy **measured** against expert labels on held-out data (section 6), not estimated |
| **Impact and benefits** | Disaster authorities get flood extent **during** the monsoon, ranked by severity, with locations for field teams and a GeoJSON for their GIS. Free data, open software, runs on a laptop |
| **Problem relevance** | The statement asks to separate real change from false alarms: 129,765 raw detections become 1,477, with precision going from 19% to 79% |
| **Presentation** | Live swipe, the one-click filter toggle, the expert overlay |

---

## 6. Numbers cheat sheet (all measured; files in `eval/results/`)

**Assam, all 68 scenes** (`m8_sen1floods11_india.json`): flood IoU **0.175 → 0.41**, precision **0.187 → 0.791**, detections **129,765 → 1,477**, about 25 s on a CPU.

**Full dataset, official held-out splits** (`m8_sen1floods11_experiments.json`, 11 countries), flood IoU:

| Method | Test split (88 scenes) | Country never seen (Bolivia) | India test scenes |
|---|---|---|---|
| Naive | 0.14 | 0.34 | 0.27 |
| **Ours (default)** | **0.29** | **0.70** | **0.57** |

**Say (if asked about generalisation):** "We also tested on a country the system never saw, Bolivia. Our method reaches 0.70 overlap there, against 0.34 for the naive approach."

---

## 7. Likely questions and answers

**"Why radar and not normal satellite images?"**
Floods happen in the monsoon, under cloud. Optical satellites can't see through cloud; radar can, day and night.

**"Is this your model or someone else's?"**
The pipeline is ours: speckle filtering, one threshold per event, region growing, permanent-water removal, polygons with reasons and severity. We also trained a machine-learning classifier. It did better on countries it had seen, but worse on new places, so we kept the method that generalises.

**"How do you know it's accurate?"**
We compare against flood maps drawn by human experts (Sen1Floods11) and report overlap, precision and recall, including on a country the system never saw. Every number comes from a results file in the repo.

**"Why is recall lower than the naive method?"**
The naive method marks almost everything dark as water. That gives high recall but drowns you in false alarms (only 19% of its detections are real). We prioritise precision, so officers trust the alerts, and region growing recovers flood edges.

**"What can't it do?"**
It maps open flood water. Flooded crops and streets can look bright on radar and may be missed. This demo uses one date; the full version compares before and after images.

**"Can it work on today's floods?"**
Yes. The data is free: Microsoft Planetary Computer for historical calibration, and NASA OPERA for current Sentinel-1 data, available about 12 hours after the satellite passes.

**"How fast is it?"**
About 25 seconds for 68 scenes (about 1,800 km²) on a normal laptop CPU, with no GPU needed.

**"Who would use it?"**
State and district disaster management authorities, relief teams (via the Maps link) and GIS analysts (via the GeoJSON export).

---

## 8. What's next (if asked)

1. **Before/after comparison:** compare the flood-day radar with a dry-season image to separate new flooding from normal water.
2. **Testing on 2026 Indian floods** with NASA OPERA data, checked against Copernicus flood maps.
3. **Whole-scene processing:** fitting the threshold over a larger area measurably improves results.
4. **Optical change detection** for construction and encroachment (the other half of GEOAI 04), using the same false-alarm and polygon pipeline.
