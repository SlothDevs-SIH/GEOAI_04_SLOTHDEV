import { Card } from "../components/panel/Panels";

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
