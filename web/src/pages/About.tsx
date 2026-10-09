import { Card } from "../components/panel/Panels";

type Status = "Used now" | "In progress" | "Planned";
const STATUS_STYLE: Record<Status, string> = {
  "Used now": "bg-emerald-100 text-emerald-800",
  "In progress": "bg-amber-100 text-amber-800",
  Planned: "bg-slate-100 text-slate-600",
};
// Every row says plainly whether it is shipped, being built, or planned: nothing unfinished is shown as done.
const STACK: [string, string, Status][] = [
  ["Web app", "React 19, Vite, TypeScript, Tailwind CSS, MapLibre GL (before/after swipe map), Zustand, React Router", "Used now"],
  ["Web tests", "Vitest, Testing Library, Playwright; GitHub Actions CI", "Used now"],
  ["Engine", "Python 3.11, Rasterio / GDAL, GeoPandas, Shapely, NumPy, SciPy, scikit-image, scikit-learn", "Used now"],
  ["API", "FastAPI, Uvicorn; any-area fetch from Sentinel-2; Docker", "Used now"],
  ["Radar flood mode", "Sentinel-1 (VV/VH), event threshold + region growing, evaluated on Sen1Floods11", "Used now"],
  ["Deep learning", "PyTorch Siamese U-Net trained on OSCD (F1 0.54 on 10 held-out locations, see Accuracy) and exported to ONNX for ONNX Runtime serving; serving it in the live API is the next step", "In progress"],
  ["High-res mode", "BIT Siamese transformer, reproduced on the full LEVIR-CD test split (F1 0.90, see Accuracy); not yet in the live API", "In progress"],
  ["Data", "Sentinel-2 L2A, Sentinel-1, ESA WorldCover, JRC water, OpenStreetMap, OSCD, LEVIR-CD, Sen1Floods11", "Used now"],
  ["Hosting", "Vercel (site), a Hugging Face Space or Render (API)", "Planned"],
];

export default function About() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">How it works</h1>
      <ol className="grid gap-3 sm:grid-cols-2">
        {[
          ["1 · Align", "Read the before and after images, put them on one grid and check they line up (a 1-2 pixel shift makes every edge look like change)."],
          ["2 · Detect", "Optical (Sentinel-2): vegetation, built-up and water indices plus total change. Radar (Sentinel-1): flood water is dark; one threshold per flood event, then region growing."],
          ["3 · Filter false alarms", "Drop cloud, seasonal crop and lighting changes, radar speckle, permanent rivers and tiny specks. Every rule counts what it removed."],
          ["4 · Explain and rank", "Each remaining change becomes a polygon with its area, confidence, a plain-language reason, a location and a severity tier, ready for QGIS."],
        ].map(([t, d]) => (
          <li key={t} className="rounded-lg border border-slate-200 bg-white p-3"><b>{t}</b><p className="text-sm text-slate-600">{d}</p></li>
        ))}
      </ol>
      <Card title="Tech stack" testid="tech-stack">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="w-28">Layer</th><th>What we use</th><th className="w-28">Status</th></tr></thead>
          <tbody>
            {STACK.map(([layer, what, status]) => (
              <tr key={layer} className="border-t border-slate-100 align-top">
                <td className="py-1 font-medium">{layer}</td>
                <td className="py-1 text-slate-600">{what}</td>
                <td className="py-1"><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}>{status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <img src={`${import.meta.env.BASE_URL}architecture.png`} alt="System architecture: users, web app, API, storage, data sources, the five-step engine, outputs and the offline train-evaluate-ship pipeline"
          className="mt-3 w-full rounded border border-slate-200" data-testid="architecture-diagram" />
      </Card>
      <Card title="Data and licences">
        <ul className="list-disc pl-4 text-sm text-slate-600">
          <li>Copernicus Sentinel-2 L2A and Sentinel-1 (ESA), free and open; Sentinel-2 read from the Element84 Earth Search bucket.</li>
          <li>Sen1Floods11 v1.1 (Cloud to Street, CC-BY 4.0): expert hand-labelled flood chips used for accuracy.</li>
          <li>ESA WorldCover 2021 v200 (CC-BY 4.0): cropland and built-up land for the impact numbers.</li>
          <li>JRC Global Surface Water: permanent water mask. Base map © OpenStreetMap contributors.</li>
        </ul>
      </Card>
      <Card title="Limits (what it does not do)">
        <ul className="list-disc pl-4 text-sm text-slate-600">
          <li>10 m satellite pixels cannot see people or single small huts; the site tells you <i>where to look</i>.</li>
          <li>Optical images cannot see through cloud: clouded areas are removed, not analysed. Radar covers floods under cloud.</li>
          <li>Radar shows open flood water; flooded crops and streets can look bright and may be missed.</li>
          <li>Change types come from spectral rules, not a trained model; confirm critical changes on the ground.</li>
          <li>Cropland comes from WorldCover 2021; when the before image is older, it is shown as an upper bound.</li>
        </ul>
      </Card>
    </div>
  );
}
