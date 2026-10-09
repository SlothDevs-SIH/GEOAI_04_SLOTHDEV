import { describe, expect, it } from "vitest";
import { MAP_STYLE, POLYGON, TIER_SHAPE, TIERS, tierColor, tierLabel, tierSoft, typeColor, typeLabel } from "./tiers";

describe("style-guide colour mapping (FRONTEND.md A1)", () => {
  it("uses the exact Midnight Terrain tier hexes, with blue (not green) for Low", () => {
    expect(TIERS.map((t) => tierColor(t, "dark"))).toEqual(["#F43F5E", "#F97316", "#FACC15", "#38BDF8"]);
    expect(tierColor("low", "dark")).not.toMatch(/^#(22C55E|16A34A)$/i);
  });
  it("uses the exact Daylight GIS tier hexes", () => {
    expect(TIERS.map((t) => tierColor(t, "light"))).toEqual(["#E11D48", "#EA580C", "#CA8A04", "#0284C7"]);
  });
  it("has a soft badge fill for every tier in both themes", () => {
    expect(tierSoft("critical", "dark")).toBe("#4C1524");
    expect(tierSoft("low", "light")).toBe("#E0F2FE");
  });
  it("gives each tier its own shape so colour is never the only signal", () => {
    expect(TIERS.map((t) => TIER_SHAPE[t])).toEqual(["octagon", "diamond", "square", "circle"]);
  });
  it("maps change types and falls back to the neutral colour", () => {
    expect(typeColor("built_up_gain", "dark")).toBe("#A78BFA");
    expect(typeColor("water_loss", "light")).toBe("#1D4ED8");
    expect(typeColor("something_new", "dark")).toBe("#94A3B8");
  });
  it("keeps raw detections neutral grey and the selection outline in the focus yellow", () => {
    expect(MAP_STYLE.dark.raw).toBe("#94A3B8");
    expect(MAP_STYLE.dark.selected).toBe("#FDE047");
    expect(MAP_STYLE.light.selected).toBe("#CA8A04");
    expect(POLYGON).toMatchObject({ fillOpacity: 0.38, lineWidth: 1.6, selectedLineWidth: 3.5 });
  });
  it("labels", () => {
    expect(tierLabel("critical")).toBe("Critical");
    expect(typeLabel("vegetation_loss")).toBe("Vegetation cleared");
    expect(typeLabel("some_new_type")).toBe("some new type");
  });
});
