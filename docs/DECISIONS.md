# Decisions Log (9 Oct 2026)

Answers from the team that fix open questions in the plans. Where another document disagrees with
this file, **this file wins**.

---

## 1. Rules and the competition

| Topic | Decision |
|---|---|
| Deadline | **10:00, 10 Oct 2026** (confirmed). Feature freeze **03:00**. |
| Repository | **Public.** |
| Judging criteria | Not known yet; to be added here when received. Until then we optimise for method, evidence and demo. |
| Round 1 feedback | "Excellent." Judges asked us to make the **technical stack more visible**. |
| Competitor | A team from the same college (led by a third-year student) is highlighting **PyTorch** as their USP. We answer by showing our own stack clearly: PyTorch for training the OSCD model, plus ONNX serving, held-out evidence and the radar mode. |
| Commit footers | Keep the `Co-Authored-By: Claude` line. |

## 2. Team and roles

| Topic | Decision |
|---|---|
| Team size and roles | **Left undefined for now.** |
| "Our server" | **Ayush** (the backend side with the GPU). |
| Frontend | The React app already exists on `main` (built by Ayush). Soham owns further frontend changes. |
| PPT | Managed by two other members. They need the tech-stack slide (see `PITCH_BRIEF.md`). |

## 3. PyTorch and the models

| Topic | Decision |
|---|---|
| Who trains | **Ayush**, on his laptop (**NVIDIA RTX 4050**). No Kaggle or Colab needed. |
| PyTorch install | **Yes**, CPU or CUDA build, but kept out of the core install: it lives in `requirements-ml.txt`. |
| Training vs serving | Train with PyTorch; **serve the model with ONNX Runtime** (much lighter). The cloud container does not need PyTorch. |
| If learned loses to spectral | Ship **spectral as the default** and report both numbers honestly. (In plain words: we test our trained AI and the simple formula method on 10 cities neither has seen. The better one becomes the default; we never hide the worse number.) |
| BIT (high-resolution deep mode) | **Stays, as a secondary mode.** The official PDF lists **LEVIR-CD** as a reference dataset, so judges expect it. Evaluate on the full LEVIR-CD test split; label published numbers as "published, not reproduced" until we reproduce them. |
| Shield-style class-aware scoring | Default **no** (unproven at 10 m); only if time remains. |
| Weights | The small U-Net (a few MB) and its ONNX file are **committed in `engine/weights/`**, next to the existing `m8_gbm.joblib`. BIT's checkpoint is **downloaded by a script** (`scripts/fetch_bit.py`), not committed. |

## 4. Radar flood mode (M8)

| Topic | Decision |
|---|---|
| Authoritative numbers | The **newer** figures in `eval/README.md` and `eval/results.json`. The 0.43 to 0.44 in the first M8 doc came from an earlier, simpler run (threshold + median filter, no region growing). |
| Headline (held-out, label-free) | Unseen country (Bolivia) **0.697 vs 0.337** naive · India test chips **0.571 vs 0.273** · official test split **0.287 vs 0.141**. |
| Demo scene wording | Assam, all 68 chips: **0.410 vs 0.175**. Call it "the demo scene", not a held-out result (the threshold was fitted without labels on those same chips). |
| "0.31 to 0.34" | Not a second score. It is the same 68 chips when the threshold is fitted on each split's smaller subset: the evidence for "process whole scenes, not small tiles". |
| Learned M8 classifier | 0.433 on the test split. It is an **optional** model, not the default. |
| **Rule change** | The old rule "if V-M8-1 or V-M8-2 fail, drop M8" is **replaced**. M8 now runs on Sen1Floods11 (public, no account), is evaluated and is in the app. The two live checks only decide the wording: pass → "tested on 2026 OPERA data"; fail → "evaluated on Sen1Floods11; live 2026 fetch not verified". **M8 stays either way.** |
| Flood story | **Radar (Assam monsoon 2016).** Optical stories stay as Navi Mumbai and Pune (encroachment) and Saswad (season control). State on stage: open-water extent from one date, not before/after change; a 2016 event; flooded crops and streets can be missed. |
| Radar upload in the UI | The Analyse page's upload form does not offer radar yet (about 15 minutes of work): a task in `soham_backend.md`. |

## 5. Scope: any area in India (and anywhere Sentinel-2 reaches)

**Decision (from the team):** the website must work for **any area in India**, not only the demo scenes.
Pune, Navi Mumbai, Assam and Saswad are **demo scenes**, chosen because they have clear change; they are not the product's limit.

