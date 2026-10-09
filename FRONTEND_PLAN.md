# GEOAI 04: Frontend Plan, the Web App

**Product:** a website where an officer or analyst opens a disaster or encroachment scene (or uploads a before/after pair) and sees a **before/after swipe map** of what really changed, ranked by severity, with the false alarms filtered out, an **impact summary** (hectares, cropland, buildings, roads) and one-click exports.
**Module:** `web/` (Vite + React + TypeScript)
**Talks to:** the FastAPI service in [`BACKEND_PLAN.md`](BACKEND_PLAN.md) §6, **but works without it** for the demo scenes (static files in `web/public/demos/`).
**Hosting:** Vercel. **Deadline:** 10:00, 10 October 2026 ([`docs/TASK_SPLIT.md`](docs/TASK_SPLIT.md)).
**Design philosophy:** map first · every number has a source · the false-alarm story is visible in one click · usable on a laptop projector **and** on a phone browser.
**Master doc:** [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) · **Overview:** [`README.md`](README.md)

> **What changed from the earlier plan.** The Android app is dropped. The official statement asks for an interactive split-view **web** map, a website is the fastest thing to deploy and share with judges, and the team already built a React + MapLibre app on PS_121.

---

## 1. Tech stack

| Need | Choice | Why |
|---|---|---|
| Framework | **React 19 + Vite + TypeScript** | Fast to build and deploy; the team has used it |
| Styling | **Tailwind CSS** | Quick, consistent UI |
| Map | **MapLibre GL JS** | Open source, no API key, polygon fills and **filter expressions** run live in the browser; already used in PS_121 |
| Swipe compare | **`@maplibre/maplibre-gl-compare`** (two synced maps and a divider) | The standard solution; fallback: opacity slider |
| Base map | OpenFreeMap styles (`positron`, `dark`) | No key or billing |
| Data fetching | **TanStack Query** | Caching, retries, loading and error states |
| UI state | **Zustand** | Filters, selected feature, toggle state |
| Routing | **React Router** | Few routes |
| Charts | Small inline SVG or **Recharts** for tier and type bars | Light |
| Tests | **Vitest** + Testing Library; **Playwright** for one smoke test | See §7 |
| Lint / format | ESLint + Prettier (or oxlint as in PS_121) | CI gate |
| Deploy | **Vercel**, root directory `web/` | Free, preview URLs per push |

---

## 2. What the site must make obvious (within ten seconds)

1. **What changed?** Polygons on a swipe map.
2. **Which changes matter most?** Tier colours (plus tier text) and a ranked list.
3. **How do we know it's real and not season or lighting?** The false-alarm toggle ("412 raw → 37 real") and the reason on each polygon.
4. **So what?** The impact panel: hectares changed, **cropland affected**, buildings and road segments touched, each with its data source.
5. **What do I do with it?** Download GeoPackage, GeoJSON, PDF or the field pack; open it in QGIS.

---

## 3. Requirements coverage

| Requirement / feature | Where on the site | Phase |
|---|---|---|
| Interactive before/after split-view map | Result page, swipe compare | F2 |
| Severity-tiered polygons | Map layer, legend, ranked list, tier filter | F2, F3 |
| Area, magnitude, centroid per polygon | Detail panel and list rows | F3 |
| GIS-ready export | Export menu (GPKG, GeoJSON, PDF, CSV/KML) | F5 |
| False alarms separated from real change | Raw/filtered toggle with animated counter and drop counts | F3 |
| Reason on every polygon | Detail panel and list row | F3 |
| Measured accuracy | Accuracy page (`eval/results.json`) | F6 |
| Impact numbers | Impact panel | F4 |
| Analyst review | Confirm / dismiss, "confirmed only" export | F5 |
| Live analysis | Upload two GeoTIFFs, progress, result | F6 |

---

## 4. Pages

```
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │ GEOAI 04 · Change that matters           [Scenes] [Analyse] [Accuracy] [About]│
 ├───────────────────────────────────────────────┬──────────────────────────────┤
 │   BEFORE 2023-08-20  ┃  AFTER 2023-09-18      │ 412 raw → 37 real   [filter ◉]│
 │                      ┃   ▓▓      ▓            │  IMPACT                       │
 │                   ◀━━╋━━▶   ▓▓▓                │  1,240 ha changed             │
 │                      ┃      ▓                  │  310 ha cropland · 85 bldgs   │
 │                      ┃                         │  [Tier ▾][Type ▾][Min area]   │
 │  legend ■crit ■high ■med ■low                  │  1 ■ 3,229 m² CRITICAL  ✓ ✗   │
 │                                                │  2 ■ 1,089 m² HIGH            │
 └───────────────────────────────────────────────┴──────────────────────────────┘
```
_Numbers in this mock-up are illustrative._

