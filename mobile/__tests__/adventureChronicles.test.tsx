/* V1.5.5 — Chroniques et aventures rejouables on Android: same server contract and view model as the website. Run 1 is a REAL
   server answer (test-fixtures/adventure-chronicles.json, written by sql/tests/300_adventure_chronicles.sql); the fake server
   below follows the SQL replay rules (one active run per arc, a route definitive for the run, steps counted from the run's
   choice, the mechanic, one outcome). The map opens the chronicle; a new run on the other route is played to its end; the app
   reinstalled (a new query cache) reads the two distinct stories; two devices start at once; an old campaign, an abandoned
   run; offline; a server without V1.5.5. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
/* eslint-disable @typescript-eslint/no-require-imports */
const FX = require("../test-fixtures/adventure-chronicles.json");
const G = require("../src/core/web/adventure-guardian.js").contract("veilleur", 1);
const RULES = require("../src/core/web/adventure-chronicles.js").rules(1);
type Run = { run: number; startedAt: string; route: string | null; chosenAt?: string; base?: { effort: number; days: number }; attempts: number;
  lastAnswer: string[] | null; sceneAt?: string; clueAt?: string; observedAt?: string; preparedAt?: string; outcome?: string; resolvedAt?: string; abandonedAt?: string };
const mockServer = { owner: "owner-a", arc: null as Record<string, unknown> | null, runs: [] as Run[], effort: 0, days: 0, missing: false, reads: [] as number[],
  calls: [] as [string, Record<string, unknown>][] };
