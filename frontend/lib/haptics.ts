import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type HapticType = "light" | "success" | "warning";

/** Native-only, never throws. */
export function triggerHaptic(type: HapticType = "light"): void {
  if (Platform.OS === "web") return;
  try {
    if (type === "light") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else void Haptics.notificationAsync(type === "success" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
  } catch { /* unsupported device */ }
}
