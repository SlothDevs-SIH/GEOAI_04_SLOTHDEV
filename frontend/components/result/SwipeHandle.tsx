import { Platform, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useMotion } from "../../hooks/useMotion";
import { useTheme } from "../../theme/ThemeProvider";
import { MIN_TOUCH } from "../../theme/tokens";
import { Txt } from "../ui/Txt";

export const clampPct = (p: number) => Math.max(0, Math.min(100, p));
/** G-A: arrow keys move 2%, with Shift 10%. */
export const keyStep = (key: string, shift: boolean): number => (key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0) * (shift ? 10 : 2);

/** R-02: the divider. Pan drags it 1:1 across containerWidth (A-02); also keyboard operable and an adjustable for screen readers. */
export function SwipeHandle({ swipePct, onSwipe, containerWidth }: { swipePct: number; onSwipe: (pct: number) => void; containerWidth: number }) {
  const { c } = useTheme();
  const { ms } = useMotion();
  const grip = useSharedValue(1);
  const start = useSharedValue(0);
  const w = Math.max(containerWidth, 1);
  const set = (p: number) => onSwipe(clampPct(p));
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin(() => { start.value = swipePct; grip.value = withTiming(ms(1) ? 1.15 : 1, { duration: ms(120) }); })
    .onUpdate((e) => runOnJS(set)(start.value + (e.translationX / w) * 100))
    .onFinalize(() => { grip.value = withTiming(1, { duration: ms(120) }); });
  const gripStyle = useAnimatedStyle(() => ({ transform: [{ scale: grip.value }] }));
  const key = Platform.OS === "web" ? ({
    tabIndex: 0,
    onKeyDown: (e: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
      const d = keyStep(e.key, e.shiftKey);
      if (d) { e.preventDefault(); set(swipePct + d); }
    },
  } as object) : null;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: 0, bottom: 0, left: `${swipePct}%`, width: 0, zIndex: 10 }}>
      <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: -1, width: 2, backgroundColor: c.swipeHandle }} />
      <GestureDetector gesture={pan}>
        <View testID="swipe-handle" accessible accessibilityRole="adjustable" accessibilityLabel="Swipe between before and after"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(swipePct), text: `${Math.round(swipePct)} percent` }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) => set(swipePct + (e.nativeEvent.actionName === "increment" ? 10 : -10))}
          aria-valuenow={Math.round(swipePct)} aria-valuemin={0} aria-valuemax={100} role="slider" {...key}
          style={{ position: "absolute", top: "50%", marginTop: -MIN_TOUCH / 2, left: -MIN_TOUCH / 2, width: MIN_TOUCH, height: MIN_TOUCH, alignItems: "center", justifyContent: "center", cursor: "ew-resize" } as object}>
          <Animated.View style={[{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.swipeHandle, borderWidth: 3, borderColor: c.swipeHandleRing, alignItems: "center", justifyContent: "center",
            shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 6 }, gripStyle]}>
            <Txt v="micro" style={{ color: "#07111F" }}>◀▶</Txt>
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}
