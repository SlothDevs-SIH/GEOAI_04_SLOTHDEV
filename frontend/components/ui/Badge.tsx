import { View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Txt } from "./Txt";

export type BadgeKind = "demo" | "live" | "offline";
const LABEL: Record<BadgeKind, string> = { demo: "Demo data (precomputed)", live: "Live analysis", offline: "Offline demo data" };

export function DemoBadge({ kind = "demo", testID = "demo-badge" }: { kind?: BadgeKind; testID?: string }) {
  const { c } = useTheme();
  const [fg, bg] = { demo: [c.badgeDemoText, c.badgeDemoBg], live: [c.badgeLiveText, c.badgeLiveBg], offline: [c.badgeOfflineText, c.badgeOfflineBg] }[kind];
  return (
    <View testID={testID} style={{ alignSelf: "flex-start", backgroundColor: bg, borderRadius: radius.xs, paddingHorizontal: space[2], paddingVertical: 2 }}>
      <Txt v="micro" style={{ color: fg }}>{LABEL[kind]}</Txt>
    </View>
  );
}
