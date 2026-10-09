import { useRef } from "react";
import type { Detector, VariantInfo } from "../../lib/types";
import { Button, InlineAlert } from "../ui/Primitives";

export const DETECTOR_LABEL: Record<Detector, string> = {
  spectral: "Spectral rules",
  learned: "Learned · PyTorch→ONNX",
  hybrid: "Hybrid",
};

/** One honest sentence per detector: what it is, and what it costs. Shown under the control. */
export const DETECTOR_NOTE: Record<Detector, string> = {
  spectral: "Rule-based indices + false-alarm filters (default)",
  learned:
    "Siamese U-Net trained with PyTorch on OSCD, served with ONNX Runtime. Best held-out F1 (0.54 vs 0.38) but on no-change farmland it raises about 12x more polygons than the rules",
  hybrid:
    "Learned model must also match a rule-based change type: fewer farmland false alarms, but it also drops real change (recall 0.03 on OSCD validation)",
};

const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * Detector picker (only rendered when the scene ships precomputed variants): spectral rules | learned | hybrid.
 * A radio group with a roving tabindex: arrow keys move and select, like a native radio set.
 */
export default function DetectorSwitch({ value, variants, spectral, loading, error, onChange, onRetry }: {
  value: Detector;
  variants: VariantInfo[];
  spectral?: { raw: number; kept: number };
  /** The detector being fetched right now, if any. */
  loading?: Detector;
  error?: string;
  onChange: (d: Detector) => void;
  onRetry?: () => void;
}) {
  const modes: Detector[] = ["spectral", ...variants.map((v) => v.mode)];
  const kept = (d: Detector) => (d === "spectral" ? spectral?.kept : variants.find((v) => v.mode === d)?.after_filter);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = modes[(i + step + modes.length) % modes.length];
    onChange(next);
    refs.current[next]?.focus();
  };
  return (
    <section data-testid="detector" aria-label="Detector" className="rounded-md border border-line bg-surface p-s12 shadow-card">
      <h2 className="mb-s8 text-micro uppercase tracking-wider text-muted">Detector</h2>
      <div role="radiogroup" aria-label="Detector" aria-busy={!!loading} className="grid grid-cols-1 gap-s4 rounded-sm bg-surface-alt p-s4 sm:grid-cols-3">
        {modes.map((d, i) => {
          const on = value === d;
          const n = kept(d);
          return (
            <button key={d} ref={(el) => { refs.current[d] = el; }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
              data-testid={`detector-${d}`} onClick={() => onChange(d)} onKeyDown={(e) => move(e, i)}
              className={`press flex min-h-[48px] flex-col items-center justify-center rounded-xs px-s8 py-s4 text-center text-small leading-tight ${on ? "bg-accent text-on-accent" : "text-secondary hover:bg-surface-hover hover:text-fg"}`}>
              <span>{DETECTOR_LABEL[d]}</span>
              {n != null && <span className={`text-tiny font-normal ${on ? "text-on-accent" : "text-secondary"}`}>{fmt(n)} real</span>}
            </button>
          );
        })}
      </div>
      <p data-testid="detector-note" className="mt-s8 text-tiny text-secondary">
        {DETECTOR_NOTE[value]}
        {loading && <span role="status" className="ml-1 text-muted"> Loading {DETECTOR_LABEL[loading]} results…</span>}
      </p>
      {error && (
        <div className="mt-s8">
          <InlineAlert variant="error" message={`Could not load these results (${error}).`} />
          {onRetry && <Button variant="secondary" className="mt-s8" onClick={onRetry}>Try again</Button>}
        </div>
      )}
    </section>
  );
}
