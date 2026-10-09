import { num } from "../../lib/format";
import { CICell, MetricTable, RowHead, Td } from "./MetricTable";
import {
  RULE, SEASON_CONTROL_ID, seasonControlWhat,
  type Ablation, type Composites, type FalseAlarms, type Levir, type LocScores, type M8Experiments, type M8India, type Oscd, type RadarEvent,
} from "./results";

const f2 = (v: number) => v.toFixed(2);

/** Honest wording for the season-control scene (QA note): its false-alarm figure is an upper bound, not "nothing changed". */
export function SeasonControlNote({ perKm2 }: { perKm2: number }) {
  return (
    <p data-testid="season-control-note" className="mt-s8">
      Season control: {perKm2} per km² after the filter is an <b className="text-fg">upper bound</b>. This is a scene with no large new buildings;
      remaining detections may include real small changes such as road works.
    </p>
  );
}

const M8_METHODS: [string, string][] = [["naive_per_chip_otsu", "Naive (per-chip Otsu, no filters)"], ["m8_threshold", "M8 event threshold + filters"],
  ["m8_hysteresis", "M8 + region growing (default)"], ["m8_learned_gbm", "M8 learned classifier (optional)"]];
const M8_SETS: [string, string][] = [["test", "Test split"], ["bolivia_heldout", "Unseen country (Bolivia)"], ["india_test", "India test chips"]];

/** 1. m8_experiments */
export function M8Block({ exp }: { exp: M8Experiments }) {
  return (
    <MetricTable id="acc-m8" testid="acc-m8" title="Radar flood mode (M8)" heading="Sen1Floods11 official held-out splits: flood-only IoU / precision / recall"
      head={["Method", ...M8_SETS.map(([k, l]) => `${l} (${exp.results?.naive_per_chip_otsu?.[k]?.chips ?? "?"} chips)`)]}
      note="Thresholds fitted from radar only (no labels). Region-growing offsets and the classifier cut-off chosen on the validation split; test, Bolivia and India touched once. Region growing is the default because it generalises to unseen places; the learned classifier wins only on countries it was trained on.">
      {M8_METHODS.map(([k, l]) => (
        <tr key={k} className={k === "m8_hysteresis" ? "font-semibold" : ""}>
          <RowHead className={k === "m8_hysteresis" ? "font-semibold" : ""}>{l}</RowHead>
          {M8_SETS.map(([s]) => {
            const r = exp.results?.[k]?.[s]?.flood_only;
            return <Td key={s} className={k === "m8_hysteresis" ? "font-semibold text-fg" : ""}>{r ? `${f2(r.iou)} / ${f2(r.precision)} / ${f2(r.recall)}` : "–"}</Td>;
          })}
        </tr>
      ))}
    </MetricTable>
  );
}

/** 2. m8_india */
export function IndiaBlock({ india }: { india: M8India }) {
  const n = india.naive_per_chip_otsu.flood_only;
  const m = india.m8.flood_only;
  return (
    <MetricTable id="acc-india" testid="acc-india" title="Assam flood 2016" heading={`All ${india.chips} chips (what the demo shows)`}
      head={["Measure", "Naive", "M8"]}
      note={`Runtime ${india.runtime_s} s for ${india.chips} chips on a laptop CPU.`}>
      <tr><RowHead>Flood IoU</RowHead><Td>{n.iou}</Td><Td className="font-semibold text-fg">{m.iou}</Td></tr>
      <tr><RowHead>Precision</RowHead><Td>{n.precision}</Td><Td className="font-semibold text-fg">{m.precision}</Td></tr>
      <tr><RowHead>Recall</RowHead><Td>{n.recall}</Td><Td>{m.recall}</Td></tr>
      <tr><RowHead>Detections</RowHead><Td>{num(india.raw_blobs_naive)}</Td><Td className="font-semibold text-fg">{num(india.polygons_m8)}</Td></tr>
    </MetricTable>
  );
}

