"""Data-quality flags per scene, returned in summary.warnings / summary.quality."""
from __future__ import annotations

from datetime import date

import numpy as np

from .config import SCL_INVALID


def _season(d: date) -> str:
    m = d.month   # Indian seasons
    return "monsoon" if 6 <= m <= 9 else "post-monsoon" if m in (10, 11) else "winter" if m in (12, 1, 2) else "summer"


def flags(pair, before_date=None, after_date=None):
    q, warn = {}, list(pair.warnings)
    if pair.scl_before is not None:
        for side, scl in (("before", pair.scl_before), ("after", pair.scl_after)):
            pct = float(np.isin(scl, SCL_INVALID).mean() * 100)
            q[f"cloud_or_invalid_pct_{side}"] = round(pct, 2)
            if pct > 5:
                warn.append(f"{side} image is {pct:.0f}% cloud / shadow / no-data over the area")
    q["shift_px"] = list(pair.shift_px)
    q["pixel_m"] = pair.pixel_m
    if before_date and after_date:
        b, a = date.fromisoformat(str(before_date)[:10]), date.fromisoformat(str(after_date)[:10])
        q["season_before"], q["season_after"] = _season(b), _season(a)
        q["days_apart"] = (a - b).days
        if _season(b) != _season(a):
            warn.append(f"different seasons ({_season(b)} vs {_season(a)}): vegetation change is expected "
                        "and is filtered as seasonal")
    return q, warn
