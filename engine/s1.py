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
OPERA: search, listing and token acceptance were run live (V-M8-2); the download and mosaic below were written from that real listing and are unit-tested with fake downloads.
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
    hrefs: dict = field(default_factory=dict)   # {"vv": url, "vh": url}; an OPERA acquisition holds lists, one URL per burst
    source: str = "mpc"
    burst_id: str | None = None


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


def _opera_url(p, suffix):
    return next((u for u in p.get("additionalUrls") or [] if u.endswith(suffix)), None)


def search_opera(bbox, start, end, results=None) -> list[Scene]:
    """OPERA RTC-S1 bursts over `bbox`, one Scene per burst, oldest first.

    A burst is a small strip (about 20 x 85 km); several consecutive bursts make one acquisition (see
    `group_acquisitions`). Each carries the URLs of its VV and VH GeoTIFFs (linear gamma0 power, 30 m, UTM), taken from the
    `additionalUrls` the service lists. The layout was read from the live service on 9 Oct 2026 (`--inspect opera`).
    """
    if results is None:
        load_dotenv()
        import asf_search as asf
        w, s_, e, n = bbox
        wkt = f"POLYGON(({w} {s_},{e} {s_},{e} {n},{w} {n},{w} {s_}))"
        results = asf.search(dataset="OPERA-S1", processingLevel="RTC", intersectsWith=wkt, start=str(start), end=str(end))
    out = []
    for r in results:
        p = r.properties
        vv, vh = _opera_url(p, "_VV.tif"), _opera_url(p, "_VH.tif")
        if not (vv and vh):
            continue                                                       # need both polarisations
        out.append(Scene(id=p.get("fileID", ""), datetime=_aware(datetime.fromisoformat(str(p["startTime"]).replace("Z", "+00:00"))),
                         relative_orbit=p.get("pathNumber"), orbit_state=str(p.get("flightDirection", "")).lower() or None,
                         hrefs={"vv": vv, "vh": vh}, source="opera", burst_id=p.get("operaBurstID")))
    return sorted(out, key=lambda s: s.datetime)


def group_acquisitions(bursts, gap_s=30) -> list[Scene]:
    """Merge bursts of one pass into one Scene each: same relative orbit and direction, start times within `gap_s`.

    The result's `hrefs` hold lists (`{"vv": [...], "vh": [...]}`) and `datetime` is the first burst's time, so
    `pick_reference` works on acquisitions exactly as it does on single scenes.
    """
    groups: list[list[Scene]] = []
    for b in sorted(bursts, key=lambda s: (s.relative_orbit or 0, s.orbit_state or "", s.datetime)):
        last = groups[-1][-1] if groups else None
        if (last and last.relative_orbit == b.relative_orbit and last.orbit_state == b.orbit_state
                and (b.datetime - last.datetime).total_seconds() <= gap_s):
            groups[-1].append(b)
        else:
            groups.append([b])
    out = [Scene(id=g[0].id, datetime=g[0].datetime, relative_orbit=g[0].relative_orbit, orbit_state=g[0].orbit_state,
                 hrefs={"vv": [x.hrefs["vv"] for x in g], "vh": [x.hrefs["vh"] for x in g]}, source="opera",
                 burst_id=",".join(str(x.burst_id) for x in g))
           for g in groups]
    return sorted(out, key=lambda s: s.datetime)


def download_files(urls, dest_dir, token=None, session=None) -> list:
    """Download URLs into `dest_dir` (skipping files already there) with an Earthdata token; returns local paths.

    The token comes from the argument or EARTHDATA_TOKEN (`.env` is read) and is never printed. A 401 or 403 raises a
    PermissionError that says so without echoing anything secret.
    """
    if session is None:
        load_dotenv()
        token = token or os.environ.get("EARTHDATA_TOKEN")
        if not token:
            raise PermissionError("EARTHDATA_TOKEN is not set (put EARTHDATA_TOKEN=... in a file named .env in the project folder)")
        import asf_search as asf
        session = asf.ASFSession().auth_with_token(token)
    os.makedirs(dest_dir, exist_ok=True)
    paths = []
    for url in urls:
        path = os.path.join(dest_dir, os.path.basename(url.split("?")[0]))
        if not (os.path.exists(path) and os.path.getsize(path) > 0):
            r = session.get(url, stream=True, timeout=120)
            if r.status_code in (401, 403):
                raise PermissionError(f"Earthdata refused the download ({r.status_code}): the token is invalid or expired, or the "
                                      "account has not accepted the ASF / OPERA terms (open the file link once in a browser while signed in)")
            r.raise_for_status()
            tmp = path + ".part"
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
            os.replace(tmp, path)
        paths.append(path)
    return paths


def mosaic_chip(vv_paths, vh_paths, bbox, out_path) -> str:
    """Mosaic linear-power VV and VH bursts over `bbox` into one 2-band dB GeoTIFF that `radar.load_chip` reads.

    Bursts are resampled onto one grid in the first file's UTM zone at its own posting (30 m for OPERA); overlaps are
    averaged in the linear domain (the right place to average power), then converted to dB with zeros and negatives
    masked first. Raises if the values look like dB already (OPERA is linear; a product change would show up here).
    """
    import warnings

    from rasterio.transform import from_origin
    from rasterio.warp import Resampling, reproject
    vv_paths, vh_paths = list(vv_paths), list(vh_paths)
    if not vv_paths or len(vv_paths) != len(vh_paths):
        raise ValueError("need the same non-empty number of VV and VH files")
    with rasterio.open(vv_paths[0]) as s:
        crs, res = s.crs, abs(s.transform.a)
    left, bottom, right, top = transform_bounds("EPSG:4326", crs, *bbox)
    left, top = np.floor(left / res) * res, np.ceil(top / res) * res
    w, h = int(np.ceil((right - left) / res)), int(np.ceil((top - bottom) / res))
    dst_t = from_origin(left, top, res, res)
    bands = []
    for paths in (vv_paths, vh_paths):
        total, count = np.zeros((h, w), np.float64), np.zeros((h, w), np.int32)
        for path in paths:
            with rasterio.open(path) as s:
                if s.crs != crs:
                    raise ValueError(f"{os.path.basename(path)} is in {s.crs}, not {crs}: bursts must share a UTM zone")
                a = s.read(1).astype(np.float32)
                a[(a <= 0) | ~np.isfinite(a)] = np.nan
                out = np.full((h, w), np.nan, np.float32)
                reproject(a, out, src_transform=s.transform, src_crs=s.crs, dst_transform=dst_t, dst_crs=crs,
                          resampling=Resampling.nearest, src_nodata=np.nan, dst_nodata=np.nan)
            ok = np.isfinite(out)
            total[ok] += out[ok]
            count[ok] += 1
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            bands.append(to_db(np.where(count > 0, total / np.maximum(count, 1), np.nan)))
    finite = np.isfinite(bands[0])
    if finite.mean() > 0.05 and np.nanmedian(bands[0]) > 5:
        raise ValueError("backscatter values look too large for dB of a land scene: check the product's units")
    if finite.mean() < 0.01:
        raise ValueError("almost no valid pixels in the box: the bursts do not cover it, or the values are already in dB (negative)")
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with rasterio.open(out_path, "w", driver="GTiff", height=h, width=w, count=2, dtype="float32", crs=crs, transform=dst_t,
                       nodata=np.nan, compress="deflate") as d:
        d.write(bands[0], 1)
        d.write(bands[1], 2)
        d.set_band_description(1, "VV dB")
        d.set_band_description(2, "VH dB")
    return out_path


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