let mockOnline = true;
let mockReconnect: (() => void) | null = null;
const NOW = () => new Date().toISOString();
const mockActive = () => mockServer.runs.find((r) => !r.resolvedAt && !r.abandonedAt) ?? null;
function mockRun(r: Run) {
  const s = mockServer, open = r.route && !r.resolvedAt && !r.abandonedAt;
  const since = open ? { effort: s.effort - r.base!.effort, days: s.days - r.base!.days } : { effort: 0, days: 0 };
  const at: Record<string, string | undefined> = { scene: r.sceneAt, clue: r.clueAt, observe: r.observedAt, prepare: r.preparedAt, resolve: r.resolvedAt };
  const steps = RULES.steps.map((x: { kind: string; effortTargets?: number; daysTarget?: number }) => ({ kind: x.kind, at: at[x.kind] ?? null,
    effortTarget: x.effortTargets ? x.effortTargets * 15 : null, daysTarget: x.daysTarget ?? null,
    ready: !x.effortTargets || (since.effort >= x.effortTargets * 15 && since.days >= (x.daysTarget as number)) }));
  const cur = steps.find((x: { at: string | null }) => !x.at);
  const state = r.abandonedAt ? "abandoned" : r.resolvedAt ? "resolved" : !r.route ? "choose" : cur.kind;
  const sign = G.routes.find((x: { route: string }) => x.route === r.route)?.sign;
  return { run: r.run, kind: "replay", arc: "aube-arc1", version: 1, rules: 1, state, ready: ["scene", "clue", "observe", "prepare", "resolve"].includes(state) ? cur.ready : null,
    startedAt: r.startedAt, route: r.route, chosenAt: r.chosenAt ?? null, clue: r.route === "corniche" ? "prise" : r.route ? "serment" : null,
    effortSince: since.effort, daysSince: since.days, steps,
    mechanic: r.route ? { primitive: "pick", slots: [{ id: "signe", pool: G.signs }], attempts: r.attempts, lastAnswer: r.lastAnswer,
      lastCorrect: r.lastAnswer ? r.lastAnswer[0] === sign : null, firstWrong: r.lastAnswer && r.lastAnswer[0] !== sign ? 1 : null, solved: !!r.preparedAt } : null,
    outcome: r.outcome ?? null, resolvedAt: r.resolvedAt ?? null, abandonedAt: r.abandonedAt ?? null };
}
function mockPayload() {
  const s = mockServer, arc = s.arc as { runs: Record<string, unknown>[]; completed: boolean }, o = arc.runs[0] as { route: string; outcome: string | null; milestones: { ordinal: number }[] };
  const runs = [o, ...s.runs.map(mockRun)], a = mockActive();
  const has = (route: string, k: string) => (o.route === route && (k === "outcome" ? !!o.outcome : o.milestones.some((m) => m.ordinal === (k === "scene" ? 3 : 4))))
    || runs.slice(1).some((r) => { const x = r as ReturnType<typeof mockRun>; return x.route === route && (k === "outcome" ? !!x.outcome : !!x.steps.find((y: { kind: string; at: string | null }) => y.kind === k)?.at); });
  return { contract: 1, owner: s.owner, rules: 1, arcs: [{ ...arc, activeRun: a?.run ?? null, runCount: runs.length, replayable: arc.completed && !a, runs,
    discovered: ["corniche", "ruines"].map((route) => ({ route, scene: has(route, "scene"), clue: has(route, "clue"), outcome: has(route, "outcome") })) }] };
}
function mockServe(name: string, args: Record<string, unknown>) {
  const s = mockServer; s.calls.push([name, args]);
  const fail = (message: string, code?: string) => ({ data: null, error: { message, code } });
  const ok = () => ({ data: mockPayload(), error: null });
  if (s.missing) return fail(`Could not find the function public.${name}`, "PGRST202");
  if (name === "titan_adventure_chronicles_v1") return ok();
  if (name !== "titan_adventure_chronicle_action_v1") return fail("UNEXPECTED_RPC");
  const action = args.p_action as string, r = mockActive();
  if (action === "sync") return ok();
  if (action === "read") { s.reads.push(args.p_run as number); return ok(); }
  if (action === "start") { if (!r) s.runs.push({ run: s.runs.length + 2, startedAt: NOW(), route: null, attempts: 0, lastAnswer: null }); return ok(); }
  if (!r) return fail("REPLAY_NOT_STARTED");
  const v = mockRun(r);
  if (action === "abandon") { r.abandonedAt = NOW(); return ok(); }
  if (action === "choose") { if (!r.route) { r.route = args.p_route as string; r.chosenAt = NOW(); r.base = { effort: s.effort, days: s.days }; } return ok(); }
  if (action === "advance") {
    const key = ({ scene: "sceneAt", clue: "clueAt", observe: "observedAt" } as Record<string, "sceneAt" | "clueAt" | "observedAt">)[args.p_step as string];
    if (r[key]) return ok(); if (v.state !== args.p_step) return fail("REPLAY_STEP_ORDER"); if (!v.ready) return fail("ENCOUNTER_INCOMPLETE");
    r[key] = NOW(); return ok();
  }
  if (action === "solve") {
    if (r.preparedAt) return ok();
    const ans = args.p_answer as string[]; if (ans?.length !== 1 || !G.signs.includes(ans[0])) return fail("INVALID_ANSWER");
    r.attempts++; r.lastAnswer = ans; if (ans[0] === G.routes.find((x: { route: string }) => x.route === r.route).sign) r.preparedAt = NOW(); return ok();
  }
  if (action === "resolve") {
    if (v.state !== "resolve") return fail("GUARDIAN_NOT_PREPARED"); if (!v.ready) return fail("ENCOUNTER_INCOMPLETE");
    r.outcome = G.routes.find((x: { route: string }) => x.route === r.route).outcome; r.resolvedAt = NOW(); return ok();
  }
  return fail("INVALID_ACTION");
}
jest.mock("../src/lib/supabase", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "t" } } }) },
  rpc: (name: string, args: Record<string, unknown>) => ({ setHeader: () => Promise.resolve(mockServe(name, args ?? {})) }),
} }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a", useAuth: () => ({ status: "signedIn", owner: "owner-a" }) }));
jest.mock("../src/lib/network", () => ({ useOnline: () => mockOnline, onReconnect: (cb: () => void) => { mockReconnect = cb; return () => { mockReconnect = null; }; } }));
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
const { AdventureChronicles, ChronicleMapButton } = require("../src/components/AdventureChronicles");
const { resetChronicleContract } = require("../src/data/adventureChronicles");
/* eslint-enable @typescript-eslint/no-require-imports */
const metrics = { frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
// One device = one query cache: a new cache is the app closed and reopened, or reinstalled (nothing kept on the phone).
const device = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
const wrap = (client: QueryClient, node: React.ReactNode) => render(
  <QueryClientProvider client={client}><SafeAreaProvider initialMetrics={metrics}><ToastProvider>{node}</ToastProvider></SafeAreaProvider></QueryClientProvider>);
const writes = () => mockServer.calls.filter(([n, a]) => n === "titan_adventure_chronicle_action_v1" && a.p_action !== "read").map(([, a]) => [a.p_action, ...[a.p_run, a.p_route, a.p_step].filter((x) => x != null), ...((a.p_answer as string[]) ?? [])]);
const press = async (id: string) => { await act(async () => { fireEvent.press(screen.getByTestId(id)); }); };
const flat = (c: unknown): string => typeof c === "string" || typeof c === "number" ? String(c) : Array.isArray(c) ? c.map(flat).join("") : "";
const text = (id: string) => screen.getByTestId(id).findAll((n) => (n.type as unknown) === "Text").map((n) => flat(n.props.children)).join(" ");
const titles = (run: number) => screen.queryAllByTestId(new RegExp(`^chronicle-run-${run}-entry-`)).map((e) => e.findAll((n) => (n.type as unknown) === "Text").map((n) => flat(n.props.children))[1]);
function reset(kind: "original" | "legacy") {
  Object.assign(mockServer, { arc: JSON.parse(JSON.stringify(FX[kind].arcs[0])), runs: [], effort: 0, days: 0, missing: false, reads: [], calls: [] });
  mockOnline = true; resetChronicleContract();
}

test("the scenario: from the map, the chronicle of the ruins; a new run on the corniche to its end; reinstalled, two distinct stories", async () => {
  reset("original");
  const client = device(), onOpen = jest.fn();
  const map = wrap(client, <ChronicleMapButton owner="owner-a" world="aube" onOpen={onOpen} />);
  fireEvent.press(await screen.findByTestId("chronicle-map"));
  expect(onOpen).toHaveBeenCalledTimes(1);
  map.unmount();
  wrap(client, <AdventureChronicles owner="owner-a" world="aube" />);
  await screen.findByTestId("chronicles");
  // Why the ruins, the clue used, the passage unlocked: run 1, read from the server facts.
  expect(titles(1)).toEqual(expect.arrayContaining(["Décision : les ruines", "Le fragment du serment", "Issue : le serment restitué", "Accès découvert : L’archive des passeurs"]));
  expect(text("chronicle-active")).toMatch(/le serment restitué \(partie 1\)/);
  await press("chronicle-start");
  expect(text("chronicle-choose")).toMatch(/jamais parcourue[\s\S]*Ouvrir la corniche[\s\S]*déjà parcourue/);
  const n = mockServer.calls.length;
  fireEvent.press(screen.getByTestId("chronicle-select-corniche"));
  expect(mockServer.calls.length).toBe(n);
  expect(text("chronicle-confirm")).toMatch(/définitif pour cette partie/);
  await press("chronicle-choose-confirm");
  expect(screen.getByTestId("chronicle-advance-scene").props.accessibilityState?.disabled).toBe(true);
  expect(text("chronicle-progress")).toMatch(/0\/15 points · 0\/1 jours actifs depuis ton choix/);
  mockServer.effort = 80; mockServer.days = 4;
  await press("chronicle-sync");
  for (const step of ["scene", "clue", "observe"]) await press(`chronicle-advance-${step}`);
  fireEvent.press(screen.getByTestId("chronicle-token-0-gravure"));
  await press("chronicle-solve");
  expect(text("chronicle-feedback-wrong")).toMatch(/case 1/);
  fireEvent.press(screen.getByTestId("chronicle-token-0-fissure"));
  await press("chronicle-solve");
  await press("chronicle-resolve");
  const second = ["Nouvelle partie", "Décision : la corniche", "La corniche effondrée", "La prise dans la roche", "Observation : Le Veilleur de pierre", "La mécanique résolue", "Issue : le passage rouvert"];
  expect(titles(2)).toEqual(second);
  expect(text("chronicle-active")).toMatch(/le serment restitué \(partie 1\)/);
  expect(text("chronicle-discovered-corniche")).toMatch(/la scène, l’indice, l’issue/);
  expect(writes()).toEqual([["start"], ["choose", "corniche"], ["sync"], ["advance", "scene"], ["advance", "clue"], ["advance", "observe"], ["solve", "gravure"], ["solve", "fissure"], ["resolve"]]);
  // Reopening run 1 is measured once.
  await press("chronicle-run-1-toggle"); await press("chronicle-run-1-toggle"); await press("chronicle-run-1-toggle");
  expect(mockServer.reads).toEqual([1]);
  // Reinstalled: a new cache reads the same two stories from the server.
  screen.unmount();
  wrap(device(), <AdventureChronicles owner="owner-a" world="aube" />);
  await screen.findByTestId("chronicles");
  await press("chronicle-run-1-toggle");
  expect(titles(1)).toContain("Issue : le serment restitué");
  expect(titles(2)).toEqual(second);
});

test("an old campaign; two devices start at once and choose two routes; abandon, then a new run", async () => {
  reset("legacy");
  // Phone B was opened on the chronicle before anything started and stays on that screen (its cache is not refreshed).
  const stale = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
  let r = wrap(stale, <AdventureChronicles owner="owner-a" world="aube" />);
  await screen.findByTestId("chronicles");
  r.unmount();
  // Phone A: the old campaign as it was played, then "Rejouer".
  r = wrap(device(), <AdventureChronicles owner="owner-a" world="aube" />);
  await screen.findByTestId("chronicles");
  expect(titles(1).slice(0, 3)).toEqual(["Départ", "La clairière des lucioles", "Choix : Écouter le passeur"]);
  expect(text("chronicle-active")).toMatch(/garde ses acquis tels quels/);
  await press("chronicle-start");
  fireEvent.press(screen.getByTestId("chronicle-select-ruines"));
  r.unmount();
  // Phone B taps "Rejouer" on its old screen: the server keeps one run and B reads it back.
  r = wrap(stale, <AdventureChronicles owner="owner-a" world="aube" />);
  await screen.findByTestId("chronicles");
  expect(screen.queryByTestId("chronicle-run-2")).toBeNull();
  await press("chronicle-start");
  expect(mockServer.runs.length).toBe(1);
  expect(screen.getByTestId("chronicle-choose")).toBeTruthy();
  fireEvent.press(screen.getByTestId("chronicle-select-corniche"));
  r.unmount();
  // A confirms the ruins first; B, still on its confirmation, confirms the corniche: the run keeps the ruins.
  r = wrap(device(), <AdventureChronicles owner="owner-a" world="aube" />);
  await screen.findByTestId("chronicles");
  fireEvent.press(screen.getByTestId("chronicle-select-ruines"));
  await press("chronicle-choose-confirm");
  r.unmount();
  r = wrap(stale, <AdventureChronicles owner="owner-a" world="aube" />);
  await screen.findByTestId("chronicles");
  fireEvent.press(screen.getByTestId("chronicle-select-corniche"));
  await press("chronicle-choose-confirm");
  expect(text("chronicle-notice")).toMatch(/Cette partie suivait déjà les ruines, choisie depuis un autre appareil/);
  expect(mockServer.runs[0].route).toBe("ruines");
  // Abandon in two steps: the run stays readable, a new one can start.
  await press("chronicle-ask-abandon");
  expect(text("chronicle-abandon-confirm")).toMatch(/Abandonner la partie 2 \?[\s\S]*reste lisible/);
  await press("chronicle-abandon");
  expect(titles(2)).toContain("Partie abandonnée");
  await press("chronicle-start");
  expect(screen.getByTestId("chronicle-run-3")).toBeTruthy();
  expect(writes()).toEqual([["start"], ["start"], ["choose", "ruines"], ["choose", "corniche"], ["abandon", 2], ["start"]]);
});

test("offline nothing is sent, back online the server is read again; without the V1.5.5 server nothing is shown", async () => {
  reset("original");
  wrap(device(), <AdventureChronicles owner="owner-a" world="aube" />);
  await screen.findByTestId("chronicles");
  mockOnline = false;
  screen.rerender(<QueryClientProvider client={device()}><SafeAreaProvider initialMetrics={metrics}><ToastProvider><AdventureChronicles owner="owner-a" world="aube" /></ToastProvider></SafeAreaProvider></QueryClientProvider>);
  await screen.findByTestId("chronicles");
  await press("chronicle-start");
  expect(writes()).toEqual([]);
  expect(text("chronicle-notice")).toMatch(/Hors ligne/);
  mockOnline = true;
  mockServe("titan_adventure_chronicle_action_v1", { p_world: "aube", p_action: "start" }); // another device
  await act(async () => { mockReconnect?.(); });
  await waitFor(() => expect(screen.queryByTestId("chronicle-notice")).toBeNull());
  await waitFor(() => expect(screen.getByTestId("chronicle-run-2")).toBeTruthy());
  screen.unmount();
  reset("original"); mockServer.missing = true;
  wrap(device(), <><ChronicleMapButton owner="owner-a" world="aube" onOpen={jest.fn()} /><AdventureChronicles owner="owner-a" world="aube" /></>);
  await waitFor(() => expect(mockServer.calls.length).toBeGreaterThan(0));
  expect(screen.queryByTestId("chronicles")).toBeNull();
  expect(screen.queryByTestId("chronicle-map")).toBeNull();
});
