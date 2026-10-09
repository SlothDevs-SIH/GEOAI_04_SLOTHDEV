import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, LngLatBoundsLike, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre 6 ships its worker as a separate ES module; bundle it explicitly so it loads on any host.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/motion";
import { MAP_STYLE, POLYGON, TIERS, tierColor } from "../../lib/tiers";
import type { FeatureCollection, SceneData } from "../../lib/types";
import { useUi, type Resolved } from "../../store/ui";
import MapControls from "../result/MapControls";
import SwipeHandle from "../result/SwipeHandle";
import { Skeleton } from "../ui/Primitives";

maplibregl.setWorkerUrl(workerUrl);

/** MapLibre "match" expression: tier -> colour for the current theme. Low is the fallback (blue, never green). */
export function tierColorExpr(mode: Resolved) {
  return ["match", ["get", "tier"], ...TIERS.slice(0, 3).flatMap((t) => [t, tierColor(t, mode)]), tierColor("low", mode)];
}

/** A theme colour from the CSS variables (the single source of truth), so the map follows the app theme. */
const cssVar = (name: string, fallback: string) =>
  (typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(name).trim()) || fallback;

/** Basemap: OSM raster tiles under the scene image, dimmed in the dark theme so the imagery and polygons lead. */
const osmPaint = (mode: Resolved) =>
  mode === "dark"
    ? { "raster-opacity": 0.9, "raster-brightness-max": 0.5, "raster-saturation": -0.4 }
    : { "raster-opacity": 0.85, "raster-brightness-max": 1, "raster-saturation": 0 };

// Base map: OpenStreetMap raster tiles under the scene image. If tiles cannot load (offline), the scene still shows.
export function styleFor(scene: SceneData, side: "before" | "after", mode: Resolved = "dark"): StyleSpecification {
  const coordinates = corners(scene);
  const style: StyleSpecification = {
    version: 8,
    sources: {
      osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors", maxzoom: 19 },
      img: { type: "image", url: `${scene.base}/${side}.webp`, coordinates },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": cssVar("--c-bg", "transparent") } },
      { id: "osm", type: "raster", source: "osm", paint: osmPaint(mode) },
      { id: "img", type: "raster", source: "img", paint: { "raster-fade-duration": 0 } },
    ],
  };
  if (side === "before") return style;
  const ms = MAP_STYLE[mode];
  const expr = tierColorExpr(mode) as never;
  if (scene.meta.labels) {
    style.sources.labels = { type: "image", url: `${scene.base}/${scene.meta.labels}`, coordinates };
    style.layers.push({ id: "labels", type: "raster", source: "labels", layout: { visibility: "none" } });
  }
  style.sources.raw = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
  style.sources.changes = { type: "geojson", data: scene.filtered as never };
  style.layers.push(
    // raw candidates: neutral grey (never mistaken for a tiered change), faint fill, softer outline
    { id: "raw-fill", type: "fill", source: "raw", paint: { "fill-color": ms.raw, "fill-opacity": POLYGON.rawFillOpacity } },
    { id: "raw-line", type: "line", source: "raw", paint: { "line-color": ms.rawLine, "line-opacity": POLYGON.rawLineOpacity, "line-width": 1 } },
    { id: "changes-fill", type: "fill", source: "changes", paint: { "fill-color": expr, "fill-opacity": POLYGON.fillOpacity } },
    { id: "changes-line", type: "line", source: "changes", paint: { "line-color": expr, "line-width": POLYGON.lineWidth } },
    // the selected polygon: focus-yellow outline, grown to 3.5 px by growSelected()
    {
      id: "changes-sel", type: "line", source: "changes",
      paint: { "line-color": ms.selected, "line-width": POLYGON.selectedLineWidth, "line-width-transition": { duration: 150, delay: 0 } },
      filter: ["==", ["get", "id"], -1],
    },
  );
  return style;
}

/** Re-colours an existing map for a theme change without recreating it (camera and layers stay as they are). */
function restyle(m: maplibregl.Map, mode: Resolved) {
  const set = (layer: string, prop: string, v: unknown) => m.getLayer(layer) && m.setPaintProperty(layer, prop as never, v as never);
  set("bg", "background-color", cssVar("--c-bg", "transparent"));
  for (const [k, v] of Object.entries(osmPaint(mode))) set("osm", k, v);
  const ms = MAP_STYLE[mode];
  const expr = tierColorExpr(mode);
  set("raw-fill", "fill-color", ms.raw);
  set("raw-line", "line-color", ms.rawLine);
  set("changes-fill", "fill-color", expr);
  set("changes-line", "line-color", expr);
  set("changes-sel", "line-color", ms.selected);
}