What this requires (tracked as task S9 in `docs/packages/soham_backend.md`):
- An **area and dates picker**: draw a box anywhere in India, choose two dates, and the server fetches the two least-cloudy Sentinel-2 scenes and runs the engine. Today the Analyse page only accepts uploaded GeoTIFFs.
- **More demo scenes from different Indian regions and climates** (for example arid Rajasthan, Delhi NCR, a coastal city, the humid south), each visually checked.
- **Honest limits:** the rules and thresholds were tuned on three Maharashtra scenes. Until they are checked on other regions we say "validated on N regions", never "works everywhere". The OSCD test locations (worldwide) give extra evidence of generalisation.
- **Size cap** per request (a box of about 15 km by 15 km inside one Sentinel-2 tile at first); larger areas need tiling and are future work.
- Monsoon cloud: when a region is too cloudy in optical, the app should suggest the **radar** mode for floods.

---

## 6. Data and demo scenes

| Topic | Decision |
|---|---|
| Reference datasets (from the official PDF) | **LEVIR-CD** (0.5 m building change) and **OSCD** (Sentinel-2 urban change). The statement also names Sentinel-2, Planet and OpenAerialMap pre/post-disaster data. |
| Demo scenes | Keep the four on `main`. **Add one OSCD test city** (it has ground-truth labels, so we can show "ours vs labelled" and a real F1) and **one LEVIR-CD tile** for BIT. OpenAerialMap disaster pairs are optional and unchecked. |
| Tier meaning | Default: hectares-based tiers. `main` already tunes them for 10 m scenes in `engine/attributes.py`. |
| Visual QA | I check the demo outputs (see `soham_backend.md` task S2). |

## 7. Hosting and deployment

| | Hugging Face Space | Render free |
|---|---|---|
| Memory | 2 vCPU, 16 GB (docs) | About 512 MB, 0.1 CPU (third-party sources only) |
| Idle behaviour | Sleeps after about 48 h idle (one doc version) | Sleeps after **15 min** idle; about 1 min to wake (official docs) |
| Free limit | Docker Spaces may need a paid plan (docs and forum disagree) | 750 instance hours per month (official) |

**Decision:** the site is static-first, so the live API is not critical. **Soham creates a Hugging Face Docker Space first** (the Dockerfile on `main` already uses port 7860; he is logged in). If that is not allowed or fails, use **Render** (spectral and radar only). The site goes on **Vercel**.

## 8. Repository and process

| Topic | Decision |
|---|---|
| Reconciliation | `main` (Ayush) already holds the integrated engine, API and React app. My duplicate Stage 1 engine is **archived locally** on branch `soham_stage1_archive` and is **not** merged. Only the Windows temp-file fix was ported. |
| Pushing | Only when told. |
| Node.js | Yes, Node 20 or later (22 in CI). |

## 9. Why a web app (for the pitch)

The official statement asks for an **interactive split-view (before/after) web map**. A link also works on any device with no install and can be opened by judges directly. The demo is static-first, so it works even if the server sleeps.

---

## 10. Dataset facts checked against the sources (9 Oct)

| | **LEVIR-CD** (page opened) | **OSCD** (original source opened; the Kaggle page could not be read) |
|---|---|---|
| What | Building change, binary labels | Urban change (new buildings and roads), pixel-level labels |
| Imagery | Google Earth, **0.5 m**, 1024 x 1024 patches | **Sentinel-2**, **13 bands** at 10, 20 or 60 m |
| Size | **637 pairs**, 31,333 annotated building change instances, 20 regions in Texas | **24 image pairs** at locations worldwide |
| Dates | 2002 to 2018 (5 to 14 years between the two images) | 2015 to 2018 |
| Split | Not stated on the page | **14 train / 10 test** pairs; test labels are public |
| Georeferencing | **A March 2023 update added latitude and longitude per sample** | Not verified (check the Kaggle download) |
| Licence | **Academic use only; commercial use prohibited**; Google Earth terms apply | Not stated |
| Not verified | Whether images are RGB on the page (the prototype used 3-channel images) | File format and georeferencing of the Kaggle mirror |

**Corrections:**
- OSCD pairs are **locations**, not cities. The plans now say "locations".
- The earlier note that LEVIR "ships with no coordinates" may be out of date; Ayush checks whether his download includes the 2023 update.
- The README credits must say LEVIR-CD is for academic use and follows Google Earth terms.
