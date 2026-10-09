"""eval/build_results.py: Seam 3 keys appear only when their result files exist; nothing is invented."""
import json

from eval import build_results as B

def CI(v):
    return {"value": v, "ci95": [round(v - 0.05, 4), round(v + 0.05, 4)]}


def put(root, rel, obj):
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj))


def methods(f1):
    return {k: {"precision": CI(f1), "recall": CI(f1), "f1": CI(f1), "iou": CI(f1 / 2)} for k in ("naive", "spectral")}


def test_empty_checkout_reports_everything_as_not_measured(tmp_path):
    r = B.build(str(tmp_path))
    assert not {"oscd", "levir", "m8_change", "speed_s_per_km2"} & set(r)
    assert len(r["not_measured"]) == 3 and r["seed"] == 0


def test_oscd_baselines_without_training_keep_spectral_as_default_and_say_learned_is_unrun(tmp_path):
    put(tmp_path, "eval/results/oscd_baselines.json", {"test_cities": list("abcdefghij"), "methods": methods(0.4),
                                                       "bootstrap": "95% over cities"})
    r = B.build(str(tmp_path))
    o = r["oscd"]
    assert o["default_method"] == "spectral" and o["learned_trained"] is False and set(o["methods"]) == {"naive", "spectral"}
    assert o["split"]["test_cities"] == 10 and o["methods"]["spectral"]["f1"]["ci95"] == [0.35, 0.45]
    assert any("Siamese U-Net" in x and "not been run" in x for x in r["not_measured"])
    assert not any("OSCD test cities (dataset host" in x for x in r["not_measured"])


def test_learned_result_adds_a_method_the_decision_and_speed(tmp_path):
    put(tmp_path, "eval/results/oscd_baselines.json", {"test_cities": ["a"], "methods": methods(0.4), "bootstrap": "x"})
    put(tmp_path, "eval/results/oscd_learned.json",
        {"learned": {**{k: CI(0.5) for k in ("precision", "recall", "f1", "iou")}, "ece": 0.07, "s_per_km2": 1.5},
         "threshold": 0.4, "default_method": "learned"})
    put(tmp_path, "engine/weights/siamunet_oscd.json", {"trained_on": list("123456789ab"), "val_cities": ["x", "y", "z"]})
    r = B.build(str(tmp_path))
    assert r["oscd"]["default_method"] == "learned" and r["oscd"]["ece"] == 0.07 and r["oscd"]["threshold"] == 0.4
    assert set(r["oscd"]["methods"]) == {"naive", "spectral", "learned"} and r["oscd"]["split"]["train_cities"] == 11
    assert r["speed_s_per_km2"]["learned"] == 1.5
    assert not any("Siamese" in x for x in r["not_measured"])


def test_levir_is_never_called_reproduced_unless_the_file_says_so(tmp_path):
    lv = {"bit": {k: CI(0.9) for k in ("f1", "iou", "precision", "recall")}, "naive": {"f1": CI(0.3), "iou": CI(0.2)},
          "images": 7, "scope": "7 sample tiles", "note": "published, not reproduced", "s_per_km2": 36.0,
          "published_bit": {"f1": 0.8931}}
    put(tmp_path, "eval/results/levir_bit.json", lv)
    r = B.build(str(tmp_path))
    assert r["levir"]["note"] == "published, not reproduced" and r["speed_s_per_km2"]["deep"] == 36.0
    assert any("full LEVIR-CD test split" in x and "7 labelled sample tiles" in x for x in r["not_measured"])
    put(tmp_path, "eval/results/levir_bit.json", {**lv, "note": "reproduced"})
    assert not any("LEVIR" in x for x in B.build(str(tmp_path))["not_measured"])


def test_opera_events_are_collected_and_close_the_opera_gap(tmp_path):
    put(tmp_path, "eval/results/m8_opera_2026_assam.json", {"event": "assam", "source": "NASA OPERA RTC-S1 (30 m, Earthdata)"})
    put(tmp_path, "eval/results/m8_opera_2026_kerala.json", {"event": "kerala", "source": "NASA OPERA RTC-S1 (30 m, Earthdata)"})
    r = B.build(str(tmp_path))
    assert [e["event"] for e in r["m8_change"]["events"]] == ["assam", "kerala"]
    assert not any("OPERA" in x for x in r["not_measured"])


def test_a_planetary_computer_event_is_measured_but_does_not_pretend_to_be_opera(tmp_path):
    put(tmp_path, "eval/results/m8_mpc_assam_2024.json", {"event": "assam_2024", "source": "Planetary Computer sentinel-1-rtc (10 m, anonymous)"})
    r = B.build(str(tmp_path))
    assert r["m8_change"]["events"][0]["event"] == "assam_2024" and "Planetary Computer" in r["m8_change"]["note"]
    gap = [x for x in r["not_measured"] if "OPERA" in x]
    assert len(gap) == 1 and "Planetary Computer event is measured instead" in gap[0]


