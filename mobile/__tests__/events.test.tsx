/* AUD-23: quests, common quest, season and world goal on Android — read from the server's RPCs, joined on purpose. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "../src/components/Toast";
import { EventsScreen, EventsTeaser } from "../src/screens/community/EventsScreen";

const mockRpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true, isOnline: () => true }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const today = new Date().toISOString().slice(0, 10);
let data: Record<string, unknown>;
const calls: [string, unknown][] = [];

function show(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}><SafeAreaProvider initialMetrics={metrics}><ToastProvider>{ui}</ToastProvider></SafeAreaProvider></QueryClientProvider>);
}

beforeEach(() => {
  calls.length = 0;
  data = {
    titan_periodic_quests_v1: { version: 1, week: { scope: "week", kind: "constancy", target: { days: 3 }, progress: { days: 3 }, complete: true, claimed: false, focus: ["running"] }, month: { scope: "month", kind: "multisport", target: { sports: 2 }, progress: { sports: 1 }, complete: false, claimed: false }, souvenirs: { weeks: 2, months: 0 } },
    titan_common_quest_v1: { id: "q1", title: "Le relais du dimanche", detail: "Chaque jour compte.", weekStart: today, endsAt: new Date(Date.now() + 3 * 86400000).toISOString(), target: 1500, minutes: 420, members: 7, joined: false, mine: 0, state: "open" },
    titan_season_v1: { current: { id: "s1", name: "Saison de l’Aube", rules: "Quatre semaines.", startsOn: today, endsOn: today, state: "running", participants: 12, joined: false, myMinutes: 0, myDays: 0 }, archive: [] },
    titan_cadence_week_status_v1: { current: { week: today, days: 1, target: 3, held: false, claimed: false, reward: 50 }, previous: { week: "2026-11-09", days: 3, target: 3, held: true, claimed: false, reward: 50 } },
    titan_world_goal_v1: { id: "g1", title: "L’ascension de l’hiver", detail: null, startsOn: today, endsOn: today, levels: [5000, 15000, 40000], minutes: 6200, members: 40, joined: true, mine: 180, level: 1, state: "open" },
  };
  mockRpc.mockImplementation((name: string, args: unknown) => ({
    setHeader: () => {
      calls.push([name, args]);
      return Promise.resolve(name in data ? { data: data[name], error: null } : { data: { ok: true }, error: null });
    },
  }));
});

test("shows the four kinds of events with their state", async () => {
  show(<EventsScreen />);
  expect(await screen.findByText("Garder ton rythme")).toBeTruthy();
  expect(screen.getByText("Varier à ta façon")).toBeTruthy();
  expect(screen.getByText("Le relais du dimanche")).toBeTruthy();
  expect(screen.getByText("Saison de l’Aube")).toBeTruthy();
  expect(screen.getByText("L’ascension de l’hiver")).toBeTruthy();
  expect(screen.getByText(/Palier 1 · 5 000 min · atteint|Palier 1 · 5 000 min · atteint/)).toBeTruthy();
});

test("a completed weekly quest is claimed; joining a common quest and a season calls the server", async () => {
  show(<EventsScreen />);
  fireEvent.press(await screen.findByTestId("claim-week"));
  await waitFor(() => expect(calls.some(([n, a]) => n === "titan_periodic_quest_claim_v1" && (a as { p_scope: string }).p_scope === "week")).toBe(true));
  fireEvent.press(screen.getByTestId("join-common"));
  await waitFor(() => expect(calls.some(([n, a]) => n === "titan_common_quest_join_v1" && (a as { p_join: boolean }).p_join === true)).toBe(true));
  fireEvent.press(screen.getByTestId("join-season"));
  await waitFor(() => expect(calls.some(([n]) => n === "titan_season_join_v1")).toBe(true));
});

test("a missing RPC only hides its card", async () => {
  data.titan_season_v1 = undefined;
  mockRpc.mockImplementation((name: string) => ({
    setHeader: () => Promise.resolve(name === "titan_season_v1" ? { data: null, error: { code: "PGRST202", message: "Could not find the function" } } : { data: data[name], error: null }),
  }));
  show(<EventsScreen />);
  expect(await screen.findByText("Le relais du dimanche")).toBeTruthy();
  expect(screen.queryByTestId("season")).toBeNull();
});

test("the QG teaser points at what can be claimed first: a held week, then a quest", async () => {
  const onPress = jest.fn();
  show(<EventsTeaser onPress={onPress} />);
  fireEvent.press(await screen.findByTestId("events-teaser"));
  expect(screen.getByText(/Semaine tenue : récupère \+50 crédits/)).toBeTruthy();
  expect(onPress).toHaveBeenCalled();
});

test("a held week is claimed once for 50 credits (AUD-25)", async () => {
  show(<EventsScreen />);
  expect(await screen.findByText("3/3 jours actifs : bravo !")).toBeTruthy();
  fireEvent.press(screen.getByTestId("claim-held-2026-11-09"));
  await waitFor(() => expect(calls.some(([n, a]) => n === "titan_cadence_week_claim_v1" && (a as { p_week: string }).p_week === "2026-11-09")).toBe(true));
});
