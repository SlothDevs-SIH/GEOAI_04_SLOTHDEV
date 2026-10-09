import { useId } from "react";
import type { ApiHealth, DetectorMode } from "../../lib/api";
import { MODES, modeAvailability } from "./modes";

interface Props {
  value: DetectorMode;
  onChange: (m: DetectorMode) => void;
  /** Parsed /health; undefined while offline. */
  health?: ApiHealth;
  /** Offline preview: every option can be looked at and chosen, nothing can be run. */
  preview?: boolean;
}

/** Detector radio group (segmented): the technology behind the result, with an honest note per mode. */
export default function DetectorSelect({ value, onChange, health, preview = false }: Props) {
  const uid = useId();
  const current = MODES.find((m) => m.id === value) ?? MODES[0];
  const currentAvail = modeAvailability(health, current.id);
  return (
    <fieldset data-testid="detector" className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-s4 p-0 text-small text-fg">Detector</legend>
      <div role="radiogroup" aria-label="Detector" className="grid gap-s8 sm:grid-cols-3">
        {MODES.map((m) => {
          const a = modeAvailability(health, m.id);
          const disabled = !preview && !a.available;
          const selected = value === m.id;
          return (
            <button key={m.id} type="button" role="radio" aria-checked={selected} disabled={disabled}
              data-testid={`mode-${m.id}`} aria-describedby={disabled ? `${uid}-why-${m.id}` : undefined}
              onClick={() => onChange(m.id)}
              className={`press flex min-h-[48px] min-w-0 flex-col items-start justify-center overflow-hidden rounded-sm border px-s12 py-s8 text-left disabled:cursor-not-allowed disabled:opacity-60 ${
                selected ? "border-accent bg-accent-soft text-fg" : "border-line-strong bg-surface-alt text-secondary hover:bg-surface-hover"
              }`}>
              <span className="flex min-w-0 max-w-full items-start gap-s8 text-small">
                <span aria-hidden="true" className={`mt-[2px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-accent" : "border-line-strong"}`}>
                  {selected && <span className="h-2 w-2 rounded-full bg-accent" />}
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{m.label}</span>
              </span>
              <span className="min-w-0 pl-6 text-micro text-muted [overflow-wrap:anywhere]">{m.short}</span>
            </button>
          );
        })}
      </div>
      {MODES.map((m) => {
        const a = modeAvailability(health, m.id);
        return !preview && !a.available ? (
          <p key={m.id} id={`${uid}-why-${m.id}`} data-testid={`mode-why-${m.id}`} className="mt-s8 text-tiny text-secondary">
            <b aria-hidden="true">! </b><span className="font-semibold">{m.label}:</span> {a.reason}
          </p>
        ) : null;
      })}
      <p data-testid="mode-note" aria-live="polite" className="mt-s8 text-tiny text-secondary">
        {current.note}
        {currentAvail.available && currentAvail.backend && current.id !== "spectral" && <> Runs on {currentAvail.backend}.</>}
      </p>
    </fieldset>
  );
}
