import { useCallback, useEffect, useRef, useState } from "react";
import AdvancedAccordion from "../components/analyse/AdvancedAccordion";
import BoxInputs from "../components/analyse/BoxInputs";
import BoxSizeLabel from "../components/analyse/BoxSizeLabel";
import DateField from "../components/analyse/DateField";
import DetectorSelect from "../components/analyse/DetectorSelect";
import FilePickerField from "../components/analyse/FilePickerField";
import { modeAvailability } from "../components/analyse/modes";
import OfflineNotice from "../components/analyse/OfflineNotice";
import PlaceJumpPicker from "../components/analyse/PlaceJumpPicker";
import PresetSelect from "../components/analyse/PresetSelect";
import ProgressStepper from "../components/analyse/ProgressStepper";
import ResultCard, { type JobResult, isRadarResult } from "../components/analyse/ResultCard";
import ScenePickTable from "../components/analyse/ScenePickTable";
import SegmentedTabs, { type Source } from "../components/analyse/SegmentedTabs";
import { HINT } from "../components/analyse/styles";
import ValidationLine from "../components/analyse/ValidationLine";
import AreaPicker from "../components/map/AreaPicker";
import { Button, CardSection, InlineAlert, Skeleton } from "../components/ui/Primitives";
import { useReducedMotion } from "../hooks/motion";
import {
  API_URL, type ApiHealth, type DetectorMode, type FetchPreview, type JobState,
  fetchHealth, fetchPreview, getJob, getJobSummary, startAnalyze, startFetch,
} from "../lib/api";
import { type Box, MIN_DATE, PLACES, boxProblem, dateProblem, todayISO } from "../lib/aoi";
import { useUi } from "../store/ui";

type Net = { state: "checking" } | { state: "online"; health: ApiHealth } | { state: "offline"; configured: boolean };

// Same season on both dates avoids crop changes showing up as change; both dates are in the dry season here.
const DEFAULTS = { before: "2020-01-20", after: "2025-01-20" };
const POLL_MS = 1000;
const MAX_POLL_FAILURES = 3;   // a single dropped request must not end a job that is still running on the server

