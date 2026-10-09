import { Image, Modal, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useMotion } from "../../hooks/useMotion";
import { useUi } from "../../store/ui";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { Press } from "../ui/Press";
import { Txt } from "../ui/Txt";

/** R-32: full-screen image; pinch, pan, double-tap to 2.5x, swipe down to dismiss (G-D). */
export function ImageViewer() {
  const uri = useUi((s) => s.imageViewerUri);
  const close = useUi((s) => s.closeImageViewer);
  const { c } = useTheme();
  const { ms } = useMotion();
  const scale = useSharedValue(1), saved = useSharedValue(1);
  const x = useSharedValue(0), y = useSharedValue(0), sx = useSharedValue(0), sy = useSharedValue(0);
  const reset = () => { scale.value = 1; saved.value = 1; x.value = 0; y.value = 0; sx.value = 0; sy.value = 0; };
  const pinch = Gesture.Pinch().onUpdate((e) => { scale.value = Math.max(1, saved.value * e.scale); }).onEnd(() => { saved.value = scale.value; });
  const pan = Gesture.Pan()
    .onUpdate((e) => { x.value = sx.value + e.translationX; y.value = sy.value + e.translationY; })
    .onEnd((e) => {
      if (scale.value <= 1.05 && e.translationY > 120) { reset(); close(); return; }
      sx.value = x.value; sy.value = y.value;
    });
  const dbl = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    const t = scale.value > 1 ? 1 : 2.5;
    scale.value = withTiming(t, { duration: ms(200) }); saved.value = t;
    if (t === 1) { x.value = withSpring(0); y.value = withSpring(0); sx.value = 0; sy.value = 0; }
  });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  return (
    <Modal visible={!!uri} transparent animationType={ms(1) ? "fade" : "none"} onRequestClose={close} onDismiss={reset}>
      <View testID="image-viewer" style={{ flex: 1, backgroundColor: c.overlayScrim, justifyContent: "center" }}>
        <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, dbl)}>
          <Animated.View style={[{ flex: 1 }, style]}>
            {uri ? <Image source={{ uri }} resizeMode="contain" accessibilityLabel="Enlarged image" style={{ flex: 1 }} /> : null}
          </Animated.View>
        </GestureDetector>
        <Press testID="image-viewer-close" accessibilityLabel="Close image" onPress={() => { reset(); close(); }}
          style={{ position: "absolute", top: space[4], right: space[4], backgroundColor: c.surfaceAlt, borderRadius: 999, paddingHorizontal: space[4], alignItems: "center" }}>
          <Txt v="small">Close ✕</Txt>
        </Press>
      </View>
    </Modal>
  );
}
