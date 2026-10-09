import { Camera, GeoJSONSource, Layer, Map as MapView, type CameraRef } from "@maplibre/maplibre-react-native";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { type Box, boxFromCorners, boxPolygon } from "../../lib/aoi";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import type { AreaPickerProps } from "./AreaPicker.web";

export type { AreaPickerProps };

const OSM = { version: 8 as const,
  sources: { osm: { type: "raster" as const, tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors", maxzoom: 19 } },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }] };
const EMPTY = { type: "FeatureCollection" as const, features: [] };

/** Native: tap two opposite corners; a third tap starts over. Written for @maplibre/maplibre-react-native 11, needs a device build to run. */
export default function AreaPicker({ box, onChange, place }: AreaPickerProps) {
  const { c } = useTheme();
  const cam = useRef<CameraRef>(null);
  const [first, setFirst] = useState<[number, number] | null>(null);
  useEffect(() => { if (place) cam.current?.flyTo({ center: [place.lng, place.lat], zoom: place.zoom }); }, [place]);
  useEffect(() => { if (!box) setFirst(null); }, [box]);
  const shown: Box | undefined = box ?? (first ? boxFromCorners(first, first) : undefined);
  return (
    <View testID="area-picker" accessibilityLabel="Map: tap two opposite corners to draw the area" style={{ height: 380, borderRadius: radius.md, overflow: "hidden", borderColor: c.border, borderWidth: 1 }}>
      <MapView style={{ flex: 1 }} mapStyle={OSM as never} touchRotate={false} touchPitch={false}
        onPress={(ev) => {
          const [lng, lat] = (ev.nativeEvent as unknown as { lngLat: [number, number] }).lngLat;
          if (!first) { setFirst([lng, lat]); onChange(undefined); }
          else { const b = boxFromCorners(first, [lng, lat]); setFirst(null); onChange(b); }
        }}>
        <Camera ref={cam} initialViewState={{ center: [79, 22.5], zoom: 4 }} />
        <GeoJSONSource id="box" data={(shown ? { type: "FeatureCollection", features: [boxPolygon(shown)] } : EMPTY) as never}>
          <Layer id="box-fill" type="fill" paint={{ "fill-color": c.accent, "fill-opacity": 0.2 }} />
          <Layer id="box-line" type="line" paint={{ "line-color": c.boxLine, "line-width": 2.5 }} />
        </GeoJSONSource>
      </MapView>
    </View>
  );
}
