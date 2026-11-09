/* The Health Connect screen: explicit consent, readings only on a tap, per-session import with a correctable duration, steps that grant nothing,
   an account switch that drops a late answer. The native library is replaced by a fake; the server calls by mocks. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { createHealthConnect, _setHealthConnectForTests, type HcLib } from "../src/lib/healthConnect";

const mockApi = {
  sourcesStatus: jest.fn(),
  sourceConsent: jest.fn(),
  importActivity: jest.fn(),
  importDailySteps: jest.fn(),
  archiveImported: jest.fn(),
};
let mockOwner = "owner-a";
jest.mock("../src/data/api", () => ({
  assertOwner: async () => ({}),
  sourcesStatus: (...a: unknown[]) => mockApi.sourcesStatus(...a),
  sourceConsent: (...a: unknown[]) => mockApi.sourceConsent(...a),
  importActivity: (...a: unknown[]) => mockApi.importActivity(...a),
  importDailySteps: (...a: unknown[]) => mockApi.importDailySteps(...a),
  archiveImported: (...a: unknown[]) => mockApi.archiveImported(...a),
}));
jest.mock("../src/data/auth", () => ({ useOwner: () => mockOwner, useAuth: () => ({ owner: mockOwner }) }));
jest.mock("../src/data/hooks", () => ({ invalidateAfterSession: jest.fn() }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
const { HealthConnectScreen } = require("../src/screens/settings/HealthConnectScreen");
/* eslint-enable @typescript-eslint/no-require-imports */

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const show = () => render(<QueryClientProvider client={new QueryClient()}><SafeAreaProvider initialMetrics={metrics}><ToastProvider><HealthConnectScreen /></ToastProvider></SafeAreaProvider></QueryClientProvider>);
const at = (d: number, h: number, m = 0) => new Date(2026, 9, 28 - d, h, m).toISOString();

function lib(over: Partial<HcLib> = {}): HcLib {
  return {
    getSdkStatus: async () => 3,
    initialize: async () => true,
    requestPermission: async (p) => p,
    getGrantedPermissions: async () => [],
    revokeAllPermissions: async () => undefined,
    openHealthConnectSettings: jest.fn(),
    aggregateGroupByPeriod: async () => [{ result: { COUNT_TOTAL: 7000 }, startTime: new Date(2026, 9, 27).toISOString(), endTime: new Date(2026, 9, 28).toISOString() }],
    readRecords: async () => ({ records: [{ startTime: at(1, 8), endTime: at(1, 8, 40), exerciseType: 56, title: "Footing", metadata: { id: "hc-1" } }, { startTime: at(2, 18), endTime: at(2, 19), exerciseType: 999, metadata: { id: "hc-2" } }] }),
    ...over,
  };
}

