# Evaluation results

Every number we quote comes from a file in `eval/results/`. Each file is produced by a script in this repo and can be regenerated.

## M8 radar flood mode (Sentinel-1)

**Data:** Sen1Floods11 v1.1 hand-labelled chips (446 chips, 11 countries; official train / valid / test splits, plus Bolivia, a country held out of every split by the dataset authors). Download with `python scripts/fetch_m8_chips.py` (India only) or see `ml/m8_experiments.py` for the full set; it's a public bucket with no login.

**Protocol (no test leakage):**
- The event threshold is an Otsu threshold on speckle-filtered VV for each flood event. It uses radar only, never labels.
- The region-growing offsets and the learned model's probability cut-off are chosen on the **valid** split.
- The learned model (gradient boosting on 7 pixel features) is trained on the **train** split only.
- Results are reported on **test**, **Bolivia** (unseen country) and **India**.
- Metric: flood-only IoU (overlap with the expert map, permanent JRC water excluded), pooled over pixels.

### `m8_sen1floods11_experiments.json` (`python ml/m8_experiments.py data/sen1floods11`)

| Method | Test (88 chips) | Bolivia, unseen country (15) | India test (14) |
|---|---|---|---|
| Naive per-chip Otsu, no filters | 0.141 | 0.337 | 0.273 |
| M8 event threshold + filters | 0.274 | 0.686 | **0.573** |
| **M8 + region growing (default)** | 0.287 | **0.697** | 0.571 |
| M8 learned classifier (optional) | **0.433** | 0.631 | 0.536 |

Precision on test: naive 0.151, threshold 0.341, region growing 0.364, learned 0.634.

**Decision:**
- **Region growing is the default.** It's the best label-free method on every set and generalises to the unseen country.
- The learned classifier is best on countries it was trained on, but worse on unseen places (Bolivia, India). M8's test events (2026 floods via NASA OPERA RTC-S1) are unseen, so it stays optional (`engine/weights/m8_gbm.joblib`).
- Region-growing offsets chosen on valid: seed 3.0 dB below the threshold, growth up to the threshold. The seed offset is at the edge of the searched grid; a wider search may help.

### `m8_sen1floods11_india.json` (`python scripts/build_m8_demo.py DATA_DIR`)

These are the numbers the web prototype shows: all 68 Assam chips (Brahmaputra flood, Sentinel-1 2016-08-12), with **one threshold pooled over all 68 chips** (−14.06 dB).

| | Naive | M8 (region growing) |
|---|---|---|
| Flood IoU | 0.175 | **0.410** |
| Precision | 0.187 | **0.791** |
| Recall | 0.744 | 0.460 |
| Detections | 129,765 blobs | **1,477 polygons** |

**Note:** the same 68 chips score 0.31–0.34 when the threshold is fitted separately on each split's India subset (the experiments file). A threshold pooled over a larger area is better, so **process whole scenes, not small tiles**.

### Limits (say these out loud)
- Sen1Floods11 has no pre-event radar, so this is **single-date water mapping**. The full M8 compares before/after scenes, which isn't measured yet.
- Radar misses flooded vegetation and flooded streets (they can look bright). The output is an **open-water flood-extent estimate**.
- Recall is moderate (0.46–0.85 depending on the set): the default favours precision, meaning few false alarms.

## Tests

```bash
python -m pytest -q tests/        # 14 tests: engine (8) + API (6)
```

## Optical, deep and radar-change evaluations (added on `ayush_backend`)

Every file below is written by code in this repo; a missing file means that evaluation has **not been run**.

