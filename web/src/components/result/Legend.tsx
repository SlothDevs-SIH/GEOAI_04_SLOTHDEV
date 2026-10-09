import { TIERS, tierLabel } from "../../lib/tiers";
import { TierIcon } from "../ui/Shapes";

/** R-04: tier glyph + word for each severity, the grey raw-candidate swatch, and (radar) the expert-label swatch. */
export default function Legend({ radar = false }: { radar?: boolean }) {
  return (
    <ul data-testid="legend" aria-label="Map legend" className="flex flex-wrap items-center gap-x-s12 gap-y-s4 text-micro text-secondary">
      {TIERS.map((t) => (
        <li key={t} className="flex items-center gap-1">
          <TierIcon tier={t} size={12} />
          {tierLabel(t)}
        </li>
      ))}
      <li className="flex items-center gap-1">
        <i aria-hidden="true" className="inline-block h-3 w-3 rounded-xs border border-raw/60 bg-raw/20" />
        Raw candidates (filter off)
      </li>
      {radar && (
        <li className="flex items-center gap-1">
          <i aria-hidden="true" className="inline-block h-3 w-3 rounded-xs border border-success bg-success/30" />
          Expert labels
        </li>
      )}
    </ul>
  );
}
