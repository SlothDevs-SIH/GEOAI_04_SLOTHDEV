"""Detector registry (Seam 1): which change detectors exist, whether each one can run, and how to call it.

  spectral  rule-based indices (always available)
  learned   Siamese U-Net trained on OSCD, served with ONNX Runtime (Sentinel-2)
  hybrid    the learned model proposes, the spectral rules must also name a real change type (fewer farmland false alarms)
  deep      BIT transformer for very-high-resolution RGB (about 0.5 m)

The learned and deep detectors load lazily and fail soft: when a model is missing, or its runtime is not installed,
`status()` says so and `detect` raises `ModeUnavailable` with a plain reason. Nothing here ever imports torch.
"""
from __future__ import annotations

from . import change_spectral

MODES = ("spectral", "learned", "hybrid", "deep")
SENTINEL2_MODES = ("spectral", "learned", "hybrid")       # modes that make sense for a Sentinel-2 pair


class ModeUnavailable(ValueError):
    """The requested detector cannot run on this server; the message says why in plain words."""


def status() -> dict:
    """Availability of every mode: {"spectral": {...}, "learned": {...}, "hybrid": {...}, "deep": {...}}."""
    from . import change_deep, change_learned
    learned = change_learned.status()
    return {"spectral": {"available": True}, "learned": learned,
            "hybrid": {**learned, "note": "learned model + spectral change types"}, "deep": change_deep.status()}


def available_modes() -> list[str]:
    return [m for m, s in status().items() if s.get("available")]


def detect(mode: str, pair, params):
    """Run the detector for `mode` on a Pair; returns the dict `change_spectral.detect` returns."""
    if mode == "spectral":
        return change_spectral.detect(pair, params)
    if mode in ("learned", "hybrid"):
        from . import change_learned
        s = change_learned.status()
        if not s.get("available"):
            raise ModeUnavailable(f"the learned model is not available on this server ({s.get('reason', 'unknown reason')}). "
                                  "Use the spectral mode.")
        return change_learned.detect(pair, params, spectral_typed_only=(mode == "hybrid"))
    if mode == "deep":
        from . import change_deep
        s = change_deep.status()
        if not s.get("available"):
            raise ModeUnavailable(f"the deep (BIT) model is not available on this server ({s.get('reason', 'unknown reason')}). "
                                  "Use the spectral mode for Sentinel-2.")
        return change_deep.detect(pair, params)
    raise ModeUnavailable(f"unknown mode '{mode}'; choose one of {', '.join(MODES)}")


def require(mode: str) -> None:
    """Raise ModeUnavailable now (before any work or job is created) if `mode` cannot run."""
    s = status().get(mode)
    if s is None:
        raise ModeUnavailable(f"unknown mode '{mode}'; choose one of {', '.join(MODES)}")
    if not s.get("available"):
        raise ModeUnavailable(f"the {mode} model is not available on this server ({s.get('reason', 'unknown reason')}). "
                              "Use the spectral mode.")
