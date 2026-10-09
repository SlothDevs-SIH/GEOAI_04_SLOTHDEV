import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef } from "react";
import { type Box, boxFromCorners, boxPolygon } from "../../lib/aoi";
import type { Place } from "../../lib/aoi";

maplibregl.setWorkerUrl(workerUrl);

const EMPTY = { type: "FeatureCollection" as const, features: [] };
const asData = (b?: Box) => (b ? { type: "FeatureCollection" as const, features: [boxPolygon(b)] } : EMPTY);

interface Props {
  box?: Box;
  onChange: (b?: Box) => void;
  place?: Place;
}

/** Click two opposite corners to draw the area; click again to start over. OpenStreetMap tiles underneath. */
export default function AreaPicker({ box, onChange, place }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | undefined>(undefined);
  const pending = useRef<[number, number] | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      center: [79, 22.5],
      zoom: 4,
      attributionControl: false,
      style: {
        version: 8,
        sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors", maxzoom: 19 },
          box: { type: "geojson", data: EMPTY } },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#dfe3e8" } },
          { id: "osm", type: "raster", source: "osm" },
          { id: "box-fill", type: "fill", source: "box", paint: { "fill-color": "#0b63ce", "fill-opacity": 0.2 } },
          { id: "box-line", type: "line", source: "box", paint: { "line-color": "#0b63ce", "line-width": 2.5 } },
        ],
      },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.AttributionControl({ compact: true }));
    const setBox = (b?: Box) => (m.getSource("box") as maplibregl.GeoJSONSource | undefined)?.setData(asData(b) as never);
    m.on("click", (e) => {
      const p: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      if (!pending.current) {
        pending.current = p;
        cb.current(undefined);
        setBox(boxFromCorners(p, p));
      } else {
        const b = boxFromCorners(pending.current, p);
        pending.current = null;
        setBox(b);
        cb.current(b);
      }
    });
    m.on("mousemove", (e) => {
      if (pending.current) setBox(boxFromCorners(pending.current, [e.lngLat.lng, e.lngLat.lat]));
    });
    m.getCanvas().style.cursor = "crosshair";
    map.current = m;
    return () => {
      m.remove();
      map.current = undefined;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => (m.getSource("box") as maplibregl.GeoJSONSource | undefined)?.setData(asData(box) as never);
    if (m.isStyleLoaded()) apply();
    else m.once("load", apply);
    if (!box) pending.current = null;
  }, [box]);

  useEffect(() => {
    if (place) map.current?.flyTo({ center: [place.lng, place.lat], zoom: place.zoom });
  }, [place]);

  return <div ref={el} className="h-[46vh] min-h-[320px] w-full overflow-hidden rounded-lg border border-slate-300" data-testid="area-picker" />;
}
