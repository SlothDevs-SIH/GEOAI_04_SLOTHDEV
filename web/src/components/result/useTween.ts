import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/motion";

/**
 * Animates a number from wherever it currently is to `target` (ease-out cubic, 600 ms by default; A-03).
 * Unlike useCountUp it starts AT the target, so a value that is already known does not count up from zero on first render,
 * only later changes (filter toggle, detector switch) animate. Reduced motion changes the value instantly.
 */
export function useTween(target: number, duration = 600): number {
  const reduced = useReducedMotion();
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    if (reduced || !Number.isFinite(target) || cur.current === target) {
      cur.current = target;
      setV(target);
      return;
    }
    const from = cur.current;
    let raf = 0;
    let t0 = 0;
    const tick = (t: number) => {
      t0 ||= t;
      const k = Math.min((t - t0) / duration, 1);
      cur.current = from + (target - from) * (1 - Math.pow(1 - k, 3));
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);
  return v;
}
