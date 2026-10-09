"""ml/eval_variants_val.py: the hybrid variant and the validation-only comparison, on synthetic cities."""
import numpy as np

from engine import change_learned as L
from engine.config import params_for
from ml import eval_variants_val as V
from tests.test_oscd_data import make_dataset

META = {"mean": [0.1] * 5, "std": [0.1] * 5, "threshold": 0.5}


def everywhere(batch):
    """A model that flags every pixel: the worst case for false alarms."""
    return np.full(batch.shape[2:], 0.9, np.float32)


def test_hybrid_drops_candidates_the_spectral_rules_cannot_name(tmp_path):
    from ml import oscd_data
    make_dataset(tmp_path / "d", ["a"])
    c = oscd_data.load_city(str(tmp_path / "d"), "a")
    from eval.oscd_baselines import to_pair as tp
    pair, p = tp(c), params_for("encroachment")
    full = L.detect(pair, p, fn=everywhere, meta=META)
    hyb = L.detect(pair, p, fn=everywhere, meta=META, spectral_typed_only=True)
    assert full["candidate"].sum() == full["valid"].sum()                       # flags everything
    assert 0 < hyb["candidate"].sum() < full["candidate"].sum() * 0.2           # only the real soil -> concrete block
    assert hyb["candidate"][30:50, 40:80].mean() > 0.9


def test_variants_report_all_three_with_intervals_and_hybrid_is_not_less_precise(tmp_path):
    from ml import oscd_data
    names = ["a", "b", "c"]
    make_dataset(tmp_path / "d", names)
    cities = [oscd_data.load_city(str(tmp_path / "d"), n) for n in names]
    r = V.evaluate_variants(cities, everywhere, META)
    assert set(r) == {"spectral", "learned", "hybrid"}
    for v in r.values():
        lo, hi = v["f1"]["ci95"]
        assert lo <= v["f1"]["value"] <= hi and v["tiles"] == 3
    assert r["hybrid"]["precision"]["value"] >= r["learned"]["precision"]["value"]
