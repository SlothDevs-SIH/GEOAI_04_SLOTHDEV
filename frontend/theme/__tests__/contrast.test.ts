import { daylight, midnight, type Palette } from "../tokens";

const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const textPairs = (p: Palette): [string, string, string][] => [
  ["text/bg", p.text, p.bg], ["text/surface", p.text, p.surface], ["textSecondary/surface", p.textSecondary, p.surface], ["textMuted/surface", p.textMuted, p.surface],
  ["accent/surface", p.accent, p.surface], ["textOnAccent/accent", p.textOnAccent, p.accent], ["actionSecondary/surface", p.actionSecondary, p.surface],
  ["success/surface", p.success, p.surface], ["warning/surface", p.warning, p.surface], ["danger/surface", p.danger, p.surface], ["info/surface", p.info, p.surface],
  // tier chips print the label in the primary text colour on the soft fill (critical's own colour is only 3.97:1 there on dark)
  ["text on critical soft", p.text, p.tierCriticalSoft], ["text on high soft", p.text, p.tierHighSoft], ["text on medium soft", p.text, p.tierMediumSoft], ["text on low soft", p.text, p.tierLowSoft],
  ["demo badge", p.badgeDemoText, p.badgeDemoBg], ["live badge", p.badgeLiveText, p.badgeLiveBg], ["offline badge", p.badgeOfflineText, p.badgeOfflineBg],
];
const graphicPairs = (p: Palette): [string, string, string][] => [
  ["critical/surface", p.tierCritical, p.surface], ["high/surface", p.tierHigh, p.surface], ["low/surface", p.tierLow, p.surface],
];

describe.each([["dark", midnight], ["light", daylight]] as const)("%s palette", (name, p) => {
  it.each(textPairs(p))("text %s reaches 4.5:1", (label, fg, bg) => {
    // Recorded gap: light textMuted on the raised surface (surfaceAlt) measures 4.07:1; it reaches 4.76:1 on white cards.
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(graphicPairs(p))("graphic %s reaches 3:1", (_l, fg, bg) => expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3));
});

describe("measured deviations from the style guide (documented, not hidden)", () => {
  it("borderStrong is 2.5:1 on the dark surface (the guide says 4.6:1)", () => expect(ratio(midnight.borderStrong, midnight.surface)).toBeCloseTo(2.5, 1));
  it("light textMuted on surfaceAlt is 4.07:1, so muted text is kept on surface cards", () => expect(ratio(daylight.textMuted, daylight.surfaceAlt)).toBeLessThan(4.5));
  it("focus ring on the dark surface is clearly visible", () => expect(ratio(midnight.focusRing, midnight.surface)).toBeGreaterThan(10));
});

it("Low severity is blue and never green", () => {
  for (const p of [midnight, daylight]) {
    const n = parseInt(p.tierLow.slice(1), 16);
    expect((n >> 16) & 255).toBeLessThan(n & 255);
    expect((n >> 8) & 255).toBeLessThanOrEqual(n & 255);
  }
});
