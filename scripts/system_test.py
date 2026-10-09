"""Black-box system test of a RUNNING server (the API and the site it serves).

python scripts/system_test.py http://127.0.0.1:8010 [--live] [--out eval/test_runs/system_test.json]

Every check is a real HTTP request. Groups:
  health      the service reports itself honestly (models, modes)
  demos       every published demo scene: all files present, consistent, valid
  errors      bad input and abuse: wrong values, path traversal, wrong methods, junk uploads
  cors        browser cross-origin headers
  radar       radar uploads (single date and before/after) on synthetic data
  uploads     optical upload jobs, reviews, every export format, concurrency
  load        many parallel requests: no failures, latency percentiles
  live        (--live) real Sentinel-2 lookups and analyses in several Indian regions, all three optical modes
Prints a table and writes the results as JSON. Exit code 1 if any check failed.
"""
import argparse
import io
import json
import os
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor

import httpx
import numpy as np
import rasterio
from rasterio.transform import from_origin

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tests"))
from conftest import BUILT, SOIL, VEG, make_stack  # noqa: E402

RESULTS: list[dict] = []
REQUIRED = {"id", "area_m2", "magnitude", "confidence", "needs_review", "centroid_lat", "centroid_lon", "change_type",
            "reason", "score", "tier", "review_status"}


def check(group, name, ok, detail=""):
    RESULTS.append({"group": group, "name": name, "ok": bool(ok), "detail": str(detail)[:200]})
    if not ok:
        print(f"  FAIL [{group}] {name}: {detail}", flush=True)
    return ok


def wait_job(c, jid, timeout=240):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = c.get(f"/jobs/{jid}").json()
        if j["status"] in ("done", "error"):
            return j
        time.sleep(0.5)
    return {"status": "timeout"}


def s1_tiff(flooded):
    rng = np.random.default_rng(1 if flooded else 2)
    vv = rng.normal(-8, 1.5, (200, 200)).astype(np.float32)
    if flooded:
        vv[50:110, 50:110] = rng.normal(-20, 1.5, (60, 60))
    with rasterio.MemoryFile() as mem:
        with mem.open(driver="GTiff", height=200, width=200, count=2, dtype="float32", crs="EPSG:32646",
                      transform=from_origin(500000, 2950000, 10, 10)) as dst:
            dst.write(np.stack([vv, vv - 6]))
        return io.BytesIO(mem.read()).getvalue()


def optical_pair(tmp):
    b = make_stack(f"{tmp}/b.tif", VEG, [((10, 40, 10, 40), SOIL), ((60, 100, 60, 100), SOIL)], seed=1)
    a = make_stack(f"{tmp}/a.tif", VEG, [((10, 40, 10, 40), BUILT), ((60, 100, 60, 100), BUILT)], seed=2)
    return open(b, "rb").read(), open(a, "rb").read()


def group_health(c):
    for path in ("/health", "/api/health"):
        r = c.get(path)
        h = r.json() if r.status_code == 200 else {}
        check("health", f"GET {path} returns 200 with ok=true", r.status_code == 200 and h.get("ok") is True)
    h = c.get("/health").json()
    check("health", "reports spectral and radar modes", {"spectral", "radar"} <= set(h.get("modes", [])), h.get("modes"))
    check("health", "reports learned/deep availability as booleans", all(isinstance(v, bool) for v in h.get("models", {}).values()))
    check("health", "any-area fetch is advertised", h.get("fetch_s2") is True)
    check("health", "API default mode is spectral", h.get("default_mode") == "spectral")
    m = c.get("/metrics")
    check("health", "GET /metrics returns the measured results", m.status_code == 200 and "oscd" in m.json() and "m8_experiments" in m.json())
    check("health", "GET /results returns the radar results", c.get("/results").status_code == 200)
    check("health", "GET / serves the web app", c.get("/").status_code == 200 and "<div id=\"root\"" in c.get("/").text)
    for f in ("sw.js", "manifest.webmanifest", "architecture.png", "icon-192.png"):
        check("health", f"PWA/asset /{f} is served", c.get(f"/{f}").status_code == 200)