/** 3. false_alarms */
export function FalseAlarmsBlock({ fa }: { fa: FalseAlarms }) {
  const control = fa.scenes.find((s) => s.id === SEASON_CONTROL_ID);
  return (
    <MetricTable id="acc-false-alarms" testid="acc-false-alarms" title="Optical change" heading="False alarms per km², filter off vs on"
      head={["Scene", "Area", "Raw detections", "After filter", "Raw / km²", "After / km²"]}
      note={<>
        {fa.scenes.some((s) => s.note) && <p>{fa.scenes.find((s) => s.note)?.note}</p>}
        {control && <SeasonControlNote perKm2={control.kept_per_km2} />}
      </>}>
      {fa.scenes.map((s) => (
        <tr key={s.id}>
          <RowHead>{s.name}</RowHead><Td>{s.area_km2} km²</Td><Td>{num(s.raw)}</Td><Td>{num(s.kept)}</Td><Td>{s.raw_per_km2}</Td><Td className="font-semibold text-fg">{s.kept_per_km2}</Td>
        </tr>
      ))}
    </MetricTable>
  );
}

/** 4. ablation */
export function AblationBlock({ ab }: { ab: Ablation }) {
  const ids = Object.keys(ab.scenes);
  if (!ids.length) return null;
  return (
    <MetricTable id="acc-ablation" testid="acc-ablation" title="Ablation" heading="Polygons reported as each false-alarm rule is added (encroachment preset)"
      head={["Scene", ...ab.scenes[ids[0]].cumulative.map((c) => (c.added ? `+ ${RULE[c.added] ?? c.added}` : "No rules"))]}
      note={<>
        Left out one at a time from the full chain, extra polygons: {Object.entries(ab.scenes).map(([id, sc]) => `${id}: ${sc.leave_one_out.map((l) => `${RULE[l.without] ?? l.without} +${l.extra_vs_full}`).join(", ")}`).join(" · ")}.
        {" "}The preset-type and speckle rules do almost all the work. On these clear scenes the cloud, seasonal and minimum-area rules remove nothing extra once those two run; we keep them as cheap safeguards for cloudy or noisier inputs, and say so rather than claim credit.
      </>}>
      {Object.entries(ab.scenes).map(([id, sc]) => (
        <tr key={id}><RowHead>{id}</RowHead>{sc.cumulative.map((c) => <Td key={c.added ?? "none"}>{num(c.polygons)}</Td>)}</tr>
      ))}
    </MetricTable>
  );
}

const OSCD_METHODS = [["naive", "Naive (subtract + Otsu)"], ["spectral", "Spectral engine (rules + false-alarm filters)"], ["learned", "Learned Siamese U-Net (PyTorch, ONNX)"]] as const;

/** 5. oscd, with CI bars */
export function OscdBlock({ oscd }: { oscd: Oscd }) {
  return (
    <MetricTable id="acc-oscd" testid="acc-oscd" title="Optical change (Sentinel-2): OSCD"
      heading={`${oscd.split.test_cities} held-out test locations, 95% intervals over locations`}
      head={["Method", "F1", "IoU", "Precision", "Recall"]}
      note={<>
        <p>
          The learned model was chosen on validation locations and scored on the test locations once; it wins the pre-set rule (better test F1 than spectral)
          {oscd.ece != null ? `, calibration error ${oscd.ece}` : ""}. Intervals overlap, so read this as better on average, not clearly better. The spectral engine trades recall for few
          false alarms, which F1 punishes.
        </p>
        <p className="mt-s8 text-muted">Each bar shows the value (dot) and its 95% interval (line) on a scale from 0 to 1; the numbers are written beside it.</p>
      </>}>
      {OSCD_METHODS.map(([k, l]) => oscd.methods?.[k] && (
        <tr key={k}>
          <RowHead className={k === oscd.default_method ? "font-semibold" : ""}>{l}{k === oscd.default_method ? " (gate winner)" : ""}</RowHead>
          <CICell ci={oscd.methods[k].f1} label={`${l} F1`} strong={k === oscd.default_method} />
          <CICell ci={oscd.methods[k].iou} label={`${l} IoU`} />
          <CICell ci={oscd.methods[k].precision} label={`${l} precision`} />
          <CICell ci={oscd.methods[k].recall} label={`${l} recall`} />
        </tr>
      ))}
    </MetricTable>
  );
}

