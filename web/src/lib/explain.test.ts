import { describe, expect, it } from "vitest";
import { evidenceOf, pitches, rankMarkers, tierAdvice, typeMeaning } from "./explain";
import type { ChangeProps } from "./types";

const p = (id: number, tier: ChangeProps["tier"] = "high"): ChangeProps => ({
  id, tier, change_type: "built_up_gain", area_m2: 1000, area_ha: 0.1, magnitude: 0.5, confidence: 0.9, needs_review: false,
  centroid_lat: 18 + id / 1000, centroid_lon: 73 + id / 1000, reason: "x", score: 1000 - id, review_status: "pending",
});

describe("explain", () => {
  it("numbers the ten highest-priority visible changes by rank, whatever order they arrive in", () => {
    const visible = [15, 3, 22, 1, 40, 2, 9, 5, 7, 4, 6, 8, 30].map((i) => p(i));
    const m = rankMarkers(visible);
    expect(m.map((x) => x.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 15]);
    expect(m).toHaveLength(10);
    expect(m[0]).toMatchObject({ id: 1, lon: 73.001, lat: 18.001, tier: "high" });
  });
  it("skips hidden changes: filters change which ten are numbered, not their ranks", () => {
    expect(rankMarkers([p(2), p(5), p(9)], 2).map((x) => x.id)).toEqual([2, 5]);
    expect(rankMarkers([])).toEqual([]);
  });
  it("describes size in football pitches only when that helps", () => {
    expect(pitches(94600)).toBe("about 13 football pitches");
    expect(pitches(900)).toBeNull();
  });
  it("gives a meaning for every change type and advice for every tier", () => {
    for (const t of ["built_up_gain", "vegetation_loss", "vegetation_gain", "water_gain", "water_loss", "other"]) expect(typeMeaning(t).length).toBeGreaterThan(10);
    for (const t of ["critical", "high", "medium", "low"]) expect(tierAdvice(t)).toMatch(/^(Check|Small)/);
    expect(typeMeaning("nonsense")).toBe("");
  });
  it("splits the evidence from the type in the engine's reason text", () => {
    expect(evidenceOf("new construction / built-up: built-up index rose (+0.16)")).toBe("built-up index rose (+0.16)");
    expect(evidenceOf("no colon here")).toBe("no colon here");
  });
});
