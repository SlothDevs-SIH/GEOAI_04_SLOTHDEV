# GEOAI 04 — Frontend & UI/UX Plan

**Product:** a web app where an analyst uploads a before and an after image and gets a map of what really changed, ranked by severity.
**Folder:** `web/` · **Talks to:** the FastAPI backend in [`BACKEND_PLAN.md`](BACKEND_PLAN.md) (§5 API contract)
**Stack:** React + TypeScript (Vite) · **MapLibre GL JS** · `@maplibre/maplibre-gl-compare` (swipe) · Tailwind CSS · Turf.js (client-side filters)
**Design philosophy:** map first · every number has a source · the false-alarm story is visible in one click
**Master doc:** [`README.md`](README.md) (problem, solution, results, additions)

---

## 1. What the UI must make obvious

Within ten seconds a GIS analyst or a district officer should be able to answer:

1. **What changed?** Polygons on the map.
2. **Which changes matter most?** Tier colours and the ranked list.
3. **How do you know it's real and not season or lighting?** The false-alarm toggle and the reason on each polygon.
4. **What do I do with it?** Export to QGIS, the PDF report, the field pack.

It is not a chatbot or a dashboard of charts. The flow is **upload → progress → map → review → export**.

---

## 2. Build against mocks first

- One API file, `web/src/lib/api.ts`, with one function per backend endpoint (§5 of the backend plan).
- A **mock mode** returns the real GeoJSON produced by `prototype/pipeline.py` (`changes_all.geojson`, `summary.json`). This means the UI is never blocked by the backend.
- Switching to the real API is one setting: `VITE_API_BASE`. If it's empty, mocks are used.
- TypeScript types are written straight from the backend's response shapes: `Job`, `ChangeFeature`, `Summary`, `DemoScene`.

---

## 3. Screen layout

```
┌───────────────────────────────────────────────────────────────────────────┐
│ TOP BAR  [Scene ▾] [Preset ▾]  [False-alarm filter ◉]  [⬇ GPKG][⬇ GeoJSON][⬇ PDF][⬇ Field pack] │
├──────────────┬──────────────────────────────────────────┬─────────────────┤
│ LEFT PANEL   │               MAP (swipe)                │ RIGHT PANEL     │
│ Summary      │   BEFORE        ┃        AFTER           │ Ranked changes  │
│ Filters      │                 ┃◀▶   polygons by tier  │ click → fly to  │
│ Legend       │                 ┃     popup on click     │ needs-review tab│
└──────────────┴──────────────────────────────────────────┴─────────────────┘
```

On phone width the side panels become bottom sheets (summary sheet, list sheet). The map stays full screen.

---

## 4. Build phases

### Phase 1: App shell + upload / demo picker
- **Implementation:**
  - Landing card with two paths: **"Try a demo scene"** (encroachment, flood) and **"Upload your own"** (two GeoTIFF drop zones labelled *Before* and *After*, plus the date of each).
  - Client-side checks before upload: `.tif/.tiff` only, file size limit (show it), both files present.
  - Mode selector: `Auto` (default), `Spectral (Sentinel-2)`, `Deep (high-res)`, with a one-line hint each.
  - A clear **"Demo data"** badge whenever a preloaded scene is shown.

### Phase 2: Job progress
- **Implementation:**
  - `POST /analyze` → `job_id`, then poll `GET /jobs/{id}` every 1 s.
  - A stage stepper: **Aligning → Detecting → Filtering → Vectorising → Done**, with a progress bar.
  - Show warnings returned by the backend inline (e.g. "after image resampled to before grid", "shift of 1.4 px detected and corrected").
  - Error state with the backend's message and a "try a demo scene" fallback.

### Phase 3: Split-view map (the core)
- **Implementation:**
  - Two synchronised MapLibre maps inside `maplibre-gl-compare`, with a draggable swipe divider: before on the left, after on the right.
  - Base imagery served as image overlays (PNG/WebP previews from the backend). Use TiTiler XYZ tiles if the backend enables it.
  - Change polygons as one GeoJSON source, drawn on **both** maps: fill at 35% opacity, 2 px outline in the tier colour.
  - Tier colours: critical `#b5179e`, high `#e03131`, medium `#f08a24`, low `#f2c744`. **Tier is also shown as text and pattern**, never colour alone.
  - Auto fit-to-bounds on load. Scale bar, north arrow / compass.

### Phase 4: Popup + ranked list
- **Implementation:**
  - **Click popup:** rank, tier chip, change type, area (m², plus hectares when ≥ 10,000 m²), magnitude, centroid lat/lon (copy button), **reason** text, before/after crops of that polygon (from the backend), and a Google Maps link.
  - **Right panel:** list sorted by score, with tier chip, area and type. Clicking a row flies the map to the polygon and opens its popup. Hovering a row highlights the polygon.
  - Keyboard: ↑/↓ moves through the list, Enter opens it.

