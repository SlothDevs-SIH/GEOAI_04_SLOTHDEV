import * as DocumentPicker from "expo-document-picker";
import { Platform, TextInput, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { MIN_TOUCH, radius, space } from "../../theme/tokens";
import { ChipScroller } from "../layout/Scrollers";
import { Chip } from "../ui/Controls";
import { Press } from "../ui/Press";
import { Txt } from "../ui/Txt";

/** A-02c / A-07c: a native <select> on web, a row of choice chips on phones. */
export function Select<T extends string | number>({ testID, label, options, value, onChange }: { testID: string; label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { c } = useTheme();
  if (Platform.OS === "web") {
    return (
      <View style={{ gap: space[1] }}>
        <Txt v="small" tone="secondary">{label}</Txt>
        <select data-testid={testID} aria-label={label} value={String(value)}
          onChange={(e) => onChange((typeof value === "number" ? Number(e.target.value) : e.target.value) as T)}
          style={{ minHeight: MIN_TOUCH, borderRadius: radius.sm, border: `1px solid ${c.borderStrong}`, background: c.surfaceAlt, color: c.text, padding: "0 12px", fontSize: 14, maxWidth: "100%" }}>
          {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
        </select>
      </View>
    );
  }
  return (
    <View testID={testID} style={{ gap: space[1] }}>
      <Txt v="small" tone="secondary">{label}</Txt>
      <ChipScroller>{options.map((o) => <Chip key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />)}</ChipScroller>
    </View>
  );
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** A-06c: <input type="date"> on web, a validated text field elsewhere. */
export function DateField({ testID, label, value, min, onChange }: { testID: string; label: string; value: string; min?: string; onChange: (v: string) => void }) {
  const { c } = useTheme();
  const bad = !ISO.test(value) || (min != null && value < min);
  const box = { minHeight: MIN_TOUCH, borderRadius: radius.sm, borderWidth: 1, borderColor: bad ? c.danger : c.borderStrong, backgroundColor: c.surfaceAlt, color: c.text, paddingHorizontal: space[3], fontSize: 14 } as const;
  return (
    <View style={{ gap: space[1], flex: 1, minWidth: 200 }}>
      <Txt v="small" tone="secondary">{label}</Txt>
      {Platform.OS === "web" ? (
        <input type="date" data-testid={testID} aria-label={label} value={value} min={min} onChange={(e) => onChange(e.target.value)}
          style={{ ...box, border: `1px solid ${bad ? c.danger : c.borderStrong}`, padding: "0 12px", colorScheme: "dark light" } as never} />
      ) : (
        <TextInput testID={testID} accessibilityLabel={`${label} (YYYY-MM-DD)`} value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" placeholderTextColor={c.textMuted} keyboardType="numbers-and-punctuation" style={box} />
      )}
    </View>
  );
}

export interface Picked { name: string; file: unknown } // a web File or a native {uri,name,type}

/** A-11c */
export function FilePickerField({ testID, label, picked, onPick, onClear }: { testID: string; label: string; picked?: Picked; onPick: (f: Picked) => void; onClear: () => void }) {
  const { c } = useTheme();
  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ["image/tiff", "application/octet-stream", "*/*"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    onPick({ name: a.name, file: Platform.OS === "web" ? a.file : { uri: a.uri, name: a.name, type: a.mimeType ?? "image/tiff" } });
  };
  return (
    <View style={{ gap: space[1], flex: 1, minWidth: 220 }}>
      <Txt v="small" tone="secondary">{label}</Txt>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
        <Press testID={testID} accessibilityLabel={`Choose ${label}`} onPress={pick}
          style={{ paddingHorizontal: space[4], borderRadius: radius.sm, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceAlt }}>
          <Txt v="small">{picked ? "Change file" : "Choose .tif file"}</Txt>
        </Press>
        {picked && (
          <>
            <Txt v="tiny" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>{picked.name}</Txt>
            <Press accessibilityLabel={`Remove ${label}`} onPress={onClear}><Txt v="small" tone="danger">✕</Txt></Press>
          </>
        )}
      </View>
    </View>
  );
}
