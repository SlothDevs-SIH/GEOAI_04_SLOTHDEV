import { useIsPhone } from "../../hooks/motion";
import { TabSegment } from "../ui/Primitives";

export type Source = "area" | "upload" | "radar";

const FULL: [Source, string][] = [["area", "Draw an area"], ["upload", "Upload two images"], ["radar", "Radar flood (Sentinel-1)"]];
const SHORT: [Source, string][] = [["area", "Draw an area"], ["upload", "Upload"], ["radar", "Radar"]];

/** A-01c: the three ways in, with the sliding underline (A-06). Shorter labels on a phone so nothing scrolls sideways. */
export default function SegmentedTabs({ activeTab, onChange }: { activeTab: Source; onChange: (t: Source) => void }) {
  const phone = useIsPhone();
  return <TabSegment tabs={phone ? SHORT : FULL} active={activeTab} onChange={onChange} />;
}
