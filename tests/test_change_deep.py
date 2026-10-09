"""BIT deep mode: input guards, Seam 1 contract (stub network), and the real model on a sample tile (slow)."""
import os

import numpy as np
import pytest
from rasterio.transform import from_origin

from engine import change_deep as D, config_ml
from engine.change_spectral import CODE
from engine.ingest import Pair


def rgb_pair(h=96, w=112, px=0.5, change=True):
    rng = np.random.default_rng(0)
    b = rng.uniform(0.3, 0.5, (3, h, w)).astype(np.float32)
    a = b.copy()
    if change:
        a[:, 20:60, 30:80] = 0.9
    return Pair(before=b, after=a, transform=from_origin(0, 0, px, px), crs="EPSG:32614", bands=("red", "green", "blue"))


def stub(b):
    """Pretend network: change probability = |after - before| of the first channel, squashed."""
    return np.clip(np.abs(b[0, 3] - b[0, 0]) * 2, 0, 1).astype(np.float32)


def test_detect_follows_seam_1_and_types_candidates_as_built_up_gain():
    pair = rgb_pair()
    d = D.detect(pair, None, fn=stub)
    for k in ("magnitude", "candidate", "type_map", "deltas", "ib", "ia", "threshold", "valid", "cva_scale"):
        assert k in d, k
    assert d["magnitude"].shape == (96, 112) and d["magnitude"].dtype == np.float32
    assert d["candidate"][30:50, 40:70].all() and not d["candidate"][70:, :].any()
    assert (d["type_map"][d["candidate"]] == CODE["built_up_gain"]).all() and (d["type_map"][~d["candidate"]] == 0).all()
    assert d["deltas"] == {} and d["ib"] == {} and d["ia"] == {}


def test_rejects_sentinel2_bands_with_a_plain_message():
    pair = rgb_pair()
    pair.bands = ("blue", "green", "red", "nir", "swir1")
    with pytest.raises(ValueError, match="3-band RGB"):
        D.detect(pair, None, fn=stub)


def test_rejects_coarse_pixels_with_a_plain_message():
    with pytest.raises(ValueError, match="very-high-resolution"):
        D.detect(rgb_pair(px=10.0), None, fn=stub)


def test_unavailable_without_fetch_is_not_a_crash(tmp_path, monkeypatch):
    monkeypatch.setattr(config_ml, "BIT_CKPT", str(tmp_path / "none.pt"))
    D.reset()
    s = D.status()
    assert s["available"] is False and "fetch_bit" in s["reason"]


BIT_READY = os.path.exists(config_ml.BIT_CKPT) and os.path.isdir(os.path.join(D.REPO_DIR, "samples"))


@pytest.mark.slow
@pytest.mark.skipif(not BIT_READY, reason="run python scripts/fetch_bit.py first")
def test_real_bit_matches_the_prototype_on_a_labelled_sample_tile():
    torch = pytest.importorskip("torch")  # noqa: F841
    from PIL import Image

    from eval import levir_eval
    root = os.path.join(D.REPO_DIR, "samples")
    names = levir_eval.files(root)
    assert names and all(n.startswith("test_") for n in names)       # train/val tiles are never scored
    name = "test_121_0768_0256.png"
    d = D.detect(levir_eval.read_pair(root, name), None)
    gt = np.asarray(Image.open(os.path.join(root, "label", name)).convert("L")) > 127
    tp = (d["candidate"] & gt).sum()
    f1 = 2 * tp / (d["candidate"].sum() + gt.sum())
    assert f1 > 0.8                                                  # measured 0.89 on this tile
    assert D.status()["available"] is True


def test_levir_eval_scores_only_labelled_test_tiles(tmp_path):
    from PIL import Image

    from eval import levir_eval
    for d in ("A", "B", "label"):
        (tmp_path / d).mkdir()
    img = Image.fromarray(np.full((32, 32, 3), 100, np.uint8))
    for name in ("test_1.png", "train_2.png", "val_3.png", "test_nolabel.png"):
        img.save(tmp_path / "A" / name)
        img.save(tmp_path / "B" / name)
        if name != "test_nolabel.png":
            img.save(tmp_path / "label" / name)
    assert levir_eval.files(str(tmp_path)) == ["test_1.png"]
