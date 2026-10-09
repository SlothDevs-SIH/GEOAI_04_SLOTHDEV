# GEOAI 04 frontend (Expo + React Native Web)

One codebase for web, Android and iOS. Midnight Terrain (dark, default) and Daylight GIS (light) themes from `GEOAI04_UI_Style_Guide.docx`; structure from `FRONTEND.md`. The older Vite app in `../web` is kept as a fallback.

```bash
npm install            # .npmrc sets legacy-peer-deps (needed for the Expo peer ranges)
npm run build          # sync demo assets, then expo export -p web  ->  dist/
npm run serve          # static server with SPA fallback on :4173
npm test               # Jest + React Native Testing Library (83 tests)
npm run typecheck
npm run e2e            # Playwright: demo flow, offline, 360/1280 px (needs a built dist/)
```

`EXPO_PUBLIC_API_URL` points at the FastAPI service (optional). Without it the demo scenes and Accuracy page work from bundled files and Analyse shows "Live analysis is offline".

## Layout
`app/` routes (`/`, `/scene/[id]`, `/job/[id]`, `/analyse`, `/accuracy`, `/about`; query `sel`, `filter=off`, `swipe`) · `components/` · `theme/` tokens · `store/` (review, filters, ui; Zustand) · `hooks/` · `lib/` (ports of the web lib, with the same Python-parity sensitivity tests) · `public/sw.js` offline service worker. `scripts/sync-assets.mjs` copies demos, eval results and the MapLibre worker/CSS from `web/public` and `node_modules`.

## What is verified, and what is not
- Verified here: typecheck, Jest, 18 Playwright tests in Chromium (swipe by keyboard, filter toggle and counter, deep links, confirm, sensitivity lab, offline with the network off, no horizontal scroll at 360 and 1280 px).
- **Not run anywhere:** the Android/iOS builds. `CompareMap.native.tsx` and `AreaPicker.native.tsx` are written against `@maplibre/maplibre-react-native` 11 and typecheck, but need a device build. The native sensitivity lab shows counts without the image overlay.
- OSM basemap tiles are blocked in the build sandbox, so screenshots show the scene images over a plain background.

## Measured deviations from the style guide
Computed in `theme/__tests__/contrast.test.ts`:
- Daylight accent, teal, green, amber and blue reached only 3.2-4.1:1 as text on white; each is darkened one step to pass 4.5:1.
- Tier chips print the label in the normal text colour (critical's own colour is 3.97:1 on its soft fill in dark); severity still shows by shape, colour and word.
- `borderStrong` is 2.5:1 on the dark surface (the guide says 4.6:1); left as specified and recorded.
- Light muted text on the raised surface is 4.07:1, so it is not used there.
