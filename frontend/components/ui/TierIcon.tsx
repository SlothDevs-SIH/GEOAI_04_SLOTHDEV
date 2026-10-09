import Svg, { Path, Rect, Circle } from "react-native-svg";
import type { Tier } from "../../lib/types";
import { useTheme } from "../../theme/ThemeProvider";

/** Octagon / diamond / square / circle: severity is never colour alone. */
export function TierIcon({ tier, size = 14 }: { tier: Tier; size?: number }) {
  const { c } = useTheme();
  const fill = { critical: c.tierCritical, high: c.tierHigh, medium: c.tierMedium, low: c.tierLow }[tier];
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {tier === "critical" && <Path d="M5 1h6l4 4v6l-4 4H5l-4-4V5z" fill={fill} />}
      {tier === "high" && <Path d="M8 0.5L15.5 8L8 15.5L0.5 8z" fill={fill} />}
      {tier === "medium" && <Rect x="2" y="2" width="12" height="12" rx="1" fill={fill} />}
      {tier === "low" && <Circle cx="8" cy="8" r="6.5" fill={fill} />}
    </Svg>
  );
}
