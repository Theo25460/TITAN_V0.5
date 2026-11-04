/* Preview only (TITAN_PREVIEW=1, web): the real navigator and screens on fixtures, opened on the screen named in the URL. */
import { createNavigationContainerRef, DarkTheme, NavigationContainer, type Theme } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../src/core";
import { DialogHost } from "../src/components/Dialog";
import { PickerHost } from "../src/components/Picker";
import { ToastProvider } from "../src/components/Toast";
import { RootNavigator } from "../src/navigation/RootNavigator";
import { colors, fonts } from "../src/theme/tokens";
import { rememberReceipt } from "../src/data/receipts";
import { _setPedometerForTests, createPedometer } from "../src/lib/pedometer";
import { localDay } from "../src/lib/steps";
import { logs } from "./fixtures";
import { previewState } from "./state";

// #SessionResult?eventId=record (or =levelup): the longest run, with the server receipt it would get.
if (previewState.route === "SessionResult" && ["record", "levelup", "held"].includes(previewState.params.eventId)) {
  const run = logs.filter((l) => l.sport === "running").sort((a, b) => Number(b.val) - Number(a.val))[0];
  const up = previewState.params.eventId === "levelup";
  const held = previewState.params.eventId === "held";
  rememberReceipt("owner-a", run.client_event_id ?? run.id, { log_id: run.id, xp: run.xp, credits: Math.floor(run.xp / 10), credits_after: 2380, xp_after: up ? 240 : 1850, level_after: up ? 8 : 7, level_bonus: 0, leveled_up: up ? 1 : 0, requested_xp: run.xp, requested_credits: Math.floor(run.xp / 10), weekly_xp_remaining: 4000, weekly_credits_remaining: 400, server_version: "preview", ...(held ? { reward_held: true, held_xp: run.xp, held_credits: Math.floor(run.xp / 10), release_at: new Date(Date.now() + 6 * 3600000).toISOString() } : {}) });
  previewState.params.eventId = run.client_event_id ?? run.id;
}

// #QG&state=steps: TITAN's own step counter switched on, with a simulated sensor that keeps walking, so the live card and the steps screen can be reviewed.
if (typeof window !== "undefined" && window.location.hash.includes("state=steps")) {
  const BOOT = Date.now() - 6 * 3_600_000;
  let total = 50_000;
  const days: Record<string, number> = {};
  const week = [7420, 10380, 6120, 8890, 12040, 5230];
  week.forEach((n, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (week.length - i));
    days[localDay(d)] = n;
  });
  days[localDay(new Date())] = 6482;
  const t0 = Date.now() - 8 * 86_400_000;
  window.localStorage.setItem("titan.pedometer.v1:owner-a", JSON.stringify({ v: 1, boot: BOOT, last: total, lastAt: Date.now(), days, est: {}, firstAt: t0 }));
  window.localStorage.setItem("titan.pedometer-on.v1:owner-a", "true");
  window.localStorage.setItem("titan.steps-goal.v1:owner-a", "8000");
  const subs = new Set<(e: { total: number; at: number }) => void>();
  setInterval(() => { total += 3; subs.forEach((f) => f({ total, at: Date.now() })); }, 1200);
  _setPedometerForTests(createPedometer(
    { isAvailable: () => true, bootEpochMs: () => BOOT, readTotalAsync: async () => total, addListener: (_e, cb) => { subs.add(cb); return { remove: () => subs.delete(cb) }; } },
    { check: async () => true, request: async () => "granted" },
  ));
}

const TABS = ["QG", "Progress", "Record", "Adventure", "Profile"];
const ref = createNavigationContainerRef();
const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
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

function open() {
  const { route, params } = previewState;
  const nav = ref as unknown as { navigate: (name: string, params?: object) => void };
  if (previewState.signedOut) {
    if (route !== "Welcome") nav.navigate(route, params);
  } else if (TABS.includes(route)) nav.navigate("Tabs", { screen: route, params });
  else nav.navigate(route, params);
  setTimeout(() => document.body.setAttribute("data-preview-ready", "1"), 600);
}

export default function PreviewApp() {
  const [loaded] = useFonts({
    [fonts.display]: require("../assets/fonts/TitanDisplay-Heavy.ttf"),
    [fonts.displayBold]: require("../assets/fonts/TitanDisplay-Bold.ttf"),
    [fonts.text]: require("../assets/fonts/Manrope-Regular.ttf"),
    [fonts.textSemi]: require("../assets/fonts/Manrope-SemiBold.ttf"),
    [fonts.textBold]: require("../assets/fonts/Manrope-Bold.ttf"),
    [fonts.textHeavy]: require("../assets/fonts/Manrope-ExtraBold.ttf"),
  });
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 32, bottom: 0, left: 0, right: 0 } }}>
        <QueryClientProvider client={client}>
          <ToastProvider>
            <NavigationContainer ref={ref} theme={theme} onReady={open}>
              <RootNavigator />
            </NavigationContainer>
            <DialogHost />
            <PickerHost />
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
