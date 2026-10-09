import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const Q = "(prefers-reduced-motion: reduce)";
const sub = (cb: () => void) => {
  const m = window.matchMedia?.(Q);
  m?.addEventListener?.("change", cb);
  return () => m?.removeEventListener?.("change", cb);
};
/** True when the user asked for less motion: every animation then changes instantly or cross-fades (A5). */
export const useReducedMotion = (): boolean =>
  useSyncExternalStore(sub, () => !!window.matchMedia?.(Q).matches, () => false);

/** Animates a number from its previous value to `target` (A-03 counter 600 ms, A-05 impact tiles 700 ms). */
export function useCountUp(target: number, duration = 600, delay = 0): number {
  const reduced = useReducedMotion();
  const [v, setV] = useState(reduced ? target : 0);
  const from = useRef(reduced ? target : 0);
  useEffect(() => {
    if (reduced || !Number.isFinite(target)) { setV(target); from.current = target; return; }
    const start = from.current;
    let raf = 0;
    let t0 = 0;
    const timer = setTimeout(() => {
      const tick = (t: number) => {
        t0 ||= t;
        const k = Math.min((t - t0) / duration, 1);
        const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
        const cur = start + (target - start) * e;
        from.current = cur;
        setV(cur);
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [target, duration, delay, reduced]);
  return v;
}

/** Layout breakpoints: phone < 768, two-pane >= 1024 (A2 / L-03). */
export function useWidth(): number {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}
export const useIsTwoPane = () => useWidth() >= 1024;
export const useIsPhone = () => useWidth() < 768;
