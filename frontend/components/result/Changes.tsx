import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { FlatList, Image, Linking, View } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useMotion } from "../../hooks/useMotion";
import { area, coord, ha, pct } from "../../lib/format";
import { TIERS, tierLabel, typeLabel } from "../../lib/tiers";
import { triggerHaptic } from "../../lib/haptics";
import type { FilterState } from "../../lib/filters";
import type { ChangeProps, ReviewStatus, Tier } from "../../lib/types";
import { useUi } from "../../store/ui";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { ChipScroller } from "../layout/Scrollers";
import { Button } from "../ui/Button";
import { CardSection } from "../ui/Card";
import { Chip, SliderField } from "../ui/Controls";
import { Press } from "../ui/Press";
import { TierIcon } from "../ui/TierIcon";
import { Txt } from "../ui/Txt";
import { TierChip } from "./TierChip";

type Tab = FilterState["tab"];
const TABS: [Tab, string][] = [["all", "All"], ["review", "Needs review"], ["confirmed", "Confirmed"], ["dismissed", "Dismissed"]];

/** R-22: tabs with an underline that slides (A-06). */
export function TabSegment({ activeTab, onChange, counts }: { activeTab: Tab; onChange: (t: Tab) => void; counts?: Partial<Record<Tab, number>> }) {
  const { c } = useTheme();
  const { ms } = useMotion();
  const [xs, setXs] = useState<Record<string, { x: number; w: number }>>({});
  const x = useSharedValue(0), w = useSharedValue(0);
  useEffect(() => {
    const m = xs[activeTab];
    if (m) { x.value = withTiming(m.x, { duration: ms(220) }); w.value = withTiming(m.w, { duration: ms(220) }); }
  }, [activeTab, xs, x, w, ms]);
  const bar = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: w.value }));
  return (
    <View accessibilityRole="tablist" style={{ borderBottomColor: c.border, borderBottomWidth: 1 }}>
      <ChipScroller>
        {TABS.map(([k, label]) => (
          <Press key={k} testID={`tab-${k}`} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: activeTab === k }} onPress={() => onChange(k)}
            onLayout={(e) => { const { x: lx, width } = e.nativeEvent.layout; setXs((p) => (p[k]?.x === lx && p[k]?.w === width ? p : { ...p, [k]: { x: lx, w: width } })); }}
            style={{ paddingHorizontal: space[3] }}>
            <Txt v="small" tone={activeTab === k ? "accent" : "secondary"}>{label}{counts?.[k] != null ? ` (${counts[k]})` : ""}</Txt>
          </Press>
        ))}
      </ChipScroller>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", bottom: -1, height: 2, backgroundColor: c.accent }, bar]} />
    </View>
  );
}

/** R-23 */
export function ChangeRow({ feature: p, isSelected, onSelect, index, status }: { feature: ChangeProps; isSelected: boolean; onSelect: (id: number) => void; index: number; status: ReviewStatus }) {
  const { c } = useTheme();
  const { reduced } = useMotion();
  const showToast = useUi((s) => s.showToast);
  const copy = async () => { await Clipboard.setStringAsync(`${p.centroid_lat},${p.centroid_lon}`); triggerHaptic("light"); showToast("Copied"); };
  return (
    <Animated.View entering={!reduced && index < 12 ? FadeInDown.duration(260).delay(index * 40) : undefined}>
      <Press testID="change-row" accessibilityRole="button" accessibilityState={{ selected: isSelected }}
        accessibilityLabel={`Change ${p.id}, ${tierLabel(p.tier)}, ${typeLabel(p.change_type)}, ${area(p.area_m2)}, confidence ${pct(p.confidence)}${status === "confirmed" ? ", confirmed" : status === "dismissed" ? ", dismissed" : ""}. Long press to copy coordinates.`}
        onPress={() => onSelect(p.id)} onLongPress={copy}
        style={{ flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[2], borderBottomColor: c.border, borderBottomWidth: 1,
          backgroundColor: isSelected ? c.accentSoft : "transparent", opacity: status === "dismissed" ? 0.55 : 1 }}>
        <Txt v="small" style={{ width: 34 }}>{p.id}{status === "confirmed" ? " ✓" : ""}</Txt>
        <View style={{ width: 84 }}><TierChip tier={p.tier} /></View>
        <Txt v="tiny" tone="secondary" style={{ flex: 1 }} numberOfLines={1}>{typeLabel(p.change_type)}</Txt>
        <Txt v="small" style={{ width: 68, textAlign: "right", fontVariant: ["tabular-nums"] }}>{area(p.area_m2)}</Txt>
        <Txt v="tiny" tone="muted" style={{ width: 38, textAlign: "right" }}>{pct(p.confidence)}</Txt>
      </Press>
    </Animated.View>
  );
}

