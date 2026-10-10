import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import CompareMap from "../components/map/CompareMap";
import SensitivityLab from "../components/panel/SensitivityLab";
import ChangeCard from "../components/result/ChangeCard";
import ChangeList from "../components/result/ChangeList";
import CounterText from "../components/result/CounterText";
import DetectorSwitch, { DETECTOR_LABEL } from "../components/result/DetectorSwitch";
import ExportMenu from "../components/result/ExportMenu";
import FilterBar from "../components/result/FilterBar";
import ImageViewer from "../components/result/ImageViewer";
import ImpactPanel from "../components/result/ImpactPanel";
import Legend from "../components/result/Legend";
import LimitsCard from "../components/result/LimitsCard";
import { centroidText, copyText } from "../components/result/clipboard";
import { readPermalink, writePermalink } from "../components/result/permalink";
import ResultHeader from "../components/result/ResultHeader";
import { DropCounts, SceneEvalTable, WarningsBanner } from "../components/result/ResultInfo";
import { FilterToggle, LabelsSwitch, PolygonsSwitch } from "../components/result/Switches";
import { CardSection, EmptyState, ErrorState, InlineAlert, Skeleton, TabSegment } from "../components/ui/Primitives";
import SaveOffline from "../components/scenes/SaveOffline";
import { useRaw, useScene } from "../hooks/useScene";
import { type FilterState, mapFilter, passes, tabCounts } from "../lib/filters";
import { rankMarkers } from "../lib/explain";
import { isOfflineError } from "../lib/offline";
import type { ChangeProps, Detector } from "../lib/types";
import { isModified, useFilters } from "../store/filters";
import { reviewKey, useReview } from "../store/review";
import { useUi } from "../store/ui";

const TABS: [FilterState["tab"], string][] = [["all", "All"], ["review", "Needs review"], ["confirmed", "Confirmed"], ["dismissed", "Dismissed"]];

function ResultSkeleton() {
  return (
    <div data-testid="result-skeleton" role="status" aria-label="Loading scene" className="mx-auto max-w-[1500px] px-s12 py-s12 md:px-s18">
      <span className="sr-only">Loading scene…</span>
      <Skeleton width={280} height={28} />
      <div className="mt-s12 grid gap-s12 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-s12">
          <Skeleton height={48} />
          <Skeleton height={420} radius={13} />
        </div>
        <div className="flex flex-col gap-s12">
          <Skeleton height={180} radius={13} />
          <Skeleton height={220} radius={13} />
          <Skeleton height={160} radius={13} />
        </div>
      </div>
    </div>
  );
}

