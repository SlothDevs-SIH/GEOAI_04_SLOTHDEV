const nf = new Intl.NumberFormat("en-IN");

export const num = (n: number | null | undefined) => (n == null ? "–" : nf.format(Math.round(n)));

/** Area: m² below one hectare, hectares above, always with separators. */
export function area(m2: number): string {
  if (m2 < 10000) return `${nf.format(Math.round(m2))} m²`;
  const ha = m2 / 10000;
  return `${ha >= 100 ? nf.format(Math.round(ha)) : ha.toFixed(ha >= 10 ? 1 : 2)} ha`;
}

export const ha = (v: number | null | undefined, digits = 1) =>
  v == null ? "unknown" : `${v.toLocaleString("en-IN", { maximumFractionDigits: digits })} ha`;

export const coord = (v: number) => v.toFixed(6);

export const pct = (v: number) => `${Math.round(v * 100)}%`;
