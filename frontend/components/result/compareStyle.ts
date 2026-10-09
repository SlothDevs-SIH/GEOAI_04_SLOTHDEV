import type { SceneData } from "../../lib/types";
import type { Palette } from "../../theme/tokens";
import { polygon } from "../../theme/tokens";

// Pure style builder (no map library import) so it is unit-testable and shared by web and native.
export type Corners = [[number, number], [number, number], [number, number], [number, number]];
export const corners = (scene: SceneData) => scene.meta.corners as Corners;

export function boundsOf(scene: SceneData): [[number, number], [number, number]] {
  const c = corners(scene);
  const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}

export const tierColorExpr = (c: Palette) => ["match", ["get", "tier"], "critical", c.tierCritical, "high", c.tierHigh, "medium", c.tierMedium, c.tierLow];

/** MapLibre style: OSM raster under the scene image; if tiles cannot load (offline) the scene still shows. */
export function styleFor(scene: SceneData, side: "before" | "after", c: Palette) {
  const coordinates = corners(scene);
  const style = {
    version: 8 as const,
    sources: {
      osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors", maxzoom: 19 },
      img: { type: "image", url: `${scene.base}/${side}.webp`, coordinates },
    } as Record<string, unknown>,
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#dfe3e8" } },
      { id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.85 } },
      { id: "img", type: "raster", source: "img", paint: { "raster-fade-duration": 0 } },
    ] as Record<string, unknown>[],
  };
  if (side === "before") return style;
  if (scene.meta.labels) {
    style.sources.labels = { type: "image", url: `${scene.base}/${scene.meta.labels}`, coordinates };
    style.layers.push({ id: "labels", type: "raster", source: "labels", layout: { visibility: "none" } });
  }
  style.sources.raw = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
  style.sources.changes = { type: "geojson", data: scene.filtered };
  style.layers.push(
    // raw candidates are neutral grey so noise is never mistaken for real change
    { id: "raw-fill", type: "fill", source: "raw", paint: { "fill-color": c.rawDetection, "fill-opacity": polygon.rawFillOpacity } },
    { id: "raw-line", type: "line", source: "raw", paint: { "line-color": c.rawStroke, "line-opacity": polygon.rawStrokeOpacity, "line-width": 1 } },
    { id: "changes-fill", type: "fill", source: "changes", paint: { "fill-color": tierColorExpr(c), "fill-opacity": polygon.fillOpacity } },
    { id: "changes-line", type: "line", source: "changes", paint: { "line-color": tierColorExpr(c), "line-width": polygon.lineWidth } },
    { id: "changes-sel", type: "line", source: "changes", paint: { "line-color": c.selectedLine, "line-width": polygon.selectedWidth }, filter: ["==", ["get", "id"], -1] },
  );
  return style;
}