/** A-15: the selected outline grows 1.6 -> 3.5 px over 150 ms (instantly under reduced motion). */
function growSelected(m: maplibregl.Map, reduced: boolean) {
  if (!m.getLayer("changes-sel")) return;
  const set = (p: string, v: unknown) => m.setPaintProperty("changes-sel", p as never, v as never);
  if (reduced) {
    set("line-width-transition", { duration: 0, delay: 0 });
    set("line-width", POLYGON.selectedLineWidth);
    return;
  }
  set("line-width-transition", { duration: 0, delay: 0 });
  set("line-width", POLYGON.lineWidth);
  let done = false;
  const grow = () => {
    if (done) return;
    done = true;
    try {
      set("line-width-transition", { duration: 150, delay: 0 });
      set("line-width", POLYGON.selectedLineWidth);
    } catch {
      /* the map was removed (scene changed) before the timer fired */
    }
  };
  m.once("render", grow);
  m.triggerRepaint();
  setTimeout(grow, 80); // if the map is not rendering (hidden tab) the outline must still end at full width
}

export interface CompareMapProps {
  scene: SceneData;
  filterOn: boolean;
  raw?: FeatureCollection;
  showLabels: boolean;
  showPolygons: boolean;
  filter: unknown[];
  selected?: number;
  onSelect: (id: number) => void;
  swipe: number; // 0..100, position of the divider
  onSwipe: (pct: number) => void;
}

function corners(scene: SceneData) {
  return scene.meta.corners as [[number, number], [number, number], [number, number], [number, number]];
}

