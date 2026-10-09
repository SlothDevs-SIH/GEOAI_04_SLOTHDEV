import { create } from "zustand";
import { DEFAULT_FILTERS, type FilterState } from "../lib/filters";
import type { Tier } from "../lib/types";

interface FilterStore extends FilterState {
  filterOn: boolean;
  selectedId: number | null;
  swipePct: number;
  showLabels: boolean;
  showPolygons: boolean;
  setTiers: (t: Tier[]) => void;
  setTypes: (t: string[] | null) => void;
  setMinAreaM2: (v: number) => void;
  setMinConfidence: (v: number) => void;
  setTab: (t: FilterState["tab"]) => void;
  setFilterOn: (v: boolean) => void;
  setSelectedId: (id: number | null) => void;
  setSwipePct: (p: number) => void;
  setShowLabels: (v: boolean) => void;
  setShowPolygons: (v: boolean) => void;
  resetFilters: () => void;
}

const view = { filterOn: true, selectedId: null as number | null, swipePct: 50, showLabels: false, showPolygons: true };
const clampPct = (p: number) => Math.max(0, Math.min(100, Number.isFinite(p) ? p : 50));

export const useFilters = create<FilterStore>((set) => ({
  ...DEFAULT_FILTERS,
  ...view,
  setTiers: (tiers) => set({ tiers }),
  setTypes: (types) => set({ types }),
  setMinAreaM2: (minAreaM2) => set({ minAreaM2 }),
  setMinConfidence: (minConfidence) => set({ minConfidence }),
  setTab: (tab) => set({ tab }),
  setFilterOn: (filterOn) => set({ filterOn }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setSwipePct: (p) => set({ swipePct: clampPct(p) }),
  setShowLabels: (showLabels) => set({ showLabels }),
  setShowPolygons: (showPolygons) => set({ showPolygons }),
  // clears the filter controls only; the view (toggle, divider, selection) is untouched
  resetFilters: () => set({ ...DEFAULT_FILTERS }),
}));

/** Reset everything when a different scene opens. */
export const resetView = () => useFilters.setState({ ...DEFAULT_FILTERS, ...view });
