"""Data-quality flags per scene, returned in summary.warnings / summary.quality."""
from __future__ import annotations

from datetime import date

import numpy as np

from .config import SCL_INVALID


def _season(d: date) -> str:
    m = d.month   # Indian seasons
    return "monsoon" if 6 <= m <= 9 else "post-monsoon" if m in (10, 11) else "winter" if m in (12, 1, 2) else "summer"


def check_dates(before_date=None, after_date=None):
    """Raise ValueError (plain language) for an unreadable date or a before date that is not earlier than the after date.

    Dates are optional: with one or none given there is nothing to compare. Unlike the area fetch, no earliest-date
    limit applies, because an uploaded image can be from any year.
    """
    parsed = []
    for name, text in (("before date", before_date), ("after date", after_date)):
        if not text:
            parsed.append(None)
            continue
        try:
            parsed.append(date.fromisoformat(str(text)[:10]))
        except ValueError as exc:
            raise ValueError(f"the {name} must be a date like 2025-01-31") from exc
    if parsed[0] and parsed[1] and parsed[0] >= parsed[1]:
        raise ValueError("the before date must be earlier than the after date")


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
