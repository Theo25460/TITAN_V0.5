/* TITAN LIVE on Android: the three intents give three different sessions (stages, one threshold, discoveries without a
   figure), built on the athlete's own comparable sessions; yoga prepares in silence; the report tells the session; the
   camp says what comes next. The engine is the website's: these tests cover what the phone shows of it. */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockStore = new Map<string, unknown>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDraft = jest.fn(async (..._a: any[]) => true);
let mockLogs: unknown[] = [];
const mockWorld = { version: 1, enabled: true, wallet: { eclats: 10, essences: {} }, buildings: {}, collection: [], voies: { forge: { sessions: 1, days: 1 } }, days: 1, distinctVoies: 1 };
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: async (k: string) => (mockStore.has(k) ? JSON.stringify(mockStore.get(k)) : null),
  setItem: async (k: string, v: string) => void mockStore.set(k, JSON.parse(v)),
  removeItem: async (k: string) => void mockStore.delete(k),
  multiRemove: async (ks: string[]) => ks.forEach((k) => mockStore.delete(k)),
  getAllKeys: async () => [...mockStore.keys()],
}));
jest.mock("../src/lib/supabase", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "t" } } }) },
  rpc: (name: string) => ({ setHeader: () => Promise.resolve(name === "titan_live_world_v1" ? { data: mockWorld, error: null } : { data: null, error: { message: "UNEXPECTED_RPC" } }) }),
} }));
jest.mock("../src/lib/gpsNative", () => ({
  recorder: { subscribe: () => () => {}, reconcile: async () => null, summary: () => ({}) },
  ensureLocationPermission: async () => "denied", getActiveOwner: async () => null, setActiveOwner: async () => {},
}));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a", useAuth: () => ({ status: "signedIn", owner: "owner-a" }) }));
jest.mock("../src/data/drafts", () => ({ saveDraft: (...a: unknown[]) => mockDraft(...a) }));
jest.mock("../src/data/hooks", () => ({ useLogs: () => ({ active: mockLogs, confirmed: mockLogs }) }));
jest.mock("../src/lib/haptics", () => ({ haptic: jest.fn() }));
jest.mock("../src/lib/liveCompanion", () => ({ deliver: (outs: { type: string; cue?: unknown }[]) => outs.filter((o) => o.type === "cue").map((o) => o.cue), clearLiveNotification: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
const { LiveEngine, LivePrepare, LiveVoies } = require("../src/core/live");
const { CampScreen } = require("../src/screens/live/CampScreen");
const { LiveSessionScreen } = require("../src/screens/live/LiveSessionScreen");
const { saveLive } = require("../src/data/live");
/* eslint-enable @typescript-eslint/no-require-imports */

const metrics = { frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const nav = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
const wrap = (node: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}>
    <SafeAreaProvider initialMetrics={metrics}><ToastProvider>{node}</ToastProvider></SafeAreaProvider>
  </QueryClientProvider>,
);
const show = (sport: string) => wrap(<LiveSessionScreen navigation={nav} route={{ params: { sport } }} />);
const savedState = () => (mockStore.get("titan.live.v1:owner-a") as { state: { immersion: string; intent: string; reference: unknown } }).state;

// One strength session the server counted, yesterday: its top set is the reference of today's session.
const squatSession = () => ({
  id: "log-1", sport: "muscu_gym", val: 45, unit: "min", xp: 120, date: new Date(Date.now() - 86400000).toISOString(),
  details: { duration: 45, exercises: [{ name: "Squat", kind: "weighted", setRows: [{ weight: 60, reps: 8, rir: 2 }, { weight: 50, reps: 12, rir: 3 }] }] },
});

async function startStrength(intent: string) {
  show("muscu_gym");
  expect(await screen.findByText("La Forge")).toBeTruthy();
  fireEvent.press(screen.getByText(intent));
  return () => { fireEvent.press(screen.getByTestId("live-start")); return waitFor(() => expect(screen.getByTestId("live-log-set")).toBeTruthy()); };
}
function logSet(exercise: string, load: string, reps: string) {
  fireEvent.changeText(screen.getByTestId("live-exercise"), exercise);
  fireEvent.changeText(screen.getByLabelText("Charge"), load);
  fireEvent.changeText(screen.getByLabelText("Répétitions"), reps);
  fireEvent.press(screen.getByTestId("live-log-set"));
}

// Each test starts without a running session: the store of the phone and the copy kept in memory are both emptied.
beforeEach(async () => { await saveLive("owner-a", null); mockStore.clear(); mockDraft.mockClear(); nav.replace.mockClear(); mockLogs = [squatSession()]; });

test("the phone reads the comparable sessions through the shared core, never from a refused or archived one", () => {
  const now = Date.now();
  const ctx = LivePrepare.context("muscu_gym", [squatSession(), { ...squatSession(), id: "held", status: "pending_review", date: new Date(now - 3600000).toISOString(), details: { duration: 30, exercises: [{ name: "Squat", setRows: [{ weight: 200, reps: 20 }] }] } }], { now });
  expect(ctx.comparable).toBe(1);
  expect(ctx.reference.exercises.squat).toEqual({ name: "Squat", load: 60, reps: 8 });
  expect(LiveVoies.INTENTS.explorer.brings).toHaveLength(3);
});

test("yoga prepares in silence, a strength session with notifications", async () => {
  const yoga = show("yoga");
  expect(await screen.findByText("Le Sanctuaire")).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Silencieux" }).props.accessibilityState.selected).toBe(true);
  // Health data is never asked: no discomfort or pain input before a calm practice.
  expect(screen.queryByText(/gêne|douleur ressentie/i)).toBeNull();
  fireEvent.press(screen.getByTestId("live-start"));
  await waitFor(() => expect(savedState().immersion).toBe("silence"));
  yoga.unmount();
  await act(async () => { await saveLive("owner-a", null); });
  show("muscu_gym");
  expect(await screen.findByText("La Forge")).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Notifications" }).props.accessibilityState.selected).toBe(true);
});

test("the preparation says what each intent changes, and what the session feeds in the world", async () => {
  show("muscu_gym");
  expect(await screen.findByText("La Forge")).toBeTruthy();
  // Atteindre (default): three lines and the plan cut into stages.
  const reach = within(screen.getByTestId("live-preview-atteindre"));
  for (const line of LiveVoies.INTENTS.atteindre.brings) expect(reach.getByText(`• ${line}`)).toBeTruthy();
  expect(reach.getByText(/3 frappes · 6 frappes · 9 frappes · 12 frappes/)).toBeTruthy();
  // Se dépasser: one threshold, and where it comes from.
  fireEvent.press(screen.getByText("Se dépasser"));
  const beyond = within(screen.getByTestId("live-preview-depasser"));
  expect(beyond.getByText(/Un seul seuil aujourd’hui/)).toBeTruthy();
  expect(beyond.getByText(/Ta dernière série la plus haute sur 1 exercice/)).toBeTruthy();
  expect(screen.queryByTestId("live-preview-atteindre")).toBeNull();
  // Explorer: nothing to set, so neither the goal nor the plan is offered.
  expect(screen.getByText("Objectif (facultatif)")).toBeTruthy();
  fireEvent.press(screen.getByText("Explorer"));
  expect(within(screen.getByTestId("live-preview-explorer")).getByText(/Rien à régler : ni objectif, ni plan chiffré/)).toBeTruthy();
  expect(screen.queryByText("Objectif (facultatif)")).toBeNull();
  expect(screen.queryByText(/^Plan : /)).toBeNull();
  // The stake: one line without the camp, the next land once the camp's snapshot has arrived.
  expect(screen.getByText("Ce que cette séance fait avancer")).toBeTruthy();
  expect(within(screen.getByTestId("live-stake")).getByText(/Chaque minute d’effort comptée apporte 1 Acier/)).toBeTruthy();
  expect(await screen.findByText(/Encore 3 séances live pour la prochaine terre de La Forge/)).toBeTruthy();
  expect(screen.getByText("La séance compte pour ton suivi sportif même si tu n’ouvres jamais le Camp de base.")).toBeTruthy();
});

test("Atteindre: the adventure view ticks the stages, and a reached stage is said in words", async () => {
  const start = await startStrength("Atteindre");
  await start();
  for (let i = 0; i < 3; i++) logSet("Squat", "60", "8");
  fireEvent.press(screen.getByText("Vue aventure"));
  const stages = within(screen.getByTestId("live-intent-atteindre"));
  expect(stages.getByText("Tes étapes · 1 sur 4")).toBeTruthy();
  expect(screen.getByLabelText("Étape 1 : 3 frappes, franchie")).toBeTruthy();
  expect(screen.getByLabelText("Étape 2 : 6 frappes, à venir")).toBeTruthy();
  expect(screen.getByText(/Élan du jour : \d+ \/ 90/)).toBeTruthy();
  expect(screen.queryByTestId("live-intent-depasser")).toBeNull();
  expect(screen.queryByTestId("live-intent-explorer")).toBeNull();
});

test("Se dépasser: one threshold from the last comparable set, crossed with reserve, then told in the report", async () => {
  const start = await startStrength("Se dépasser");
  await start();
  expect(savedState().reference).toEqual({ exercises: { squat: { name: "Squat", load: 60, reps: 8 } }, basis: expect.any(String) });
  fireEvent.press(screen.getByText("Vue aventure"));
  expect(within(screen.getByTestId("live-intent-depasser")).getByText("Un seul seuil")).toBeTruthy();
  expect(screen.queryByTestId("live-intent-atteindre")).toBeNull();
  fireEvent.press(screen.getByText("Vue sportive"));
  logSet("Squat", "60", "9");
  fireEvent.press(screen.getByText("Vue aventure"));
  const block = within(screen.getByTestId("live-intent-depasser"));
  expect(block.getByText("Seuil franchi")).toBeTruthy();
  expect(block.getByText(/Seuil franchi sur Squat, avec de la réserve/)).toBeTruthy();
  fireEvent.press(screen.getByTestId("live-finish"));
  await waitFor(() => expect(screen.getByTestId("live-keep")).toBeTruthy());
  expect(screen.getByText("Le récit de ta séance")).toBeTruthy();
  const story = within(screen.getByTestId("live-recap"));
  expect(story.getByText(/Seuil franchi sur Squat, avec de la réserve : un progrès mesuré/)).toBeTruthy();
  expect(story.getAllByText(/./).length).toBeGreaterThanOrEqual(2);
  expect(screen.getByTestId("live-figures")).toBeTruthy();
});

test("Explorer: no figure in the adventure view, discoveries instead, and a report told without numbers", async () => {
  const start = await startStrength("Explorer");
  await start();
  expect(savedState().reference).toBeNull();
  logSet("Fentes bulgares", "20", "10");
  expect(screen.queryByTestId("live-intent-explorer")).toBeNull();
  fireEvent.press(screen.getByText("Vue aventure"));
  expect(screen.queryByText(/Élan du jour/)).toBeNull();
  expect(screen.queryByText(/frappe/)).toBeNull();
  expect(screen.getByText("Le sentier avance avec ta pratique.")).toBeTruthy();
  expect(screen.getByTestId("live-expedition").props.accessibilityLabel).toBe("La Forge : le sentier avance avec ta pratique");
  const book = within(screen.getByTestId("live-intent-explorer"));
  expect(book.getByText("Carnet de découvertes")).toBeTruthy();
  expect(book.getByText("• Un mouvement nouveau dans ton répertoire")).toBeTruthy();
  fireEvent.press(screen.getByText("Vue sportive"));
  expect(screen.getByTestId("live-exercise").props.value).toBe("Fentes bulgares");
  fireEvent.press(screen.getByText("Vue aventure"));
  for (const t of within(screen.getByTestId("live-intent-explorer")).getAllByText(/./)) expect(String(t.props.children)).not.toMatch(/\d/);
  fireEvent.press(screen.getByTestId("live-finish"));
  await waitFor(() => expect(screen.getByTestId("live-keep")).toBeTruthy());
  expect(within(screen.getByTestId("live-recap")).getByText(/Sur ton chemin : un mouvement nouveau dans ton répertoire\./)).toBeTruthy();
  expect(screen.queryByTestId("live-figures")).toBeNull();
});

test("the reference line follows the exercise as it is typed; the step above it only exists when surpassing", async () => {
  const start = await startStrength("Se dépasser");
  await start();
  // The latest exercise is offered first, with what was done last time.
  expect(screen.getByTestId("live-exercise").props.value).toBe("Squat");
  expect(screen.getByText("La dernière fois : 60 kg × 8.")).toBeTruthy();
  expect(screen.getByText("Seuil du jour : 60 kg × 9, ou 62,5 kg, en gardant au moins une répétition en réserve.")).toBeTruthy();
  expect(screen.getByTestId("live-exercise").props.accessibilityHint).toMatch(/^La dernière fois : 60 kg × 8\. Seuil du jour : /);
  fireEvent.changeText(screen.getByTestId("live-exercise"), "Fentes");
  expect(screen.queryByTestId("live-ref")).toBeNull();
  expect(screen.queryByTestId("live-ref-suggest")).toBeNull();
  fireEvent.changeText(screen.getByTestId("live-exercise"), "  squat");
  expect(screen.getByText("La dernière fois : 60 kg × 8.")).toBeTruthy();
  // Once the threshold is crossed, nothing more is suggested: one attempt was enough.
  logSet("Squat", "60", "9");
  expect(screen.getByText("La dernière fois : 60 kg × 8.")).toBeTruthy();
  expect(screen.queryByTestId("live-ref-suggest")).toBeNull();
});

test("the last comparable set is a sport fact shown for Atteindre too, without any threshold", async () => {
  const start = await startStrength("Atteindre");
  await start();
  expect(screen.getByText("La dernière fois : 60 kg × 8.")).toBeTruthy();
  expect(screen.queryByTestId("live-ref-suggest")).toBeNull();
});

test("a pause shows one calm line on screen, and silence shows none", async () => {
  const start = await startStrength("Atteindre");
  await start();
  expect(screen.queryByTestId("live-interlude")).toBeNull();
  await act(async () => { fireEvent.press(screen.getByTestId("live-pause")); });
  expect(screen.queryByTestId("live-interlude")).toBeNull();
  fireEvent.press(screen.getByText("Vue aventure"));
  const line = screen.getByTestId("live-interlude");
  expect(LiveVoies.resolve("muscu_gym").calm).toContain(line.props.children);
  // Never announced: the calm line is not a live region.
  expect(line.props.accessibilityLiveRegion).toBeUndefined();
  let s = LiveEngine.create({ sportId: "muscu_gym", seed: "quiet", immersion: "silence" });
  s = LiveEngine.step(s, { type: "start" }, 1000).state;
  s = LiveEngine.step(s, { type: "pause" }, 60000).state;
  expect(LiveEngine.view(s, 61000).interlude).toBeNull();
});

test("the camp opens on what comes next, nearest first, and nothing expires", async () => {
  wrap(<CampScreen />);
  expect(await screen.findByText("Ce qui vient")).toBeTruthy();
  const next = within(screen.getByTestId("camp-horizon"));
  expect(next.getByText("L’Observatoire des souffles")).toBeTruthy();
  expect(next.getByText("Encore 3 séances live pour révéler la terre 2 sur 5.")).toBeTruthy();
  expect(next.getByText("La Cordée · chapitre 2")).toBeTruthy();
  expect(screen.getByText("Rien n’expire : ces repères avancent quand tu reviens, à ton rythme.")).toBeTruthy();
});
