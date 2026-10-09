# GEOAI 04 — Frontend Plan: the Android App

**Product:** an Android app where an officer or analyst picks an area (or uploads a before/after pair) and gets a map of what really changed, ranked by severity, with the noise filtered out. They can review each change on the spot and share the result.
**Module:** `app/` (Android Studio project, package `com.slothdevs.geoai`)
**Talks to:** the FastAPI backend in [`BACKEND_PLAN.md`](BACKEND_PLAN.md) (§5 API contract)
**Target:** Android 8.0+ (minSdk 26), targetSdk 35, tested on a real phone (Nothing Phone / Android 16) and the emulator
**Design philosophy:** map first · every number has a source · the false-alarm story is visible in one tap · works with one hand in the field
**Master doc:** [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) · **Overview:** [`README.md`](README.md)

---

## 1. Tech stack choice: Kotlin + Jetpack Compose + MapLibre Android

We compared the three options for **this** app:

| | **Kotlin (native)** ✅ | React Native | Flutter |
|---|---|---|---|
| Map engine | **MapLibre Android SDK**, first-party, full API: GeoJSON sources, fill/line layers, feature taps, camera control | `@maplibre/maplibre-react-native`, a wrapper that lags the native SDK | `maplibre_gl` plugin, the least mature; feature taps and multiple synced maps are fragile |
| Before/after swipe (two synced maps) | Two `MapView`s, the top one clipped by a draggable divider, cameras synced in a listener: straightforward | Possible, but camera sync crosses the JS bridge and lags | Hard: platform views + clipping + sync |
| File picker, downloads, share sheet, PDF viewer | Native APIs (Storage Access Framework, MediaStore, `Intent.ACTION_SEND`) | Several third-party packages | Several plugins |
| Release-build surprises | Few | Team hit real ones on Dhruva (asset loading broke only in release; Gradle/NDK pain) | New to the team |
| Team experience | **Dhruva was rewritten to Kotlin + MapLibre Android on mentor advice and shipped**, with its gotchas solved | Previous Dhruva version, abandoned | None |

**Decision: Kotlin.** The heavy work (GDAL, the BIT model) runs on the Python backend, so the app is a map-heavy viewer and reviewer. Native MapLibre is the most reliable way to render polygons and do the swipe compare, and the team has already shipped exactly this stack.

**Libraries:**

| Need | Library |
|---|---|
| UI | **Jetpack Compose** + Material 3 |
| Map | **MapLibre Android SDK** (in Compose via `AndroidView`) |
| Base map styles | OpenFreeMap `positron` (light) / `dark`. Same as Dhruva; avoids the known offline-pack crash with the MapLibre demo style |
| Networking | **Retrofit + OkHttp** (multipart upload with progress) + **kotlinx.serialization** |
| Async | Kotlin **Coroutines + Flow**; `ViewModel` per screen |
| Images (crops, previews) | **Coil** |
| Area drawing (A6) | Custom tap-to-add-vertex polygon on the map (no extra dependency) |
| Local storage | **DataStore** (settings, backend URL); job results cached as files in app storage; review status queued offline |
| Navigation | Navigation-Compose |
| Exports | **MediaStore** (save to Downloads), `FileProvider` + share sheet, system PDF viewer |
| Tests | JUnit + Turbine (ViewModels), Compose UI tests, MockWebServer |
| CI | GitHub Actions: `./gradlew testDebugUnitTest lint assembleDebug` |

---

## 2. What the app must make obvious

Within ten seconds an officer should be able to answer:

1. **What changed?** Polygons on the map.
2. **Which changes matter most?** Tier colours and the ranked list.
3. **How do you know it's real and not season or lighting?** The false-alarm toggle and the reason on each polygon.
4. **What do I do with it?** Confirm or dismiss it, navigate there, share the GeoPackage / PDF / field pack.

The flow is **choose input → progress → map → review → share**.

---

## 3. Requirements coverage

