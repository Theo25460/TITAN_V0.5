/* V1.8.5 on Android — Rencontres entre clubs, in Communauté › Clubs. The other club is a name, a number of participants and a rate
   (nothing below 3 participants); the common score is the one of the last midnight; joining is a choice and a double tap joins once;
   leaving and stopping ask first; a refusal gets its words; the recap shows totals by club and one's own part, then two questions for
   the pilot's measure. The server is a recorder (titan_club_match_v1 / _act_v1); its rules are proven by sql/tests/300_club_match.sql. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DialogHost, resetDialogs } from "../src/components/Dialog";
import { ToastProvider } from "../src/components/Toast";
import { ClubMatch } from "../src/core/clubMatch";

jest.setTimeout(20000);
const slow = { timeout: 5000 };
const mockRpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true, isOnline: () => true }));
/* eslint-disable @typescript-eslint/no-require-imports */
const { ClubsPanel } = require("../src/components/CommunityPanels");
/* eslint-enable @typescript-eslint/no-require-imports */

const CLUB = { id: "k", name: "Multisport du parc", description: null, role: "member", members: 6, code: null, announcements: [], trophies: [] };
const BASE = { id: "m1", format: "cooperation", pace: "reguliere", perWeek: 3, weeks: 1, phase: "running", side: "guest",
  startsAt: "2026-11-18T23:00:00Z", endsAt: "2026-11-25T23:00:00Z", joinUntil: "2026-11-20T23:00:00Z", asOf: "2026-11-23T23:00:00Z",
  threshold: 3, goal: 60, tieMargin: 5,
  us: { name: "Multisport du parc", participants: 2, scored: false, rate: null, total: null, target: null },
  them: { name: "Les Rouleurs", participants: 9, scored: true, rate: 62 },
  common: null, reached: null, lead: null, me: null, can: ["join"] };
const JOINED = { ...BASE, us: { name: "Multisport du parc", participants: 3, scored: true, rate: 66, total: 6, target: 9 }, common: 64, reached: true,
  me: { status: "active", club: "k", days: 2, share: 3 }, can: ["leave"] };
