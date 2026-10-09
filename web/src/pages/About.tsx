import ArchitectureImage from "../components/about/ArchitectureImage";
import DataLicencesCard from "../components/about/DataLicencesCard";
import LimitsCard from "../components/about/LimitsCard";
import StepCard from "../components/about/StepCard";
import TechStackTable from "../components/about/TechStackTable";

const STEPS: [string, string][] = [
  ["Align", "Read the before and after images, put them on one grid and check they line up (a 1-2 pixel shift makes every edge look like change)."],
  ["Detect", "Optical (Sentinel-2): vegetation, built-up and water indices plus total change. Radar (Sentinel-1): flood water is dark; one threshold per flood event, then region growing."],
  ["Filter false alarms", "Drop cloud, seasonal crop and lighting changes, radar speckle, permanent rivers and tiny specks. Every rule counts what it removed."],
  ["Explain and rank", "Each remaining change becomes a polygon with its area, confidence, a plain-language reason, a location and a severity tier, ready for QGIS."],
];

export default function About() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-s18 px-s18 py-s26">
      <h1 className="text-h1 text-fg">How it works</h1>
      <ol data-testid="how-it-works" className="m-0 grid list-none grid-cols-1 gap-s12 p-0 sm:grid-cols-2">
        {STEPS.map(([title, body], i) => <StepCard key={title} stepNumber={i + 1} title={title} body={body} />)}
      </ol>
      <TechStackTable />
      <ArchitectureImage />
      <DataLicencesCard />
      <LimitsCard />
    </div>
  );
}
