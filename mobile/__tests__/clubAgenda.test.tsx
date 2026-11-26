/* V1.8.6 on Android — Agenda et rendez-vous d’équipe, in Communauté › Clubs. A member reads counts of answers, never a name; answers
   once with a double tap and is put on the waiting list when it is full; reads the precise place only once the server gives it; asks for
   a reminder; reads a move to confirm and the history. After the meeting, a presence is a statement and a session is linked only by its
   owner, from their own sessions of the day; nothing is written in the journal. The organiser switches to the fallback and cancels after
   a dialog; proposing stays on the website. The server is a recorder (titan_club_agenda_v1 / _act_v1); its rules are proven by
   sql/tests/300_club_agenda.sql and tools/db/test-club-agenda-concurrency.sh. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DialogHost, resetDialogs } from "../src/components/Dialog";
import { ToastProvider } from "../src/components/Toast";
import { ClubAgenda } from "../src/core/clubAgenda";

jest.setTimeout(20000);
const slow = { timeout: 5000 };
const mockRpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true, isOnline: () => true }));
/* eslint-disable @typescript-eslint/no-require-imports */
const { ClubsPanel } = require("../src/components/CommunityPanels");
/* eslint-enable @typescript-eslint/no-require-imports */

const CLUB = { id: "k", name: "Les Rouleurs du jeudi", description: null, role: "member", members: 9, code: null, announcements: [], trophies: [] };
const SLOT = { id: "s1", event: "e1", n: 1, occurrences: 1, recurrence: "once", title: "Sortie du samedi", area: "Parc de la Tête d’Or", durationMin: 120,
  startsAt: "2026-11-28T08:00:00Z", endsAt: "2026-11-28T10:00:00Z", plannedAt: "2026-11-28T08:00:00Z", moved: false, phase: "upcoming", series: "active",
  fallback: "Si pluie : séance de renfo au gymnase", fallbackOn: false, capacity: 3, full: false, counts: { yes: 2, maybe: 1, waitlist: 0, no: 1 },
  hasPlace: true, place: null, code: null, me: null, can: ["yes", "maybe", "no"], report: null,
  history: [{ kind: "created", n: null, from: null, to: "2026-11-28T08:00:00Z", at: "2026-11-24T10:00:00Z" }], roster: null };
const WAITING = { ...SLOT, full: true, counts: { yes: 3, maybe: 1, waitlist: 1, no: 1 }, place: "Parking nord, portail vert",
  me: { answer: "waitlist", position: 1, reminder: false }, can: ["maybe", "no", "remind"] };