| File | Script | Status in this build |
|---|---|---|
| `results/oscd_baselines.json` | `eval/oscd_baselines.py ROOT` | **Run** (on the laptop, real OSCD). Test cities, F1 with 95% intervals over cities: naive 0.24 [0.08, 0.45], spectral 0.38 [0.13, 0.52] |
| `results/oscd_learned.json` | `ml/train_siamunet.py ROOT --gate` | **Run once** (RTX 4050): learned test F1 0.54 [0.34, 0.66], precision 0.45, recall 0.67, ECE 0.076; beats spectral, so `default_method` is `learned` by the pre-set rule. The intervals overlap with spectral's |
| `results/oscd_val_variants.json` | `ml/eval_variants_val.py ROOT` | **Run** on the 3 validation cities: spectral F1 0.06, learned 0.36, hybrid 0.05 (recall 0.03): the hybrid is rejected |
| `results/learned_false_alarms.json` | `eval/learned_false_alarms.py` | **Run**: polygons per km2 on the no-change farmland scene: spectral 0.62, learned 7.41, hybrid 0.34 |
| `results/levir_bit.json` | `eval/levir_eval.py data/levir_test --full-split` | **Run on the full official LEVIR-CD test split (128 images), labelled "reproduced"**: BIT F1 0.9025 [0.890, 0.912], IoU 0.822, vs naive 0.137. Published BIT: F1 0.8931, IoU 0.8068 (ours is about a point higher; the published value is inside our interval). Metrics are pooled over images; inference tiles 256 px with blended overlaps |
| `results/m8_mpc_assam_2024.json` | `ml/fetch_s1_event.py` then `eval/m8_opera.py --source mpc` | **Run** on the real July 2024 Assam flood (Planetary Computer, 10 m, 447 km2; flood scene 6 Jul 2024, three dry-season references on the same orbit). No hand labels, so no IoU. New water found: **56.4 km2**; single-date mapping of the same scene gives 82.5 km2 (it also counts water that was already there). On a flood-free dry-season scene single-date mapping flags **11.3 km2 (230 polygons)**, before/after flags **0.13 km2 (29 polygons)**: the reference removes about 99% of single-date's false-alarm area. The result file records that it was rerun with `--force` to add the single-date comparison |
| `results/m8_opera_2026_<event>.json` | `eval/m8_opera.py` | Not run: needs an Earthdata token. Same scoring as the Planetary Computer row above |

Limits to say out loud: seven tiles is a smoke test, not a benchmark (the interval is wide); the radar before/after mode is
tested on synthetic scenes only, because Sen1Floods11 has no pre-event radar, so its 3 dB change criterion is a literature
default and is not measured here; OSCD is small and hard (published frozen-backbone baselines are roughly F1 41 to 53), so
expect modest learned numbers and a spectral default if the learned model does not win on the test cities.

**Read this before choosing the demo default.** The learned model wins on OSCD (urban change) but raises about 12x more
false alarms per km2 than spectral on our farmland no-change scene, because it was trained only on urban change. The
hybrid (model proposes, spectral rules must agree) fixes the farmland scene but loses almost all real change on OSCD, so
it is not a fix. A milder variant that keeps the seasonal filter active only reduced the farmland scene from 7.4 to 4.1
per km2 and was not kept. The honest position: learned is the better detector for urban change, spectral is the safer
false-alarm-first mode for farmland-like scenes, and both are offered. Learned speed in `results.json` (0.003 s/km2) was
timed on the GPU with PyTorch; ONNX on CPU is about 0.03 s/km2.

## Reproduce every number

Seeds are fixed (bootstrap seed 0, training seed 0, the validation cities are chosen by seed 0) and every result file
records the commit it came from. Commands run from the repository root; datasets go under `data/`, which git ignores.

| Result | Command | Needs | Time |
|---|---|---|---|
| `results.json` (assembles everything below) | `python eval/build_results.py` | the result files only | seconds |
| Radar flood, Sen1Floods11 splits | `python scripts/fetch_m8_chips.py data/sen1floods11` then `python ml/m8_experiments.py data/sen1floods11` | public bucket, no login | about 8 min |
| Radar demo scene, Assam | `python scripts/build_m8_demo.py data/sen1floods11` | the chips above | seconds |
| False-alarm ablation | `python eval/ablation.py` | `python scripts/fetch_demo_scenes.py` first | seconds |
| OSCD baselines (naive, spectral) | `python eval/oscd_baselines.py data/oscd` | OSCD images, train labels and test labels | about 1 min |
| Learned model | `python ml/train_siamunet.py data/oscd`, then `... --gate` (once), then `python ml/export_onnx.py` | OSCD, GPU recommended | minutes on an RTX 4050 |
| Validation comparison | `python ml/eval_variants_val.py data/oscd` | the trained model | about 1 min |
| Learned false alarms on the demo scenes | `python eval/learned_false_alarms.py` | demo scenes, trained model | seconds |
| BIT on LEVIR-CD | `python scripts/fetch_bit.py`, then `python eval/levir_eval.py data/levir_test --full-split` | the 128-image LEVIR-CD test split | minutes |
| Radar before/after on a real event | `python ml/fetch_s1_event.py ...` then `python eval/m8_opera.py --source mpc ...` | Planetary Computer (no account) | minutes |
| Radar on 2026 OPERA events | `python eval/m8_opera.py --source opera ...` | Earthdata token in `.env` | minutes |

