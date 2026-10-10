# Lazy loading plan (for Ayush's Claude Code)

Goal: the site loads fast on a weak phone and a slow connection. Today the first visit downloads **about 39 MB** in the background. After this work it downloads **about 3 MB**, and each scene's data downloads when someone opens it (or when they press "Save for offline").

Context: Grid AI's founder suggested loading data chunk by chunk instead of everything at once, and the judges asked us to make the tech visible and the site dependable. This plan covers the **website only**. Tiled analysis of large areas is a separate, larger project (see section 8).

Work on a branch off `main` (use `lazy-loading`). Do not push to `main`; Soham merges. Keep the commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

## 1. Measured baseline (production build, 10 Oct 2026)

`npm run build` reports **precache 899 entries (39,022 KiB)**. Breakdown of `web/dist`:

| What | Size | Files | When it is really needed |
|---|---|---|---|
| App shell (JS, CSS, HTML, icons, manifest) | 2.8 MB | 11 | Always |
| `sens.bin` (sensitivity lab data) | 14.9 MB | 8 | Only if the user scrolls to the lab |
| `*.geojson` (filtered + raw polygons) | 10.0 MB | 18 | Filtered: when the scene opens. Raw: only when the false-alarm filter is switched off |
| `variants/` (learned and hybrid results) | 6.9 MB | 30 | Only if the user switches detector |
| before/after `*.webp` | 2.1 MB | 18 | When the scene opens |
| `crops/` (before/after crop of each top change) | 1.8 MB | 744 | One at a time, when a change is selected |
| small JSON (`meta`, `summary`, `sens.json`, `index`) | 0.1 MB | 37 | When the scene opens |
| `exports/` (PDF, GPKG, CSV...) | 7.2 MB | 68 | Already **not** precached (good) |

So only the app shell (2.8 MB) is needed on the first visit. A single scene needs about 1 MB to open.

Why it hurts: on the first visit the service worker (`web/vite.config.ts`, `VitePWA`, `workbox.globPatterns`) downloads all of it. Measured locally the worker takes about 19 s to become active (up to 60 s under load), which also makes `web/e2e/offline.spec.ts` flaky. On mobile data or college wifi it competes with the page the judge is actually looking at.

## 2. Target

| Measure | Now | Target |
|---|---|---|
| Bytes on first visit (home page + service worker install) | ~40 MB | **under 5 MB** |
| Service worker active (local preview, no throttling) | ~19 s | **under 5 s** |
| Opening a scene for the first time | already cached | one scene's files only (about 1-2 MB), shown with a loading state |
| Opening a scene a second time | instant | instant (served from cache) |
| Offline | every scene | scenes the user has opened or pressed "Save for offline" on; the others say so plainly |

## 3. Design

1. **Precache the shell only.** Change `workbox.globPatterns` so it matches the app (`js, css, html, png` in the root and `assets/`, `manifest`, `demos/index.json`) and **excludes `demos/*/**`**. Keep `navigateFallback: "index.html"`. Keep `maximumFileSizeToCacheInBytes` (still needed for the JS bundle).
2. **Cache scene files when they are first used** with Workbox `runtimeCaching` (declared in `vite.config.ts`):
   - `demos/<id>/*.json`, `*.geojson`: `StaleWhileRevalidate`, cache `demo-scenes-v1`.
   - `demos/<id>/*.webp`, `*.bin`, `crops/*`, `variants/*`: `CacheFirst`, same cache, `ExpirationPlugin` with `maxEntries: 1500`.
   - `/api/*`, `/jobs/*`, `/fetch-s2*`, map tiles: **never cached** (as today).
   Bump the cache name (`demo-scenes-v2`...) whenever demo data is regenerated, and add that to `docs/DEPLOY.md` (otherwise `CacheFirst` serves stale images).
3. **"Save for offline" button** (the replacement for "everything is offline by default"):
   - Emit `demos/<id>/files.json` listing every file of the scene (a small Python step in `scripts/`, run after `scripts/export_demo_assets.py`; or a Vite plugin at build time). Include the variants and the top crops.
   - A button on each result page and on each scene card: fetches the files with `cache.addAll` into `demo-scenes-v1`, shows progress ("12 of 60 files"), then a "Saved for offline" state. Add a "Save all scenes" action on the Scenes page behind an explicit click.
   - Respect `navigator.connection?.saveData`: never start a background download when it is true.
4. **Do not load what is not on screen.**
   - `SensitivityLab`: load `sens.json` and `sens.bin` (up to 1.7 MB each scene) only when the lab card scrolls near the viewport (`IntersectionObserver`, `rootMargin: "300px"`), not when the page mounts. Keep the skeleton while it loads.
   - Raw polygons (`result_raw.geojson`, up to 1.1 MB) already load only when the filter is switched off (`useRaw`): keep it that way, and add a test that proves it.
   - Variants already load on demand (`useScene`): keep it.
5. **Friendly offline behaviour for scenes that are not saved.** If a scene's files fail to load while offline, show an `ErrorState` that says "This scene was not saved for offline use. Connect to the internet, or open it once while online." with a button to the Scenes page. No blank page, no raw `fetch` error.
6. **Optional, only after 1-5 pass: nearest scene first.** On the Scenes page, if the user taps "Near me" (browser location, asked only on that tap), sort the scene cards by distance and prefetch the nearest scene's files when the browser is idle (`requestIdleCallback`, not on `saveData`, not on 2G). Never ask for location on page load, and never send the location anywhere: the distance is computed in the browser from `meta.corners`.

