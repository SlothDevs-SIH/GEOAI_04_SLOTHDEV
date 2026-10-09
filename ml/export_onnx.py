"""Export the trained Siamese U-Net to ONNX and check that ONNX Runtime matches PyTorch.

python ml/export_onnx.py            -> engine/weights/siamunet_oscd.onnx

Serving uses ONNX Runtime (a small CPU wheel) instead of PyTorch. Height and width are dynamic, so the
tiled inference in engine/change_learned.py works at any size. Raises if the two runtimes disagree.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
import torch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from engine import config_ml  # noqa: E402
from ml.siamunet import SiamUNet  # noqa: E402


def export(pt=config_ml.LEARNED_PT, meta_path=config_ml.LEARNED_META, onnx_path=config_ml.LEARNED_ONNX,
           tolerance=1e-4, seed=0) -> float:
    with open(meta_path) as fh:
        meta = json.load(fh)
    net = SiamUNet(base=meta["base"]).eval()
    net.load_state_dict(torch.load(pt, map_location="cpu", weights_only=True))
    dummy = torch.randn(1, 2 * net.bands, 64, 64)
    torch.onnx.export(net, (dummy,), onnx_path, input_names=["x"], output_names=["logits"], opset_version=17,
                      dynamic_axes={"x": {0: "n", 2: "h", 3: "w"}, "logits": {0: "n", 2: "h", 3: "w"}}, dynamo=False)
    return parity(net, onnx_path, tolerance, seed)


def parity(net, onnx_path, tolerance=1e-4, seed=0, shapes=((64, 64), (96, 128))) -> float:
    """Max absolute logit difference between PyTorch and ONNX Runtime, on shapes that differ from export time."""
    import onnxruntime as ort
    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    rng = np.random.default_rng(seed)
    worst = 0.0
    for h, w in shapes:
        x = rng.normal(size=(1, 2 * net.bands, h, w)).astype(np.float32)
        with torch.no_grad():
            ref = net(torch.from_numpy(x)).numpy()
        got = sess.run(None, {"x": x})[0]
        worst = max(worst, float(np.abs(ref - got).max()))
    if worst > tolerance:
        raise AssertionError(f"ONNX output differs from PyTorch by {worst:.2e} (> {tolerance:.0e})")
    return worst


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tolerance", type=float, default=1e-4)
    a = ap.parse_args()
    print("max |torch - onnx| =", export(tolerance=a.tolerance), "->", config_ml.LEARNED_ONNX)
