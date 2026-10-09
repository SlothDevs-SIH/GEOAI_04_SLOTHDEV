"""Deep change detector for very-high-resolution RGB (Seam 1): BIT, the Bitemporal Image Transformer.

BIT (Chen et al., IEEE TGRS 2021) was trained by its authors on LEVIR-CD: 0.5 m RGB aerial imagery of
buildings. It therefore only works on **RGB at about 0.5 m**; anything else is rejected with a plain
message (a 10 m Sentinel-2 scene would give nonsense, not an error). Candidates are typed `built_up_gain`.

Needs `python scripts/fetch_bit.py` first (downloads the checkpoint and the authors' model code; neither is
committed) and PyTorch. Loading is lazy and fail-soft: see `status()`.
"""
from __future__ import annotations

import os
import sys
import types

import numpy as np

from . import config_ml
from .change_learned import predict_tiled
from .change_spectral import CODE

REPO_DIR = os.path.join(config_ml.WEIGHTS, "BIT_CD")
MAX_PIXEL_M = 2.0           # BIT is trained at 0.5 m; allow up to 2 m before refusing
_cache: dict = {}


def load():
    """(net, torch) or raises. The authors' code targets an old torchvision, so a module shim is installed."""
    if "net" in _cache:
        return _cache["net"]
    if not os.path.exists(config_ml.BIT_CKPT) or not os.path.isdir(os.path.join(REPO_DIR, "models")):
        raise FileNotFoundError("BIT is not installed: run `python scripts/fetch_bit.py`")
    import torch
    shim = types.ModuleType("torchvision.models.utils")
    shim.load_state_dict_from_url = torch.hub.load_state_dict_from_url
    sys.modules.setdefault("torchvision.models.utils", shim)
    if REPO_DIR not in sys.path:
        sys.path.insert(0, REPO_DIR)
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", SyntaxWarning)    # the authors' code uses `is` with string literals
        import models as repo_models                      # the authors' package
        from models.networks import BASE_Transformer
    original = repo_models.resnet18
    repo_models.resnet18 = lambda pretrained=True, **kw: original(pretrained=False, **kw)   # checkpoint holds the backbone
    net = BASE_Transformer(input_nc=3, output_nc=2, token_len=4, resnet_stages_num=4, with_pos="learned",
                           enc_depth=1, dec_depth=8, decoder_dim_head=8)
    # the checkpoint also stores a numpy scalar (its best validation score): allow just that, nothing else
    np_core = getattr(np, "_core", None) or np.core
    safe = [(np_core.multiarray.scalar, "numpy.core.multiarray.scalar"), np.dtype,   # the name the file was pickled with
            type(np.dtype("float64")), type(np.dtype("float32"))]
    with torch.serialization.safe_globals(safe):
        ck = torch.load(config_ml.BIT_CKPT, map_location="cpu", weights_only=True)
    net.load_state_dict(ck["model_G_state_dict"])
    _cache["net"] = (net.eval(), torch)
    return _cache["net"]


def status() -> dict:
    try:
        load()
        return {"available": True, "input": "RGB, about 0.5 m"}
    except Exception as e:  # noqa: BLE001
        return {"available": False, "reason": f"{type(e).__name__}: {e}"}


def reset():
    _cache.clear()


def check_input(pair):
    if tuple(pair.bands) != ("red", "green", "blue"):
        raise ValueError("deep mode needs a 3-band RGB pair; this input has bands " + ", ".join(pair.bands)
                         + ". Use the spectral or learned mode for Sentinel-2.")
    if pair.pixel_m > MAX_PIXEL_M:
        raise ValueError(f"deep mode needs very-high-resolution imagery (about 0.5 m); this input is {pair.pixel_m:.1f} m "
                         "per pixel. Use the spectral or learned mode instead.")


def probability(pair, fn=None):
    """Change probability [H, W] (tiled with blended overlaps). `fn` replaces the network (for tests)."""
    check_input(pair)
    if fn is None:
        net, torch = load()

        def fn(b):
            with torch.no_grad():
                out = net(torch.from_numpy(b[:, :3]), torch.from_numpy(b[:, 3:]))
                return torch.softmax(out, 1)[0, 1].numpy()
    scale = lambda x: ((np.nan_to_num(x) - 0.5) / 0.5).astype(np.float32)   # noqa: E731 (BIT trains on [-1, 1])
    x = np.concatenate([scale(pair.before), scale(pair.after)])
    return predict_tiled(fn, x)


def detect(pair, p, fn=None, threshold=0.5):
    check_input(pair)
    prob = probability(pair, fn)
    valid = np.isfinite(pair.before).all(0) & np.isfinite(pair.after).all(0)
    cand = (prob >= threshold) & valid
    t = np.where(cand, CODE["built_up_gain"], CODE["none"]).astype(np.uint8)
    return dict(magnitude=prob.astype(np.float32), candidate=cand, type_map=t, deltas={}, ib={}, ia={},
                threshold=float(threshold), valid=valid, cva_scale=1.0)
