/* Lot 8 « communauté »: the circle on the QG (C1, C8, C10), friends' moments (C2), intentions (C5), the fair ranking (C4),
   clubs (C7), ready-made challenges (C6), automatic sharing (C3) and what a session also counts for (C9). */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "../src/components/Toast";
import { CHALLENGE_TEMPLATES, contributions, readAutoShare, writeAutoShare } from "../src/lib/community";

const slow = { timeout: 5000 };
const mockNavigate = jest.fn();
const mockStore = new Map<string, unknown>();
const mockRpc = jest.fn();
const mockSocial = jest.fn();
jest.mock("@react-navigation/native", () => ({ ...jest.requireActual("@react-navigation/native"), useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true, isOnline: () => true }));
jest.mock("../src/data/hooks", () => ({ keys: { social: (o: string) => ["social", o] }, useSocial: () => ({ data: mockSocial() }) }));
jest.mock("../src/lib/storage", () => ({
  ownerKey: (s: string, o: string) => `titan.${s}.v1:${o}`,
  readJSON: async (k: string, f: unknown) => (mockStore.has(k) ? mockStore.get(k) : f),
  writeJSON: async (k: string, v: unknown) => void mockStore.set(k, v),
}));
/* eslint-disable @typescript-eslint/no-require-imports */
const { CircleCard, FriendsFeedCard, IntentCard } = require("../src/components/CommunityCards");
const { ClubsPanel, RankingPanel } = require("../src/components/CommunityPanels");
/* eslint-enable @typescript-eslint/no-require-imports */
const { social } = jest.requireActual("../test-fixtures/data");

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}><SafeAreaProvider initialMetrics={metrics}><ToastProvider>{ui}</ToastProvider></SafeAreaProvider></QueryClientProvider>);
}
let answers: Record<string, unknown> = {};
beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  answers = {};
  mockSocial.mockReturnValue(social);
  mockRpc.mockImplementation((name: string) => {
    const r = { data: name in answers ? answers[name] : null, error: null };
    return { setHeader: () => Promise.resolve(r), then: (f: (v: unknown) => unknown, g?: (e: unknown) => unknown) => Promise.resolve(r).then(f, g) };
  });
});

test("C9: a session counts for the guild, joined events and challenges — nothing for what was not joined", () => {
  const events = {
    quests: null, cadence: null, titles: [],
    common: { id: "q", title: "Les 10 000 minutes", joined: true, state: "open" },
    season: { current: { id: "s", name: "Hiver", joined: false, state: "running" }, archive: [] },
    goal: { id: "w", title: "Tour du monde", joined: true, state: "open" },
  };
  const c = contributions(social, events as never);
  expect(c[0]).toContain("ta guilde (340 / 600 min");
  expect(c).toContain("la quête commune « Les 10 000 minutes »");
  expect(c).toContain("l’objectif mondial « Tour du monde »");
  expect(c.join(" ")).not.toContain("Hiver");
  expect(c.join(" ")).not.toContain("La traversée"); // expedition not joined
  expect(c).toContain("1 défi entre amis");
  expect(contributions(null, null)).toEqual([]);
});

test("C6: every template is a valid friendly challenge (1–31 days, no distance)", () => {
  for (const t of CHALLENGE_TEMPLATES) {
    expect(t.days).toBeGreaterThanOrEqual(1);
    expect(t.days).toBeLessThanOrEqual(31);
    expect(t.metric).not.toBe("distance_km");
    expect(t.title.length).toBeLessThanOrEqual(60);
  }
});

test("C3: automatic sharing is off by default and kept per account", async () => {
  expect(await readAutoShare("owner-a")).toBe(false);
  await writeAutoShare("owner-a", true);
  expect(await readAutoShare("owner-a")).toBe(true);
  expect(await readAutoShare("owner-b")).toBe(false);
});

test("C1 + C8: the circle lists requests, cheers, challenges and the guild week, and opens the community", async () => {
  mockSocial.mockReturnValue({ ...social, moments: social.moments.map((m: { created_at: string }) => ({ ...m, created_at: new Date().toISOString() })) });
  wrap(<CircleCard />);
  expect(await screen.findByText("1 demande d’ami en attente", {}, slow)).toBeTruthy();
  expect(screen.getByText("2 encouragements reçus cette semaine")).toBeTruthy();
  expect(screen.getByText("1 défi t’attend")).toBeTruthy();
  expect(screen.getByText("1 défi en cours")).toBeTruthy();
  expect(screen.getByTestId("qg-guild").props.children).toContain("340 / 600");
  fireEvent.press(screen.getByTestId("qg-circle"));
  expect(mockNavigate).toHaveBeenCalledWith("Community");
});

