// MapLibre 6 loads its worker as a separate ES module and needs its stylesheet; sync-assets copies both to the web root.
let done = false;
export function ensureMapLibreAssets(ml: { setWorkerUrl: (u: string) => void }) {
  if (done || typeof document === "undefined") return;
  done = true;
  ml.setWorkerUrl("/maplibre-gl-worker.mjs");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/maplibre-gl.css";
  document.head.appendChild(link);
}