/** 6. oscd.per_location */
export function PerLocationBlock({ pl }: { pl: NonNullable<Oscd["per_location"]> }) {
  const weak = pl.summary?.learned_weak_locations_f1_below_0_25;
  return (
    <MetricTable testid="acc-oscd-locations" title="OSCD per location" heading="Where it works and where it does not"
      head={["Location", "Region", "Naive F1", "Spectral F1", "Learned F1", "Learned P / R"]}
      note={<>
        {pl.claim}. {pl.summary?.learned_beats_spectral != null && `Learned beats spectral in ${pl.summary.learned_beats_spectral} of ${pl.n_locations} locations`}
        {weak?.length ? `, and is weak (F1 below 0.25) in ${weak.join(", ")}` : ""}.
        {" "}Spectral beats naive in only {pl.summary?.spectral_beats_naive} of {pl.n_locations} on F1: its job is fewer false alarms, not higher F1. One tile per location, so no interval per row.
      </>}>
      {Object.entries(pl.locations).sort((a, b) => (b[1].learned as LocScores).f1 - (a[1].learned as LocScores).f1).map(([c, r]) => {
        const l = r.learned as LocScores;
        const isWeak = l.f1 < 0.25;
        return (
          <tr key={c}>
            <RowHead>{c}</RowHead><Td>{r.region}</Td><Td>{f2((r.naive as LocScores).f1)}</Td><Td>{f2((r.spectral as LocScores).f1)}</Td>
            <Td className={isWeak ? "font-semibold text-danger" : "font-semibold text-fg"}>{f2(l.f1)}{isWeak && <span className="ml-1 text-tiny">▼ weak</span>}</Td>
            <Td>{f2(l.precision)} / {f2(l.recall)}</Td>
          </tr>
        );
      })}
    </MetricTable>
  );
}