type Answer = { data: unknown; error: unknown };
let state: { view: Record<string, unknown>; flag: boolean; act: (args: Record<string, unknown>) => Answer | Promise<Answer> };
const view = (over: Record<string, unknown> = {}) => ({ club: "k", role: "member", canCreate: false, upcoming: [SLOT], past: [], ...over });
beforeEach(() => {
  jest.clearAllMocks();
  resetDialogs();
  state = { view: view(), flag: true, act: () => ({ data: null, error: null }) };
  mockRpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    let out: Answer | Promise<Answer> = { data: null, error: null };
    if (name === "titan_feature_flags_v1") out = { data: { flags: { "screens.club_agenda": state.flag } }, error: null };
    if (name === "titan_club_my_v1") out = { data: [CLUB], error: null };
    if (name === "titan_club_agenda_v1") out = { data: state.view, error: null };
    if (name === "titan_club_agenda_act_v1") out = Promise.resolve(state.act(args)).then((a) => { if (!a.error && a.data) state.view = a.data as Record<string, unknown>; return a; });
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
const acts = () => mockRpc.mock.calls.filter((c) => c[0] === "titan_club_agenda_act_v1");
// The module joins a time with non-breaking spaces; the assertions read them as plain spaces.
const text = (id: string) => String(screen.getByTestId(id).props.children).replace(/ /g, " ");
const ARGS = { p_club: "k", p_slot: "s1", p_event: null, p_answer: null, p_on: null, p_starts_at: null, p_log: null, p_form: null };
const ID = "club-agenda-k-s1";

test("the vendored module is the website's, byte for byte", () => {
  expect(readFileSync(join(__dirname, "../src/core/web/club-agenda.js"), "utf8")).toBe(readFileSync(join(__dirname, "../../js/core/club-agenda.js"), "utf8"));
  expect(ClubAgenda.RULE.reportThreshold).toBe(3);
  expect(ClubAgenda.message({ message: "LOG_NOT_ELIGIBLE" })).toMatch(/une de tes séances confirmées du jour du rendez-vous/);
});

test("counts, never a name; a double tap answers once; full: the waiting list and then the precise place; a reminder", async () => {
  show();
  await waitFor(() => screen.getByTestId(ID), slow);
  expect(text("club-agenda-role-k")).toMatch(/jamais qui a répondu quoi/);
  expect(text(`${ID}-header`)).toBe("samedi 28 novembre à 9 h 00 · 2 h · Parc de la Tête d’Or");
  expect(text(`${ID}-counts`)).toBe("2 viennent · 1 peut-être · 1 ne vient pas · 2 places prises sur 3");
  expect(text(`${ID}-place`)).toBe("Le lieu précis est donné à ceux qui viennent, hésitent ou attendent une place.");
  expect(text(`${ID}-status-0`)).toBe("En cas de changement : Si pluie : séance de renfo au gymnase");
  expect(screen.queryByTestId(`${ID}-roster`)).toBeNull();
  let release: (a: Answer) => void = () => {};
  state.act = () => new Promise<Answer>((r) => { release = r; });
  fireEvent.press(screen.getByTestId(`${ID}-answer-yes`));
  fireEvent.press(screen.getByTestId(`${ID}-answer-yes`));
  await waitFor(() => expect(acts()).toHaveLength(1), slow);
  release({ data: view({ upcoming: [WAITING] }), error: null });
  await waitFor(() => expect(text(`${ID}-me`)).toMatch(/^Ta réponse : En attente d’une place \(1re dans la file\)/), slow);
  expect(acts()).toHaveLength(1);
  expect(acts()[0][1]).toEqual({ ...ARGS, p_action: "answer", p_answer: "yes" });
  expect(text(`${ID}-place`)).toBe("Lieu précis : Parking nord, portail vert");
  expect(text(`${ID}-counts`)).toMatch(/3 places prises sur 3 \(complet\)$/);
  await waitFor(() => screen.getByText(/C’est complet : tu es 1re dans la file d’attente/), slow);
  state.act = (a) => ({ data: view({ upcoming: [{ ...WAITING, me: { ...WAITING.me, reminder: a.p_on } }] }), error: null });
  fireEvent.press(screen.getByTestId(`${ID}-remind-true`));
  await waitFor(() => expect(text(`${ID}-me`)).toMatch(/Rappel demandé/), slow);
  expect(acts()[1][1]).toEqual({ ...ARGS, p_action: "remind", p_on: true });
});

test("a move to confirm and the history; a change of mind keeps the useful information", async () => {
  state.view = view({ upcoming: [{ ...SLOT, startsAt: "2026-11-29T09:00:00Z", moved: true, fallbackOn: true, place: "Parking nord", me: { answer: "yes", toConfirm: true, promoted: true },
    can: ["maybe", "no", "remind"], history: [...SLOT.history, { kind: "moved", n: null, from: "2026-11-28T08:00:00Z", to: "2026-11-29T09:00:00Z", at: "2026-11-24T11:00:00Z" }] }] });
  state.act = () => ({ data: view({ upcoming: [{ ...(state.view.upcoming as Record<string, unknown>[])[0], place: null, me: { answer: "no" }, can: ["yes", "maybe"] }] }), error: null });
  show();
  await waitFor(() => screen.getByTestId(`${ID}-me`), slow);
  expect(text(`${ID}-status-0`)).toBe("Déplacé : prévu d’abord samedi 28 novembre à 9 h 00.");
  expect(text(`${ID}-status-1`)).toBe("Plan de repli activé : Si pluie : séance de renfo au gymnase");
  expect(text(`${ID}-me`)).toMatch(/une place s’est libérée pour toi\. L’heure ou le plan a changé depuis ta réponse : confirme-la ou change d’avis\.$/);
  expect(text(`${ID}-history`)).toBe("Historique : Proposé le 24 novembre. Déplacé le 24 novembre : de samedi 28 novembre à 9 h 00 à dimanche 29 novembre à 10 h 00.");
  fireEvent.press(screen.getByTestId(`${ID}-answer-no`));
  await waitFor(() => expect(text(`${ID}-me`)).toBe("Ta réponse : Je ne viens pas."), slow);
  expect(text(`${ID}-status-1`)).toMatch(/^Plan de repli activé/);
  expect(text(`${ID}-place`)).toMatch(/^Le lieu précis est donné à ceux qui viennent/);
});

test("after the meeting: a presence is a statement, one's own session is linked by choice, the report shows totals from 3", async () => {
  const ended = { ...SLOT, id: "s1", phase: "ended", can: ["attend"], me: { answer: "yes" }, report: { present: 2, linked: 2, threshold: 3, visible: false } };
  state.view = view({ upcoming: [], past: [ended] });
  state.act = (a) => {
    if (a.p_action === "attend") return { data: view({ upcoming: [], past: [{ ...ended, can: ["attend", "link"], me: { answer: "yes", attended: true, linked: null, candidates: [{ id: "log-1", sport: "running", minutes: 48, unit: "km", val: 9 }] }, report: { ...ended.report, present: 3 } }] }), error: null };
    return { data: view({ upcoming: [], past: [{ ...ended, can: ["attend", "unlink"], me: { answer: "yes", attended: true, linked: { id: "log-1", sport: "running", minutes: 48 } }, report: { present: 3, linked: 3, threshold: 3, visible: true, minutes: 230, km: 52, sports: 2 } }] }), error: null };
  };
  show();
  await waitFor(() => screen.getByTestId(`${ID}-report`), slow);
  expect(text(`${ID}-me`)).toBe("Tu peux dire si tu y étais. Rien n’est écrit dans ton journal.");
  expect(screen.getByText(/Les totaux du groupe s’affichent à partir de 3 séances associées/)).toBeTruthy();
  fireEvent.press(screen.getByTestId(`${ID}-attend-true`));
  await waitFor(() => screen.getByTestId(`${ID}-link-log-1`), slow);
  expect(acts()[0][1]).toEqual({ ...ARGS, p_action: "attend", p_on: true });
  fireEvent.press(screen.getByTestId(`${ID}-link-log-1`));
  await waitFor(() => screen.getByText("230 min d’effort ensemble · 52 km · 2 disciplines"), slow);
  expect(acts()[1][1]).toEqual({ ...ARGS, p_action: "link", p_log: "log-1" });
  expect(text(`${ID}-linked`)).toMatch(/^Ta séance associée : .+ · 48 min\.$/);
  expect(screen.getByText("Aucune séance n’est écrite à ta place : chacun choisit d’associer la sienne, ou non.")).toBeTruthy();
  expect(mockRpc.mock.calls.some((c) => /training|session_create|log_create/.test(String(c[0])))).toBe(false);
});

test("the organiser reads the answers, switches to the fallback and cancels after a dialog; a refusal is worded; proposing stays on the website", async () => {
  state.view = view({ role: "organizer", canCreate: true, upcoming: [{ ...SLOT, code: "QRST2345", can: ["yes", "maybe", "no", "move", "fallback", "cancel"],
    roster: [{ name: "Léa", answer: "yes", attended: null }, { name: "Sam", answer: "waitlist", attended: null }] }] });
  state.act = (a) => a.p_action === "cancel" ? { data: null, error: { code: "22023", message: "SLOT_STARTED" } }
    : { data: view({ role: "organizer", canCreate: true, upcoming: [{ ...(state.view.upcoming as Record<string, unknown>[])[0], fallbackOn: true }] }), error: null };
  show();
  await waitFor(() => screen.getByTestId(`${ID}-roster`), slow);
  expect(text("club-agenda-role-k")).toMatch(/^Tu organises les rendez-vous de ce club \(administrateur\)/);
  expect(text(`${ID}-roster`)).toBe("Réponses : Léa (Je viens) · Sam (En attente d’une place)");
  expect(screen.getByText(/Proposer un rendez-vous, le déplacer ou gérer une série se fait depuis la version web du club/)).toBeTruthy();
  expect(screen.queryByTestId(`${ID}-move`)).toBeNull();
  fireEvent.press(screen.getByTestId(`${ID}-fallback-true`));
  await waitFor(() => expect(text(`${ID}-status-0`)).toMatch(/^Plan de repli activé/), slow);
  expect(acts()[0][1]).toEqual({ ...ARGS, p_action: "fallback", p_on: true });
  fireEvent.press(screen.getByTestId(`${ID}-cancel`));
  await waitFor(() => screen.getByTestId("titan-dialog"), slow);
  expect(screen.getByText(/Tu pourras le rétablir avant l’heure prévue/)).toBeTruthy();
  expect(acts()).toHaveLength(1);
  fireEvent.press(screen.getByTestId("dialog-destructive-0"));
  await waitFor(() => expect(acts().find((c) => c[1].p_action === "cancel")).toBeTruthy(), slow);
  await waitFor(() => screen.getByText("Ce rendez-vous a commencé : les réponses sont closes."), slow);
});

test("« Dans ton cercle »: the agenda's lines go through the shared digest", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { SocialDigestWords } = require("../src/core/cordee");
  /* eslint-enable @typescript-eslint/no-require-imports */
  const lines = SocialDigestWords.lines({ agenda: [{ slot: "s1", club: "k", clubName: "Les Rouleurs", title: "Sortie", startsAt: "2026-11-28T08:00:00Z", reason: "answer" }] });
  expect(lines.map((l: { text: string }) => l.text.replace(/ /g, " "))).toEqual(["Ton club propose « Sortie » (Les Rouleurs), samedi 28 novembre à 9 h 00. Tu viens ?"]);
  expect(SocialDigestWords.hasNews({ agenda: [] })).toBe(false);
});

test("flag closed: no agenda block and no agenda request", async () => {
  state.flag = false;
  show();
  await waitFor(() => screen.getByText("Les Rouleurs du jeudi"), slow);
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByTestId("club-agenda-k")).toBeNull();
  expect(mockRpc.mock.calls.filter((c) => String(c[0]).startsWith("titan_club_agenda"))).toHaveLength(0);
});
