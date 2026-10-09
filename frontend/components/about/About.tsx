import { Image, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { TableScroller } from "../layout/Scrollers";
import { Card } from "../ui/Card";
import { Press } from "../ui/Press";
import { Txt } from "../ui/Txt";
import { useUi } from "../../store/ui";

export type Status = "Used now" | "In progress" | "Planned";

/** B-03: status is always spelled out, never colour alone. */
export function StatusChip({ status }: { status: Status }) {
  const { c } = useTheme();
  const col = { "Used now": c.statusUsedNow, "In progress": c.statusInProgress, Planned: c.statusPlanned }[status];
  return (
    <View testID="status-chip" style={{ alignSelf: "flex-start", borderColor: col, borderWidth: 1, borderRadius: radius.xs, paddingHorizontal: space[2], paddingVertical: 1 }}>
      <Txt v="micro" style={{ color: col }}>{status}</Txt>
    </View>
  );
}

export function StepCard({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <Card testID="step-card" style={{ flexGrow: 1, flexBasis: 300 }}>
      <Txt v="h3">{n} · {title}</Txt>
      <Txt v="body" tone="secondary" style={{ marginTop: space[1] }}>{body}</Txt>
    </Card>
  );
}

export function TechStackTable({ rows }: { rows: [string, string, Status][] }) {
  const { c } = useTheme();
  return (
    <View testID="tech-stack">
      <TableScroller minWidth={560}>
        {rows.map(([layer, what, status]) => (
          <View key={layer} style={{ flexDirection: "row", gap: space[3], paddingVertical: space[2], borderBottomColor: c.border, borderBottomWidth: 1 }}>
            <Txt v="small" style={{ width: 120 }}>{layer}</Txt>
            <Txt v="body" tone="secondary" style={{ flex: 1 }}>{what}</Txt>
            <View style={{ width: 100 }}><StatusChip status={status} /></View>
          </View>
        ))}
      </TableScroller>
    </View>
  );
}

export function ArchitectureImage() {
  const open = useUi((s) => s.openImageViewer);
  const uri = "/architecture.png";
  return (
    <Press minSize={false} testID="architecture-diagram" accessibilityRole="imagebutton" accessibilityLabel="System architecture: users, web app, API, storage, data sources, the five-step engine, outputs and the offline train-evaluate-ship pipeline. Tap to enlarge." onPress={() => open(uri)}>
      <Image source={{ uri }} resizeMode="contain" style={{ width: "100%", aspectRatio: 1.6, borderRadius: radius.sm }} />
    </Press>
  );
}