/** 7. levir, with CI bars */
export function LevirBlock({ levir }: { levir: Levir }) {
  return (
    <MetricTable id="acc-levir" testid="acc-levir" title="High-resolution mode (BIT)" heading={`LEVIR-CD, ${levir.scope}`}
      head={["Method", "F1", "IoU"]}
      note={<>Status: <b className="text-fg">{levir.note}</b>. LEVIR-CD is academic use only; imagery follows Google Earth terms. The demo tile's coordinates are placeholders.</>}>
      <tr>
        <RowHead className="font-semibold">BIT (authors' weights)</RowHead>
        <CICell ci={levir.bit.f1} label="BIT F1" strong /><CICell ci={levir.bit.iou} label="BIT IoU" strong />
      </tr>
      <tr>
        <RowHead>Naive (histogram match + Otsu)</RowHead>
        <CICell ci={levir.naive.f1} label="Naive F1" /><CICell ci={levir.naive.iou} label="Naive IoU" />
      </tr>
      <tr className="text-muted">
        <RowHead className="text-muted">Published BIT result (quoted)</RowHead><Td className="text-muted">{f2(levir.published_bit.f1)}</Td><Td className="text-muted">{f2(levir.published_bit.iou)}</Td>
      </tr>
    </MetricTable>
  );
}

const VARIANT_LABEL: Record<string, string> = { single: "Single clearest image", composite3: "Median of 3 images", persistence2: "Persistence (2 images)", "composite3+persistence2": "Median of 3 + persistence" };

/** 8. composites / persistence, only when the results file has them */
export function CompositesBlock({ composites }: { composites: Composites }) {
  const rows = Object.entries(composites.areas).flatMap(([area, a]) => {
    const base = a.variants.single?.changed_ha;
    return Object.entries(a.variants).map(([v, x]) => ({ area, note: a.note, v, x, delta: base && v !== "single" ? ((x.changed_ha - base) / base) * 100 : null }));
  });
  if (!rows.length) return null;
  return (
    <MetricTable id="acc-composites" testid="acc-composites" title="Composites and persistence (optional filters)" heading="Do more images per date reduce false alarms?"
      head={["Area", "Variant", "Raw", "After filter", "Changed (ha)", "Detections / km²", "Changed area vs single"]}
      note="Measured on one test area each, so this is a measurement, not a guarantee. Persistence removes some false alarms and also some real changed area, which is why it is off by default.">
      {rows.map(({ area, v, x, delta }) => (
        <tr key={`${area}-${v}`}>
          <RowHead>{area}</RowHead><Td>{VARIANT_LABEL[v] ?? v}</Td><Td>{num(x.raw_detections)}</Td><Td>{num(x.after_filter)}</Td>
          <Td>{x.changed_ha}</Td><Td>{x.detections_per_km2}</Td><Td>{delta == null ? "–" : `${delta > 0 ? "+" : ""}${delta.toFixed(0)}%`}</Td>
        </tr>
      ))}
    </MetricTable>
  );
}

/** extra: learned vs spectral false alarms on the demo scenes */
export function LearnedFaBlock({ fab }: { fab: NonNullable<Oscd["false_alarms_by_variant"]> }) {
  const control = fab.scenes[SEASON_CONTROL_ID];
  return (
    <MetricTable testid="acc-learned-fa" title="False alarms" heading="False alarms per km² on our demo scenes: spectral vs learned"
      head={["Scene", "Area", "Spectral", "Learned", "Hybrid"]}
      note={<>
        <p>{fab.finding}</p>
        {control && <SeasonControlNote perKm2={control.per_km2.spectral} />}
      </>}>
      {Object.entries(fab.scenes).map(([id, sc]) => {
        const flag = id === SEASON_CONTROL_ID;
        return (
          <tr key={id}>
            <RowHead>{id} <span className="text-tiny text-muted">({seasonControlWhat(id, sc.what)})</span></RowHead>
            <Td>{sc.area_km2} km²</Td><Td>{sc.per_km2.spectral}</Td>
            <Td className={flag ? "font-semibold text-danger" : ""}>{flag && <span aria-hidden="true">▲ </span>}{sc.per_km2.learned}{flag && <span className="sr-only"> (much higher than spectral)</span>}</Td>
            <Td>{sc.per_km2.hybrid}</Td>
          </tr>
        );
      })}
    </MetricTable>
  );
}

/** extra: seed and loss-weight study */
export function VariantStudyBlock({ vs }: { vs: NonNullable<Oscd["variant_study"]> }) {
  return (
    <MetricTable testid="acc-variant-study" title="Seed and loss-weight study" heading={`Validation locations only, ${vs.seeds.length} seeds`}
      head={["Variant (weight cap)", "Validation F1", "Precision", "Recall", "Farmland polygons / km²"]}
      note={`${vs.note}. Mean ± standard deviation over seeds.`}>
      {Object.entries(vs.variants).map(([name, v]) => {
        const f = (k: string) => (v.summary[k] ? `${v.summary[k]!.mean.toFixed(2)} ± ${v.summary[k]!.sd.toFixed(2)}` : "–");
        return <tr key={name}><RowHead>{name}</RowHead><Td>{f("pipeline_f1")}</Td><Td>{f("pipeline_precision")}</Td><Td>{f("pipeline_recall")}</Td><Td>{f("farmland_polygons_per_km2")}</Td></tr>;
      })}
    </MetricTable>
  );
}

/** extra: radar before/after on real events */
export function RadarEventsBlock({ events }: { events: RadarEvent[] }) {
  return (
    <MetricTable testid="acc-radar-events" title="Radar before/after on real events" heading="No hand labels, so no IoU"
      head={["Event", "Source", "New water (before/after)", "Single-date", "Dry-season false alarms: before/after", "Single-date"]}
      note={<>
        The dry-season reference removes almost all the area single-date mapping flags on a flood-free scene. "New water" means water beyond the normal river, so it is smaller than the total.
        The flood extent itself is plausible but not checked against an independent map.
      </>}>
      {events.map((e) => (
        <tr key={e.event}>
          <RowHead>{e.event}</RowHead><Td>{e.source}</Td><Td className="font-semibold text-fg">{e.before_after.flooded_km2} km²</Td><Td>{e.single_date.flooded_km2} km²</Td>
          <Td className="font-semibold text-fg">{e.dry_season_pair ? `${e.dry_season_pair.false_alarm_km2} km² (${e.dry_season_pair.false_alarm_polygons} polygons)` : "–"}</Td>
          <Td>{e.dry_season_pair ? `${e.dry_season_pair.single_date_km2} km² (${e.dry_season_pair.single_date_polygons} polygons)` : "–"}</Td>
        </tr>
      ))}
    </MetricTable>
  );
}