def test_existing_keys_are_kept(tmp_path):
    put(tmp_path, "eval/results/m8_sen1floods11_india.json", {"chips": 68})
    r = B.build(str(tmp_path))
    assert r["m8_india"] == {"chips": 68} and {"m8_experiments", "false_alarms", "ablation", "generated_utc", "commit"} <= set(r)


def test_variant_evidence_is_carried_into_the_oscd_block_when_present(tmp_path):
    put(tmp_path, "eval/results/oscd_baselines.json", {"test_cities": ["a"], "methods": methods(0.4), "bootstrap": "x"})
    put(tmp_path, "eval/results/oscd_val_variants.json", {"variants": {"hybrid": {"recall": CI(0.03)}}})
    put(tmp_path, "eval/results/learned_false_alarms.json", {"scenes": {"season-control": {"per_km2": {"learned": 7.4}}}})
    o = B.build(str(tmp_path))["oscd"]
    assert o["validation_variants"]["variants"]["hybrid"]["recall"]["value"] == 0.03
    assert o["false_alarms_by_variant"]["scenes"]["season-control"]["per_km2"]["learned"] == 7.4


def per_city(*f1s, names=("a", "b", "c")):
    return {n: {"f1": f, "precision": f, "recall": f, "iou": f / 2} for n, f in zip(names, f1s)}


def test_per_location_table_counts_wins_lists_weak_locations_and_labels_regions(tmp_path):
    base = {"test_cities": ["lasvegas", "norcia", "valencia"], "bootstrap": "x",
            "methods": {"naive": {**methods(0.3)["naive"], "per_city": per_city(0.7, 0.04, 0.01, names=("lasvegas", "norcia", "valencia"))},
                        "spectral": {**methods(0.3)["spectral"], "per_city": per_city(0.64, 0.005, 0.02, names=("lasvegas", "norcia", "valencia"))}}}
    learned = {"learned": {**{k: CI(0.5) for k in ("precision", "recall", "f1", "iou")}, "ece": 0.1,
                           "per_city": per_city(0.76, 0.11, 0.03, names=("lasvegas", "norcia", "valencia"))},
               "threshold": 0.5, "default_method": "learned"}
    put(tmp_path, "eval/results/oscd_baselines.json", base)
    put(tmp_path, "eval/results/oscd_learned.json", learned)
    pl = B.build(str(tmp_path))["oscd"]["per_location"]
    assert pl["n_locations"] == 3 and pl["locations"]["lasvegas"]["region"] == "North America"
    assert pl["locations"]["norcia"]["learned"]["f1"] == 0.11 and pl["locations"]["norcia"]["spectral"]["f1"] == 0.005
    s = pl["summary"]
    assert s["learned_beats_spectral"] == 3 and s["learned_beats_naive"] == 3 and s["spectral_beats_naive"] == 1
    assert s["learned_weak_locations_f1_below_0_25"] == ["valencia", "norcia"] and s["learned_best_locations"][0] == "lasvegas"
    assert "3 worldwide locations" in pl["claim"] and "works everywhere" not in pl["claim"].replace("never", "")


def test_per_location_without_a_learned_model_only_compares_naive_and_spectral(tmp_path):
    base = {"test_cities": ["a"], "bootstrap": "x", "methods": {"naive": {**methods(0.3)["naive"], "per_city": per_city(0.2, names=("a",))},
                                                              "spectral": {**methods(0.3)["spectral"], "per_city": per_city(0.4, names=("a",))}}}
    put(tmp_path, "eval/results/oscd_baselines.json", base)
    pl = B.build(str(tmp_path))["oscd"]["per_location"]
    assert pl["summary"] == {"spectral_beats_naive": 1} and pl["locations"]["a"]["region"] == "unknown"


def test_variant_study_summary_is_carried_without_the_per_run_detail(tmp_path):
    put(tmp_path, "eval/results/oscd_baselines.json", {"test_cities": ["a"], "methods": methods(0.4), "bootstrap": "x"})
    put(tmp_path, "eval/results/oscd_variant_study.json", {
        "split": "validation locations only", "val_locations": ["a", "b", "c"], "seeds": [0, 1], "reference": "r", "note": "n",
        "variants": {"cap50": {"pos_weight_cap": 50.0, "summary": {"pipeline_f1": {"mean": 0.3, "sd": 0.02, "n": 2}}, "runs": [{"seed": 0}, {"seed": 1}]}}})
    vs = B.build(str(tmp_path))["oscd"]["variant_study"]
    assert vs["split"] == "validation locations only" and vs["variants"]["cap50"]["summary"]["pipeline_f1"]["sd"] == 0.02
    assert "runs" not in vs["variants"]["cap50"]
    put(tmp_path, "eval/results/oscd_variant_study.json", {})                 # an empty file must not crash the build
    assert "variant_study" not in B.build(str(tmp_path))["oscd"]
