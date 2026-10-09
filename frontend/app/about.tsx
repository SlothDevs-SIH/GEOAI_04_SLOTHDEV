import { View } from "react-native";
import { ArchitectureImage, StepCard, TechStackTable, type Status } from "../components/about/About";
import { ScreenScroll } from "../components/layout/Screen";
import { CardSection } from "../components/ui/Card";
import { Txt } from "../components/ui/Txt";
import { space } from "../theme/tokens";

// Every row says plainly whether it is shipped, being built, or planned: nothing unfinished is shown as done.
const STACK: [string, string, Status][] = [
  ["App", "Expo + React Native Web (one codebase for web, Android and iOS), expo-router, Reanimated, Zustand, MapLibre GL (before/after swipe map)", "Used now"],
  ["App tests", "Jest + React Native Testing Library, Playwright end-to-end, computed contrast checks", "Used now"],
  ["Engine", "Python 3.11, Rasterio / GDAL, GeoPandas, Shapely, NumPy, SciPy, scikit-image, scikit-learn", "Used now"],
  ["API", "FastAPI, Uvicorn; any-area fetch from Sentinel-2; Docker", "Used now"],
  ["Radar flood mode", "Sentinel-1 (VV/VH), event threshold + region growing, evaluated on Sen1Floods11", "Used now"],
  ["Deep learning", "PyTorch Siamese U-Net trained on OSCD (F1 0.54 on 10 held-out locations, see Accuracy) and exported to ONNX for ONNX Runtime serving", "Used now"],
  ["High-res mode", "BIT Siamese transformer, reproduced on the full LEVIR-CD test split (F1 0.90, see Accuracy)", "Used now"],
  ["Data", "Sentinel-2 L2A, Sentinel-1, ESA WorldCover, JRC water, OpenStreetMap, OSCD, LEVIR-CD, Sen1Floods11", "Used now"],
  ["Native apps", "Android / iOS builds share the screens; the native map and picker are written but need a device test", "In progress"],
  ["Hosting", "Vercel (site), a Hugging Face Space or Render (API)", "Planned"],
];
const STEPS: [string, string][] = [
  ["Align", "Read the before and after images, put them on one grid and check they line up (a 1-2 pixel shift makes every edge look like change)."],
  ["Detect", "Optical (Sentinel-2): vegetation, built-up and water indices plus total change. Radar (Sentinel-1): flood water is dark; one threshold per flood event, then region growing."],
  ["Filter false alarms", "Drop cloud, seasonal crop and lighting changes, radar speckle, permanent rivers and tiny specks. Every rule counts what it removed."],
  ["Explain and rank", "Each remaining change becomes a polygon with its area, confidence, a plain-language reason, a location and a severity tier, ready for QGIS."],
];
const LICENCES = [
  "Copernicus Sentinel-2 L2A and Sentinel-1 (ESA), free and open; Sentinel-2 read from the Element84 Earth Search bucket.",
  "Sen1Floods11 v1.1 (Cloud to Street, CC-BY 4.0): expert hand-labelled flood chips used for accuracy.",
  "ESA WorldCover 2021 v200 (CC-BY 4.0): cropland and built-up land for the impact numbers.",
  "JRC Global Surface Water: permanent water mask. Base map © OpenStreetMap contributors.",
];
const LIMITS = [
  "10 m satellite pixels cannot see people or single small huts; the site tells you where to look.",
  "Optical images cannot see through cloud: clouded areas are removed, not analysed. Radar covers floods under cloud.",
  "Radar shows open flood water; flooded crops and streets can look bright and may be missed.",
  "The default optical detector is a set of spectral rules; the learned model is optional and weak in some locations. Confirm critical changes on the ground.",
  "Cropland comes from WorldCover 2021; when the before image is older, it is shown as an upper bound.",
];

export default function About() {
  return (
    <ScreenScroll maxWidth={960}>
      <Txt v="h1" accessibilityRole="header">How it works</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3] }}>
        {STEPS.map(([t, d], i) => <StepCard key={t} n={i + 1} title={t} body={d} />)}
      </View>
      <CardSection title="Tech stack" slug="tech-stack">
        <TechStackTable rows={STACK} />
        <ArchitectureImage />
      </CardSection>
      <CardSection title="Data and licences" slug="licences">{LICENCES.map((l) => <Txt key={l} v="body" tone="secondary">• {l}</Txt>)}</CardSection>
      <CardSection title="Limits (what it does not do)" slug="limits">{LIMITS.map((l) => <Txt key={l} v="body" tone="secondary">• {l}</Txt>)}</CardSection>
    </ScreenScroll>
  );
}
