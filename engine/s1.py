"""Sentinel-1 data access for the radar mode (M8): Planetary Computer and NASA OPERA RTC-S1.

  * Planetary Computer `sentinel-1-rtc`: radiometrically terrain-corrected gamma0 (linear power), 10 m, free,
    read anonymously with a short-lived SAS token that `planetary_computer.sign` fetches (no account).
    Ingestion stopped on 17 Apr 2026, so it has no scenes after that date.
  * NASA OPERA RTC-S1 (via ASF): 30 m, needs a free Earthdata login; the token is read from the environment
    variable EARTHDATA_TOKEN at call time and never logged or written anywhere.

Both give linear power; `radar.load_chip` expects dB, so `read_chip` converts (zeros and negatives are masked
BEFORE the log, otherwise they become -inf).

Verification status (see docs/M8_RADAR_FLOOD_DATA.md section 8): everything here is unit-tested offline, but the
live checks V-M8-1 (Planetary Computer) and V-M8-2 (Earthdata/OPERA) have to be run from a machine with access:
    python -m engine.s1 --check mpc
    EARTHDATA_TOKEN=... python -m engine.s1 --check opera
The OPERA functions follow the documented `asf_search` API but have not been run against the live service.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import numpy as np
import rasterio
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds

STAC_MPC = "https://planetarycomputer.microsoft.com/api/stac/v1"
ASSAM_BOX = (91.6, 26.0, 91.9, 26.3)            # lon_min, lat_min, lon_max, lat_max: Brahmaputra floodplain
DRY_MONTHS = (11, 12, 1, 2, 3)                  # Indian dry season; override for other regions


@dataclass
class Scene:
    id: str
    datetime: datetime
    relative_orbit: int | None
    orbit_state: str | None                     # "ascending" | "descending"
    hrefs: dict = field(default_factory=dict)   # {"vv": url, "vh": url}
    source: str = "mpc"


def load_dotenv(paths=None) -> list:
    """Read KEY=VALUE lines from a `.env` file into os.environ, without overriding variables that are already set.

    Looks in the current folder, then in the repository root. Values are never printed or logged. Returns the
    names (not the values) that were set, so a caller can say "loaded EARTHDATA_TOKEN from .env".
    """
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    names = []
    for path in paths or (os.path.join(os.getcwd(), ".env"), os.path.join(root, ".env")):
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8-sig") as f:                      # utf-8-sig: Notepad may add a BOM
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key, val = key.strip().removeprefix("export ").strip(), val.strip().strip('"').strip("'")
                if key and val and key not in os.environ:
                    os.environ[key] = val
                    names.append(key)
    return names


def to_db(linear) -> np.ndarray:
    """Linear power to dB. Zeros, negatives and non-finite values become NaN first (never -inf)."""
    a = np.asarray(linear, np.float32)
    out = np.full(a.shape, np.nan, np.float32)
    ok = np.isfinite(a) & (a > 0)
    out[ok] = 10.0 * np.log10(a[ok])
    return out


def _aware(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def search_mpc(bbox, start, end, client=None, collection="sentinel-1-rtc", max_items=200) -> list[Scene]:
    """Scenes covering `bbox` between two dates (ISO strings or datetimes), newest last.

    `client` is a pystac_client.Client (injected in tests); by default one is opened on the public STAC API.
    """
    if client is None:
        import planetary_computer
        import pystac_client
        client = pystac_client.Client.open(STAC_MPC, modifier=planetary_computer.sign_inplace)
    iso = lambda d: d if isinstance(d, str) else d.date().isoformat()  # noqa: E731
    items = client.search(collections=[collection], bbox=list(bbox), datetime=f"{iso(start)}/{iso(end)}",
                          max_items=max_items).items()
    scenes = []
    for it in items:
        p = it.properties
        if "vv" not in it.assets or "vh" not in it.assets:
            continue                                                   # need both polarisations
        scenes.append(Scene(id=it.id, datetime=_aware(it.datetime), relative_orbit=p.get("sat:relative_orbit"),
                            orbit_state=p.get("sat:orbit_state"),
                            hrefs={"vv": it.assets["vv"].href, "vh": it.assets["vh"].href}))
    return sorted(scenes, key=lambda s: s.datetime)


def pick_reference(scenes, event_dt, relative_orbit, orbit_state, n=3, dry_months=DRY_MONTHS, max_age_days=400):
    """The `n` scenes closest before the event that match its orbit and fall in the dry season.

    Same relative orbit and direction keeps the viewing geometry identical, which matters because radar
    backscatter changes with look angle. Raises if nothing qualifies (better than a silent bad reference).
    """
    event_dt = _aware(event_dt)
    ok = [s for s in scenes
          if s.relative_orbit == relative_orbit and s.orbit_state == orbit_state
          and s.datetime < event_dt - timedelta(days=1) and (event_dt - s.datetime).days <= max_age_days
          and s.datetime.month in dry_months]
    if not ok:
        raise LookupError(f"no dry-season scenes on relative orbit {relative_orbit} ({orbit_state}) in the {max_age_days} "
                          f"days before {event_dt.date()}; widen the search window or the dry months")
    return sorted(ok, key=lambda s: event_dt - s.datetime)[:n]


def read_chip(vv_href, vh_href, bbox, out_path, sign=None) -> str:
    """Windowed read of VV and VH around `bbox` (lon/lat), written as a 2-band dB GeoTIFF for `radar.load_chip`.

    `sign` (e.g. planetary_computer.sign) is applied to each href first. Only the window is downloaded.
    """
    bands, transform, crs = [], None, None
    for href in (vv_href, vh_href):
        href = sign(href) if sign else href
        with rasterio.open(href) as s:
            win = from_bounds(*transform_bounds("EPSG:4326", s.crs, *bbox), transform=s.transform)
            win = win.round_offsets().round_lengths()
            a = s.read(1, window=win, boundless=True, fill_value=0).astype(np.float32)
            nodata = s.nodata
            if nodata is not None:
                a[a == nodata] = 0
            if transform is None:
                transform, crs = s.window_transform(win), s.crs
        bands.append(to_db(a))
    h, w = bands[0].shape
    if bands[1].shape != (h, w):
        raise ValueError("VV and VH windows differ in size")
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with rasterio.open(out_path, "w", driver="GTiff", height=h, width=w, count=2, dtype="float32", crs=crs,
                       transform=transform,
                       nodata=np.nan, compress="deflate") as d:
        d.write(bands[0], 1)
        d.write(bands[1], 2)
        d.set_band_description(1, "VV dB")
        d.set_band_description(2, "VH dB")
    return out_path


def search_opera(bbox, start, end, results=None) -> list[Scene]:
    """OPERA RTC-S1 products over `bbox` (UNVERIFIED against the live service; see module docstring)."""
    if results is None:
        import asf_search as asf
        w, s, e, n = bbox
        wkt = f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"
        results = asf.search(dataset="OPERA-S1", processingLevel="RTC", intersectsWith=wkt, start=str(start), end=str(end))
    out = []
    for r in results:
        p = r.properties
        out.append(Scene(id=p.get("fileID", ""), datetime=_aware(datetime.fromisoformat(str(p["startTime"]).replace("Z", "+00:00"))),
                         relative_orbit=p.get("pathNumber"), orbit_state=str(p.get("flightDirection", "")).lower() or None,
                         hrefs={"product": p.get("url", "")}, source="opera"))
    return sorted(out, key=lambda s: s.datetime)


def download_opera(results, dest_dir, token=None):
    """Download ASF results with an Earthdata token from the argument or EARTHDATA_TOKEN. Never prints the token."""
    load_dotenv()
    token = token or os.environ.get("EARTHDATA_TOKEN")
    if not token:
        raise PermissionError("EARTHDATA_TOKEN is not set (create a free Earthdata Login and a token; keep it in .env)")
    import asf_search as asf
    session = asf.ASFSession().auth_with_token(token)
    os.makedirs(dest_dir, exist_ok=True)
    asf.ASFSearchResults(results).download(path=dest_dir, session=session)
    return dest_dir


def inspect_opera(bbox=ASSAM_BOX, start="2026-06-01", end="2026-08-31", n=3, results=None) -> list:
    """What the first `n` OPERA results look like: the listing fields and every file URL (no secrets in them).

    Used once to see the real product layout (OPERA scenes are small bursts with separate VV and VH files) before
    writing the download step. Needs EARTHDATA_TOKEN only for the search, not for this listing.
    """
    if results is None:
        load_dotenv()
        import asf_search as asf
        w, s_, e, n_ = bbox
        wkt = f"POLYGON(({w} {s_},{e} {s_},{e} {n_},{w} {n_},{w} {s_}))"
        results = asf.search(dataset="OPERA-S1", processingLevel="RTC", intersectsWith=wkt, start=str(start), end=str(end),
                             maxResults=max(n, 1))
    keep = ("fileID", "fileName", "startTime", "stopTime", "processingDate", "pathNumber", "flightDirection", "polarization",
            "bytes", "url", "additionalUrls", "burstID", "platform", "sceneName", "processingLevel")
    out = []
    for r in list(results)[:n]:
        p = r.properties
        out.append({k: p[k] for k in keep if k in p and p[k] not in (None, "")})
        out[-1]["_all_property_names"] = sorted(p)
        try:
            out[-1]["_geometry_bbox"] = [round(x, 3) for x in r.geometry["coordinates"][0][0]] if r.geometry else None
        except Exception:  # noqa: BLE001
            pass
    return out


def check_mpc(bbox=ASSAM_BOX, start="2024-11-01", end="2025-03-31", workdir=None) -> dict:
    """V-M8-1: list scenes for an Assam box and read a small window. Returns {ok, scenes, error?}."""
    import tempfile
    try:
        import planetary_computer
        scenes = search_mpc(bbox, start, end)
        if not scenes:
            return {"ok": False, "scenes": 0, "error": "search returned no scenes"}
        out = os.path.join(workdir or tempfile.mkdtemp(), "check.tif")
        small = (bbox[0], bbox[1], bbox[0] + 0.02, bbox[1] + 0.02)
        read_chip(scenes[0].hrefs["vv"], scenes[0].hrefs["vh"], small, out, sign=planetary_computer.sign)
        with rasterio.open(out) as s:
            a = s.read(1)
        return {"ok": bool(np.isfinite(a).any()), "scenes": len(scenes), "first": scenes[0].id, "window": list(a.shape)}
    except Exception as e:  # noqa: BLE001 - report any failure as the check result
        return {"ok": False, "error": f"{type(e).__name__}: {e}"[:300]}


def check_opera(bbox=ASSAM_BOX, start="2026-06-01", end="2026-08-31") -> dict:
    """V-M8-2: with a token in EARTHDATA_TOKEN, search OPERA RTC-S1 over the box. (Download is a separate step.)"""
    load_dotenv()
    if not os.environ.get("EARTHDATA_TOKEN"):
        return {"ok": False, "error": "EARTHDATA_TOKEN is not set (put EARTHDATA_TOKEN=... in a file named .env in the project folder)"}
    try:
        scenes = search_opera(bbox, start, end)
        return {"ok": bool(scenes), "scenes": len(scenes), "first": scenes[0].id if scenes else None}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}: {e}"[:300]}


if __name__ == "__main__":
    import argparse
    import json
    ap = argparse.ArgumentParser(description="Live access checks V-M8-1 (mpc) and V-M8-2 (opera)")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", choices=["mpc", "opera"])
    g.add_argument("--inspect", choices=["opera"], help="print what the first OPERA results contain (layout, file URLs)")
    a = ap.parse_args()
    if a.inspect:
        print(json.dumps(inspect_opera(), indent=1, default=str))
        raise SystemExit(0)
    r = check_mpc() if a.check == "mpc" else check_opera()
    print(json.dumps(r, indent=1))
    raise SystemExit(0 if r["ok"] else 1)
