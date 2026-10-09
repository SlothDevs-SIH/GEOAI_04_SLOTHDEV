import * as Linking from "expo-linking";
import { useEffect } from "react";
import { Platform, Share, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useMotion } from "../../hooks/useMotion";
import type { ChangeProps, SceneData } from "../../lib/types";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { Button } from "../ui/Button";
import { CardSection } from "../ui/Card";
import { Press } from "../ui/Press";
import { Txt } from "../ui/Txt";

const FILES: [string, string][] = [["GeoPackage (QGIS)", "changes.gpkg"], ["GeoJSON", "changes.geojson"], ["PDF report", "report.pdf"],
  ["CSV (field pack)", "changes.csv"], ["KML (Google Earth)", "changes.kml"], ["Audit trail", "audit.json"]];

/** R-30: permalink QR, fades in (A-09). */
export function QRBlock({ url }: { url: string }) {
  const { c } = useTheme();
  const { ms } = useMotion();
  const o = useSharedValue(0);
  useEffect(() => { o.value = withTiming(1, { duration: ms(200) }); }, [o, ms]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View testID="qr" accessibilityLabel="QR code to open this view on a phone" style={[{ flexDirection: "row", alignItems: "center", gap: space[3] }, style]}>
      <View style={{ backgroundColor: "#fff", padding: 6 }}><QRCode value={url} size={92} backgroundColor="#fff" color="#000" /></View>
      <Txt v="tiny" tone="muted" style={{ flex: 1 }}>Scan to open this exact view on a phone (permalink).</Txt>
    </Animated.View>
  );
}

function download(href: string, name?: string) {
  if (Platform.OS === "web") {
    const a = document.createElement("a");
    a.href = href;
    if (name) a.download = name;
    a.click();
  } else void Linking.openURL(href);
}

/** R-29 */
export function ExportMenu({ scene, confirmed, permalink }: { scene: SceneData; confirmed: ChangeProps[]; permalink: string }) {
  const { c } = useTheme();
  const downloadConfirmed = async () => {
    const ids = new Set(confirmed.map((p) => p.id));
    const fc = { ...scene.filtered, features: scene.filtered.features.filter((f) => ids.has(f.properties.id)).map((f) => ({ ...f, properties: { ...f.properties, review_status: "confirmed" } })) };
    const text = JSON.stringify(fc);
    if (Platform.OS === "web") download(URL.createObjectURL(new Blob([text], { type: "application/geo+json" })), `${scene.meta.id}_confirmed.geojson`);
    else await Share.share({ message: text, title: `${scene.meta.id}_confirmed.geojson` });
  };
  return (
    <View testID="export">
      <CardSection title="Export" slug="export">
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {FILES.map(([label, f]) => (
            <Press key={f} testID={`export-${f}`} accessibilityRole="link" accessibilityLabel={`Download ${label}`} onPress={() => download(`${scene.base}/exports/${f}`, f)} style={{ width: "50%", paddingRight: space[2] }}>
              <Txt v="small" style={{ color: c.accent, textDecorationLine: "underline" }}>{label}</Txt>
            </Press>
          ))}
        </View>
        <Button name="export-confirmed" label={`Confirmed only (${confirmed.length}) · GeoJSON`} variant="secondary" disabled={!confirmed.length} onPress={downloadConfirmed} />
        <QRBlock url={permalink} />
      </CardSection>
    </View>
  );
}

/** The shareable URL of the current view (web: the address bar; native: the app deep link). */
export const permalinkFor = (path: string): string => (Platform.OS === "web" && typeof window !== "undefined" ? window.location.href : Linking.createURL(path));