Every requirement in [`docs/PROJECT_PLAN.md` §2.3](docs/PROJECT_PLAN.md#23-what-the-expected-solution-asks-for) and every "winning" feature in §12 has a home in the app:

| Requirement / feature | Where in the app | Phase |
|---|---|---|
| R1 Accept a GeoTIFF pair | Upload screen: pick two `.tif` files (Storage Access Framework) | 2 |
| R2 Siamese or spectral detection | Mode chip (Auto / Spectral / Deep) | 2 |
| R3, R4 False-alarm suppression, clean-up | Raw vs filtered toggle and drop counts | 6 |
| R5, R6 Polygons with area, magnitude, centroid | Map layer, detail sheet, ranked list | 4, 5 |
| R7 Severity tiers | Tier colours + text label, tier filter, legend | 4, 6 |
| R8 Before/after split view | Swipe compare map | 4 |
| R9 GIS-ready export | Share GeoPackage / GeoJSON | 8 |
| Win 1 False-alarm toggle | Toggle on the map + animated counter | 6 |
| Win 2 Reason on every polygon | Detail sheet and list row | 5 |
| Win 3 Measured accuracy | Accuracy screen (`GET /metrics`) | 10 |
| Win 4 GIS proof | Share the GPKG to QGIS on the laptop or **QField** on the phone | 8 |
| Win 5 Analyst review | Confirm / dismiss, review tabs, confirmed-only export | 7 |
| Win 6 One-page report | PDF export, opened in the system viewer | 8 |
| Additions A1–A4, A6, A8–A11 | Layer import, zone chips, wards, field pack, area+date picker, review queue, presets, About sheet, report language | 3, 5, 7, 8, 9, 10 |

> The official GEOAI 04 text is still to be pasted into the master doc. Re-check this table against it once it is.

---

## 4. Screens

```
 ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
 │ GEOAI 04            │   │ ← Analysing         │   │ ≡  Pune East  [◉ F] │
 │                     │   │                     │   │ BEFORE  ┃  AFTER    │
 │ ┌─────────────────┐ │   │ ✓ Aligning          │   │         ┃ ▓▓  ▓     │
 │ │ ▶ Demo scenes   │ │   │ ✓ Detecting         │   │      ◀━━╋━━▶  ▓▓    │
 │ └─────────────────┘ │   │ ● Filtering   62%   │   │         ┃    ▓      │
 │ ┌─────────────────┐ │   │ ○ Vectorising       │   │ 412 raw → 37 real   │
 │ │ ⌖ Pick area +   │ │   │                     │   ├─────────────────────┤
 │ │   two dates     │ │   │ ⚠ After image was   │   │ ▔▔▔ (drag up)       │
 │ └─────────────────┘ │   │   resampled to the  │   │ 1 ■ 3,229 m² CRIT   │
 │ ┌─────────────────┐ │   │   before grid       │   │ 2 ■ 1,089 m² HIGH   │
 │ │ ⬆ Upload 2 TIFs │ │   │                     │   │ 3 ■   651 m² HIGH   │
 │ └─────────────────┘ │   │                     │   │ [All|Review|✓|✗]    │
 │ Recent runs ▸       │   │      [Cancel]       │   │ [Share ⬆]           │
 └─────────────────────┘   └─────────────────────┘   └─────────────────────┘
        Home                     Progress                 Result map
```
_Numbers in this mock-up are illustrative._

| Screen | Shows |
|---|---|
| **Home** | Three inputs: **Demo scenes** (always works offline), **Pick an area + two dates** (Sentinel-2, A6), **Upload two GeoTIFFs**; preset chip (Flood / Encroachment / Deforestation, A9); recent runs |
| **Area + dates** | A map where the user taps to draw an area, picks a before and an after date, and sees the scenes the backend chose (date, cloud %) before running |
| **Upload** | Two file slots (*Before*, *After*), file names and sizes, dates, mode chip, optional permits / no-build-zone layers (A1, A2) |
| **Progress** | Stage stepper (Aligning → Detecting → Filtering → Vectorising), percent, backend warnings, cancel |
| **Result map** | Full-screen swipe compare map, tier-coloured polygons, the **false-alarm toggle** with counter, legend, and a bottom sheet (summary → ranked list) |
| **Change detail** (bottom sheet) | Rank, tier, type, area, magnitude, confidence, centroid (copy), **reason**, before/after crops, zone/permit/ward chips, **Confirm / Dismiss**, **Navigate** (Google Maps intent) |
| **Filters** (sheet) | Tier and type chips, minimum-area slider, confidence slider; all applied live |
| **Share** (sheet) | GeoPackage, GeoJSON, PDF (language option), field pack CSV/KML; "confirmed only" switch |
| **About this result** | Model and version, thresholds, image dates, run time, seconds per km², input hashes (A10) |
| **Accuracy** | F1, IoU, precision, recall on the LEVIR-CD test split; false alarms per km² with the filter off and on; no-change test result (`/metrics`) |
| **Settings** | Backend URL (with a "test connection" button), light/dark theme, demo/offline mode |

---

## 5. Build phases

### Phase 1: Project skeleton, API client, offline demo mode
- **Implementation:**
  - Android Studio project (`app/`), Compose + Material 3, Navigation-Compose, light/dark theme.
  - `data/ApiService.kt` (Retrofit) with one function per backend endpoint; `data/model/` data classes written straight from the backend's response shapes (`Job`, `Summary`, `ChangeFeature`, `DemoScene`, `Metrics`).
  - **Demo/offline mode:** two demo scenes bundled in `assets/demos/` (previews + result GeoJSON + summary, produced by the backend). A `FakeRepository` serves them, so the whole demo path runs **with no network** and the UI is never blocked by the backend.
  - Settings screen with the backend URL (DataStore). For the live demo it points at the laptop on the same Wi-Fi (`http://192.168.x.x:8000`), with a `network_security_config` that allows cleartext only for local addresses.

### Phase 2: Home + upload
- **Implementation:**
  - Home with the three input cards and a "Demo data" badge on demo scenes.
  - Upload via the Storage Access Framework (`OpenDocument`, `.tif/.tiff`), with a size check and a warning on mobile data.
  - Multipart upload with a progress bar (OkHttp `RequestBody` wrapper); `POST /analyze` → `job_id`.

### Phase 3: Progress
- **Implementation:**
  - Poll `GET /jobs/{id}` every 1 s with a Flow; stage stepper + percent.
  - Store `job_id` in DataStore, so if the app is closed mid-run it resumes polling on reopen.
  - Show warnings inline (resampled grid, shift detected and corrected). If the backend rejects the pair (e.g. RGB at 10 m), show its reason in plain words and suggest the right mode.

### Phase 4: Result map with swipe compare (the core)
- **Implementation:**
  - Two stacked `MapView`s: **before** underneath, **after** on top, clipped to the right of a draggable divider (`clipBounds` updated on drag). The cameras are synced through `addOnCameraMoveListener`, with a guard against feedback loops.
  - Fallback if the swipe is unstable on a device: a single map with an **opacity slider** between before and after.
  - Before/after imagery as `ImageSource` layers from `/preview` (WebP + bounds).
  - Change polygons as one `GeoJsonSource`, drawn on both maps: `FillLayer` at 35% opacity plus a 2 px `LineLayer` in the tier colour. Tier is **also shown as text** in the list and detail sheet, never colour alone.
  - Fit to bounds on load; compass, scale bar, "my location" (useful for field teams standing at the site).

### Phase 5: Detail sheet + ranked list
- **Implementation:**
  - Tapping a polygon (`queryRenderedFeatures`) opens the **detail sheet** with the attributes, the reason, before/after crops (Coil, from `/crop`), chips and a **Navigate** button (`google.navigation:` intent).
  - Bottom sheet, collapsed: summary (changes, total area, **raw → filtered** counter, per-tier counts). Expanded: the ranked list. Tapping a row flies the camera to the polygon and opens its detail.

### Phase 6: The false-alarm toggle + filters (the demo moment)
- **Implementation:**
  - A toggle on the map. **Off** loads `/result?filtered=false` and draws it in grey, so the noise is obvious. **On** shows the filtered polygons in tier colours. Both layers are cached after the first load, so the toggle is instant.
  - The counter animates between the two numbers.
  - Filter sheet (tier, type, minimum area, confidence) applies MapLibre **filter expressions** on the layer, live with no network.

### Phase 7: Analyst review
- **Implementation:**
  - Confirm ✓ / Dismiss ✗ in the detail sheet, plus swipe actions on list rows. `PATCH /jobs/{id}/features/{fid}` with an optimistic update.
  - **Offline-tolerant:** if there is no network (common in the field), queue the change in a local file and sync when back online. Show a "2 changes waiting to sync" chip.
  - List tabs: *All · Needs review · Confirmed · Dismissed* ("Needs review" = mid-confidence, A8).

### Phase 8: Share and export
- **Implementation:**
  - Share sheet: GeoPackage, GeoJSON, PDF report (English or English + Hindi, A11), field pack (CSV/KML, A4), with a "confirmed only" switch.
  - Files are downloaded from `GET /jobs/{id}/export` and saved to Downloads (MediaStore), then shared through the Android share sheet (WhatsApp, email, Drive, **QField**) or opened (PDF in the system viewer).
  - File names include the scene and dates, e.g. `geoai04_pune-east_2025-03_2026-03.gpkg`.

### Phase 9: Area + dates picker and context layers (additions)
- **Implementation:**
  - **Pick an area + two dates** (A6): tap on the map to place polygon vertices (undo, clear), pick two dates, then call `POST /fetch-s2`. Show the scenes the backend chose (date, cloud %) before starting. **This is the main input on a phone**, since officers rarely have GeoTIFFs on their device.
  - Optional import of a permits layer (A1) or a no-build-zone layer (A2) as GeoJSON/KML from the device; chips in the detail sheet (`authorised` / `unauthorised`, `inside lake buffer`).
  - **Ward/village** chip and a *group by ward* switch in the list (A3).
  - Preset chip on Home (A9).

### Phase 10: About, accuracy, polish
- **Implementation:**
  - **About this result** sheet (audit sidecar, A10) and the **Accuracy** screen (`/metrics`), so judges see measured accuracy inside the app.
  - Light/dark map styles + Material 3 dynamic colour; spring animations on sheets; skeleton loaders.
  - App icon, splash screen, release signing, a `assembleRelease` APK for the demo phone.

---

## 6. Project structure

```
app/src/main/java/com/slothdevs/geoai/
├── MainActivity.kt
├── GeoAiApp.kt                     ← NavHost, theme
├── data/
│   ├── ApiService.kt               ← Retrofit interface (BACKEND_PLAN §5)
│   ├── model/                      ← Job, Summary, ChangeFeature, DemoScene, Metrics
│   ├── Repository.kt               ← interface
│   ├── RemoteRepository.kt         ← real backend
│   ├── FakeRepository.kt           ← bundled demo scenes (offline)
│   ├── ReviewQueue.kt              ← offline confirm/dismiss queue
│   └── SettingsStore.kt            ← DataStore
├── ui/
│   ├── home/  upload/  areapicker/  progress/
│   ├── result/                     ← ResultScreen, CompareMap, ChangeSheet, FilterSheet, ShareSheet
│   ├── about/  accuracy/  settings/
│   └── theme/
└── util/                           ← file save/share, formatting (m², ha, coords)
app/src/main/assets/demos/          ← two demo scenes (previews + results)
```

---

## 7. UX rules

- **Trust first.** Every number comes from the backend (or the bundled demo results), never hardcoded in UI code. Show the *reason* for every polygon. Label estimates as estimates.
- **Never present demo data as a live run.** The "Demo data" badge is always visible on demo scenes.
- **Every screen has a state** for loading, empty ("no change found — that's a result too"), error and backend-unreachable (with "try a demo scene").
- **Field-friendly:** large touch targets (≥ 48 dp), one-hand reach for the main actions (bottom sheet, toggle), readable in sunlight (high contrast), works with patchy network (cached results, review queue).
- **Accessibility:** colour is never the only signal (tier text), contrast ≥ 4.5:1, TalkBack labels on map controls and list rows.
- **Units:** m² with thousands separators; hectares in brackets for large areas; coordinates to 6 decimals.

---

## 8. Known risks for the app

| Risk | Mitigation |
|---|---|
| Venue Wi-Fi blocks the phone from reaching the laptop backend | Offline demo mode with bundled results; a phone hotspot as backup |
| Large GeoTIFF uploads from a phone are slow | Area + dates picker as the main phone input; upload is for small clips; the backend sends small WebP previews |
| Two synced `MapView`s are heavy on low-end phones | Opacity-slider fallback; previews capped at 2048 px |
| MapLibre offline-pack crash with the demo style (seen on Dhruva) | Use OpenFreeMap styles only |
| Release build differs from debug | Build and install `assembleRelease` on the demo phone early, and rehearse on that build |

---

## 9. Demo path to keep working (about 3 minutes)

Open the **encroachment** demo → progress stages → map appears → **toggle the filter off (noise) / on (clean)** → drag the swipe divider over the top critical polygon → tap it (reason, crops, *inside lake buffer*) → **Confirm** → **Share → GeoPackage** (opened in QGIS on the laptop, or QField on the phone) → switch to the **flood** demo → share the PDF and the field pack → open **Accuracy**.

Rehearse this exact path on the **release APK**, with Wi-Fi on **and** off.

---

## 10. Definition of done

- [ ] Demo, area+dates and upload inputs all reach the result map; progress shows every backend stage and resumes after the app is reopened.
- [ ] Swipe compare, tier colours, detail sheet and ranked list work and stay in sync.
- [ ] The raw/filtered toggle and filters update instantly; the counter is correct.
- [ ] Confirm/dismiss persists (including offline queueing), and "confirmed only" exports respect it.
- [ ] All exports save to Downloads and share through the share sheet; the GPKG opens in QGIS/QField.
- [ ] About and Accuracy screens show real values from the backend.
- [ ] Loading, empty and error states exist on every screen; works in light and dark.
- [ ] `testDebugUnitTest`, `lint` and `assembleDebug` green in CI; the release APK is installed and rehearsed on the demo phone.
