/* V1.5.4 — Quêtes entre les mondes on Android: same server contract and view model as the website. The map of a world opens the
   notebook in one tap; each clue shows its origin, state and destination; the four routes (two per chain) start, link (one
   wrong mark corrected), choose and resolve. App closed and reopened (a new query cache), a second device choosing another
   manner, an account without a clue, a server without V1.5.4, offline. The fake server below follows the SQL rules (clues
   read from the arc facts, one row per chain, stable link, definitive manner, next encounter after one active day). */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
/* eslint-disable @typescript-eslint/no-require-imports */
const Q = require("../src/core/web/adventure-quests.js");
type Row = { clue: string; attempts: number; lastAnswer: string[] | null; linked: boolean; manner: string | null; outcome: string | null };
const mockServer = { owner: "owner-a", facts: [] as string[], missing: false, days: 0, rows: {} as Record<string, Row>, calls: [] as [string, Record<string, unknown>][] };
let mockOnline = true;
let mockReconnect: (() => void) | null = null;
function mockState(id: string) {
  const s = mockServer, cfg = Q.current(id), q = s.rows[id];
  const held = (o: Record<string, string>) => s.facts.includes(`${o.world}:${o.route}:${o.outcome}${o.fact === "consequence" ? ":access" : ""}`);
  const clues = cfg.clues.map((c: { id: string; origin: Record<string, string> }) => ({ id: c.id, origin: c.origin, foundAt: held(c.origin) ? "2026-11-18T10:00:00Z" : null }));
  if (!q) { const e = clues.find((c: { foundAt: string | null }) => c.foundAt); return { id, version: 1, from: cfg.from, to: cfg.to, state: e ? "available" : "locked", clue: e?.id ?? null, clues, attempts: 0, daysTarget: 1 }; }
  const answer = cfg.clues.find((c: { id: string }) => c.id === q.clue).answer;
  const state = !q.linked ? "link" : !q.manner ? "choose" : q.outcome ? "resolved" : s.days >= 1 ? "ready" : "waiting";
  return { id, version: 1, from: cfg.from, to: cfg.to, state, clue: q.clue, clues, attempts: q.attempts, lastAnswer: q.lastAnswer,
    lastCorrect: q.lastAnswer ? q.lastAnswer[0] === answer : null, manner: q.manner, days: q.manner ? Math.min(s.days, 1) : 0, daysTarget: 1, outcome: q.outcome };
}
function mockNotebook() {
  const chains = Q.CATALOG.map(mockState);
  const clues = chains.flatMap((ch: ReturnType<typeof mockState>) => ch.clues.filter((c: { foundAt: string | null }) => c.foundAt).map((c: { id: string; origin: Record<string, string>; foundAt: string }) => ({
    id: c.id, chain: ch.id, version: 1, origin: c.origin, foundAt: c.foundAt, destination: ch.to,
    state: ch.clue !== c.id || ["locked", "available"].includes(ch.state) ? "found" : ch.state === "resolved" ? "used" : ch.state === "link" ? "followed" : "linked" })));
  return { contract: 1, owner: mockServer.owner, chains, clues };
}
function mockServe(name: string, args: Record<string, unknown>) {
  const s = mockServer; s.calls.push([name, args]);
  const fail = (message: string, code?: string) => ({ data: null, error: { message, code } });
  if (s.missing) return fail(`Could not find the function public.${name}`, "PGRST202");
  if (name === "titan_adventure_quest_action_v1") {
    const id = args.p_chain as string, cfg = Q.current(id), st = mockState(id);
    if (st.state === "locked") return fail("QUEST_LOCKED");
    if (args.p_action === "start") { if (st.state === "available") s.rows[id] = { clue: st.clue as string, attempts: 0, lastAnswer: null, linked: false, manner: null, outcome: null }; }
    else if (args.p_action === "link" && st.state === "link") {
      const a = args.p_answer as string[]; if (a?.length !== 1 || !cfg.link.pool.includes(a[0])) return fail("INVALID_ANSWER");
      const q = s.rows[id]; q.attempts++; q.lastAnswer = a; q.linked = a[0] === cfg.clues.find((c: { id: string }) => c.id === q.clue).answer;
    } else if (args.p_action === "choose" && st.state === "choose") s.rows[id].manner = args.p_manner as string;
    else if (args.p_action === "resolve") {
      if (st.state === "waiting") return fail("ENCOUNTER_INCOMPLETE");
      if (st.state === "ready") { const q = s.rows[id]; q.outcome = cfg.manners.find((m: { id: string }) => m.id === q.manner).outcome; }
    }
  } else if (name !== "titan_adventure_quests_v1") return fail("UNEXPECTED_RPC");
  return { data: mockNotebook(), error: null };
}
jest.mock("../src/lib/supabase", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "t" } } }) },
  rpc: (name: string, args: Record<string, unknown>) => ({ setHeader: () => Promise.resolve(mockServe(name, args ?? {})) }),
} }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a", useAuth: () => ({ status: "signedIn", owner: "owner-a" }) }));
jest.mock("../src/lib/network", () => ({ useOnline: () => mockOnline, onReconnect: (cb: () => void) => { mockReconnect = cb; return () => { mockReconnect = null; }; } }));
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
const { AdventureQuests, QuestMapButton } = require("../src/components/AdventureQuests");
const { resetQuestContract } = require("../src/data/adventureQuests");
/* eslint-enable @typescript-eslint/no-require-imports */
const metrics = { frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
// One device = one query cache: a new cache is the app closed and reopened (nothing kept in memory).
const device = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
const wrap = (client: QueryClient, node: React.ReactNode) => render(
  <QueryClientProvider client={client}><SafeAreaProvider initialMetrics={metrics}><ToastProvider>{node}</ToastProvider></SafeAreaProvider></QueryClientProvider>);
const writes = () => mockServer.calls.filter(([n]) => n === "titan_adventure_quest_action_v1").map(([, a]) => [a.p_chain, a.p_action, ...((a.p_answer as string[]) ?? []), ...(a.p_manner ? [a.p_manner] : [])]);
const press = async (id: string) => { await act(async () => { fireEvent.press(screen.getByTestId(id)); }); };
const flat = (c: unknown): string => typeof c === "string" || typeof c === "number" ? String(c) : Array.isArray(c) ? c.map(flat).join("") : "";
const text = (id: string) => screen.getByTestId(id).findAll((n) => (n.type as unknown) === "Text").map((n) => flat(n.props.children)).join(" ");
/** From the map of a world: one tap opens the notebook (the World screen pushed on its notebook). */
async function fromMap(client: QueryClient, world: string) {
  const onOpen = jest.fn();
  const map = wrap(client, <QuestMapButton owner="owner-a" world={world} onOpen={onOpen} />);
  const button = await screen.findByTestId("quest-map");
  const hint = button.props.accessibilityHint as string;
  fireEvent.press(button);
  expect(onOpen).toHaveBeenCalledTimes(1);
  map.unmount();
  wrap(client, <AdventureQuests owner="owner-a" onGo={jest.fn()} />);
  await screen.findByTestId("quests");
  return hint;
}
beforeEach(() => { Object.assign(mockServer, { owner: "owner-a", facts: [], missing: false, days: 0, rows: {}, calls: [] }); mockOnline = true; resetQuestContract(); });

test("l’atelier oublié, both routes of the Vallée: from the map, a wrong mark corrected, a manner, the next encounter", async () => {
  for (const [route, outcome, clue, wrong, mark, manner, scene] of [
    ["ruines", "serment_restitue", "symbole-cerf", "roue", "cerf", "cle", /La porte s’ouvre/],
    ["corniche", "passage_rouvert", "cairn-fendu", "cerf", "cairn", "motifs", /La Forge lit désormais la langue des passeurs/]] as const) {
    Object.assign(mockServer, { facts: [`aube:${route}:${outcome}`, `aube:${route}:${outcome}:access`], rows: {}, calls: [], days: 0 });
    const phone = device();
    expect(await fromMap(phone, "aube")).toMatch(/Carnet d’indices\. 1 indice\(s\) · 1 piste\(s\)\. Piste vers la Forge des Titans : L’atelier oublié \(indice trouvé\)/);
    expect(screen.getByTestId(`quest-clue-${clue}-state`).props.children).toBe("trouvé");
    expect(text(`quest-clue-${clue}`)).toMatch(new RegExp(`Origine : la Vallée de l’Aube · voie ${route === "ruines" ? "des ruines" : "de la corniche"}`));
    expect(text(`quest-clue-${clue}`)).toMatch(/Destination : la Forge des Titans · L’atelier oublié/);
    expect(screen.getByTestId("quest-feux-cote-opens")).toBeTruthy();
    await press("quest-atelier-oublie-start");
    await press(`quest-atelier-oublie-mark-${wrong}`);
    expect(await screen.findByTestId("quest-atelier-oublie-feedback-wrong")).toBeTruthy();
    await press(`quest-atelier-oublie-mark-${mark}`);
    expect(await screen.findByTestId("quest-atelier-oublie-feedback-right")).toBeTruthy();
    expect(screen.getByTestId("quest-atelier-oublie-scene")).toBeTruthy();
    // The manner stays on the phone until the confirmation.
    fireEvent.press(screen.getByTestId(`quest-atelier-oublie-select-${manner}`));
    expect(writes().filter((w) => w[1] === "choose")).toEqual([]);
    expect(text("quest-atelier-oublie-confirm")).toMatch(/définitif/);
    await press("quest-atelier-oublie-choose");
    expect(text("quest-atelier-oublie-progress")).toMatch(/0\/1 jour actif confirmé depuis ton choix/);
    expect(screen.getByTestId("quest-atelier-oublie-resolve").props.accessibilityState?.disabled).toBe(true);
    // A session is confirmed later; the app is reopened (new cache): the scene is ready.
    mockServer.days = 1;
    const reopened = device();
    await fromMap(reopened, "forge");
    await press("quest-atelier-oublie-resolve");
    expect(text(`quest-atelier-oublie-outcome-${manner === "cle" ? "cle_forgee" : "motifs_transmis"}`)).toMatch(scene);
    expect(screen.getByTestId(`quest-clue-${clue}-state`).props.children).toBe("utilisé");
    expect(writes()).toEqual([["atelier-oublie", "start"], ["atelier-oublie", "link", wrong], ["atelier-oublie", "link", mark], ["atelier-oublie", "choose", manner], ["atelier-oublie", "resolve"]]);
  }
});

test("les feux de la côte, both routes of the Marées; a second device choosing later keeps the first manner", async () => {
  for (const [route, outcome, mark, manner, other] of [["carte", "chenal_ouvert", "phare", "lanterne", "livre"], ["gardienne", "large_franchi", "etoile", "livre", "lanterne"]] as const) {
    Object.assign(mockServer, { facts: [`marees:${route}:${outcome}`], rows: {}, calls: [], days: 0 });
    expect(await fromMap(device(), "aurores")).toMatch(/Piste depuis les Îles des Marées : Les feux de la côte/);
    await press("quest-feux-cote-start");
    await press(`quest-feux-cote-mark-${mark}`);
    fireEvent.press(screen.getByTestId(`quest-feux-cote-select-${other}`));
    // The other device confirms first.
    mockServer.rows["feux-cote"].manner = manner;
    await press("quest-feux-cote-choose");
    expect((await screen.findByTestId("quest-feux-cote-notice")).props.children).toMatch(/déjà choisie depuis un autre appareil/);
    expect(text("quest-feux-cote-chosen")).toMatch(Q.t(`feux-cote.manner.${manner}.label`));
    expect(mockServer.rows["feux-cote"].manner).toBe(manner);
    mockServer.days = 1;
    await act(async () => { mockReconnect?.(); });
    await waitFor(() => expect(screen.getByTestId("quest-feux-cote-resolve").props.accessibilityState?.disabled).toBe(false));
    await press("quest-feux-cote-resolve");
    expect(screen.getByTestId(`quest-feux-cote-outcome-${manner === "lanterne" ? "feu_rallume" : "route_consignee"}`)).toBeTruthy();
  }
});

test("no clue, offline, a server without V1.5.4: locked chains explain their clues, nothing is sent, nothing breaks", async () => {
  mockServer.facts = ["aube:ruines:serment_restitue"];
  expect(await fromMap(device(), "aube")).toMatch(/0 indice\(s\) · 0 piste\(s\)/);
  expect(screen.getByTestId("quests-empty")).toBeTruthy();
  expect(text("quest-atelier-oublie-opens")).toMatch(/Le symbole du cerf[\s\S]*Le cairn fendu/);
  expect(screen.queryByTestId("quest-atelier-oublie-start")).toBeNull();
  mockServer.facts.push("aube:ruines:serment_restitue:access");
  mockOnline = false;
  const c = device();
  wrap(c, <AdventureQuests owner="owner-a" />);
  await press((await screen.findByTestId("quest-atelier-oublie-start")).props.testID);
  expect((await screen.findByTestId("quest-atelier-oublie-notice")).props.children).toMatch(/Hors ligne/);
  expect(writes()).toEqual([]);
  mockOnline = true;
  mockServer.missing = true; resetQuestContract();
  const old = device();
  const view = wrap(old, <><QuestMapButton owner="owner-a" world="aube" onOpen={jest.fn()} /><AdventureQuests owner="owner-a" /></>);
  await waitFor(() => expect(mockServer.calls.some(([n]) => n === "titan_adventure_quests_v1")).toBe(true));
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  expect(screen.queryByTestId("quest-map")).toBeNull();
  expect(screen.queryByTestId("quests")).toBeNull();
  view.unmount();
});
