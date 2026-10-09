"""ml/variant_study.py on tiny synthetic OSCD-shaped data: validation only, scratch weights, sane summaries."""
import json
import os

import pytest

pytest.importorskip("torch")

from conftest import BUILT, SOIL, make_stack  # noqa: E402

from engine import config_ml  # noqa: E402
from ml import oscd_data, variant_study as V  # noqa: E402
from tests.test_oscd_data import make_dataset  # noqa: E402

KW = dict(epochs=2, patience=2, batch=8, size=64, stride=64, base=8, device="cpu")


@pytest.fixture
def tiny(tmp_path):
    root = tmp_path / "oscd"
    train_c, test_c = [f"t{i}" for i in range(5)], ["x1", "x2"]
    make_dataset(root, train_c + test_c)
    (root / "images" / "train.txt").write_text(",".join(train_c))
    (root / "images" / "test.txt").write_text(",".join(test_c))
    return root, tmp_path


def test_study_uses_validation_only_never_touches_the_shipped_weights_and_summarises(tiny, monkeypatch):
    root, tmp = tiny
    loaded = []
    real = oscd_data.load_city
    monkeypatch.setattr(oscd_data, "load_city", lambda r, n, with_label=True: (loaded.append(n), real(r, n, with_label))[1])
    before = {p: os.path.getmtime(p) if os.path.exists(p) else None for p in (config_ml.LEARNED_PT, config_ml.LEARNED_ONNX, config_ml.LEARNED_META)}
    V._cache.clear()
    out = tmp / "study.json"
    r = V.study(str(root), seeds=(0, 1), variants={"cap50": 50.0, "cap3": 3.0}, out=str(out), demo_dir=str(tmp / "nowhere"), **KW)
    assert not {"x1", "x2"} & set(loaded)                                   # the test locations were never loaded
    assert set(r["val_locations"]) <= {f"t{i}" for i in range(5)} and len(r["val_locations"]) == 3
    assert before == {p: os.path.getmtime(p) if os.path.exists(p) else None for p in before}   # shipped weights untouched
    assert set(r["variants"]) == {"cap50", "cap3"} and all(len(v["runs"]) == 2 for v in r["variants"].values())
    s = r["variants"]["cap3"]["summary"]
    assert s["pipeline_f1"]["n"] == 2 and 0 <= s["pipeline_f1"]["mean"] <= 1 and s["pipeline_f1"]["sd"] >= 0
    assert s["farmland_polygons_per_km2"] is None                           # no demo scene given: reported as absent, not zero
    assert {x["seed"] for x in r["variants"]["cap3"]["runs"]} == {0, 1}
    assert json.loads(out.read_text())["split"] == "validation locations only" and "test locations were used once" in r["note"]
    for v in r["variants"].values():                                        # different seeds, the SAME validation locations
        assert len({tuple(x["val_cities"]) if "val_cities" in x else tuple(r["val_locations"]) for x in v["runs"]}) == 1


def test_a_lower_cap_lowers_the_class_weight_and_the_run_is_reproducible(tiny):
    root, tmp = tiny
    V._cache.clear()
    a = V.one_run(str(root), 50.0, 0, str(tmp), _val(root), str(tmp / "none"), device="cpu", epochs=2, patience=2, batch=8, size=64, stride=64, base=8)
    b = V.one_run(str(root), 50.0, 0, str(tmp), _val(root), str(tmp / "none"), device="cpu", epochs=2, patience=2, batch=8, size=64, stride=64, base=8)
    assert a["val_pipeline"] == b["val_pipeline"] and a["train_val_f1"] == b["train_val_f1"]     # fixed seed, same result
    V.one_run(str(root), 3.0, 0, str(tmp), _val(root), str(tmp / "none"), device="cpu", epochs=2, patience=2, batch=8, size=64, stride=64, base=8)
    capped = json.loads((tmp / "m_3.0_0_log.json").read_text())
    assert capped["pos_weight_cap"] == 3.0 and capped["pos_weight"] <= 3.0
    assert json.loads((tmp / "m_50.0_0_log.json").read_text())["pos_weight"] > 3.0


def _val(root):
    names, _ = oscd_data.city_lists(str(root))
    return oscd_data.split(names, 3, 0)[1]


def test_farmland_false_alarms_are_counted_when_a_scene_is_present(tmp_path):
    import numpy as np
    make_stack(str(tmp_path / "before.tif"), SOIL, [], seed=1)
    make_stack(str(tmp_path / "after.tif"), SOIL, [((30, 70, 30, 70), BUILT)], seed=2)
    meta = {"mean": [0.1] * 5, "std": [0.1] * 5, "threshold": 0.5}
    def always(b):
        return np.full(b.shape[2:], 0.9, np.float32)
    assert V.farmland_per_km2(always, meta, str(tmp_path)) > 0               # a model that flags everything raises polygons
    def never(b):
        return np.zeros(b.shape[2:], np.float32)
    assert V.farmland_per_km2(never, meta, str(tmp_path)) == 0
    assert V.farmland_per_km2(always, meta, str(tmp_path / "missing")) is None
