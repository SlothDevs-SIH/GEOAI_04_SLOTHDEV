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
| `results/oscd_baselines.json` | `eval/oscd_baselines.py ROOT` | Not run: OSCD host blocked here. Naive and spectral on the 10 test cities with 95% bootstrap intervals over cities |
| `results/oscd_learned.json` | `ml/train_siamunet.py ROOT --gate` | Not run: no GPU or OSCD here. Test cities are used once; learned becomes the default only if its test F1 beats spectral |
| `results/levir_bit.json` | `eval/levir_eval.py` | **Run on 7 labelled sample tiles** from the BIT repository, not the test split. BIT F1 0.928 [0.908, 0.951] vs naive 0.303 [0.217, 0.400]. The published F1 89.31 is quoted, not reproduced. Train and validation tiles in that folder are excluded |
| `results/m8_opera_2026_<event>.json` | `eval/m8_opera.py` | Not run: needs OPERA scenes (Earthdata). Frozen parameters, labels / check points / dry-season false alarms |

Limits to say out loud: seven tiles is a smoke test, not a benchmark (the interval is wide); the radar before/after mode is
tested on synthetic scenes only, because Sen1Floods11 has no pre-event radar, so its 3 dB change criterion is a literature
default and is not measured here; OSCD is small and hard (published frozen-backbone baselines are roughly F1 41 to 53), so
expect modest learned numbers and a spectral default if the learned model does not win on the test cities.
