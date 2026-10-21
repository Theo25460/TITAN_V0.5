import { DarkTheme, NavigationContainer, type Theme } from "@react-navigation/native";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "./core";
import { ToastProvider } from "./components/Toast";
import { AuthProvider } from "./data/auth";
import { persister, PERSIST_BUSTER, queryClient, shouldPersist } from "./data/queryClient";
import { SyncManager } from "./data/SyncManager";
import "./lib/network";
import "./lib/prefsLocal";
import { linking } from "./navigation/linking";
import { RootNavigator } from "./navigation/RootNavigator";
import { colors, fonts } from "./theme/tokens";

SplashScreen.preventAutoHideAsync().catch(() => {});

const theme: Theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: colors.cy, background: colors.bg, card: colors.bg1, text: colors.tx, border: colors.line, notification: colors.am },
  fonts: {
    regular: { fontFamily: fonts.text, fontWeight: "400" },
    medium: { fontFamily: fonts.textSemi, fontWeight: "600" },
    bold: { fontFamily: fonts.textBold, fontWeight: "700" },
    heavy: { fontFamily: fonts.display, fontWeight: "800" },
  },
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, buster: PERSIST_BUSTER, maxAge: 30 * 24 * 3600_000, dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === "success" && shouldPersist(q.queryKey) } }}
        >
          <AuthProvider>
            <ToastProvider>
              <NavigationContainer theme={theme} linking={linking}>
                <StatusBar style="light" />
                <SyncManager />
                <RootNavigator />
              </NavigationContainer>
            </ToastProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
