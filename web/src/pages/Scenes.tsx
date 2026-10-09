import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listScenes, staticBase } from "../lib/api";
import { num } from "../lib/format";
import type { SceneMeta } from "../lib/types";

const KIND: Record<string, string> = { flood: "Flood · radar", encroachment: "Encroachment", control: "False-alarm control", regional: "Regional check" };

export default function Scenes() {
  const [scenes, setScenes] = useState<SceneMeta[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    listScenes().then(setScenes).catch((e: Error) => setError(e.message));
  }, []);
  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="text-2xl font-semibold">See what really changed, not every pixel that moved.</h1>
      <p className="mt-1 max-w-3xl text-slate-600">
        Compare two satellite images of the same place. We filter out seasonal, lighting and radar-speckle false alarms,
        then rank the real changes by severity, explain each one, and export them for GIS.
      </p>
      {error && <p className="mt-4 text-red-700">Could not load the demo scenes ({error}).</p>}
      {!scenes && !error && <p className="mt-4 text-slate-500">Loading scenes…</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {scenes?.map((s) => (
          <Link key={s.id} to={`/scene/${s.id}`} data-testid="scene-card"
            className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
            <img src={`${staticBase(s.id)}/after.webp`} alt="" className="aspect-square w-full object-cover" loading="lazy" />
            <div className="p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">{KIND[s.kind] ?? s.kind}</span>
              <h2 className="font-semibold">{s.name}</h2>
              <p className="text-xs text-slate-500">{s.event}</p>
              <p className="mt-1 text-xs text-slate-500">{s.before_date === s.after_date ? s.after_date : `${s.before_date} → ${s.after_date}`}</p>
              {s.raw_detections != null && (
                <p className="mt-2 text-sm"><b>{num(s.raw_detections)}</b> raw → <b className="text-emerald-700">{num(s.after_filter)}</b> real</p>
              )}
              <span className="mt-2 inline-block rounded border border-slate-300 px-1.5 text-[10px] text-slate-500">Demo data (precomputed)</span>
            </div>
          </Link>
        ))}
        <Link to="/analyse" className="flex flex-col justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white p-4 text-center hover:border-accent">
          <span className="text-3xl">⬆</span>
          <span className="font-semibold">Try your own</span>
          <span className="text-xs text-slate-500">Draw an area anywhere in India, or upload images</span>
        </Link>
      </div>
    </div>
  );
}
