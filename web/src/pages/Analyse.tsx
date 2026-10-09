import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/panel/Panels";
import { API_URL, apiHealth } from "../lib/api";
import { area, num } from "../lib/format";

type Job = { status: string; stage?: string; progress?: number; warnings?: string[]; error?: string };
type Result = { raw_detections: number; after_filter: number; total_area_m2: number; by_tier: Record<string, number> };
const STAGES = ["queued", "detecting", "vectorising", "done"];

export default function Analyse() {
  const [online, setOnline] = useState<boolean>();
  const [before, setBefore] = useState<File>();
  const [after, setAfter] = useState<File>();
  const [preset, setPreset] = useState("encroachment");
  const [job, setJob] = useState<Job>();
  const [jobId, setJobId] = useState<string>();
  const [result, setResult] = useState<Result>();

  useEffect(() => {
    apiHealth().then(setOnline);
  }, []);

  useEffect(() => {
    if (!jobId) return;
    const t = setInterval(async () => {
      const j = (await (await fetch(`${API_URL}/jobs/${jobId}`)).json()) as Job;
      setJob(j);
      if (j.status === "done") {
        clearInterval(t);
        setResult((await (await fetch(`${API_URL}/jobs/${jobId}/summary`)).json()) as Result);
      }
      if (j.status === "error") clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [jobId]);

  const submit = async () => {
    if (!before || !after) return;
    const fd = new FormData();
    fd.append("before", before);
    fd.append("after", after);
    fd.append("preset", preset);
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
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Analyse your own pair</h1>
      <Card title="1 · Upload two co-registered GeoTIFFs (≥ 4 bands incl. NIR, ≥ 5 m pixels)">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Before<input type="file" accept=".tif,.tiff" className="mt-1 block w-full text-sm" onChange={(e) => setBefore(e.target.files?.[0])} /></label>
          <label className="text-sm">After<input type="file" accept=".tif,.tiff" className="mt-1 block w-full text-sm" onChange={(e) => setAfter(e.target.files?.[0])} /></label>
        </div>
        <label className="mt-3 block text-sm">Preset
          <select className="ml-2 rounded border border-slate-300 p-1" value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="encroachment">Encroachment (construction, water loss)</option>
            <option value="flood">Flood (new water)</option>
            <option value="deforestation">Deforestation</option>
            <option value="general">All change types</option>
          </select>
        </label>
        <button type="button" disabled={!before || !after || job?.status === "running"} onClick={submit}
          className="mt-3 rounded bg-accent px-4 py-1.5 font-semibold text-white disabled:opacity-40">Analyse</button>
      </Card>
      {job && (
        <Card title="2 · Progress">
          <ol className="flex flex-wrap gap-2 text-xs">
            {STAGES.map((st) => (
              <li key={st} className={`rounded px-2 py-0.5 ${job.stage === st || (job.status === "done" && st === "done") ? "bg-accent text-white" : "bg-slate-100"}`}>{st}</li>
            ))}
          </ol>
          {job.error && <p className="mt-2 text-sm text-red-700">{job.error}</p>}
          {job.warnings?.map((w) => <p key={w} className="mt-1 text-xs text-amber-800">⚠ {w}</p>)}
        </Card>
      )}
      {result && jobId && (
        <Card title="3 · Result">
          <p className="text-lg"><b>{num(result.raw_detections)}</b> raw → <b className="text-emerald-700">{num(result.after_filter)}</b> real changes · {area(result.total_area_m2)}</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-sm">
            {["geojson", "gpkg", "pdf", "csv", "kml"].map((fmt) => (
              <li key={fmt}><a className="text-accent underline" href={`${API_URL}/jobs/${jobId}/export?format=${fmt}`}>Download {fmt.toUpperCase()}</a></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
