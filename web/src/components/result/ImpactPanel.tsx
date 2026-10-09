import { useCountUp } from "../../hooks/motion";
import { ha, num } from "../../lib/format";
import { TIERS, tierLabel } from "../../lib/tiers";
import type { Summary, Tier } from "../../lib/types";
import { CardSection } from "../ui/Primitives";
import { TierIcon } from "../ui/Shapes";

/** R-21: one headline number. Counts up from 0 on first show (A-05); `null` is shown as "unknown", never as zero. */
export function StatTile({ id, label, value, format, sublabel, delay = 0 }: {
  id: string; label: string; value: number | null | undefined; format: (n: number) => string; sublabel?: string; delay?: number;
}) {
  const v = useCountUp(value ?? 0, 700, delay);
  return (
    <div data-testid={`stat-${id}`} className="rounded-sm bg-surface-alt p-s12">
      <div className={`text-h2 tabular-nums sm:text-metric ${value == null ? "text-secondary" : "text-fg"}`}>{value == null ? "unknown" : format(v)}</div>
      <div className="text-tiny text-secondary">{label}</div>
      {sublabel && <div className="text-tiny text-fg">({sublabel})</div>}
    </div>
  );
}

const BAR: Record<Tier, string> = { critical: "bg-tier-critical", high: "bg-tier-high", medium: "bg-tier-medium", low: "bg-tier-low" };

/** R-20: area changed, cropland, built-up and buildings (tiles staggered 80 ms), then the tier distribution. */
export default function ImpactPanel({ summary }: { summary: Summary }) {
  const i = summary.impact;
  const tiles: { id: string; label: string; value: number | null | undefined; format: (n: number) => string; sublabel?: string }[] = [
    { id: "changed", label: "Area changed", value: i.changed_ha, format: (n) => ha(n) },
    { id: "cropland", label: "Cropland affected", value: i.cropland_ha, format: (n) => ha(n), sublabel: i.cropland_reliability === "upper_bound" ? "upper bound" : undefined },
    { id: "builtup", label: "Built-up land affected", value: i.built_up_ha, format: (n) => ha(n) },
    { id: "buildings", label: "Buildings touched", value: i.buildings, format: (n) => num(n) },
  ];
  const max = Math.max(1, ...TIERS.map((t) => summary.by_tier[t] ?? 0));
  const total = TIERS.reduce((a, t) => a + (summary.by_tier[t] ?? 0), 0);
  return (
    <CardSection title="Impact" testid="impact">
      <div className="grid grid-cols-2 gap-s8">
        {tiles.map((t, n) => <StatTile key={t.id} {...t} delay={n * 80} />)}
      </div>
      {total > 0 && (
        <ul data-testid="tier-bars" aria-label="Changes by severity" className="mt-s12 space-y-s8">
          {TIERS.map((t) => {
            const n = summary.by_tier[t] ?? 0;
            return (
              <li key={t} className="flex items-center gap-s8 text-tiny text-secondary">
                <span className="flex w-20 items-center gap-1"><TierIcon tier={t} size={12} />{tierLabel(t)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-xs bg-surface-alt" aria-hidden="true">
                  <span className={`block h-full rounded-xs ${BAR[t]}`} style={{ width: `${(n / max) * 100}%` }} />
                </span>
                <span className="w-10 text-right tabular-nums text-fg">{num(n)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {(i.sources.length > 0 || i.notes.length > 0) && (
        <ul className="mt-s12 list-disc space-y-s4 pl-4 text-tiny text-muted">
          {i.sources.map((x) => <li key={x}>Source: {x}</li>)}
          {i.notes.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
    </CardSection>
  );
}
