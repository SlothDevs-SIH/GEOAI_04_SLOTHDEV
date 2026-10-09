# Package: `soham_backend` (product quality, stack visibility, deployment)

**Owner:** Soham · **Branch:** `soham_backend` (create from `main`) · **Size:** about 24 hours of work across the 8 tasks below
**Read first:** [`CONTRACTS.md`](CONTRACTS.md) · [`../DECISIONS.md`](../DECISIONS.md) · **Partner package:** [`ayush_backend.md`](ayush_backend.md)

---

## 1. What this package is

`main` already has a working product. This package makes it **trustworthy, visible and live**:
check the real outputs, add the composite method, make the tech stack visible (judges asked for
it), finish the web features, deploy, and prepare the submission.

**You never need the ML model to build or test any of this.** Develop against the spectral detector
and radar as they are. Anything needing the partner's work (`mode=learned`, `mode=deep`) stays
"unavailable" until integration.

---

## 2. What you own

| Area | Files |
|---|---|
| Engine | `engine/run.py`, `ingest.py`, `change_spectral.py`, `filters.py`, `vectorise.py`, `attributes.py`, `impact.py`, `quality.py`, `export.py`, `report.py`, `config.py`, `s2.py` |
| New engine files | `engine/composite.py`, `engine/persistence.py`, `engine/detectors.py` |
| Service and web | `api/`, `web/`, `scripts/` (except the partner's), `eval/ablation.py` |
| Delivery | `Dockerfile`, `.github/workflows/ci.yml`, `requirements.txt` |

**You do not touch:** `ml/`, `engine/change_learned.py`, `change_deep.py`, `radar.py`, `radar_run.py`, `s1.py`, `engine/weights/`, `eval/build_results.py`, `eval/results.json`.

---

## 3. Tasks

### S1. Health check (about 1 h) → first
| Step | Detail |
|---|---|
| Install | `pip install -r requirements.txt` (`fpdf2`, `qrcode`, `scikit-learn` are needed by the tests) |
| Windows | The radar API temp-file fix is already ported; confirm `pytest` is **37 passed** and `ruff` is clean on your machine |
| Web | `cd web && npm ci && npm test && npm run build` |
| Done when | Backend and web checks are green locally |

### S2. Visual QA of the demo outputs (about 3 h)
| Step | Detail |
|---|---|
| Look | Open each `web/public/demos/<id>/` result in QGIS (or the web app) and screenshot: Pune (475 polygons, 309 of them `low`), Navi Mumbai, season control, Assam radar |
| Check | Do the `built_up_gain` polygons sit on real new construction? Are the `water_loss` polygons real (for example a river or lake edge)? Are tiers sensible for an officer? |
| Fix | Adjust thresholds in `config.py` or `attributes.py` **on these scenes only**; re-run `scripts/export_demo_assets.py` and `eval/ablation.py` |
| Done when | A short "QA note" (what you checked, what you changed) is added at the end of this file and screenshots are in `docs/img/` |

### S3. Composites and persistence (about 5 h) → method USP
| Module | What it does |
|---|---|
| `engine/composite.py` | Search several least-cloudy scenes per period (`s2.search`), mask with SCL, take the **per-pixel median** to build the before and after images; record scene ids and dates |
| `engine/persistence.py` | For encroachment, keep a change only if it appears in **at least 2 post-event scenes**. The flood preset skips it |
| Wiring | New options in `run.py` (`--composite N`, `--persistence K`), **off by default** so current results do not change |
| Evidence | Add rows to `eval/ablation.py` / `eval/ablation.json`: false alarms per km² with and without composites on the season-control and Pune scenes |
| Tests | A one-scene cloud is removed by the median; a change in only 1 of 3 later scenes is dropped by persistence |
| Done when | A measured before/after number is in `eval/ablation.json`. If composites do not help, say so there and keep them off |

### S4. Make the tech stack visible (about 2 h) → judges' feedback
| Piece | Detail |
|---|---|
| About page | Add a **"Tech stack" card** to `web/src/pages/About.tsx`: Web (React 19, Vite, TypeScript, Tailwind, MapLibre, Zustand), Engine (Python, FastAPI, Rasterio/GDAL, GeoPandas, NumPy/SciPy/scikit-image, scikit-learn), ML (**PyTorch** for the OSCD Siamese U-Net; **ONNX Runtime** for serving), Data (Sentinel-2, Sentinel-1, WorldCover, OSM, Sen1Floods11, OSCD, LEVIR-CD), DevOps (GitHub Actions, Docker, Vercel). Mark each item **Used now** or **In progress**. Never show an unfinished item as shipped |
| Diagram | Put the architecture picture (`docs/img/geoai04_architecture.png`, or the ChatGPT version) on the About page and in the README |
| Deck | Give the PPT team the stack slide text from `docs/PITCH_BRIEF.md` module 4 |
| Test | The existing About page test still passes |
| Done when | The About page shows the stack card and diagram, and the README embeds the diagram |

### S5. Radar upload in the Analyse page (about 1 h)
The API already accepts `mode=radar`; the Analyse form has no radar option. Add a mode choice
(Optical or Radar), a single-file upload for radar (after image only), and a clear note: "open-water
flood extent from one date". Add a Vitest component test.

### S6. Offline PWA, permalink tests, optional sensitivity slider (about 6 h)
| Piece | Detail |
|---|---|
| PWA (core) | `vite-plugin-pwa`: cache the app shell and the demo scenes; "Offline, demo data" badge; Playwright test with the network off |
| Permalink + QR | Already built; add a test that opening a permalink restores the same scene, filters and counts |
| Sensitivity lab X1 (optional) | A threshold and minimum-area slider recomputed in the browser from a magnitude raster. Needs the export script to write a small magnitude file per scene. **Cut first if time is short** |
| Done when | PWA works offline in a test; permalink test passes; X1 done or explicitly cut |

### S7. Deployment (about 3 h)
| Step | Detail |
|---|---|
| Vercel | Import the repo, root `web/`, set `VITE_API_URL`; confirm the static demos load with the API off |
| API host | Create a **Hugging Face Docker Space** (the Dockerfile already uses port 7860; you are logged in). If it is not allowed, use **Render** (spectral and radar only). Record the choice in `docs/DECISIONS.md` |
| Config | `ALLOWED_ORIGINS` for the Vercel domain; no secrets in the repo |
| Done when | The live site and `/health` URL work, and both URLs are in the README |

### S8. Submission pack (about 3 h)
README live links and a screenshot, demo video (3 minutes, recorded on the deployed site), the
stack slide, a clean-clone test (fresh venv, install, tests, one CLI run), the checklist in
`docs/TASK_SPLIT.md` §5, and a final check that the repo is **public**.

---

## 4. Order and checkpoints

| When | Milestone |
|---|---|
| 18:30 | S1 done; S2 started |
| 21:00 | S2, S4 and S5 done; S3 working on Pune |
| 00:00 | **Merge-ready:** S3, S6 (core), S7 done; tests and lint green; a short "what is in this branch" note at the top of this file |
| 03:00 | Freeze |

**Interim rule:** commit small and often; keep `soham_backend` green (`pytest`, `ruff`, `npm test`).

---

## 5. Definition of done

- [ ] Backend and web checks are green locally and in CI.
- [ ] A QA note and screenshots exist for the four demo scenes; thresholds adjusted only on those scenes.
- [ ] Composites and persistence are measured in `eval/ablation.json` (kept or switched off by evidence).
- [ ] The About page shows the tech stack (used now vs in progress) and the architecture diagram.
- [ ] The Analyse page offers radar uploads.
- [ ] The PWA works offline; the permalink test passes.
- [ ] The site is live on Vercel and the API has a host, or the fallback is documented.
- [ ] Submission pack complete; repo public; no edits to the partner's files.
