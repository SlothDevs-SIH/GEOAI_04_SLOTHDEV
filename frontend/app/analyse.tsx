import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import AreaPicker from "../components/analyse/AreaPicker";
import { DateField, FilePickerField, Select, type Picked } from "../components/analyse/Fields";
import { ProgressStepper } from "../components/analyse/Progress";
import { ScreenScroll } from "../components/layout/Screen";
import { TableScroller } from "../components/layout/Scrollers";
import { EmptyState, InlineAlert } from "../components/ui/Alerts";
import { Button } from "../components/ui/Button";
import { CardSection } from "../components/ui/Card";
import { Chip, LabeledSwitch } from "../components/ui/Controls";
import { Press } from "../components/ui/Press";
import { Txt } from "../components/ui/Txt";
import { useOnline } from "../hooks/useOnline";
import { API_URL, type FetchPreview, type JobState, apiHealth, fetchPreview, getJob, getJobSummary, startFetch } from "../lib/api";
import { type Box, PLACES, boxProblem, sizeKm } from "../lib/aoi";
import { area, num } from "../lib/format";
import { space } from "../theme/tokens";

type Source = "area" | "upload" | "radar";
type OpticalResult = { raw_detections: number; after_filter: number; total_area_m2: number };
type RadarResult = { mode: "radar"; after_filter: number; flooded_ha: number };
type Result = OpticalResult | RadarResult;
const isRadar = (r: Result): r is RadarResult => (r as RadarResult).mode === "radar";
// Same season on both dates avoids crop changes showing up as change; both dates are in the dry season here.
const DEFAULTS = { before: "2020-01-20", after: "2025-01-20" };
const PRESETS = [
  { value: "encroachment", label: "Encroachment (construction, water loss)" }, { value: "flood", label: "Flood (new water)" },
  { value: "deforestation", label: "Deforestation" }, { value: "general", label: "All change types" },
];

