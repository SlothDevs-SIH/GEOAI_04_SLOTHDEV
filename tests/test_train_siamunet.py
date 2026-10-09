"""Model, training loop, validation-only threshold and the run-once test gate (tiny synthetic data, CPU)."""
import json

import pytest

torch = pytest.importorskip("torch")

from eval import oscd_baselines  # noqa: E402
from ml import train_siamunet as T  # noqa: E402
from ml.siamunet import SiamUNet, n_params  # noqa: E402
from tests.test_oscd_data import make_dataset  # noqa: E402


def test_model_shapes_and_size():
    m = SiamUNet().eval()
    assert 0.5e6 < n_params(m) < 2.5e6                             # "about 1 to 2 million parameters"
    y = m(torch.randn(2, 10, 64, 48))
    assert y.shape == (2, 1, 64, 48) and torch.isfinite(y).all()


def test_identical_dates_give_a_symmetric_difference_path():
    """The decoder sees |f(after) - f(before)|: swapping the dates must not change the output."""
    m = SiamUNet(base=8).eval()
    x = torch.randn(1, 10, 32, 32)
    swapped = torch.cat([x[:, 5:], x[:, :5]], 1)
    assert torch.allclose(m(x), m(swapped), atol=1e-5)


@pytest.fixture
def tiny(tmp_path):
    root = tmp_path / "oscd"
    train_c, test_c = [f"t{i}" for i in range(5)], ["x1", "x2"]
    make_dataset(root, train_c + test_c)
    (root / "images" / "train.txt").write_text(",".join(train_c))
    (root / "images" / "test.txt").write_text(",".join(test_c))
    return root, tmp_path


def test_training_learns_chooses_threshold_on_val_and_gate_runs_once(tiny):
    root, tmp = tiny
    pt, meta_p, log_p = tmp / "m.pt", tmp / "m.json", tmp / "log.json"
    model, meta, log = T.train(str(root), epochs=6, batch=8, patience=6, size=64, stride=64, base=8, device="cpu",
                               out_pt=str(pt), out_meta=str(meta_p), log_path=str(log_p))
    assert meta["val_f1"] > 0.6                                        # an easy synthetic change is learnable
    assert 0.05 <= meta["threshold"] <= 0.95 and len(meta["val_cities"]) == 3
    assert not set(meta["val_cities"]) & set(meta["trained_on"])        # validation cities never trained on
    assert not set(meta["trained_on"]) & {"x1", "x2"}                   # nor the test cities
    assert json.loads(meta_p.read_text())["mean"] == meta["mean"] and pt.exists()
    assert log["epochs_run"] <= 6 and log["seed"] == 0

    out = tmp / "learned.json"
    base = tmp / "baselines.json"
    oscd_baselines.run(str(root), str(base))
    rec = T.gate(str(root), device="cpu", out=str(out), baselines=str(base), pt=str(pt), meta_path=str(meta_p))
    assert rec["default_method"] in ("learned", "spectral") and rec["learned"]["tiles"] == 2
    assert rec["learned"]["f1"]["ci95"][0] <= rec["learned"]["f1"]["value"] <= rec["learned"]["f1"]["ci95"][1]
    # the decision follows the stated rule
    assert (rec["default_method"] == "learned") == (rec["learned"]["f1"]["value"] > rec["spectral_f1"])
    with pytest.raises(SystemExit, match="already used"):               # test cities are used once
        T.gate(str(root), device="cpu", out=str(out), baselines=str(base), pt=str(pt), meta_path=str(meta_p))
    again = T.gate(str(root), force=True, device="cpu", out=str(out), baselines=str(base), pt=str(pt), meta_path=str(meta_p))
    assert again["forced_rerun"] is True


def test_training_is_reproducible_with_a_fixed_seed(tiny):
    root, tmp = tiny
    kw = dict(epochs=2, batch=8, patience=5, size=64, stride=64, base=8, device="cpu")
    a = T.train(str(root), out_pt=str(tmp / "a.pt"), out_meta=str(tmp / "a.json"), log_path=str(tmp / "al.json"), **kw)[1]
    b = T.train(str(root), out_pt=str(tmp / "b.pt"), out_meta=str(tmp / "b.json"), log_path=str(tmp / "bl.json"), **kw)[1]
    assert a["val_f1"] == b["val_f1"] and a["threshold"] == b["threshold"]
    sa, sb = torch.load(tmp / "a.pt"), torch.load(tmp / "b.pt")
    assert all(torch.equal(sa[k], sb[k]) for k in sa)


def test_validation_locations_do_not_change_with_the_training_seed(tiny):
    root, tmp = tiny
    kw = dict(epochs=1, batch=8, patience=2, size=64, stride=64, base=8, device="cpu")
    vals = []
    for seed in (0, 1, 2):
        _, meta, _ = T.train(str(root), seed=seed, out_pt=str(tmp / f"s{seed}.pt"), out_meta=str(tmp / f"s{seed}.json"),
                             log_path=str(tmp / f"s{seed}_log.json"), **kw)
        vals.append(tuple(meta["val_cities"]))
    assert len(set(vals)) == 1                                       # same split for every seed (split_seed defaults to 0)
    _, other, _ = T.train(str(root), seed=0, split_seed=5, out_pt=str(tmp / "o.pt"), out_meta=str(tmp / "o.json"),
                          log_path=str(tmp / "o_log.json"), **kw)
    assert len(other["val_cities"]) == 3                             # a different split seed is allowed to pick other locations
