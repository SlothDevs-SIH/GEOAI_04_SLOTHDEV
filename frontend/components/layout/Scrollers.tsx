import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { space } from "../../theme/tokens";

/** L-06: wide tables scroll sideways inside their card, never the page. */
export function TableScroller({ children, minWidth = 520 }: { children: ReactNode; minWidth?: number }) {
  return (
    <ScrollView testID="table-scroller" horizontal showsHorizontalScrollIndicator>
      <View style={{ minWidth }}>{children}</View>
    </ScrollView>
  );
}

/** L-05: a row of chips that scrolls sideways when it overflows. */
export function ChipScroller({ children }: { children: ReactNode }) {
  return (
    <ScrollView testID="chip-scroller" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], alignItems: "center" }}>
      {children}
    </ScrollView>
  );
}

/** L-03: stacked below 1024 px, side by side above. */
export function TwoPane({ left, right, leftWidth = 420 }: { left: ReactNode; right: ReactNode; leftWidth?: number }) {
  const { wide } = useBreakpoint();
  return (
    <View testID="two-pane" style={{ flexDirection: wide ? "row" : "column", flex: 1, gap: space[4] }}>
      <View style={wide ? { width: leftWidth } : undefined}>{left}</View>
      <View style={{ flex: 1 }}>{right}</View>
    </View>
  );
}
