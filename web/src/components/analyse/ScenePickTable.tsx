import type { FetchPreview } from "../../lib/api";
import { InlineAlert, Scroller, Skeleton } from "../ui/Primitives";

const HIGH_CLOUD = 30;   // percent of the box that is cloud or no-data above which we say "high"
const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

/** A-09c: which images the server would use. States: loading (skeleton), empty (hint), populated, error. */
export default function ScenePickTable({ preview, loading = false, error }: { preview?: FetchPreview; loading?: boolean; error?: string }) {
  if (loading) {
    return (
      <div data-testid="scene-pick-loading" aria-busy="true" aria-label="Checking which images would be used" className="flex flex-col gap-s8">
        <Skeleton height={20} width="60%" /><Skeleton height={40} /><Skeleton height={40} />
      </div>
    );
  }
  if (error) return <div data-testid="pick-error"><InlineAlert variant="error" message={error} /></div>;
  if (!preview) {
    return <p data-testid="scene-pick-empty" className="text-body text-secondary">Press <b>Check scenes</b> to see which two images would be used and how cloudy they are. Nothing is downloaded yet.</p>;
  }
  return (
    <div data-testid="scene-pick" className="flex flex-col gap-s12">
      <p className="text-small text-fg">Images that will be used ({preview.size_km.map((v) => v.toFixed(1)).join(" × ")} km):</p>
      <Scroller testid="scene-pick-table">
        <table className="w-full min-w-[520px] border-collapse text-left text-tiny">
          <caption className="sr-only">The two Sentinel-2 images chosen for your dates</caption>
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="py-s8 pr-s12 font-semibold">Image</th>
              <th scope="col" className="py-s8 pr-s12 font-semibold">Date</th>
              <th scope="col" className="py-s8 pr-s12 font-semibold">Scene</th>
              <th scope="col" className="py-s8 pr-s12 font-semibold">Cloud / no-data over the box</th>
              <th scope="col" className="py-s8 font-semibold">Days from your date</th>
            </tr>
          </thead>
          <tbody>
            {(["before", "after"] as const).map((k) => {
              const p = preview[k];
              const high = p.aoi_invalid_pct > HIGH_CLOUD;
              return (
                <tr key={k} className="border-b border-line last:border-0">
                  <th scope="row" className="py-s8 pr-s12 text-body font-semibold capitalize text-fg">{k}</th>
                  <td className="py-s8 pr-s12 text-body text-fg">{p.date}</td>
                  <td className="max-w-[16rem] truncate py-s8 pr-s12 font-mono text-secondary" title={p.scene}>{p.scene}</td>
                  <td className="py-s8 pr-s12 text-body text-fg">{p.aoi_invalid_pct}%{high && <span className="ml-1 text-warning"> ! high</span>}</td>
                  <td className="py-s8 text-body text-fg">{sign(p.days_from_target)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Scroller>
      {preview.warnings.map((w) => <InlineAlert key={w} variant="warning" message={w} />)}
    </div>
  );
}
