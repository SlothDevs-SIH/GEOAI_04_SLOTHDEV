import { useEffect, useRef, useState } from "react";
import { useMotion } from "./useMotion";

/** Animated integer (A-03 / A-05): eases from the previous value to `target`; instant under reduced motion. */
export function useCountUp(target: number, duration = 600, delay = 0): number {
  const { reduced } = useMotion();
  const [v, setV] = useState(reduced ? target : 0);
  const from = useRef(reduced ? target : 0);
  useEffect(() => {
    if (reduced || duration <= 0) { from.current = target; setV(target); return; }
    const start0 = from.current;
    let raf = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now;
      const p = Math.min(1, Math.max(0, (now - t0 - delay) / duration));
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      const cur = start0 + (target - start0) * e;
      from.current = cur;
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay, reduced]);
  return v;
}
