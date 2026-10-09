import { Camera, GeoJSONSource, Layer, Map as MapView, type CameraRef } from "@maplibre/maplibre-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { polygon, radius, space } from "../../theme/tokens";
import { Txt } from "../ui/Txt";
import { SwipeHandle } from "./SwipeHandle";
import { boundsOf, styleFor, tierColorExpr } from "./compareStyle";
import type { CompareMapProps } from "./compareTypes";

export type { CompareMapProps } from "./compareTypes";

// Native: the same base style as web (OSM + scene image), two stacked maps, the "before" one clipped to the left of the divider.
// Polygons are declarative children. Written against @maplibre/maplibre-react-native 11; a device build is needed to run it.
export default function CompareMap({ scene, filterOn, raw, showLabels, showPolygons, filter, selectedId, onSelect, swipe, onSwipe }: CompareMapProps) {
  const { c } = useTheme();
  const [size, setSize] = useState({ w: 1, h: 1 });
  const camera = useRef<CameraRef>(null);
  const [[w, s], [e, n]] = boundsOf(scene);
  // base layers only; change layers are children below
  const baseStyle = (side: "before" | "after") => {
    const st = styleFor(scene, side, c);
    const keep = new Set(["bg", "osm", "img", "labels"]);
    st.layers = st.layers.filter((l) => keep.has(l.id as string));
    for (const k of ["raw", "changes"]) delete st.sources[k];
    if (side === "after" && st.layers.find((l) => l.id === "labels")) {
      (st.layers.find((l) => l.id === "labels")!.layout as Record<string, string>).visibility = showLabels ? "visible" : "none";
    }
    return st;
  };
  const before = useMemo(() => baseStyle("before"), [scene, c]); // eslint-disable-line react-hooks/exhaustive-deps
  const after = useMemo(() => baseStyle("after"), [scene, c, showLabels]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedId == null) return;
    const f = scene.filtered.features.find((x) => x.properties.id === selectedId);
    if (f) camera.current?.easeTo({ center: [f.properties.centroid_lon, f.properties.centroid_lat], zoom: 15, duration: 600 });
  }, [selectedId, scene]);

  const view = (style: object, isAfter: boolean) => (
    <MapView style={{ flex: 1 }} mapStyle={style as never} touchRotate={false} touchPitch={false} dragPan attribution={isAfter} logo={false}>
      <Camera ref={isAfter ? camera : undefined} initialViewState={{ bounds: [w, s, e, n], padding: { top: 20, right: 20, bottom: 20, left: 20 } }} />
      {isAfter && !filterOn && raw && (
        <GeoJSONSource id="raw" data={raw as never}>
          <Layer id="raw-fill" type="fill" paint={{ "fill-color": c.rawDetection, "fill-opacity": polygon.rawFillOpacity }} />
          <Layer id="raw-line" type="line" paint={{ "line-color": c.rawStroke, "line-opacity": polygon.rawStrokeOpacity, "line-width": 1 }} />
        </GeoJSONSource>
      )}
      {isAfter && filterOn && showPolygons && (
        <GeoJSONSource id="changes" data={scene.filtered as never}
          onPress={(ev) => { const id = (ev.nativeEvent as { features?: { properties?: { id?: number } | null }[] }).features?.[0]?.properties?.id; if (id != null) onSelect(Number(id)); }}>
          <Layer id="changes-fill" type="fill" filter={filter as never} paint={{ "fill-color": tierColorExpr(c) as never, "fill-opacity": polygon.fillOpacity }} />
          <Layer id="changes-line" type="line" filter={filter as never} paint={{ "line-color": tierColorExpr(c) as never, "line-width": polygon.lineWidth }} />
          <Layer id="changes-sel" type="line" filter={["==", ["get", "id"], selectedId ?? -1] as never} paint={{ "line-color": c.selectedLine, "line-width": polygon.selectedWidth }} />
        </GeoJSONSource>
      )}
    </MapView>
  );

  const tag = (side: "left" | "right", text: string) => (
    <View pointerEvents="none" style={{ position: "absolute", top: space[2], [side]: space[2], backgroundColor: "rgba(7,17,31,0.78)", borderRadius: radius.xs, paddingHorizontal: space[2] }}>
      <Txt v="micro" style={{ color: "#F1F5F9" }}>{text}</Txt>
    </View>
  );
  return (
    <View testID="compare-map" onLayout={(ev) => setSize({ w: ev.nativeEvent.layout.width, h: ev.nativeEvent.layout.height })} style={{ flex: 1, minHeight: 280, borderRadius: radius.md, overflow: "hidden" }}>
      <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}>{view(after, true)}</View>
      <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: (size.w * swipe) / 100, overflow: "hidden" }}>
        <View style={{ width: size.w, height: size.h }}>{view(before, false)}</View>
      </View>
      {tag("left", scene.meta.before_label)}
      {tag("right", scene.meta.after_label)}
      <SwipeHandle swipePct={swipe} onSwipe={onSwipe} containerWidth={size.w} />
    </View>
  );
}
