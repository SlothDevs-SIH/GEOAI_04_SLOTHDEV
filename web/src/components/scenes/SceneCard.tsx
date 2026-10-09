import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { staticBase } from "../../lib/api";
import { num } from "../../lib/format";
import { DemoBadge } from "../ui/Primitives";
import { detectorCount, kindLabel, type SceneWithVariants } from "./kinds";

/** S-02: thumbnail, kind chip, name, dates, "N raw -> M real", demo badge. `index < 12` gets the A-01 stagger. */
export default function SceneCard({ scene: s, index }: { scene: SceneWithVariants; index: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const detectors = detectorCount(s);
  const dates = s.before_date === s.after_date ? s.after_date : `${s.before_date} → ${s.after_date}`;
  return (
    <Link to={`/scene/${s.id}`} data-testid="scene-card" data-scene={s.id}
      className={`press lift group flex h-full flex-col overflow-hidden rounded-md border border-line bg-surface text-fg no-underline shadow-card hover:border-line-strong ${index < 12 ? "anim-in" : ""}`}
      style={index < 12 ? ({ "--i": index } as CSSProperties) : undefined}>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-alt">
        {!imgFailed && (
          <img src={`${staticBase(s.id)}/after.webp`} alt="" loading={index < 4 ? "eager" : "lazy"} decoding="async"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-s4 p-s12">
        <div className="flex flex-wrap items-center gap-s4">
          <span data-testid="kind-chip" className="rounded-xs border border-line-strong px-1.5 py-0.5 text-micro uppercase tracking-wide text-accent">{kindLabel(s.kind)}</span>
          {detectors > 0 && (
            <span data-testid="detectors-chip" title="Spectral, learned and hybrid results are precomputed for this scene"
              className="rounded-xs border border-line px-1.5 py-0.5 text-micro text-secondary">{detectors} detectors</span>
          )}
        </div>
        <h2 className="text-h3 text-fg">{s.name}</h2>
        <p className="text-tiny text-muted">{s.event}</p>
        <p className="text-tiny text-muted">{dates}</p>
        {s.raw_detections != null && (
          <p data-testid="scene-counts" className="mt-s4 text-body text-secondary tabular-nums">
            <b className="text-fg">{num(s.raw_detections)}</b> raw → <b className="text-accent">{num(s.after_filter)}</b> real
          </p>
        )}
        <div className="mt-auto pt-s8">{s.demo !== false && <DemoBadge />}</div>
      </div>
    </Link>
  );
}
