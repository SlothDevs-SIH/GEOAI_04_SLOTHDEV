import { describe, expect, it, vi } from "vitest";
import { MAP_STYLE, POLYGON, tierColor } from "../../lib/tiers";

vi.mock("maplibre-gl", () => ({ setWorkerUrl: vi.fn() }));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({ default: "worker.js" }));

const { styleFor, tierColorExpr } = await import("./CompareMap");

const scene = {
  base: "./demos/x",
  meta: { corners: [[0, 1], [1, 1], [1, 0], [0, 0]], labels: "labels.webp" },
  filtered: { type: "FeatureCollection", features: [] },
} as never;

const layer = (mode: "dark" | "light", id: string) => styleFor(scene, "after", mode).layers.find((l) => l.id === id) as { paint: Record<string, unknown>; filter?: unknown };

describe("styleFor", () => {
  it("before map has only basemap + image", () => {
    const s = styleFor(scene, "before");
    expect(s.layers.map((l) => l.id)).toEqual(["bg", "osm", "img"]);
    expect((s.sources.img as { url: string }).url).toBe("./demos/x/before.webp");
  });
  it("after map carries labels, raw and tiered change layers in the initial style", () => {
    const ids = styleFor(scene, "after").layers.map((l) => l.id);
    expect(ids).toEqual(["bg", "osm", "img", "labels", "raw-fill", "raw-line", "changes-fill", "changes-line", "changes-sel"]);
  });
  it("uses the A1 polygon symbology", () => {
    expect(layer("dark", "changes-fill").paint["fill-opacity"]).toBe(POLYGON.fillOpacity);
    expect(layer("dark", "changes-line").paint["line-width"]).toBe(1.6);
    expect(layer("dark", "changes-sel").paint["line-width"]).toBe(3.5);
    expect(layer("dark", "raw-fill").paint["fill-opacity"]).toBe(0.18);
    expect(layer("dark", "raw-line").paint["line-opacity"]).toBe(0.55);
    expect(layer("dark", "raw-fill").paint["fill-color"]).toBe(MAP_STYLE.dark.raw);
  });
  it("selected outline is the focus yellow of the theme and the tiers come from the theme palette", () => {
    expect(layer("dark", "changes-sel").paint["line-color"]).toBe("#FDE047");
    expect(layer("light", "changes-sel").paint["line-color"]).toBe("#CA8A04");
    expect(layer("light", "changes-fill").paint["fill-color"]).toEqual(tierColorExpr("light"));
    expect(tierColorExpr("dark")).toEqual(["match", ["get", "tier"], "critical", "#F43F5E", "high", "#F97316", "medium", "#FACC15", tierColor("low", "dark")]);
    expect(tierColorExpr("dark").at(-1)).toBe("#38BDF8"); // Low is blue, never green
  });
  it("dims the OSM basemap in the dark theme only", () => {
    expect(layer("dark", "osm").paint["raster-brightness-max"]).toBeLessThan(1);
    expect(layer("light", "osm").paint["raster-brightness-max"]).toBe(1);
  });
});
