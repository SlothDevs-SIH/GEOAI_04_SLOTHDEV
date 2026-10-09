import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";
import { useUi } from "../store/ui";
import { palettes, type Palette, type ThemeName } from "./tokens";

interface Theme { name: ThemeName; c: Palette }
const Ctx = createContext<Theme>({ name: "dark", c: palettes.dark });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pref = useUi((s) => s.themePreference);
  const system = useColorScheme();
  const name: ThemeName = pref === "system" ? (system === "light" ? "light" : "dark") : pref;
  const value = useMemo(() => ({ name, c: palettes[name] }), [name]);
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.dataset.theme = name;
      document.documentElement.style.backgroundColor = palettes[name].bg;
      document.documentElement.style.colorScheme = name;
    }
  }, [name]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
