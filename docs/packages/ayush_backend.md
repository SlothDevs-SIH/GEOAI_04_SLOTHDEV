# Package: `ayush_backend` (PyTorch models, evaluation and radar change mode)

**Owner:** Ayush (RTX 4050 laptop) · **Branch:** `ayush_backend` (create from `main`) · **Size:** about 27 hours of work across the 6 tasks below
**Read first:** [`CONTRACTS.md`](CONTRACTS.md) · [`../DECISIONS.md`](../DECISIONS.md) · **Partner package:** [`soham_backend.md`](soham_backend.md)
**Also read:** [`../M8_RADAR_FLOOD_DATA.md`](../M8_RADAR_FLOOD_DATA.md) · [`../PRIOR_ART_TECH_STACKS.md`](../PRIOR_ART_TECH_STACKS.md)

---

## What is in this branch (`ayush_backend`, 9 Oct 2026): read this first

**Built and tested** (on `ayush_backend` merged with Soham's `main`: 195 Python tests pass with torch, 181 pass and 3 skip without it, which is what CI sees; plus 49 web tests and 4 browser tests):

| Task | Built | Measured on real data? |
|---|---|---|
| A1 | `eval/metrics.py` (P/R/F1/IoU, bootstrap CIs over tiles, ECE), `ml/oscd_data.py`, `eval/oscd_baselines.py` | **Yes** (run on the laptop, 9 Oct): naive F1 0.24 [0.08, 0.45], spectral 0.38 [0.13, 0.52] on the 10 test cities |
| A2 | `ml/siamunet.py` (1.09 M params), `ml/train_siamunet.py` (+ `--gate`, run-once test gate) | **Yes** (RTX 4050): stopped at epoch 36, best epoch 26 (validation F1 0.45). Gate, test cities used once: learned F1 0.54 [0.34, 0.66] vs spectral 0.38, so the default is `learned` by the pre-set rule, but see the false-alarm caveat in `eval/README.md` |
| A3 | `engine/change_learned.py` (ONNX Runtime, torch fallback, fail-soft), `ml/export_onnx.py` (parity check), `engine/config_ml.py` | **Trained model shipped** (`siamunet_oscd.{pt,onnx,json}`); ONNX matches PyTorch to 1e-5; runs on all demo scenes in about 1 s each |
| A4 | `engine/change_deep.py` (BIT, GPU when available), `scripts/fetch_bit.py`, `ml/levir_data.py`, `eval/levir_eval.py` | **Yes, on the full official LEVIR-CD test split (128 images), reproduced** (run on the laptop, 9 Oct): BIT F1 0.9025 [0.890, 0.912], IoU 0.822; naive F1 0.137. Published: 0.8931 / 0.8068 |
| A5 | `engine/s1.py`, radar before/after in `engine/radar.py`, `engine/radar_run.py` (Seam 2), `ml/m8_calibrate.py`, `engine/params_m8.json`, `eval/m8_opera.py`, `ml/fetch_s1_event.py` | **Yes, label-free, on a real event** (July 2024 Assam flood, Planetary Computer): new water 56.4 km2; a flood-free scene gives 0.13 km2 of false alarms against 11.3 km2 single-date. **Not yet:** the NASA OPERA 2026 run (written from the real listing, tested with fake downloads, not run live) |
| A6 | `eval/build_results.py` Seam 3 keys (written only when their result file exists), `requirements-ml.txt` | n/a |

**Verified on download (A1 and A4 asked for this), 9 Oct, from the real files:**
- **OSCD** (Kaggle copy): one GeoTIFF per band (`B01` to `B12`) in `imgs_1_rect` and `imgs_2_rect`; labels as `cm.png` and `<city>-cm.tif` (1 = no change, 2 = change). The GeoTIFFs have **no georeference** (rasterio reports `NotGeoreferencedWarning`: no geotransform), so OSCD scenes are scored in pixel space and never shown on a map. The Kaggle copy has train labels only: the 10 test-location labels come from the separate `Test Labels.zip` (`hkristen/oscd` on Hugging Face). Licence: not stated in the files we looked at. The 20 m B11 band is resampled to the B02 grid in `ml/oscd_data._band` (bilinear) when its shape differs.
- **LEVIR-CD** (`test.zip`, 128 images in each of `A`, `B`, `label`): plain PNG with **no per-sample coordinates** (the March 2023 georeference update is not in this copy; `ml/levir_data.find_georeference` returns `None`), so the demo tile uses a **placeholder** location and is flagged as one. Academic use only, Google Earth terms: stated in the README credits and in the results file (`license_note`).

**Still open:** only the NASA OPERA 2026 test (V-M8-2 below). The radar before/after mode has been run on a real 2024 event.

**V-M8-1 (Planetary Computer): PASSED** on the laptop, 9 Oct (`python -m engine.s1 --check mpc`): 34 `sentinel-1-rtc` scenes found over the
Assam box (Nov 2024 to Mar 2025) and a 224 x 203 px window read from the first one. (From the build environment it had returned 403: that was
an egress limit, not a problem with the service.) Planetary Computer stopped ingesting on 17 Apr 2026, so it cannot supply 2026 events: it
gives us before/after tests on earlier events such as the July 2024 Assam flood.
**V-M8-2 (Earthdata / OPERA): search passed, download not yet verified.** On the laptop, 9 Oct, with the token in `.env`:
`python -m engine.s1 --check opera` found 28 OPERA RTC-S1 bursts over the Assam box for Jun to Aug 2026, and `--inspect opera` showed the real
layout (each burst has separate `_VV.tif` and `_VH.tif`, about 7 MB each, plus a mask and an HDF5 file). The download, mosaic and event fetcher
(`ml/fetch_s1_event.py --source opera`) were then written against that real listing and are tested with fake downloads; they have not yet been run live.
The wording rule from `DECISIONS.md` applies: pass means "tested on 2026 OPERA data", fail means "evaluated on Sen1Floods11 and a Planetary Computer 2024 event; live 2026 fetch not verified".

**A bug found and fixed on the way:** `radar.polygons` returned geometry in the raster's own CRS (metres for UTM inputs)
labelled as GeoJSON; Sen1Floods11 chips are in degrees so the demo never showed it, but any UTM input (uploads, OPERA)
would have. It now always returns WGS84. The Assam demo output is unchanged (37 polygons, identical areas).

**What is left:** the NASA OPERA 2026 run, and the optional seed and loss-weight study (`ml/variant_study.py`, built and tested, not yet run: it needs the OSCD data and a GPU), both on the laptop (commands in `eval/README.md`, "Reproduce every number"), and Soham's integration of `change_learned`, `change_deep` and `radar_run` into `detectors.py` and the API.

---

## 1. What this package is

Everything that **learns or is measured**: the PyTorch change model on real Sentinel-2 labels
(OSCD), its held-out evaluation with confidence intervals, the high-resolution BIT mode on
LEVIR-CD, and the radar before/after mode. `main` already has the optical engine, the radar
engine, the API and the web app; this package adds the models and the numbers they need.

**You never need the web app, the PDF, the deployment or the composites to build or test any of
this.** Your detectors plug in through **Seam 1** (same dict as `change_spectral.detect`).

---

## 2. What you own

| Area | Files |
|---|---|
| Data and training | `ml/oscd_data.py`, `ml/train_siamunet.py`, `ml/export_onnx.py`, `ml/levir_data.py` |
| Evaluation | `eval/metrics.py`, `eval/oscd_baselines.py`, `eval/levir_eval.py`, `eval/build_results.py`, `eval/results/`, `eval/results.json` |
| Detectors | `engine/change_learned.py`, `engine/change_deep.py`, `engine/config_ml.py` |
| Radar | `engine/radar.py`, `engine/radar_run.py`, `engine/s1.py`, `ml/m8_calibrate.py`, `eval/m8_opera.py`, `scripts/build_m8_demo.py` |
| Files | `requirements-ml.txt`, `engine/weights/`, `scripts/fetch_bit.py` |

**You do not touch:** `engine/run.py`, `engine/config.py`, `engine/export.py`, `api/`, `web/`, `Dockerfile`, `.github/`, `requirements.txt`.

---

## 3. Tasks

### A1. OSCD data, the metric library and baselines (about 5 h) → first
| Piece | Detail |
|---|---|
| Install | `pip install -r requirements-ml.txt` (torch with CUDA for the 4050, torchvision, onnx, onnxruntime, einops) |
| Download | OSCD on your laptop (Kaggle `soumikrakshit/onera-satellite-change-detection-dataset`, <https://www.kaggle.com/datasets/soumikrakshit/onera-satellite-change-detection-dataset>; done on the laptop, the host is blocked in the cloud build environment). Official split: **14 train / 10 test locations** (the source says "locations", not cities). **Verify on download:** file format, whether the images are georeferenced, and the licence (not stated); resample the 20 m B11 band to 10 m |
| `ml/oscd_data.py` | Read the 13-band pairs; keep the 5 bands the engine uses (B02, B03, B04, B08, B11); normalise per band; **128 px patches** with stride; random flips and 90° rotations; **hold out 3 train locations as validation** |
| `eval/metrics.py` | Precision, recall, F1, IoU on the change class; **bootstrap 95% confidence intervals** over test tiles with a fixed seed; expected calibration error |
| `eval/oscd_baselines.py` | Run the **naive** (raw difference + Otsu) and the **spectral** engine (`engine.change_spectral` + `filters`) on the 10 test locations |
| Tests | Loader shapes; validation locations never appear in train; metrics on hand-made arrays; skip cleanly without torch (`pytest.importorskip`) |
| Done when | `eval/results/oscd_baselines.json` exists with naive and spectral numbers and intervals |

### A2. Train the PyTorch Siamese U-Net and decide (about 6 h)
| Step | Detail |
|---|---|
| Model | Lightweight **FC-Siam-diff style U-Net**, about 1 to 2 million parameters; input = the 5 bands from both dates |
| Training | Weighted BCE + Dice, AdamW, cosine schedule, early stopping on the **validation locations**, fixed seed; record GPU, time, epochs in the results file |
| Threshold | Chosen on **validation only** |
| **Decision gate** | Run the **test locations once**. If learned beats spectral on test F1: `default_method = "learned"`. Otherwise **ship spectral as default and report both honestly** |
| Output | `engine/weights/siamunet_oscd.pt` (a few MB, committed) and the learned numbers in `eval/results/` |
| Tests | Tiny forward pass; weights load; output in [0, 1] |
| Done when | Held-out learned numbers with intervals and the decision written down |

> Expect modest numbers: OSCD is small and hard (published frozen-backbone baselines are roughly F1 41 to 53). Report what you measure.

### A3. Learned detector and ONNX serving (about 4 h)
| Piece | Detail |
|---|---|
| `engine/change_learned.py` | `detect(pair, p) -> dict` (**Seam 1**): call `change_spectral.detect`, then replace `candidate` and `magnitude` with the model output; tiled inference with overlap; lazy fail-soft loading |
| `ml/export_onnx.py` | Export to `engine/weights/siamunet_oscd.onnx`. A **parity test**: the ONNX output matches PyTorch within tolerance. Add an ONNX Runtime inference path so serving does not need torch |
| Tests | Valid dict on a synthetic pair (`tests/conftest.py` has `make_stack`); ONNX parity |
| Done when | `change_learned.detect` works on a synthetic pair and on the Pune demo scene |

### A4. BIT deep mode and the LEVIR-CD evaluation (about 5 h)
| Piece | Detail |
|---|---|
| `scripts/fetch_bit.py` | Download the BIT checkpoint (as the prototype does from the BIT_CD repo); never commit it |
| `engine/change_deep.py` | Port the BIT loader and tiled inference from `prototype/pipeline.py` (torchvision shim and `safe_globals` loader). **RGB at 0.5 m only**; reject other inputs with a clear message. `type_map = built_up_gain` for candidates (Seam 1) |
| `eval/levir_eval.py` | Full LEVIR-CD **test split**: precision, recall, F1, IoU with intervals. Label the result "reproduced" or "published, not reproduced" |
| Demo (tool built: `scripts/fetch_bit.py --demo`; official page <https://justchenhao.github.io/LEVIR/>) | Add **one LEVIR-CD tile** as a demo input. **Check whether the download includes the March 2023 georeference update** (latitude and longitude per sample); use real coordinates if so, otherwise label them placeholder. LEVIR-CD is **academic use only** and follows Google Earth terms: say so in the README credits |
| Tests | BIT loads; a sample tile's F1 is within tolerance of the prototype (`slow`) |
| Done when | LEVIR numbers in `eval/results/` and `change_deep.detect` returns a valid dict |

### A5. Radar before/after mode and the live checks (about 5 h)
Data decisions are in `M8_RADAR_FLOOD_DATA.md`. **M8 stays either way** (see `DECISIONS.md` §4).

| Step | Detail |
|---|---|
| Live checks | **V-M8-1** (Planetary Computer anonymous token) and **V-M8-2** (Earthdata login + one OPERA RTC-S1 scene). They only decide the wording on stage: pass → "tested on 2026 OPERA data"; fail → "evaluated on Sen1Floods11; live 2026 fetch not verified" |
| `engine/s1.py` | Data access: Planetary Computer `sentinel-1-rtc` and OPERA RTC-S1 (`asf_search`, credentials from `.env`); windowed reads of VV and VH |
| `engine/radar.py` | Add the **before/after** mode: log-ratio with a pre-event reference from the median of 2 to 3 dry-season scenes of the same orbit; keep single-date as the fallback |
| `ml/m8_calibrate.py` | Freeze event-level parameters in `engine/params_m8.json`; never tune on a test event |
| `engine/radar_run.py` | `run(before, after, out_dir, preset="flood") -> dict` (**Seam 2**) |
| `eval/m8_opera.py` | Run the frozen parameters on 2 to 3 OPERA 2026 events: IoU, precision, recall against GFM and hand-checked points; false alarms per km² on a dry-season pair. Output `eval/results/m8_opera_2026_<event>.json` |
| Honesty | Output is an **open-water flood extent estimate**; radar misses flooded vegetation and streets |
| Done when | `radar_run.run` produces the standard files on a real scene, or the failed checks are written down and the single-date mode stays |

### A6. Results and handover (about 2 h)
| Piece | Detail |
|---|---|
| `eval/build_results.py` | Add the **Seam 3** keys (`oscd`, `levir`, `m8_change`, `speed_s_per_km2`); shrink the `not_measured` list for what is now measured; record seed and commit |
| Reproduce | A clean-checkout run reproduces the numbers |
| Checklist | `requirements-ml.txt` complete; every new module imports with torch missing; weights committed (small) or fetched by script; a "what is in this branch" note at the top of this file; limits paragraph added to `eval/README.md` |

---

## 4. Order and checkpoints

| When | Milestone |
|---|---|
| 19:00 | A1 done (OSCD loader, metrics, baselines); V-M8-1 and V-M8-2 tried; training started on the 4050 |
| 21:00 | **ML decision gate** (A2): model chosen on validation; test locations used once |
| 23:00 | A3 done (learned detector, ONNX parity); A4 started |
| 00:00 | **Merge-ready:** A4, A5, A6 done; tests and lint green |
| 03:00 | Freeze |

**Interim rule:** commit small and often; keep `ayush_backend` green (`pytest`, `ruff`).

---

## 5. Definition of done

- [x] `eval/results.json` holds held-out OSCD numbers with 95% confidence intervals for naive, spectral and learned. The learned model's epoch and threshold were chosen on the validation cities; the default method was decided once on the test cities by the rule written down beforehand (learned wins: F1 0.54 vs 0.38), with the farmland false-alarm caveat recorded next to it.
- [x] `change_learned.detect` and `change_deep.detect` follow Seam 1 and fail soft; ONNX parity passes (max difference 1.2e-5).
- [x] LEVIR-CD test-split numbers exist and are labelled **reproduced** (128 images, F1 0.9025).
- [x] `radar_run.run` follows Seams 2, 4 and 5; single-date stays as the fallback. The live access checks are written down (V-M8-1: 403 from the build environment; V-M8-2: not tried).
- [x] `ruff` and `pytest` are green without torch installed (181 pass, 3 skip; 195 with torch, on the merged tree); every engine, eval and ml module imports without torch except the three PyTorch tools, which say how to install it (`tests/test_imports_without_torch.py`). No edits to the partner's files. A clean checkout rebuilds the committed `results.json` exactly.

**Radar before/after on a real event: done on Planetary Computer, label-free** (laptop, 9 Oct; `eval/results/m8_mpc_assam_2024.json`): July 2024 Assam flood,
447 km2. New water 56.4 km2 (single-date: 82.5 km2). On a flood-free dry-season scene single-date mapping flags 11.3 km2 and before/after 0.13 km2.
No labels exist for the event, so there is no IoU, and the 3 dB criterion is still a literature default. **Still not done:** the NASA OPERA 2026
test (needs your Earthdata token, V-M8-2), so the stage wording stays "evaluated on Sen1Floods11 and a Planetary Computer 2024 event; live 2026 fetch not verified".

**How the real before/after test was run (laptop, no account needed):**
```
python -m engine.s1 --check mpc                                        # V-M8-1: must print "ok": true
python ml/fetch_s1_event.py --bbox 93.7 26.5 93.9 26.7 --event-date 2024-07-05 --out data/s1_events/assam_2024
python eval/m8_opera.py --source mpc --event assam_2024 --after data/s1_events/assam_2024/after.tif --before data/s1_events/assam_2024/ref1.tif data/s1_events/assam_2024/ref2.tif data/s1_events/assam_2024/ref3.tif --dry-after data/s1_events/assam_2024/dry_after.tif
python eval/build_results.py
```
It has no hand labels, so what it measures is: how many polygons the before/after mode keeps against single-date mapping, and the false alarms
per km2 on a dry-season pair. It does not give an IoU. Planetary Computer's sentinel-1-rtc coverage of Assam is unverified: if the search
returns no scenes the check says so, and the answer is "not available there", not a code error.

---

## 6. Extra check: generalisation beyond our demo scenes

OSCD's 10 test locations are spread worldwide, so they are our best evidence that the method is not tuned to three Maharashtra scenes. In `eval/results.json`, report the OSCD results **per location** (not only pooled), so we can show which regions work and which do not. Do not claim "works everywhere": say "evaluated on 10 worldwide locations".

**Done (9 Oct):** `eval/results.json` now has `oscd.per_location` (every test location with region, naive / spectral / learned scores, a win count and
the weak and best locations), and `eval/README.md` carries the table. Result: learned beats spectral and naive in 10 of 10 locations; it is weak in
Valencia, Norcia and Saclay; spectral beats naive in only 3 of 10 on F1. The claim is "evaluated on 10 worldwide locations; some work and some do
not". (`tests/test_build_results.py` covers the table.)