def group_demos(c):
    idx = c.get("/demos").json()
    ids = [e["id"] for e in idx]
    check("demos", "GET /demos lists 7 scenes", len(ids) == 7, ids)
    for sid in ids:
        base = f"/demos/{sid}/files"
        meta = c.get(f"{base}/meta.json")
        check("demos", f"{sid}: meta.json", meta.status_code == 200 and meta.json().get("id") == sid)
        summ = c.get(f"{base}/summary.json").json() if c.get(f"{base}/summary.json").status_code == 200 else {}
        check("demos", f"{sid}: summary.json has counts", summ.get("after_filter") is not None and summ.get("raw_detections") is not None)
        fc = c.get(f"/demos/{sid}/result").json()
        check("demos", f"{sid}: result polygons == summary after_filter", len(fc["features"]) == summ.get("after_filter"),
              f"{len(fc['features'])} vs {summ.get('after_filter')}")
        check("demos", f"{sid}: every polygon has all required properties",
              all(REQUIRED <= set(f["properties"]) for f in fc["features"]))
        check("demos", f"{sid}: tiers and ids are valid, ids unique",
              all(f["properties"]["tier"] in ("critical", "high", "medium", "low") for f in fc["features"])
              and len({f["properties"]["id"] for f in fc["features"]}) == len(fc["features"]))
        check("demos", f"{sid}: areas and confidence are in range",
              all(f["properties"]["area_m2"] > 0 and 0 <= f["properties"]["confidence"] <= 1 for f in fc["features"]))
        raw = c.get(f"/demos/{sid}/result?filtered=false")
        check("demos", f"{sid}: raw layer loads", raw.status_code == 200)
        check("demos", f"{sid}: raw detections >= real changes", summ.get("raw_detections", 0) >= summ.get("after_filter", 1))
        for side in ("before", "after"):
            r = c.get(f"/demos/{sid}/preview/{side}")
            check("demos", f"{sid}: {side} image is webp", r.status_code == 200 and r.headers.get("content-type") == "image/webp")
        corners = meta.json().get("corners") or c.get(f"{base}/bounds.json").json().get("corners")
        check("demos", f"{sid}: map corners are 4 valid lon/lat points",
              corners and len(corners) == 4 and all(-180 <= x <= 180 and -90 <= y <= 90 for x, y in corners))
        for ex in ("changes.gpkg", "changes.geojson", "report.pdf", "changes.csv", "changes.kml", "audit.json"):
            r = c.get(f"{base}/exports/{ex}")
            check("demos", f"{sid}: export {ex}", r.status_code == 200 and len(r.content) > 20)
        if summ.get("mode") != "radar":
            si = c.get(f"{base}/sens.json")
            check("demos", f"{sid}: slider data present and sized right",
                  si.status_code == 200 and len(c.get(f"{base}/sens.bin").content) == si.json()["width"] * si.json()["height"] * 3)