beforeAll(() => { jest.useFakeTimers({ now: new Date(2026, 9, 28, 21, 0), doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame", "performance", "hrtime"] }); });
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  mockOwner = "owner-a";
  Object.values(mockApi).forEach((f) => f.mockReset());
  mockApi.sourcesStatus.mockResolvedValue([]);
  mockApi.sourceConsent.mockResolvedValue({ granted: true });
  mockApi.importDailySteps.mockResolvedValue({});
  mockApi.importActivity.mockResolvedValue({ status: "imported", log_id: "l1" });
  mockApi.archiveImported.mockResolvedValue(2);
});

describe("Santé Connect", () => {
  test("not Android: said plainly, nothing is requested", async () => {
    _setHealthConnectForTests(createHealthConnect(null));
    show();
    expect(await screen.findByText(/disponible que dans l’application Android/)).toBeTruthy();
    expect(mockApi.sourceConsent).not.toHaveBeenCalled();
  });
  test("unavailable and update required are explained", async () => {
    _setHealthConnectForTests(createHealthConnect(lib({ getSdkStatus: async () => 1 })));
    const a = show();
    expect(await screen.findByText(/n’est pas disponible sur ce téléphone/)).toBeTruthy();
    a.unmount();
    _setHealthConnectForTests(createHealthConnect(lib({ getSdkStatus: async () => 2 })));
    show();
    expect(await screen.findByText("Mets à jour Santé Connect")).toBeTruthy();
  });
  test("before consent: what is read is told, nothing is read, the server is told nothing until the Android prompt is accepted", async () => {
    const l = lib({ requestPermission: jest.fn(async () => []) });
    _setHealthConnectForTests(createHealthConnect(l));
    show();
    expect(await screen.findByText(/Ce que TITAN lit, seulement avec ton accord/)).toBeTruthy();
    expect(screen.getByText(/ni fréquence cardiaque, sommeil, poids, calories ou position/)).toBeTruthy();
    expect(screen.queryByTestId("hc-steps")).toBeNull();
    fireEvent.press(screen.getByTestId("hc-authorize"));
    expect(await screen.findByTestId("hc-notice")).toBeTruthy();
    expect(mockApi.sourceConsent).not.toHaveBeenCalled();
  });
  test("consent, steps (granted nothing), sessions imported one by one with a corrected duration, already-known ones said so", async () => {
    let granted: { accessType: string; recordType: string }[] = [];
    const l = lib({ requestPermission: async (p) => { granted = p; return p; }, getGrantedPermissions: async () => granted });
    _setHealthConnectForTests(createHealthConnect(l));
    show();
    fireEvent.press(await screen.findByTestId("hc-authorize"));
    await waitFor(() => expect(mockApi.sourceConsent).toHaveBeenCalledWith("owner-a", "health_connect", true, expect.any(Function)));
    fireEvent.press(await screen.findByTestId("hc-steps"));
    await waitFor(() => expect(mockApi.importDailySteps).toHaveBeenCalledWith("owner-a", "2026-10-27", 7000, expect.any(Function)));
    expect(screen.getByText(/Aucun pas|7[\s  ]?000 pas/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("hc-sessions"));
    expect(await screen.findByTestId("hc-row-hc-1")).toBeTruthy();
    expect(screen.queryByTestId("hc-row-hc-2")).toBeNull();           // an unrecognised type is never offered
    fireEvent.changeText(screen.getByTestId("hc-minutes-hc-1"), "0");
    fireEvent.press(screen.getByTestId("hc-import-hc-1"));
    expect(await screen.findByText(/Entre 1 et 1 440 minutes/)).toBeTruthy();
    expect(mockApi.importActivity).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId("hc-minutes-hc-1"), "35");
    fireEvent.press(screen.getByTestId("hc-import-hc-1"));
    await waitFor(() => expect(mockApi.importActivity).toHaveBeenCalledWith("owner-a", { externalId: "hc-1", sport: "running", startedAt: expect.any(String), minutes: 35 }, expect.any(Function)));
    expect(await screen.findByText(/Importée dans ton journal/)).toBeTruthy();
  });
  test("a session already in the journal is linked and counted once", async () => {
    mockApi.sourcesStatus.mockResolvedValue([{ source: "health_connect", granted: true }]);
    mockApi.importActivity.mockResolvedValue({ status: "linked", log_id: "l9" });
    _setHealthConnectForTests(createHealthConnect(lib({ getGrantedPermissions: async () => [{ accessType: "read", recordType: "Steps" }, { accessType: "read", recordType: "ExerciseSession" }] })));
    show();
    fireEvent.press(await screen.findByTestId("hc-sessions"));
    fireEvent.press(await screen.findByTestId("hc-import-hc-1"));
    expect(await screen.findByText(/rapprochée, comptée une seule fois/)).toBeTruthy();
  });
  test("stopping withdraws the consent on the server and in Android; archiving is a separate, explicit action", async () => {
    mockApi.sourcesStatus.mockResolvedValue([{ source: "health_connect", granted: true }]);
    const revoke = jest.fn(async () => undefined);
    _setHealthConnectForTests(createHealthConnect(lib({ revokeAllPermissions: revoke, getGrantedPermissions: async () => [{ accessType: "read", recordType: "Steps" }, { accessType: "read", recordType: "ExerciseSession" }] })));
    show();
    fireEvent.press(await screen.findByTestId("hc-archive"));
    await waitFor(() => expect(mockApi.archiveImported).toHaveBeenCalledWith("owner-a", "health_connect", expect.any(Function)));
    fireEvent.press(screen.getByTestId("hc-stop"));
    await waitFor(() => expect(mockApi.sourceConsent).toHaveBeenCalledWith("owner-a", "health_connect", false, expect.any(Function)));
    expect(revoke).toHaveBeenCalled();
    expect(await screen.findByTestId("hc-authorize")).toBeTruthy();
  });
  test("a late answer for a previous account is dropped after an account switch", async () => {
    mockApi.sourcesStatus.mockResolvedValue([{ source: "health_connect", granted: true }]);
    let release: (v: { status: string }) => void = () => undefined;
    mockApi.importActivity.mockImplementation(() => new Promise((ok) => { release = ok as typeof release; }));
    _setHealthConnectForTests(createHealthConnect(lib({ getGrantedPermissions: async () => [{ accessType: "read", recordType: "Steps" }, { accessType: "read", recordType: "ExerciseSession" }] })));
    const view = show();
    fireEvent.press(await screen.findByTestId("hc-sessions"));
    fireEvent.press(await screen.findByTestId("hc-import-hc-1"));
    mockOwner = "owner-b";
    view.rerender(<QueryClientProvider client={new QueryClient()}><SafeAreaProvider initialMetrics={metrics}><ToastProvider><HealthConnectScreen /></ToastProvider></SafeAreaProvider></QueryClientProvider>);
    await act(async () => { release({ status: "imported" }); });
    expect(screen.queryByText(/Importée dans ton journal/)).toBeNull();
  });
});
