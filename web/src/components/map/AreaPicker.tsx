import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/motion";
import { type Box, boxFromCorners, boxPolygon } from "../../lib/aoi";
import type { Place } from "../../lib/aoi";
import { type Resolved, useUi } from "../../store/ui";

maplibregl.setWorkerUrl(workerUrl);

const EMPTY = { type: "FeatureCollection" as const, features: [] };
const asData = (b?: Box) => (b ? { type: "FeatureCollection" as const, features: [boxPolygon(b)] } : EMPTY);

// Fallbacks are the A1 values (boxFill / boxLine / bg) for when CSS variables cannot be read (tests, very old browsers).
const FALLBACK = {
  dark: { fill: "rgba(34, 211, 238, 0.20)", line: "#22d3ee", bg: "#07111f" },
  light: { fill: "rgba(8, 145, 178, 0.20)", line: "#0891b2", bg: "#dfe3e8" },
} as const;

/** Map layer colours come from the theme tokens (CSS variables on <html>), so the box always matches the app. */
function themeColors(theme: Resolved) {
  const css = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : undefined;
  const read = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback;
  const f = FALLBACK[theme];
  return { fill: read("--c-box-fill", f.fill), line: read("--c-accent", f.line), bg: read("--c-bg", f.bg) };
}

/** Dim and slightly desaturate the OpenStreetMap tiles in the dark theme so the box and controls stand out. */
const rasterPaint = (theme: Resolved) =>
  theme === "dark"
    ? { "raster-brightness-max": 0.55, "raster-saturation": -0.5, "raster-contrast": 0.1 }
    : { "raster-brightness-max": 1, "raster-saturation": 0, "raster-contrast": 0 };

function paintTheme(m: maplibregl.Map, theme: Resolved) {
  if (!m.getLayer("box-fill")) return;
  const c = themeColors(theme);
  m.setPaintProperty("bg", "background-color", c.bg);
  m.setPaintProperty("box-fill", "fill-color", c.fill);
  m.setPaintProperty("box-fill", "fill-opacity", 1);   // the 20% opacity is already in the rgba fill
  m.setPaintProperty("box-line", "line-color", c.line);
  const r = rasterPaint(theme);
  m.setPaintProperty("osm", "raster-brightness-max", r["raster-brightness-max"]);
  m.setPaintProperty("osm", "raster-saturation", r["raster-saturation"]);
  m.setPaintProperty("osm", "raster-contrast", r["raster-contrast"]);
}

interface Props {
  box?: Box;
  onChange: (b?: Box) => void;
  place?: Place;
}

type Step = "first" | "second" | "drawn";
const HINT: Record<Step, string> = {
  first: "Click the first corner of your area",
  second: "Now click the opposite corner",
  drawn: "Box drawn. Click again to start over",
};

