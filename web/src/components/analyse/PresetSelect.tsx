import { useId } from "react";
import { FIELD, LABEL } from "./styles";

export const PRESETS: [string, string][] = [
  ["encroachment", "Encroachment (construction, water loss)"],
  ["flood", "Flood (new water)"],
  ["deforestation", "Deforestation"],
  ["general", "All change types"],
];

/** A-07c */
export default function PresetSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={LABEL}>What to look for</label>
      <select id={id} data-testid="preset" value={value} className={`${FIELD} mt-s4`} onChange={(e) => onChange(e.target.value)}>
        {PRESETS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
    </div>
  );
}
