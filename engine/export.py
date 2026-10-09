"""Write results: GeoJSON (WGS84), GeoPackage (local UTM), CSV + KML field pack, audit.json."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from xml.sax.saxutils import escape

FIELDS = ["id", "tier", "change_type", "area_m2", "area_ha", "magnitude", "confidence", "needs_review",
          "centroid_lat", "centroid_lon", "reason", "score", "review_status"]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _commit():
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True,
                              cwd=os.path.dirname(os.path.abspath(__file__))).stdout.strip() or None
    except Exception:
        return None


def geojson(gdf, path):
    keep = [c for c in gdf.columns if c not in ("cid",)]
    gdf[keep].to_file(path, driver="GeoJSON")


def gpkg(gdf, path, metric_epsg):
    keep = [c for c in gdf.columns if c not in ("cid",)]
    gdf[keep].to_crs(metric_epsg).to_file(path, layer="changes", driver="GPKG")


def csv(gdf, path):
    import csv as _csv
    with open(path, "w", newline="") as f:
        w = _csv.writer(f)
        w.writerow(FIELDS + ["google_maps"])
        for _, r in gdf.iterrows():
            w.writerow([r.get(k, "") for k in FIELDS] +
                       [f"https://www.google.com/maps?q={r['centroid_lat']},{r['centroid_lon']}"])


def kml(gdf, path, name="GEOAI 04 changes"):
    out = ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
           f"<name>{escape(name)}</name>"]
    for _, r in gdf.iterrows():
        desc = escape(f"{r['tier']} | {r['area_ha']} ha | confidence {r['confidence']} | {r['reason']}")
        out.append(f"<Placemark><name>#{int(r['id'])} {escape(str(r['tier']))}</name><description>{desc}</description>"
                   f"<Point><coordinates>{r['centroid_lon']},{r['centroid_lat']},0</coordinates></Point></Placemark>")
    out.append("</Document></kml>")
    with open(path, "w") as f:
        f.write("\n".join(out))


def audit(path, inputs, params, summary):
    rec = {"created_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "engine_commit": _commit(),
           "inputs": {os.path.basename(p): sha256(p) for p in inputs if p and os.path.exists(p)},
           "params": params, "mode": summary.get("mode"), "counts": {k: summary.get(k) for k in
                                                                     ("raw_detections", "after_filter")}}
    with open(path, "w") as f:
        json.dump(rec, f, indent=1, default=str)
    return rec
