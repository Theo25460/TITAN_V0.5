/* The GPS recording screen: permission asked on Démarrer with the reason shown first, refusal explained without losing the
   manual path, pause/resume/finish, totals handed to the usual form draft, never coordinates. Native location is faked. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { Recording } from "../src/lib/gpsRecorder";
import type { Fix } from "../src/lib/gpsTrack";

const mockStore = new Map<string, Recording | null>();
const mockState = { permission: "ok" as "ok" | "denied" | "blocked" | "unavailable", updates: false, active: null as string | null };
const mockDraft = jest.fn();
const mockGuard = jest.fn(async (_owner: string | null) => {});
let mockAuth: { status: string; owner: string | null };
jest.mock("../src/lib/gpsNative", () => {
  const { createRecorder } = jest.requireActual("../src/lib/gpsRecorder");
  const recorder = createRecorder({
    read: async (k: string) => (mockStore.get(k) ? JSON.parse(JSON.stringify(mockStore.get(k))) : null),
    write: async (k: string, v: Recording | null) => void mockStore.set(k, v ? JSON.parse(JSON.stringify(v)) : null),
    startUpdates: async () => void (mockState.updates = true),
    stopUpdates: async () => void (mockState.updates = false),
    updatesRunning: async () => mockState.updates,
    now: () => Date.now(),
  });
  return {
    recorder,
    ensureLocationPermission: async () => mockState.permission,
    getActiveOwner: async () => mockState.active,
    setActiveOwner: async (o: string | null, expected?: string) => {
      if (expected === undefined || mockState.active === expected) mockState.active = o;
    },
    guardAccount: (owner: string | null) => mockGuard(owner),
  };
});
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a", useAuth: () => mockAuth }));
jest.mock("../src/data/drafts", () => ({ saveDraft: (...a: unknown[]) => mockDraft(...a) }));
jest.mock("../src/lib/exportFile", () => ({ shareTextFile: jest.fn(async () => undefined) }));
jest.mock("../src/lib/haptics", () => ({ haptic: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
const { GpsRecordScreen } = require("../src/screens/session/GpsRecordScreen");
const { GpsAccountGuard } = require("../src/components/GpsAccountGuard");
const exportFile = require("../src/lib/exportFile");
const { recorder: mockRecorder } = require("../src/lib/gpsNative");
/* eslint-enable @typescript-eslint/no-require-imports */

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const nav = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
const show = () => render(<SafeAreaProvider initialMetrics={metrics}><ToastProvider><GpsRecordScreen navigation={nav} route={{ params: { sport: "running" } }} /></ToastProvider></SafeAreaProvider>);
const fix = (i: number): Fix => ({ lat: 48.85 + i * 0.000045, lon: 2.35, alt: 100, altAcc: 5, acc: 5, t: Date.now() + i * 1000 });

beforeEach(() => {
  mockStore.clear();
  mockAuth = { status: "signedIn", owner: "owner-a" };
  mockGuard.mockClear();
  mockState.permission = "ok";
  mockState.updates = false;
  mockState.active = null;
  [mockDraft, nav.replace, nav.goBack, nav.navigate].forEach((f) => f.mockClear());
});

test("explains why the position is needed before asking, and keeps the manual path", async () => {
  show();
  expect(await screen.findByText(/Pourquoi TITAN te demande ta position/)).toBeTruthy();
  expect(screen.getByText(/reste sur ce téléphone pendant l’enregistrement/)).toBeTruthy();
  fireEvent.press(screen.getByText("Saisir la séance à la main"));
  expect(nav.replace).toHaveBeenCalledWith("SessionForm", { sport: "running" });
});

test.each([
  ["denied", /Autorisation nécessaire/],
  ["blocked", /Autorisation refusée/],
  ["unavailable", /Localisation désactivée/],
] as const)("a refused permission (%s) starts nothing and says what to do", async (p, text) => {
  mockState.permission = p;
  show();
  fireEvent.press(await screen.findByTestId("gps-start"));
  expect(await screen.findByText(text)).toBeTruthy();
  expect(mockState.updates).toBe(false);
  expect(mockStore.size).toBe(0);
});

