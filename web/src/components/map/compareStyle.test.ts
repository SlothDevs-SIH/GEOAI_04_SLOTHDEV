import { describe, expect, it, vi } from "vitest";

vi.mock("maplibre-gl", () => ({ setWorkerUrl: vi.fn() }));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({ default: "worker.js" }));

const { styleFor } = await import("./CompareMap");

const scene = {
  base: "./demos/x",
  meta: { corners: [[0, 1], [1, 1], [1, 0], [0, 0]], labels: "labels.webp" },
  filtered: { type: "FeatureCollection", features: [] },
} as never;

describe("styleFor", () => {
  it("before map has only basemap + image", () => {
    const s = styleFor(scene, "before");
    expect(s.layers.map((l) => l.id)).toEqual(["bg", "osm", "img"]);
    expect((s.sources.img as { url: string }).url).toBe("./demos/x/before.webp");
  });
  it("after map carries labels, raw and tiered change layers in the initial style", () => {
    const ids = styleFor(scene, "after").layers.map((l) => l.id);
    expect(ids).toEqual(["bg", "osm", "img", "labels", "raw-fill", "changes-fill", "changes-line", "changes-sel"]);
  });
});
