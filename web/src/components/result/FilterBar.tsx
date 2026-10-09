import type { FilterState } from "../../lib/filters";
import { area, pct } from "../../lib/format";
import { TIERS, tierLabel, typeLabel } from "../../lib/tiers";
import type { Tier } from "../../lib/types";
import { Button, CardSection } from "../ui/Primitives";
import { TierIcon } from "../ui/Shapes";
import SliderField from "./SliderField";

/** A round upper bound for the minimum-area slider, from the biggest change in this result. */
export function areaSliderMax(maxAreaM2: number): { max: number; step: number } {
  const step = maxAreaM2 > 20000 ? 500 : maxAreaM2 > 4000 ? 100 : 50;
  return { max: Math.max(step * 10, Math.ceil(maxAreaM2 / step) * step), step };
}

/** R-26: tier chips, change-type select and the minimum area / confidence sliders. */
export default function FilterBar({ filters, types, maxAreaM2, modified, onChange, onReset, embedded = false }: {
  filters: FilterState; types: string[]; maxAreaM2: number; modified: boolean;
  onChange: (patch: Partial<FilterState>) => void; onReset: () => void;
  /** Render without the card frame, to sit inside another card. */
  embedded?: boolean;
}) {
  const toggleTier = (t: Tier) => onChange({ tiers: filters.tiers.includes(t) ? filters.tiers.filter((x) => x !== t) : [...filters.tiers, t] });
  const { max, step } = areaSliderMax(maxAreaM2);
  const body = (
    <>
      <div role="group" aria-label="Severity" className="grid grid-cols-2 gap-s8 sm:grid-cols-4 lg:grid-cols-2">
        {TIERS.map((t) => {
          const on = filters.tiers.includes(t);
          return (
            <button key={t} type="button" aria-pressed={on} data-testid={`tier-filter-${t}`} onClick={() => toggleTier(t)}
              className={`press tap gap-1 rounded-sm border px-s8 text-small ${on ? "border-line-strong bg-surface-hover text-fg" : "border-line text-muted line-through"}`}>
              <TierIcon tier={t} size={12} />
              {tierLabel(t)}
            </button>
          );
        })}
      </div>
      {types.length > 1 && (
        <select aria-label="Change type" data-testid="type-filter" value={filters.types?.[0] ?? ""}
          onChange={(e) => onChange({ types: e.target.value ? [e.target.value] : null })}
          className="tap mt-s8 w-full rounded-sm border border-line-strong bg-surface-alt px-s8 text-body text-fg">
          <option value="">All change types</option>
          {types.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
        </select>
      )}
      <div className="mt-s8">
        <SliderField name="minarea" label="Minimum area" value={Math.min(filters.minAreaM2, max)} min={0} max={max} step={step}
          format={area} onChange={(v) => onChange({ minAreaM2: v })} />
        <SliderField name="minconf" label="Minimum confidence" value={filters.minConfidence} min={0} max={0.95} step={0.05}
          format={pct} onChange={(v) => onChange({ minConfidence: v })} />
      </div>
      <Button variant="ghost" data-testid="filter-reset" disabled={!modified} onClick={onReset} className="mt-s4 w-full">Reset filters</Button>
    </>
  );
  return embedded
    ? <div data-testid="filter-bar" className="mt-s12">{body}</div>
    : <CardSection title="Filters" testid="filter-bar">{body}</CardSection>;
}
