import { useState } from "react";
import { area, coord, ha, pct } from "../../lib/format";
import { evidenceOf, pitches, tierAdvice, typeMeaning } from "../../lib/explain";
import { tierLabel, typeLabel } from "../../lib/tiers";
import type { ChangeProps, ReviewStatus } from "../../lib/types";
import { useUi } from "../../store/ui";
import { TierChip } from "../ui/Shapes";
import { centroidText, copyText } from "./clipboard";

function Crop({ src, side, id, onOpen }: { src: string; side: "before" | "after"; id: number; onOpen: (uri: string) => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <figure className="text-center text-tiny text-muted">
        <div className="grid aspect-square place-items-center rounded-sm border border-dashed border-line p-s8">No {side} crop for this change</div>
        <figcaption className="mt-s4">{side}</figcaption>
      </figure>
    );
  }
  return (
    <figure className="text-center text-tiny text-secondary">
      <button type="button" data-testid={`crop-${side}`} onClick={() => onOpen(src)} aria-label={`Open the ${side} crop of change ${id} full size`}
        className="press block w-full overflow-hidden rounded-sm border border-line hover:border-accent">
        <img src={src} alt={`${side} crop of change ${id}`} loading="lazy" className="block aspect-square w-full object-cover" onError={() => setFailed(true)} />
      </button>
      <figcaption className="mt-s4">{side}</figcaption>
    </figure>
  );
}

/**
 * R-25: the selected change. Selecting a different change flashes the card background accent-soft for 400 ms and
 * cross-fades the content in 160 ms; the confirm / dismiss buttons spring in (A-07). All of it is skipped under reduced motion.
 */
export default function ChangeCard({ feature: p, base, status = "pending", onReview, total }: {
  feature?: ChangeProps; base: string; status?: ReviewStatus; onReview: (s: ReviewStatus) => void; total?: number;
}) {
  const showToast = useUi((s) => s.showToast);
  const openImageViewer = useUi((s) => s.openImageViewer);
  const frame = "overflow-hidden rounded-md border border-line bg-surface shadow-card";
  if (!p) {
    return (
      <section data-testid="change-card-empty" className={frame}>
        <div className="p-s18">
          <h2 className="mb-s8 text-micro uppercase tracking-wider text-muted">Selected change</h2>
          <p className="text-body text-secondary">Click a polygon on the map or choose a row in the list to see why it was flagged.</p>
        </div>
      </section>
    );
  }
  const copy = async () => showToast((await copyText(centroidText(p))) ? "Copied" : "Could not copy, select the numbers instead");
  const maps = `https://www.google.com/maps?q=${p.centroid_lat},${p.centroid_lon}`;
  const btn = "press tap flex-1 gap-1 rounded-sm border px-s12 text-small pop-in";
  return (
    <section data-testid="change-card" className={frame}>
      <div key={p.id} className="flash p-s18">
        <div className="fade-160">
          <h2 className="mb-s8 text-micro uppercase tracking-wider text-muted">Selected change</h2>
          <div className="flex flex-wrap items-center gap-s8">
            <b className="text-h3 text-fg">#{p.id}</b>
            <TierChip tier={p.tier} />
            <span className="text-body text-secondary">{typeLabel(p.change_type)}</span>
          </div>
          <p data-testid="rank" className="mt-s4 text-body text-secondary">
            Rank {p.id}{total ? ` of ${total.toLocaleString("en-IN")}` : ""} · {tierLabel(p.tier)} priority
          </p>
          <p className="mt-s8 text-h2 text-fg">{area(p.area_m2)}</p>
          {pitches(p.area_m2) && <p data-testid="pitches" className="text-small text-secondary">{pitches(p.area_m2)}</p>}
          <p className="text-body text-secondary">
            Confidence {pct(p.confidence)} · magnitude {p.magnitude.toFixed(2)}
            {p.needs_review && <b className="ml-1 text-fg"> · needs review</b>}
          </p>
          {p.cropland_ha != null && p.cropland_ha > 0 && <p className="text-body text-secondary">Cropland inside: {ha(p.cropland_ha, 2)}</p>}
          {typeMeaning(p.change_type) && <p className="mt-s8 text-body text-secondary" data-testid="meaning"><b className="text-fg">What it is:</b> {typeMeaning(p.change_type)}</p>}
          <p className="mt-s8 text-body text-secondary" data-testid="reason"><b className="text-fg">Why:</b> {evidenceOf(p.reason)}</p>
          <p className="mt-s8 text-body text-secondary" data-testid="advice"><b className="text-fg">What to do:</b> {tierAdvice(p.tier)}</p>

          <div className="mt-s8 flex flex-wrap items-center gap-x-s8 text-body text-secondary">
            <span data-testid="centroid">{coord(p.centroid_lat)}, {coord(p.centroid_lon)}</span>
            <button type="button" data-testid="copy-centroid" onClick={copy} aria-label="Copy centroid coordinates"
              className="press tap rounded-sm px-s8 text-small text-accent hover:bg-accent-soft">Copy</button>
            <a className="tap rounded-sm px-s8 text-small text-accent" href={maps} target="_blank" rel="noreferrer">Open in Maps ↗</a>
          </div>

          <div className="mt-s8 grid grid-cols-2 gap-s8">
            {(["before", "after"] as const).map((side) => {
              const src = `${base}/crops/${p.id}_${side}.webp`;
              return <Crop key={src} src={src} side={side} id={p.id} onOpen={openImageViewer} />;
            })}
          </div>

          <div className="mt-s12 flex gap-s8">
            <button type="button" data-testid="confirm" aria-pressed={status === "confirmed"} onClick={() => onReview(status === "confirmed" ? "pending" : "confirmed")}
              className={`${btn} ${status === "confirmed" ? "border-success bg-success-soft text-fg" : "border-line-strong text-fg hover:bg-surface-hover"}`}>
              <span aria-hidden="true" className="text-success">✓</span> {status === "confirmed" ? "Confirmed" : "Confirm"}
            </button>
            <button type="button" data-testid="dismiss" aria-pressed={status === "dismissed"} onClick={() => onReview(status === "dismissed" ? "pending" : "dismissed")}
              className={`${btn} ${status === "dismissed" ? "border-danger bg-danger-soft text-fg" : "border-line-strong text-fg hover:bg-surface-hover"}`}>
              <span aria-hidden="true" className="text-danger">✗</span> {status === "dismissed" ? "Dismissed" : "Dismiss"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
