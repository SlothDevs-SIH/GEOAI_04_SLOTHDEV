import type { Tier } from "./types";

export const TIERS: Tier[] = ["critical", "high", "medium", "low"];

/** Exact hexes from the style guide (FRONTEND.md A1). Blue, never green, is Low: green means done / healthy. */
export const TIER_COLORS = {
  dark: { critical: "#F43F5E", high: "#F97316", medium: "#FACC15", low: "#38BDF8" },
  light: { critical: "#E11D48", high: "#EA580C", medium: "#CA8A04", low: "#0284C7" },
} as const;
export const TIER_SOFT = {
  dark: { critical: "#4C1524", high: "#4A2108", medium: "#3B3106", low: "#082F49" },
  light: { critical: "#FFE4E6", high: "#FFEDD5", medium: "#FEF9C3", low: "#E0F2FE" },
} as const;
export const TYPE_COLORS = {
  dark: { built_up_gain: "#A78BFA", water_gain: "#06B6D4", water_loss: "#2563EB", vegetation_loss: "#D6A514", vegetation_gain: "#22C55E", other: "#94A3B8" },
  light: { built_up_gain: "#7C3AED", water_gain: "#0891B2", water_loss: "#1D4ED8", vegetation_loss: "#A16207", vegetation_gain: "#16A34A", other: "#64748B" },
} as const;
/** Map selection and raw-candidate symbology (never confusable with a tier colour). */
export const MAP_STYLE = {
  dark: { selected: "#FDE047", raw: "#94A3B8", rawLine: "#CBD5E1" },
  light: { selected: "#CA8A04", raw: "#94A3B8", rawLine: "#94A3B8" },
} as const;
export const POLYGON = { fillOpacity: 0.38, lineWidth: 1.6, selectedLineWidth: 3.5, rawFillOpacity: 0.18, rawLineOpacity: 0.55 } as const;

/** Shape that accompanies every severity colour, so colour is never the only signal (A8). */
/** @deprecated compatibility alias (dark theme hexes) for map code that has not moved to tierColor(t, mode) yet. */
export const TIER_COLOR = TIER_COLORS.dark;

export const TIER_SHAPE: Record<Tier, "octagon" | "diamond" | "square" | "circle"> = {
  critical: "octagon", high: "diamond", medium: "square", low: "circle",
};

export const TIER_LABEL: Record<Tier, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

export const TYPE_LABEL: Record<string, string> = {
  water_gain: "New water / flooding",
  water_loss: "Water receded",
  built_up_gain: "New construction",
  vegetation_loss: "Vegetation cleared",
  vegetation_gain: "Vegetation growth",
  other: "Other change",
};

type Mode = "dark" | "light";
export const tierColor = (t: string, mode: Mode = "dark") => TIER_COLORS[mode][t as Tier] ?? TYPE_COLORS[mode].other;
export const tierSoft = (t: string, mode: Mode = "dark") => TIER_SOFT[mode][t as Tier] ?? TIER_SOFT[mode].low;
export const typeColor = (t: string, mode: Mode = "dark") => (TYPE_COLORS[mode] as Record<string, string>)[t] ?? TYPE_COLORS[mode].other;
export const tierLabel = (t: string) => TIER_LABEL[t as Tier] ?? t;
export const typeLabel = (t: string) => TYPE_LABEL[t] ?? t.replace(/_/g, " ");

/** Rule names in summary.dropped, in plain words. */
export const DROP_LABEL: Record<string, string> = {
  cloud: "under cloud or shadow",
  seasonal: "seasonal / lighting change",
  not_in_preset: "change type not relevant here",
  speckle: "speckle (thinner than 3 px)",
  min_area: "smaller than the minimum area",
  permanent_water: "permanent water (rivers, lakes)",
  speckle_morphology: "radar speckle",
  below_min_area: "smaller than the minimum area",
};
