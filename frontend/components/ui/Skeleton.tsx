import { useEffect } from "react";
import { type DimensionValue } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useMotion } from "../../hooks/useMotion";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";

/** G-03: A-14 shimmer (static neutral fill under reduced motion). */
export function Skeleton({ width = "100%", height = 16, borderRadius = radius.sm }: { width?: DimensionValue; height?: number; borderRadius?: number }) {
  const { c } = useTheme();
  const { reduced } = useMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!reduced) p.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.linear }), -1, true);
  }, [reduced, p]);
  const style = useAnimatedStyle(() => ({ opacity: reduced ? 1 : 0.55 + 0.45 * p.value }));
  return <Animated.View testID="skeleton" accessibilityElementsHidden style={[{ width, height, borderRadius, backgroundColor: c.skeletonBase }, style]} />;
}
