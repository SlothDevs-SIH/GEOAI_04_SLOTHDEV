import json
import sys

import geopandas as gpd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import rasterio
from matplotlib.patches import Patch
from rasterio.plot import plotting_extent

OUT = sys.argv[1]
S = json.load(open(f"{OUT}/summary.json"))
TIER_C = {"low": "#f2c744", "medium": "#f08a24", "high": "#e03131", "critical": "#b5179e"}
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10})


def load(n):
    d = f"{OUT}/{n}"
    with rasterio.open(f"{d}/before.tif") as a, rasterio.open(f"{d}/after.tif") as b:
        A, B, ext = a.read().transpose(1, 2, 0), b.read().transpose(1, 2, 0), plotting_extent(a)
    z = np.load(f"{d}/stages.npz")
    try:
        g = gpd.read_file(f"{d}/changes.geojson").to_crs(32614)
    except Exception:
        g = None
    return A, B, ext, z, g


def show(ax, img, title, ext=None, **kw):
    ax.imshow(img, extent=ext, interpolation="nearest", **kw)
    ax.set_title(title, fontsize=10.5, loc="left", pad=6)
    ax.set_xticks([]); ax.set_yticks([])


def overlay(ax, B, ext, g, title, label=True):
    show(ax, B, title, ext)
    if g is not None and len(g):
        for i, r in g.iterrows():
            c = TIER_C[r.tier]
            gpd.GeoSeries([r.geometry]).plot(ax=ax, facecolor=c + "55", edgecolor=c, linewidth=1.8)
            if label:
                p = r.geometry.representative_point()
                ax.text(p.x, p.y, str(i + 1), ha="center", va="center", fontsize=8,
                        color="white", weight="bold",
                        bbox=dict(boxstyle="circle,pad=0.15", fc="black", ec="none", alpha=.75))
    ax.set_xlim(ext[0], ext[1]); ax.set_ylim(ext[2], ext[3])


# ---------------- Figure 1: stage-by-stage on one scene ----------------
n = "test_2_0000_0000"
A, B, ext, z, g = load(n)
s = S[n]
fig, ax = plt.subplots(2, 4, figsize=(17, 9.2))
show(ax[0, 0], A, "1  Before (T1): open scrubland")
show(ax[0, 1], B, "2  After (T2): new housing")
show(ax[0, 2], z["baseline_raw"], f"3  Naive pixel difference + Otsu\n   {s['changed_px_pct']['baseline_raw']:.0f}% of scene flagged, "
     f"{s['raw_components']['baseline_raw']} blobs, F1 {s['baseline_raw']['f1']:.2f}", cmap="gray")
show(ax[0, 3], z["gt"], f"Reference label (human-annotated)\n   {s['gt_px_pct']:.0f}% of scene really changed", cmap="gray")
im = ax[1, 0].imshow(z["prob"], cmap="magma", vmin=0, vmax=1, interpolation="nearest")
ax[1, 0].set_title("4  Siamese model (BIT): change probability", fontsize=10.5, loc="left", pad=6)
ax[1, 0].set_xticks([]); ax[1, 0].set_yticks([])
fig.colorbar(im, ax=ax[1, 0], fraction=0.046, pad=0.02)
show(ax[1, 1], z["deep_clean"], f"5  Threshold + morphological clean-up\n   F1 {s['deep_clean']['f1']:.2f}, IoU {s['deep_clean']['iou']:.2f} vs reference", cmap="gray")
overlay(ax[1, 2], B, ext, g, f"6  Vectorised: {len(g)} polygons, coloured by tier")
ax[1, 2].legend(handles=[Patch(fc=c + "55", ec=c, label=t) for t, c in TIER_C.items()],
                loc="lower left", fontsize=8, framealpha=.9, ncol=2)
t = ax[1, 3]; t.axis("off")
t.set_title("7  Attribute table (top 8 by score)", fontsize=10.5, loc="left", pad=6)
top = g.head(8)
cells = [[i + 1, f"{r.area_m2:.0f}", f"{r.magnitude:.2f}", f"{r.centroid_lat:.5f}", f"{r.centroid_lon:.5f}", r.tier]
         for i, r in top.iterrows()]
tb = t.table(cellText=cells, colLabels=["#", "area m²", "magnitude", "lat", "lon", "tier"],
             loc="upper center", cellLoc="center", colWidths=[.08, .16, .19, .2, .21, .16])
tb.auto_set_font_size(False); tb.set_fontsize(9); tb.scale(1, 1.55)
for (r, c), cell in tb.get_celld().items():
    cell.set_edgecolor("#cccccc")
    if r == 0:
        cell.set_facecolor("#222222"); cell.get_text().set_color("white")
    elif c == 5:
        cell.set_facecolor(TIER_C[cells[r - 1][5]] + "66")
t.text(0, 0.04, f"Total changed area: {g.area_m2.sum():,.0f} m²  ({len(g)} polygons)\n"
       "Coordinates use a placeholder origin (see note).", fontsize=9, transform=t.transAxes, va="bottom")
fig.suptitle("GEOAI 04 worked example on a real image pair (LEVIR-CD, 0.5 m/px, 128 m × 128 m)",
             fontsize=13, weight="bold", x=0.01, ha="left")
fig.tight_layout(rect=(0, 0, 1, 0.96))
fig.savefig(f"{OUT}/walkthrough.png", dpi=130, facecolor="white")

# ---------------- Figure 2: false-alarm and severity cases ----------------
cases = [("train_386_0512_0768", "No real change, only lighting and season"),
         ("test_77_0512_0256", "Farmland to large commercial building"),
         ("test_55_0256_0000", "Infill housing in an existing estate")]
fig, ax = plt.subplots(3, 4, figsize=(15.5, 11.8))
for r, (n, cap) in enumerate(cases):
    A, B, ext, z, g = load(n); s = S[n]
    show(ax[r, 0], A, f"{cap}\nBefore")
    show(ax[r, 1], B, "\nAfter")
    show(ax[r, 2], z["baseline_raw"], f"Naive difference: {s['changed_px_pct']['baseline_raw']:.0f}% flagged,\n"
         f"{s['raw_components']['baseline_raw']} blobs", cmap="gray")
    k = len(g) if g is not None else 0
    area = g.area_m2.sum() if k else 0
    tiers = ", ".join(f"{v} {t}" for t, v in g.tier.value_counts().items()) if k else "nothing to report"
    overlay(ax[r, 3], B, ext, g, f"Pipeline output: {k} polygons, {area:,.0f} m²\n{tiers}", label=False)
fig.suptitle("Same pipeline on three more real pairs: what gets suppressed and what gets escalated",
             fontsize=13, weight="bold", x=0.01, ha="left")
fig.tight_layout(rect=(0, 0, 1, 0.965))
fig.savefig(f"{OUT}/more_cases.png", dpi=120, facecolor="white")
print(g.head(3).to_string())
