// Single source of truth for colour, spacing, radii, type and shadow (GEOAI04_UI_Style_Guide, FRONTEND.md A1).
// scripts/gen-tokens.mjs emits the same values as CSS variables for the web shell.

export interface Palette {
  bg: string; surface: string; surfaceAlt: string; surfaceHover: string;
  border: string; borderStrong: string;
  text: string; textMuted: string; textSecondary: string; textOnAccent: string; overlayScrim: string;
  accent: string; accentHover: string; accentPressed: string; accentSoft: string;
  actionSecondary: string; focusRing: string;
  success: string; successSoft: string; warning: string; warningSoft: string;
  danger: string; dangerSoft: string; info: string; infoSoft: string;
  tierCritical: string; tierCriticalSoft: string; tierHigh: string; tierHighSoft: string;
  tierMedium: string; tierMediumSoft: string; tierLow: string; tierLowSoft: string;
  typeBuiltUp: string; typeWaterGain: string; typeWaterLoss: string; typeVegLoss: string; typeVegGain: string; typeOther: string;
  selectedLine: string; rawDetection: string; rawStroke: string;
  boxFill: string; boxLine: string;
  swipeHandle: string; swipeHandleRing: string; swipeHandleShadow: string;
  statusUsedNow: string; statusInProgress: string; statusPlanned: string;
  badgeDemoText: string; badgeDemoBg: string; badgeLiveText: string; badgeLiveBg: string; badgeOfflineText: string; badgeOfflineBg: string;
  skeletonBase: string; skeletonHighlight: string;
}

export const midnight: Palette = {
  bg: "#07111F", surface: "#0B1726", surfaceAlt: "#102033", surfaceHover: "#162A40",
  border: "#294158", borderStrong: "#3D5A75",
  text: "#F1F5F9", textMuted: "#8FA3B8", textSecondary: "#BAC7D7", textOnAccent: "#07111F", overlayScrim: "rgba(0, 0, 0, 0.72)",
  accent: "#22D3EE", accentHover: "#67E8F9", accentPressed: "#06B6D4", accentSoft: "rgba(34, 211, 238, 0.14)",
  actionSecondary: "#2DD4BF", focusRing: "#FDE047",
  success: "#22C55E", successSoft: "#0D3322", warning: "#F59E0B", warningSoft: "#3D2905",
  danger: "#EF4444", dangerSoft: "#451416", info: "#38BDF8", infoSoft: "#082F49",
  tierCritical: "#F43F5E", tierCriticalSoft: "#4C1524", tierHigh: "#F97316", tierHighSoft: "#4A2108",
  tierMedium: "#FACC15", tierMediumSoft: "#3B3106", tierLow: "#38BDF8", tierLowSoft: "#082F49",
  typeBuiltUp: "#A78BFA", typeWaterGain: "#06B6D4", typeWaterLoss: "#2563EB", typeVegLoss: "#D6A514", typeVegGain: "#22C55E", typeOther: "#94A3B8",
  selectedLine: "#FDE047", rawDetection: "#94A3B8", rawStroke: "#CBD5E1",
  boxFill: "rgba(34, 211, 238, 0.20)", boxLine: "#22D3EE",
  swipeHandle: "#FFFFFF", swipeHandleRing: "#22D3EE", swipeHandleShadow: "rgba(0, 0, 0, 0.60)",
  statusUsedNow: "#22C55E", statusInProgress: "#F59E0B", statusPlanned: "#A78BFA",
  badgeDemoText: "#C4B5FD", badgeDemoBg: "#2E2150", badgeLiveText: "#5EEAD4", badgeLiveBg: "#073B36", badgeOfflineText: "#CBD5E1", badgeOfflineBg: "#233044",
  skeletonBase: "#102033", skeletonHighlight: "#162A40",
};

