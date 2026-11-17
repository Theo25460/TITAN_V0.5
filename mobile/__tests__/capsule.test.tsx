/* AUD-40: letters to oneself — sealed with a delay, hidden until their date, then opened with « then / now ». */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "../src/components/Toast";
import { CapsuleArrivedCard, CapsuleScreen, thenNow } from "../src/screens/profile/CapsuleScreen";

const mockRpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true, isOnline: () => true }));
jest.mock("expo-notifications", () => ({ getPermissionsAsync: async () => ({ granted: false }), scheduleNotificationAsync: jest.fn(), SchedulableTriggerInputTypes: { DATE: "date" }, setNotificationChannelGroupAsync: jest.fn(), setNotificationChannelAsync: jest.fn(), setNotificationCategoryAsync: jest.fn(), AndroidImportance: {}, AndroidNotificationVisibility: {} }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
let state: Record<string, unknown>;
const calls: [string, unknown][] = [];
function show(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}><SafeAreaProvider initialMetrics={metrics}><ToastProvider>{ui}</ToastProvider></SafeAreaProvider></QueryClientProvider>);
}
beforeEach(() => {
  calls.length = 0;
  state = {
    titan_capsules_v1: { delivered: [{ id: "c1", message: "Tiens bon, tu vas y arriver.", months: 6, writtenOn: "2026-05-15", deliverOn: "2026-11-15", opened: false, then: { minutes: 240, days: 6 }, now: { minutes: 600, days: 11 } }], waiting: [{ id: "c2", months: 12, deliverOn: "2027-11-15" }] },
    titan_capsule_create_v1: { id: "c3", deliverOn: "2027-05-15" },
    titan_capsule_open_v1: true,
  };
  mockRpc.mockImplementation((name: string, args: unknown) => ({ setHeader: () => { calls.push([name, args]); return Promise.resolve({ data: state[name], error: null }); } }));
});

test("then and now in one honest line", () => {
  expect(thenNow({ minutes: 240, days: 6 }, { minutes: 600, days: 11 })).toBe("À l’époque : 6 jours actifs et 4 h d’effort sur 30 jours. Aujourd’hui : 11 jours et 10 h.");
});

test("a delivered letter stays sealed until opened, then shows its message and then/now", async () => {
  show(<CapsuleScreen />);
  fireEvent.press(await screen.findByTestId("capsule-open-c1"));
  expect(await screen.findByText("« Tiens bon, tu vas y arriver. »")).toBeTruthy();
  expect(calls.some(([n]) => n === "titan_capsule_open_v1")).toBe(true);
  expect(screen.getByText(/Arrivera le 15 novembre 2027/)).toBeTruthy();
});

test("writing a letter seals it with the chosen delay", async () => {
  show(<CapsuleScreen />);
  fireEvent.changeText(await screen.findByTestId("capsule-message"), "Dans un an, je cours mon premier semi.");
  fireEvent.press(screen.getByText("Dans 1 an"));
  fireEvent.press(screen.getByTestId("capsule-send"));
  await waitFor(() => expect(calls.find(([n]) => n === "titan_capsule_create_v1")?.[1]).toEqual({ p_message: "Dans un an, je cours mon premier semi.", p_months: 12 }));
});

test("the QG announces an unopened letter", async () => {
  const onPress = jest.fn();
  show(<CapsuleArrivedCard onPress={onPress} />);
  fireEvent.press(await screen.findByTestId("qg-capsule"));
  expect(onPress).toHaveBeenCalled();
});
