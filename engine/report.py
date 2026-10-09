"""One-page PDF report (fpdf2, pure Python): map snapshot, totals, impact with sources, top 10 changes,
limits, and a QR code to the permalink."""
from __future__ import annotations

import io

from fpdf import FPDF


def _txt(s):
    return str(s).encode("latin-1", "replace").decode("latin-1")


def build(path, title, summary, gdf, snapshot_png=None, permalink=None, limits=None):
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(True, 12)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 15)
    pdf.cell(0, 9, _txt(title), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(0, 5, _txt(summary.get("subtitle", "")), new_x="LMARGIN", new_y="NEXT")
    y0 = pdf.get_y() + 2
    if snapshot_png:
        pdf.image(snapshot_png, x=10, y=y0, w=95)
    if permalink:
        import qrcode
        b = io.BytesIO()
        qrcode.make(permalink).save(b, format="PNG")
        b.seek(0)
        pdf.image(b, x=170, y=y0, w=30)
        pdf.set_xy(140, y0 + 31)
        pdf.set_font("Helvetica", "", 7)
        pdf.multi_cell(60, 3.5, _txt("Open this result: " + permalink))
    pdf.set_xy(110, y0)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(55, 6, "Totals", new_x="LEFT", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    imp = summary.get("impact", {})
    lines = [f"Raw detections: {summary.get('raw_detections')}",
             f"Real changes after filters: {summary.get('after_filter')}",
             f"Area changed: {imp.get('changed_ha', 0)} ha"]
    for k, lab in (("cropland_ha", "Cropland affected"), ("built_up_ha", "Built-up land affected")):
        v = imp.get(k)
        flag = " (upper bound)" if k == "cropland_ha" and imp.get("cropland_reliability") == "upper_bound" else ""
        lines.append(f"{lab}: {'unknown' if v is None else str(v) + ' ha' + flag}")
    lines += [f"{t}: {n}" for t, n in summary.get("by_tier", {}).items()]
    for ln in lines:
        pdf.cell(55, 5, _txt(ln), new_x="LEFT", new_y="NEXT")
    pdf.set_y(max(pdf.get_y(), y0 + (70 if snapshot_png else 40)) + 4)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 6, "Top 10 changes", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 8)
    cols = [("#", 8), ("Tier", 16), ("Type", 34), ("Area (ha)", 18), ("Conf.", 12), ("Reason", 102)]
    for c, w in cols:
        pdf.cell(w, 5, c, border="B")
    pdf.ln()
    pdf.set_font("Helvetica", "", 7.5)
    for _, r in gdf.head(10).iterrows():
        vals = [r["id"], r["tier"], r["change_type"], r["area_ha"], r["confidence"], str(r["reason"])[:80]]
        for (c, w), v in zip(cols, vals):
            pdf.cell(w, 5, _txt(v))
        pdf.ln()
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, 5, "Sources and limits", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 7.5)
    for s in summary.get("sources", []) + imp.get("sources", []):
        pdf.multi_cell(0, 4, _txt("- " + s), new_x="LMARGIN", new_y="NEXT")
    for s in (limits or []) + imp.get("notes", []):
        pdf.multi_cell(0, 4, _txt("- " + s), new_x="LMARGIN", new_y="NEXT")
    pdf.output(path)
    return path
