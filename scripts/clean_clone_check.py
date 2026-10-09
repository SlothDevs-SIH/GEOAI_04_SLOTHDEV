"""Check that the committed code works on a machine that is not this one.

python scripts/clean_clone_check.py [--skip-web] [--keep]

Clones the repository (committed files only, so uncommitted work cannot hide a missing file) into a temp folder,
makes a fresh Python environment, installs requirements.txt, then runs ruff and pytest; unless --skip-web, it also
runs npm ci, lint, typecheck, unit tests and the production build. Prints a pass/fail table and exits 1 if any
step failed. Run it before submitting.
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIN = os.name == "nt"


def run(name, cmd, cwd, results, env=None):
    t = time.time()
    print(f"\n=== {name}", flush=True)
    p = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), env=env, capture_output=True, text=True,
                         encoding="utf-8", errors="replace")   # npm prints non-ASCII; the Windows default codec cannot read it
    ok = p.returncode == 0
    tail = "\n".join((p.stdout + p.stderr).strip().splitlines()[-6:])
    print(tail, flush=True)
    results.append((name, ok, time.time() - t))
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--skip-web", action="store_true")
    ap.add_argument("--keep", action="store_true", help="keep the temp folder for inspection")
    a = ap.parse_args()
    tmp = tempfile.mkdtemp(prefix="geoai04_clean_")
    repo = os.path.join(tmp, "repo")
    results: list[tuple[str, bool, float]] = []
    print("working in", tmp)
    try:
        if not run("git clone (committed files only)", ["git", "clone", "--quiet", ROOT, repo], tmp, results):
            return 1
        venv = os.path.join(tmp, "venv")
        run("create virtual environment", [sys.executable, "-m", "venv", venv], tmp, results)
        py = os.path.join(venv, "Scripts" if WIN else "bin", "python")
        run("pip install -r requirements.txt", [py, "-m", "pip", "install", "-q", "-r", "requirements.txt"], repo, results)
        run("ruff check", [py, "-m", "ruff", "check", "."], repo, results)
        run("pytest", [py, "-m", "pytest", "-q"], repo, results)
        if not a.skip_web:
            web = os.path.join(repo, "web")
            for name, cmd in (("npm ci", "npm ci --no-audit --no-fund"), ("web lint", "npm run lint"),
                              ("web typecheck", "npm run typecheck"), ("web unit tests", "npm test"),
                              ("web production build", "npm run build")):
                if not run(name, cmd, web, results):
                    break
    finally:
        if not a.keep:
            shutil.rmtree(tmp, ignore_errors=True)
    print("\n" + "-" * 60)
    for name, ok, secs in results:
        print(f"{'PASS' if ok else 'FAIL':5s} {name:40s} {secs:6.0f}s")
    failed = [n for n, ok, _ in results if not ok]
    print("-" * 60)
    print("ALL CHECKS PASSED" if not failed else f"FAILED: {', '.join(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
