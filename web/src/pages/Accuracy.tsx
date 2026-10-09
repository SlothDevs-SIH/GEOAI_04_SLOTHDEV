import { useEffect, useState } from "react";
import { Card } from "../components/panel/Panels";
import { loadMetrics, type Metrics } from "../lib/api";
import { num } from "../lib/format";

type Row = { iou: number; precision: number; recall: number };
type Split = { flood_only: Row; chips: number };

export default function Accuracy() {
  const [m, setM] = useState<Metrics>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    loadMetrics().then(setM).catch((e: Error) => setError(e.message));
  }, []);
  if (error) return <p className="p-6 text-red-700">Could not load the measured results ({error}).</p>;
  if (!m) return <p className="p-6 text-slate-500">Loading results…</p>;
  const exp = m.m8_experiments as { results: Record<string, Record<string, Split>>; split_sizes: Record<string, number> } | undefined;
  const india = m.m8_india as { m8: { flood_only: Row }; naive_per_chip_otsu: { flood_only: Row }; raw_blobs_naive: number; polygons_m8: number; chips: number; runtime_s: number } | undefined;
  const fa = m.false_alarms as { scenes: { id: string; name: string; area_km2: number; raw: number; kept: number; raw_per_km2: number; kept_per_km2: number; note: string }[] } | undefined;
  const methods: [string, string][] = [["naive_per_chip_otsu", "Naive (per-chip Otsu, no filters)"], ["m8_threshold", "M8 event threshold + filters"],
    ["m8_hysteresis", "M8 + region growing (default)"], ["m8_learned_gbm", "M8 learned classifier (optional)"]];
  const sets: [string, string][] = [["test", "Test split"], ["bolivia_heldout", "Unseen country (Bolivia)"], ["india_test", "India test chips"]];
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Measured accuracy</h1>
      <p className="text-slate-600">Every number here comes from a results file in the repository (<code>eval/results/</code>), produced by a script anyone can rerun. Nothing is estimated.</p>
      {exp && (
        <Card title="Radar flood mode (M8): Sen1Floods11 official held-out splits, flood-only IoU / precision / recall" testid="acc-m8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th>Method</th>{sets.map(([k, l]) => <th key={k}>{l} ({exp.results.naive_per_chip_otsu[k]?.chips} chips)</th>)}</tr></thead>
              <tbody>
                {methods.map(([k, l]) => (
                  <tr key={k} className={`border-t border-slate-100 ${k === "m8_hysteresis" ? "font-semibold" : ""}`}>
                    <td>{l}</td>
                    {sets.map(([s]) => {
                      const r = exp.results[k]?.[s]?.flood_only;
                      return <td key={s} className="tabular-nums">{r ? `${r.iou.toFixed(2)} / ${r.precision.toFixed(2)} / ${r.recall.toFixed(2)}` : "–"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">Thresholds fitted from radar only (no labels). Region-growing offsets and the classifier cut-off chosen on the validation split; test, Bolivia and India touched once. Region growing is the default because it generalises to unseen places; the learned classifier wins only on countries it was trained on.</p>
        </Card>
      )}
      {india && (
        <Card title={`Assam flood 2016, all ${india.chips} chips (what the demo shows)`} testid="acc-india">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th></th><th>Naive</th><th>M8</th></tr></thead>
            <tbody>
              <tr><td>Flood IoU</td><td>{india.naive_per_chip_otsu.flood_only.iou}</td><td className="font-semibold">{india.m8.flood_only.iou}</td></tr>
              <tr><td>Precision</td><td>{india.naive_per_chip_otsu.flood_only.precision}</td><td className="font-semibold">{india.m8.flood_only.precision}</td></tr>
              <tr><td>Recall</td><td>{india.naive_per_chip_otsu.flood_only.recall}</td><td>{india.m8.flood_only.recall}</td></tr>
              <tr><td>Detections</td><td>{num(india.raw_blobs_naive)}</td><td className="font-semibold">{num(india.polygons_m8)}</td></tr>
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-500">Runtime {india.runtime_s} s for {india.chips} chips on a laptop CPU.</p>
        </Card>
      )}
      {fa && (
        <Card title="Optical change: false alarms per km², filter off vs on" testid="acc-false-alarms">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th>Scene</th><th>Area</th><th>Raw detections</th><th>After filter</th><th>Raw / km²</th><th>After / km²</th></tr></thead>
            <tbody>
              {fa.scenes.map((s) => (
                <tr key={s.id} className="border-t border-slate-100"><td>{s.name}</td><td>{s.area_km2} km²</td><td>{num(s.raw)}</td><td>{num(s.kept)}</td><td>{s.raw_per_km2}</td><td className="font-semibold">{s.kept_per_km2}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-500">{fa.scenes.find((s) => s.note)?.note}</p>
        </Card>
      )}
      <Card title="Not measured yet (said plainly)">
        <ul className="list-disc pl-4 text-sm text-slate-600">
          <li>Optical change accuracy against labels (OSCD test cities): the OSCD download host is blocked in our build environment; the training track is pending.</li>
          <li>M8 before/after radar change detection and the 2026 test on NASA OPERA RTC-S1 data.</li>
        </ul>
      </Card>
    </div>
  );
}
