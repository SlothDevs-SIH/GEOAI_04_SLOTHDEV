import type { ChangeProps, ReviewStatus, Tier } from "./types";

export interface FilterState {
  tiers: Tier[];
  types: string[] | null; // null = all types
  minAreaM2: number;
  minConfidence: number;
  tab: "all" | "review" | "confirmed" | "dismissed";
}

export const DEFAULT_FILTERS: FilterState = {
  tiers: ["critical", "high", "medium", "low"],
  types: null,
  minAreaM2: 0,
  minConfidence: 0,
  tab: "all",
};

export function passes(p: ChangeProps, f: FilterState, status: ReviewStatus = "pending"): boolean {
  if (!f.tiers.includes(p.tier)) return false;
  if (f.types && !f.types.includes(p.change_type)) return false;
  if (p.area_m2 < f.minAreaM2) return false;
  if (p.confidence < f.minConfidence) return false;
  if (f.tab === "review" && !(p.needs_review && status === "pending")) return false;
  if (f.tab === "confirmed" && status !== "confirmed") return false;
  if (f.tab === "dismissed" && status !== "dismissed") return false;
  return true;
}

export const TAB_KEYS: FilterState["tab"][] = ["all", "review", "confirmed", "dismissed"];

/** How many changes each review tab would list under the current criteria (the tab itself is ignored). */
export function tabCounts(items: ChangeProps[], f: FilterState, status: (id: number) => ReviewStatus): Record<FilterState["tab"], number> {
  const out = { all: 0, review: 0, confirmed: 0, dismissed: 0 };
  for (const p of items) for (const tab of TAB_KEYS) if (passes(p, { ...f, tab }, status(p.id))) out[tab]++;
  return out;
}

/** MapLibre filter expression equivalent of `passes` (without the review tab, which is local state). */
export function mapFilter(f: FilterState, hiddenIds: number[] = []): unknown[] {
  const e: unknown[] = [
    "all",
    ["in", ["get", "tier"], ["literal", f.tiers]],
    [">=", ["get", "area_m2"], f.minAreaM2],
    [">=", ["get", "confidence"], f.minConfidence],
  ];
  if (f.types) e.push(["in", ["get", "change_type"], ["literal", f.types]]);
  if (hiddenIds.length) e.push(["!", ["in", ["get", "id"], ["literal", hiddenIds]]]);
  return e;
}

/** Counter text for the raw/filtered toggle. */
export function counterText(raw: number, kept: number, filterOn: boolean): string {
  const r = raw.toLocaleString("en-IN");
  return filterOn ? `${r} raw detections → ${kept.toLocaleString("en-IN")} real changes` : `Filter off: ${r} raw detections`;
}
