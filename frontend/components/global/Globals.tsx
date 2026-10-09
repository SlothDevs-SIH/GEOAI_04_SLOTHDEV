import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useMotion } from "../../hooks/useMotion";
import { useOnline } from "../../hooks/useOnline";
import { useUi } from "../../store/ui";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, shadow, space } from "../../theme/tokens";
import { Txt } from "../ui/Txt";

/** G-01 + A-13 */
export function OfflineBadge() {
  const online = useOnline();
  const { c } = useTheme();
  const { ms } = useMotion();
  const y = useSharedValue(-24);
  useEffect(() => { y.value = withTiming(online ? -24 : 0, { duration: ms(240) }); }, [online, y, ms]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: y.value < -23 ? 0 : 1 }));
  return (
    <Animated.View testID="offline-badge" pointerEvents="none" accessibilityLiveRegion="polite" style={[{ backgroundColor: c.badgeOfflineBg, alignItems: "center", paddingVertical: 2, height: online ? 0 : undefined, overflow: "hidden" }, style]}>
      <Txt v="micro" style={{ color: c.badgeOfflineText }}>Offline: demo scenes still work</Txt>
    </Animated.View>
  );
}

/** G-02: 3 s auto-dismiss */
export function Toast() {
  const { toastMessage, toastVisible, hideToast } = useUi();
  const { c } = useTheme();
  useEffect(() => {
    if (!toastVisible) return;
    const t = setTimeout(hideToast, 3000);
    return () => clearTimeout(t);
  }, [toastVisible, toastMessage, hideToast]);
  if (!toastVisible) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", bottom: 72, left: 0, right: 0, alignItems: "center", zIndex: 50 }}>
      <View testID="toast" accessibilityLiveRegion="polite" accessibilityRole="alert" style={[{ backgroundColor: c.surfaceHover, borderColor: c.borderStrong, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space[4], paddingVertical: space[2] }, shadow.modal]}>
        <Txt v="small">{toastMessage}</Txt>
      </View>
    </View>
  );
}
