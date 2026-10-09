"""The live sensitivity slider: the data file, and the Python mirror of the browser algorithm."""
import json
import os

import numpy as np
from conftest import BUILT, SOIL, VEG, make_stack

from engine import preview, run, sensitivity
from engine.change_spectral import CODE


def analysed(tmp_path, preset="encroachment"):
    before = make_stack(str(tmp_path / "b.tif"), VEG, [((10, 40, 10, 40), SOIL), ((60, 100, 60, 100), SOIL)], seed=1)
    after = make_stack(str(tmp_path / "a.tif"), VEG, [((10, 40, 10, 40), BUILT), ((60, 100, 60, 100), BUILT)], seed=2)
    return run.analyze(before, after, preset)


def settings(res):
    p = res.summary["params"]
    keep = sorted(CODE[t] for t in p["keep_types"])
    return float(res.det["threshold"]), int(np.ceil(p["min_area_m2"] / res.pair.pixel_m ** 2)), keep


def test_mirror_reproduces_the_server_result_at_the_default_settings(tmp_path):
    res = analysed(tmp_path)
    data = sensitivity.encode(res.det, res.pair)
    thr, min_px, keep = settings(res)
    mask, n = sensitivity.apply(data, thr, min_px, keep)
    assert n == res.summary["after_filter"] == 2
    assert mask.sum() > 0


def test_data_file_has_two_bytes_per_pixel_and_a_usable_bit(tmp_path):
    res = analysed(tmp_path)
    data = sensitivity.encode(res.det, res.pair)
    assert data.shape == (120, 120, 2) and data.dtype == np.uint8
    assert (data[..., 1] & sensitivity.VALID_BIT).all()              # nothing is cloudy in this scene
    assert (data[..., 1] & 7).max() <= max(CODE.values())


def test_a_cloudy_pixel_is_marked_unusable(tmp_path):
    scl = np.full((120, 120), 4, np.uint16)
    scl[0:20, 0:20] = 9
    before = make_stack(str(tmp_path / "b.tif"), VEG, [((10, 40, 10, 40), SOIL)], seed=1)
    after = make_stack(str(tmp_path / "a.tif"), VEG, [((10, 40, 10, 40), BUILT)], seed=2, scl=scl)
    res = run.analyze(before, after, "encroachment")
    data = sensitivity.encode(res.det, res.pair)
    assert not (data[0:20, 0:20, 1] & sensitivity.VALID_BIT).any()
    assert (data[50:60, 50:60, 1] & sensitivity.VALID_BIT).all()


def test_dragging_the_sliders_changes_the_result_in_the_expected_direction(tmp_path):
    res = analysed(tmp_path)
    data = sensitivity.encode(res.det, res.pair)
    thr, min_px, keep = settings(res)
    base = sensitivity.apply(data, thr, min_px, keep)[0].sum()
    assert sensitivity.apply(data, 0.99, min_px, keep)[1] == 0                      # a very strict threshold finds nothing
    assert sensitivity.apply(data, thr, 10 ** 6, keep)[1] == 0                      # a huge minimum area removes everything
    assert sensitivity.apply(data, max(thr - 0.2, 0.0), min_px, keep)[0].sum() >= base   # a looser one never finds less
    assert sensitivity.apply(data, thr, min_px, [])[1] == 0                         # no wanted types: nothing


def test_write_creates_the_files_the_browser_reads(tmp_path):
    res = analysed(tmp_path)
    out = tmp_path / "out"
    info = sensitivity.write(res, str(out), res.summary["params"]["keep_types"], res.summary["params"]["min_area_m2"])
    assert os.path.getsize(out / "sens.bin") == info["width"] * info["height"] * 2
    saved = json.load(open(out / "sens.json"))
    assert saved["server_after_filter"] == saved["mirror_after_filter"] == 2
    assert saved["default_threshold"] > 0 and saved["keep_codes"] == sorted(saved["keep_codes"])


def test_live_job_files_include_the_slider_data(tmp_path):
    res = analysed(tmp_path)
    out = tmp_path / "scene"
    out.mkdir()
    run.write_outputs(res, str(out), inputs=[])
    preview.write_scene_files(res, str(out), {"id": "t"})
    assert (out / "sens.bin").exists() and (out / "sens.json").exists()
