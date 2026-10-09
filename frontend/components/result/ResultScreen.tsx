import { useGlobalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { View } from "react-native";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useRaw, useScene } from "../../hooks/useData";
import { type FilterState, mapFilter, passes } from "../../lib/filters";
import { patchReview } from "../../lib/api";
import type { Tier } from "../../lib/types";
import { resetView, useFilters } from "../../store/filters";
import { useReview } from "../../store/review";
import { radius, space } from "../../theme/tokens";
import { ScreenScroll } from "../layout/Screen";
import { EmptyState, ErrorState } from "../ui/Alerts";
import { DemoBadge } from "../ui/Badge";
import { Skeleton } from "../ui/Skeleton";
import { ChangeCard, ChangeFlatList, FilterBar } from "./Changes";
import CompareMap from "./CompareMap";
import { ExportMenu, permalinkFor } from "./Export";
import { ImpactPanel } from "./Impact";
import { Legend } from "./Legend";
import { CounterText, DropCounts, FilterToggle, LabelsSwitch, LimitsCard, PolygonsSwitch, ResultHeader, SceneEvalTable, WarningsBanner } from "./ResultBits";
import { SensitivityLab } from "./SensitivityLab";

/** Shared by /scene/[id] and /job/[id]. URL query (sel, filter, swipe) is the source of truth on load and is kept in sync. */
export default function ResultScreen({ job = false }: { job?: boolean }) {
  const { id = "", sel, filter, swipe } = useGlobalSearchParams<{ id: string; sel?: string; filter?: string; swipe?: string }>();
  const router = useRouter();
  const { wide } = useBreakpoint();
  const { data, error, loading, retry } = useScene(id, job);
  const f = useFilters();
  const decisions = useReview((s) => s.decisions[id]);
  const setReview = useReview((s) => s.set);
  const status = (fid: number) => decisions?.[fid] ?? "pending";
  const raw = useRaw(data?.base, !f.filterOn);

  // URL -> store once per scene
  useEffect(() => {
    resetView();
    const st = useFilters.getState();
    if (filter === "off") st.setFilterOn(false);
    if (sel != null && sel !== "" && !Number.isNaN(Number(sel))) st.setSelectedId(Number(sel));
    if (swipe != null && swipe !== "" && !Number.isNaN(Number(swipe))) st.setSwipePct(Number(swipe));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  // store -> URL (debounced so dragging the divider does not flood history)
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => {
      const q: Record<string, string> = {};
      if (f.selectedId != null) q.sel = String(f.selectedId);
      if (!f.filterOn) q.filter = "off";
      if (Math.round(f.swipePct) !== 50) q.swipe = String(Math.round(f.swipePct));
      router.setParams({ sel: q.sel ?? "", filter: q.filter ?? "", swipe: q.swipe ?? "" } as never);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.selectedId, f.filterOn, f.swipePct, data]);

  const props = useMemo(() => data?.filtered.features.map((x) => x.properties) ?? [], [data]);
  const fs: FilterState = { tiers: f.tiers, types: f.types, minAreaM2: f.minAreaM2, minConfidence: f.minConfidence, tab: f.tab };
  const visible = useMemo(() => props.filter((p) => passes(p, fs, status(p.id))), [props, f.tiers, f.types, f.minAreaM2, f.minConfidence, f.tab, decisions]); // eslint-disable-line react-hooks/exhaustive-deps
  const hidden = useMemo(() => props.filter((p) => !visible.includes(p)).map((p) => p.id), [props, visible]);
  const expr = useMemo(() => mapFilter({ ...fs, tab: "all" }, hidden), [f.tiers, f.types, f.minAreaM2, f.minConfidence, hidden]); // eslint-disable-line react-hooks/exhaustive-deps
  const types = useMemo(() => [...new Set(props.map((p) => p.change_type))], [props]);
  const confirmed = props.filter((p) => status(p.id) === "confirmed");
  const counts = useMemo(() => ({
    all: props.length,
    review: props.filter((p) => p.needs_review && status(p.id) === "pending").length,
    confirmed: confirmed.length,
    dismissed: props.filter((p) => status(p.id) === "dismissed").length,
  }), [props, decisions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return (
    <ScreenScroll><View testID="result-skeleton" style={{ gap: space[3] }}><Skeleton height={28} width="50%" /><Skeleton height={420} borderRadius={radius.md} /><Skeleton height={120} /></View></ScreenScroll>
  );
  if (error || !data) return <ScreenScroll><ErrorState message={`Could not load this scene (${error}).`} onRetry={retry} /></ScreenScroll>;

  const s = data.summary;
  const radar = data.meta.mode === "radar";
  const selected = props.find((p) => p.id === f.selectedId);
  const onReview = (st: "pending" | "confirmed" | "dismissed") => { if (!selected) return; setReview(id, selected.id, st); if (job) void patchReview(id, selected.id, st); };
  const toggleTier = (t: Tier) => f.setTiers(f.tiers.includes(t) ? f.tiers.filter((x) => x !== t) : [...f.tiers, t]);

  const main = (
    <View style={{ gap: space[3], flex: 1, minWidth: 0 }}>
      <ResultHeader name={data.meta.name} subtitle={s.subtitle ?? data.meta.place} event={data.meta.event} onBack={() => router.push("/")} />
      <DemoBadge kind={job ? "live" : "demo"} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[3] }}>
        <FilterToggle value={f.filterOn} onChange={f.setFilterOn} />
        {radar && <LabelsSwitch value={f.showLabels} onChange={f.setShowLabels} />}
        <PolygonsSwitch value={f.showPolygons} onChange={f.setShowPolygons} />
        <CounterText rawCount={s.raw_detections} keptCount={s.after_filter} filterOn={f.filterOn} />
      </View>
      <View style={{ height: wide ? 560 : 380 }}>
        <CompareMap scene={data} filterOn={f.filterOn} raw={raw} showLabels={f.showLabels} showPolygons={f.showPolygons} filter={expr}
          selectedId={f.selectedId} onSelect={f.setSelectedId} swipe={f.swipePct} onSwipe={f.setSwipePct} />
      </View>
      <Legend isRadar={radar} filterOn={f.filterOn} />
      <DropCounts dropped={s.dropped} />
      <WarningsBanner warnings={s.warnings} />
      {s.evaluation && <SceneEvalTable evaluation={s.evaluation} />}
    </View>
  );
  const side = (
    <View style={{ gap: space[3], width: wide ? 400 : "100%" }}>
      <ImpactPanel impact={s.impact} />
      <ChangeCard feature={selected} base={data.base} reviewStatus={selected ? status(selected.id) : "pending"} onReview={onReview} />
      {props.length === 0
        ? <EmptyState title="No changes found - that is a result too." />
        : <ChangeFlatList changes={visible} selectedId={f.selectedId} onSelect={f.setSelectedId} status={status} tab={f.tab} onTab={f.setTab} counts={counts} />}
      <FilterBar filters={fs} types={types} onToggleTier={toggleTier} onTypes={f.setTypes} onMinArea={f.setMinAreaM2} onMinConfidence={f.setMinConfidence} onReset={f.resetFilters} />
      {!radar && <SensitivityLab base={data.base} />}
      <ExportMenu scene={data} confirmed={confirmed} permalink={permalinkFor(`${job ? "job" : "scene"}/${id}`)} />
      <LimitsCard limits={s.limits} sources={s.sources} />
    </View>
  );
  return (
    <ScreenScroll maxWidth={1560}>
      <View style={{ flexDirection: wide ? "row" : "column", gap: space[4], alignItems: "flex-start" }}>
        {main}
        {side}
      </View>
    </ScreenScroll>
  );
}
