import { View } from "react-native";
import type { Tier } from "../../lib/types";
import { tierLabel } from "../../lib/tiers";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { TierIcon } from "../ui/TierIcon";
import { Txt } from "../ui/Txt";

export function TierChip({ tier }: { tier: Tier }) {
  const { c } = useTheme();
  const fg = { critical: c.tierCritical, high: c.tierHigh, medium: c.tierMedium, low: c.tierLow }[tier];
  const bg = { critical: c.tierCriticalSoft, high: c.tierHighSoft, medium: c.tierMediumSoft, low: c.tierLowSoft }[tier];
  return (
    <View testID="tier-chip" accessibilityLabel={`${tierLabel(tier)} severity`}
      style={{ flexDirection: "row", alignItems: "center", gap: space[1] + 2, backgroundColor: bg, borderColor: fg, borderWidth: 1, borderRadius: radius.xs, paddingHorizontal: space[2], paddingVertical: 2, alignSelf: "flex-start" }}>
      <TierIcon tier={tier} size={11} />
      <Txt v="micro" style={{ color: fg }}>{tierLabel(tier)}</Txt>
    </View>
  );
}