### Phase 5: Summary + live filters (left panel)
- **Implementation:**
  - Totals: number of changes, total changed area, and the **"N raw detections → M after filtering"** counter.
  - A count per tier and a count per type (built-up gain, vegetation loss, water gain, other).
  - Tier and type checkboxes, a **minimum-area slider**, and a confidence slider. All of them filter the map and the list **live on the client** (no round trip).

### Phase 6: The false-alarm toggle (the demo moment)
- **Implementation:**
  - A toggle in the top bar. **Off** shows the raw detections layer (`/result?filtered=false`), drawn in grey so the noise is obvious. **On** shows the filtered polygons in tier colours.
  - Animate the counter between the two numbers when toggled.
  - Load both layers once and cache them, so the toggle is instant during the demo.

### Phase 7: Analyst review
- **Implementation:**
  - **Confirm ✓ / Dismiss ✗** buttons in the popup and on each list row. They call `PATCH /jobs/{id}/features/{fid}`, with an optimistic UI update.
  - List tabs: *All · Needs review · Confirmed · Dismissed*. "Needs review" shows mid-confidence polygons (addition A8).
  - The export menu has a **"Confirmed only"** checkbox.

### Phase 8: Exports
- **Implementation:**
  - Buttons for GeoPackage, GeoJSON, PDF report and field pack (CSV/KML). Each one hits `GET /jobs/{id}/export?format=...`.
  - The file name includes the scene and date, e.g. `geoai04_pune-east_2025-03_2026-03.gpkg`.

### Phase 9: Use-case presets + context layers (additions)
- **Implementation:**
  - **Preset dropdown** (A9): *Flood response*, *Encroachment*, *Deforestation*. It sets the mode, minimum area, visible types and tier thresholds, then re-runs.
  - **Optional upload** of a permits layer (A1) or a no-build-zone layer (A2). Show the result as extra chips in the popup: `authorised` / `unauthorised`, `inside lake buffer`.
  - **Ward/village** name in the popup and a *group by ward* switch in the list (A3).

### Phase 10: Light & dark theme, polish
- **Implementation:**
  - Light by default, with a dark toggle (☀️/🌙). Base map styles: OpenFreeMap `positron` (light) / `dark`.
  - Spring animations on panels and the popup; skeleton loaders on lists.
  - An "About this result" drawer: model and version, thresholds, image dates, run time, input hashes (from the audit sidecar, A10).

---

## 5. UX rules

- **Trust first.** Every number comes from the API, and none are hardcoded in components. Show the *reason* for every polygon. Label estimates as estimates.
- **Never present demo or mock data as a live run.** The "Demo data" badge is always visible on demo scenes.
- **Every screen has a state** for loading, empty ("no change found — that's a result too"), error and backend-unavailable.
- **Accessibility:** colour is never the only signal (tier text + pattern), contrast ≥ 4.5:1, keyboard navigable, focus visible.
- **Units:** always m² with thousands separators; hectares in brackets for large areas; coordinates to 6 decimals.
- **The demo must work offline.** Bundle the two demo scenes' previews and results so mock mode runs with Wi-Fi off.

---

## 6. Component map

| Component | Responsibility |
|---|---|
| `UploadCard` | Demo picker, two drop zones, dates, mode |
| `JobProgress` | Stage stepper, warnings, errors |
| `CompareMap` | Two synced maps, swipe, imagery overlays, change layers |
| `ChangePopup` | Attributes, reason, crops, review buttons |
| `RankedList` | Sorted list, tabs, fly-to, keyboard nav |
| `SummaryPanel` | Totals, raw→filtered counter, tier/type counts, filters |
| `FilterToggle` | Raw vs filtered switch with the animated counter |
| `ExportMenu` | Formats, confirmed-only option |
| `PresetSelect`, `LayerUpload` | Additions A9, A1/A2 |
| `lib/api.ts`, `lib/mocks/` | API client and mock fixtures |

---

## 7. Demo path to keep working (about 3 minutes)

Pick the **encroachment** demo → watch the progress stages → map appears → **toggle filter off (noise) / on (clean)** → swipe over the top critical polygon → open its popup (reason, crops, *inside lake buffer*) → **Confirm** → export the GeoPackage (opened in QGIS by the presenter) → switch to the **flood** demo → download the PDF and field pack.

Rehearse this exact path on the deployed build **and** in offline mock mode.

---

## 8. Definition of done

- [ ] Upload and demo paths both reach the map; progress shows every backend stage.
- [ ] Swipe map, tier colours, popup and ranked list work and stay in sync.
- [ ] Filters and the raw/filtered toggle update instantly; the counter is correct.
- [ ] Confirm/dismiss persists, and "confirmed only" exports respect it.
- [ ] All four exports download with sensible file names.
- [ ] Loading, empty and error states exist on every view; it works at phone width.
- [ ] Mock mode runs the full demo path with the network off.