def group_errors(c):
    for p in ("/demos/nowhere/summary", "/jobs/doesnotexist", "/jobs/..%2F..%2Fetc", "/demos/navi-mumbai-airport/files/../../../../api/main.py",
              "/demos/navi-mumbai-airport/files/..%2F..%2Findex.json", "/jobs/x/files/job.json", "/nope", "/api/nope"):
        check("errors", f"GET {p} is refused (404)", c.get(p).status_code == 404, c.get(p).status_code)
    check("errors", "preview side must be before/after", c.get("/demos/navi-mumbai-airport/preview/side").status_code == 400)
    body = {"bbox": [77.1, 28.5, 77.17, 28.56], "before_date": "2024-11-01", "after_date": "2025-01-10"}
    for name, change, code in (("huge box", {"bbox": [77, 28, 78, 29]}, 400), ("reversed box", {"bbox": [77.2, 28.5, 77.1, 28.6]}, 400),
                               ("tiny box", {"bbox": [77.1, 28.5, 77.1005, 28.5005]}, 400), ("NaN-ish box", {"bbox": [1, 2, 3]}, 400),
                               ("box outside the world", {"bbox": [200, 28, 201, 29]}, 400), ("bad date", {"before_date": "soon"}, 400),
                               ("future date", {"after_date": "2999-01-01"}, 400), ("dates reversed", {"before_date": "2025-02-01", "after_date": "2025-01-01"}, 400),
                               ("date before Sentinel-2 L2A", {"before_date": "2010-01-01"}, 400), ("bad preset", {"preset": "nonsense"}, 400),
                               ("bad mode", {"mode": "quantum"}, 400), ("deep mode for an area", {"mode": "deep"}, 400),
                               ("window too big", {"window_days": 999}, 400), ("composite 9", {"composite": 9}, 400),
                               ("persistence 1", {"persistence": 1}, 400), ("persistence with flood", {"persistence": 2, "preset": "flood"}, 400)):
        for path in ("/fetch-s2", "/fetch-s2/preview"):
            r = c.post(path, json={**body, **change})
            check("errors", f"{path}: {name} -> {code}", r.status_code == code, r.status_code)
    check("errors", "invalid JSON body is rejected (422)", c.post("/fetch-s2", content=b"{not json", headers={"content-type": "application/json"}).status_code == 422)
    check("errors", "missing body is rejected (422)", c.post("/fetch-s2").status_code == 422)
    check("errors", "GET on a POST-only route is refused (404/405)", c.get("/fetch-s2").status_code in (404, 405))
    check("errors", "DELETE on a read-only route is refused (404/405)", c.delete("/demos").status_code in (404, 405))
    check("errors", "analyze with no files is 400", c.post("/analyze", data={"preset": "general"}).status_code == 400)
    check("errors", "analyze with a bad preset is 400", c.post("/analyze", data={"preset": "x"}).status_code == 400)
    junk = c.post("/analyze", files={"before": ("b.tif", b"not a tiff"), "after": ("a.tif", b"nope")}, data={"preset": "general"})
    j = wait_job(c, junk.json()["job_id"], 60) if junk.status_code == 200 else {}
    check("errors", "junk upload ends as a clear job error, not a crash", j.get("status") == "error" and j.get("error"), j.get("error"))
    check("errors", "the error does not leak server paths or a stack trace", "trace" not in j and "Traceback" not in json.dumps(j))
    check("errors", "review of an unfinished job is refused", c.patch(f"/jobs/{junk.json()['job_id']}/features/1", json={"review_status": "confirmed"}).status_code == 409)
    long_id = "a" * 5000
    check("errors", "a 5,000 character job id is refused cleanly", c.get(f"/jobs/{long_id}").status_code in (404, 414))
    check("errors", "a null byte in a path is refused", c.get("/demos/navi-mumbai-airport/files/meta.json%00.png").status_code in (400, 404))


