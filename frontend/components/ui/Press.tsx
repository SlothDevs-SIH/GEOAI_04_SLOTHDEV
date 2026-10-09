import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useMotion } from "../../hooks/useMotion";
import { MIN_TOUCH } from "../../theme/tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Every pressable: A-10 press feedback, 48 dp target, visible focus ring on web (2 px, 2 px offset). */
export function Press({ style, children, minSize = true, ...rest }: Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle>; minSize?: boolean }) {
  const { ms } = useMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const web = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      {...rest}
      onPressIn={(e) => { scale.value = withTiming(ms(1) ? 0.97 : 1, { duration: ms(80) }); rest.onPressIn?.(e); }}
      onPressOut={(e) => { scale.value = withTiming(1, { duration: ms(120) }); rest.onPressOut?.(e); }}
      style={[minSize && { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, justifyContent: "center" }, web, style, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}