| Route | Shows |
|---|---|
| `/` **Scenes** | Hero line, three scene cards (flood, encroachment, season control) with thumbnails, event, dates, mode, and a "Demo data" badge; a "Try your own" card |
| `/scene/:id` **Result** | Swipe map, false-alarm toggle with counter, legend, side panel with summary, **impact**, filters and ranked list; clicking a polygon opens the **detail card** (rank, tier, type, area, magnitude, confidence, centroid, **reason**, before/after crops, Confirm / Dismiss, link to Google Maps); **Export** menu |
| `/analyse` **Analyse** | Two file slots (Before, After), mode and preset selector, upload with progress, stage stepper (Aligning → Detecting → Filtering → Vectorising), warnings from the backend, then the same Result page for the job; shows a clear "backend is waking up" state |
| `/accuracy` **Accuracy** | Table from `/metrics`: precision, recall, F1, IoU on the held-out OSCD test cities for **naive, spectral and learned**; false alarms per km² with filter off and on; the unseen no-change result; seconds per km². Footnote with seed, commit and dataset split |
| `/about` **About** | How it works in four steps, data sources and licences, limits and honest caveats (what it does not do; why it cannot find people) |

**Header banner:** whenever a demo scene is shown, a "Demo data (precomputed)" badge is visible. Live results show "Live analysis".

---

## 5. Data flow

```
Scene page ──► fetch /demos/<id>/summary.json, result_filtered.geojson, result_raw.geojson, before.webp, after.webp
                   (static files in the build; fall back order: static → API)
Analyse page ─► POST /analyze → poll GET /jobs/{id} → same fetches from /jobs/{id}/...
Accuracy page ─► GET /metrics, fall back to a static copy of eval/results.json
```

- One `useScene(source, id)` hook returns the same shape for demos and live jobs, so the Result page does not care where data came from.
- A typed API client in `web/src/lib/api.ts`; types mirror the backend's `summary` and feature properties.
- If `VITE_API_URL` is missing or the API times out, hide the Analyse page behind a "Live analysis is offline, try the demo scenes" message. **No page may show a blank screen.**

---

## 6. Build phases

### F1: Skeleton and mock data
- Vite + React + TS + Tailwind, router, layout, theme, CI job (`lint`, `typecheck`, `test`, `build`).
- Copy the first static demo folder (or a hand-made fixture with the **same schema**) into `web/public/demos/`. **Use the frozen contract from the kickoff so the frontend is never blocked by the backend.**
- **Done when:** `npm run build` works and Vercel shows the skeleton.

### F2: Swipe map
- Two MapLibre maps synced through the compare plugin; before and after as image sources with bounds; fit to bounds; basemap beneath.
- Polygon layer (35 % fill + 2 px outline in the tier colour) on the after map.
- Fallback: a single map with an opacity slider if the compare plugin misbehaves on mobile.
- **Done when:** swiping works on a laptop and a phone browser with a real demo scene.

### F3: Polygons, toggle, list, detail
- Ranked list from the GeoJSON; click a row → fly to the polygon and open the detail card; click a polygon → same.
- **False-alarm toggle:** off shows `result_raw.geojson` in grey, on shows the tiered layer; counter animates between `raw_detections` and `after_filter`; the drop counts appear on hover.
- Filter bar (tier, type, minimum area, confidence) applied as MapLibre filter expressions and list filters, live and offline.
- Reason, magnitude, area, centroid (with a copy button), crops.
- **Done when:** the whole demo path in §9 works.

### F4: Impact panel
- Cards for hectares changed, **cropland affected**, buildings, road segments, with source labels from `summary.impact.sources`; tier and type bars.
- Empty states: "No cropland data for this area" rather than zero.

### F5: Review and export
- Confirm / dismiss with local state (persist in `localStorage` for demo scenes, `PATCH` for live jobs); tabs *All · Needs review · Confirmed · Dismissed*.
- Export menu: for demo scenes link to prebuilt files in `public/demos/<id>/exports/`; for live jobs call `/jobs/{id}/export`. A "confirmed only" switch.

### F6: Analyse, Accuracy, About
- Upload flow with progress and stage stepper; Accuracy page; About page with the caveats.
- Accessibility pass (keyboard focus on the toggle and list, tier shown as text, contrast ≥ 4.5:1).

### F7 *(stretch)*
- Draw-an-area + dates picker calling `/fetch-s2`; permits and no-build-zone layer upload; Hindi labels for the PDF button; dark mode.

---

## 7. Tests