export default function Analyse() {
  const [net, setNet] = useState<Net>({ state: "checking" });
  const [retrying, setRetrying] = useState(false);
  const [source, setSource] = useState<Source>("area");
  const [preset, setPreset] = useState("encroachment");
  const [modePref, setModePref] = useState<DetectorMode>("spectral");
  const [box, setBox] = useState<Box>();
  const [place, setPlace] = useState<(typeof PLACES)[number]>();
  const [beforeDate, setBeforeDate] = useState(DEFAULTS.before);
  const [afterDate, setAfterDate] = useState(DEFAULTS.after);
  const [composite, setComposite] = useState(1);
  const [persist, setPersist] = useState(false);
  const [pick, setPick] = useState<FetchPreview>();
  const [pickError, setPickError] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [before, setBefore] = useState<File>();
  const [after, setAfter] = useState<File>();
  const [radarFile, setRadarFile] = useState<File>();
  const [job, setJob] = useState<JobState>();
  const [jobId, setJobId] = useState<string>();
  const [result, setResult] = useState<JobResult>();
  const progressCard = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const showToast = useUi((s) => s.showToast);

  const probe = useCallback(async () => {
    const health = await fetchHealth(8000);   // a sleeping free-tier server can take a few seconds to answer
    setNet(health ? { state: "online", health } : { state: "offline", configured: !!API_URL });
  }, []);
  useEffect(() => { void probe(); }, [probe]);
  const retry = async () => {
    setRetrying(true);
    await probe();
    setRetrying(false);
  };

  useEffect(() => {
    if (!jobId) return;
    let fails = 0;
    const t = setInterval(async () => {
      try {
        const j = await getJob(jobId);
        fails = 0;
        setJob(j);
        if (j.status === "done") {
          clearInterval(t);
          setResult(await getJobSummary<JobResult>(jobId));
          showToast("Analysis complete");
        }
        if (j.status === "error") clearInterval(t);
      } catch (e) {
        if (++fails < MAX_POLL_FAILURES) return;
        setJob({ status: "error", error: (e as Error).message });
        clearInterval(t);
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [jobId, showToast]);

  const started = !!job;
  useEffect(() => {
    if (started) progressCard.current?.scrollIntoView?.({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [started, reduced]);

  const online = net.state === "online";
  const health = net.state === "online" ? net.health : undefined;
  // a chosen detector that the server turns out not to have falls back to the default instead of failing later
  const mode: DetectorMode = !online || modeAvailability(health, modePref).available ? modePref : "spectral";

  const problem = boxProblem(box);
  const dProblem = dateProblem(beforeDate, afterDate);
  const datesOk = !dProblem;
  const persistOk = preset !== "flood";   // flood water recedes, so requiring it to persist would remove real change
  const running = job?.status === "running" || job?.status === "queued" || job?.status === "uploading";
  const request = () => ({
    bbox: box as Box, before_date: beforeDate, after_date: afterDate, preset, composite, mode,
    persistence: persist && persistOk ? 2 : 0,
  });

  const reset = () => {
    setJob(undefined);
    setJobId(undefined);
    setResult(undefined);
  };
  const changeInputs = () => { setPick(undefined); setPickError(undefined); };

  const check = async () => {
    if (!box || problem || !datesOk) return;
    setChecking(true);
    changeInputs();
    try {
      setPick(await fetchPreview(request()));
    } catch (e) {
      setPickError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const analyseArea = async () => {
    if (!box || problem || !datesOk) return;
    reset();
    setJob({ status: "queued", stage: "queued" });
    try {
      setJobId((await startFetch(request())).job_id);
    } catch (e) {
      setJob({ status: "error", error: (e as Error).message });
    }
  };

  const submitUpload = async (radar: boolean) => {
    const target = radar ? radarFile : after;
    if (!target || (!radar && !before)) return;
    reset();
    setJob({ status: "uploading" });
    try {
      const r = await startAnalyze({ before: radar ? undefined : before, after: target, preset: radar ? "flood" : preset, mode: radar ? "radar" : mode });
      setJobId(r.job_id);
    } catch (e) {
      setJob({ status: "error", error: (e as Error).message });
    }
  };

  const header = (
    <header className="flex flex-wrap items-start justify-between gap-s12">
      <div className="min-w-0">
        <h1 className="text-h1 text-fg">Analyse any area</h1>
        <p className="mt-s4 max-w-2xl text-body text-secondary">
          Draw a box anywhere in India, pick two dates, and we fetch the clearest Sentinel-2 images and find what really changed. Or upload your own images.
        </p>
      </div>
      {net.state !== "checking" && (
        <span data-testid="api-status" data-online={online} className="inline-flex items-center gap-s8 rounded-xs border border-line px-s8 py-s4 text-micro text-secondary">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${online ? "bg-success" : "bg-muted"}`} />
          {online ? "Analysis server online" : "Analysis server offline"}
        </span>
      )}
    </header>
  );

  if (net.state === "checking") {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-s18 px-s18 py-s26 md:px-s26" aria-busy="true">
        {header}
        <p role="status" className="text-small text-muted">Checking the live analysis service…</p>
        <Skeleton height={48} />
        <div className="grid gap-s18 lg:grid-cols-[minmax(0,1fr)_380px]"><Skeleton height={420} radius={13} /><Skeleton height={420} radius={13} /></div>
      </div>
    );
  }

  const why = !online ? "The analysis server is not reachable, so the action buttons are off for now. You can still draw and check the box."
    : running ? "An analysis is running. Wait for it to finish."
    : undefined;
  const areaWhy = why ?? (!box ? "Draw an area on the map first."
    : problem ? "Fix the area first (see the message under the map)."
    : dProblem ? "Fix the dates first."
    : undefined);
  const areaReady = online && !!box && !problem && datesOk;

  const modePicker = <DetectorSelect value={mode} onChange={setModePref} health={health} preview={!online} />;
  const whyId = "run-why";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-s18 px-s18 py-s26 md:px-s26">
      {header}
      {!online && <OfflineNotice configured={net.state === "offline" && net.configured} retrying={retrying} onRetry={retry} />}

      <SegmentedTabs activeTab={source} onChange={(t) => { setSource(t); reset(); }} />

      {source === "area" && (
        <>
          <div className="grid items-start gap-s18 lg:grid-cols-[minmax(0,1fr)_380px]">
            <CardSection title="1 · Draw the area" testid="card-area">
              <div className="flex min-w-0 flex-col gap-s12">
                <PlaceJumpPicker places={PLACES} selected={place} onSelect={setPlace} />
                <AreaPicker box={box} onChange={(b) => { setBox(b); changeInputs(); }} place={place} />
                <div className="flex flex-wrap items-center justify-between gap-s8">
                  <BoxSizeLabel box={box} />
                  {box && <Button variant="ghost" data-testid="clear-box" onClick={() => { setBox(undefined); changeInputs(); }}>Clear box</Button>}
                </div>
                <ValidationLine problem={problem} drawn={!!box} />
                <BoxInputs box={box} onChange={(b) => { setBox(b); changeInputs(); }} />
              </div>
            </CardSection>

            <CardSection title="2 · Dates and settings" testid="card-params">
              <div className="flex min-w-0 flex-col gap-s18">
                {modePicker}
                <div className="grid gap-s12 sm:grid-cols-2 lg:grid-cols-1">
                  <DateField label="Before date" testid="date-before" value={beforeDate} min={MIN_DATE} max={todayISO()} errorId="date-error"
                    onChange={(v) => { setBeforeDate(v); changeInputs(); }} />
                  <DateField label="After date" testid="date-after" value={afterDate} min={MIN_DATE} max={todayISO()} error={dProblem} errorId="date-error"
                    onChange={(v) => { setAfterDate(v); changeInputs(); }} />
                </div>
                <p className={HINT}>Choose the same time of year for both dates, so growing crops are not mistaken for change. We use the clearest image within about 20 days of each date.</p>
                <PresetSelect value={preset} onChange={setPreset} />
                <AdvancedAccordion composite={composite} onComposite={(n) => { setComposite(n); changeInputs(); }}
                  persistence={persist} onPersistence={setPersist} disabledPersistence={!persistOk} />
                <div className="flex flex-col gap-s8">
                  <div className="flex flex-wrap gap-s12">
                    <Button variant="secondary" data-testid="check-scenes" disabled={!areaReady} loading={checking} onClick={check} aria-describedby={areaWhy ? whyId : undefined}>Check scenes</Button>
                    <Button data-testid="analyse-area" disabled={!areaReady} loading={running} onClick={analyseArea} aria-describedby={areaWhy ? whyId : undefined}>Analyse this area</Button>
                  </div>
                  {areaWhy && <p id={whyId} data-testid="run-why" className={HINT}>{areaWhy}</p>}
                </div>
              </div>
            </CardSection>
          </div>

          <CardSection title="3 · Images that will be used" testid="card-scenes">
            <ScenePickTable preview={pick} loading={checking} error={pickError} />
          </CardSection>
        </>
      )}

      {source === "upload" && (
        <CardSection title="1 · Upload two co-registered GeoTIFFs" testid="card-upload">
          <div className="flex min-w-0 flex-col gap-s18">
            <p className={HINT}>≥ 4 bands incl. NIR, ≥ 5 m pixels. Both files must cover the same place on the same grid.</p>
            <div className="grid gap-s18 sm:grid-cols-2">
              <FilePickerField label="Before image" testid="file-before" file={before} onPick={setBefore} onClear={() => setBefore(undefined)} />
              <FilePickerField label="After image" testid="file-after" file={after} onPick={setAfter} onClear={() => setAfter(undefined)} />
            </div>
            {modePicker}
            <div className="max-w-md"><PresetSelect value={preset} onChange={setPreset} /></div>
            <div className="flex flex-col gap-s8">
              <div><Button data-testid="analyse-upload" disabled={!online || !before || !after || running} loading={running} onClick={() => submitUpload(false)} aria-describedby={whyId}>Analyse</Button></div>
              <p id={whyId} data-testid="run-why" className={HINT}>
                {why ?? (!before || !after ? "Choose both images to continue." : "Ready.")}
              </p>
            </div>
          </div>
        </CardSection>
      )}

      {source === "radar" && (
        <CardSection title="1 · Upload one Sentinel-1 radar image" testid="card-radar">
          <div className="flex min-w-0 flex-col gap-s18">
            <p className={HINT}>GeoTIFF: band 1 = VV in dB, band 2 = VH in dB.</p>
            <div className="max-w-xl">
              <FilePickerField label="Radar image (during the flood)" testid="file-radar" file={radarFile} onPick={setRadarFile} onClear={() => setRadarFile(undefined)} />
            </div>
            <InlineAlert variant="warning" message={<>Radar sees through cloud, so it works in the monsoon. It maps <b>open flood water from one date</b>, not before/after change; flooded crops and streets can be missed.</>} />
            <div className="flex flex-col gap-s8">
              <div><Button data-testid="analyse-radar" disabled={!online || !radarFile || running} loading={running} onClick={() => submitUpload(true)} aria-describedby={whyId}>Map the flood</Button></div>
              <p id={whyId} data-testid="run-why" className={HINT}>
                {why ?? (!radarFile ? "Choose the radar image to continue." : "Ready.")}
              </p>
            </div>
          </div>
        </CardSection>
      )}

      {job && (
        <div ref={progressCard}>
          <CardSection title="Progress" testid="card-progress">
            <div className="flex flex-col gap-s12">
              <ProgressStepper job={job} />
              {job.fetch && (
                <p className="text-tiny text-secondary" data-testid="scenes-used">Used: before {job.fetch.before.date} ({job.fetch.before.scene}) · after {job.fetch.after.date} ({job.fetch.after.scene})</p>
              )}
              {job.warnings?.map((w) => <InlineAlert key={w} variant="warning" message={w} />)}
              {job.error && (
                <div data-testid="job-error" className="flex flex-col items-start gap-s8">
                  <InlineAlert variant="error" message={job.error} />
                  <Button variant="secondary" onClick={reset}>Dismiss</Button>
                </div>
              )}
            </div>
          </CardSection>
        </div>
      )}
      {result && jobId && (
        <CardSection title="Result" testid="analyse-result">
          <ResultCard jobId={jobId} summary={result} isRadar={isRadarResult(result)} />
        </CardSection>
      )}
    </div>
  );
}
