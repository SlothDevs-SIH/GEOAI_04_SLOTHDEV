import { useId } from "react";
import { FIELD, LABEL } from "./styles";

/** A-06c: a native date input (a real picker on phones) with its error written out below it. */
export default function DateField({ label, value, min, max, onChange, error, errorId, testid }: {
  label: string; value: string; min?: string; max?: string; onChange: (v: string) => void;
  /** Text shown under this field; the other field can point at it with `describedBy`. */
  error?: string; errorId?: string; testid: string;
}) {
  const auto = useId();
  const eid = errorId ?? `${auto}-err`;
  return (
    <div>
      <label className={LABEL}>
        {label}
        <input type="date" data-testid={testid} value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined} aria-describedby={error ? eid : undefined} className={`${FIELD} mt-s4`} />
      </label>
      {error && <p id={eid} role="alert" className="mt-s4 flex gap-s8 text-small text-danger"><b aria-hidden="true">✕</b><span>{error}</span></p>}
    </div>
  );
}
