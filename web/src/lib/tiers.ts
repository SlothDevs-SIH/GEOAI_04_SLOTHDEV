import type { Tier } from "./types";

export const TIERS: Tier[] = ["critical", "high", "medium", "low"];

export const TIER_COLOR: Record<Tier, string> = {
  critical: "#b5179e",
  high: "#e03131",
  medium: "#f08a24",
  low: "#c99700",
};

export const TIER_LABEL: Record<Tier, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const TYPE_LABEL: Record<string, string> = {
  water_gain: "New water / flooding",
  water_loss: "Water receded",
  built_up_gain: "New construction",
  vegetation_loss: "Vegetation cleared",
  vegetation_gain: "Vegetation growth",
  other: "Other change",
};

export const tierColor = (t: string) => TIER_COLOR[t as Tier] ?? "#666";
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
