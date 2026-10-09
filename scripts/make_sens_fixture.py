"""Make the fixture that proves the browser slider agrees with the Python mirror (and the server).

python scripts/make_sens_fixture.py   ->  web/src/test/fixtures/sens_fixture.json

A small synthetic scene is analysed by the real engine; its slider data is saved with the counts the Python
algorithm gives at several slider settings. web/src/lib/sensitivity.test.ts must reproduce every number.
"""
import base64
import json
import os
import sys


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tests"))
from conftest import BUILT, SOIL, VEG, make_stack  # noqa: E402

from engine import run, sensitivity  # noqa: E402
from engine.change_spectral import CODE  # noqa: E402


def main():
    import tempfile
    tmp = tempfile.mkdtemp()
    before = make_stack(f"{tmp}/b.tif", VEG, [((10, 40, 10, 40), SOIL), ((60, 100, 60, 100), SOIL), ((5, 8, 100, 103), SOIL)], seed=1)
    after = make_stack(f"{tmp}/a.tif", VEG, [((10, 40, 10, 40), BUILT), ((60, 100, 60, 100), BUILT), ((5, 8, 100, 103), BUILT)], seed=2)
    res = run.analyze(before, after, "encroachment")
    data = sensitivity.encode(res.det, res.pair)
    p = res.summary["params"]
    keep = sorted(CODE[t] for t in p["keep_types"])
    thr = float(res.det["threshold"])
    cases = []
    for t, min_px, k in [(thr, 3, keep), (thr, 1, keep), (thr, 20, keep), (thr, 2000, keep), (0.05, 3, keep), (0.5, 3, keep),
                         (0.9, 3, keep), (thr, 3, []), (thr, 3, [CODE["water_gain"]])]:
        mask, n = sensitivity.apply(data, t, min_px, k)
        cases.append({"threshold": t, "min_area_px": min_px, "keep_codes": k, "count": n, "pixels": int(mask.sum())})
    out = {"width": int(data.shape[1]), "height": int(data.shape[0]), "default_threshold": thr,
           "server_after_filter": res.summary["after_filter"],
           "data_base64": base64.b64encode(data.tobytes()).decode(), "cases": cases}
    path = os.path.join(ROOT, "web", "src", "test", "fixtures", "sens_fixture.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(out, f)
    print("wrote", path, "server polygons:", res.summary["after_filter"], "cases:", [c["count"] for c in cases])


if __name__ == "__main__":
    main()
