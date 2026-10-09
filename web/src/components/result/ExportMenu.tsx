import type { ChangeProps, SceneData } from "../../lib/types";
import { CardSection, InlineAlert } from "../ui/Primitives";
import QRBlock from "./QRBlock";

export const EXPORT_FILES: [string, string][] = [
  ["GeoPackage (QGIS)", "changes.gpkg"], ["GeoJSON", "changes.geojson"], ["PDF report", "report.pdf"],
  ["CSV (field pack)", "changes.csv"], ["KML (Google Earth)", "changes.kml"], ["Audit trail", "audit.json"],
];

function download(name: string, json: unknown) {
  const a = document.createElement("a");
  const href = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/geo+json" }));
  a.href = href;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

const btn = "press tap w-full rounded-sm border border-line-strong bg-surface-alt px-s12 text-small text-fg hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50";

/**
 * R-29 + R-30: downloads and the permalink QR. For the default (spectral) result these are the prebuilt GPKG / GeoJSON / PDF / CSV / KML files;
 * for a learned or hybrid variant only a GeoJSON built in the browser from the polygons on screen is offered, because the other
 * files were produced from the spectral result.
 */
export default function ExportMenu({ scene, confirmed, url }: { scene: SceneData; confirmed: ChangeProps[]; url: string }) {
  const detector = scene.detector ?? "spectral";
  const variant = detector !== "spectral";
  const tag = variant ? `_${detector}` : "";
  const ids = new Set(confirmed.map((p) => p.id));
  const downloadConfirmed = () =>
    download(`${scene.meta.id}${tag}_confirmed.geojson`, {
      ...scene.filtered,
      features: scene.filtered.features.filter((f) => ids.has(f.properties.id)).map((f) => ({ ...f, properties: { ...f.properties, review_status: "confirmed" } })),
    });
  return (
    <CardSection title="Export" testid="export">
      {variant ? (
        <>
          <button type="button" data-testid="export-variant-geojson" className={btn}
            onClick={() => download(`${scene.meta.id}${tag}.geojson`, scene.filtered)}>
            GeoJSON · {detector} detector ({scene.filtered.features.length.toLocaleString("en-IN")})
          </button>
          <div className="mt-s8">
            <InlineAlert variant="info" message="GeoPackage, PDF, CSV and KML are built from the spectral result. Switch the detector back to Spectral rules to download them." />
          </div>
        </>
      ) : (
        <ul className="grid grid-cols-2 gap-s8">
          {EXPORT_FILES.map(([label, f]) => (
            <li key={f}>
              <a href={`${scene.base}/exports/${f}`} download data-testid={`export-${f}`}
                className="press tap w-full rounded-sm border border-line-strong bg-surface-alt px-s8 text-center text-small text-accent no-underline hover:bg-surface-hover">{label}</a>
            </li>
          ))}
        </ul>
      )}
      <button type="button" data-testid="export-confirmed" disabled={!confirmed.length} onClick={downloadConfirmed} className={`${btn} mt-s8`}>
        Confirmed only ({confirmed.length}) · GeoJSON
      </button>
      <QRBlock url={url} />
    </CardSection>
  );
}
