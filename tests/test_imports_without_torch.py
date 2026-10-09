"""Every engine, eval and ml module except the three PyTorch tools imports with torch, onnx and the S1 clients missing.

This is what CI and the deployed container see (requirements.txt only). A subprocess blocks the packages the way a
missing install does (ModuleNotFoundError), so nothing in this process is affected.
"""
import subprocess
import sys
import textwrap

BLOCKED = ["torch", "torchvision", "onnx", "onnxruntime", "onnxscript", "pystac_client", "planetary_computer",
           "asf_search", "einops"]
MODULES = ["engine.change_learned", "engine.change_deep", "engine.s1", "engine.radar", "engine.radar_run",
           "engine.config_ml", "eval.metrics", "eval.oscd_baselines", "eval.levir_eval", "eval.m8_opera",
           "eval.build_results", "eval.learned_false_alarms", "ml.oscd_data", "ml.m8_calibrate", "ml.fetch_s1_event",
           "ml.eval_variants_val"]
TORCH_ONLY = ["ml.siamunet", "ml.train_siamunet", "ml.export_onnx"]

PRELUDE = f"""
import importlib.abc, sys
class Block(importlib.abc.MetaPathFinder):
    def find_spec(self, name, path, target=None):
        if name.split('.')[0] in {BLOCKED!r}:
            raise ModuleNotFoundError(f"No module named '{{name}}'", name=name)
sys.meta_path.insert(0, Block())
"""


def run(body):
    return subprocess.run([sys.executable, "-c", PRELUDE + textwrap.dedent(body)], capture_output=True, text=True)


def test_engine_eval_and_ml_modules_import_without_torch():
    r = run(f"""
        import importlib
        for m in {MODULES!r}:
            importlib.import_module(m)
        print("ok")
    """)
    assert r.returncode == 0 and "ok" in r.stdout, r.stderr[-800:]


def test_the_learned_and_deep_detectors_report_unavailable_instead_of_crashing():
    r = run("""
        from engine import change_learned, change_deep
        print(change_deep.status()["available"], change_learned.status().get("available"))
    """)
    assert r.returncode == 0, r.stderr[-800:]
    assert r.stdout.split()[0] == "False"                      # BIT needs torch; the learned status reports a reason


def test_the_torch_only_tools_say_how_to_install_torch():
    for m in TORCH_ONLY:
        r = run(f"import importlib; importlib.import_module({m!r})")
        assert r.returncode != 0 and "requirements-ml.txt" in r.stderr, (m, r.stderr[-400:])