test("C8: a guild week reached is celebrated together", async () => {
  mockSocial.mockReturnValue({ ...social, guild: { ...social.guild, minutes: 640 } });
  wrap(<CircleCard />);
  expect((await screen.findByTestId("qg-guild", {}, slow)).props.children).toContain("atteint ensemble");
});

test("C2: only friends' moments appear, and an encouragement is one tap", async () => {
  mockSocial.mockReturnValue({ ...social, moments: [...social.moments, { ...social.moments[1], id: "m3", cheered: false, author: { id: "f2", name: "Max", avatar: "ranger" }, title: "Vélo 40 km" }] });
  wrap(<FriendsFeedCard />);
  expect(screen.queryByText("Course à pied · 10 km")).toBeNull();
  expect(screen.getByText("Squat 100 kg")).toBeTruthy();
  fireEvent.press(screen.getByText("Encourager"));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("titan_moment_cheer", { p_id: "m3" }), slow);
});

test("C5: an intention is announced to friends, and a friend's intention can be cheered", async () => {
  answers.titan_intents_v1 = { mine: null, friends: [{ userId: "f1", name: "Léa", intent: "Yoga ce soir", done: false, cheered: false }] };
  wrap(<IntentCard now={new Date(2026, 10, 18, 9)} />);
  fireEvent.changeText(await screen.findByTestId("intent-text", {}, slow), "Ce soir : 30 min de vélo");
  fireEvent.press(screen.getByTestId("intent-set"));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("titan_intent_set_v1", { p_day: "2026-11-18", p_text: "Ce soir : 30 min de vélo", p_visibility: "friends" }), slow);
  fireEvent.press(screen.getByText("Allez !"));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("titan_intent_cheer_v1", { p_owner: "f1", p_day: "2026-11-18", p_on: true }), slow);
});

test("C4: the fair ranking is opt-in, then shows progress rather than volume", async () => {
  answers.titan_ranking_v1 = { optedIn: false };
  const { unmount } = wrap(<RankingPanel />);
  fireEvent.press(await screen.findByTestId("ranking-join", {}, slow));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("titan_ranking_set_v1", { p_on: true }), slow);
  unmount();
  answers.titan_ranking_v1 = { optedIn: true, entries: [{ rank: 1, name: "Léa", score: 80, activeDays: 12, progressPct: 25, me: false }, { rank: 2, name: "Moi", score: 60, activeDays: 9, progressPct: -5, me: true }] };
  wrap(<RankingPanel />);
  expect(await screen.findByText("Toi", {}, slow)).toBeTruthy();
  expect(screen.getByText("12 j · +25 %")).toBeTruthy();
  expect(screen.getByText("9 j · -5 %")).toBeTruthy();
});

test("C7: my clubs show members, announcements and trophies; a club is joined by its code", async () => {
  answers.titan_club_my_v1 = [{ id: "k", name: "Run Lyon 7", description: "Le jeudi soir", role: "member", members: 14, code: null, announcements: [{ id: "a", body: "Sortie jeudi 19 h", at: "2026-11-14" }], trophies: [{ id: "t", title: "Mois le plus actif", note: null, on: "2026-10-31" }] }];
  wrap(<ClubsPanel />);
  expect(await screen.findByText("Run Lyon 7", {}, slow)).toBeTruthy();
  expect(screen.getByText("14 membres")).toBeTruthy();
  expect(screen.getByText("« Sortie jeudi 19 h »")).toBeTruthy();
  expect(screen.getByText("Trophée : Mois le plus actif")).toBeTruthy();
  fireEvent.changeText(screen.getByTestId("club-code"), "abcd-12");
  fireEvent.press(screen.getByTestId("club-join"));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("titan_club_join_v1", { p_code: "ABCD-12", p_club: null }), slow);
});

test("social lot B: a club shows its common goal of the week as a total, never a name", async () => {
  answers.titan_club_my_v1 = [{ id: "k", name: "Run Lyon 7", description: null, role: "member", members: 14, code: null, announcements: [], trophies: [] }];
  answers.titan_club_week_v1 = { club: "k", weekStart: "2026-11-16", goal: 600, minutes: 640, members: 14, active: 9, canSet: false };
  wrap(<ClubsPanel />);
  expect(await screen.findByText("Cette semaine ensemble : 640 min d’effort / 600 · 9 membres actifs sur 14", {}, slow)).toBeTruthy();
  expect(screen.getByText("Objectif de la semaine atteint ensemble.")).toBeTruthy();
  expect(mockRpc).toHaveBeenCalledWith("titan_club_week_v1", { p_club: "k" });
});
