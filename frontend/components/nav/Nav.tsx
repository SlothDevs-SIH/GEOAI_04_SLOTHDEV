import { usePathname, useRouter } from "expo-router";
import { View } from "react-native";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Press } from "../ui/Press";
import { Txt } from "../ui/Txt";
import { ThemeToggle } from "./ThemeToggle";

export const TABS = [
  { name: "scenes", label: "Scenes", href: "/" },
  { name: "analyse", label: "Analyse", href: "/analyse" },
  { name: "accuracy", label: "Accuracy", href: "/accuracy" },
  { name: "about", label: "About", href: "/about" },
] as const;

const activeTab = (path: string) =>
  path === "/" || path.startsWith("/scene") ? "scenes" : path.startsWith("/job") ? "analyse" : path.replace("/", "");

/** N-03 + N-02: top bar on wide screens; on phones a compact top bar plus a bottom tab bar. */
export function AppHeader() {
  const { c } = useTheme();
  const { wide } = useBreakpoint();
  const router = useRouter();
  const active = activeTab(usePathname());
  return (
    <View testID="app-header" style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderBottomColor: c.border, borderBottomWidth: 1, paddingHorizontal: space[3], gap: space[3] }}>
      <Press onPress={() => router.push("/")} accessibilityLabel="GEOAI 04 home" style={{ paddingRight: space[2] }}>
        <Txt v="h3">GEOAI <Txt v="h3" tone="accent">04</Txt></Txt>
      </Press>
      {wide && (
        <View style={{ flexDirection: "row", flex: 1, gap: space[1] }}>
          {TABS.map((t) => (
            <Press key={t.name} testID={`tab-${t.name}`} accessibilityRole="link" accessibilityLabel={t.label} accessibilityState={{ selected: active === t.name }}
              onPress={() => router.push(t.href)} style={{ paddingHorizontal: space[3], borderRadius: radius.sm, backgroundColor: active === t.name ? c.accentSoft : "transparent" }}>
              <Txt v="small" tone={active === t.name ? "accent" : "secondary"}>{t.label}</Txt>
            </Press>
          ))}
        </View>
      )}
      {!wide && <View style={{ flex: 1 }} />}
      <ThemeToggle />
    </View>
  );
}

export function TabBar() {
  const { c } = useTheme();
  const { wide } = useBreakpoint();
  const router = useRouter();
  const active = activeTab(usePathname());
  if (wide) return null;
  return (
    <View testID="tab-bar" style={{ flexDirection: "row", backgroundColor: c.surface, borderTopColor: c.border, borderTopWidth: 1 }}>
      {TABS.map((t) => (
        <Press key={t.name} testID={`tab-${t.name}`} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: active === t.name }}
          onPress={() => router.push(t.href)} style={{ flex: 1, alignItems: "center", borderTopWidth: 2, borderTopColor: active === t.name ? c.accent : "transparent" }}>
          <Txt v="micro" tone={active === t.name ? "accent" : "muted"}>{t.label}</Txt>
        </Press>
      ))}
    </View>
  );
}
