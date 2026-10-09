import { num } from "../../lib/format";
import { DROP_LABEL } from "../../lib/tiers";
import type { Summary } from "../../lib/types";
import { CardSection, InlineAlert, Scroller } from "../ui/Primitives";

/** R-15: what the false-alarm filter removed, as chips (empty when it removed nothing). */
export function DropCounts({ dropped }: { dropped: Summary["dropped"] }) {
  const entries = Object.entries(dropped).filter(([, v]) => v > 0);
  if (!entries.length) return null;
  return (
    <div data-testid="drops" className="text-tiny text-secondary">
      <p className="mb-s4 text-micro uppercase tracking-wider text-muted">What the filter removed (pixels)</p>
      <ul className="flex flex-wrap gap-s8">
        {entries.map(([k, v]) => (
          <li key={k} className="rounded-xs border border-line bg-surface-alt px-s8 py-s4">
            <b className="text-fg">{num(v)}</b> {DROP_LABEL[k] ?? k.replace(/_/g, " ")}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** R-16: amber banner for cloud, speckle and similar quality warnings. Hidden when there are none. */
export function WarningsBanner({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div data-testid="warnings">
      <InlineAlert variant="warning">
        <ul className="space-y-s4">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      </InlineAlert>
    </div>
  );
}

/** R-17: naive threshold vs the M8 radar pipeline against expert labels (radar scenes only). */
export function SceneEvalTable({ evaluation }: { evaluation?: Summary["evaluation"] }) {
  if (!evaluation) return null;
  const rows = [
    ["Naive (per-scene threshold, no filters)", evaluation.naive, false],
    ["M8 (event threshold + region growing + filters)", evaluation.m8, true],
  ] as const;
  return (
    <CardSection title="Accuracy on this scene vs expert labels" testid="scene-eval">
      <Scroller testid="scene-eval-scroll">
        <table className="w-full min-w-[480px] text-body">
          <thead>
            <tr className="text-left text-tiny text-muted">
              <th className="py-s4 pr-s8 font-semibold">Method</th><th className="px-s8 font-semibold">IoU</th><th className="px-s8 font-semibold">Precision</th>
              <th className="px-s8 font-semibold">Recall</th><th className="px-s8 font-semibold">False-alarm pixels</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, m, ours]) => (
              <tr key={label} className={`border-t border-line ${ours ? "bg-accent-soft font-semibold text-fg" : "text-secondary"}`}>
                <td className="py-s8 pr-s8">{label}</td><td className="px-s8">{m.iou}</td><td className="px-s8">{m.precision}</td>
                <td className="px-s8">{m.recall}</td><td className="px-s8">{num(m.fp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Scroller>
      <p className="mt-s8 text-tiny text-muted">{evaluation.against}. Thresholds were fitted without labels.</p>
    </CardSection>
  );
}
