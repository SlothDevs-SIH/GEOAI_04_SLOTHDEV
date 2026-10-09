import { create } from "zustand";
import { DEFAULT_FILTERS, type FilterState } from "../lib/filters";
import type { Tier } from "../lib/types";

/** Result-screen view state (A6 section 2). `sel`, `filter` and `swipe` are mirrored to the URL by the Result page. */
export interface FiltersState extends FilterState {
  filterOn: boolean; // false-alarm filter; off shows the raw candidates
  selectedId: number | null;
  swipePct: number; // 0..100, position of the before/after divider
  showLabels: boolean; // expert labels overlay (radar scenes only)
  showPolygons: boolean;
  setTiers: (t: Tier[]) => void;
  setTypes: (t: string[] | null) => void;
  setMinAreaM2: (v: number) => void;
  setMinConfidence: (v: number) => void;
  setTab: (t: FilterState["tab"]) => void;
  setFilterOn: (v: boolean) => void;
  setSelectedId: (id: number | null) => void;
  setSwipePct: (v: number) => void;
  setShowLabels: (v: boolean) => void;
  setShowPolygons: (v: boolean) => void;
  /** Clears the filter bar and the review tab (what the bar's "Reset" button does). */
  resetFilters: () => void;
  /** Back to a fresh view: also clears the selection, divider position, raw toggle and overlays. Used when the scene changes. */
  resetAll: () => void;
}

const VIEW_DEFAULTS = { filterOn: true, selectedId: null, swipePct: 50, showLabels: false, showPolygons: true };
const clampPct = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50);

export const useFilters = create<FiltersState>((set) => ({
  ...DEFAULT_FILTERS,
  ...VIEW_DEFAULTS,
  setTiers: (tiers) => set({ tiers }),
  setTypes: (types) => set({ types }),
  setMinAreaM2: (minAreaM2) => set({ minAreaM2: Math.max(0, minAreaM2) }),
  setMinConfidence: (minConfidence) => set({ minConfidence: Math.max(0, Math.min(1, minConfidence)) }),
  setTab: (tab) => set({ tab }),
  setFilterOn: (filterOn) => set({ filterOn }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setSwipePct: (v) => set({ swipePct: clampPct(v) }),
  setShowLabels: (showLabels) => set({ showLabels }),
  setShowPolygons: (showPolygons) => set({ showPolygons }),
  resetFilters: () => set({ ...DEFAULT_FILTERS, tiers: [...DEFAULT_FILTERS.tiers] }),
  resetAll: () => set({ ...DEFAULT_FILTERS, tiers: [...DEFAULT_FILTERS.tiers], ...VIEW_DEFAULTS }),
}));

/** True when any filter-bar criterion differs from the default (drives the "Reset" button state). */
export function isModified(f: FilterState): boolean {
  return f.tiers.length !== DEFAULT_FILTERS.tiers.length || f.types !== null || f.minAreaM2 > 0 || f.minConfidence > 0;
}