/** A-03c: click two opposite corners to draw the area; click again to start over. Rotation is disabled. */
export default function AreaPicker({ box, onChange, place }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const map = useRef<maplibregl.Map | undefined>(undefined);
  const pending = useRef<[number, number] | null>(null);
  const emitted = useRef<Box | undefined>(undefined);
  const cb = useRef(onChange);
  cb.current = onChange;
  const boxRef = useRef(box);
  boxRef.current = box;
  const selfClear = useRef(false);
  const theme = useUi((s) => s.resolved);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState<Step>(box ? "drawn" : "first");

  useEffect(() => {
    if (!el.current) return;
    let m: maplibregl.Map;
    try {
      const c = themeColors(themeRef.current);
      m = new maplibregl.Map({
        container: el.current,
        center: [79, 22.5],
        zoom: 4,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        style: {
          version: 8,
          sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors", maxzoom: 19 },
            box: { type: "geojson", data: EMPTY } },
          layers: [
            { id: "bg", type: "background", paint: { "background-color": c.bg } },
            { id: "osm", type: "raster", source: "osm", paint: rasterPaint(themeRef.current) },
            { id: "box-fill", type: "fill", source: "box", paint: { "fill-color": c.fill, "fill-opacity": 1 } },
            { id: "box-line", type: "line", source: "box", paint: { "line-color": c.line, "line-width": 2.5 } },
          ],
        },
      });
    } catch {
      setFailed(true);   // no WebGL: the typed-coordinates form next to the map still works
      return;
    }
    m.touchZoomRotate.disableRotation();
    m.keyboard.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.AttributionControl({ compact: true }));
    const setBox = (b?: Box) => (m.getSource("box") as maplibregl.GeoJSONSource | undefined)?.setData(asData(b) as never);
    m.on("click", (e) => {
      const p: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      if (!pending.current) {
        pending.current = p;
        emitted.current = undefined;
        if (boxRef.current) {
          selfClear.current = true;     // this clear comes from the click itself, so it must not cancel the corner just placed
          cb.current(undefined);
        }
        setBox(boxFromCorners(p, p));
        setStep("second");
      } else {
        const b = boxFromCorners(pending.current, p);
        pending.current = null;
        emitted.current = b;
        setBox(b);
        cb.current(b);
        setStep("drawn");
      }
    });
    m.on("mousemove", (e) => {
      if (readout.current) readout.current.textContent = `Lon ${e.lngLat.lng.toFixed(3)}, Lat ${e.lngLat.lat.toFixed(3)}`;
      if (pending.current) setBox(boxFromCorners(pending.current, [e.lngLat.lng, e.lngLat.lat]));
    });
    m.getCanvas().style.cursor = "crosshair";
    map.current = m;
    return () => {
      m.remove();
      map.current = undefined;
    };
  }, []);

  // a box set from outside (typed coordinates, or cleared): draw it, and bring it into view when it did not come from a click
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      (m.getSource("box") as maplibregl.GeoJSONSource | undefined)?.setData(asData(box) as never);
      if (box && box !== emitted.current) {
        m.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: 48, maxZoom: 13, animate: !reduced });
        emitted.current = box;
      }
    };
    if (m.isStyleLoaded()) apply();
    else m.once("load", apply);
    if (!box) {
      if (selfClear.current) selfClear.current = false;
      else pending.current = null;
    }
    setStep(box ? "drawn" : pending.current ? "second" : "first");
  }, [box, reduced]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => paintTheme(m, theme);
    if (m.isStyleLoaded()) apply();
    else m.once("load", apply);
  }, [theme]);

  useEffect(() => {
    if (place) map.current?.flyTo({ center: [place.lng, place.lat], zoom: place.zoom, animate: !reduced });
  }, [place, reduced]);

  if (failed) {
    return (
      <div data-testid="area-picker" role="alert" className="flex min-h-[160px] items-center justify-center rounded-md border border-line bg-surface-alt p-s18 text-center text-body text-secondary">
        The interactive map could not start in this browser (it needs WebGL). Type the corner coordinates below instead.
      </div>
    );
  }
  return (
    <div className="relative">
      <div ref={el} role="group" aria-label="Map. Click two opposite corners to draw the area; use the coordinate fields below the map if you cannot use a pointer."
        className="h-[46vh] min-h-[320px] w-full overflow-hidden rounded-md border border-line bg-surface-alt lg:h-[500px]" data-testid="area-picker" />
      <span data-testid="picker-step" data-step={step} aria-hidden="true"
        className="pointer-events-none absolute left-s8 top-s8 max-w-[calc(100%-64px)] rounded-sm border border-line bg-surface/95 px-s12 py-s4 text-tiny text-fg shadow-card">
        {HINT[step]}
      </span>
      <span ref={readout} aria-hidden="true" className="pointer-events-none absolute bottom-s8 left-s8 hidden rounded-xs bg-surface/90 px-2 py-0.5 text-micro text-secondary sm:block" />
    </div>
  );
}
