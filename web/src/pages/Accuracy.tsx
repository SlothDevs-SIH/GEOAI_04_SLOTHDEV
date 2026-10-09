import AccuracySkeleton from "../components/accuracy/AccuracySkeleton";
import {
  AblationBlock, CompositesBlock, FalseAlarmsBlock, IndiaBlock, LearnedFaBlock, LevirBlock, M8Block,
  OscdBlock, PerLocationBlock, RadarEventsBlock, VariantStudyBlock,
} from "../components/accuracy/blocks";
import { headlineTiles } from "../components/accuracy/headline";
import HeadlineStrip from "../components/accuracy/HeadlineStrip";
import NotMeasuredList from "../components/accuracy/NotMeasuredList";
import { readResults } from "../components/accuracy/results";
import { useMetrics } from "../components/accuracy/useMetrics";
import { ErrorState } from "../components/ui/Primitives";

/** A4 §4. Every number comes from eval/results.json; a block the file does not have is hidden, never invented. */
export default function Accuracy() {
  const { data, error, loading, retry } = useMetrics();
  const r = data ? readResults(data) : undefined;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-s18 px-s18 py-s26">
      <header>
        <h1 className="text-h1 text-fg">Measured accuracy</h1>
        <p className="mt-s8 max-w-3xl text-body text-secondary">
          Every number here comes from a results file in the repository (<code className="rounded-xs bg-surface-alt px-1 text-small">eval/results/</code>), produced by a script anyone can rerun. Nothing is estimated.
        </p>
      </header>
      {loading && <AccuracySkeleton />}
      {error && <ErrorState message={`Could not load the measured results (${error}).`} onRetry={retry} />}
      {r && (
        <>
          <HeadlineStrip tiles={headlineTiles(r)} />
          {r.exp && <M8Block exp={r.exp} />}
          {r.india && <IndiaBlock india={r.india} />}
          {r.fa && <FalseAlarmsBlock fa={r.fa} />}
          {r.ab && <AblationBlock ab={r.ab} />}
          {r.oscd && <OscdBlock oscd={r.oscd} />}
          {r.oscd?.per_location && <PerLocationBlock pl={r.oscd.per_location} />}
          {r.levir && <LevirBlock levir={r.levir} />}
          {r.composites && <CompositesBlock composites={r.composites} />}
          {r.oscd?.false_alarms_by_variant && <LearnedFaBlock fab={r.oscd.false_alarms_by_variant} />}
          {r.oscd?.variant_study && <VariantStudyBlock vs={r.oscd.variant_study} />}
          {r.events && r.events.length > 0 && <RadarEventsBlock events={r.events} />}
          {r.notMeasured && <NotMeasuredList bullets={r.notMeasured} />}
        </>
      )}
    </div>
  );
}