function bounds(scene: SceneData): LngLatBoundsLike {
  const c = corners(scene);
  const xs = c.map((p) => p[0]);
  const ys = c.map((p) => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}

export default function CompareMap(props: CompareMapProps) {
  const { scene, filterOn, raw, showLabels, showPolygons, filter, selected, onSelect, swipe, onSwipe } = props;
  const resolved = useUi((s) => s.resolved);
  const reduced = useReducedMotion();
  const beforeEl = useRef<HTMLDivElement>(null);
  const afterEl = useRef<HTMLDivElement>(null);
  const maps = useRef<{ before?: maplibregl.Map; after?: maplibregl.Map }>({});
  const [ready, setReady] = useState(0);
  // the map whose style has finished loading; a stale `ready` from the previous scene must not touch a new map
  const readyMap = useRef<maplibregl.Map>(undefined);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const modeRef = useRef(resolved);
  modeRef.current = resolved;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const appliedData = useRef<unknown>(undefined);

  // create both maps once per scene (a detector switch keeps the same images and camera: only the polygons change, see below)
  useEffect(() => {
    if (!beforeEl.current || !afterEl.current) return;
    const sc = sceneRef.current;
    const common = {
      bounds: bounds(sc), fitBoundsOptions: { padding: 20 }, attributionControl: false as const,
      dragRotate: false, pitchWithRotate: false, maxPitch: 0, // two-finger rotate is disabled by design (A5 G-B)
    };
    const before = new maplibregl.Map({ container: beforeEl.current, style: styleFor(sc, "before", modeRef.current), ...common });
    const after = new maplibregl.Map({ container: afterEl.current, style: styleFor(sc, "after", modeRef.current), ...common });
    appliedData.current = sc.filtered;
    for (const m of [before, after]) {
      m.touchZoomRotate.disableRotation();
      m.keyboard.disableRotation();
    }
    after.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    after.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    // keep the two cameras in sync
    let syncing = false;
    const sync = (from: maplibregl.Map, to: maplibregl.Map) => () => {
      if (syncing) return;
      syncing = true;
      to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: from.getBearing(), pitch: from.getPitch() });
      syncing = false;
    };
    before.on("move", sync(before, after));
    after.on("move", sync(after, before));
    // Everything is declared in the initial style, so it renders even when basemap tiles are unreachable
    // (the map "load" event waits for those tiles; "style.load" does not).
    after.on("click", "changes-fill", (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (id != null) onSelectRef.current(Number(id));
    });
    after.on("mouseenter", "changes-fill", () => (after.getCanvas().style.cursor = "pointer"));
    after.on("mouseleave", "changes-fill", () => (after.getCanvas().style.cursor = ""));
    const markReady = () => {
      readyMap.current = after;
      setReady((r) => r + 1);
    };
    if (after.isStyleLoaded()) markReady();
    else after.once("style.load", markReady);
    for (const m of [before, after]) m.on("error", (e) => { if (!String(e.error?.message).includes("openstreetmap")) console.error("map error:", e.error?.message ?? e); });
    maps.current = { before, after };
    return () => {
      before.remove();
      after.remove();
      maps.current = {};
      readyMap.current = undefined;
      setReady(0);
    };
  }, [scene.base]);

  // theme change: re-colour in place
  useEffect(() => {
    const { before, after } = maps.current;
    if (!after || !ready || readyMap.current !== after) return;
    for (const m of [before, after]) if (m) restyle(m, resolved);
  }, [ready, resolved]);

  // layer visibility, data and filters
  useEffect(() => {
    const m = maps.current.after;
    if (!m || !ready || readyMap.current !== m) return;
    const vis = (on: boolean) => (on ? "visible" : "none");
    if (appliedData.current !== scene.filtered) {
      (m.getSource("changes") as GeoJSONSource).setData(scene.filtered as never); // another detector's polygons
      appliedData.current = scene.filtered;
    }
    for (const l of ["raw-fill", "raw-line"]) m.setLayoutProperty(l, "visibility", vis(!filterOn));
    for (const l of ["changes-fill", "changes-line", "changes-sel"]) m.setLayoutProperty(l, "visibility", vis(filterOn && showPolygons));
    if (m.getLayer("labels")) m.setLayoutProperty("labels", "visibility", vis(showLabels));
    if (raw) (m.getSource("raw") as GeoJSONSource).setData(raw as never);
    m.setFilter("changes-fill", filter as never);
    m.setFilter("changes-line", filter as never);
    m.setFilter("changes-sel", ["==", ["get", "id"], selected ?? -1]);
  }, [ready, filterOn, raw, showLabels, showPolygons, filter, selected, scene.filtered]);

  // A-15: grow the selected outline and fly to its centroid (600 ms)
  useEffect(() => {
    const m = maps.current.after;
    if (!m || !ready || readyMap.current !== m || selected == null) return;
    growSelected(m, reducedRef.current);
    const f = scene.filtered.features.find((x) => x.properties.id === selected);
    if (f) m.easeTo({ center: [f.properties.centroid_lon, f.properties.centroid_lat], zoom: Math.max(m.getZoom(), 15), duration: reducedRef.current ? 0 : 600 });
  }, [selected, ready, scene.filtered]);

  const after = () => maps.current.after;
  return (
    <div className="relative h-full w-full overflow-hidden rounded-md border border-line bg-surface-alt" data-testid="compare-map">
      {/* inline position: maplibre's own CSS sets .maplibregl-map { position: relative }, which would collapse these */}
      <div ref={afterEl} role="region" style={{ position: "absolute", inset: 0 }} aria-label="After map" />
      <div ref={beforeEl} role="region" style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - swipe}% 0 0)` }} aria-label="Before map" />
      {!ready && <div className="absolute inset-0 z-[5]" aria-hidden="true"><Skeleton width="100%" height="100%" radius={0} /></div>}
      <span className="pointer-events-none absolute left-s8 top-s8 z-20 max-w-[46%] truncate rounded-xs bg-bg/85 px-s8 py-s4 text-micro text-fg">{scene.meta.before_label}</span>
      <span className="pointer-events-none absolute right-s8 top-s8 z-20 max-w-[46%] truncate rounded-xs bg-bg/85 px-s8 py-s4 text-micro text-fg">{scene.meta.after_label}</span>
      <SwipeHandle value={swipe} onChange={onSwipe} />
      <MapControls
        onZoomIn={() => after()?.zoomIn({ duration: reduced ? 0 : 200 })}
        onZoomOut={() => after()?.zoomOut({ duration: reduced ? 0 : 200 })}
        onResetView={() => after()?.fitBounds(bounds(scene), { padding: 20, duration: reduced ? 0 : 400 })} />
    </div>
  );
}
