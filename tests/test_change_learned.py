"""Learned detector: ONNX parity, tiled inference, Seam 1 contract, fail-soft loading. Untrained weights, tmp paths."""
import json

import numpy as np
import pytest

torch = pytest.importorskip("torch")
pytest.importorskip("onnxruntime")
pytest.importorskip("onnx")

from conftest import BUILT, SOIL, make_stack  # noqa: E402

from engine import change_learned as L, config_ml, ingest  # noqa: E402
from engine.change_spectral import CODE  # noqa: E402
from engine.config import params_for  # noqa: E402
from ml.export_onnx import export, parity  # noqa: E402
from ml.siamunet import SiamUNet  # noqa: E402

META = {"bands": ["B02", "B03", "B04", "B08", "B11"], "mean": [0.1] * 5, "std": [0.1] * 5, "threshold": 0.5, "base": 8}


@pytest.fixture
def weights(tmp_path, monkeypatch):
    """A random-weight model exported to tmp: tests the plumbing, not accuracy."""
    torch.manual_seed(0)
    pt, js, onnx = tmp_path / "m.pt", tmp_path / "m.json", tmp_path / "m.onnx"
    torch.save(SiamUNet(base=8).state_dict(), pt)
    js.write_text(json.dumps(META))
    for k, v in (("LEARNED_PT", pt), ("LEARNED_META", js), ("LEARNED_ONNX", onnx)):
        monkeypatch.setattr(config_ml, k, str(v))
    L.reset()
    yield tmp_path
    L.reset()


def test_onnx_matches_pytorch_at_other_sizes(weights):
    worst = export(str(weights / "m.pt"), str(weights / "m.json"), str(weights / "m.onnx"))
    assert worst < 1e-4


def test_parity_check_fails_loudly_when_models_differ(weights):
    export(str(weights / "m.pt"), str(weights / "m.json"), str(weights / "m.onnx"))
    other = SiamUNet(base=8).eval()                     # different random weights
    with pytest.raises(AssertionError, match="differs"):
        parity(other, str(weights / "m.onnx"))


def test_tiled_prediction_equals_untiled_for_a_pointwise_model():
    x = np.random.default_rng(0).normal(size=(10, 150, 170)).astype(np.float32)
    def f(b):                                            # per-pixel, so blending must reproduce it exactly
        return 1 / (1 + np.exp(-b[0].mean(0)))
    whole = f(x[None])
    tiled = L.predict_tiled(f, x, tile=64, overlap=16)
    assert tiled.shape == whole.shape and np.allclose(tiled, whole, atol=1e-5)


def test_tiled_prediction_smaller_than_one_tile_and_odd_sizes():
    x = np.ones((10, 13, 21), np.float32)
    seen = []
    def f(b):
        seen.append(b.shape[2:])
        return np.full(b.shape[2:], 0.7, np.float32)
    p = L.predict_tiled(f, x, tile=64, overlap=8)
    assert p.shape == (13, 21) and np.allclose(p, 0.7) and all(h % 8 == 0 and w % 8 == 0 for h, w in seen)


def _pair(tmp_path):
    b = make_stack(str(tmp_path / "b.tif"), SOIL, [], seed=1)
    a = make_stack(str(tmp_path / "a.tif"), SOIL, [((30, 70, 30, 70), BUILT)], seed=2)
    return ingest.read_pair(b, a)


def test_detect_follows_seam_1_with_onnx_backend(weights):
    export(str(weights / "m.pt"), str(weights / "m.json"), str(weights / "m.onnx"))
    pair = _pair(weights)
    d = L.detect(pair, params_for("general"))
    h, w = pair.before.shape[1:]
    for k in ("magnitude", "candidate", "type_map", "deltas", "ib", "ia", "threshold", "valid", "cva_scale"):
        assert k in d, k
    assert d["magnitude"].shape == (h, w) and d["magnitude"].dtype == np.float32
    assert 0.0 <= d["magnitude"].min() and d["magnitude"].max() <= 1.0
    assert d["candidate"].dtype == bool and d["type_map"].dtype == np.uint8
    assert (d["type_map"][~d["candidate"]] == CODE["none"]).all()
    # every candidate carries a real type: filters.apply would drop 'other' as seasonal
    assert not (d["candidate"] & np.isin(d["type_map"], [CODE["none"], CODE["other"]])).any()
    assert L.status() == {"available": True, "backend": "onnx", "threshold": 0.5}


def test_threshold_controls_the_candidates_and_types_are_kept(weights):
    export(str(weights / "m.pt"), str(weights / "m.json"), str(weights / "m.onnx"))
    pair = _pair(weights)
    p = params_for("general")
    none = L.detect(pair, p, threshold=1.01)
    assert not none["candidate"].any()
    everything = L.detect(pair, p, threshold=-0.01)
    assert everything["candidate"].sum() == everything["valid"].sum()
    # inside the real change the spectral type (built_up_gain: soil -> concrete) is kept
    assert (everything["type_map"][40:60, 40:60] == CODE["built_up_gain"]).mean() > 0.9


def test_torch_backend_matches_onnx_backend(weights):
    pair = _pair(weights)
    export(str(weights / "m.pt"), str(weights / "m.json"), str(weights / "m.onnx"))
    pe = L.probability(pair)                                       # onnx
    (weights / "m.onnx").rename(weights / "gone.onnx")
    L.reset()
    assert L.status()["backend"] == "torch"
    pt = L.probability(pair)
    assert np.abs(pe - pt).max() < 1e-3


def test_unavailable_when_weights_are_missing_not_a_crash(tmp_path, monkeypatch):
    monkeypatch.setattr(config_ml, "LEARNED_META", str(tmp_path / "none.json"))
    L.reset()
    s = L.status()
    assert s["available"] is False and "not found" in s["reason"]
    with pytest.raises(FileNotFoundError):
        L.detect(None, None)


def test_inputs_without_the_five_bands_are_rejected_clearly(weights):
    pair = _pair(weights)
    rgb = ingest.Pair(before=pair.before[:3], after=pair.after[:3], transform=pair.transform, crs=pair.crs,
                      bands=("blue", "green", "red"))
    with pytest.raises(ValueError, match="needs bands"):
        L.probability(rgb, lambda b: np.zeros(b.shape[2:]), META)
