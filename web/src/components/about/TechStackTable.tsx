import { CardSection, Scroller, StatusChip } from "../ui/Primitives";

export type StackStatus = "Used now" | "In progress" | "Planned";
export type StackRow = [layer: string, what: string, status: StackStatus];

/**
 * B-02. Every row says plainly whether it is shipped, being built, or planned: nothing unfinished is shown as done.
 * Statuses were rechecked against the verified integration (ONNX serving, detector registry, offline PWA).
 */
export const STACK: StackRow[] = [
  ["Web app", "React 19, Vite, TypeScript, Tailwind CSS, MapLibre GL (before/after swipe map), Zustand, React Router", "Used now"],
  ["Web tests", "Vitest, Testing Library, Playwright; GitHub Actions CI", "Used now"],
  ["Engine", "Python 3.11, Rasterio / GDAL, GeoPandas, Shapely, NumPy, SciPy, scikit-image, scikit-learn", "Used now"],
  ["API", "FastAPI, Uvicorn; any-area fetch from Sentinel-2; Docker", "Used now"],
  ["Detector registry", "engine/detectors.py: spectral, learned, hybrid and deep modes behind one interface, with live availability of each mode reported through /health", "Used now"],
  ["Radar flood mode", "Sentinel-1 (VV/VH), event threshold + region growing, evaluated on Sen1Floods11", "Used now"],
  ["Deep learning", "PyTorch Siamese U-Net trained on OSCD (F1 0.54 on 10 held-out locations, see Accuracy), exported to ONNX and served with ONNX Runtime in the live API as the Learned and Hybrid detector modes (the rule-based Spectral mode stays the default)", "Used now"],
  ["High-res mode", "BIT Siamese transformer for 0.5 m RGB imagery, reproduced on the full LEVIR-CD test split (F1 0.90, see Accuracy); runs when the server has PyTorch and the downloaded checkpoint (not in the default container)", "Used now"],
  ["Offline PWA", "Workbox service worker; the site and the demo scenes (about 23 MB) are cached after one visit, so the demo opens with no network", "Used now"],
  ["Data", "Sentinel-2 L2A, Sentinel-1, ESA WorldCover, JRC water, OpenStreetMap, OSCD, LEVIR-CD, Sen1Floods11", "Used now"],
  ["Hosting", "Vercel (site), a Hugging Face Space or Render (API)", "Planned"],
];

export default function TechStackTable({ rows = STACK }: { rows?: StackRow[] }) {
  return (
    <CardSection title="Tech stack" testid="tech-stack">
      <Scroller testid="tech-stack-scroller">
        <table className="w-full min-w-[540px] border-separate border-spacing-0 text-small">
          <thead>
            <tr className="text-left text-tiny text-muted">
              <th scope="col" className="w-36 px-s8 pb-s8 font-medium">Layer</th>
              <th scope="col" className="px-s8 pb-s8 font-medium">What we use</th>
              <th scope="col" className="w-28 px-s8 pb-s8 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([layer, what, status]) => (
              <tr key={layer} className="align-top">
                <th scope="row" className="border-t border-line px-s8 py-s8 text-left font-semibold text-fg">{layer}</th>
                <td className="border-t border-line px-s8 py-s8 font-normal text-secondary">{what}</td>
                <td className="border-t border-line px-s8 py-s8"><StatusChip status={status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Scroller>
    </CardSection>
  );
}
