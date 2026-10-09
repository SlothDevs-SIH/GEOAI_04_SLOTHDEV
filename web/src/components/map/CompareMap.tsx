import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, LngLatBoundsLike, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre 6 ships its worker as a separate ES module; bundle it explicitly so it loads on any host.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState } from "react";
import { TIER_COLOR } from "../../lib/tiers";
import type { FeatureCollection, SceneData } from "../../lib/types";

maplibregl.setWorkerUrl(workerUrl);

const tierColorExpr = [
  "match",
  ["get", "tier"],
  "critical", TIER_COLOR.critical,
  "high", TIER_COLOR.high,
  "medium", TIER_COLOR.medium,
  TIER_COLOR.low,
];

// Base map: OpenStreetMap raster tiles under the scene image. If tiles cannot load (offline), the scene still shows.
export function styleFor(scene: SceneData, side: "before" | "after"): StyleSpecification {
  const coordinates = corners(scene);
  const style: StyleSpecification = {
    version: 8,
    sources: {
      osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors", maxzoom: 19 },
      img: { type: "image", url: `${scene.base}/${side}.webp`, coordinates },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#dfe3e8" } },
      { id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.85 } },
      { id: "img", type: "raster", source: "img", paint: { "raster-fade-duration": 0 } },
    ],
  };
  if (side === "before") return style;
  if (scene.meta.labels) {
    style.sources.labels = { type: "image", url: `${scene.base}/${scene.meta.labels}`, coordinates };
    style.layers.push({ id: "labels", type: "raster", source: "labels", layout: { visibility: "none" } });
  }
  style.sources.raw = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
  style.sources.changes = { type: "geojson", data: scene.filtered as never };
  style.layers.push(
    { id: "raw-fill", type: "fill", source: "raw", paint: { "fill-color": "#ff8c00", "fill-opacity": 0.55 } },
    { id: "changes-fill", type: "fill", source: "changes", paint: { "fill-color": tierColorExpr as never, "fill-opacity": 0.38 } },
    { id: "changes-line", type: "line", source: "changes", paint: { "line-color": tierColorExpr as never, "line-width": 1.6 } },
    { id: "changes-sel", type: "line", source: "changes", paint: { "line-color": "#ffffff", "line-width": 3.5 }, filter: ["==", ["get", "id"], -1] },
  );
  return style;
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
  const wrap = useRef<HTMLDivElement>(null);
  const beforeEl = useRef<HTMLDivElement>(null);
  const afterEl = useRef<HTMLDivElement>(null);
  const maps = useRef<{ before?: maplibregl.Map; after?: maplibregl.Map }>({});
  const [ready, setReady] = useState(0);
  // the map whose style has finished loading; a stale `ready` from the previous scene must not touch a new map
  const readyMap = useRef<maplibregl.Map>(undefined);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // create both maps once per scene
  useEffect(() => {
    if (!beforeEl.current || !afterEl.current) return;
    const common = { bounds: bounds(scene), fitBoundsOptions: { padding: 20 }, attributionControl: false as const };
    const before = new maplibregl.Map({ container: beforeEl.current, style: styleFor(scene, "before"), ...common });
    const after = new maplibregl.Map({ container: afterEl.current, style: styleFor(scene, "after"), ...common });
    after.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
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
    };
  }, [scene]);

  // layer visibility, data and filters
  useEffect(() => {
    const m = maps.current.after;
    if (!m || !ready || readyMap.current !== m) return;
    const vis = (on: boolean) => (on ? "visible" : "none");
    m.setLayoutProperty("raw-fill", "visibility", vis(!filterOn));
    for (const l of ["changes-fill", "changes-line", "changes-sel"]) m.setLayoutProperty(l, "visibility", vis(filterOn && showPolygons));
    if (m.getLayer("labels")) m.setLayoutProperty("labels", "visibility", vis(showLabels));
    if (raw) (m.getSource("raw") as GeoJSONSource).setData(raw as never);
    m.setFilter("changes-fill", filter as never);
    m.setFilter("changes-line", filter as never);
    m.setFilter("changes-sel", ["==", ["get", "id"], selected ?? -1]);
  }, [ready, filterOn, raw, showLabels, showPolygons, filter, selected]);

  // fly to the selected polygon
  useEffect(() => {
    const m = maps.current.after;
    if (!m || !ready || readyMap.current !== m || selected == null) return;
    const f = scene.filtered.features.find((x) => x.properties.id === selected);
    if (f) m.easeTo({ center: [f.properties.centroid_lon, f.properties.centroid_lat], zoom: Math.max(m.getZoom(), 15), duration: 600 });
  }, [selected, ready, scene]);

  // swipe: the before map is clipped to the left of the divider
  const drag = useRef(false);
  const move = (clientX: number) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    onSwipe(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden rounded-lg bg-slate-300" data-testid="compare-map">
      {/* inline position: maplibre's own CSS sets .maplibregl-map { position: relative }, which would collapse these */}
      <div ref={afterEl} style={{ position: "absolute", inset: 0 }} aria-label="after map" />
      <div ref={beforeEl} style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - swipe}% 0 0)` }} aria-label="before map" />
      <span className="pointer-events-none absolute left-2 top-2 max-w-[46%] truncate rounded bg-black/65 px-2 py-0.5 text-xs text-white">{scene.meta.before_label}</span>
      <span className="pointer-events-none absolute right-2 top-2 max-w-[46%] truncate rounded bg-black/65 px-2 py-0.5 text-xs text-white">{scene.meta.after_label}</span>
      <div
        role="slider"
        aria-label="Swipe between before and after"
        aria-valuenow={Math.round(swipe)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        data-testid="swipe-handle"
        className="absolute bottom-0 top-0 z-10 w-1 cursor-ew-resize bg-white shadow-[0_0_6px_rgba(0,0,0,.6)]"
        style={{ left: `${swipe}%` }}
        onPointerDown={(e) => {
          drag.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => drag.current && move(e.clientX)}
        onPointerUp={() => (drag.current = false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onSwipe(Math.max(0, swipe - 5));
          if (e.key === "ArrowRight") onSwipe(Math.min(100, swipe + 5));
        }}
      >
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] text-black">◀ ▶</span>
      </div>
    </div>
  );
}
