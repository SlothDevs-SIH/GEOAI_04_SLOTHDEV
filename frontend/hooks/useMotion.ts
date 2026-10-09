import { useReducedMotion } from "react-native-reanimated";

/** Duration helper: 0 when the user prefers reduced motion (spec A5: instant change). */
export function useMotion() {
  const reduced = useReducedMotion();
  return { reduced, ms: (n: number) => (reduced ? 0 : n) };
}
