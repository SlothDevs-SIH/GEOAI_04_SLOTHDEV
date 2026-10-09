import { View } from "react-native";
import { TIERS, tierLabel } from "../../lib/tiers";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { TierIcon } from "../ui/TierIcon";
import { Txt } from "../ui/Txt";

/** R-04: severity (shape + colour + word), plus raw detections as neutral grey. */
export function Legend({ isRadar, filterOn = true }: { isRadar?: boolean; filterOn?: boolean }) {
  const { c } = useTheme();
  return (
    <View testID="legend" accessibilityLabel="Map legend" style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3], backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.sm, padding: space[2] }}>
      {filterOn ? TIERS.map((t) => (
        <View key={t} style={{ flexDirection: "row", alignItems: "center", gap: space[1] + 2 }}>
          <TierIcon tier={t} size={12} /><Txt v="micro">{tierLabel(t)}</Txt>
        </View>
      )) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] + 2 }}>
          <View style={{ width: 12, height: 12, backgroundColor: c.rawDetection, opacity: 0.6, borderColor: c.rawStroke, borderWidth: 1 }} /><Txt v="micro">Raw candidate (unfiltered)</Txt>
        </View>
      )}
      {isRadar && <Txt v="micro" tone="muted">Radar: flood water is dark</Txt>}
    </View>
  );
}
