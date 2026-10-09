import { View } from "react-native";
import { useCountUp } from "../../hooks/useCountUp";
import { useMotion } from "../../hooks/useMotion";
import { counterText } from "../../lib/filters";
import { num } from "../../lib/format";
import { DROP_LABEL } from "../../lib/tiers";
import type { Summary } from "../../lib/types";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { TableScroller } from "../layout/Scrollers";
import { CardSection } from "../ui/Card";
import { LabeledSwitch } from "../ui/Controls";
import { Press } from "../ui/Press";
import { Txt } from "../ui/Txt";

export function ResultHeader({ name, subtitle, event, onBack }: { name: string; subtitle: string; event: string; onBack?: () => void }) {
  return (
    <View testID="result-header" style={{ gap: 2 }}>
      {onBack && <Press testID="back" accessibilityLabel="Back to scenes" onPress={onBack} style={{ alignSelf: "flex-start" }}><Txt v="small" tone="accent">← All scenes</Txt></Press>}
      <Txt v="h1" accessibilityRole="header">{name}</Txt>
      <Txt v="body" tone="secondary">{subtitle} · {event}</Txt>
    </View>
  );
}

export const FilterToggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) =>
  <LabeledSwitch testID="filter-toggle" label="False-alarm filter" value={value} onChange={onChange} strong />;
export const LabelsSwitch = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) =>
  <LabeledSwitch testID="labels-toggle" label="Show expert labels" value={value} onChange={onChange} />;
export const PolygonsSwitch = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) =>
  <LabeledSwitch testID="polygons-toggle" label="Polygons" value={value} onChange={onChange} />;

/** R-12: the raw -> real counter. The text is always the final sentence (live region); only the numbers ease (A-03). */
export function CounterText({ rawCount, keptCount, filterOn }: { rawCount: number; keptCount: number; filterOn: boolean }) {
  const kept = useCountUp(filterOn ? keptCount : rawCount, 600);
  const { reduced } = useMotion();
  const shown = reduced ? counterText(rawCount, keptCount, filterOn) : counterText(rawCount, Math.round(kept), filterOn);
  return (
    <Txt testID="counter" v="body" accessibilityLiveRegion="polite" aria-live="polite" style={{ flexShrink: 1 }}>
      {shown}
    </Txt>
  );
}

export function DropCounts({ dropped }: { dropped: Record<string, number> }) {
  const entries = Object.entries(dropped).filter(([, v]) => v > 0);
  if (!entries.length) return null;
  return (
    <Txt testID="drops" v="tiny" tone="secondary">
      <Txt v="tiny" style={{ fontWeight: "700" }}>What the filter removed (pixels): </Txt>
      {entries.map(([k, v], n) => `${n > 0 ? " · " : ""}${num(v)} ${DROP_LABEL[k] ?? k}`).join("")}
    </Txt>
  );
}

export function WarningsBanner({ warnings }: { warnings: string[] }) {
  const { c } = useTheme();
  if (!warnings.length) return null;
  return (
    <View testID="warnings" accessibilityRole="alert" style={{ backgroundColor: c.warningSoft, borderColor: c.warning, borderWidth: 1, borderRadius: radius.sm, padding: space[3], gap: 2 }}>
      {warnings.map((w) => <Txt key={w} v="tiny"><Txt v="tiny" tone="warning">⚠ </Txt>{w}</Txt>)}
    </View>
  );
}

type Ev = NonNullable<Summary["evaluation"]>;
export function SceneEvalTable({ evaluation }: { evaluation: Ev }) {
  const { c } = useTheme();
  const rows: [string, Ev["naive"], boolean][] = [["Naive (per-scene threshold, no filters)", evaluation.naive, false], ["M8 (event threshold + region growing + filters)", evaluation.m8, true]];
  return (
    <View testID="scene-eval">
      <CardSection title="Accuracy on this scene vs expert labels" slug="scene-eval">
        <TableScroller minWidth={520}>
          <View style={{ flexDirection: "row", borderBottomColor: c.border, borderBottomWidth: 1, paddingBottom: 2 }}>
            {["Method", "IoU", "Precision", "Recall", "False-alarm pixels"].map((h, i) => <Txt key={h} v="tiny" tone="muted" style={{ flex: i === 0 ? 2.2 : 1 }}>{h}</Txt>)}
          </View>
          {rows.map(([l, r, bold]) => (
            <View key={l} style={{ flexDirection: "row", paddingVertical: space[1] + 2 }}>
              <Txt v={bold ? "small" : "body"} style={{ flex: 2.2 }}>{l}</Txt>
              {[r.iou, r.precision, r.recall, num(r.fp)].map((x, i) => <Txt key={i} v={bold ? "small" : "body"} style={{ flex: 1 }}>{x}</Txt>)}
            </View>
          ))}
        </TableScroller>
        <Txt v="tiny" tone="muted">{evaluation.against}. Thresholds were fitted without labels.</Txt>
      </CardSection>
    </View>
  );
}

export function LimitsCard({ limits, sources }: { limits: string[]; sources: string[] }) {
  return (
    <View testID="limits">
      <CardSection title="Limits" slug="limits">
        {limits.map((l) => <Txt key={l} v="tiny" tone="secondary">• {l}</Txt>)}
        <Txt v="tiny" tone="muted">Sources: {sources.join(" · ")}</Txt>
      </CardSection>
    </View>
  );
}