test("start, pause, resume, finish, then the totals become the form draft and the recording is released", async () => {
  show();
  fireEvent.press(await screen.findByTestId("gps-start"));
  await screen.findByText(/Enregistrement en cours/);
  expect(mockState.updates).toBe(true);
  expect(mockState.active).toBe("owner-a");
  await act(async () => void (await mockRecorder.append("owner-a", Array.from({ length: 31 }, (_, i) => fix(i)))));
  fireEvent.press(screen.getByTestId("gps-toggle"));
  await screen.findByText(/En pause/);
  expect(mockState.updates).toBe(false);
  fireEvent.press(screen.getByTestId("gps-toggle"));
  await screen.findByText(/Enregistrement en cours/);
  fireEvent.press(screen.getByTestId("gps-finish"));
  await screen.findByText(/Séance terminée/);
  fireEvent.press(screen.getByText("Exporter la trace GPX"));
  await waitFor(() => expect(exportFile.shareTextFile).toHaveBeenCalled());
  expect(exportFile.shareTextFile.mock.calls[0][1]).toContain("<trkpt");
  fireEvent.press(screen.getByTestId("gps-keep"));
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("SessionForm", { sport: "running" }));
  const draft = mockDraft.mock.calls[0][1];
  expect(draft.distance).toMatch(/^0,/);
  expect(draft.gpx.points).toBe(31);
  expect(draft.gpsRouteId).toMatch(/^gps-/);
  expect(JSON.stringify(draft)).not.toContain("48.85");
  expect(mockStore.get("titan.gps.v1:owner-a") ?? null).toBeNull();
  expect(mockState.active).toBeNull();
});

test("a recording left running by a lost service is shown as interrupted, not extended", async () => {
  await mockRecorder.start("owner-a", "running");
  await mockRecorder.append("owner-a", Array.from({ length: 5 }, (_, i) => fix(i)));
  mockState.updates = false;
  show();
  expect(await screen.findByText(/Enregistrement interrompu/)).toBeTruthy();
  expect(screen.getByText(/En pause/)).toBeTruthy();
});

test("resuming after sign-out reconnects background fixes to the recording owner", async () => {
  await mockRecorder.start("owner-a", "running");
  await mockRecorder.pause("owner-a");
  show();
  fireEvent.press(await screen.findByTestId("gps-toggle"));
  await screen.findByText(/Enregistrement en cours/);
  expect(mockState.active).toBe("owner-a");
});

test("a revoked location permission keeps an existing trace paused and offers Android settings", async () => {
  await mockRecorder.start("owner-a", "running");
  await mockRecorder.append("owner-a", [fix(1), fix(2)]);
  await mockRecorder.pause("owner-a");
  mockState.permission = "blocked";
  show();
  fireEvent.press(await screen.findByTestId("gps-toggle"));
  expect(await screen.findByText("Ouvrir les réglages")).toBeTruthy();
  expect(screen.getByText(/En pause/)).toBeTruthy();
  expect(mockState.updates).toBe(false);
  expect((await mockRecorder.load("owner-a")).track.segs[0]).toHaveLength(2);
});

test("launch waits for the initial auth identity before deciding whether to pause GPS", () => {
  mockAuth = { status: "loading", owner: null };
  const view = render(<GpsAccountGuard />);
  expect(mockGuard).not.toHaveBeenCalled();
  mockAuth = { status: "signedIn", owner: "owner-a" };
  view.rerender(<GpsAccountGuard />);
  expect(mockGuard).toHaveBeenLastCalledWith("owner-a");
  mockAuth = { status: "loading", owner: null };
  view.rerender(<GpsAccountGuard />);
  expect(mockGuard).toHaveBeenLastCalledWith(null);
});