def group_cors(c, origin="https://example.org"):
    r = c.options("/fetch-s2", headers={"origin": origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type"})
    check("cors", "preflight from another origin succeeds", r.status_code in (200, 204), r.status_code)
    check("cors", "preflight allows the origin", r.headers.get("access-control-allow-origin") in ("*", origin), r.headers.get("access-control-allow-origin"))
    r = c.get("/health", headers={"origin": origin})
    check("cors", "normal responses carry the CORS header", r.headers.get("access-control-allow-origin") in ("*", origin))
    check("cors", "responses are compressed when asked", c.get("/demos/pune-hinjewadi/result", headers={"accept-encoding": "gzip"}).headers.get("content-encoding") == "gzip")


def group_radar(c):
    r = c.post("/analyze", files={"after": ("a.tif", s1_tiff(True))}, data={"mode": "radar"})
    j = wait_job(c, r.json()["job_id"], 60)
    s = c.get(f"/jobs/{r.json()['job_id']}/summary").json() if j["status"] == "done" else {}
    check("radar", "single-date radar upload finds the flood", j["status"] == "done" and s.get("after_filter") == 1, s.get("after_filter"))
    check("radar", "flood area is about 36 ha", 30 < s.get("flooded_ha", 0) < 42, s.get("flooded_ha"))
    r = c.post("/analyze", files={"before": ("b.tif", s1_tiff(False)), "after": ("a.tif", s1_tiff(True))}, data={"mode": "radar"})
    j = wait_job(c, r.json()["job_id"], 60)
    s = c.get(f"/jobs/{r.json()['job_id']}/summary").json() if j["status"] == "done" else {}
    check("radar", "before/after radar uses the reference", s.get("variant") == "before_after" and s.get("after_filter", 0) >= 1, s.get("variant"))
    check("radar", "radar export geojson downloads", c.get(f"/jobs/{r.json()['job_id']}/export?format=geojson").status_code == 200)
    dry = c.post("/analyze", files={"before": ("b.tif", s1_tiff(False)), "after": ("a.tif", s1_tiff(False))}, data={"mode": "radar"})
    j = wait_job(c, dry.json()["job_id"], 60)
    s = c.get(f"/jobs/{dry.json()['job_id']}/summary").json() if j["status"] == "done" else {}
    check("radar", "a dry before/after pair reports no flood", j["status"] == "done" and s.get("after_filter") == 0, s.get("after_filter"))


def group_uploads(c):
    with tempfile.TemporaryDirectory() as tmp:
        b, a = optical_pair(tmp)
    files = lambda: {"before": ("b.tif", b), "after": ("a.tif", a)}  # noqa: E731
    r = c.post("/analyze", files=files(), data={"mode": "spectral", "preset": "encroachment", "before_date": "2024-11-01", "after_date": "2025-01-10"})
    jid = r.json()["job_id"]
    j = wait_job(c, jid, 90)
    check("uploads", "spectral upload job finishes", j["status"] == "done", j.get("error"))
    s = c.get(f"/jobs/{jid}/summary").json()
    check("uploads", "two real changes found, raw >= real", s["after_filter"] == 2 and s["raw_detections"] >= 2, s["after_filter"])
    check("uploads", "summary carries impact, quality, limits and sources", all(k in s for k in ("impact", "quality", "limits", "sources", "params")))
    fc = c.get(f"/jobs/{jid}/result").json()
    check("uploads", "result polygons have all properties", all(REQUIRED <= set(f["properties"]) for f in fc["features"]))
    fid = fc["features"][0]["properties"]["id"]
    for k in range(2):
        p = c.patch(f"/jobs/{jid}/features/{fid}", json={"review_status": "confirmed"})
        check("uploads", f"review PATCH #{k + 1} (idempotent)", p.status_code == 200 and p.json()["properties"]["review_status"] == "confirmed")
    check("uploads", "bad review status is 400", c.patch(f"/jobs/{jid}/features/{fid}", json={"review_status": "maybe"}).status_code == 400)
    check("uploads", "unknown feature is 404", c.patch(f"/jobs/{jid}/features/99999", json={"review_status": "confirmed"}).status_code == 404)
    conf = c.get(f"/jobs/{jid}/export?format=geojson&confirmed_only=true").json()
    check("uploads", "confirmed-only export has just the confirmed change", [f["properties"]["id"] for f in conf["features"]] == [fid])
    magic = {"geojson": b"{", "gpkg": b"SQLite format 3", "pdf": b"%PDF", "csv": b"id,", "kml": b"<?xml", "audit": b"{"}
    for fmt, head in magic.items():
        e = c.get(f"/jobs/{jid}/export?format={fmt}")
        check("uploads", f"export {fmt} has the right file signature", e.status_code == 200 and e.content.startswith(head), e.content[:12])
    check("uploads", "bad export format is 400", c.get(f"/jobs/{jid}/export?format=exe").status_code == 400)
    check("uploads", "swipe-map files exist for the job", all(c.get(f"/jobs/{jid}/files/{f}").status_code == 200 for f in ("meta.json", "before.webp", "after.webp", "result_filtered.geojson", "sens.json", "sens.bin")))
    check("uploads", "job inputs and state are not downloadable", all(c.get(f"/jobs/{jid}/files/{f}").status_code == 404 for f in ("before.tif", "after.tif", "job.json", "review.json")))
    # min area override removes everything
    r2 = c.post("/analyze", files=files(), data={"preset": "encroachment", "min_area_m2": "1000000"})
    j2 = wait_job(c, r2.json()["job_id"], 90)
    check("uploads", "a huge minimum area removes all changes", j2["status"] == "done" and c.get(f"/jobs/{r2.json()['job_id']}/summary").json()["after_filter"] == 0)
    # unavailable or unknown modes
    rl = c.post("/analyze", files=files(), data={"mode": "learned", "preset": "encroachment"})
    h = c.get("/health").json()
    check("uploads", "learned mode: runs if available, else 501 with a reason", rl.status_code == (200 if h["models"]["learned"] else 501), rl.status_code)
    if rl.status_code == 200:
        jl = wait_job(c, rl.json()["job_id"], 90)
        check("uploads", "learned mode job finishes with mode=learned", jl["status"] == "done" and c.get(f"/jobs/{rl.json()['job_id']}/summary").json()["mode"] == "learned")
        check("uploads", "learned jobs write no slider data", c.get(f"/jobs/{rl.json()['job_id']}/files/sens.json").status_code == 404)
    rd = c.post("/analyze", files=files(), data={"mode": "deep"})
    check("uploads", "deep mode on Sentinel-2 images is refused or fails clearly", rd.status_code == 501 or wait_job(c, rd.json()["job_id"], 60).get("status") == "error")
    # concurrency
    def one(_):
        r = c.post("/analyze", files=files(), data={"preset": "encroachment"})
        return wait_job(c, r.json()["job_id"], 180)["status"] == "done"
    with ThreadPoolExecutor(max_workers=6) as ex:
        done = list(ex.map(one, range(6)))
    check("uploads", "6 simultaneous upload jobs all finish", all(done), done)


def group_load(c):
    urls = ["/health", "/demos", "/demos/navi-mumbai-airport/summary", "/demos/pune-hinjewadi/result", "/metrics", "/demos/assam-flood-2016/preview/after"]
    lat, fails = [], 0

    def hit(i):
        t = time.time()
        r = c.get(urls[i % len(urls)])
        return r.status_code, time.time() - t
    with ThreadPoolExecutor(max_workers=24) as ex:
        out = list(ex.map(hit, range(240)))
    for code, dt in out:
        lat.append(dt)
        fails += code != 200
    lat.sort()
    p50, p95 = lat[len(lat) // 2], lat[int(len(lat) * 0.95)]
    check("load", "240 requests, 24 at a time: no failures", fails == 0, f"{fails} failed")
    check("load", f"median latency under 500 ms (measured {p50 * 1000:.0f} ms)", p50 < 0.5)
    check("load", f"95th percentile under 2 s (measured {p95 * 1000:.0f} ms)", p95 < 2.0)
    RESULTS.append({"group": "load", "name": "latency", "ok": True, "detail": f"p50 {p50 * 1000:.0f} ms, p95 {p95 * 1000:.0f} ms, max {lat[-1] * 1000:.0f} ms"})


def group_live(c):
    regions = {"Delhi NCR": [77.31, 28.50, 77.39, 28.57], "Chennai": [80.20, 12.88, 80.27, 12.95], "Guwahati": [91.70, 26.12, 91.78, 26.19],
               "Bengaluru": [77.72, 12.95, 77.80, 13.02], "Jaipur": [75.72, 26.78, 75.80, 26.85], "Kochi": [76.30, 9.97, 76.37, 10.03]}
    dates = {"Chennai": ("2019-02-01", "2025-02-01"), "Kochi": ("2019-02-01", "2025-02-01"), "Bengaluru": ("2019-02-01", "2025-02-01"),
             "Guwahati": ("2019-01-15", "2025-01-15")}
    for name, bbox in regions.items():
        b, a = dates.get(name, ("2019-01-20", "2025-01-20"))
        t = time.time()
        r = c.post("/fetch-s2/preview", json={"bbox": bbox, "before_date": b, "after_date": a}, timeout=300)
        d = r.json() if r.status_code == 200 else {}
        check("live", f"{name}: real archive lookup finds two usable scenes ({time.time() - t:.0f} s)",
              r.status_code == 200 and d.get("before", {}).get("aoi_invalid_pct", 100) < 50 and d.get("after", {}).get("aoi_invalid_pct", 100) < 50, r.text[:120])
    small = [77.33, 28.52, 77.37, 28.56]
    counts = {}
    for mode in ("spectral", "learned", "hybrid"):
        if mode != "spectral" and not c.get("/health").json()["models"]["learned"]:
            continue
        r = c.post("/fetch-s2", json={"bbox": small, "before_date": "2019-01-20", "after_date": "2025-01-20", "preset": "encroachment", "mode": mode}, timeout=60)
        check("live", f"Delhi 4 km box, {mode}: job accepted", r.status_code == 200, r.text[:100])
        if r.status_code != 200:
            continue
        jid = r.json()["job_id"]
        j = wait_job(c, jid, 400)
        check("live", f"Delhi 4 km box, {mode}: analysis completes", j["status"] == "done", j.get("error"))
        if j["status"] == "done":
            s = c.get(f"/jobs/{jid}/summary").json()
            counts[mode] = s["after_filter"]
            check("live", f"Delhi {mode}: raw detections exceed real changes", s["raw_detections"] > s["after_filter"] >= 0, f"{s['raw_detections']} -> {s['after_filter']}")
            check("live", f"Delhi {mode}: result opens (meta, images, polygons, pdf)",
                  all(c.get(f"/jobs/{jid}/files/{f}").status_code == 200 for f in ("meta.json", "before.webp", "after.webp", "result_filtered.geojson", "exports/report.pdf")))
    RESULTS.append({"group": "live", "name": "Delhi counts by mode", "ok": True, "detail": json.dumps(counts)})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--out", default=os.path.join(ROOT, "eval", "test_runs", "system_test.json"))
    a = ap.parse_args()
    c = httpx.Client(base_url=a.url, timeout=120, follow_redirects=False)
    t0 = time.time()
    groups = [("health", group_health), ("demos", group_demos), ("errors", group_errors), ("cors", group_cors), ("radar", group_radar),
              ("uploads", group_uploads), ("load", group_load)] + ([("live", group_live)] if a.live else [])
    for name, fn in groups:
        n0 = len(RESULTS)
        t = time.time()
        fn(c)
        new = RESULTS[n0:]
        print(f"{name:8s} {sum(r['ok'] for r in new):4d}/{len(new):<4d} passed  ({time.time() - t:.0f}s)", flush=True)
    total, passed = len(RESULTS), sum(r["ok"] for r in RESULTS)
    out = {"url": a.url, "seconds": round(time.time() - t0), "checks": total, "passed": passed, "failed": total - passed, "results": RESULTS}
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump(out, open(a.out, "w"), indent=1)
    print(f"\nTOTAL {passed}/{total} checks passed in {out['seconds']} s -> {a.out}")
    for r in RESULTS:
        if not r["ok"]:
            print("  FAILED:", r["group"], r["name"], "|", r["detail"])
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
