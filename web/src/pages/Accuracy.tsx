import { useEffect, useState } from "react";
import { Card } from "../components/panel/Panels";
import { loadMetrics, type Metrics } from "../lib/api";
import { num } from "../lib/format";

const RULE: Record<string, string> = { cloud: "cloud mask", seasonal: "seasonal", preset: "preset types", speckle: "speckle", min_area: "min area" };

type Row = { iou: number; precision: number; recall: number };
type CI = { value: number; ci95: [number, number] };
type Scores = { precision: CI; recall: CI; f1: CI; iou: CI };
type LocScores = { f1: number; precision: number; recall: number; iou: number };
const ci = (x?: CI) => (x ? `${x.value.toFixed(2)} [${x.ci95[0].toFixed(2)}, ${x.ci95[1].toFixed(2)}]` : "–");
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
  const ab = m.ablation as { scenes: Record<string, { cumulative: { added: string | null; polygons: number; per_km2: number }[]; leave_one_out: { without: string; extra_vs_full: number }[] }> } | undefined;
  const oscd = m.oscd as {
    methods: Record<string, Scores>; default_method: string; ece: number | null; learned_trained: boolean; bootstrap: string;
    split: { test_cities: number };
    per_location?: { locations: Record<string, { region: string } & Record<string, LocScores | string>>; n_locations: number; claim: string;
      summary?: { learned_beats_spectral?: number; learned_beats_naive?: number; spectral_beats_naive: number; learned_weak_locations_f1_below_0_25?: string[] } };
    false_alarms_by_variant?: { scenes: Record<string, { what: string; area_km2: number; per_km2: Record<string, number> }>; finding: string };
    variant_study?: { split: string; seeds: number[]; note: string;
      variants: Record<string, { pos_weight_cap: number; summary: Record<string, { mean: number; sd: number; n: number } | null> }> };
  } | undefined;
  const levir = m.levir as { bit: Scores; naive: { f1: CI; iou: CI }; images: number; scope: string; note: string; published_bit: { f1: number; iou: number } } | undefined;
  const events = (m.m8_change as { events: { event: string; source: string; area_km2: number; before_after: { polygons: number; flooded_km2: number };
    single_date: { polygons: number; flooded_km2: number }; dry_season_pair?: { false_alarm_km2: number; false_alarm_polygons: number; single_date_km2: number; single_date_polygons: number } }[] } | undefined)?.events;
  const notMeasured = (m.not_measured as string[] | undefined) ?? [];
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
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th></th><th>Naive</th><th>M8</th></tr></thead>
            <tbody>
              <tr><td>Flood IoU</td><td>{india.naive_per_chip_otsu.flood_only.iou}</td><td className="font-semibold">{india.m8.flood_only.iou}</td></tr>
              <tr><td>Precision</td><td>{india.naive_per_chip_otsu.flood_only.precision}</td><td className="font-semibold">{india.m8.flood_only.precision}</td></tr>
              <tr><td>Recall</td><td>{india.naive_per_chip_otsu.flood_only.recall}</td><td>{india.m8.flood_only.recall}</td></tr>
              <tr><td>Detections</td><td>{num(india.raw_blobs_naive)}</td><td className="font-semibold">{num(india.polygons_m8)}</td></tr>
            </tbody>
          </table></div>
          <p className="mt-1 text-xs text-slate-500">Runtime {india.runtime_s} s for {india.chips} chips on a laptop CPU.</p>
        </Card>
      )}
      {fa && (
        <Card title="Optical change: false alarms per km², filter off vs on" testid="acc-false-alarms">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th>Scene</th><th>Area</th><th>Raw detections</th><th>After filter</th><th>Raw / km²</th><th>After / km²</th></tr></thead>
            <tbody>
              {fa.scenes.map((s) => (
                <tr key={s.id} className="border-t border-slate-100"><td>{s.name}</td><td>{s.area_km2} km²</td><td>{num(s.raw)}</td><td>{num(s.kept)}</td><td>{s.raw_per_km2}</td><td className="font-semibold">{s.kept_per_km2}</td></tr>
              ))}
            </tbody>
          </table></div>
          <p className="mt-1 text-xs text-slate-500">{fa.scenes.find((s) => s.note)?.note}</p>
        </Card>
      )}
      {ab && (
        <Card title="Ablation: polygons reported as each false-alarm rule is added (encroachment preset)" testid="acc-ablation">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th>Scene</th>{ab.scenes[Object.keys(ab.scenes)[0]].cumulative.map((c) => <th key={c.added ?? "none"}>{c.added ? `+ ${RULE[c.added] ?? c.added}` : "No rules"}</th>)}</tr></thead>
              <tbody>
                {Object.entries(ab.scenes).map(([id, sc]) => (
                  <tr key={id} className="border-t border-slate-100"><td>{id}</td>{sc.cumulative.map((c) => <td key={c.added ?? "none"}>{num(c.polygons)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Left out one at a time from the full chain, extra polygons: {Object.entries(ab.scenes).map(([id, sc]) => `${id}: ${sc.leave_one_out.map((l) => `${RULE[l.without] ?? l.without} +${l.extra_vs_full}`).join(", ")}`).join(" · ")}.
            The preset-type and speckle rules do almost all the work. On these clear scenes the cloud, seasonal and minimum-area rules remove nothing extra once those two run; we keep them as cheap safeguards for cloudy or noisier inputs, and say so rather than claim credit.
          </p>
        </Card>
      )}
      {oscd && (
        <Card title={`Optical change (Sentinel-2): OSCD, ${oscd.split.test_cities} held-out test locations, 95% intervals over locations`} testid="acc-oscd">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th>Method</th><th>F1</th><th>IoU</th><th>Precision</th><th>Recall</th></tr></thead>
              <tbody>
                {([["naive", "Naive (subtract + Otsu)"], ["spectral", "Spectral engine (rules + false-alarm filters)"], ["learned", "Learned Siamese U-Net (PyTorch, ONNX)"]] as const).map(([k, l]) => oscd.methods[k] && (
                  <tr key={k} className={`border-t border-slate-100 ${k === oscd.default_method ? "font-semibold" : ""}`}>
                    <td>{l}{k === oscd.default_method ? " (gate winner)" : ""}</td><td>{ci(oscd.methods[k].f1)}</td><td>{ci(oscd.methods[k].iou)}</td><td>{ci(oscd.methods[k].precision)}</td><td>{ci(oscd.methods[k].recall)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            The learned model was chosen on validation locations and scored on the test locations once; it wins the pre-set rule (better test F1 than spectral)
            {oscd.ece != null ? `, calibration error ${oscd.ece}` : ""}. Intervals overlap, so read this as better on average, not clearly better. The spectral engine trades recall for few
            false alarms, which F1 punishes.
          </p>
        </Card>
      )}
      {oscd?.per_location && (
        <Card title="OSCD per location: where it works and where it does not" testid="acc-oscd-locations">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th>Location</th><th>Region</th><th>Naive F1</th><th>Spectral F1</th><th>Learned F1</th><th>Learned P / R</th></tr></thead>
              <tbody>
                {Object.entries(oscd.per_location.locations).sort((a, b) => (b[1].learned as LocScores).f1 - (a[1].learned as LocScores).f1).map(([c, r]) => {
                  const l = r.learned as LocScores;
                  return (
                    <tr key={c} className="border-t border-slate-100">
                      <td>{c}</td><td>{r.region}</td><td>{(r.naive as LocScores).f1.toFixed(2)}</td><td>{(r.spectral as LocScores).f1.toFixed(2)}</td>
                      <td className={l.f1 < 0.25 ? "font-semibold text-red-700" : "font-semibold"}>{l.f1.toFixed(2)}</td><td>{l.precision.toFixed(2)} / {l.recall.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {oscd.per_location.claim}. {oscd.per_location.summary?.learned_beats_spectral != null && `Learned beats spectral in ${oscd.per_location.summary.learned_beats_spectral} of ${oscd.per_location.n_locations} locations`}
            {oscd.per_location.summary?.learned_weak_locations_f1_below_0_25?.length ? `, and is weak (F1 below 0.25) in ${oscd.per_location.summary.learned_weak_locations_f1_below_0_25.join(", ")}` : ""}.
            Spectral beats naive in only {oscd.per_location.summary?.spectral_beats_naive} of {oscd.per_location.n_locations} on F1: its job is fewer false alarms, not higher F1. One tile per location, so no interval per row.
          </p>
        </Card>
      )}
      {oscd?.false_alarms_by_variant && (
        <Card title="False alarms per km² on our demo scenes: spectral vs learned" testid="acc-learned-fa">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th>Scene</th><th>Area</th><th>Spectral</th><th>Learned</th><th>Hybrid</th></tr></thead>
            <tbody>
              {Object.entries(oscd.false_alarms_by_variant.scenes).map(([id, sc]) => (
                <tr key={id} className="border-t border-slate-100"><td>{id} <span className="text-xs text-slate-500">({sc.what})</span></td><td>{sc.area_km2} km²</td>
                  <td>{sc.per_km2.spectral}</td><td className={id === "season-control" ? "font-semibold text-red-700" : ""}>{sc.per_km2.learned}</td><td>{sc.per_km2.hybrid}</td></tr>
              ))}
            </tbody>
          </table></div>
          <p className="mt-1 text-xs text-slate-600">{oscd.false_alarms_by_variant.finding}</p>
        </Card>
      )}
      {oscd?.variant_study && (
        <Card title={`Seed and loss-weight study (validation locations only, ${oscd.variant_study.seeds.length} seeds)`} testid="acc-variant-study">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th>Variant (weight cap)</th><th>Validation F1</th><th>Precision</th><th>Recall</th><th>Farmland polygons / km²</th></tr></thead>
              <tbody>
                {Object.entries(oscd.variant_study.variants).map(([name, v]) => {
                  const f = (k: string) => (v.summary[k] ? `${v.summary[k]!.mean.toFixed(2)} ± ${v.summary[k]!.sd.toFixed(2)}` : "–");
                  return <tr key={name} className="border-t border-slate-100"><td>{name}</td><td>{f("pipeline_f1")}</td><td>{f("pipeline_precision")}</td><td>{f("pipeline_recall")}</td><td>{f("farmland_polygons_per_km2")}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-slate-600">{oscd.variant_study.note}. Mean ± standard deviation over seeds.</p>
        </Card>
      )}
      {levir && (
        <Card title={`High-resolution mode (BIT): LEVIR-CD, ${levir.scope}`} testid="acc-levir">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th>Method</th><th>F1</th><th>IoU</th></tr></thead>
            <tbody>
              <tr className="border-t border-slate-100 font-semibold"><td>BIT (authors' weights)</td><td>{ci(levir.bit.f1)}</td><td>{ci(levir.bit.iou)}</td></tr>
              <tr className="border-t border-slate-100"><td>Naive (histogram match + Otsu)</td><td>{ci(levir.naive.f1)}</td><td>{ci(levir.naive.iou)}</td></tr>
              <tr className="border-t border-slate-100 text-slate-500"><td>Published BIT result (quoted)</td><td>{levir.published_bit.f1.toFixed(2)}</td><td>{levir.published_bit.iou.toFixed(2)}</td></tr>
            </tbody>
          </table></div>
          <p className="mt-1 text-xs text-slate-600">Status: <b>{levir.note}</b>. LEVIR-CD is academic use only; imagery follows Google Earth terms. The demo tile's coordinates are placeholders.</p>
        </Card>
      )}
      {events && events.length > 0 && (
        <Card title="Radar before/after on real events (no hand labels, so no IoU)" testid="acc-radar-events">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th>Event</th><th>Source</th><th>New water (before/after)</th><th>Single-date</th><th>Dry-season false alarms: before/after</th><th>Single-date</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.event} className="border-t border-slate-100"><td>{e.event}</td><td>{e.source}</td><td className="font-semibold">{e.before_after.flooded_km2} km²</td><td>{e.single_date.flooded_km2} km²</td>
                  <td className="font-semibold">{e.dry_season_pair ? `${e.dry_season_pair.false_alarm_km2} km² (${e.dry_season_pair.false_alarm_polygons} polygons)` : "–"}</td>
                  <td>{e.dry_season_pair ? `${e.dry_season_pair.single_date_km2} km² (${e.dry_season_pair.single_date_polygons} polygons)` : "–"}</td></tr>
              ))}
            </tbody>
          </table></div>
          <p className="mt-1 text-xs text-slate-600">
            The dry-season reference removes almost all the area single-date mapping flags on a flood-free scene. "New water" means water beyond the normal river, so it is smaller than the total.
            The flood extent itself is plausible but not checked against an independent map.
          </p>
        </Card>
      )}
      <Card title="Not measured yet (said plainly)" testid="acc-not-measured">
        {notMeasured.length ? (
          <ul className="list-disc pl-4 text-sm text-slate-600">{notMeasured.map((x) => <li key={x}>{x}</li>)}</ul>
        ) : (
          <p className="text-sm text-slate-600">Nothing outstanding in the results file.</p>
        )}
      </Card>
    </div>
  );
}