type Answer = { data: unknown; error: unknown };
let state: { view: Record<string, unknown>; flag: boolean; act: (args: Record<string, unknown>) => Answer | Promise<Answer> };
beforeEach(() => {
  jest.clearAllMocks();
  resetDialogs();
  state = { view: { club: "k", role: "member", current: BASE, last: null, canPropose: false, formats: ["cooperation"] }, flag: true, act: () => ({ data: null, error: null }) };
  mockRpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    let out: Answer | Promise<Answer> = { data: null, error: null };
    if (name === "titan_feature_flags_v1") out = { data: { flags: { "screens.club_match": state.flag } }, error: null };
    if (name === "titan_club_my_v1") out = { data: [CLUB], error: null };
    if (name === "titan_club_match_v1") out = { data: state.view, error: null };
    if (name === "titan_club_match_act_v1") out = Promise.resolve(state.act(args)).then((a) => { if (!a.error && a.data) state.view = a.data as Record<string, unknown>; return a; });
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
const acts = () => mockRpc.mock.calls.filter((c) => c[0] === "titan_club_match_act_v1");
const text = (id: string) => String(screen.getByTestId(id).props.children);
const ARGS = { p_club: "k", p_format: null, p_pace: null, p_weeks: null, p_starts_on: null, p_match: null, p_clear: null, p_again: null };

test("the vendored module is the website's, byte for byte", () => {
  expect(readFileSync(join(__dirname, "../src/core/web/club-match.js"), "utf8")).toBe(readFileSync(join(__dirname, "../../js/core/club-match.js"), "utf8"));
  expect(ClubMatch.RULE.threshold).toBe(3);
  expect(ClubMatch.RULE.goal).toBe(60);
  expect(ClubMatch.message({ message: "MATCH_JOIN_CLOSED" })).toMatch(/jusqu’à la fin du deuxième jour/);
});

test("the other club's totals only; joining is a choice; a double tap joins once; then the common score and my part", async () => {
  show();
  await waitFor(() => screen.getByTestId("club-match-k"), slow);
  expect(text("club-match-role-k")).toMatch(/organisées par les administrateurs des deux clubs\. Chacun choisit de participer/);
  expect(text("club-match-side-k-0")).toBe("Multisport du parc (ton club) : 2 participants · taux affiché à partir de 3 participants");
  expect(text("club-match-side-k-1")).toBe("Les Rouleurs : 9 participants · 62 % de l’objectif d’équipe");
  expect(text("club-match-score-k")).toBe("Score commun affiché quand chaque club compte 3 participants.");
  expect(text("club-match-me-k")).toMatch(/^Tu ne participes pas\. Participer est un choix/);
  let release: (a: Answer) => void = () => {};
  state.act = () => new Promise<Answer>((r) => { release = r; });
  fireEvent.press(screen.getByTestId("club-match-join-k"));
  fireEvent.press(screen.getByTestId("club-match-join-k"));
  await waitFor(() => expect(acts()).toHaveLength(1), slow);
  release({ data: { club: "k", role: "member", current: JOINED, last: null, canPropose: false, formats: ["cooperation"] }, error: null });
  await waitFor(() => expect(text("club-match-score-k")).toBe("Score commun : 64 % sur 60 % visés — seuil atteint ensemble (arrêté à minuit : personne ne voit quand un membre s’entraîne)."), slow);
  expect(acts()).toHaveLength(1);
  expect(acts()[0][1]).toEqual({ ...ARGS, p_action: "join" });
  expect(text("club-match-side-k-0")).toBe("Multisport du parc (ton club) : 3 participants · 66 % de l’objectif d’équipe (6 jours actifs sur 9 visés)");
  expect(text("club-match-me-k")).toMatch(/^Tu participes · 2 jours actifs comptés sur ta part de 3\. Au-delà de ta part, rien de plus ne compte/);
  expect(text("club-match-rules-k")).toMatch(/jusqu’à sa propre part, jamais au-delà/);
});

test("leaving asks first; my counted days stay with my club; a refusal gets its words", async () => {
  state.view = { club: "k", role: "member", current: JOINED, last: null, canPropose: false, formats: ["cooperation"] };
  state.act = () => ({ data: { club: "k", role: "member", current: { ...JOINED, us: { ...JOINED.us, participants: 2, scored: false, rate: null, total: null, target: null },
    common: null, reached: null, me: { status: "left", club: "k", days: 2, share: 2 }, can: [] }, last: null, canPropose: false, formats: ["cooperation"] }, error: null });
  show();
  await waitFor(() => screen.getByTestId("club-match-leave-k"), slow);
  fireEvent.press(screen.getByTestId("club-match-leave-k"));
  await waitFor(() => screen.getByTestId("titan-dialog"), slow);
  expect(screen.getByText(/ta part est réduite au temps passé/)).toBeTruthy();
  expect(acts()).toHaveLength(0);
  fireEvent.press(screen.getByTestId("dialog-destructive-0"));
  await waitFor(() => expect(text("club-match-me-k")).toMatch(/^Tu as quitté la rencontre\. Tes 2 jours actifs comptés restent à ton club/), slow);
  expect(screen.queryByTestId("club-match-leave-k")).toBeNull();
});

test("the organiser stops after a confirmation; a refusal from the server is worded; proposing stays on the website", async () => {
  state.view = { club: "k", role: "organizer", current: { ...BASE, phase: "upcoming", can: ["join", "stop"] }, last: null, canPropose: false, formats: ["cooperation"] };
  state.act = () => ({ data: null, error: { code: "22023", message: "MATCH_ENDED" } });
  show();
  await waitFor(() => screen.getByTestId("club-match-stop-k"), slow);
  expect(text("club-match-role-k")).toMatch(/^Tu organises les rencontres de ce club \(administrateur\)/);
  fireEvent.press(screen.getByTestId("club-match-stop-k"));
  await waitFor(() => screen.getByText(/annulée pour les deux clubs avant son départ/), slow);
  fireEvent.press(screen.getByTestId("dialog-destructive-0"));
  await waitFor(() => expect(acts().find((c) => c[1].p_action === "stop")).toBeTruthy(), slow);
  await waitFor(() => screen.getByText("Cette rencontre est terminée : son récapitulatif est disponible."), slow);
});

test("the recap: totals by club and my part, no ranking of people; two answers are needed and sent once", async () => {
  state.view = { club: "k", role: "member", current: null, canPropose: false, formats: ["cooperation"], last: { id: "m1", phase: "closed", format: "cooperation",
    startsAt: "2026-11-18T23:00:00Z", endsAt: "2026-11-25T23:00:00Z", stoppedBy: null, us: JOINED.us, them: { name: "Les Rouleurs", participants: 7, scored: true, rate: 62 },
    common: 64, reached: true, lead: null, me: { days: 3, share: 3, left: false, answered: false }, can: ["feedback"] } };
  state.act = (a) => ({ data: { ...state.view, last: { ...(state.view.last as Record<string, unknown>), me: { days: 3, share: 3, left: false, answered: true }, can: [] } }, error: null, args: a } as Answer);
  show();
  await waitFor(() => screen.getByTestId("club-match-report-k"), slow);
  expect(screen.getByText("Rencontre terminée avec « Les Rouleurs »")).toBeTruthy();
  expect(screen.getByText("Score commun : 64 % — seuil de 60 % atteint ensemble.")).toBeTruthy();
  expect(screen.getByText("Ta part : 3 jours actifs comptés sur 3. Elle n’est montrée qu’à toi.")).toBeTruthy();
  expect(screen.getByText("Aucun classement de personnes : ce récapitulatif ne montre que les totaux de chaque club.")).toBeTruthy();
  fireEvent.press(screen.getByTestId("club-match-send-k"));
  expect(acts()).toHaveLength(0);
  fireEvent.press(screen.getByTestId("club-match-clear-no-k"));
  fireEvent.press(screen.getByTestId("club-match-again-yes-k"));
  fireEvent.press(screen.getByTestId("club-match-send-k"));
  await waitFor(() => expect(acts()).toHaveLength(1), slow);
  expect(acts()[0][1]).toEqual({ ...ARGS, p_action: "feedback", p_clear: false, p_again: true });
  await waitFor(() => expect(screen.queryByTestId("club-match-feedback-k")).toBeNull(), slow);
});

test("flag closed: no meeting block and no meeting request", async () => {
  state.flag = false;
  show();
  await waitFor(() => screen.getByText("Multisport du parc"), slow);
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByTestId("club-match-k")).toBeNull();
  expect(mockRpc.mock.calls.filter((c) => String(c[0]).startsWith("titan_club_match"))).toHaveLength(0);
});
