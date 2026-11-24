/* V1.8.4 on Android — Saisons privées de club, in Communauté › Clubs. Each member chooses to join (nothing is shared before); below
   3 participants only the number of participants and one's own part are shown; above, the goal, the stages and the stage still in
   progress while a member pauses; a double tap joins once; leaving and stopping ask first; the organiser postpones; the frozen report shows
   milestones, never a ranking. The server is a recorder (titan_club_season_v1 / _act_v1); its rules are proven by sql/tests/300_club_season.sql. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DialogHost, resetDialogs } from "../src/components/Dialog";
import { ToastProvider } from "../src/components/Toast";
import { ClubSeason } from "../src/core/clubSeason";

jest.setTimeout(20000);
const slow = { timeout: 5000 };
const mockRpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true, isOnline: () => true }));
/* eslint-disable @typescript-eslint/no-require-imports */
const { ClubsPanel } = require("../src/components/CommunityPanels");
/* eslint-enable @typescript-eslint/no-require-imports */

const CLUB = { id: "k", name: "Run Lyon 7", description: null, role: "member", members: 9, code: null, announcements: [], trophies: [] };
const BASE = { id: "s", club: "k", title: "Quatre semaines ensemble", pace: "reguliere", perWeek: 3, weeks: 4, startsAt: "2026-11-02T00:00:00+01:00", endsAt: "2026-11-30T00:00:00+01:00",
  stoppedAt: null, postponed: 0, phase: "running", week: 4, participants: 2, threshold: 3, visible: false, paused: null, contributors: null, total: null, target: null, next: null,
  stages: [{ n: 1 }, { n: 2 }, { n: 3 }], me: null, can: ["join"] };
const VISIBLE = { ...BASE, participants: 4, visible: true, paused: 1, contributors: 4, total: 32, target: 44, next: 3,
  stages: [{ n: 1, threshold: 15, reachedAt: "2026-11-12T10:00:00Z" }, { n: 2, threshold: 30, reachedAt: "2026-11-20T10:00:00Z" }, { n: 3, threshold: 44, reachedAt: null }],
  me: { status: "active", days: 5, cap: 18, share: 12, capped: false }, can: ["pause", "leave"] };
type Answer = { data: unknown; error: unknown };
let state: { view: Record<string, unknown>; flag: boolean; act: (args: Record<string, unknown>) => Answer | Promise<Answer> };
beforeEach(() => {
  jest.clearAllMocks();
  resetDialogs();
  state = { view: { club: "k", role: "member", current: BASE, last: null, canCreate: false }, flag: true, act: () => ({ data: null, error: null }) };
  mockRpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    let out: Answer | Promise<Answer> = { data: null, error: null };
    if (name === "titan_feature_flags_v1") out = { data: { flags: { "screens.club_season": state.flag } }, error: null };
    if (name === "titan_club_my_v1") out = { data: [CLUB], error: null };
    if (name === "titan_club_season_v1") out = { data: state.view, error: null };
    if (name === "titan_club_season_act_v1") out = Promise.resolve(state.act(args)).then((a) => { if (!a.error && a.data) state.view = a.data as Record<string, unknown>; return a; });
    const result = Promise.resolve(out);
    return { setHeader: () => result, then: (yes: (v: unknown) => unknown, no?: (e: unknown) => unknown) => result.then(yes, no) };
  });
});
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } }}>
        <ToastProvider><ClubsPanel /><DialogHost /></ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}
const acts = () => mockRpc.mock.calls.filter((c) => c[0] === "titan_club_season_act_v1");
const text = (id: string) => String(screen.getByTestId(id).props.children);

test("the vendored module is the website's, byte for byte", () => {
  expect(readFileSync(join(__dirname, "../src/core/web/club-season.js"), "utf8")).toBe(readFileSync(join(__dirname, "../../js/core/club-season.js"), "utf8"));
  expect(ClubSeason.RULE.threshold).toBe(3);
  expect(ClubSeason.message({ message: "SEASON_LEFT" })).toMatch(/une pause te permettra de revenir/);
});

test("joining is a choice; below 3 nothing of the group; a double tap joins once; then the goal, the stages and my part", async () => {
  show();
  await waitFor(() => screen.getByTestId("club-season-k"), slow);
  expect(text("club-season-role-k")).toMatch(/organisées par les administrateurs du club\. Chacun choisit de participer/);
  expect(text("club-season-me-k")).toMatch(/Rejoindre la saison est un choix/);
  expect(text("club-season-group-k")).toMatch(/^2 participants\. La progression du groupe s’affiche à partir de 3 participants/);
  expect(screen.queryByTestId("club-season-progress-k")).toBeNull();
  expect(text("club-season-stage-k-1")).toBe("Étape 1 · Le départ tenu");
  let release: (a: Answer) => void = () => {};
  state.act = () => new Promise<Answer>((r) => { release = r; });
  fireEvent.press(screen.getByTestId("club-season-join-k"));
  fireEvent.press(screen.getByTestId("club-season-join-k"));
  await waitFor(() => expect(acts()).toHaveLength(1), slow);
  release({ data: { club: "k", role: "member", current: VISIBLE, last: null, canCreate: false }, error: null });
  await waitFor(() => expect(text("club-season-progress-k")).toBe("32 jours actifs ensemble sur 44 jours visés"), slow);
  expect(acts()).toHaveLength(1);
  expect(acts()[0][1]).toEqual({ p_club: "k", p_action: "join", p_title: null, p_pace: null, p_weeks: null, p_starts_on: null, p_days: null });
  expect(text("club-season-stage-k-1")).toBe("Étape 1 · Le départ tenu — atteinte le 12 novembre");
  expect(text("club-season-stage-k-3")).toMatch(/^Étape 3 · La saison bouclée — en cours/);
  expect(text("club-season-group-k")).toBe("4 participants dont 1 en pause · 4 ont déjà contribué");
  expect(text("club-season-ongoing-k")).toMatch(/^Objectif en cours : étape 3, « La saison bouclée »\. Les membres en pause gardent ce qu’ils ont apporté/);
  expect(text("club-season-me-k")).toBe("Tu participes · 5 jours actifs comptés sur ta part de 12 · plafond 18.");
});

