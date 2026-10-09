import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { FilterState } from "../../lib/filters";
import { area, coord, ha, num, pct } from "../../lib/format";
import { DROP_LABEL, TIERS, tierColor, tierLabel, typeLabel } from "../../lib/tiers";
import type { ChangeProps, ReviewStatus, SceneData, Summary, Tier } from "../../lib/types";

export function TierChip({ tier }: { tier: string }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[11px] font-bold uppercase"
      // the orange and gold backgrounds need dark text to reach a 4.5:1 contrast ratio (white on them is 2.5:1)
      style={{ background: tierColor(tier), color: tier === "medium" || tier === "low" ? "#14181f" : "#ffffff" }}>
      {tierLabel(tier)}
    </span>
  );
}

export function Card({ title, children, testid }: { title: string; children: React.ReactNode; testid?: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3" data-testid={testid}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

export function Legend({ radar }: { radar: boolean }) {
  return (
    <div className="flex flex-wrap justify-center gap-3 text-xs text-slate-600" data-testid="legend">
      {TIERS.map((t) => (
        <span key={t} className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded-sm" style={{ background: tierColor(t) }} />
          {tierLabel(t)}
        </span>
      ))}
      <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm bg-[#ff8c00]" />Raw detections (filter off)</span>
      {radar && <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm bg-[#00dc78]" />Expert labels</span>}
    </div>
  );
}

export function ImpactPanel({ s }: { s: Summary }) {
  const i = s.impact;
  const items: [string, string, string?][] = [
    ["Area changed", ha(i.changed_ha)],
    ["Cropland affected", ha(i.cropland_ha), i.cropland_reliability === "upper_bound" ? "upper bound" : undefined],
    ["Built-up land affected", ha(i.built_up_ha)],
    ["Buildings touched", i.buildings == null ? "unknown" : num(i.buildings)],
  ];
  return (
    <Card title="Impact" testid="impact">
      <div className="grid grid-cols-2 gap-2">
        {items.map(([k, v, note]) => (
          <div key={k} className="rounded bg-slate-50 p-2">
            <div className="text-lg font-semibold">{v}</div>
            <div className="text-xs text-slate-500">{k}{note && <em className="ml-1 text-amber-700">({note})</em>}</div>
          </div>
        ))}
      </div>
      {(i.sources.length > 0 || i.notes.length > 0) && (
        <ul className="mt-2 list-disc pl-4 text-[11px] text-slate-500">
          {i.sources.map((x) => <li key={x}>Source: {x}</li>)}
          {i.notes.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
    </Card>
  );
}

export function DropCounts({ s }: { s: Summary }) {
  const entries = Object.entries(s.dropped).filter(([, v]) => v > 0);
  if (!entries.length) return null;
  return (
    <div className="text-xs text-slate-600" data-testid="drops">
      <b>What the filter removed (pixels):</b>{" "}
      {entries.map(([k, v], n) => (
        <span key={k}>{n > 0 && " · "}{num(v)} {DROP_LABEL[k] ?? k}</span>
      ))}
    </div>
  );
}

export function FilterBar({ f, setF, types }: { f: FilterState; setF: (f: FilterState) => void; types: string[] }) {
  const toggleTier = (t: Tier) => setF({ ...f, tiers: f.tiers.includes(t) ? f.tiers.filter((x) => x !== t) : [...f.tiers, t] });
  return (
    <Card title="Filters" testid="filters">
      <div className="flex flex-wrap gap-1.5">
        {TIERS.map((t) => (
          <button key={t} type="button" aria-pressed={f.tiers.includes(t)} onClick={() => toggleTier(t)}
            className={`rounded border px-2 py-0.5 text-xs ${f.tiers.includes(t) ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 text-slate-500"}`}>
            {tierLabel(t)}
          </button>
        ))}
      </div>
      {types.length > 1 && (
        <select aria-label="Change type" className="mt-2 w-full rounded border border-slate-300 p-1 text-sm" value={f.types?.[0] ?? ""}
          onChange={(e) => setF({ ...f, types: e.target.value ? [e.target.value] : null })}>
          <option value="">All change types</option>
          {types.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
        </select>
      )}
      <label className="mt-2 block text-xs text-slate-600">
        Minimum area: <b>{area(f.minAreaM2)}</b>
        <input type="range" min={0} max={20000} step={500} value={f.minAreaM2} className="w-full"
          onChange={(e) => setF({ ...f, minAreaM2: Number(e.target.value) })} />
      </label>
      <label className="block text-xs text-slate-600">
        Minimum confidence: <b>{pct(f.minConfidence)}</b>
        <input type="range" min={0} max={0.95} step={0.05} value={f.minConfidence} className="w-full"
          onChange={(e) => setF({ ...f, minConfidence: Number(e.target.value) })} />
      </label>
    </Card>
  );
}

const TABS: [FilterState["tab"], string][] = [["all", "All"], ["review", "Needs review"], ["confirmed", "Confirmed"], ["dismissed", "Dismissed"]];

export function ChangeList({ items, status, selected, onSelect, f, setF }: {
  items: ChangeProps[]; status: (id: number) => ReviewStatus; selected?: number;
  onSelect: (id: number) => void; f: FilterState; setF: (f: FilterState) => void;
}) {
  return (
    <Card title={`Changes, ranked (${items.length})`} testid="change-list">
      <div role="tablist" className="mb-2 flex gap-1 text-xs">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={f.tab === k} type="button" onClick={() => setF({ ...f, tab: k })}
            className={`rounded px-2 py-0.5 ${f.tab === k ? "bg-accent text-white" : "bg-slate-100"}`}>{label}</button>
        ))}
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th>#</th><th>Tier</th><th>Type</th><th className="text-right">Area</th><th className="text-right">Conf.</th></tr></thead>
          <tbody>
            {items.slice(0, 200).map((p) => (
              <tr key={p.id} data-testid="change-row" onClick={() => onSelect(p.id)} tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onSelect(p.id)}
                className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${selected === p.id ? "bg-blue-100" : ""} ${status(p.id) === "dismissed" ? "opacity-50" : ""}`}>
                <td>{p.id}{status(p.id) === "confirmed" && " ✓"}</td>
                <td><TierChip tier={p.tier} /></td>
                <td className="text-xs">{typeLabel(p.change_type)}</td>
                <td className="text-right tabular-nums">{area(p.area_m2)}</td>
                <td className="text-right tabular-nums">{pct(p.confidence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="p-2 text-sm text-slate-500">No changes match these filters.</p>}
      </div>
    </Card>
  );
}

export function ChangeCard({ p, base, status, onReview }: { p?: ChangeProps; base: string; status: ReviewStatus; onReview: (s: ReviewStatus) => void }) {
  if (!p) return <Card title="Selected change"><p className="text-sm text-slate-500">Click a polygon on the map or a row in the list.</p></Card>;
  const maps = `https://www.google.com/maps?q=${p.centroid_lat},${p.centroid_lon}`;
  return (
    <Card title="Selected change" testid="change-card">
      <p className="flex items-center gap-2"><TierChip tier={p.tier} /><b>#{p.id}</b> {typeLabel(p.change_type)}</p>
      <p className="mt-1 text-lg font-semibold">{area(p.area_m2)}</p>
      <p className="text-sm">Confidence {pct(p.confidence)}{p.needs_review && <b className="ml-1 text-amber-700">· needs review</b>} · magnitude {p.magnitude.toFixed(2)}</p>
      {p.cropland_ha != null && p.cropland_ha > 0 && <p className="text-sm">Cropland inside: {ha(p.cropland_ha, 2)}</p>}
      <p className="mt-1 text-sm text-slate-600" data-testid="reason"><b>Why:</b> {p.reason}</p>
      <p className="mt-1 text-sm">📍 {coord(p.centroid_lat)}, {coord(p.centroid_lon)}{" "}
        <button type="button" className="text-xs text-accent underline" onClick={() => navigator.clipboard?.writeText(`${p.centroid_lat},${p.centroid_lon}`)}>copy</button>{" · "}
        <a className="text-accent underline" href={maps} target="_blank" rel="noreferrer">open in Maps</a></p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["before", "after"] as const).map((side) => (
          <figure key={side} className="text-center text-[11px] text-slate-500">
            <img src={`${base}/crops/${p.id}_${side}.webp`} alt={`${side} crop of change ${p.id}`} className="w-full rounded border border-slate-200"
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            <figcaption>{side}</figcaption>
          </figure>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" data-testid="confirm" onClick={() => onReview(status === "confirmed" ? "pending" : "confirmed")}
          className={`flex-1 rounded border px-2 py-1 text-sm ${status === "confirmed" ? "border-emerald-700 bg-emerald-700 text-white" : "border-emerald-700 text-emerald-800"}`}>✓ {status === "confirmed" ? "Confirmed" : "Confirm"}</button>
        <button type="button" data-testid="dismiss" onClick={() => onReview(status === "dismissed" ? "pending" : "dismissed")}
          className={`flex-1 rounded border px-2 py-1 text-sm ${status === "dismissed" ? "border-slate-700 bg-slate-700 text-white" : "border-slate-500 text-slate-700"}`}>✗ {status === "dismissed" ? "Dismissed" : "Dismiss"}</button>
      </div>
    </Card>
  );
}

export function ExportMenu({ scene, confirmed }: { scene: SceneData; confirmed: ChangeProps[] }) {
  const [qr, setQr] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(window.location.href, { margin: 1, width: 140 }).then(setQr).catch(() => setQr(undefined));
  }, [scene.meta.id]);
  const files: [string, string][] = [["GeoPackage (QGIS)", "changes.gpkg"], ["GeoJSON", "changes.geojson"], ["PDF report", "report.pdf"],
    ["CSV (field pack)", "changes.csv"], ["KML (Google Earth)", "changes.kml"], ["Audit trail", "audit.json"]];
  const downloadConfirmed = () => {
    const ids = new Set(confirmed.map((p) => p.id));
    const fc = { ...scene.filtered, features: scene.filtered.features.filter((f) => ids.has(f.properties.id)).map((f) => ({ ...f, properties: { ...f.properties, review_status: "confirmed" } })) };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(fc)], { type: "application/geo+json" }));
    a.download = `${scene.meta.id}_confirmed.geojson`;
    a.click();
  };
  return (
    <Card title="Export" testid="export">
      <ul className="grid grid-cols-2 gap-1 text-sm">
        {files.map(([label, f]) => (
          <li key={f}><a className="text-accent underline" href={`${scene.base}/exports/${f}`} download data-testid={`export-${f}`}>{label}</a></li>
        ))}
      </ul>
      <button type="button" disabled={!confirmed.length} onClick={downloadConfirmed}
        className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-40">
        Confirmed only ({confirmed.length}) · GeoJSON
      </button>
      {qr && (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <img src={qr} alt="QR code to open this view on a phone" className="h-20 w-20" data-testid="qr" />
          <span>Scan to open this exact view on a phone (permalink).</span>
        </div>
      )}
    </Card>
  );
}
