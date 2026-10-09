import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Txt } from "../ui/Txt";
import { MapControls } from "./MapControls";
import { SwipeHandle } from "./SwipeHandle";
import { boundsOf, styleFor } from "./compareStyle";
import type { CompareMapProps } from "./compareTypes";
import { ensureMapLibreAssets } from "./maplibreWeb";

export type { CompareMapProps } from "./compareTypes";

export default function CompareMap(props: CompareMapProps) {
  const { scene, filterOn, raw, showLabels, showPolygons, filter, selectedId, onSelect, swipe, onSwipe } = props;
  const { c, name: themeName } = useTheme();
  const wrap = useRef<HTMLDivElement>(null);
  const beforeEl = useRef<HTMLDivElement>(null);
  const afterEl = useRef<HTMLDivElement>(null);
  const maps = useRef<{ before?: maplibregl.Map; after?: maplibregl.Map }>({});
  const readyMap = useRef<maplibregl.Map>(undefined);
  const [ready, setReady] = useState(0);
  const [width, setWidth] = useState(1);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const palette = useRef(c);
  palette.current = c;

  // two synced maps, created once per scene (theme only recolours layers below)
  useEffect(() => {
    ensureMapLibreAssets(maplibregl);
    if (!beforeEl.current || !afterEl.current) return;
    const common = { bounds: boundsOf(scene), fitBoundsOptions: { padding: 20 }, attributionControl: false as const, dragRotate: false, pitchWithRotate: false };
    const before = new maplibregl.Map({ container: beforeEl.current, style: styleFor(scene, "before", palette.current) as never, ...common });
    const after = new maplibregl.Map({ container: afterEl.current, style: styleFor(scene, "after", palette.current) as never, ...common });
    before.touchZoomRotate.disableRotation();
    after.touchZoomRotate.disableRotation();
    after.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    after.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    let syncing = false;
    const sync = (from: maplibregl.Map, to: maplibregl.Map) => () => {
      if (syncing) return;
      syncing = true;
      to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: 0, pitch: 0 });
      syncing = false;
    };
    before.on("move", sync(before, after));
    after.on("move", sync(after, before));
    after.on("click", "changes-fill", (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (id != null) onSelectRef.current(Number(id));
    });
    after.on("mouseenter", "changes-fill", () => (after.getCanvas().style.cursor = "pointer"));
    after.on("mouseleave", "changes-fill", () => (after.getCanvas().style.cursor = ""));
    // everything is in the initial style, so it renders even when basemap tiles are unreachable
    const markReady = () => { readyMap.current = after; setReady((r) => r + 1); };
    if (after.isStyleLoaded()) markReady(); else after.once("style.load", markReady);
    for (const m of [before, after]) m.on("error", (e) => { if (!String(e.error?.message).includes("openstreetmap")) console.error("map error:", e.error?.message ?? e); });
    maps.current = { before, after };
    (window as unknown as { __geoai_map?: maplibregl.Map }).__geoai_map = after;
    return () => { before.remove(); after.remove(); maps.current = {}; readyMap.current = undefined; };
  }, [scene]);

  // layer visibility, data, filters, selection, theme colours
  useEffect(() => {
    const m = maps.current.after;
    if (!m || !ready || readyMap.current !== m) return;
    const vis = (on: boolean) => (on ? "visible" : "none");
    for (const l of ["raw-fill", "raw-line"]) m.setLayoutProperty(l, "visibility", vis(!filterOn));
    for (const l of ["changes-fill", "changes-line", "changes-sel"]) m.setLayoutProperty(l, "visibility", vis(filterOn && showPolygons));
    if (m.getLayer("labels")) m.setLayoutProperty("labels", "visibility", vis(showLabels));
    if (raw) (m.getSource("raw") as GeoJSONSource).setData(raw as never);
    m.setFilter("changes-fill", filter as never);
    m.setFilter("changes-line", filter as never);
    m.setFilter("changes-sel", ["==", ["get", "id"], selectedId ?? -1]);
    const tier = ["match", ["get", "tier"], "critical", c.tierCritical, "high", c.tierHigh, "medium", c.tierMedium, c.tierLow];
    m.setPaintProperty("changes-fill", "fill-color", tier as never);
    m.setPaintProperty("changes-line", "line-color", tier as never);
    m.setPaintProperty("changes-sel", "line-color", c.selectedLine);
  }, [ready, filterOn, raw, showLabels, showPolygons, filter, selectedId, themeName, c]);

  // A-15: fly to the selected polygon
  useEffect(() => {
    const m = maps.current.after;
    if (!m || !ready || readyMap.current !== m || selectedId == null) return;
    const f = scene.filtered.features.find((x) => x.properties.id === selectedId);
    if (f) m.easeTo({ center: [f.properties.centroid_lon, f.properties.centroid_lat], zoom: Math.max(m.getZoom(), 15), duration: 600 });
  }, [selectedId, ready, scene]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width || 1);
    const ro = new ResizeObserver(() => { setWidth(el.getBoundingClientRect().width || 1); maps.current.before?.resize(); maps.current.after?.resize(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const label = (side: "left" | "right", text: string) => (
    <View pointerEvents="none" style={{ position: "absolute", top: space[2], [side]: space[2], maxWidth: "46%", backgroundColor: "rgba(7,17,31,0.78)", borderRadius: radius.xs, paddingHorizontal: space[2], paddingVertical: 2 }}>
      <Txt v="micro" numberOfLines={1} style={{ color: "#F1F5F9" }}>{text}</Txt>
    </View>
  );

  return (
    <View testID="compare-map" style={{ flex: 1, minHeight: 280, borderRadius: radius.md, overflow: "hidden", backgroundColor: "#dfe3e8" }}>
      <div ref={wrap} style={{ position: "absolute", inset: 0 }}>
        <div ref={afterEl} style={{ position: "absolute", inset: 0 }} aria-label="after map" />
        <div ref={beforeEl} style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - swipe}% 0 0)` }} aria-label="before map" />
      </div>
      {label("left", scene.meta.before_label)}
      {label("right", scene.meta.after_label)}
      <View style={{ position: "absolute", right: space[2], bottom: 36 }}>
        <MapControls onZoomIn={() => maps.current.after?.zoomIn()} onZoomOut={() => maps.current.after?.zoomOut()}
          onResetView={() => maps.current.after?.fitBounds(boundsOf(scene), { padding: 20 })} />
      </View>
      <SwipeHandle swipePct={swipe} onSwipe={onSwipe} containerWidth={width} />
    </View>
  );
}
