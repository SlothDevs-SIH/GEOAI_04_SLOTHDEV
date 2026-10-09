import { beforeEach, describe, expect, it } from "vitest";
import { isModified, useFilters } from "./filters";

describe("filters store", () => {
  beforeEach(() => useFilters.getState().resetAll());

  it("starts with the A6 defaults", () => {
    const s = useFilters.getState();
    expect(s.tiers).toEqual(["critical", "high", "medium", "low"]);
    expect(s.types).toBeNull();
    expect([s.minAreaM2, s.minConfidence, s.tab, s.filterOn, s.selectedId, s.swipePct, s.showLabels, s.showPolygons])
      .toEqual([0, 0, "all", true, null, 50, false, true]);
  });

  it("changes state through the setters", () => {
    const s = useFilters.getState();
    s.setTiers(["critical"]);
    s.setTypes(["water_gain"]);
    s.setMinAreaM2(1500);
    s.setMinConfidence(0.6);
    s.setTab("review");
    s.setFilterOn(false);
    s.setSelectedId(9);
    s.setShowLabels(true);
    s.setShowPolygons(false);
    expect(useFilters.getState()).toMatchObject({
      tiers: ["critical"], types: ["water_gain"], minAreaM2: 1500, minConfidence: 0.6, tab: "review",
      filterOn: false, selectedId: 9, showLabels: true, showPolygons: false,
    });
  });

  it("clamps the swipe position to 0..100 and ignores NaN", () => {
    const { setSwipePct } = useFilters.getState();
    setSwipePct(140);
    expect(useFilters.getState().swipePct).toBe(100);
    setSwipePct(-5);
    expect(useFilters.getState().swipePct).toBe(0);
    setSwipePct(Number.NaN);
    expect(useFilters.getState().swipePct).toBe(50);
  });

  it("resetFilters clears the filter bar and tab but keeps the selection and view", () => {
    const s = useFilters.getState();
    s.setTiers(["low"]);
    s.setMinAreaM2(900);
    s.setTab("dismissed");
    s.setSelectedId(4);
    s.setFilterOn(false);
    expect(isModified(useFilters.getState())).toBe(true);
    useFilters.getState().resetFilters();
    const r = useFilters.getState();
    expect(r.tiers).toEqual(["critical", "high", "medium", "low"]);
    expect([r.minAreaM2, r.tab]).toEqual([0, "all"]);
    expect([r.selectedId, r.filterOn]).toEqual([4, false]);
    expect(isModified(r)).toBe(false);
  });

  it("resetAll also clears the view", () => {
    const s = useFilters.getState();
    s.setSelectedId(4);
    s.setFilterOn(false);
    s.setSwipePct(20);
    s.setShowPolygons(false);
    useFilters.getState().resetAll();
    expect(useFilters.getState()).toMatchObject({ selectedId: null, filterOn: true, swipePct: 50, showPolygons: true });
  });
});