| Type | What |
|---|---|
| **Unit (Vitest)** | Tier → colour and label mapping; area formatting (m², hectares, thousands separators); filter functions (tier, type, minimum area, confidence); the raw/filtered counter logic; GeoJSON parsing and required-property validation; `useScene` fallback order (static → API → error) |
| **Component (Testing Library)** | Result page renders list and legend from a fixture; the toggle switches datasets and updates the counter; the detail card shows the reason; Confirm updates the list tab; Accuracy page renders a table from a fixture; the offline state of the Analyse page |
| **E2E (Playwright, one smoke test)** | Open `/`, open the flood scene, the map container and swipe handle exist, toggle the filter and check the counter text changes, open Export and see the GPKG link, open `/accuracy` and see the F1 column. Runs against `vite preview` in CI |
| **Quality gates** | `eslint`, `tsc --noEmit`, `vitest run`, `vite build`, all in CI |

MapLibre needs WebGL, which jsdom lacks: **mock `maplibre-gl` in unit tests** and test the real map only in Playwright (headless Chromium with SwiftShader).

---

## 8. Project structure

```
web/
├── index.html  vite.config.ts  package.json  tailwind.config.ts
├── public/demos/<id>/…                 ← static demo data (BACKEND_PLAN §8)
└── src/
    ├── main.tsx  App.tsx  routes.tsx
    ├── lib/        api.ts  types.ts  tiers.ts  format.ts  filters.ts
    ├── hooks/      useScene.ts  useJob.ts
    ├── store/      filters.ts  review.ts          ← Zustand
    ├── components/
    │   ├── map/        CompareMap.tsx  PolygonLayer.tsx  Legend.tsx
    │   ├── panel/      Summary.tsx  ImpactPanel.tsx  FilterBar.tsx  ChangeList.tsx  ChangeCard.tsx
    │   ├── ExportMenu.tsx  DemoBadge.tsx  StageStepper.tsx
    └── pages/      Scenes.tsx  Result.tsx  Analyse.tsx  Accuracy.tsx  About.tsx
```

---

## 9. Demo path to keep working (about 3 minutes)

Open the **live URL** → pick the **flood scene** → swipe the divider → toggle the false-alarm filter **off (noise) / on (clean)** and watch the counter → open the **impact panel** ("310 ha of cropland, 85 buildings", with sources) → click the top critical polygon (reason, crops) → **Confirm** → **Export GeoPackage** and open it in **QGIS** on the laptop → switch to the **encroachment** scene → open **Accuracy** (held-out numbers: naive vs spectral vs learned) → open the **season control** scene, where the filter leaves almost nothing.

Rehearse this path on the **deployed** site, on a phone browser and on a laptop with throttled network, and keep a screen recording as the last-resort backup.

---

## 10. UX rules

- **Trust first.** Every number comes from the data files, never hard-coded in a component. The reason is shown for every polygon. Estimates are labelled as estimates, with a source.
- **Never present demo data as live.** The badge is always visible.
- **Every page has loading, empty, error and backend-offline states.**
- **Do not claim what the data cannot show.** The About page states that 10 m satellite imagery cannot detect people, and that the site prioritises where to look.
- **Accessibility:** colour is never the only signal; contrast ≥ 4.5:1; keyboard-operable toggle and list.
- **Units:** m² with separators; hectares for large areas; coordinates to 6 decimals.

---

## 11. Known risks

| Risk | Mitigation |
|---|---|
| The API Space is asleep or fails during judging | Static-first demo data; the Analyse page degrades gracefully |
| Swipe compare is unstable on mobile | Opacity-slider fallback built in F2 |
| Large GeoJSON makes the map slow | The raw layer is simplified and capped by the backend; load it only when the toggle is switched off |
| WebGL missing in CI | Mock `maplibre-gl` in unit tests; Playwright uses headless Chromium |
| Vercel build differs from local | Deploy a skeleton in F1 and redeploy on every merge |

---

## 12. Definition of done

- [ ] The three demo scenes load from static data on the deployed URL, with the API off.
- [ ] Swipe compare, tier colours, detail card and ranked list work and stay in sync.
- [ ] The raw/filtered toggle and filters update instantly and the counter is correct.
- [ ] The impact panel shows real values with sources for the flood scene.
- [ ] Confirm / dismiss works and "confirmed only" exports respect it.
- [ ] Exports download; the GPKG opens in QGIS.
- [ ] Accuracy page shows the real held-out numbers; About page states the limits.
- [ ] Loading, empty and error states exist on every page.
- [ ] `eslint`, `tsc`, `vitest`, `vite build` and the Playwright smoke test are green in CI.
- [ ] The live URL is in the README and works on a phone.
