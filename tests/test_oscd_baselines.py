"""eval/oscd_baselines.py end to end on a synthetic OSCD-shaped folder."""
import json

from eval import oscd_baselines as B
from tests.test_oscd_data import make_dataset


def test_baselines_run_and_report_intervals(tmp_path):
    cities = ["c1", "c2", "c3"]
    make_dataset(tmp_path / "data", cities)
    out = tmp_path / "res.json"
    r = B.run(str(tmp_path / "data"), str(out), cities=cities)
    assert json.loads(out.read_text())["test_cities"] == cities
    for m in ("naive", "spectral"):
        v = r["methods"][m]
        assert set(v) >= {"precision", "recall", "f1", "iou", "per_city", "s_per_km2", "tiles"} and v["tiles"] == 3
        lo, hi = v["f1"]["ci95"]
        assert lo <= v["f1"]["value"] <= hi
        assert set(v["per_city"]) == set(cities)
    # an easy synthetic change (soil -> concrete): both find it; spectral is not worse than naive
    assert r["methods"]["spectral"]["f1"]["value"] > 0.8
    assert r["methods"]["naive"]["recall"]["value"] > 0.8
    assert r["methods"]["spectral"]["precision"]["value"] >= r["methods"]["naive"]["precision"]["value"] - 0.05
