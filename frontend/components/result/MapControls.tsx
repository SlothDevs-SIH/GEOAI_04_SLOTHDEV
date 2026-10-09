import { View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, shadow, space } from "../../theme/tokens";
import { Press } from "../ui/Press";
import { Txt } from "../ui/Txt";

/** R-05 */
export function MapControls({ onZoomIn, onZoomOut, onResetView }: { onZoomIn: () => void; onZoomOut: () => void; onResetView: () => void }) {
  const { c } = useTheme();
  const btn = (name: string, label: string, glyph: string, fn: () => void) => (
    <Press testID={`map-${name}`} accessibilityLabel={label} onPress={fn} style={{ alignItems: "center", backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.sm }}>
      <Txt v="h3">{glyph}</Txt>
    </Press>
  );
  return (
    <View testID="map-controls" style={[{ gap: space[1] }, shadow.card]}>
      {btn("zoom-in", "Zoom in", "+", onZoomIn)}
      {btn("zoom-out", "Zoom out", "−", onZoomOut)}
      {btn("reset", "Reset view", "⤢", onResetView)}
    </View>
  );
}
