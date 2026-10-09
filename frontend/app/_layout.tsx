import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "../components/global/ErrorBoundary";
import { OfflineBadge, Toast } from "../components/global/Globals";
import { AppHeader, TabBar } from "../components/nav/Nav";
import { registerServiceWorker } from "../lib/sw";
import { useReview } from "../store/review";
import { hydrateTheme } from "../store/ui";
import { ThemeProvider, useTheme } from "../theme/ThemeProvider";

function Shell() {
  const { c } = useTheme();
  return (
    <View testID="root-layout" style={{ flex: 1, backgroundColor: c.bg }}>
      <AppHeader />
      <OfflineBadge />
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: Platform.OS === "web" ? "fade" : "default", animationDuration: 150 }} />
      </View>
      <TabBar />
      <Toast />
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    void hydrateTheme();
    void useReview.getState().hydrate();
    registerServiceWorker();
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ErrorBoundary>
            <Shell />
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