/** L-08 */
export function ChangeFlatList({ changes, selectedId, onSelect, status, tab, onTab, counts }: {
  changes: ChangeProps[]; selectedId: number | null; onSelect: (id: number) => void; status: (id: number) => ReviewStatus; tab: Tab; onTab: (t: Tab) => void; counts?: Partial<Record<Tab, number>>;
}) {
  return (
    <View testID="change-list">
      <CardSection title={`Changes, ranked (${changes.length})`} slug="changes">
        <TabSegment activeTab={tab} onChange={onTab} counts={counts} />
        <FlatList data={changes} keyExtractor={(p) => String(p.id)} style={{ maxHeight: 360 }} nestedScrollEnabled initialNumToRender={20} windowSize={7}
          renderItem={({ item, index }) => <ChangeRow feature={item} index={index} isSelected={selectedId === item.id} onSelect={onSelect} status={status(item.id)} />}
          ListEmptyComponent={<Txt v="body" tone="muted" style={{ padding: space[3] }}>No changes match these filters.</Txt>} />
      </CardSection>
    </View>
  );
}

/** R-25 */
export function ChangeCard({ feature: p, base, reviewStatus, onReview }: { feature?: ChangeProps; base: string; reviewStatus: ReviewStatus; onReview: (s: ReviewStatus) => void }) {
  const { c } = useTheme();
  const { ms, reduced } = useMotion();
  const open = useUi((s) => s.openImageViewer);
  const showToast = useUi((s) => s.showToast);
  const flash = useSharedValue(0);
  const pop = useSharedValue(1);
  const [hide, setHide] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!p || reduced) return;
    flash.value = withSequence(withTiming(1, { duration: 0 }), withTiming(0, { duration: ms(400) }));
    pop.value = 0.94; pop.value = withSpring(1, { damping: 12 });
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const bg = useAnimatedStyle(() => ({ backgroundColor: flash.value > 0.01 ? c.accentSoft : "transparent", borderRadius: radius.md }));
  const btn = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  if (!p) {
    return (
      <View testID="change-card">
        <CardSection title="Selected change" slug="selected"><Txt v="body" tone="muted">Click a polygon on the map or a row in the list.</Txt></CardSection>
      </View>
    );
  }
  const copy = async () => { await Clipboard.setStringAsync(`${p.centroid_lat},${p.centroid_lon}`); triggerHaptic("light"); showToast("Copied"); };
  const setStatus = (s: ReviewStatus) => { triggerHaptic(s === "confirmed" ? "success" : "light"); onReview(reviewStatus === s ? "pending" : s); };
  return (
    <Animated.View style={bg}>
      <View testID="change-card">
        <CardSection title="Selected change" slug="selected">
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            <TierChip tier={p.tier} /><Txt v="small">#{p.id} {typeLabel(p.change_type)}</Txt>
          </View>
          <Txt v="metric" style={{ fontSize: 24 }}>{area(p.area_m2)}</Txt>
          <Txt v="body">Confidence {pct(p.confidence)}{p.needs_review ? <Txt v="small" tone="warning"> · needs review</Txt> : null} · magnitude {p.magnitude.toFixed(2)}</Txt>
          {p.cropland_ha != null && p.cropland_ha > 0 && <Txt v="body">Cropland inside: {ha(p.cropland_ha, 2)}</Txt>}
          <Txt testID="reason" v="body" tone="secondary"><Txt v="small">Why: </Txt>{p.reason}</Txt>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space[1] }}>
            <Txt v="body">{coord(p.centroid_lat)}, {coord(p.centroid_lon)}</Txt>
            <Press testID="copy-coords" accessibilityLabel="Copy coordinates" onPress={copy}><Txt v="small" tone="accent">copy</Txt></Press>
            <Press testID="open-maps" accessibilityRole="link" accessibilityLabel="Open in Maps" onPress={() => Linking.openURL(`https://www.google.com/maps?q=${p.centroid_lat},${p.centroid_lon}`)}><Txt v="small" tone="accent">open in Maps</Txt></Press>
          </View>
          <View style={{ flexDirection: "row", gap: space[2] }}>
            {(["before", "after"] as const).map((side) => !hide[side] && (
              <Press key={side} minSize={false} accessibilityRole="imagebutton" accessibilityLabel={`${side} crop of change ${p.id}. Tap to enlarge`} style={{ flex: 1, gap: 2 }} onPress={() => open(`${base}/crops/${p.id}_${side}.webp`)}>
                <Image source={{ uri: `${base}/crops/${p.id}_${side}.webp` }} resizeMode="cover" onError={() => setHide((h) => ({ ...h, [side]: true }))}
                  style={{ width: "100%", aspectRatio: 1, borderRadius: radius.sm, backgroundColor: c.skeletonBase }} />
                <Txt v="micro" tone="muted" style={{ textAlign: "center" }}>{side}</Txt>
              </Press>
            ))}
          </View>
          <Animated.View style={[{ flexDirection: "row", gap: space[2] }, btn]}>
            <Button name="confirm" label={reviewStatus === "confirmed" ? "✓ Confirmed" : "✓ Confirm"} variant={reviewStatus === "confirmed" ? "success" : "secondary"} onPress={() => setStatus("confirmed")} style={{ flex: 1 }} />
            <Button name="dismiss" label={reviewStatus === "dismissed" ? "✗ Dismissed" : "✗ Dismiss"} variant={reviewStatus === "dismissed" ? "danger" : "secondary"} onPress={() => setStatus("dismissed")} style={{ flex: 1 }} />
          </Animated.View>
        </CardSection>
      </View>
    </Animated.View>
  );
}

