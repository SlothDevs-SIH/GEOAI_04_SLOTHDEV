# GEOAI 04: 24-Hour Task Split (to deployment and submission)

**Clock:** IST. Plan starts **Fri 9 Oct, 12:30**. **Submission deadline: Sat 10 Oct, 10:00.** That leaves **about 21.5 hours**.
**Target:** a deployed website (Vercel) plus a live API (Hugging Face Space), a retrained model with held-out numbers, tests in CI, and a submitted GitHub repo, all **by 09:00**, with an hour of buffer.
**Read with:** [`BACKEND_PLAN.md`](../BACKEND_PLAN.md) · [`FRONTEND_PLAN.md`](../FRONTEND_PLAN.md) · [`PROJECT_PLAN.md`](PROJECT_PLAN.md)

---

## 0. Ground rules

1. **Always have a working demo.** The static-first site (BACKEND_PLAN §8) means the deployed demo never depends on the live API. Protect that above everything.
2. **Freeze the contract at kickoff.** The GeoJSON properties and `summary.json` shape in BACKEND_PLAN §6 are fixed after 13:30. Change them only by agreement of the engine and frontend owners.
3. **Deploy early, deploy often.** First Vercel deploy by 16:00, first Space deploy by 20:30.
4. **Test set discipline.** The OSCD test cities are used **once**, after the model and threshold are chosen on validation.
5. **Feature freeze at 03:00.** After that: bug fixes, tests, docs, video, submission only.
6. **Small commits, short-lived branches, PRs merged within the hour.** `main` must always build.
7. **Rest.** Everyone gets a 4-hour sleep block between 01:00 and 06:30, staggered so at least two people are awake at all times. A tired team makes mistakes in the last hours.
8. **Be honest in every number.** Synthetic or placeholder data is labelled. Published numbers are labelled "published, not reproduced".

---

## 1. Roles