## 4. Steps (do them in this order; commit after each)

| # | Step | Files | Done when |
|---|---|---|---|
| 0 | Show the real size limit. Expose `max_side_km` in `/health` and make the Analyse page use it instead of the constant 15. The live host is set to 6 km, so today the page says "up to 15 km" and the server then refuses | `api/main.py` (`health`), `web/src/lib/aoi.ts`, `web/src/components/analyse/OfflineNotice.tsx`, `web/src/pages/Analyse.tsx`, their tests | On a server with `MAX_SIDE_KM=6` the page says 6 km and the box validation uses 6; with no server it falls back to 15 |
| 1 | Shell-only precache + runtime caching | `web/vite.config.ts` | `npm run build` reports a precache under 4 MB; `dist` unchanged otherwise |
| 2 | Loading and error states for a scene that cannot load | `web/src/pages/Result.tsx`, `web/src/hooks/useScene.ts` | Offline + unvisited scene shows the friendly message; visited scene still opens |
| 3 | Lazy sensitivity lab | `web/src/components/panel/SensitivityLab.tsx` (+ its test) | No `sens.*` request until the lab is near the viewport |
| 4 | `files.json` per scene + "Save for offline" (scene page, then "Save all" on the Scenes page) | `scripts/` (new step), `web/src/components/result/` (new button), `web/src/pages/Scenes.tsx` | Pressing it caches every file of the scene; the scene then opens with the network off |
| 5 | Tests and measurement (section 5) | `web/e2e/`, `web/src/**/*.test.tsx` | All green; numbers in section 2 recorded in `eval/test_runs/lazy_loading.json` |
| 6 | (optional) Near me + idle prefetch | `web/src/pages/Scenes.tsx`, `web/src/lib/` | Works with location denied (silently) and with `saveData` set |

## 5. Tests to write or change

- `web/e2e/offline.spec.ts` currently waits for the service worker to cache everything. Rewrite it: visit the home page and one scene online, go offline, reload, and open that scene (works); open a scene never visited (shows the friendly message); press "Save for offline" on a second scene, go offline, open it (works); the sensitivity lab works offline for a saved scene.
- New e2e `web/e2e/first-load.spec.ts`: on a first visit to `./` with a fresh context, sum the bytes of all responses (`page.on("response")`, `response.body()` or the `content-length` header) for 8 seconds and assert **under 5 MB**; assert no request to `demos/<id>/` other than `index.json` happens before a scene is opened.
- New e2e check: opening a scene does not request `sens.bin` until the lab is scrolled into view, and does not request `result_raw.geojson` until the filter is switched off.
- Unit tests for the "Save for offline" progress and error states (mock `caches`), the `IntersectionObserver` lab loader, and the offline error state.
- Keep the 14 accessibility audits (`web/e2e/a11y.spec.ts`) passing: the new button needs a visible label, a 44 px target, and a live region for progress.
- Gate: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`, and the whole Playwright suite (`CHROMIUM_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" npx playwright test`). Run the e2e suite on its own, without other heavy jobs, or the load makes it flaky.

## 6. Risks and how to handle them

- **Old service workers.** Visitors who already have the 39 MB cache keep it until the new worker takes over. `registerType: "autoUpdate"` is already set; confirm `cleanupOutdatedCaches` is enabled (set it explicitly under `workbox`) and check that the old precache cache is removed after an update.
- **Stale scene data after a redeploy.** Solved by the versioned cache name in section 3.2. Without it, `CacheFirst` would keep serving old images.
- **Service workers only run on a served build.** Test with `npm run build && npx vite preview` (what Playwright already does), not `npm run dev`.
- **Quota.** "Save all scenes" is about 39 MB. Catch `QuotaExceededError` and show a plain message.
- **iOS Safari** clears service-worker caches after a week unused. Say "saved on this device for now" and do not promise permanence.
- **Nothing in the engine or API changes** except step 0. Do not touch `engine/` or backend tests.

## 7. What to tell the judges (and what not to)

- Say: "The first visit downloads about 3 MB. Scene data is loaded when you open it, and you can save a scene for offline use. This makes the site usable on a low-end phone."
- Do not say: "chunked analysis", "tiled processing" or "faster because of multi-threading". None of that is built. The analysis still reads one box at a time.

## 8. Not in this plan (next, in this order)

1. **Parallel band reads** in `engine/s2.py::read_aoi` (read the 5 bands and the cloud layer, and both dates, in threads). Speed only; measure before and after. Threads do not improve accuracy.
2. **Enrichment**: for each change, the land that was there before (WorldCover shares) plus buildings and roads from OpenStreetMap (today these always show "unknown").
3. **Tiled analysis**: split a large box into tiles, run them in parallel, show results as they finish starting from the centre, merge polygons across tile seams and apply the size filters after merging. This removes the 15 km / 6 km limit. Two to three hours of careful work; not safe to start near a deadline.
4. **Authority alerts** (municipal corporations): needs enrichment with administrative boundaries first.