export default function Analyse() {
  const router = useRouter();
  const net = useOnline();
  const [api, setApi] = useState<boolean>();
  const [source, setSource] = useState<Source>("area");
  const [preset, setPreset] = useState("encroachment");
  const [box, setBox] = useState<Box>();
  const [placeIdx, setPlaceIdx] = useState(0);
  const [beforeDate, setBeforeDate] = useState(DEFAULTS.before);
  const [afterDate, setAfterDate] = useState(DEFAULTS.after);
  const [composite, setComposite] = useState(1);
  const [persist, setPersist] = useState(false);
  const [pick, setPick] = useState<FetchPreview>();
  const [pickError, setPickError] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [before, setBefore] = useState<Picked>();
  const [after, setAfter] = useState<Picked>();
  const [job, setJob] = useState<JobState>();
  const [jobId, setJobId] = useState<string>();
  const [result, setResult] = useState<Result>();
  const [openable, setOpenable] = useState(false);

  useEffect(() => { apiHealth().then(setApi); }, []);
  useEffect(() => {
    if (!jobId) return;
    const t = setInterval(async () => {
      try {
        const j = await getJob(jobId);
        setJob(j);
        if (j.status === "done") { clearInterval(t); setResult(await getJobSummary<Result>(jobId)); }
        if (j.status === "error") clearInterval(t);
      } catch (e) { setJob({ status: "error", error: (e as Error).message }); clearInterval(t); }
    }, 1000);
    return () => clearInterval(t);
  }, [jobId]);

  const problem = boxProblem(box);
  const datesOk = beforeDate < afterDate;
  const persistOk = preset !== "flood"; // flood water recedes, so requiring it to persist would remove real change
  const request = () => ({ bbox: box as Box, before_date: beforeDate, after_date: afterDate, preset, composite, persistence: persist && persistOk ? 2 : 0 });
  const reset = () => { setJob(undefined); setJobId(undefined); setResult(undefined); };

  const check = async () => {
    if (!box || problem) return;
    setChecking(true); setPick(undefined); setPickError(undefined);
    try { setPick(await fetchPreview(request())); } catch (e) { setPickError((e as Error).message); } finally { setChecking(false); }
  };
  const analyseArea = async () => {
    if (!box || problem || !datesOk) return;
    reset(); setOpenable(true); setJob({ status: "queued", stage: "queued" });
    try { setJobId((await startFetch(request())).job_id); } catch (e) { setJob({ status: "error", error: (e as Error).message }); }
  };
  const submitUpload = async (radar: boolean) => {
    if (!after || (!radar && !before)) return;
    reset(); setOpenable(!radar);
    const fd = new FormData();
    if (before && !radar) fd.append("before", before.file as never);
    fd.append("after", after.file as never);
    fd.append("preset", radar ? "flood" : preset);
    fd.append("mode", radar ? "radar" : "spectral");
    setJob({ status: "uploading" });
    try {
      const r = await fetch(`${API_URL}/analyze`, { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) return setJob({ status: "error", error: d.detail ?? r.statusText });
      setJobId(d.job_id);
    } catch (e) { setJob({ status: "error", error: (e as Error).message }); }
  };

  if (api === undefined) return <ScreenScroll><Txt v="body" tone="muted">Checking the live analysis service…</Txt></ScreenScroll>;
  if (!api || !net) return (
    <ScreenScroll maxWidth={720}>
      <View testID="analyse-offline">
        <EmptyState title="Live analysis is offline"
          body={`The analysis server is not reachable${API_URL ? " (it may be waking up; try again in a minute)" : " (no API is configured for this deployment)"}. The demo scenes work without it.`}
          actionLabel="Open the demo scenes" onAction={() => router.push("/")} />
      </View>
    </ScreenScroll>
  );

  const running = job?.status === "running" || job?.status === "queued" || job?.status === "uploading";
  const presetSel = <Select testID="preset" label="What to look for" options={PRESETS} value={preset} onChange={setPreset} />;
  const tabs: [Source, string][] = [["area", "Draw an area"], ["upload", "Upload two images"], ["radar", "Radar flood (Sentinel-1)"]];
  const canGo = !!box && !problem && datesOk;

  return (
    <ScreenScroll maxWidth={900}>
      <Txt v="h1" accessibilityRole="header">Analyse any area</Txt>
      <Txt v="body" tone="secondary">Draw a box anywhere in India (or the world), pick two dates, and we fetch the two clearest Sentinel-2 images and find what really changed. Or upload your own images.</Txt>
      <View accessibilityRole="tablist" style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
        {tabs.map(([k, l]) => <Chip key={k} testID={`tab-${k}`} label={l} selected={source === k} onPress={() => { setSource(k); reset(); }} />)}
      </View>

      {source === "area" && (
        <CardSection title="1 · Draw the area and choose the dates" slug="area">
          <Select testID="place" label="Jump to" options={PLACES.map((p, i) => ({ value: i, label: p.name }))} value={placeIdx} onChange={setPlaceIdx} />
          <AreaPicker box={box} onChange={(b) => { setBox(b); setPick(undefined); }} place={PLACES[placeIdx]} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], flexWrap: "wrap" }}>
            {box && <Button name="clear-box" label="Clear box" variant="secondary" onPress={() => { setBox(undefined); setPick(undefined); }} />}
            {box && !problem && <Txt testID="box-size" v="small">{sizeKm(box).map((v) => v.toFixed(1)).join(" × ")} km</Txt>}
          </View>
          <Txt testID="box-problem" v="tiny" tone={problem && box ? "danger" : "muted"}>{problem ?? "Area looks good."}</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3] }}>
            <DateField testID="date-before" label="Before date" value={beforeDate} min="2017-01-01" onChange={(v) => { setBeforeDate(v); setPick(undefined); }} />
            <DateField testID="date-after" label="After date" value={afterDate} min="2017-01-01" onChange={(v) => { setAfterDate(v); setPick(undefined); }} />
          </View>
          <Txt v="tiny" tone="muted">Choose the same time of year for both dates, so growing crops are not mistaken for change. We use the clearest image within about 20 days of each date.</Txt>
          {!datesOk && <Txt v="tiny" tone="danger">The before date must be earlier than the after date.</Txt>}
          {presetSel}
          <View testID="advanced">
            <CardSection title="Extra filters (optional, off by default)" slug="advanced-filters" collapsible defaultOpen={false}>
              <Select testID="composite" label="Images per date" value={composite} onChange={(v) => { setComposite(Number(v)); setPick(undefined); }}
                options={[{ value: 1, label: "The single clearest image" }, { value: 3, label: "Median of 3 images (smooths one-off clouds; slower; did not reduce false alarms in our test)" }]} />
              <View testID="persistence" accessibilityState={{ disabled: !persistOk }} style={{ opacity: persistOk ? 1 : 0.5 }}>
                <LabeledSwitch testID="persistence-switch" label="Keep a change only if it is also seen in a second, later image" value={persist && persistOk} onChange={(v) => persistOk && setPersist(v)} />
              </View>
              <Txt v="tiny" tone="muted">For construction, not floods. In our test: 27% fewer detections on a no-construction area, and 15% less changed area on a real-construction area, so it trades some real change for fewer false alarms.</Txt>
            </CardSection>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            <Button name="check-scenes" label="Check scenes" variant="secondary" loading={checking} disabled={!canGo} onPress={check} />
            <Button name="analyse-area" label="Analyse this area" disabled={!canGo || running} onPress={analyseArea} />
          </View>
          {pickError && <View testID="pick-error"><InlineAlert variant="error" message={pickError} /></View>}
          {pick && (
            <View testID="scene-pick" style={{ gap: space[1] }}>
              <Txt v="small">Images that will be used ({pick.size_km.map((v) => v.toFixed(1)).join(" × ")} km):</Txt>
              <TableScroller minWidth={440}>
                <View style={{ flexDirection: "row" }}>{["Image", "Date", "Cloud / no-data over the box", "Days from your date"].map((h) => <Txt key={h} v="tiny" tone="muted" style={{ flex: 1 }}>{h}</Txt>)}</View>
                {(["before", "after"] as const).map((k) => (
                  <View key={k} style={{ flexDirection: "row", paddingVertical: space[1] }}>
                    <Txt v="body" style={{ flex: 1 }}>{k}</Txt><Txt v="body" style={{ flex: 1 }}>{pick[k].date}</Txt>
                    <Txt v="body" style={{ flex: 1 }}>{pick[k].aoi_invalid_pct}%</Txt><Txt v="body" style={{ flex: 1 }}>{pick[k].days_from_target > 0 ? "+" : ""}{pick[k].days_from_target}</Txt>
                  </View>
                ))}
              </TableScroller>
              {pick.warnings.map((w) => <InlineAlert key={w} variant="warning" message={w} />)}
            </View>
          )}
        </CardSection>
      )}

      {source === "upload" && (
        <CardSection title="1 · Upload two co-registered GeoTIFFs (≥ 4 bands incl. NIR, ≥ 5 m pixels)" slug="upload">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3] }}>
            <FilePickerField testID="file-before" label="Before" picked={before} onPick={setBefore} onClear={() => setBefore(undefined)} />
            <FilePickerField testID="file-after" label="After" picked={after} onPick={setAfter} onClear={() => setAfter(undefined)} />
          </View>
          {presetSel}
          <Button name="analyse-upload" label="Analyse" disabled={!before || !after || running} onPress={() => submitUpload(false)} />
        </CardSection>
      )}

      {source === "radar" && (
        <CardSection title="1 · Upload one Sentinel-1 radar image (GeoTIFF: band 1 = VV in dB, band 2 = VH in dB)" slug="radar">
          <FilePickerField testID="file-radar" label="Radar image (during the flood)" picked={after} onPick={setAfter} onClear={() => setAfter(undefined)} />
          <InlineAlert variant="warning" message="Radar sees through cloud, so it works in the monsoon. It maps open flood water from one date, not before/after change; flooded crops and streets can be missed." />
          <Button name="analyse-radar" label="Map the flood" disabled={!after || running} onPress={() => submitUpload(true)} />
        </CardSection>
      )}

      {job && (
        <CardSection title="2 · Progress" slug="progress">
          <ProgressStepper job={job} />
          {job.fetch && <Txt testID="scenes-used" v="tiny" tone="secondary">Used: before {job.fetch.before.date} ({job.fetch.before.scene}) · after {job.fetch.after.date} ({job.fetch.after.scene})</Txt>}
          {job.error && <View testID="job-error"><InlineAlert variant="error" message={job.error} /></View>}
          {job.warnings?.map((w) => <InlineAlert key={w} variant="warning" message={w} />)}
        </CardSection>
      )}
      {result && jobId && (
        <View testID="analyse-result">
          <CardSection title="3 · Result" slug="result">
            {isRadar(result)
              ? <Txt v="h3"><Txt v="h3" tone="success">{num(result.after_filter)}</Txt> flood areas · {num(result.flooded_ha)} ha of open water</Txt>
              : <Txt v="h3">{num(result.raw_detections)} raw → <Txt v="h3" tone="success">{num(result.after_filter)}</Txt> real changes · {area(result.total_area_m2)}</Txt>}
            {openable && !isRadar(result) && <Button name="open-on-map" label="Open on the swipe map" onPress={() => router.push(`/job/${jobId}`)} />}
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {(isRadar(result) ? ["geojson"] : ["geojson", "gpkg", "pdf", "csv", "kml"]).map((fmt) => (
                <Press key={fmt} accessibilityRole="link" accessibilityLabel={`Download ${fmt}`} style={{ width: "50%" }}
                  onPress={() => { const u = `${API_URL}/jobs/${jobId}/export?format=${fmt}`; if (Platform.OS === "web") window.open(u, "_blank"); else void import("expo-linking").then((L) => L.openURL(u)); }}>
                  <Txt v="small" tone="accent" style={{ textDecorationLine: "underline" }}>Download {fmt.toUpperCase()}</Txt>
                </Press>
              ))}
            </View>
          </CardSection>
        </View>
      )}
    </ScreenScroll>
  );
}
