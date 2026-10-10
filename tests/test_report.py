"""The PDF report: plain-language summary, numbered map, top-10 cards, and EVERY change listed (not just the top 10)."""
import json
import os

import geopandas as gpd
import pytest

from engine import report

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSAM = os.path.join(ROOT, "web", "public", "demos", "assam-flood-2016")
pypdf = pytest.importorskip("pypdf")


def _text(path):
    return [p.extract_text() for p in pypdf.PdfReader(path).pages]


def test_the_report_lists_every_change_not_only_the_top_ten(tmp_path):
    n = len(gpd.read_file(os.path.join(ASSAM, "result_filtered.geojson")))
    assert n > 10
    pages = _text(report.build_from_dir(ASSAM, str(tmp_path / "r.pdf")))
    full = "\n".join(pages)
    assert f"All {n} changes found" in full
    table = next(p for p in pages if f"All {n} changes found" in p)
    ranks = {int(tok) for line in table.splitlines() for tok in line.split()[:1] if tok.isdigit()}
    assert set(range(1, n + 1)) <= ranks                      # every rank appears as a row


def test_the_report_explains_itself_in_plain_words(tmp_path):
    first = _text(report.build_from_dir(ASSAM, str(tmp_path / "r.pdf")))[0]
    for phrase in ("What we found", "By priority", "How to read this report", "Rank", "Confidence", "Raw detections"):
        assert phrase in first
    full = "\n".join(_text(str(tmp_path / "r.pdf")))
    assert "Rank 1 of" in full and "What to do" in full and "Why flagged" in full and "Limits" in full


def test_an_empty_result_still_gives_a_valid_report(tmp_path):
    gdf = gpd.GeoDataFrame({"id": [], "geometry": []}, geometry="geometry", crs=4326)    # what the engine returns for zero changes
    out = report.build(str(tmp_path / "e.pdf"), "Nothing found", {"mode": "spectral", "raw_detections": 7, "after_filter": 0,
                                                                  "impact": {"changed_ha": 0}, "dropped": {"seasonal": 5}}, gdf)
    text = "\n".join(_text(out))
    assert "No real changes were found" in text


def test_every_demo_scene_can_be_rebuilt_from_its_committed_files(tmp_path):
    ids = [m["id"] for m in json.load(open(os.path.join(ROOT, "web", "public", "demos", "index.json"), encoding="utf-8"))]
    assert len(ids) >= 9
    for sid in ids:
        out = report.build_from_dir(os.path.join(ROOT, "web", "public", "demos", sid), str(tmp_path / f"{sid}.pdf"))
        assert os.path.getsize(out) > 20_000, sid


def test_a_live_analysis_ends_with_the_full_report(tmp_path, monkeypatch):
    """The report a user downloads after analysing their own area is the full one (all changes, numbered map), not the plain first draft."""
    from conftest import BUILT, SOIL, VEG, make_stack

    from engine import preview, run
    monkeypatch.setattr("engine.impact.worldcover_on_grid", lambda *a, **k: None)
    before = make_stack(str(tmp_path / "b.tif"), VEG, [((10, 40, 10, 40), SOIL), ((60, 100, 60, 100), SOIL)], seed=1)
    after = make_stack(str(tmp_path / "a.tif"), VEG, [((10, 40, 10, 40), BUILT), ((60, 100, 60, 100), BUILT)], seed=2)
    res = run.analyze(before, after, "encroachment")
    res.gdf["review_status"] = "pending"
    out = str(tmp_path / "job")
    run.write_outputs(res, out, inputs=[before, after], title="GEOAI 04 draft")
    preview.write_scene_files(res, out, {"id": "job1", "name": "My area", "before_date": "2024-11-01", "after_date": "2025-01-10"})
    text = "\n".join(_text(os.path.join(out, "report.pdf")))
    assert "My area" in text and "How to read this report" in text and "All 2 changes found" in text and "Rank 1 of 2" in text
