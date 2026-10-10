"""The PDF report (fpdf2, pure Python), written for someone who has never seen the tool.

Page 1   what we found in plain sentences, a map with the top 10 changes numbered, counts per priority, how to read it
Next     the top 10 changes, one card each: rank, priority, what it is, size, confidence, location, why, before/after crops
Then     the full list of every change found (rank, priority, type, size, confidence, latitude, longitude)
Last     impact, data sources and limits

`build` takes the pieces; `build_from_dir` rebuilds the report from a scene folder in the demo / live-job layout
(meta.json, summary.json, result_filtered.geojson, after.webp, crops/), so every report can be regenerated without the
satellite images.
"""
from __future__ import annotations

import io
import json
import os

from fpdf import FPDF

L, W = 12, 186                 # left margin and usable width (A4, mm)
MAX_TABLE_ROWS = 1500          # the CSV / GeoPackage always hold every change

# Priority colours (the web app's light theme) and the shape that accompanies each, so colour is never the only signal.
TIER_RGB = {"critical": (225, 29, 72), "high": (234, 88, 12), "medium": (202, 138, 4), "low": (2, 132, 199)}
TIER_LABEL = {"critical": "Critical", "high": "High", "medium": "Medium", "low": "Low"}
TIER_SHAPE = {"critical": "octagon", "high": "diamond", "medium": "square", "low": "circle"}
TIER_ADVICE = {
    "critical": "Check first. A large, strong change; send someone or review recent imagery now.",
    "high": "Check soon. A substantial change that is probably real.",
    "medium": "Check when you can, for example on a routine inspection.",
    "low": "Small or weak change. Often noise: confirm before acting.",
}
# plain-language name and one-line meaning for each change type
PLAIN_TYPE = {
    "built_up_gain": ("New construction", "Land that was open (vegetation or bare soil) now looks built-up: roofs, roads or concrete."),
    "vegetation_loss": ("Vegetation cleared", "Green cover has gone: trees or crops removed, or land stripped bare."),
    "vegetation_gain": ("Vegetation growth", "Green cover has increased: new crops or regrowth."),
    "water_gain": ("New water / flooding", "Ground that was dry is now covered by water."),
    "water_loss": ("Water receded", "Water that was there before has gone."),
    "other": ("Unexplained change", "The land changed a lot but not in a way that matches a known type. Look at the images."),
}
FOOTBALL_PITCH_HA = 0.714        # 105 m x 68 m
# what each false-alarm filter removes, in plain words (summary["dropped"] counts pixels, so only the names are shown)
FILTER_WORDS = {
    "cloud": "cloud and cloud shadow", "seasonal": "seasonal crop and vegetation cycles", "speckle": "tiny specks and noise",
    "not_in_preset": "change types this analysis does not track", "min_area": "areas below the minimum size",
    "permanent_water": "permanent rivers and lakes", "speckle_morphology": "radar speckle", "below_min_area": "areas below the minimum size",
}


def _txt(s):
    s = str(s).replace("·", "-").replace("→", "to").replace("–", "-").replace("—", "-").replace("²", "2")
    return s.encode("latin-1", "replace").decode("latin-1")


def _plain(ctype):
    return PLAIN_TYPE.get(ctype, (str(ctype).replace("_", " ").capitalize(), ""))


def _fmt_ha(v):
    v = float(v)
    return f"{v:,.2f}" if v < 100 else f"{v:,.0f}"


def _tier_rules(mode):
    if mode == "radar":
        return [("critical", "50 ha or more of flood water"), ("high", "10 ha or more"), ("medium", "2 ha or more"),
                ("low", "smaller than 2 ha")]
    return [("critical", "score 20,000 or more (about 2 ha of strong change)"), ("high", "score 5,000 or more"),
            ("medium", "score 1,500 or more"), ("low", "score below 1,500 (small or weak)")]


class _Pdf(FPDF):
    footer_text = "GEOAI 04"

    def footer(self):
        self.set_y(-10)
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(110, 118, 130)
        self.cell(0, 5, _txt(f"{self.footer_text}   |   page {self.page_no()} of {{nb}}"), align="C")
        self.set_text_color(0, 0, 0)


