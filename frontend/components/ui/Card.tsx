import { useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useMotion } from "../../hooks/useMotion";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, shadow, space } from "../../theme/tokens";
import { Press } from "./Press";
import { Txt } from "./Txt";

export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { c } = useTheme();
  return <View testID={testID} style={[{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, padding: space[4] }, shadow.card, style]}>{children}</View>;
}

/** L-07: a titled card; collapsible sections animate the chevron (A-11). */
export function CardSection({ title, slug, collapsible, defaultOpen = true, children, style }: {
  title?: string; slug: string; collapsible?: boolean; defaultOpen?: boolean; children: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const { ms } = useMotion();
  const [open, setOpen] = useState(defaultOpen);
  const rot = useSharedValue(defaultOpen ? 180 : 0);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const toggle = () => { setOpen((o) => !o); rot.value = withTiming(open ? 0 : 180, { duration: ms(220) }); };
  return (
    <Card testID={`card-${slug}`} style={style}>
      {title && (collapsible ? (
        <Press onPress={toggle} accessibilityLabel={title} accessibilityState={{ expanded: open }} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Txt v="h3">{title}</Txt>
          <Animated.Text style={[{ color: c.textMuted, fontSize: 14 }, chevron]}>▾</Animated.Text>
        </Press>
      ) : <Txt v="h3" accessibilityRole="header">{title}</Txt>)}
      {(!collapsible || open) && <View style={{ marginTop: title ? space[3] : 0, gap: space[3] }}>{children}</View>}
    </Card>
  );
}
