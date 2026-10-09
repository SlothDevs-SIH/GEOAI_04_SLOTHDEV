import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AreaPicker from "../components/map/AreaPicker";
import { Card } from "../components/panel/Panels";
import {
  API_URL, type FetchPreview, type JobState, apiHealth, fetchPreview, getJob, getJobSummary, startFetch,
} from "../lib/api";
import { type Box, PLACES, boxProblem, sizeKm } from "../lib/aoi";
import { area, num } from "../lib/format";

type Source = "area" | "upload" | "radar";
type OpticalResult = { raw_detections: number; after_filter: number; total_area_m2: number; by_tier: Record<string, number> };
type RadarResult = { mode: "radar"; after_filter: number; flooded_ha: number; threshold_db: number };
type Result = OpticalResult | RadarResult;
const STAGES = ["queued", "fetching", "detecting", "vectorising", "done"];

const isRadar = (r: Result): r is RadarResult => (r as RadarResult).mode === "radar";

// Same season on both dates avoids crop changes showing up as change; both dates are in the dry season here.
const DEFAULTS = { before: "2020-01-20", after: "2025-01-20" };

export default function Analyse() {
  const [online, setOnline] = useState<boolean>();
  const [source, setSource] = useState<Source>("area");
  const [preset, setPreset] = useState("encroachment");
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
  const [job, setJob] = useState<JobState>();
  const [jobId, setJobId] = useState<string>();
  const [result, setResult] = useState<Result>();
  const [openable, setOpenable] = useState(false);

  useEffect(() => {
    apiHealth().then(setOnline);
  }, []);

  useEffect(() => {
    if (!jobId) return;
    const t = setInterval(async () => {
      try {
        const j = await getJob(jobId);
        setJob(j);
        if (j.status === "done") {
          clearInterval(t);
          setResult(await getJobSummary<Result>(jobId));
        }
        if (j.status === "error") clearInterval(t);
      } catch (e) {
        setJob({ status: "error", error: (e as Error).message });
        clearInterval(t);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [jobId]);

  const problem = boxProblem(box);
  const datesOk = beforeDate < afterDate;
  const persistOk = preset !== "flood";   // flood water recedes, so requiring it to persist would remove real change
  const request = () => ({
    bbox: box as Box, before_date: beforeDate, after_date: afterDate, preset, composite,
    persistence: persist && persistOk ? 2 : 0,
  });

  const reset = () => {
    setJob(undefined);
    setJobId(undefined);
    setResult(undefined);
  };

  const check = async () => {
    if (!box || problem) return;
    setChecking(true);
    setPick(undefined);
    setPickError(undefined);
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
    setOpenable(true);
    setJob({ status: "queued", stage: "queued" });
    try {
      setJobId((await startFetch(request())).job_id);
    } catch (e) {
      setJob({ status: "error", error: (e as Error).message });
    }
  };

  const submitUpload = async (radar: boolean) => {
    if (!after || (!radar && !before)) return;
    reset();
    setOpenable(!radar);
    const fd = new FormData();
    if (before && !radar) fd.append("before", before);
    fd.append("after", after);
    fd.append("preset", radar ? "flood" : preset);
    fd.append("mode", radar ? "radar" : "spectral");
    setJob({ status: "uploading" });
    const r = await fetch(`${API_URL}/analyze`, { method: "POST", body: fd });
    const d = await r.json();
    if (!r.ok) return setJob({ status: "error", error: d.detail ?? r.statusText });
    setJobId(d.job_id);
  };

  if (online === undefined) return <p className="p-6 text-slate-500">Checking the live analysis service…</p>;
  if (!online) return (
    <div className="mx-auto max-w-2xl p-6" data-testid="analyse-offline">
      <h1 className="text-xl font-semibold">Live analysis is offline</h1>
      <p className="mt-2 text-slate-600">The analysis server is not reachable{API_URL ? " (it may be waking up; try again in a minute)" : " (no API is configured for this deployment)"}. The demo scenes work without it.</p>
      <Link to="/" className="mt-3 inline-block underline">Open the demo scenes</Link>
    </div>
  );

  const running = job?.status === "running" || job?.status === "queued" || job?.status === "uploading";
  const tab = (id: Source, label: string) => (
    <button type="button" role="tab" aria-selected={source === id} onClick={() => { setSource(id); reset(); }}
      className={`rounded-t px-3 py-1.5 text-sm font-medium ${source === id ? "bg-white text-accent shadow" : "text-slate-600"}`} data-testid={`tab-${id}`}>{label}</button>
  );
  const presetSelect = (
    <label className="block text-sm">What to look for
      <select className="ml-2 rounded border border-slate-300 p-1" value={preset} onChange={(e) => setPreset(e.target.value)}>
        <option value="encroachment">Encroachment (construction, water loss)</option>
        <option value="flood">Flood (new water)</option>
        <option value="deforestation">Deforestation</option>
        <option value="general">All change types</option>
      </select>
    </label>
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Analyse any area</h1>
      <p className="text-sm text-slate-600">Draw a box anywhere in India (or the world), pick two dates, and we fetch the two clearest Sentinel-2 images and find what really changed. Or upload your own images.</p>
      <div role="tablist" className="flex gap-1 border-b border-slate-200">
        {tab("area", "Draw an area")}{tab("upload", "Upload two images")}{tab("radar", "Radar flood (Sentinel-1)")}
      </div>

      {source === "area" && (
        <Card title="1 · Draw the area and choose the dates">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <label>Jump to
              <select className="ml-2 rounded border border-slate-300 p-1" onChange={(e) => setPlace(PLACES[Number(e.target.value)])} data-testid="place">
                {PLACES.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
              </select>
            </label>
            {box && <button type="button" className="rounded border border-slate-300 px-2 py-0.5" onClick={() => { setBox(undefined); setPick(undefined); }}>Clear box</button>}
            {box && !problem && <span className="text-slate-600" data-testid="box-size">{sizeKm(box).map((v) => v.toFixed(1)).join(" × ")} km</span>}
          </div>
          <AreaPicker box={box} onChange={(b) => { setBox(b); setPick(undefined); }} place={place} />
          <p className={`mt-1 text-xs ${problem && box ? "text-red-700" : "text-slate-500"}`} data-testid="box-problem">{problem ?? "Area looks good."}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Before date<input type="date" className="mt-1 block w-full rounded border border-slate-300 p-1" value={beforeDate} min="2017-01-01" onChange={(e) => { setBeforeDate(e.target.value); setPick(undefined); }} /></label>
            <label className="text-sm">After date<input type="date" className="mt-1 block w-full rounded border border-slate-300 p-1" value={afterDate} min="2017-01-01" onChange={(e) => { setAfterDate(e.target.value); setPick(undefined); }} /></label>
          </div>
          <p className="mt-1 text-xs text-slate-500">Choose the same time of year for both dates, so growing crops are not mistaken for change. We use the clearest image within about 20 days of each date.</p>
          {!datesOk && <p className="mt-1 text-xs text-red-700">The before date must be earlier than the after date.</p>}
          <div className="mt-3">{presetSelect}</div>
          <details className="mt-3 text-sm" data-testid="advanced">
            <summary className="cursor-pointer font-medium">Fewer false alarms (optional)</summary>
            <label className="mt-2 block">Images per date
              <select className="ml-2 rounded border border-slate-300 p-1" value={composite} onChange={(e) => { setComposite(Number(e.target.value)); setPick(undefined); }} data-testid="composite">
                <option value={1}>The single clearest image</option>
                <option value={3}>Median of 3 images (removes one-off clouds; slower)</option>
              </select>
            </label>
            <label className="mt-2 flex items-start gap-2">
              <input type="checkbox" checked={persist && persistOk} disabled={!persistOk} onChange={(e) => setPersist(e.target.checked)} data-testid="persistence" />
              <span>Keep a change only if it is also seen in a second, later image (removes one-day artefacts; for construction, not floods)</span>
            </label>
          </details>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={!box || !!problem || !datesOk || checking} onClick={check} data-testid="check-scenes"
              className="rounded border border-accent px-4 py-1.5 font-semibold text-accent disabled:opacity-40">{checking ? "Checking…" : "Check scenes"}</button>
            <button type="button" disabled={!box || !!problem || !datesOk || running} onClick={analyseArea} data-testid="analyse-area"
              className="rounded bg-accent px-4 py-1.5 font-semibold text-white disabled:opacity-40">Analyse this area</button>
          </div>
          {pickError && <p className="mt-2 text-sm text-red-700" data-testid="pick-error">{pickError}</p>}
          {pick && (
            <div className="mt-3 text-sm" data-testid="scene-pick">
              <p className="font-medium">Images that will be used ({pick.size_km.map((v) => v.toFixed(1)).join(" × ")} km):</p>
              <table className="mt-1 w-full text-left text-xs">
                <thead className="text-slate-500"><tr><th>Image</th><th>Date</th><th>Cloud / no-data over the box</th><th>Days from your date</th></tr></thead>
                <tbody>
                  {(["before", "after"] as const).map((k) => (
                    <tr key={k}><td className="capitalize">{k}</td><td>{pick[k].date}</td><td>{pick[k].aoi_invalid_pct}%</td><td>{pick[k].days_from_target > 0 ? "+" : ""}{pick[k].days_from_target}</td></tr>
                  ))}
                </tbody>
              </table>
              {pick.warnings.map((w) => <p key={w} className="mt-1 text-xs text-amber-800">⚠ {w}</p>)}
            </div>
          )}
        </Card>
      )}

      {source === "upload" && (
        <Card title="1 · Upload two co-registered GeoTIFFs (≥ 4 bands incl. NIR, ≥ 5 m pixels)">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Before<input type="file" accept=".tif,.tiff" className="mt-1 block w-full text-sm" onChange={(e) => setBefore(e.target.files?.[0])} /></label>
            <label className="text-sm">After<input type="file" accept=".tif,.tiff" className="mt-1 block w-full text-sm" onChange={(e) => setAfter(e.target.files?.[0])} /></label>
          </div>
          <div className="mt-3">{presetSelect}</div>
          <button type="button" disabled={!before || !after || running} onClick={() => submitUpload(false)} data-testid="analyse-upload"
            className="mt-3 rounded bg-accent px-4 py-1.5 font-semibold text-white disabled:opacity-40">Analyse</button>
        </Card>
      )}

      {source === "radar" && (
        <Card title="1 · Upload one Sentinel-1 radar image (GeoTIFF: band 1 = VV in dB, band 2 = VH in dB)">
          <label className="text-sm">Radar image (during the flood)<input type="file" accept=".tif,.tiff" className="mt-1 block w-full text-sm" onChange={(e) => setAfter(e.target.files?.[0])} data-testid="radar-file" /></label>
          <p className="mt-2 text-xs text-amber-800">Radar sees through cloud, so it works in the monsoon. It maps <b>open flood water from one date</b>, not before/after change; flooded crops and streets can be missed.</p>
          <button type="button" disabled={!after || running} onClick={() => submitUpload(true)} data-testid="analyse-radar"
            className="mt-3 rounded bg-accent px-4 py-1.5 font-semibold text-white disabled:opacity-40">Map the flood</button>
        </Card>
      )}

      {job && (
        <Card title="2 · Progress">
          <ol className="flex flex-wrap gap-2 text-xs">
            {STAGES.map((st) => (
              <li key={st} className={`rounded px-2 py-0.5 ${job.stage === st || (job.status === "done" && st === "done") ? "bg-accent text-white" : "bg-slate-100"}`}>{st}</li>
            ))}
          </ol>
          {job.fetch && (
            <p className="mt-2 text-xs text-slate-600" data-testid="scenes-used">Used: before {job.fetch.before.date} ({job.fetch.before.scene}) · after {job.fetch.after.date} ({job.fetch.after.scene})</p>
          )}
          {job.error && <p className="mt-2 text-sm text-red-700" data-testid="job-error">{job.error}</p>}
          {job.warnings?.map((w) => <p key={w} className="mt-1 text-xs text-amber-800">⚠ {w}</p>)}
        </Card>
      )}
      {result && jobId && (
        <Card title="3 · Result" testid="analyse-result">
          {isRadar(result) ? (
            <p className="text-lg"><b className="text-emerald-700">{num(result.after_filter)}</b> flood areas · {num(result.flooded_ha)} ha of open water</p>
          ) : (
            <p className="text-lg"><b>{num(result.raw_detections)}</b> raw → <b className="text-emerald-700">{num(result.after_filter)}</b> real changes · {area(result.total_area_m2)}</p>
          )}
          {openable && !isRadar(result) && (
            <Link to={`/job/${jobId}`} className="mt-2 inline-block rounded bg-accent px-4 py-1.5 font-semibold text-white" data-testid="open-on-map">Open on the swipe map</Link>
          )}
          <ul className="mt-2 grid grid-cols-2 gap-1 text-sm">
            {(isRadar(result) ? ["geojson"] : ["geojson", "gpkg", "pdf", "csv", "kml"]).map((fmt) => (
              <li key={fmt}><a className="text-accent underline" href={`${API_URL}/jobs/${jobId}/export?format=${fmt}`}>Download {fmt.toUpperCase()}</a></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