test("pause, resume, and leaving asks first; acquired days stay with the group", async () => {
  state.view = { club: "k", role: "member", current: VISIBLE, last: null, canCreate: false };
  state.act = (a) => {
    const me = a.p_action === "pause" ? { ...VISIBLE.me, status: "paused" } : a.p_action === "leave" ? { ...VISIBLE.me, status: "left" } : VISIBLE.me;
    const can = a.p_action === "pause" ? ["resume", "leave"] : a.p_action === "leave" ? [] : ["pause", "leave"];
    return { data: { club: "k", role: "member", current: { ...VISIBLE, me, can }, last: null, canCreate: false }, error: null };
  };
  show();
  await waitFor(() => screen.getByTestId("club-season-pause-k"), slow);
  fireEvent.press(screen.getByTestId("club-season-pause-k"));
  await waitFor(() => expect(text("club-season-me-k")).toMatch(/^Tu es en pause : rien ne compte pendant la pause/), slow);
  fireEvent.press(screen.getByTestId("club-season-resume-k"));
  await waitFor(() => expect(text("club-season-me-k")).toMatch(/^Tu participes/), slow);
  fireEvent.press(screen.getByTestId("club-season-leave-k"));
  await waitFor(() => screen.getByTestId("titan-dialog"), slow);
  expect(acts().filter((c) => c[1].p_action === "leave")).toHaveLength(0);
  fireEvent.press(screen.getByTestId("dialog-destructive-0"));
  await waitFor(() => expect(text("club-season-me-k")).toBe("Tu as quitté la saison. Tes 5 jours actifs comptés restent acquis pour le groupe."), slow);
  expect(screen.queryByTestId("club-season-pause-k")).toBeNull();
});

test("the organiser postpones and stops (after a confirmation); a refusal gets its words; the report shows milestones only", async () => {
  state.view = { club: "k", role: "organizer", current: { ...BASE, phase: "upcoming", week: null, startsAt: "2026-12-07T00:00:00+01:00", participants: 0, can: ["join", "postpone", "stop"] }, last: null, canCreate: false };
  state.act = (a) => a.p_action === "postpone"
    ? { data: null, error: { code: "22023", message: "SEASON_POSTPONE_LIMIT" } }
    : { data: { club: "k", role: "organizer", current: null, canCreate: true, last: { id: "s", title: "Quatre semaines ensemble", phase: "cancelled", weeks: 4 } }, error: null };
  show();
  await waitFor(() => screen.getByTestId("club-season-postpone-k-7"), slow);
  expect(text("club-season-role-k")).toMatch(/^Tu organises les saisons de ce club \(administrateur\)/);
  fireEvent.press(screen.getByTestId("club-season-postpone-k-14"));
  await waitFor(() => expect(acts().find((c) => c[1].p_action === "postpone")?.[1].p_days).toBe(14), slow);
  await waitFor(() => screen.getByText("Le départ a déjà été reporté deux fois."), slow);
  fireEvent.press(screen.getByTestId("club-season-stop-k"));
  await waitFor(() => screen.getByText(/La saison est annulée avant son départ\./), slow);
  fireEvent.press(screen.getByTestId("dialog-destructive-0"));
  await waitFor(() => screen.getByTestId("club-season-report-k"), slow);
  expect(screen.getByText("Saison annulée avant son départ par les administrateurs du club.")).toBeTruthy();
});

test("a closed season's report: stages reached, my part, no ranking; flag closed shows nothing", async () => {
  state.view = { club: "k", role: "member", current: null, canCreate: false, last: { id: "s", title: "Quatre semaines ensemble", phase: "closed", weeks: 4, endsAt: "2026-11-30T00:00:00+01:00",
    participants: 4, visible: true, reached: 2, total: 34, target: 47, stages: [{ n: 1, reachedAt: "2026-11-12T10:00:00Z" }, { n: 2, reachedAt: "2026-11-20T10:00:00Z" }, { n: 3, reachedAt: null }], me: { days: 18, left: false } } };
  show();
  await waitFor(() => screen.getByTestId("club-season-report-k"), slow);
  expect(screen.getByText("2 étapes atteintes sur 3 · 34 jours actifs ensemble sur 47 visés · 4 participants à la fin.")).toBeTruthy();
  expect(screen.getByText("Ta part : 18 jours actifs comptés.")).toBeTruthy();
  expect(screen.getByText("Aucun classement : ce bilan ne montre que ce que le groupe a accompli.")).toBeTruthy();
});

test("flag closed: no season block and no season request", async () => {
  state.flag = false;
  show();
  await waitFor(() => screen.getByText("Run Lyon 7"), slow);
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByTestId("club-season-k")).toBeNull();
  expect(mockRpc.mock.calls.filter((c) => String(c[0]).startsWith("titan_club_season"))).toHaveLength(0);
});
