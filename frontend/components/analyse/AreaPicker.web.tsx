import * as maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { type Box, type Place, boxFromCorners, boxPolygon } from "../../lib/aoi";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { ensureMapLibreAssets } from "../result/maplibreWeb";

const EMPTY = { type: "FeatureCollection" as const, features: [] };
const asData = (b?: Box) => (b ? { type: "FeatureCollection" as const, features: [boxPolygon(b)] } : EMPTY);

export interface AreaPickerProps { box?: Box; onChange: (b?: Box) => void; place?: Place }

/** A-03c: click two opposite corners to draw the area; click again to start over. */
export default function AreaPicker({ box, onChange, place }: AreaPickerProps) {
  const { c } = useTheme();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | undefined>(undefined);
  const pending = useRef<[number, number] | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  const colors = useRef(c);
  colors.current = c;

  useEffect(() => {
    ensureMapLibreAssets(maplibregl);
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current, center: [79, 22.5], zoom: 4, attributionControl: false, dragRotate: false, pitchWithRotate: false,
      style: {
        version: 8,
        sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors", maxzoom: 19 }, box: { type: "geojson", data: EMPTY } },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#dfe3e8" } },
          { id: "osm", type: "raster", source: "osm" },
          { id: "box-fill", type: "fill", source: "box", paint: { "fill-color": colors.current.accent, "fill-opacity": 0.2 } },
          { id: "box-line", type: "line", source: "box", paint: { "line-color": colors.current.boxLine, "line-width": 2.5 } },
        ],
      },
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.AttributionControl({ compact: true }));
    const setBox = (b?: Box) => (m.getSource("box") as maplibregl.GeoJSONSource | undefined)?.setData(asData(b) as never);
    m.on("click", (e) => {
      const p: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      if (!pending.current) { pending.current = p; cb.current(undefined); setBox(boxFromCorners(p, p)); }
      else { const b = boxFromCorners(pending.current, p); pending.current = null; setBox(b); cb.current(b); }
    });
    m.on("mousemove", (e) => { if (pending.current) setBox(boxFromCorners(pending.current, [e.lngLat.lng, e.lngLat.lat])); });
    m.getCanvas().style.cursor = "crosshair";
    map.current = m;
    (window as unknown as { __geoai_picker?: maplibregl.Map }).__geoai_picker = m;
    return () => { m.remove(); map.current = undefined; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => (m.getSource("box") as maplibregl.GeoJSONSource | undefined)?.setData(asData(box) as never);
    if (m.isStyleLoaded()) apply(); else m.once("load", apply);
    if (!box) pending.current = null;
  }, [box]);

  useEffect(() => { if (place) map.current?.flyTo({ center: [place.lng, place.lat], zoom: place.zoom }); }, [place]);

  return (
    <View testID="area-picker" accessibilityLabel="Map: click two opposite corners to draw the area" style={{ height: 380, borderRadius: radius.md, overflow: "hidden", borderColor: c.border, borderWidth: 1 }}>
      <div ref={el} style={{ position: "absolute", inset: 0 }} />
    </View>
  );
}
