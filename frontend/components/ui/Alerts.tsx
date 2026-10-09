import { View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Button } from "./Button";
import { Txt } from "./Txt";

export type AlertVariant = "error" | "warning" | "info" | "success";

export function InlineAlert({ variant, message }: { variant: AlertVariant; message: string }) {
  const { c } = useTheme();
  const map = { error: [c.danger, c.dangerSoft, "✕"], warning: [c.warning, c.warningSoft, "!"], info: [c.info, c.infoSoft, "i"], success: [c.success, c.successSoft, "✓"] }[variant];
  return (
    <View testID={`alert-${variant}`} accessibilityRole="alert" style={{ flexDirection: "row", gap: space[2], backgroundColor: map[1], borderColor: map[0], borderWidth: 1, borderRadius: radius.sm, padding: space[3] }}>
      <Txt v="small" style={{ color: map[0] }}>{map[2]}</Txt>
      <Txt v="body" style={{ flex: 1 }}>{message}</Txt>
    </View>
  );
}

export function EmptyState({ title, body, actionLabel, onAction }: { title: string; body?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View testID="empty-state" style={{ alignItems: "center", padding: space[5], gap: space[2] }}>
      <Txt v="h3" style={{ textAlign: "center" }}>{title}</Txt>
      {body && <Txt v="body" tone="muted" style={{ textAlign: "center" }}>{body}</Txt>}
      {actionLabel && onAction && <Button name="empty" label={actionLabel} onPress={onAction} variant="secondary" />}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View testID="error-state" accessibilityRole="alert" style={{ alignItems: "center", padding: space[5], gap: space[2] }}>
      <Txt v="h3" tone="danger">Something went wrong</Txt>
      <Txt v="body" tone="muted" style={{ textAlign: "center" }}>{message}</Txt>
      {onRetry && <Button name="retry" label="Try again" onPress={onRetry} variant="secondary" />}
    </View>
  );
}
