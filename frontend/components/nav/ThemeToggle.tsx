import { useUi, type ThemePref } from "../../store/ui";
import { useTheme } from "../../theme/ThemeProvider";
import { Press } from "../ui/Press";
import { Txt } from "../ui/Txt";

const NEXT: Record<ThemePref, ThemePref> = { dark: "light", light: "system", system: "dark" };

export function ThemeToggle() {
  const pref = useUi((s) => s.themePreference);
  const setTheme = useUi((s) => s.setTheme);
  const { c } = useTheme();
  const icon = pref === "dark" ? "☾" : pref === "light" ? "☀" : "◐";
  return (
    <Press testID="theme-toggle" accessibilityLabel={`Theme: ${pref}. Switch theme`} onPress={() => setTheme(NEXT[pref])} style={{ alignItems: "center" }}>
      <Txt v="h3" style={{ color: c.textSecondary }}>{icon}</Txt>
    </Press>
  );
}
