import { useWindowDimensions } from "react-native";
import { BREAKPOINT_WIDE } from "../theme/tokens";

export function useBreakpoint() {
  const { width, height } = useWindowDimensions();
  return { width, height, wide: width >= BREAKPOINT_WIDE, phone: width < 640 };
}