export default function Result({ job = false }: { job?: boolean }) {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const requested: Detector = readPermalink(params).mode;
  const scene = useScene(id, job, requested);
  const { data } = scene;
  const showToast = useUi((s) => s.showToast);

  // ---- view state (zustand) <-> URL permalink: sel, filter, swipe, mode ----
  const tiers = useFilters((s) => s.tiers);
  const types = useFilters((s) => s.types);
  const minAreaM2 = useFilters((s) => s.minAreaM2);
  const minConfidence = useFilters((s) => s.minConfidence);
  const tab = useFilters((s) => s.tab);
  const filterOn = useFilters((s) => s.filterOn);
  const selectedId = useFilters((s) => s.selectedId);
  const swipePct = useFilters((s) => s.swipePct);
  const showLabels = useFilters((s) => s.showLabels);
  const showPolygons = useFilters((s) => s.showPolygons);

  const key = `${job ? "job" : "scene"}:${id}`;
  const [hydrated, setHydrated] = useState("");
  const lastWritten = useRef<string | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const setParamsRef = useRef(setParams);
  setParamsRef.current = setParams;

  // a new scene starts from a clean view...
  useLayoutEffect(() => {
    useFilters.getState().resetAll();
    lastWritten.current = null;
  }, [key]);
  // ...then the permalink is applied (also when the address changes from outside, e.g. a pasted link): the same link, the same view
  const paramsStr = params.toString();
  useLayoutEffect(() => {
    if (paramsStr === lastWritten.current) return; // our own write
    const pl = readPermalink(new URLSearchParams(paramsStr));
    const st = useFilters.getState();
    st.setSelectedId(pl.sel);
    st.setFilterOn(pl.filterOn);
    st.setSwipePct(pl.swipe);
    lastWritten.current = paramsStr;
    setHydrated(key);
  }, [paramsStr, key]);
  const ready = hydrated === key;

  const commitUrl = (mode?: Detector) => {
    const st = useFilters.getState();
    const next = writePermalink(paramsRef.current, {
      sel: st.selectedId, filterOn: st.filterOn, swipe: st.swipePct, mode: mode ?? readPermalink(paramsRef.current).mode,
    });
    if (next.toString() === paramsRef.current.toString()) return;
    lastWritten.current = next.toString();
    setParamsRef.current(next, { replace: true });
  };
  const commitRef = useRef(commitUrl);
  commitRef.current = commitUrl;
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => commitRef.current(), 120); // the divider moves continuously; write the link once it settles
    return () => clearTimeout(t);
  }, [ready, selectedId, filterOn, swipePct]);

  const setSelectedId = useFilters((s) => s.setSelectedId);
  const onDetector = (d: Detector) => {
    setSelectedId(null); // change ids differ between detectors
    commitUrl(d);
  };

  // ---- derived data ----
  const rk = reviewKey(id, data?.detector);
  const decisions = useReview((s) => s.decisions[rk]);
  const setReview = useReview((s) => s.set);
  const status = useCallback((fid: number) => decisions?.[fid] ?? "pending", [decisions]);
  const raw = useRaw(data?.dataBase ?? data?.base, !filterOn);

  const props = useMemo(() => data?.filtered.features.map((x) => x.properties) ?? [], [data?.filtered]);
  const f = useMemo<FilterState>(() => ({ tiers, types, minAreaM2, minConfidence, tab }), [tiers, types, minAreaM2, minConfidence, tab]);
  const visible = useMemo(() => props.filter((p) => passes(p, f, status(p.id))), [props, f, status]);
  const hidden = useMemo(() => {
    const keep = new Set(visible.map((p) => p.id));
    return props.filter((p) => !keep.has(p.id)).map((p) => p.id);
  }, [props, visible]);
  const filterExpr = useMemo(() => mapFilter({ ...f, tab: "all" }, hidden), [f, hidden]);
  const counts = useMemo(() => tabCounts(props, f, status), [props, f, status]);
  const changeTypes = useMemo(() => [...new Set(props.map((p) => p.change_type))], [props]);
  const maxArea = useMemo(() => props.reduce((m, p) => Math.max(m, p.area_m2), 0), [props]);
  const confirmed = useMemo(() => props.filter((p) => status(p.id) === "confirmed"), [props, status]);
  const markers = useMemo(() => rankMarkers(visible), [visible]);

  const filterActions = useFilters.getState();
  const onFilterChange = (patch: Partial<FilterState>) => {
    if (patch.tiers) filterActions.setTiers(patch.tiers);
    if ("types" in patch) filterActions.setTypes(patch.types ?? null);
    if (patch.minAreaM2 != null) filterActions.setMinAreaM2(patch.minAreaM2);
    if (patch.minConfidence != null) filterActions.setMinConfidence(patch.minConfidence);
  };
  const copyCentroid = async (p: ChangeProps) => showToast((await copyText(centroidText(p))) ? "Copied" : "Could not copy, select the numbers instead");

  if (scene.loading || (!scene.error && !ready)) return <ResultSkeleton />;
  if (scene.error || !data) {
    const offline = !job && isOfflineError(scene.error);
    return (
      <div className="mx-auto max-w-xl p-s18" data-testid={offline ? "scene-not-saved" : undefined}>
        <ErrorState
          message={offline
            ? "This scene was not saved for offline use. Connect to the internet, or open it once while online."
            : `Could not load this scene (${scene.error ?? "no data"}).`}
          onRetry={scene.retry} />
        <p className="text-center"><Link to={job ? "/analyse" : "/"} className="tap text-accent">{job ? "Back to Analyse" : "Back to scenes"}</Link></p>
      </div>
    );
  }

  const s = data.summary;
  const radar = data.meta.mode === "radar";
  const sel = props.find((p) => p.id === selectedId);
  const variants = data.meta.variants ?? [];
  const spectralShown = (data.detector ?? "spectral") === "spectral";
  const rawLoading = !filterOn && !raw;
  const href = typeof window === "undefined" ? "" : window.location.href;

  return (
    <div data-testid="result" data-detector={data.detector ?? "spectral"} className="mx-auto max-w-[1500px] px-s12 pb-s26 md:px-s18">
      <ResultHeader name={data.meta.name} subtitle={s.subtitle ?? data.meta.place} event={data.meta.event} kind={job ? "live" : "demo"}
        backTo={job ? "/analyse" : "/"} backLabel={job ? "Analyse" : "Scenes"}
        action={job ? undefined : <SaveOffline ids={[id]} />} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-s12 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        {/* ---- left: the map and what the filter did ---- */}
        <div className="flex min-w-0 flex-col gap-s12">
          <div className="flex flex-wrap items-center gap-x-s18 gap-y-s4">
            <FilterToggle value={filterOn} onChange={useFilters.getState().setFilterOn} />
            {radar && <LabelsSwitch value={showLabels} onChange={useFilters.getState().setShowLabels} />}
            <PolygonsSwitch value={showPolygons} onChange={useFilters.getState().setShowPolygons} />
          </div>
          <div className="sticky top-[65px] z-20 -mx-s12 bg-bg/95 px-s12 py-s4 backdrop-blur md:-mx-s18 md:px-s18 lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <CounterText rawCount={s.raw_detections} keptCount={s.after_filter} filterOn={filterOn} />
          </div>

          {variants.length > 0 && (
            <DetectorSwitch value={requested === scene.mode ? requested : scene.mode} variants={variants} spectral={scene.spectral}
              loading={scene.variantLoading ? scene.mode : undefined} error={scene.variantError} onChange={onDetector} onRetry={scene.retry} />
          )}

          <div className="relative h-[62vh] min-h-[360px] lg:h-[min(72vh,760px)] lg:min-h-[480px]">
            <CompareMap scene={data} filterOn={filterOn} raw={raw} showLabels={showLabels} showPolygons={showPolygons}
              filter={filterExpr} selected={selectedId ?? undefined} onSelect={setSelectedId}
              swipe={swipePct} onSwipe={useFilters.getState().setSwipePct}
              markers={markers} selectedProps={sel} total={props.length} onClear={() => setSelectedId(null)} />
            {(scene.variantLoading || rawLoading) && (
              <div role="status" className="pointer-events-none absolute bottom-s8 left-1/2 z-30 -translate-x-1/2 rounded-xs border border-line bg-surface-alt px-s12 py-s4 text-micro text-fg shadow-card">
                {scene.variantLoading ? `Loading ${DETECTOR_LABEL[scene.mode]} results…` : "Loading raw detections…"}
              </div>
            )}
          </div>
          <Legend radar={radar} />
          <DropCounts dropped={s.dropped} />
          <WarningsBanner warnings={s.warnings} />
          <SceneEvalTable evaluation={s.evaluation} />
        </div>

        {/* ---- right: impact, the selected change, the ranked list and exports ---- */}
        <aside aria-label="Changes and exports" className="thin-scroll flex flex-col gap-s12 [&>*]:shrink-0 lg:sticky lg:top-[77px] lg:max-h-[calc(100vh-89px)] lg:overflow-y-auto lg:pr-1">
          <ImpactPanel summary={s} />
          <ChangeCard feature={sel} base={data.dataBase ?? data.base} total={props.length} status={sel ? status(sel.id) : "pending"}
            onReview={(st) => sel && setReview(rk, sel.id, st)} />

          <CardSection title={`Changes, ranked (${visible.length.toLocaleString("en-IN")})`} testid="changes">
            {props.length === 0 ? (
              <EmptyState title="No changes found - that is a result too." body="Nothing survived the false-alarm filter between these two dates." />
            ) : (
              <>
                <TabSegment tabs={TABS} active={tab} onChange={useFilters.getState().setTab} counts={counts} />
                <FilterBar embedded filters={f} types={changeTypes} maxAreaM2={maxArea} modified={isModified(f)}
                  onChange={onFilterChange} onReset={useFilters.getState().resetFilters} />
                <div role="tabpanel" aria-label={TABS.find(([k]) => k === tab)?.[1]} className="mt-s12">
                  <ChangeList items={visible} status={status} selectedId={selectedId} onSelect={setSelectedId}
                    onLongPress={copyCentroid} filtersActive={isModified(f) || tab !== "all"}
                    onResetFilters={() => { useFilters.getState().resetFilters(); }} />
                </div>
              </>
            )}
          </CardSection>

          {!radar && spectralShown && <SensitivityLab base={data.base} />}
          {!radar && !spectralShown && (
            <InlineAlert variant="info" message="The sensitivity lab models the rule-based (spectral) engine only. Switch the detector to Spectral rules to use it." />
          )}
          <ExportMenu scene={data} confirmed={confirmed} url={href} />
          <LimitsCard limits={s.limits} sources={s.sources} />
        </aside>
      </div>
      <ImageViewer />
    </div>
  );
}
