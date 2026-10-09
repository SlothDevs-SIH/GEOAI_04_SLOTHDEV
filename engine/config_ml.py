"""Settings for the learned (PyTorch-trained, ONNX-served) and deep (BIT) detectors.

Kept apart from engine/config.py (the spectral engine's parameters) on purpose.
"""
import os

WEIGHTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weights")

# Learned Sentinel-2 detector: Siamese U-Net trained on OSCD (ml/train_siamunet.py)
LEARNED_PT = os.path.join(WEIGHTS, "siamunet_oscd.pt")        # PyTorch state dict (training / fallback)
LEARNED_ONNX = os.path.join(WEIGHTS, "siamunet_oscd.onnx")    # served with onnxruntime (no torch needed)
LEARNED_META = os.path.join(WEIGHTS, "siamunet_oscd.json")    # band stats, threshold chosen on validation, provenance

# Deep VHR detector: BIT (Bitemporal Image Transformer), trained on LEVIR-CD by its authors
BIT_CKPT = os.path.join(WEIGHTS, "bit_levir.pt")              # fetched by scripts/fetch_bit.py, never committed
BIT_REPO = "https://github.com/justchenhao/BIT_CD.git"
BIT_CKPT_IN_REPO = "checkpoints/BIT_LEVIR/best_ckpt.pt"
BIT_PIXEL_M = 0.5                                              # LEVIR-CD ground sampling distance

TILE = 256        # tiled inference
OVERLAP = 32
