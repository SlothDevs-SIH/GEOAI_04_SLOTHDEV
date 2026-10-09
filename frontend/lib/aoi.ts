// Box limits for "analyse any area". The same limits are enforced by the server (engine/aoi.py); this copy
// only gives the user instant feedback while drawing.

export const MAX_SIDE_KM = 15;
export const MIN_SIDE_KM = 0.5;

/** west, south, east, north (degrees) */
export type Box = [number, number, number, number];

export function sizeKm(b: Box): [number, number] {
  const [w, s, e, n] = b;
  const mid = ((s + n) / 2) * (Math.PI / 180);
  return [(e - w) * 111.32 * Math.cos(mid), (n - s) * 110.57];
}

/** Two clicked corners (lng, lat) to a west-south-east-north box. */
export function boxFromCorners(a: [number, number], b: [number, number]): Box {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}

/** A plain-language problem with the box, or undefined when it is fine. */
export function boxProblem(b: Box | undefined): string | undefined {
  if (!b) return "Click two opposite corners on the map to draw the area.";
  const [w, h] = sizeKm(b);
  if (w > MAX_SIDE_KM || h > MAX_SIDE_KM) return `The area is ${w.toFixed(1)} × ${h.toFixed(1)} km; the limit is ${MAX_SIDE_KM} × ${MAX_SIDE_KM} km. Draw a smaller box.`;
  if (w < MIN_SIDE_KM || h < MIN_SIDE_KM) return `The area is ${w.toFixed(2)} × ${h.toFixed(2)} km; draw at least ${MIN_SIDE_KM} × ${MIN_SIDE_KM} km.`;
  return undefined;
}

export const boxPolygon = (b: Box) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "Polygon" as const, coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] },
});

export interface Place {
  name: string;
  lng: number;
  lat: number;
  zoom: number;
}

/** Places to jump to; the whole of India works, these are only shortcuts across different regions and climates. */
export const PLACES: Place[] = [
  { name: "All of India", lng: 79, lat: 22.5, zoom: 4 },
  { name: "Bhopal (Madhya Pradesh)", lng: 77.41, lat: 23.25, zoom: 10.5 },
  { name: "Patna (Bihar)", lng: 85.14, lat: 25.6, zoom: 10.5 },
  { name: "Delhi NCR", lng: 77.2, lat: 28.55, zoom: 10.5 },
  { name: "Mumbai / Navi Mumbai", lng: 73.0, lat: 19.05, zoom: 10.5 },
  { name: "Pune", lng: 73.8, lat: 18.55, zoom: 10.5 },
  { name: "Bengaluru", lng: 77.62, lat: 12.97, zoom: 10.5 },
  { name: "Chennai", lng: 80.25, lat: 13.05, zoom: 10.5 },
  { name: "Kolkata", lng: 88.36, lat: 22.57, zoom: 10.5 },
  { name: "Hyderabad", lng: 78.47, lat: 17.4, zoom: 10.5 },
  { name: "Ahmedabad", lng: 72.58, lat: 23.03, zoom: 10.5 },
  { name: "Jaipur (arid Rajasthan)", lng: 75.8, lat: 26.9, zoom: 10.5 },
  { name: "Guwahati (Assam)", lng: 91.74, lat: 26.15, zoom: 10.5 },
  { name: "Kochi (Kerala)", lng: 76.3, lat: 9.97, zoom: 10.5 },
  { name: "Bhubaneswar (Odisha)", lng: 85.82, lat: 20.3, zoom: 10.5 },
];
