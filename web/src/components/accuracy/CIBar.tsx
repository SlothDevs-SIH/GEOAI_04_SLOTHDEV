const W = 112;
const H = 18;
const PAD = 5;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const x = (v: number) => PAD + clamp(v) * (W - 2 * PAD);

/**
 * Q-02: a value (dot) with its 95% interval (bar with end caps) on a fixed 0..1 axis.
 * Drawn with currentColor and CSS variables, so it follows the theme. The numbers are in the aria-label and
 * printed next to it in the table, so the meaning never depends on colour.
 */
export default function CIBar({ value, ci95, label }: { value: number; ci95: [number, number]; label?: string }) {
  const [lo, hi] = ci95;
  const text = `${label ? `${label}: ` : ""}${value.toFixed(2)}, 95% interval ${lo.toFixed(2)} to ${hi.toFixed(2)}, on a scale from 0 to 1`;
  return (
    <svg role="img" aria-label={text} data-testid="ci-bar" data-value={value} data-lo={lo} data-hi={hi}
      width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block text-accent">
      <line x1={x(0)} x2={x(1)} y1={H / 2} y2={H / 2} stroke="var(--c-line-strong)" strokeWidth="1" />
      {[0, 0.5, 1].map((t) => <line key={t} x1={x(t)} x2={x(t)} y1={H / 2 - 3} y2={H / 2 + 3} stroke="var(--c-line-strong)" strokeWidth="1" />)}
      <line x1={x(lo)} x2={x(hi)} y1={H / 2} y2={H / 2} stroke="currentColor" strokeWidth="3" strokeLinecap="butt" />
      <line x1={x(lo)} x2={x(lo)} y1={H / 2 - 5} y2={H / 2 + 5} stroke="currentColor" strokeWidth="1.5" />
      <line x1={x(hi)} x2={x(hi)} y1={H / 2 - 5} y2={H / 2 + 5} stroke="currentColor" strokeWidth="1.5" />
      <circle cx={x(value)} cy={H / 2} r="4" fill="var(--c-fg)" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
