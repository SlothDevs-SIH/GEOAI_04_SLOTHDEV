import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import CompareMap from "../components/map/CompareMap";
import { Card, ChangeCard, ChangeList, DropCounts, ExportMenu, FilterBar, ImpactPanel, Legend } from "../components/panel/Panels";
import { useRaw, useScene } from "../hooks/useScene";
import { DEFAULT_FILTERS, type FilterState, counterText, mapFilter, passes } from "../lib/filters";
import { num } from "../lib/format";
import { useReview } from "../store/review";

export default function Result({ job = false }: { job?: boolean }) {
  const { id = "" } = useParams();
  const { data, error, loading } = useScene(id, job);
  const [params, setParams] = useSearchParams();
  const filterOn = params.get("filter") !== "off";
  const selected = params.get("sel") ? Number(params.get("sel")) : undefined;
  const swipe = params.get("swipe") ? Number(params.get("swipe")) : 50;
  const [showLabels, setShowLabels] = useState(false);
  const [showPolygons, setShowPolygons] = useState(true);
  const [f, setF] = useState<FilterState>(DEFAULT_FILTERS);
  const decisions = useReview((s) => s.decisions[id]);
  const setReview = useReview((s) => s.set);
  const status = (fid: number) => decisions?.[fid] ?? "pending";
  const raw = useRaw(data?.base, !filterOn);

  const setParam = (k: string, v: string | undefined) => {
    const p = new URLSearchParams(params);
    if (v == null) p.delete(k);
    else p.set(k, v);
    setParams(p, { replace: true });
  };

  const props = useMemo(() => data?.filtered.features.map((x) => x.properties) ?? [], [data]);
  const visible = useMemo(() => props.filter((p) => passes(p, f, status(p.id))), [props, f, decisions]); // eslint-disable-line react-hooks/exhaustive-deps
  const hidden = useMemo(() => props.filter((p) => !visible.includes(p)).map((p) => p.id), [props, visible]);
  const filterExpr = useMemo(() => mapFilter({ ...f, tab: "all" }, hidden), [f, hidden]);
  const types = useMemo(() => [...new Set(props.map((p) => p.change_type))], [props]);
  const confirmed = props.filter((p) => status(p.id) === "confirmed");

  if (loading) return <p className="p-6 text-slate-500">Loading scene…</p>;
  if (error || !data) return (
    <div className="p-6"><p className="text-red-700">Could not load this scene ({error}).</p><Link to="/" className="underline">Back to scenes</Link></div>
  );
  const s = data.summary;
  const sel = props.find((p) => p.id === selected);
  const radar = data.meta.mode === "radar";

  return (
    <div className="mx-auto grid max-w-[1500px] gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h1 className="text-xl font-semibold">{data.meta.name}</h1>
          <p className="text-sm text-slate-600">{s.subtitle ?? data.meta.place} · {data.meta.event}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-accent bg-white px-3 py-1.5 font-semibold">
            <input type="checkbox" checked={filterOn} onChange={(e) => setParam("filter", e.target.checked ? undefined : "off")} data-testid="filter-toggle" />
            False-alarm filter
          </label>
          {radar && <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />Show expert labels</label>}
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={showPolygons} onChange={(e) => setShowPolygons(e.target.checked)} />Polygons</label>
          <span className="text-sm" data-testid="counter" aria-live="polite">{counterText(s.raw_detections, s.after_filter, filterOn)}</span>
        </div>
        <div className="h-[62vh] min-h-[360px]">
          <CompareMap scene={data} filterOn={filterOn} raw={raw} showLabels={showLabels} showPolygons={showPolygons}
            filter={filterExpr} selected={selected} onSelect={(fid) => setParam("sel", String(fid))}
            swipe={swipe} onSwipe={(v) => setParam("swipe", String(Math.round(v)))} />
        </div>
        <Legend radar={radar} />
        <DropCounts s={s} />
        {s.warnings.length > 0 && (
          <ul className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" data-testid="warnings">
            {s.warnings.map((w) => <li key={w}>⚠ {w}</li>)}
          </ul>
        )}
        {s.evaluation && (
          <Card title="Accuracy on this scene vs expert labels" testid="scene-eval">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th>Method</th><th>IoU</th><th>Precision</th><th>Recall</th><th>False-alarm pixels</th></tr></thead>
              <tbody>
                <tr><td>Naive (per-scene threshold, no filters)</td><td>{s.evaluation.naive.iou}</td><td>{s.evaluation.naive.precision}</td><td>{s.evaluation.naive.recall}</td><td>{num(s.evaluation.naive.fp)}</td></tr>
                <tr className="font-semibold"><td>M8 (event threshold + region growing + filters)</td><td>{s.evaluation.m8.iou}</td><td>{s.evaluation.m8.precision}</td><td>{s.evaluation.m8.recall}</td><td>{num(s.evaluation.m8.fp)}</td></tr>
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-slate-500">{s.evaluation.against}. Thresholds were fitted without labels.</p>
          </Card>
        )}
      </div>
      <aside className="flex flex-col gap-3">
        <ImpactPanel s={s} />
        <ChangeCard p={sel} base={data.base} status={sel ? status(sel.id) : "pending"} onReview={(st) => sel && setReview(id, sel.id, st)} />
        <ChangeList items={visible} status={status} selected={selected} onSelect={(fid) => setParam("sel", String(fid))} f={f} setF={setF} />
        <FilterBar f={f} setF={setF} types={types} />
        <ExportMenu scene={data} confirmed={confirmed} />
        <Card title="Limits">
          <ul className="list-disc pl-4 text-xs text-slate-600">{s.limits.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="mt-1 text-[11px] text-slate-500">Sources: {s.sources.join(" · ")}</p>
        </Card>
      </aside>
    </div>
  );
}
