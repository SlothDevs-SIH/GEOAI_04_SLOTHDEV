import { styleFor, boundsOf } from "../compareStyle";
import { midnight } from "../../../theme/tokens";

const scene = {
  base: "/demos/x",
  meta: { corners: [[0, 1], [1, 1], [1, 0], [0, 0]], labels: "labels.webp" },
  filtered: { type: "FeatureCollection", features: [] },
} as never;

describe("styleFor", () => {
  it("before map has only basemap + image", () => {
    const s = styleFor(scene, "before", midnight);
    expect(s.layers.map((l) => l.id)).toEqual(["bg", "osm", "img"]);
    expect((s.sources.img as { url: string }).url).toBe("/demos/x/before.webp");
  });
  it("after map carries labels, raw and tiered change layers in the initial style", () => {
    const ids = styleFor(scene, "after", midnight).layers.map((l) => l.id);
    expect(ids).toEqual(["bg", "osm", "img", "labels", "raw-fill", "raw-line", "changes-fill", "changes-line", "changes-sel"]);
  });
  it("uses the style-guide severity colours and neutral grey for raw detections", () => {
    const layers = styleFor(scene, "after", midnight).layers as { id: string; paint: Record<string, unknown> }[];
    expect(layers.find((l) => l.id === "raw-fill")!.paint["fill-color"]).toBe("#94A3B8");
    expect(JSON.stringify(layers.find((l) => l.id === "changes-fill")!.paint["fill-color"])).toContain("#F43F5E");
    expect(layers.find((l) => l.id === "changes-sel")!.paint["line-color"]).toBe("#FDE047");
  });
  it("computes bounds from the corners", () => {
    expect(boundsOf(scene)).toEqual([[0, 0], [1, 1]]);
  });
});
