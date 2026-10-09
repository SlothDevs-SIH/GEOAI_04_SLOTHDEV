import { View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { TableScroller } from "../layout/Scrollers";
import { CardSection } from "../ui/Card";
import { Txt } from "../ui/Txt";

export interface Cell { t: string; bold?: boolean; danger?: boolean; muted?: boolean }
export type Row = { key: string; cells: (string | Cell)[]; bold?: boolean };

const cell = (c: string | Cell): Cell => (typeof c === "string" ? { t: c } : c);

/** Q-01: titled card holding one table (scrolls sideways inside the card on phones) and a footnote. */
export function MetricTable({ title, testID, slug, columns, rows, note, minWidth = 560, firstWidth = 200 }: {
  title: string; testID: string; slug?: string; columns: string[]; rows: Row[]; note?: string; minWidth?: number; firstWidth?: number;
}) {
  const { c } = useTheme();
  return (
    <View testID={testID}>
      <CardSection title={title} slug={slug ?? testID}>
        <View testID="metric-table">
          <TableScroller minWidth={minWidth}>
            <View style={{ flexDirection: "row", paddingBottom: space[1], borderBottomColor: c.border, borderBottomWidth: 1 }}>
              {columns.map((h, i) => <Txt key={h + i} v="tiny" tone="muted" style={{ width: i === 0 ? firstWidth : undefined, flex: i === 0 ? undefined : 1, paddingRight: space[2] }}>{h}</Txt>)}
            </View>
            {rows.map((r) => (
              <View key={r.key} style={{ flexDirection: "row", paddingVertical: space[1] + 2, borderBottomColor: c.border, borderBottomWidth: 1 }}>
                {r.cells.map((raw, i) => {
                  const x = cell(raw);
                  return <Txt key={i} v={x.bold || r.bold ? "small" : "body"} tone={x.danger ? "danger" : x.muted ? "muted" : "text"}
                    style={{ width: i === 0 ? firstWidth : undefined, flex: i === 0 ? undefined : 1, paddingRight: space[2], fontVariant: ["tabular-nums"] }}>{x.t}</Txt>;
                })}
              </View>
            ))}
          </TableScroller>
        </View>
        {note ? <Txt v="tiny" tone="secondary">{note}</Txt> : null}
      </CardSection>
    </View>
  );
}