Assumed team of **four**. Names are left blank for you to fill in. With three people, merge R4 into R2 and R3 (R4's data work goes to R2, the deck to R3); with five, add a second person to R3 or R1.

| Role | Owns | Name |
|---|---|---|
| **R1: ML and evaluation** | OSCD data, baselines, training, the decision gate, `eval/results.json`, the Accuracy numbers | _____ |
| **R2: Engine, API and deployment (tech lead)** | `engine/`, `api/`, tests, CI, Dockerfile, the Space deploy, integration and merges | _____ |
| **R3: Frontend** | `web/`, the swipe map, panels, exports UI, Accuracy and About pages, Vercel deploy, web tests | _____ |
| **R4: Data, demo and pitch** | Scene selection and fetching, OSM and WorldCover context, impact numbers, README, deck, demo script, video, submission checklist | _____ |

---

## 2. Schedule

### Block 0 · 12:30 to 13:30 · Kickoff and contracts (everyone)

| Role | Tasks |
|---|---|
| All | `git pull`; create `web/`, `api/`, `ml/`, `eval/`, `tests/` folders; branch naming `feat/<role>-<topic>`; confirm the official statement is pasted in `PROJECT_PLAN.md` §2.1; agree the freeze of the GeoJSON and `summary.json` shape |
| R1 | Start the OSCD download on Kaggle; create the Kaggle notebook with GPU enabled |
| R2 | Python 3.11 venv; install requirements; run `prototype/pipeline.py` once to confirm the toolchain; test `engine/s2.py` can read a Sentinel-2 AOI on a normal laptop |
| R3 | `npm create vite`; add Tailwind, MapLibre, compare plugin; link the repo to Vercel |
| R4 | Check the hackathon rules (public repo? submission form? required files? rules on pre-existing code?) and write the answers in the checklist (§5); shortlist 3 flood-event candidates |

**Exit:** the contract is agreed; everyone can run their part locally.

### Block 1 · 13:30 to 18:00 · Parallel build

| Role | Tasks | Output |
|---|---|---|
| **R1** | **M0** OSCD loader (`ml/oscd_data.py`), patches, augmentation, train / val / test split with 3 validation cities; **M1** baselines on the 10 test cities (naive, spectral, BIT RGB); write the metric code (precision, recall, F1, IoU) shared with `eval/`; start **M2a** training on GPU by 16:30 | `eval/oscd_baselines.json`; first training run started |
| **R2** | Refactor the prototype into `engine/ingest.py`, `change_spectral.py`, `filters.py`, `vectorise.py`, `attributes.py`, `export.py`, `run.py` (CLI); unit tests for each as it lands; `ruff` config; CI workflow skeleton | `python -m engine.run` gives GPKG + GeoJSON + summary on one Sentinel-2 pair |
| **R3** | Result page with the swipe map on a hand-made fixture; polygon layer; legend; ranked list; Zustand filters; deploy the skeleton to Vercel | Skeleton live on a Vercel URL by 16:00 |
| **R4** | Run `scripts/fetch_demo_scenes.py` for encroachment and season-control; **test cloud cover for the flood candidates** with `engine/s2.py` and pick the flood scene (post-event AOI cloud < 5 %, before date in the same season); cache OSM buildings and roads and a WorldCover crop for each AOI | `demos/<id>/before.tif, after.tif, meta.json` for three scenes; context GPKG files |

**Checkpoint C1 · 18:00:**
- [ ] CLI produces a valid GeoJSON for one real scene.
- [ ] Frontend shows a GeoJSON on a swipe map, deployed.
- [ ] Three scenes fetched, flood scene chosen.
- [ ] OSCD baselines computed; training running.

*If C1 is missed:* drop the area picker and live upload from scope (they are stretch anyway) and keep going.

### Block 2 · 18:00 to 23:00 · Integration

| Role | Tasks | Output |
|---|---|---|
| **R1** | Monitor and rerun training; check normalisation, class weight and sampling if F1 is poor; start **M2b** (BIT fine-tune) if GPU time allows; at **21:00 the decision gate:** pick the model by validation F1, choose the threshold on validation, run the **test cities once**, write `eval/results.json`; export weights to `models/` | Held-out numbers for naive, spectral, learned |
| **R2** | False-alarm rules, drop counts, raw and filtered layers, tiers, reasons (`filters.py`, `attributes.py`); `scripts/export_demo_assets.py` writes `web/public/demos/<id>/…` for all three scenes; API skeleton (`/health`, `/demos/*`, `/metrics`); `tests/test_api.py` | Static demo folders consumed by the frontend |
| **R3** | Wire the real demo data; false-alarm toggle with counter; filter bar; detail card with crops; impact panel; Vitest unit and component tests | Full demo path works locally on real data |
| **R4** | `engine/impact.py` with R2 (WorldCover cropland, OSM buildings and roads) and the numbers for the flood scene with sources; README skeleton with the problem, approach and how to run; start the deck | `impact` block in `summary.json` |
| All | **First deployment of the API Space by 20:30** (R2): Dockerfile, CPU torch, health check, CORS; R3 points `VITE_API_URL` at it | Space `/health` returns ok |

**Checkpoint C2 · 23:00:**
- [ ] The deployed site shows all three scenes from static data with the API off.
- [ ] The toggle shows a real raw → filtered number, and the impact panel shows real values with sources.
- [ ] `eval/results.json` exists with held-out numbers (even if the learned model loses to spectral; report that honestly).
- [ ] CI is green on `main`.

*If C2 is missed:* cut stretch items, pick the best working mode as default, and move the remaining effort to testing and the demo.

### Block 3 · 23:00 to 03:00 · Features, ML integration and tests (staggered sleep starts from 01:00)

| Role | Tasks | Output |
|---|---|---|
| **R1** | Integrate the chosen model: `engine/change_learned.py`, a `test_learned.py` fixture test; the false-alarm evaluation (`eval/false_alarms.py`) on matched-season, mismatched-season and an **unseen no-change pair**; seconds per km² per mode; optional M4 flood water check | Complete `eval/results.json` |
| **R2** | Live `/analyze` + `/jobs` for `spectral` and `learned` (and `deep` if the weights fit); review `PATCH`; exports (GPKG, GeoJSON, PDF, CSV/KML) and `audit.json`; mode auto-selection; remaining tests; redeploy the Space | Every endpoint in BACKEND_PLAN §6 passes `test_api.py` |
| **R3** | Review (confirm / dismiss) and export menu; Analyse page with progress and the offline state; Accuracy page from `eval/results.json`; About page with limits; accessibility pass; Playwright smoke test | Full site feature complete |
| **R4** | Open the exported GPKG in QGIS and **save a screenshot**; finish the README (features, architecture diagram, setup, tests, deployment, results table, limitations, credits and licences); deck draft; demo script timed | README and deck v1 |

### Feature freeze · 03:00

After 03:00 only: bug fixes, tests, docs, polish, rehearsal. Anything unfinished is cut or listed under "Future work".

### Block 4 · 03:00 to 07:00 · QA, documentation, rehearsal (staggered sleep continues until 06:30)

| Role | Tasks |
|---|---|
| **R1** | Re-run `eval/` from a clean checkout to confirm the numbers reproduce; write the results section (seed, split, hardware, what the numbers do and do not show); run the slow tests once and record the outcome |
| **R2** | Clean-clone test: fresh venv → `pip install` → `pytest` → `python -m engine.run` on a demo scene; Docker build from scratch; confirm the Space cold start; `ruff` clean; remove dead code and secrets |
| **R3** | Test on a phone browser and a throttled connection; empty / error / offline states; the full demo path 3 times on the **deployed URL**; fix visual bugs; Lighthouse sanity check |
| **R4** | Record a **backup demo video** (about 3 minutes) on the deployed site; finalise the deck; rehearse the pitch and the judge Q&A (`PROJECT_PLAN.md` §23); prepare the one-page "limits and honesty" slide |

### Block 5 · 07:00 to 09:00 · Repo freeze and submission

| Time | Task |
|---|---|
| 07:00 | **Repo freeze:** merge the last PRs; CI green on `main`; tag `v1.0-submission` |
| 07:15 | README check: live URLs at the top (site and API), screenshot or GIF, setup in under 5 commands, test commands, results table, team, credits and licences (BIT, OSCD, LEVIR-CD, Sentinel-2, OpenStreetMap, ESA WorldCover) |
| 07:30 | Check the repo visibility and access against the hackathon rules (the repo is currently **private**; make it public or add the judges' accounts if the rules require it) |
| 07:45 | Open the live URL on a clean browser profile and a phone; run the whole demo path; confirm the API Space is awake |
| 08:15 | Submit (form / link / files as required by the rules in §5) |
| 08:45 | Verify the submission went through (confirmation email or page); save a copy of the links |
| 09:00 to 10:00 | **Buffer only.** No merges unless something is broken |

---

## 2a. Task changes from the locked scope (9 Oct 2026)

These replace or extend the matching rows above. Decisions: **core** B4 + B1, M7, M9, M3, M1, F3, X5, X3; **optional layer** B3 + X1; **gated** M8 (details in [`TECH_OPTIONS.md`](TECH_OPTIONS.md) section 0).

| Role | Added tasks | Target time |
|---|---|---|
| **R2** | `engine/composite.py`, `engine/persistence.py`, `engine/quality.py` (Block 2); `eval/ablation.py` (Block 2 to 3) | by 23:00 |
| **R1** | `eval/bootstrap.py` for 95 % confidence intervals on the OSCD test cities; after the 21:00 decision gate, `ml/export_onnx.py` + `test_onnx_parity.py` (optional, only if C2 is met) | CIs by 00:00; ONNX by 02:00 |
| **R3** | **X5** evidence panel and **X3** offline PWA (Block 3); permalink state + QR code; **X1** sensitivity lab only after C2 and ONNX parity | X5, X3 by 02:00; X1 by 03:00 or cut |
| **R4 + Ayush (`backend-2`)** | Sentinel-1 live checks **V-M8-1 to V-M8-5** (see `BACKEND_PLAN.md` section 13). Data sourcing is already decided (train on Planetary Computer, test on NASA OPERA). Ayush can run V-M8-1 and V-M8-2 **now, in parallel**, since they need only a laptop and a free Earthdata login. Pass V-M8-1 and V-M8-2: R2 builds `engine/s1.py` and `engine/radar.py` in Block 3 after C2. Fail: drop M8 | checks by 18:00; go / no-go at C2 |

**M8 rule (updated):** the data decision is made; what remains is code, calibration (`ml/m8_calibrate.py`) and the OPERA test (`eval/m8_opera.py`). Start it only when the whole pipeline (CLI, API, static demos, deployed site, tests in CI) works end to end. If it is not done by the 03:00 feature freeze, cut it.

**B3 rule:** the browser engine is an add-on. If it slips, the site still works from static demo data and the API.

**Core additions (13:30):** permalink, QR code and PDF export are back in the core scope (R3: permalink and QR, PDF button; R2: `engine/report.py` with fpdf2 and prebuilt demo PDFs).

**Moved to the cut list:** Hindi PDF and language switch, deck.gl, permits and no-build zones, WorldPop.

---

## 2b. Presentation prototype and data hand-off (added 9 Oct, 13:30)

**Presentation round at about 14:00.** The PPT is managed by two other members; the backend is owned by the server-side owner. Goal for the round: **a basic UI that can be screenshotted or shown live**, not the full app.

| Item | What | Owner | By |
|---|---|---|---|
| **P1** | `web/` skeleton: Vite + React + Tailwind, Scenes page and Result page layout, swipe map with a **hand-made fixture** (a few tier-coloured polygons over two before/after images), legend, ranked list, the raw/filtered toggle with counter | R3 | 14:00 (screenshots for the deck even if the live demo is rough) |
| **P2** | 3 to 4 screenshots for the PPT: Scenes page, Result map with swipe, impact panel mock, Accuracy page mock. **Label them "prototype, fixture data"** so no mock-up is presented as a real result | R3 + PPT owners | 14:00 |
| **P3** | One architecture slide and one "what we will show" slide, taken from the README diagram and `TECH_OPTIONS.md` section 0 | PPT owners | 14:00 |

**Data hand-off:** Ayush has found the data for the two options and will write it to a separate `.md` on his branch. When the branch name is given: pull it, merge its content into `docs/DATA_NOTES.md`, then check the plan sections that name datasets and scenes (BACKEND_PLAN sections 5 and 8, TASK_SPLIT Block 1) against it. Then the plan is final and is pushed to `main`.

**Order of work:** finalise the plan (after Ayush's data) → push to `main` → continue the schedule in Blocks 0 to 5 above. P1 and P2 can start now because they use fixture data and do not depend on the data note.

---

## 3. What we will show the judges (numbers and artefacts)

| Item | Source | Status label |
|---|---|---|
| Held-out OSCD precision, recall, F1, IoU for **naive vs spectral vs learned** | `eval/results.json` | Measured by us, seed and commit recorded |
| False alarms per km², filter off vs on, and the unseen no-change pair | `eval/false_alarms.py` | Measured |
| Raw → filtered counts and drop reasons on each demo scene | `summary.json` | Measured on that scene |
| Impact: hectares changed, **cropland (ha)**, buildings, road segments | `engine/impact.py` | Estimates from open data, sources named |
| Seconds per km² per mode on a laptop CPU | `eval/` | Measured |
| BIT F1 on LEVIR-CD | Published (about 0.89) | Labelled **published, not reproduced**, unless we run `levir_eval.py` |
| The GPKG opened in QGIS | Screenshot in `docs/` | Real |
| Tests and CI | GitHub Actions badge, test counts | Real |

---

## 4. Cut list (drop in this order if behind)

1. Hindi PDF, Sentinel-1 radar mode, draw-an-area picker, permits and no-build zones, WorldPop.
2. M4 flood water check; BIT fine-tune (M2b).
3. Live `/fetch-s2` and live upload; keep static demos plus `/analyze` on demo ids.
4. PDF export (last resort only; keep GPKG, GeoJSON, permalink and QR).
5. Learned model integration (ship spectral as default and report the learned result as measured, or as "in progress").

**Never cut:** the static demo site, the swipe map, the raw/filtered toggle, tiered polygons with reasons, the Accuracy page with honest numbers, tests and CI, the README, deployment.

---

## 5. Submission checklist (fill in from the hackathon rules in Block 0)

- [ ] Submission format: _____ (GitHub link / form / zip / video)
- [ ] Repo visibility required: _____ (currently private)
- [ ] Required files: _____ (README, demo video, deck, report)
- [ ] Rules on pre-existing code and third-party models: _____ (we cite BIT, OSCD and others in the README)
- [ ] Judging criteria: _____ (paste here and re-map the pitch to them)
- [ ] Live site URL: _____
- [ ] API URL: _____
- [ ] Demo video URL: _____
- [ ] Deck file: _____
- [ ] Submission confirmation saved: _____

---

## 6. Risks specific to this schedule

| Risk | Mitigation |
|---|---|
| No clean post-flood Sentinel-2 image | R4 tests candidates by 15:00; fall back to the encroachment story and use only real imagery; do not fake a flood |
| The learned model scores poorly on OSCD | Decision gate at 21:00; ship spectral as default and report both honestly. A weak but honest number beats an inflated one |
| `engine/s2.py` fails outside the original sandbox | R2 tests it in Block 0; fallback is Planetary Computer or manual download of the scene |
| The Space build fails (torch size, memory) | Deploy at 20:30 to leave time; if torch is the problem, serve spectral only in the cloud and keep learned / deep for local runs |
| Merge conflicts at the end | Short-lived branches; freeze at 03:00; only R2 merges after 07:00 |
| Fatigue | Staggered sleep rota; no new features after 03:00 |
| Submission-day surprises (form, repo access) | Rules checked in Block 0; submit by 08:15, not at 09:59 |
