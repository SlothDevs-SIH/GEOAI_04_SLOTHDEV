import { View } from "react-native";
import { useCountUp } from "../../hooks/useCountUp";
import { ha, num } from "../../lib/format";
import type { Summary } from "../../lib/types";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { CardSection } from "../ui/Card";
import { Txt } from "../ui/Txt";

/** R-21: a number that counts up on first mount (A-05, staggered 80 ms per tile); unknown stays "unknown". */
export function StatTile({ k, label, value, digits = 1, unit, note, index }: { k: string; label: string; value: number | null | undefined; digits?: number; unit?: string; note?: string; index: number }) {
  const { c } = useTheme();
  const v = useCountUp(value ?? 0, 700, index * 80);
  const text = value == null ? "unknown" : `${digits === 0 ? num(v) : v.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
  return (
    <View testID={`stat-${k}`} style={{ flexGrow: 1, flexBasis: "45%", backgroundColor: c.surfaceAlt, borderRadius: radius.sm, padding: space[3] }}>
      <Txt v="metric" style={{ fontSize: 22, lineHeight: 26 }}>{text}</Txt>
      <Txt v="tiny" tone="secondary">{label}{note ? <Txt v="tiny" tone="warning"> ({note})</Txt> : null}</Txt>
    </View>
  );
}

export function ImpactPanel({ impact }: { impact: Summary["impact"] }) {
  return (
    <View testID="impact">
      <CardSection title="Impact" slug="impact">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          <StatTile index={0} k="area" label="Area changed" value={impact.changed_ha} unit="ha" />
          <StatTile index={1} k="cropland" label="Cropland affected" value={impact.cropland_ha} unit="ha" note={impact.cropland_reliability === "upper_bound" ? "upper bound" : undefined} />
          <StatTile index={2} k="builtup" label="Built-up land affected" value={impact.built_up_ha} unit="ha" />
          <StatTile index={3} k="buildings" label="Buildings touched" value={impact.buildings} digits={0} />
        </View>
        {(impact.sources.length > 0 || impact.notes.length > 0) && (
          <View>
            {impact.sources.map((x) => <Txt key={x} v="tiny" tone="muted">Source: {x}</Txt>)}
            {impact.notes.map((x) => <Txt key={x} v="tiny" tone="muted">{x}</Txt>)}
          </View>
        )}
      </CardSection>
    </View>
  );
}
