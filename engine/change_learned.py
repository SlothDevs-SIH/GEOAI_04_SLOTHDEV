"""Learned change detector for Sentinel-2 (Seam 1): an OSCD-trained Siamese U-Net.

`detect(pair, p)` returns the same dict as `change_spectral.detect`:
  * `candidate` and `magnitude` come from the model (probability >= the threshold chosen on validation);
  * `type_map`, `deltas`, `ib`, `ia`, `valid` are kept from the spectral detector so the filters still
    work. Candidates the spectral rules cannot name become `built_up_gain` (OSCD labels urban change).

Serving uses ONNX Runtime (no torch); PyTorch is a fallback for a machine that has it. Loading is lazy and
fail-soft: a missing weights file or runtime makes the detector unavailable (`status()`), never a crash.
"""
from __future__ import annotations

import json
import os

import numpy as np

from . import change_spectral, config_ml
from .change_spectral import CODE

NEEDED = ("blue", "green", "red", "nir", "swir1")
_cache: dict = {}


def _sigmoid(z):
    return 1.0 / (1.0 + np.exp(-z))


def _starts(n, tile, step):
    if n <= tile:
        return [0]
    s = list(range(0, n - tile + 1, step))
    if s[-1] + tile < n:
        s.append(n - tile)
    return s


def predict_tiled(f, x, tile=config_ml.TILE, overlap=config_ml.OVERLAP):
    """Probability map for x [C, H, W] with any model `f([1, C, h, w]) -> [h, w]` (h and w padded to a multiple of 8).

    Overlapping tiles are blended with a cosine window, so tile seams do not show.
    """
    _, h, w = x.shape
    out, wsum = np.zeros((h, w), np.float32), np.zeros((h, w), np.float32)
    step = max(tile - overlap, 1)
    for y in _starts(h, tile, step):
        for x0 in _starts(w, tile, step):
            patch = x[:, y:y + tile, x0:x0 + tile]
            ph, pw = patch.shape[1:]
            pad = ((0, 0), (0, -ph % 8), (0, -pw % 8))
            p = f(np.pad(patch, pad, mode="edge")[None])[:ph, :pw]
            win = np.outer(np.hanning(ph + 2)[1:-1], np.hanning(pw + 2)[1:-1]).astype(np.float32) + 1e-3
            out[y:y + ph, x0:x0 + pw] += p * win
            wsum[y:y + ph, x0:x0 + pw] += win
    return out / wsum


def _normalise(x, st):
    """Same as ml.oscd_data.normalise (duplicated so serving does not need the ml/ folder)."""
    m = np.asarray(st["mean"], np.float32).reshape(-1, 1, 1)
    s = np.asarray(st["std"], np.float32).reshape(-1, 1, 1)
    return ((x - m) / s).astype(np.float32)


def _meta():
    if not os.path.exists(config_ml.LEARNED_META):
        raise FileNotFoundError(f"{os.path.basename(config_ml.LEARNED_META)} not found (train with ml/train_siamunet.py)")
    with open(config_ml.LEARNED_META) as fh:
        return json.load(fh)


def load():
    """(predict_fn, meta, backend) or raises. Cached after the first success."""
    if "model" in _cache:
        return _cache["model"]
    meta = _meta()
    if os.path.exists(config_ml.LEARNED_ONNX):
        try:
            import onnxruntime as ort
            sess = ort.InferenceSession(config_ml.LEARNED_ONNX, providers=["CPUExecutionProvider"])
            name = sess.get_inputs()[0].name
            fn = lambda b: _sigmoid(sess.run(None, {name: b.astype(np.float32)})[0][0, 0])  # noqa: E731
            _cache["model"] = (fn, meta, "onnx")
            return _cache["model"]
        except ImportError:
            pass
    if os.path.exists(config_ml.LEARNED_PT):
        import torch
        from ml.siamunet import SiamUNet
        net = SiamUNet(base=meta["base"]).eval()
        net.load_state_dict(torch.load(config_ml.LEARNED_PT, map_location="cpu", weights_only=True))

        def fn(b):
            with torch.no_grad():
                return torch.sigmoid(net(torch.from_numpy(b.astype(np.float32))))[0, 0].numpy()
        _cache["model"] = (fn, meta, "torch")
        return _cache["model"]
    raise FileNotFoundError("no learned weights: need siamunet_oscd.onnx (onnxruntime) or siamunet_oscd.pt (torch)")


def status() -> dict:
    """For /health: is the learned detector usable, and why not."""
    try:
        _, meta, backend = load()
        return {"available": True, "backend": backend, "threshold": meta.get("threshold")}
    except Exception as e:  # noqa: BLE001 - any failure means "unavailable", with the reason
        return {"available": False, "reason": f"{type(e).__name__}: {e}"}


def reset():
    _cache.clear()


def probability(pair, fn=None, meta=None):
    """Change probability [H, W] for a Pair (needs the five engine bands)."""
    missing = [b for b in NEEDED if b not in pair.bands]
    if missing:
        raise ValueError(f"the learned detector needs bands {', '.join(NEEDED)}; this input lacks {', '.join(missing)}")
    if fn is None:
        fn, meta, _ = load()
    idx = [pair.bands.index(b) for b in NEEDED]
    x = np.concatenate([_normalise(np.nan_to_num(pair.before[idx]), meta), _normalise(np.nan_to_num(pair.after[idx]), meta)])
    return predict_tiled(fn, x)


def detect(pair, p, fn=None, meta=None, threshold=None):
    if fn is None:
        fn, meta, _ = load()                       # fail fast, before any work, if the model is unavailable
    spec = change_spectral.detect(pair, p)
    prob = probability(pair, fn, meta)
    thr = float(threshold if threshold is not None else meta["threshold"])
    cand = (prob >= thr) & spec["valid"]
    t = np.where(cand, spec["type_map"], CODE["none"]).astype(np.uint8)
    t[cand & np.isin(t, [CODE["none"], CODE["other"]])] = CODE["built_up_gain"]
    return dict(magnitude=prob.astype(np.float32), candidate=cand, type_map=t, deltas=spec["deltas"], ib=spec["ib"],
                ia=spec["ia"], threshold=thr, valid=spec["valid"], cva_scale=1.0)
