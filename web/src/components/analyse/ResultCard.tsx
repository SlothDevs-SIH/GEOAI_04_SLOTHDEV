import { Link } from "react-router-dom";
import { API_URL } from "../../lib/api";
import { area, num } from "../../lib/format";
import { TIERS } from "../../lib/tiers";
import type { Tier } from "../../lib/types";
import { DemoBadge } from "../ui/Primitives";
import { TierChip } from "../ui/Shapes";
import { LINK_PRIMARY } from "./styles";

export interface OpticalResult { raw_detections: number; after_filter: number; total_area_m2: number; by_tier?: Partial<Record<Tier, number>> }
export interface RadarResult { mode: "radar"; after_filter: number; flooded_ha: number; threshold_db: number }
export type JobResult = OpticalResult | RadarResult;

export const isRadarResult = (r: JobResult): r is RadarResult => (r as RadarResult).mode === "radar";

const FORMATS = ["geojson", "gpkg", "pdf", "csv", "kml"];

/** A-13c: the finished job in one card: raw to real counts, the link to the swipe map, and the downloads. */
export default function ResultCard({ jobId, summary, isRadar = isRadarResult(summary) }: { jobId: string; summary: JobResult; isRadar?: boolean }) {
  const formats = isRadar ? ["geojson"] : FORMATS;
  const tiers = !isRadarResult(summary) && summary.by_tier ? TIERS.filter((t) => (summary.by_tier?.[t] ?? 0) > 0) : [];
  return (
    <div data-testid="analyse-result-body" className="flex flex-col gap-s18">
      <div className="flex flex-wrap items-center gap-s8"><DemoBadge kind="live" /></div>
      {isRadarResult(summary) ? (
        <p className="text-h2 text-fg">
          <b className="text-metric text-success">{num(summary.after_filter)}</b> flood areas · {num(summary.flooded_ha)} ha of open water
        </p>
      ) : (
        <p className="text-h2 text-fg">
          <b className="text-metric">{num(summary.raw_detections)}</b> raw <span aria-hidden="true">→</span><span className="sr-only"> to </span>{" "}
          <b className="text-metric text-success">{num(summary.after_filter)}</b> real changes · {area(summary.total_area_m2)}
        </p>
      )}
      {tiers.length > 0 && !isRadarResult(summary) && (
        <ul aria-label="Real changes by severity" className="m-0 flex list-none flex-wrap gap-s8 p-0">
          {tiers.map((t) => (
            <li key={t} className="flex items-center gap-s4 text-small text-secondary">
              <TierChip tier={t} /> <span>{num(summary.by_tier?.[t])}</span>
            </li>
          ))}
        </ul>
      )}
      {!isRadar && (
        <div>
          <Link to={`/job/${jobId}`} data-testid="open-on-map" className={`${LINK_PRIMARY} inline-flex`}>Open on the swipe map</Link>
        </div>
      )}
      <div>
        <h3 className="mb-s4 text-small text-fg">Downloads</h3>
        <ul className="m-0 grid list-none grid-cols-2 gap-s8 p-0 sm:grid-cols-5">
          {formats.map((fmt) => (
            <li key={fmt}>
              <a data-testid={`download-${fmt}`} href={`${API_URL}/jobs/${jobId}/export?format=${fmt}`}
                className="press tap w-full rounded-sm border border-line-strong bg-surface-alt px-s12 text-small text-accent underline hover:bg-surface-hover">
                Download {fmt.toUpperCase()}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
