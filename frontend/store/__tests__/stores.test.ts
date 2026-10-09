import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFilters, resetView } from "../filters";
import { REVIEW_KEY, useReview } from "../review";


describe("review store", () => {
  it("defaults to pending, persists decisions and cycles pending -> confirmed -> pending", async () => {
    const r = useReview.getState();
    expect(r.status("s", 1)).toBe("pending");
    r.set("s", 1, "confirmed");
    expect(useReview.getState().status("s", 1)).toBe("confirmed");
    expect(JSON.parse((AsyncStorage.setItem as jest.Mock).mock.calls.at(-1)[1])).toEqual({ s: { 1: "confirmed" } });
    expect((AsyncStorage.setItem as jest.Mock).mock.calls.at(-1)[0]).toBe(REVIEW_KEY);
    useReview.getState().set("s", 1, "pending");
    expect(useReview.getState().status("s", 1)).toBe("pending");
  });
  it("hydrates from storage without losing decisions made first", async () => {
    useReview.getState().set("b", 3, "confirmed");
    await AsyncStorage.setItem(REVIEW_KEY, JSON.stringify({ a: { 2: "dismissed" } })); // as if an older session had saved it
    await useReview.getState().hydrate();
    expect(useReview.getState().status("a", 2)).toBe("dismissed");
    expect(useReview.getState().status("b", 3)).toBe("confirmed");
  });
  it("reset clears one scene", () => {
    useReview.getState().reset("b");
    expect(useReview.getState().status("b", 3)).toBe("pending");
  });
});

describe("filter store", () => {
  it("has the spec defaults, clamps the divider and resets", () => {
    resetView();
    const s = useFilters.getState();
    expect([s.filterOn, s.swipePct, s.selectedId, s.showPolygons, s.showLabels, s.tab]).toEqual([true, 50, null, true, false, "all"]);
    s.setSwipePct(140);
    expect(useFilters.getState().swipePct).toBe(100);
    s.setMinAreaM2(900); s.setTiers(["critical"]);
    s.resetFilters();
    expect(useFilters.getState().minAreaM2).toBe(0);
    expect(useFilters.getState().tiers).toHaveLength(4);
    expect(useFilters.getState().swipePct).toBe(100); // the view is untouched by resetFilters
  });
});
