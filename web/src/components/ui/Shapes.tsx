import type { Tier } from "../../lib/types";
import { TIER_SHAPE, tierLabel } from "../../lib/tiers";

const PATH: Record<string, string> = {
  octagon: "M5 1h6l4 4v6l-4 4H5l-4-4V5z",
  diamond: "M8 0.5L15.5 8L8 15.5L0.5 8z",
  square: "M2 2h12v12H2z",
  circle: "M8 1a7 7 0 1 0 0.01 0z",
};

/** Severity glyph: octagon (critical), diamond (high), square (medium), circle (low). Colour is never the only signal. */
export function TierIcon({ tier, size = 14 }: { tier: string; size?: number }) {
  const shape = TIER_SHAPE[tier as Tier] ?? "circle";
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0" style={{ color: `var(--c-tier-${tier})` }}>
      <path d={PATH[shape]} fill="currentColor" />
    </svg>
  );
}

const TIER_CLASS: Record<string, string> = {
  critical: "bg-tier-critical-soft text-tier-critical-text border-tier-critical/60", // lighter / darker text than the shape colour: 4.5:1 on the soft background
  high: "bg-tier-high-soft text-tier-high border-tier-high/60",
  medium: "bg-tier-medium-soft text-tier-medium border-tier-medium/60",
  low: "bg-tier-low-soft text-tier-low border-tier-low/60",
};

/** R-24: soft-filled badge with the glyph and the word. */
export function TierChip({ tier }: { tier: string }) {
  return (
    <span data-testid="tier-chip" data-tier={tier}
      className={`inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-micro uppercase ${TIER_CLASS[tier] ?? TIER_CLASS.low}`}>
      <TierIcon tier={tier} size={11} />
      {tierLabel(tier)}
    </span>
  );
}
