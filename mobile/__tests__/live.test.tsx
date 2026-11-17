/* TITAN LIVE on Android: the same engine as the website, a bounded journal in the session payload, and the live screen
   handing everything to the usual session form (the live layer never saves a session by itself). */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockStore = new Map<string, unknown>();
const mockDraft = jest.fn(async (..._a: unknown[]) => true);
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: async (k: string) => (mockStore.has(k) ? JSON.stringify(mockStore.get(k)) : null),
  setItem: async (k: string, v: string) => void mockStore.set(k, JSON.parse(v)),
  removeItem: async (k: string) => void mockStore.delete(k),
  multiRemove: async (ks: string[]) => ks.forEach((k) => mockStore.delete(k)),
  getAllKeys: async () => [...mockStore.keys()],
}));
jest.mock("../src/lib/gpsNative", () => ({
  recorder: { subscribe: () => () => {}, reconcile: async () => null, summary: () => ({}) },
  ensureLocationPermission: async () => "denied", getActiveOwner: async () => null, setActiveOwner: async () => {},
}));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a", useAuth: () => ({ status: "signedIn", owner: "owner-a" }) }));
jest.mock("../src/data/drafts", () => ({ saveDraft: (...a: unknown[]) => mockDraft(...a) }));
jest.mock("../src/data/hooks", () => ({ useLogs: () => ({ active: [] }) }));
jest.mock("../src/lib/haptics", () => ({ haptic: jest.fn() }));
jest.mock("../src/lib/liveCompanion", () => ({ deliver: (outs: { type: string; cue?: unknown }[]) => outs.filter((o) => o.type === "cue").map((o) => o.cue), clearLiveNotification: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
const { LiveEngine, LiveVoies } = require("../src/core/live");
const { sanitizeLiveJournal } = require("../src/core/liveJournal");
const { buildSession, freshDraft, sanitizeDetails } = require("../src/core/session");
const { LiveSessionScreen } = require("../src/screens/live/LiveSessionScreen");
/* eslint-enable @typescript-eslint/no-require-imports */

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const nav = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
const show = (sport: string) => render(<SafeAreaProvider initialMetrics={metrics}><ToastProvider><LiveSessionScreen navigation={nav} route={{ params: { sport } }} /></ToastProvider></SafeAreaProvider>);

beforeEach(() => { mockStore.clear(); mockDraft.mockClear(); nav.replace.mockClear(); });

test("the Android copies of the live modules are the website's, byte for byte", () => {
  for (const f of ["live-voies.js", "live-engine.js", "live-world.js"])
    expect(readFileSync(join(__dirname, "../src/core/web", f), "utf8")).toBe(readFileSync(join(__dirname, "../../js/core", f), "utf8"));
  expect(LiveVoies.resolve("badminton").voie).toBe("joute");
});

test("the journal is bounded and only travels with the sport it belongs to", () => {
  let s = LiveEngine.create({ sportId: "muscu_gym", seed: "s", intent: "atteindre" });
  s = LiveEngine.step(s, { type: "start" }, 1000).state;
  s = LiveEngine.step(s, { type: "end" }, 1000 + 30 * 60000).state;
  const j = { ...LiveEngine.journal(s), missions: Array.from({ length: 9 }, (_, i) => ({ id: `forge.m${"x".repeat(i + 2)}`, at: 1 })), evil: "x".repeat(9999) };
  const clean = sanitizeLiveJournal(j);
  expect(clean.missions).toHaveLength(3);
  expect(JSON.stringify(clean)).not.toContain("evil");
  const draft = { ...freshDraft("muscu_gym"), durM: "30", live: clean };
  const built = buildSession(draft);
  expect(built.details.live.voie).toBe("forge");
  expect(sanitizeDetails(built.details, "running").live).toBeUndefined();
  expect(sanitizeDetails(built.details, "muscu_gym").live.sport).toBe("muscu_gym");
});

test("strength live session: intent, a logged set, the end report, then the usual form with the journal", async () => {
  show("muscu_gym");
  expect(await screen.findByText("La Forge")).toBeTruthy();
  fireEvent.press(screen.getByText("Se dépasser"));
  fireEvent.press(screen.getByTestId("live-start"));
  await waitFor(() => expect(screen.getByTestId("live-log-set")).toBeTruthy());
  fireEvent.changeText(screen.getByTestId("live-exercise"), "Squat");
  fireEvent.press(screen.getByTestId("live-log-set"));
  fireEvent.press(screen.getByText("Vue aventure"));
  expect(screen.getByText(/1 frappe/)).toBeTruthy();
  fireEvent.press(screen.getByTestId("live-finish"));
  await waitFor(() => expect(screen.getByTestId("live-keep")).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByTestId("live-keep")); });
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("SessionForm", { sport: "muscu_gym" }));
  const [owner, draft] = mockDraft.mock.calls[0];
  expect(owner).toBe("owner-a");
  expect(draft.live.voie).toBe("forge");
  expect(draft.live.intent).toBe("depasser");
  expect(draft.exercises[0].name).toBe("Squat");
  expect(mockStore.has("titan.live.v1:owner-a")).toBe(false);
});

test("a risky sport offers no audio or narrative immersion and explains why", async () => {
  show("kitesurf");
  expect(await screen.findByText("Les Éléments")).toBeTruthy();
  expect(screen.queryByText("Aventure narrative")).toBeNull();
  expect(screen.queryByText("Audio")).toBeNull();
  expect(screen.getByText(/TITAN se tait pendant l’effort/)).toBeTruthy();
  expect(screen.getByText(/Pendant l’effort, TITAN ne te sollicitera pas/)).toBeTruthy();
});

test("a running live session survives a restart of the app", async () => {
  let s = LiveEngine.create({ sportId: "yoga", seed: "y", intent: "explorer", owner: "owner-a" });
  s = LiveEngine.step(s, { type: "start" }, Date.now() - 20 * 60000).state;
  mockStore.set("titan.live.v1:owner-a", { state: s, savedAt: Date.now() - 20 * 60000 });
  show("yoga");
  expect(await screen.findByText("Séance retrouvée")).toBeTruthy();
  fireEvent.press(screen.getByText("J’étais à l’arrêt"));
  await waitFor(() => expect(screen.queryByText("Séance retrouvée")).toBeNull());
});
