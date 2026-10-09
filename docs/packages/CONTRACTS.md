# Shared Contracts: the seams between `soham_backend` and `ayush_backend`

Both packages are built **at the same time** and never wait for each other. They only meet at the
seams below, which are written against the code that is **already on `main`**.
**The seams are frozen.** If one must change, tell the other person and edit this file in the same commit.

Packages: [`soham_backend.md`](soham_backend.md) · [`ayush_backend.md`](ayush_backend.md) · Decisions: [`../DECISIONS.md`](../DECISIONS.md)

---

## What already exists on `main` (the starting point)

| Piece | File | State |
|---|---|---|
| Read and align a before/after pair (`Pair`) | `engine/ingest.py` | Done |
| Spectral detector with change types and the sealed-surface rule | `engine/change_spectral.py` | Done |
| False-alarm filters with drop counts | `engine/filters.py` | Done |
| Polygons, attributes, tiers (tuned for 10 m) | `engine/vectorise.py`, `engine/attributes.py` | Done |
| Impact (WorldCover) and quality flags | `engine/impact.py`, `engine/quality.py` | Done |
| Exports and the PDF report with QR | `engine/export.py`, `engine/report.py` | Done |
| Runner and CLI | `engine/run.py` (`analyze`, `write_outputs`, `run_radar`) | Done; **only `spectral` is wired** |
| Radar flood engine (single date) | `engine/radar.py` | Done, measured on Sen1Floods11 |
| API with demo routes, jobs, exports, review | `api/main.py` | Done |
| React web app (swipe map, toggle, tiers, review, exports, Accuracy page) | `web/` | Done |
| Ablation and results builder | `eval/ablation.py`, `eval/build_results.py` | Done |
| CI and Dockerfile | `.github/workflows/ci.yml`, `Dockerfile` | Done |
| Tests | `tests/` (37 pass), `web/` (Vitest, Playwright) | Done |

**Still missing on `main`:** the OSCD-trained model (PyTorch), BIT deep mode, composites and
persistence, ONNX and the browser engine, the offline PWA, optical accuracy against labels, the
radar before/after mode and its OPERA test, and a real deployment.

---

## Seam 1: the detector plug-in

Every detector is a file `engine/change_<name>.py` with **one function** that returns the same dict
that `change_spectral.detect` returns today:

```python
def detect(pair: engine.ingest.Pair, p: engine.config.Params) -> dict
```

| Key | Type | Meaning |
|---|---|---|
| `magnitude` | float32 array (H, W), 0 to 1 | How strongly each pixel changed (a model probability is fine) |
| `candidate` | bool array | Pixels flagged as changed, **before** the filters |
| `type_map` | uint8 array | Codes from `change_spectral.CODE`: none 0, water_gain 1, water_loss 2, built_up_gain 3, vegetation_loss 4, vegetation_gain 5, other 6 |
| `deltas` | dict of float arrays | Index differences (ndvi, ndwi, ndbi, swir_blue). May be empty for a model that has none |
| `ib`, `ia` | dicts of arrays | Indices before and after (may be empty) |
| `threshold` | float | The cut-off that was applied |
| `valid` | bool array | Pixels usable in both images |
| `cva_scale` | float | Scale used for the magnitude (any number for a model) |

**Important:** `filters.apply` treats types `vegetation_gain` and `other` as **seasonal** and drops
them. A learned detector must therefore set `type_map` to a real type for its candidates:
- **Learned (Sentinel-2):** call `change_spectral.detect(pair, p)` first, keep its `type_map`, `deltas`, `ib`, `ia`, `valid`; then **replace** `candidate` with `prob >= threshold` and `magnitude` with `prob`. Where no spectral type applies, set `built_up_gain` (OSCD labels urban change).
- **Deep (BIT, RGB):** set `type_map` to `built_up_gain` for every candidate; `deltas` and indices are empty.

**Who wires it in:** `engine/run.py` is owned by **Soham**. Today `analyze()` raises
`NotImplementedError` for any mode but `spectral`. Soham adds a small registry,
`engine/detectors.py`, that imports `engine.change_learned` and `engine.change_deep` **lazily** and
skips any that are missing, and `analyze()` calls it. A missing detector never crashes: `/health`
reports it as `false` and the API answers `501` with a plain message.

---

## Seam 2: the radar run

Radar keeps its own runner. `engine.run.run_radar` is the current one-date version. For the
before/after mode, Ayush adds `engine/radar.py` functions and a runner with this signature:

```python
# engine/radar_run.py   (Ayush)
def run(before: str | None, after: str, out_dir: str, preset: str = "flood", **overrides) -> dict
```

- Writes `changes.geojson`, `summary.json` (and the other files when possible) using the same
  helpers as `run.write_outputs`. Ayush **calls** `engine/export.py`; he never edits it.