/** R-26 */
export function FilterBar({ filters, types, onToggleTier, onTypes, onMinArea, onMinConfidence, onReset }: {
  filters: FilterState; types: string[]; onToggleTier: (t: Tier) => void; onTypes: (t: string[] | null) => void; onMinArea: (v: number) => void; onMinConfidence: (v: number) => void; onReset: () => void;
}) {
  const modified = filters.tiers.length < 4 || filters.types != null || filters.minAreaM2 > 0 || filters.minConfidence > 0;
  return (
    <View testID="filter-bar">
      <CardSection title="Filters" slug="filters" collapsible defaultOpen>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          {TIERS.map((t) => <Chip key={t} testID={`tier-${t}`} label={tierLabel(t)} selected={filters.tiers.includes(t)} onPress={() => onToggleTier(t)} icon={<TierIcon tier={t} size={12} />} />)}
        </View>
        {types.length > 1 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            <Chip label="All types" selected={filters.types == null} onPress={() => onTypes(null)} />
            {types.map((t) => <Chip key={t} label={typeLabel(t)} selected={filters.types?.[0] === t} onPress={() => onTypes([t])} />)}
          </View>
        )}
        <SliderField name="minarea" label="Minimum area" value={filters.minAreaM2} min={0} max={20000} step={500} onChange={onMinArea} format={area} />
        <SliderField name="minconf" label="Minimum confidence" value={filters.minConfidence} min={0} max={0.95} step={0.05} onChange={onMinConfidence} format={pct} />
        {modified && <Button name="reset-filters" label="Reset filters" variant="ghost" onPress={onReset} />}
      </CardSection>
    </View>
  );
}
