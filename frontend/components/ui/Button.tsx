import { ActivityIndicator, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Press } from "./Press";
import { Txt } from "./Txt";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";

export function Button({ name, label, onPress, disabled, loading, variant = "primary", style }: {
  name: string; label: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: ButtonVariant; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const solid = { primary: c.accent, secondary: "transparent", ghost: "transparent", danger: c.danger, success: c.success }[variant];
  const fg = variant === "primary" ? c.textOnAccent : variant === "danger" || variant === "success" ? "#07111F" : c.text;
  const off = disabled || loading;
  return (
    <Press testID={`btn-${name}`} accessibilityLabel={label} accessibilityState={{ disabled: !!off, busy: !!loading }} disabled={off} onPress={onPress}
      style={[{ backgroundColor: solid, borderRadius: radius.sm, paddingHorizontal: space[4], alignItems: "center", opacity: off ? 0.5 : 1,
        borderWidth: variant === "secondary" ? 1 : 0, borderColor: c.borderStrong }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
        {loading && <ActivityIndicator size="small" color={fg} />}
        <Txt v="small" style={{ color: fg }}>{label}</Txt>
      </View>
    </Press>
  );
}