def _shape(pdf, tier, cx, cy, r, text=None):
    """A filled priority marker centred on (cx, cy); with `text` (a rank number) written inside it."""
    pdf.set_fill_color(*TIER_RGB.get(tier, TIER_RGB["low"]))
    pdf.set_draw_color(255, 255, 255)
    pdf.set_line_width(0.25)
    kind = TIER_SHAPE.get(tier, "circle")
    if kind == "square":
        pdf.rect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7, style="DF")
    elif kind == "diamond":
        pdf.polygon([(cx, cy - r * 1.15), (cx + r * 1.15, cy), (cx, cy + r * 1.15), (cx - r * 1.15, cy)], style="DF")
    elif kind == "octagon":
        import math
        pdf.polygon([(cx + r * 1.05 * math.cos(math.radians(22.5 + 45 * i)), cy + r * 1.05 * math.sin(math.radians(22.5 + 45 * i)))
                     for i in range(8)], style="DF")
    else:
        pdf.ellipse(cx - r, cy - r, 2 * r, 2 * r, style="DF")
    if text is not None:
        pdf.set_text_color(*((20, 24, 31) if tier == "medium" else (255, 255, 255)))
        pdf.set_font("Helvetica", "B", 7 if len(str(text)) < 3 else 5.5)
        pdf.set_xy(cx - r, cy - 1.6)
        pdf.cell(2 * r, 3.2, str(text), align="C")
        pdf.set_text_color(0, 0, 0)


def _h1(pdf, text):
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(20, 24, 31)
    pdf.cell(0, 7, _txt(text), new_x="LMARGIN", new_y="NEXT")


def _para(pdf, text, size=9.5, h=4.8, bold=False, w=0):
    pdf.set_font("Helvetica", "B" if bold else "", size)
    pdf.multi_cell(w, h, _txt(text), new_x="LMARGIN", new_y="NEXT")


def _png(path_or_img):
    """Any image Pillow can read (the crops are WebP) as an in-memory JPEG fpdf2 accepts."""
    from PIL import Image
    im = Image.open(path_or_img).convert("RGB")
    b = io.BytesIO()
    im.save(b, format="JPEG", quality=88)
    b.seek(0)
    return b, im.size


def _numbered_map(pdf, x, y, w, scene, gdf, top=10):
    """The after image with every change outlined in its priority colour and the top `top` changes numbered. Returns the height."""
    from PIL import Image, ImageDraw
    corners = scene.get("corners")
    if not (scene.get("image") and os.path.exists(scene["image"]) and corners):
        return 0
    base = Image.open(scene["image"]).convert("RGBA")
    scale = min(1.0, 1500 / max(base.size))
    base = base.resize((int(base.width * scale), int(base.height * scale)), Image.LANCZOS)
    w_px, h_px = base.size
    lon0, lon1 = min(c[0] for c in corners), max(c[0] for c in corners)
    lat0, lat1 = min(c[1] for c in corners), max(c[1] for c in corners)

    def px(lon, lat):
        return (lon - lon0) / (lon1 - lon0) * w_px, (lat1 - lat) / (lat1 - lat0) * h_px

    over = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    for _, r in gdf.iloc[::-1].iterrows():                        # lowest priority first, so the top ones end up on top
        colour = TIER_RGB.get(r["tier"], TIER_RGB["low"])
        geoms = list(r.geometry.geoms) if r.geometry.geom_type == "MultiPolygon" else [r.geometry]
        for g in geoms:
            pts = [px(*c[:2]) for c in g.exterior.coords]
            d.polygon(pts, fill=colour + (90,), outline=colour + (255,))
    img = Image.alpha_composite(base, over).convert("RGB")
    b = io.BytesIO()
    img.save(b, format="JPEG", quality=86)
    b.seek(0)
    h = w * h_px / w_px
    pdf.image(b, x=x, y=y, w=w, h=h)
    pdf.set_draw_color(180, 186, 196)
    pdf.set_line_width(0.2)
    pdf.rect(x, y, w, h)
    for _, r in gdf.head(top).iterrows():                         # vector markers: crisp numbers at any zoom
        mx, my = px(r["centroid_lon"], r["centroid_lat"])
        _shape(pdf, r["tier"], x + mx / w_px * w, y + my / h_px * h, 3.1, int(r["id"]))
    return h