export const daylight: Palette = {
  bg: "#F3F7FB", surface: "#FFFFFF", surfaceAlt: "#E8EEF5", surfaceHover: "#DDE5EE",
  border: "#CBD5E1", borderStrong: "#94A3B8",
  text: "#102033", textMuted: "#64748B", textSecondary: "#334155", textOnAccent: "#FFFFFF", overlayScrim: "rgba(15, 23, 42, 0.45)",
  accent: "#0891B2", accentHover: "#0E7490", accentPressed: "#155E75", accentSoft: "rgba(8, 145, 178, 0.12)",
  actionSecondary: "#0D9488", focusRing: "#CA8A04",
  success: "#16A34A", successSoft: "#DCFCE7", warning: "#D97706", warningSoft: "#FEF3C7",
  danger: "#DC2626", dangerSoft: "#FEE2E2", info: "#0284C7", infoSoft: "#E0F2FE",
  tierCritical: "#E11D48", tierCriticalSoft: "#FFE4E6", tierHigh: "#EA580C", tierHighSoft: "#FFEDD5",
  tierMedium: "#CA8A04", tierMediumSoft: "#FEF9C3", tierLow: "#0284C7", tierLowSoft: "#E0F2FE",
  typeBuiltUp: "#7C3AED", typeWaterGain: "#0891B2", typeWaterLoss: "#1D4ED8", typeVegLoss: "#A16207", typeVegGain: "#16A34A", typeOther: "#64748B",
  selectedLine: "#CA8A04", rawDetection: "#94A3B8", rawStroke: "#CBD5E1",
  boxFill: "rgba(8, 145, 178, 0.20)", boxLine: "#0891B2",
  swipeHandle: "#FFFFFF", swipeHandleRing: "#0891B2", swipeHandleShadow: "rgba(0, 0, 0, 0.30)",
  statusUsedNow: "#16A34A", statusInProgress: "#D97706", statusPlanned: "#7C3AED",
  badgeDemoText: "#5B21B6", badgeDemoBg: "#EDE9FE", badgeLiveText: "#0F766E", badgeLiveBg: "#CCFBF1", badgeOfflineText: "#334155", badgeOfflineBg: "#F1F5F9",
  skeletonBase: "#E2E8F0", skeletonHighlight: "#F8FAFC",
};

export const space = { 1: 4, 2: 8, 3: 12, 4: 18, 5: 26, 6: 36 } as const;
export const radius = { xs: 5, sm: 9, md: 13, lg: 18, pill: 999 } as const;
export const MIN_TOUCH = 48;
export const BREAKPOINT_WIDE = 1024;

export const font = {
  display: { fontSize: 32, lineHeight: 36, fontWeight: "700" as const },
  h1: { fontSize: 25, lineHeight: 30, fontWeight: "700" as const },
  h2: { fontSize: 19, lineHeight: 24, fontWeight: "600" as const },
  h3: { fontSize: 16, lineHeight: 21, fontWeight: "600" as const },
  metric: { fontSize: 31, lineHeight: 33, fontWeight: "700" as const },
  body: { fontSize: 14, lineHeight: 21, fontWeight: "400" as const },
  small: { fontSize: 13, lineHeight: 17, fontWeight: "600" as const },
  tiny: { fontSize: 12, lineHeight: 16, fontWeight: "500" as const },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: "600" as const },
};

export const shadow = {
  card: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 2 },
  sheet: { shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.28, shadowRadius: 16, elevation: 8 },
  panel: { shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.24, shadowRadius: 32, elevation: 12 },
  modal: { shadowColor: "#000", shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.4, shadowRadius: 36, elevation: 20 },
};

export const polygon = { fillOpacity: 0.38, lineWidth: 1.6, selectedWidth: 3.5, rawFillOpacity: 0.18, rawStrokeOpacity: 0.55 };
export type ThemeName = "dark" | "light";
export const palettes: Record<ThemeName, Palette> = { dark: midnight, light: daylight };