- Returns a summary dict with the keys in Seam 5.
- Polygon properties follow Seam 4.
- Soham's API calls it for `mode=radar` jobs when it exists and otherwise falls back to
  `run.run_radar` (today's behaviour).

---

## Seam 3: the results file

`eval/results.json` is **written by `eval/build_results.py` (Ayush)** and **read** by the API
(`GET /metrics`) and the web Accuracy page. Soham's evidence goes in a **separate** file,
`eval/ablation.json`, which `build_results.py` already merges. Neither person edits the other's
files by hand.

Ayush **adds** these keys (existing keys are never renamed or removed):

```json
{
  "oscd": {
    "split": { "train_locations": 11, "val_locations": ["..."], "test_locations": 10 },
    "methods": {
      "naive":    { "precision": {"value": 0.0, "ci95": [0.0, 0.0]}, "recall": {}, "f1": {}, "iou": {} },
      "spectral": {},
      "learned":  {}
    },
    "default_method": "spectral",
    "threshold": 0.5,
    "ece": 0.0
  },
  "levir": { "bit": { "f1": {}, "iou": {} }, "note": "reproduced | published, not reproduced" },
  "m8_change": { "events": [], "note": "evaluated on Sen1Floods11; live 2026 fetch not verified" },
  "speed_s_per_km2": { "spectral": 0.0, "learned": 0.0 }
}
```

The `not_measured` list in the file shrinks as items are measured. Rules: numbers only come from
code that ran; `ci95` is a bootstrap interval; test locations are used once.

---

## Seam 4: the polygon properties

Every output polygon, from any detector, has the properties `attributes.build` already writes:

`id, area_m2, area_ha, magnitude, confidence, needs_review, centroid_lat, centroid_lon, change_type,
reason, score, tier, review_status`

Radar polygons use `change_type = "water_gain"` and keep their extra properties.

---

## Seam 5: the run summary

`run.analyze` writes these keys to `summary.json` (and radar runners return the same where they apply):

`mode, preset, raw_detections, after_filter, dropped, total_area_m2, by_tier, by_type, runtime_s,
area_km2, s_per_km2, change_threshold, impact, quality, warnings, sources, limits, params`

New keys may be **added** by either side. Existing keys are never renamed or removed.

---

## Seam 6: weights, dependencies, configuration

| Item | Rule |
|---|---|
| Small weights | `engine/weights/siamunet_oscd.pt` and `siamunet_oscd.onnx` are **committed** (a few MB), next to `m8_gbm.joblib`. |
| BIT checkpoint | Not committed. `scripts/fetch_bit.py` downloads it (as the prototype does from the BIT_CD repo). |
| Loading | Lazy and fail-soft: a missing file or missing torch makes the detector unavailable, not a crash. |
| Dependencies | Soham owns `requirements.txt` (core; CI installs only this). Ayush owns `requirements-ml.txt` (torch, torchvision, onnx, einops). Serving adds **`onnxruntime`** to the core file once the ONNX model exists (Soham adds it on request). |
| ML tests | Use `pytest.importorskip("torch")` or the `slow` marker so CI stays green without torch. |
| Config | `engine/config.py` is Soham's. Ayush keeps model settings in `engine/config_ml.py`. |
| Secrets | `.env` only. Ayush owns the Earthdata and GFM token names in `.env.example`. |

---

## File ownership (no overlaps)

| Path | Owner |
|---|---|
| `engine/run.py`, `ingest.py`, `change_spectral.py`, `filters.py`, `vectorise.py`, `attributes.py`, `impact.py`, `quality.py`, `export.py`, `report.py`, `config.py`, `s2.py`, `detectors.py` (new), `composite.py` (new), `persistence.py` (new) | **Soham** |
| `api/`, `web/`, `scripts/` (except those listed under Ayush), `Dockerfile`, `.github/`, `requirements.txt`, `eval/ablation.py` | **Soham** |
| `engine/change_learned.py`, `change_deep.py`, `radar.py`, `radar_run.py`, `s1.py`, `config_ml.py`, `engine/weights/` | **Ayush** |
| `ml/` (all), `eval/build_results.py`, `eval/results/`, `eval/results.json`, `eval/metrics.py`, `scripts/fetch_bit.py`, `scripts/build_m8_demo.py`, `scripts/fetch_m8_chips.py`, `requirements-ml.txt` | **Ayush** |
| `tests/` | Add **new files** only; the existing ones are changed by their owner |
| `docs/` | Each person edits only their own package file and their own notes |

---

## Integration plan (Soham, after both packages are merge-ready)

| Step | What | Check |
|---|---|---|
| 1 | Merge `ayush_backend` into `soham_backend` (no shared files) | `pytest` and `ruff` green |
| 2 | `detectors.py` registers `learned` and `deep`; `analyze()` dispatches by mode | Learned detector runs on a synthetic pair and on a real scene |
| 3 | The API accepts `mode=learned` and `mode=deep`; `mode=radar` uses `radar_run` when present | `/health` shows the true state of each model |
| 4 | `build_results.py` run; Accuracy page shows OSCD and LEVIR rows | New numbers appear with their intervals |
| 5 | Rebuild demo assets with the final default detector (`scripts/export_demo_assets.py`) | The static demo folder opens in the web app |
| 6 | Deploy; live URL answers `/health` and the site works with the API off | CI green |

**Target times:** both merge-ready by **00:00**, integration **00:00 to 02:00**, freeze **03:00**.
