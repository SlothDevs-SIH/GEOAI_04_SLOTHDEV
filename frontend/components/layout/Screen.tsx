import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";

/** L-01: the standard scrolling page; content is centred and capped on wide screens. */
export function ScreenScroll({ children, onRefresh, refreshing, maxWidth = 1200 }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean; maxWidth?: number }) {
  const { c } = useTheme();
  const { phone } = useBreakpoint();
  return (
    <ScrollView testID="screen-scroll" style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: phone ? space[3] : space[5], paddingBottom: space[6] }}
      refreshControl={onRefresh ? <RefreshControl testID="refresh" refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} /> : undefined}>
      <View style={{ width: "100%", maxWidth, alignSelf: "center", gap: space[4] }}>{children}</View>
    </ScrollView>
  );
}