Where the data comes from: OSCD images and train labels from the Kaggle copy `soumikrakshit/onera-satellite-change-detection-dataset`;
the 10 test-city labels from `hkristen/oscd` on Hugging Face (`... - Test Labels.zip`), unzipped next to the images; LEVIR-CD test
split from `satellite-image-deep-learning/LEVIR-CD` (`test.zip`). The test cities and the gate are used once: `--gate` refuses a second
run unless `--force`, and `m8_opera.py` refuses to rescore an event.

The Python tests need no data: `python -m pytest -q` (181 pass and 3 skip without torch, 195 with it).

**Reading the Assam 2024 result.** The reference clearly helps on false alarms (0.13 km2 against 11.3 km2 on a flood-free scene). Two honest
limits: (1) there is no ground truth for the flood itself, so 56 km2 is plausible but unverified, and the 3 dB change criterion remains a
literature default; (2) before/after reports more, smaller polygons than single-date on the flood scene (977 against 606), because removing
the water that was already there splits big connected water bodies into fragments. "Flood extent" here means new water beyond the normal
river, not total water. Both runs share the same event threshold (Otsu on the flood scene, -11.3 dB) and the same frozen parameters. The dry
scene shares months with the references (Jan to Mar), so it does not test monsoon-season look-alikes.

## OSCD per location (generalisation beyond our demo scenes)

The 10 OSCD test locations are spread over four continents, so they are our evidence that the method is not tuned to three Maharashtra
scenes. Pooled scores hide the spread, so `results.json` (`oscd.per_location`) and this table report every location. One tile per location,
so there is no interval per row (the pooled results carry the bootstrap). Sorted by the learned model's F1:

| Location | Region | Naive F1 | Spectral F1 | Learned F1 | Learned P / R |
|---|---|---|---|---|---|
| lasvegas | North America | 0.70 | 0.64 | **0.76** | 0.71 / 0.83 |
| montpellier | Europe | 0.53 | 0.34 | **0.75** | 0.69 / 0.83 |
| chongqing | Asia (East) | 0.42 | 0.17 | **0.59** | 0.63 / 0.56 |
| dubai | Asia (Middle East) | 0.45 | 0.40 | **0.56** | 0.57 / 0.54 |
| rio | South America | 0.32 | 0.17 | **0.53** | 0.44 / 0.67 |
| brasilia | South America | 0.07 | 0.11 | **0.49** | 0.38 / 0.67 |
| milano | Europe | 0.01 | 0.08 | **0.36** | 0.76 / 0.24 |
| saclay_w | Europe | 0.02 | 0.02 | **0.20** | 0.11 / 0.78 |
| norcia | Europe | 0.04 | 0.01 | **0.11** | 0.06 / 0.75 |
| valencia | Europe | 0.01 | 0.02 | **0.03** | 0.01 / 0.32 |

What this shows, and what it does not:
- **Learned beats spectral and naive in all 10 locations.** It is strong in Las Vegas, Montpellier, Chongqing and Dubai (F1 0.56 to 0.76) and
  **weak in Valencia (0.03), Norcia (0.11) and Saclay (0.20)**: low precision there, i.e. it flags much that the labels do not call change.
- **Spectral beats naive in only 3 of 10 locations** on F1. Its pooled advantage (0.38 against 0.24) comes from a few locations: it is built
  to keep false alarms low and gives up recall (pooled recall 0.29), which F1 punishes. Say "fewer false alarms", not "better F1".
- Locations differ a lot in how much changed (OSCD labels are about 98% no-change), so scores are not comparable across rows as a ranking of
  difficulty. The claim we can make is "evaluated on 10 worldwide locations; some work and some do not", not "works everywhere".
