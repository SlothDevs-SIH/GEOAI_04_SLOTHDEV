import { useId } from "react";

/** R-27: labelled range input with a 48 px hit area, a live value readout and a keyboard-operable native slider. */
export default function SliderField({ name, label, value, min, max, step, onChange, format = String }: {
  name: string; label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div className="block">
      <label htmlFor={id} className="flex items-baseline justify-between gap-s8 text-small text-secondary">
        <span>{label}</span>
        <b data-testid={`slider-${name}-value`} className="tabular-nums text-fg">{format(value)}</b>
      </label>
      <input id={id} type="range" data-testid={`slider-${name}`} min={min} max={max} step={step} value={value}
        aria-valuetext={format(value)} onChange={(e) => onChange(Number(e.target.value))}
        className="block h-12 w-full cursor-pointer accent-accent" />
    </div>
  );
}
