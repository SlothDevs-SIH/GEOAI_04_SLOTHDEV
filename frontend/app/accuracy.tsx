import { View } from "react-native";
import { MetricTable, type Row } from "../components/accuracy/MetricTable";
import { NotMeasuredList } from "../components/accuracy/NotMeasuredList";
import { ScreenScroll } from "../components/layout/Screen";
import { ErrorState } from "../components/ui/Alerts";
import { Skeleton } from "../components/ui/Skeleton";
import { Txt } from "../components/ui/Txt";
import { useMetrics } from "../hooks/useData";
import { num } from "../lib/format";
import { space } from "../theme/tokens";

const RULE: Record<string, string> = { cloud: "cloud mask", seasonal: "seasonal", preset: "preset types", speckle: "speckle", min_area: "min area" };

type R3 = { iou: number; precision: number; recall: number };
type CI = { value: number; ci95: [number, number] };
type Scores = { precision: CI; recall: CI; f1: CI; iou: CI };
type LocScores = { f1: number; precision: number; recall: number; iou: number };
const ci = (x?: CI) => (x ? `${x.value.toFixed(2)} [${x.ci95[0].toFixed(2)}, ${x.ci95[1].toFixed(2)}]` : "–");
type Split = { flood_only: R3; chips: number };

export default function Accuracy() {
  const { data: m, error, retry } = useMetrics();
  if (error) return <ScreenScroll><ErrorState message={`Could not load the measured results (${error}).`} onRetry={retry} /></ScreenScroll>;
  if (!m) return <ScreenScroll><View testID="table-skeleton" style={{ gap: space[3] }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={28} />)}</View></ScreenScroll>;

  const exp = m.m8_experiments as { results: Record<string, Record<string, Split>> } | undefined;
  const india = m.m8_india as { m8: { flood_only: R3 }; naive_per_chip_otsu: { flood_only: R3 }; raw_blobs_naive: number; polygons_m8: number; chips: number; runtime_s: number } | undefined;
  const fa = m.false_alarms as { scenes: { id: string; name: string; area_km2: number; raw: number; kept: number; raw_per_km2: number; kept_per_km2: number; note: string }[] } | undefined;
  const ab = m.ablation as { scenes: Record<string, { cumulative: { added: string | null; polygons: number }[]; leave_one_out: { without: string; extra_vs_full: number }[] }> } | undefined;
  const oscd = m.oscd as {
    methods: Record<string, Scores>; default_method: string; ece: number | null; split: { test_cities: number };
    per_location?: { locations: Record<string, { region: string } & Record<string, LocScores | string>>; n_locations: number; claim: string;
      summary?: { learned_beats_spectral?: number; spectral_beats_naive: number; learned_weak_locations_f1_below_0_25?: string[] } };
    false_alarms_by_variant?: { scenes: Record<string, { what: string; area_km2: number; per_km2: Record<string, number> }>; finding: string };
    variant_study?: { seeds: number[]; note: string; variants: Record<string, { summary: Record<string, { mean: number; sd: number } | null> }> };
  } | undefined;
  const levir = m.levir as { bit: Scores; naive: { f1: CI; iou: CI }; scope: string; note: string; published_bit: { f1: number; iou: number } } | undefined;
  const events = (m.m8_change as { events: { event: string; source: string; before_after: { flooded_km2: number }; single_date: { flooded_km2: number };
    dry_season_pair?: { false_alarm_km2: number; false_alarm_polygons: number; single_date_km2: number; single_date_polygons: number } }[] } | undefined)?.events;
  const notMeasured = (m.not_measured as string[] | undefined) ?? [];

  const methods: [string, string][] = [["naive_per_chip_otsu", "Naive (per-chip Otsu, no filters)"], ["m8_threshold", "M8 event threshold + filters"],
    ["m8_hysteresis", "M8 + region growing (default)"], ["m8_learned_gbm", "M8 learned classifier (optional)"]];
  const sets: [string, string][] = [["test", "Test split"], ["bolivia_heldout", "Unseen country (Bolivia)"], ["india_test", "India test chips"]];
  const oscdNames = [["naive", "Naive (subtract + Otsu)"], ["spectral", "Spectral engine (rules + false-alarm filters)"], ["learned", "Learned Siamese U-Net (PyTorch, ONNX)"]] as const;

  return (
    <ScreenScroll maxWidth={1000}>
      <Txt v="h1" accessibilityRole="header">Measured accuracy</Txt>
      <Txt v="body" tone="secondary">Every number here comes from a results file in the repository (eval/results/), produced by a script anyone can rerun. Nothing is estimated.</Txt>

      {exp && <MetricTable testID="acc-m8" title="Radar flood mode (M8): Sen1Floods11 official held-out splits, flood-only IoU / precision / recall"
        columns={["Method", ...sets.map(([k, l]) => `${l} (${exp.results.naive_per_chip_otsu[k]?.chips} chips)`)]}
        rows={methods.map(([k, l]): Row => ({ key: k, bold: k === "m8_hysteresis", cells: [l, ...sets.map(([s]) => { const r = exp.results[k]?.[s]?.flood_only; return r ? `${r.iou.toFixed(2)} / ${r.precision.toFixed(2)} / ${r.recall.toFixed(2)}` : "–"; })] }))}
        note="Thresholds fitted from radar only (no labels). Region-growing offsets and the classifier cut-off chosen on the validation split; test, Bolivia and India touched once. Region growing is the default because it generalises to unseen places; the learned classifier wins only on countries it was trained on." />}

      {india && <MetricTable testID="acc-india" title={`Assam flood 2016, all ${india.chips} chips (what the demo shows)`} columns={["", "Naive", "M8"]} minWidth={360}
        rows={[
          { key: "iou", cells: ["Flood IoU", String(india.naive_per_chip_otsu.flood_only.iou), { t: String(india.m8.flood_only.iou), bold: true }] },
          { key: "p", cells: ["Precision", String(india.naive_per_chip_otsu.flood_only.precision), { t: String(india.m8.flood_only.precision), bold: true }] },
          { key: "r", cells: ["Recall", String(india.naive_per_chip_otsu.flood_only.recall), String(india.m8.flood_only.recall)] },
          { key: "d", cells: ["Detections", num(india.raw_blobs_naive), { t: num(india.polygons_m8), bold: true }] }]}
        note={`Runtime ${india.runtime_s} s for ${india.chips} chips on a laptop CPU.`} />}

      {fa && <MetricTable testID="acc-false-alarms" title="Optical change: false alarms per km², filter off vs on" columns={["Scene", "Area", "Raw detections", "After filter", "Raw / km²", "After / km²"]}
        rows={fa.scenes.map((s) => ({ key: s.id, cells: [s.name, `${s.area_km2} km²`, num(s.raw), num(s.kept), String(s.raw_per_km2), { t: String(s.kept_per_km2), bold: true }] }))}
        note={fa.scenes.find((s) => s.note)?.note} />}

      {ab && (() => {
        const first = ab.scenes[Object.keys(ab.scenes)[0]];
        return <MetricTable testID="acc-ablation" title="Ablation: polygons reported as each false-alarm rule is added (encroachment preset)" minWidth={620}
          columns={["Scene", ...first.cumulative.map((c) => (c.added ? `+ ${RULE[c.added] ?? c.added}` : "No rules"))]}
          rows={Object.entries(ab.scenes).map(([id, sc]) => ({ key: id, cells: [id, ...sc.cumulative.map((c) => num(c.polygons))] }))}
          note={`Left out one at a time from the full chain, extra polygons: ${Object.entries(ab.scenes).map(([id, sc]) => `${id}: ${sc.leave_one_out.map((l) => `${RULE[l.without] ?? l.without} +${l.extra_vs_full}`).join(", ")}`).join(" · ")}. The preset-type and speckle rules do almost all the work. On these clear scenes the cloud, seasonal and minimum-area rules remove nothing extra once those two run; we keep them as cheap safeguards for cloudy or noisier inputs, and say so rather than claim credit.`} />;
      })()}

      {oscd && <MetricTable testID="acc-oscd" title={`Optical change (Sentinel-2): OSCD, ${oscd.split.test_cities} held-out test locations, 95% intervals over locations`} columns={["Method", "F1", "IoU", "Precision", "Recall"]} minWidth={700} firstWidth={230}
        rows={oscdNames.filter(([k]) => oscd.methods[k]).map(([k, l]) => ({ key: k, bold: k === oscd.default_method,
          cells: [l + (k === oscd.default_method ? " (gate winner)" : ""), ci(oscd.methods[k].f1), ci(oscd.methods[k].iou), ci(oscd.methods[k].precision), ci(oscd.methods[k].recall)] }))}
        note={`The learned model was chosen on validation locations and scored on the test locations once; it wins the pre-set rule (better test F1 than spectral)${oscd.ece != null ? `, calibration error ${oscd.ece}` : ""}. Intervals overlap, so read this as better on average, not clearly better. The spectral engine trades recall for few false alarms, which F1 punishes.`} />}

      {oscd?.per_location && <MetricTable testID="acc-oscd-locations" title="OSCD per location: where it works and where it does not" columns={["Location", "Region", "Naive F1", "Spectral F1", "Learned F1", "Learned P / R"]} minWidth={700}
        rows={Object.entries(oscd.per_location.locations).sort((a, b) => (b[1].learned as LocScores).f1 - (a[1].learned as LocScores).f1).map(([c, r]) => {
          const l = r.learned as LocScores;
          return { key: c, cells: [c, r.region, (r.naive as LocScores).f1.toFixed(2), (r.spectral as LocScores).f1.toFixed(2), { t: l.f1.toFixed(2), bold: true, danger: l.f1 < 0.25 }, `${l.precision.toFixed(2)} / ${l.recall.toFixed(2)}`] };
        })}
        note={`${oscd.per_location.claim}. ${oscd.per_location.summary?.learned_beats_spectral != null ? `Learned beats spectral in ${oscd.per_location.summary.learned_beats_spectral} of ${oscd.per_location.n_locations} locations` : ""}${oscd.per_location.summary?.learned_weak_locations_f1_below_0_25?.length ? `, and is weak (F1 below 0.25) in ${oscd.per_location.summary.learned_weak_locations_f1_below_0_25.join(", ")}` : ""}. Spectral beats naive in only ${oscd.per_location.summary?.spectral_beats_naive} of ${oscd.per_location.n_locations} on F1: its job is fewer false alarms, not higher F1. One tile per location, so no interval per row.`} />}

      {oscd?.false_alarms_by_variant && <MetricTable testID="acc-learned-fa" title="False alarms per km² on our demo scenes: spectral vs learned" columns={["Scene", "Area", "Spectral", "Learned", "Hybrid"]} minWidth={560} firstWidth={230}
        rows={Object.entries(oscd.false_alarms_by_variant.scenes).map(([id, sc]) => ({ key: id,
          cells: [`${id} (${sc.what})`, `${sc.area_km2} km²`, String(sc.per_km2.spectral), { t: String(sc.per_km2.learned), danger: id === "season-control" }, String(sc.per_km2.hybrid)] }))}
        note={oscd.false_alarms_by_variant.finding} />}

      {oscd?.variant_study && <MetricTable testID="acc-variant-study" title={`Seed and loss-weight study (validation locations only, ${oscd.variant_study.seeds.length} seeds)`} columns={["Variant (weight cap)", "Validation F1", "Precision", "Recall", "Farmland polygons / km²"]} minWidth={680}
        rows={Object.entries(oscd.variant_study.variants).map(([name, v]) => {
          const f = (k: string) => (v.summary[k] ? `${v.summary[k]!.mean.toFixed(2)} ± ${v.summary[k]!.sd.toFixed(2)}` : "–");
          return { key: name, cells: [name, f("pipeline_f1"), f("pipeline_precision"), f("pipeline_recall"), f("farmland_polygons_per_km2")] };
        })}
        note={`${oscd.variant_study.note}. Mean ± standard deviation over seeds.`} />}

      {levir && <MetricTable testID="acc-levir" title={`High-resolution mode (BIT): LEVIR-CD, ${levir.scope}`} columns={["Method", "F1", "IoU"]} minWidth={420} firstWidth={220}
        rows={[
          { key: "bit", bold: true, cells: ["BIT (authors' weights)", ci(levir.bit.f1), ci(levir.bit.iou)] },
          { key: "naive", cells: ["Naive (histogram match + Otsu)", ci(levir.naive.f1), ci(levir.naive.iou)] },
          { key: "pub", cells: [{ t: "Published BIT result (quoted)", muted: true }, { t: levir.published_bit.f1.toFixed(2), muted: true }, { t: levir.published_bit.iou.toFixed(2), muted: true }] }]}
        note={`Status: ${levir.note}. LEVIR-CD is academic use only; imagery follows Google Earth terms. The demo tile's coordinates are placeholders.`} />}

      {events && events.length > 0 && <MetricTable testID="acc-radar-events" title="Radar before/after on real events (no hand labels, so no IoU)" minWidth={760}
        columns={["Event", "Source", "New water (before/after)", "Single-date", "Dry-season false alarms: before/after", "Single-date"]}
        rows={events.map((e) => ({ key: e.event, cells: [e.event, e.source, { t: `${e.before_after.flooded_km2} km²`, bold: true }, `${e.single_date.flooded_km2} km²`,
          { t: e.dry_season_pair ? `${e.dry_season_pair.false_alarm_km2} km² (${e.dry_season_pair.false_alarm_polygons} polygons)` : "–", bold: true },
          e.dry_season_pair ? `${e.dry_season_pair.single_date_km2} km² (${e.dry_season_pair.single_date_polygons} polygons)` : "–"] }))}
        note={'The dry-season reference removes almost all the area single-date mapping flags on a flood-free scene. "New water" means water beyond the normal river, so it is smaller than the total. The flood extent itself is plausible but not checked against an independent map.'} />}

      <NotMeasuredList bullets={notMeasured} />
    </ScreenScroll>
  );
}
