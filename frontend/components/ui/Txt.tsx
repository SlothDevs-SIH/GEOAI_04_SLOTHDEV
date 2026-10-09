import { Text, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { font } from "../../theme/tokens";

type Variant = keyof typeof font;
type Tone = "text" | "muted" | "secondary" | "accent" | "success" | "danger" | "warning" | "info";

export function Txt({ v = "body", tone = "text", style, ...rest }: TextProps & { v?: Variant; tone?: Tone }) {
  const { c } = useTheme();
  const color = { text: c.text, muted: c.textMuted, secondary: c.textSecondary, accent: c.accent, success: c.success, danger: c.danger, warning: c.warning, info: c.info }[tone];
  const tabular: TextStyle = v === "metric" ? { fontVariant: ["tabular-nums"] } : {};
  return <Text {...rest} style={[font[v], { color }, tabular, style]} />;
}