def _crops(pdf, x, y, h, crops_dir, fid):
    """Before and after crops side by side inside a box of height h; returns True if any was drawn."""
    drawn = False
    for k, side in enumerate(("before", "after")):
        p = os.path.join(crops_dir or "", f"{fid}_{side}.webp")
        if not os.path.exists(p):
            continue
        buf, (iw, ih) = _png(p)
        cw = min(36.0, (h - 6) * iw / ih)
        ch = cw * ih / iw
        cx = x + k * 38
        pdf.image(buf, x=cx, y=y + 4, w=cw, h=ch)
        pdf.set_xy(cx, y)
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(110, 118, 130)
        pdf.cell(cw, 4, side.capitalize())
        pdf.set_text_color(0, 0, 0)
        drawn = True
    return drawn


def _card(pdf, r, total, crops_dir):
    """One top-10 change: marker, headline, facts, plain reason, advice and the before/after crops."""
    y = pdf.get_y()
    h = 58
    if y + h > 280:
        pdf.add_page()
        y = pdf.get_y()
    pdf.set_draw_color(205, 210, 218)
    pdf.set_line_width(0.2)
    pdf.rect(L, y, W, h)
    tier = r["tier"]
    name, meaning = _plain(r["change_type"])
    _shape(pdf, tier, L + 8, y + 8, 4.6, int(r["id"]))
    pdf.set_xy(L + 16, y + 3)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(100, 6, _txt(f"{name}"), new_x="LEFT", new_y="NEXT")
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(*TIER_RGB.get(tier, (0, 0, 0)) if tier != "medium" else (140, 95, 0))
    pdf.cell(100, 4.5, _txt(f"Rank {int(r['id'])} of {total}  |  {TIER_LABEL.get(tier, tier)} priority"), new_x="LEFT", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    ha = float(r["area_ha"])
    pitches = ha / FOOTBALL_PITCH_HA
    size = f"{_fmt_ha(ha)} ha ({float(r['area_m2']):,.0f} m2)" + (f", about {pitches:,.0f} football pitches" if pitches >= 1.5 else "")
    conf = f"{float(r['confidence']) * 100:.0f} %" + ("  - needs a human check" if bool(r["needs_review"]) else "")
    lat, lon = float(r["centroid_lat"]), float(r["centroid_lon"])
    x0 = L + 16
    pdf.set_x(x0)
    pdf.ln(1.2)
    for lab, val in (("Size", size), ("Confidence", conf)):
        pdf.set_x(x0)
        pdf.set_font("Helvetica", "B", 8.5)
        pdf.cell(22, 4.6, lab)
        pdf.set_font("Helvetica", "", 8.5)
        pdf.cell(82, 4.6, _txt(val), new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(x0)
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.cell(22, 4.6, "Location")
    pdf.set_font("Helvetica", "U", 8.5)
    pdf.set_text_color(29, 78, 216)
    pdf.cell(82, 4.6, f"{lat:.5f}, {lon:.5f}  (open in Google Maps)", link=f"https://www.google.com/maps?q={lat},{lon}",
             new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.set_x(x0)
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.cell(22, 4.6, "What it is")
    pdf.set_font("Helvetica", "", 8.5)
    pdf.multi_cell(82, 4.2, _txt(meaning), new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(x0)
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.cell(22, 4.6, "Why flagged")
    pdf.set_font("Helvetica", "", 8)
    reason = str(r["reason"]).split(": ", 1)[-1]
    pdf.multi_cell(82, 4, _txt(reason[:230]), new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(x0)
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.cell(22, 4.6, "What to do")
    pdf.set_font("Helvetica", "", 8)
    pdf.multi_cell(82, 4, _txt(TIER_ADVICE.get(tier, "")), new_x="LMARGIN", new_y="NEXT")
    if not _crops(pdf, L + 124, y + 2, h - 4, crops_dir, int(r["id"])):
        pdf.set_xy(L + 124, y + 20)
        pdf.set_font("Helvetica", "I", 8)
        pdf.set_text_color(110, 118, 130)
        pdf.multi_cell(60, 4, "No before / after crop was saved for this change.")
        pdf.set_text_color(0, 0, 0)
    pdf.set_y(y + h + 3)


def _table(pdf, gdf):
    n = len(gdf)
    shown = gdf.head(MAX_TABLE_ROWS)
    cols = [("Rank", 12), ("Priority", 24), ("What changed", 50), ("Size (ha)", 22), ("Confidence", 22), ("Latitude", 28), ("Longitude", 28)]

    def header():
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(236, 239, 244)
        pdf.set_text_color(20, 24, 31)
        for c, w in cols:
            pdf.cell(w, 6, c, border=0, fill=True)
        pdf.ln()
        pdf.set_text_color(0, 0, 0)

    pdf.add_page()
    _h1(pdf, f"All {n:,} changes found")
    _para(pdf, "Every change that survived the false-alarm filters, in priority order (rank 1 is the highest). "
               "A * after the confidence means it needs a human check. The CSV and GeoPackage downloads hold the same list with every attribute.",
          size=8.5, h=4.4)
    pdf.ln(1)
    header()
    for i, (_, r) in enumerate(shown.iterrows()):
        if pdf.get_y() > 280:
            pdf.add_page()
            header()
        y = pdf.get_y()
        if i % 2:
            pdf.set_fill_color(247, 248, 250)
            pdf.rect(L, y, W, 5.2, style="F")
        _shape(pdf, r["tier"], L + 14.8, y + 2.6, 1.5)
        pdf.set_font("Helvetica", "", 8)
        vals = [int(r["id"]), TIER_LABEL.get(r["tier"], r["tier"]), _plain(r["change_type"])[0], _fmt_ha(r["area_ha"]),
                f"{float(r['confidence']) * 100:.0f} %" + (" *" if bool(r["needs_review"]) else ""),
                f"{float(r['centroid_lat']):.5f}", f"{float(r['centroid_lon']):.5f}"]
        for k, ((c, w), v) in enumerate(zip(cols, vals, strict=True)):
            if k == 1:
                pdf.cell(5, 5.2, "")                      # room for the priority shape
                w -= 5
            pdf.cell(w, 5.2, _txt(v))
        pdf.ln()
    if n > MAX_TABLE_ROWS:
        pdf.ln(2)
        _para(pdf, f"Showing the first {MAX_TABLE_ROWS:,} of {n:,} changes. The remaining {n - MAX_TABLE_ROWS:,} are the lowest-priority ones; "
                   "download the CSV or GeoPackage for the complete list.", size=8.5, h=4.4)


def build(path, title, summary, gdf, snapshot_png=None, permalink=None, limits=None, scene=None):
    """Write the report. `scene` (optional dict) adds the numbered map and the crops:
    {"image": after.webp path, "corners": [[lon, lat] x4], "crops_dir": folder, "before_label": str, "after_label": str}."""
    scene = scene or {}
    mode = summary.get("mode", "spectral")
    n = len(gdf)
    imp = summary.get("impact") or {}
    pdf = _Pdf(format="A4")
    pdf.footer_text = f"GEOAI 04 - {title}"[:90]
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(False)
    pdf.set_margins(L, 12, L)
    pdf.add_page()

    # ---- title ----
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.set_text_color(110, 118, 130)
    pdf.cell(0, 5, "GEOAI 04  |  SATELLITE CHANGE REPORT", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(20, 24, 31)
    pdf.set_font("Helvetica", "B", 17)
    pdf.multi_cell(0, 8, _txt(title), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(70, 78, 90)
    pdf.set_font("Helvetica", "", 9)
    sub = summary.get("subtitle") or ""
    if scene.get("before_label") and scene.get("after_label"):
        sub = f"{scene.get('place') or ''}   |   {scene['before_label']}  to  {scene['after_label']}".strip(" |")
    pdf.multi_cell(0, 4.6, _txt(sub), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(2)

    # ---- what we found, in plain sentences ----
    _h1(pdf, "What we found")
    flood = mode == "radar"
    raw = summary.get("raw_detections")
    if n == 0:
        found = "No real changes were found between these two dates. Everything the detector first flagged was removed by the false-alarm filters, which is a valid result."
    else:
        top = gdf.iloc[0]
        t_name = _plain(top["change_type"])[0].lower()
        found = (f"We found {n:,} real {'flooded areas' if flood else 'changes'} covering {_fmt_ha(imp.get('changed_ha', gdf['area_ha'].sum()))} hectares. "
                 f"The biggest and strongest (rank 1) is {t_name}: {_fmt_ha(top['area_ha'])} ha at {float(top['centroid_lat']):.4f}, {float(top['centroid_lon']):.4f}.")
    _para(pdf, found)
    by_tier = summary.get("by_tier") or ({t: int((gdf["tier"] == t).sum()) for t in TIER_LABEL} if n else {})
    if n:
        _para(pdf, "By priority: " + ", ".join(f"{by_tier.get(t, 0):,} {TIER_LABEL[t]}" for t in TIER_LABEL) + ".")
    drops = {k: v for k, v in (summary.get("dropped") or {}).items() if v}
    if raw is not None and n:
        why = ", ".join(FILTER_WORDS.get(k, str(k).replace("_", " ")) for k, v in sorted(drops.items(), key=lambda kv: -kv[1]))
        _para(pdf, f"The detector first flagged {int(raw):,} candidate areas. The rest were removed as false alarms" + (f": {why}." if why else "."),
              size=8.5, h=4.4)
    pdf.ln(1.5)

    # ---- numbered map + counts ----
    y0 = pdf.get_y()
    map_w = 112
    map_h = _numbered_map(pdf, L, y0, map_w, scene, gdf)
    if not map_h and snapshot_png and os.path.exists(snapshot_png):
        buf, (iw, ih) = _png(snapshot_png)
        map_h = map_w * ih / iw
        pdf.image(buf, x=L, y=y0, w=map_w, h=map_h)
    if map_h:
        pdf.set_xy(L, y0 + map_h + 0.8)
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(110, 118, 130)
        pdf.cell(map_w, 3.5, "Numbers = rank of the 10 highest-priority changes. Outline colour = priority.")
        pdf.set_text_color(0, 0, 0)
        map_h += 5
    rx = L + map_w + 6 if map_h else L
    rw = W - (rx - L)
    pdf.set_xy(rx, y0)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(rw, 6, "Changes by priority", new_x="LEFT", new_y="NEXT")
    for t in TIER_LABEL:
        yy = pdf.get_y()
        _shape(pdf, t, rx + 3, yy + 3, 2.2)
        pdf.set_xy(rx + 8, yy)
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(22, 6, TIER_LABEL[t])
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(rw - 30, 6, f"{by_tier.get(t, 0):,}", new_x="LEFT", new_y="NEXT")
        pdf.set_x(rx)
    pdf.ln(2)
    pdf.set_x(rx)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(rw, 6, "Totals", new_x="LEFT", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    facts = [f"Area changed: {_fmt_ha(imp.get('changed_ha', 0))} ha"]
    for k, lab in (("cropland_ha", "Cropland affected"), ("built_up_ha", "Built-up land affected")):
        v = imp.get(k)
        if v is not None:
            flag = " (upper bound)" if k == "cropland_ha" and imp.get("cropland_reliability") == "upper_bound" else ""
            facts.append(f"{lab}: {_fmt_ha(v)} ha{flag}")
    for k, lab in (("buildings", "Buildings in the area"), ("road_segments", "Road segments in the area")):
        if imp.get(k) is not None:
            facts.append(f"{lab}: {int(imp[k]):,}")
    for ln in facts:
        pdf.set_x(rx)
        pdf.multi_cell(rw, 4.8, _txt(ln), new_x="LEFT", new_y="NEXT")
    pdf.set_y(max(pdf.get_y(), y0 + map_h) + 3)

    # ---- how to read this report ----
    if pdf.get_y() > 200:
        pdf.add_page()
    _h1(pdf, "How to read this report")
    items = [
        ("Rank", "Every change has a number. Rank 1 is the highest priority: the largest and strongest change. Priority = size x strength of the change."),
        ("Priority colour and shape", "; ".join(f"{TIER_LABEL[t]} ({TIER_SHAPE[t]}): {rule}" for t, rule in _tier_rules(mode)) + "."),
        ("Confidence", "How sure the system is that the change is real, from 0 to 100 %. Changes marked 'needs a human check' sit between 50 % and 70 %."),
        ("What changed", "New construction, vegetation cleared, vegetation growth, new water / flooding, water receded, or unexplained change. These come from rules on the satellite colours, not from knowing what is actually on the ground."),
        ("Raw detections", "Everything the detector first flagged. Most are not real (clouds, crop seasons, shadows, specks), so only changes that pass the filters are listed here."),
    ]
    for head, body in items:
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(46, 4.8, _txt(head))
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(W - 46, 4.8, _txt(body), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(0.8)

    # ---- top 10 cards ----
    if n:
        pdf.add_page()
        _h1(pdf, f"The {min(10, n)} highest-priority changes")
        _para(pdf, "Start here. Each card says where the change is, how big it is, why it was flagged and what to do.", size=8.5, h=4.4)
        pdf.ln(1)
        for _, r in gdf.head(10).iterrows():
            _card(pdf, r, n, scene.get("crops_dir"))
        _table(pdf, gdf)

    # ---- sources, limits, QR ----
    pdf.add_page()
    _h1(pdf, "Data sources")
    pdf.set_font("Helvetica", "", 9)
    for s in list(summary.get("sources") or []) + list(imp.get("sources") or []):
        pdf.multi_cell(0, 4.6, _txt("- " + s), new_x="LMARGIN", new_y="NEXT")
    ev = summary.get("evaluation")
    if ev and ev.get("m8"):
        pdf.ln(2)
        _h1(pdf, "Accuracy check")
        _para(pdf, f"On this scene the flood extent was compared with expert hand-drawn labels ({ev.get('against', 'expert labels')}). "
                   f"Overlap (IoU): {ev['m8'].get('iou', 0):.2f} for this method, {ev['naive'].get('iou', 0):.2f} for a simple fixed threshold. "
                   "This is one demonstration scene, not a held-out test.", size=9)
    pdf.ln(2)
    _h1(pdf, "Limits - what this report cannot tell you")
    pdf.set_font("Helvetica", "", 9)
    for s in list(limits or []) + list(imp.get("notes") or []):
        pdf.multi_cell(0, 4.6, _txt("- " + s), new_x="LMARGIN", new_y="NEXT")
    pdf.multi_cell(0, 4.6, _txt("- This report points to where to look. Confirm important changes on the ground before acting."),
                   new_x="LMARGIN", new_y="NEXT")
    if permalink:
        import qrcode
        b = io.BytesIO()
        qrcode.make(permalink).save(b, format="PNG")
        b.seek(0)
        pdf.ln(3)
        y = pdf.get_y()
        pdf.image(b, x=L, y=y, w=28)
        pdf.set_xy(L + 32, y + 8)
        pdf.set_font("Helvetica", "", 8)
        pdf.multi_cell(120, 4, _txt("Open this result on the map: " + permalink))
    pdf.output(path)
    return path


def build_from_dir(scene_dir, out_path=None, title=None, permalink=None):
    """Rebuild the report for a scene folder (demo or live-job layout) from its committed / saved files."""
    import geopandas as gpd
    j = lambda name: json.load(open(os.path.join(scene_dir, name), encoding="utf-8"))  # noqa: E731
    meta, summary = j("meta.json"), j("summary.json")
    gdf = gpd.read_file(os.path.join(scene_dir, "result_filtered.geojson"))
    if len(gdf) and "id" in gdf:
        gdf = gdf.sort_values("id")
    corners = meta.get("corners") or (j("bounds.json").get("corners") if os.path.exists(os.path.join(scene_dir, "bounds.json")) else None)
    scene = {"image": os.path.join(scene_dir, "after.webp"), "corners": corners, "crops_dir": os.path.join(scene_dir, "crops"),
             "before_label": meta.get("before_label"), "after_label": meta.get("after_label"), "place": meta.get("place")}
    title = title or f"{meta.get('name', 'Change report')}"
    out_path = out_path or os.path.join(scene_dir, "exports", "report.pdf")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    return build(out_path, title, summary, gdf, None, permalink, summary.get("limits"), scene)
