import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, counterText, mapFilter, passes } from "./filters";
import { area, ha, num, pct } from "./format";
import { tierColor, typeLabel } from "./tiers";
import type { ChangeProps } from "./types";

const p = (o: Partial<ChangeProps> = {}): ChangeProps => ({
  id: 1, tier: "high", change_type: "built_up_gain", area_m2: 8000, area_ha: 0.8, magnitude: 0.5,
  confidence: 0.9, needs_review: false, centroid_lat: 19, centroid_lon: 73, reason: "", score: 1, review_status: "pending", ...o,
});

describe("filters", () => {
  it("keeps everything with the defaults", () => {
    expect(passes(p(), DEFAULT_FILTERS)).toBe(true);
  });
  it("drops by tier, type, area and confidence", () => {
    expect(passes(p(), { ...DEFAULT_FILTERS, tiers: ["critical"] })).toBe(false);
    expect(passes(p(), { ...DEFAULT_FILTERS, types: ["water_gain"] })).toBe(false);
    expect(passes(p(), { ...DEFAULT_FILTERS, minAreaM2: 9000 })).toBe(false);
    expect(passes(p(), { ...DEFAULT_FILTERS, minConfidence: 0.95 })).toBe(false);
  });
  it("review tabs follow the local decision", () => {
    const review = { ...DEFAULT_FILTERS, tab: "review" as const };
    expect(passes(p({ needs_review: true }), review)).toBe(true);
    expect(passes(p({ needs_review: true }), review, "confirmed")).toBe(false);
    expect(passes(p(), { ...DEFAULT_FILTERS, tab: "confirmed" }, "confirmed")).toBe(true);
    expect(passes(p(), { ...DEFAULT_FILTERS, tab: "dismissed" }, "confirmed")).toBe(false);
  });
  it("builds a MapLibre expression that hides ids", () => {
    const e = mapFilter({ ...DEFAULT_FILTERS, types: ["water_gain"] }, [3, 4]);
    expect(e[0]).toBe("all");
    expect(JSON.stringify(e)).toContain('["literal",["water_gain"]]');
    expect(JSON.stringify(e)).toContain('["!",["in",["get","id"],["literal",[3,4]]]]');
    expect(mapFilter(DEFAULT_FILTERS)).toHaveLength(4);
  });
  it("counter text says what the toggle does", () => {
    expect(counterText(2185, 265, true)).toBe("2,185 raw detections → 265 real changes");
    expect(counterText(2185, 265, false)).toBe("Filter off: 2,185 raw detections");
  });
});

describe("format", () => {
  it("areas switch from m² to ha", () => {
    expect(area(900)).toBe("900 m²");
    expect(area(25000)).toBe("2.50 ha");
    expect(area(216000)).toBe("21.6 ha");
    expect(area(2_507_000)).toBe("251 ha");
  });
  it("unknown is not zero", () => {
    expect(ha(null)).toBe("unknown");
    expect(ha(0)).toBe("0 ha");
    expect(num(undefined)).toBe("–");
    expect(num(123456)).toBe("1,23,456");
    expect(pct(0.904)).toBe("90%");
  });
  it("labels and colours fall back safely", () => {
    expect(typeLabel("built_up_gain")).toBe("New construction");
    expect(typeLabel("some_new_type")).toBe("some new type");
    expect(tierColor("nope")).toBe("#94A3B8");
  });
});
