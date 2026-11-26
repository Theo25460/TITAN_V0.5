/* V1.5.2 — Camp et conséquences on Android: same server contract and view model as the website. From the Camp de base (the
   return point) one tap opens the World screen on the access, the interaction is the next tap. La corniche: two landmarks
   align a shortcut (wrong answer then correction); les ruines: one engraving opens the annex room. App closed and reopened
   (a new query cache), a second device answering late, an account without the pilot arc, a server without V1.5.2, offline.
   The fake server below follows the SQL rules (one discovery, stable afterwards, visits counted); the real data layer runs. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
type Server = { owner: string; outcome: string | null; missing: boolean; c: { attempts: number; lastAnswer: string[]; discoveredAt: string | null; visits: number } | null; calls: [string, Record<string, unknown>][] };
const mockServer: Server = { owner: "owner-a", outcome: "passage_rouvert", missing: false, c: null, calls: [] };
let mockOnline = true;
let mockReconnect: (() => void) | null = null;
const OUT: Record<string, { route: string; kind: string; marks: string[]; answer: string[] }> = {
  passage_rouvert: { route: "corniche", kind: "shortcut", marks: ["cairn", "pin", "tour", "cascade"], answer: ["cairn", "pin"] },
  serment_restitue: { route: "ruines", kind: "annex", marks: ["cerf", "soleil", "spirale", "vague"], answer: ["cerf"] },
};
function mockItems() {
  const s = mockServer; if (!s.outcome) return [];
  const o = OUT[s.outcome], c = s.c;
  return [{ state: c?.discoveredAt ? "open" : "discover", world: "aube", id: "veilleur-retour", version: 1, returnPoint: "camp", outcome: s.outcome, route: o.route, kind: o.kind,
    resolvedAt: "2026-11-18T09:00:00Z", attempts: c?.attempts ?? 0, lastAnswer: c?.lastAnswer ?? null,
    lastCorrect: c?.lastAnswer ? JSON.stringify(c.lastAnswer) === JSON.stringify([...o.answer].sort()) : null, discoveredAt: c?.discoveredAt ?? null, visits: c?.visits ?? 0, lastVisitAt: null }];
}
function mockServe(name: string, args: Record<string, unknown>) {
  const s = mockServer; s.calls.push([name, args]);
  const fail = (message: string, code?: string) => ({ data: null, error: { message, code } });
  if (name === "titan_live_world_v1") return { data: { version: 1, enabled: true, wallet: { eclats: 10, essences: {} }, buildings: {}, collection: [], voies: {}, days: 0, distinctVoies: 0 }, error: null };
  if (s.missing) return fail(`Could not find the function public.${name}`, "PGRST202");
  if (name === "titan_adventure_consequence_action_v1") {
    const [it] = mockItems(); if (!it) return fail("CONSEQUENCE_UNAVAILABLE");
    const o = OUT[s.outcome as string];
    if (args.p_action === "discover" && it.state === "discover") {
      const raw = args.p_marks as string[], marks = [...new Set(raw)].sort();
      if (marks.length !== raw.length || marks.length !== o.answer.length || marks.some((m) => !o.marks.includes(m))) return fail("INVALID_MARKS");
      const right = JSON.stringify(marks) === JSON.stringify([...o.answer].sort());
      s.c = { visits: 0, ...(s.c ?? {}), attempts: (s.c?.attempts ?? 0) + 1, lastAnswer: marks, discoveredAt: right ? "2026-11-19T10:00:00Z" : null };
    }
    if (args.p_action === "visit") { if (it.state !== "open") return fail("CONSEQUENCE_NOT_DISCOVERED"); s.c!.visits++; }
  } else if (name !== "titan_adventure_consequences_v1") return fail("UNEXPECTED_RPC");
  return { data: { contract: 1, owner: s.owner, items: mockItems() }, error: null };
}
jest.mock("../src/lib/supabase", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "t" } } }) },
  rpc: (name: string, args: Record<string, unknown>) => ({ setHeader: () => Promise.resolve(mockServe(name, args ?? {})) }),
} }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a", useAuth: () => ({ status: "signedIn", owner: "owner-a" }) }));
jest.mock("../src/lib/network", () => ({ useOnline: () => mockOnline, onReconnect: (cb: () => void) => { mockReconnect = cb; return () => { mockReconnect = null; }; } }));
/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
const { CampScreen } = require("../src/screens/live/CampScreen");
const { AdventureConsequence } = require("../src/components/AdventureConsequence");
const { resetConsequenceContract } = require("../src/data/adventureConsequence");
/* eslint-enable @typescript-eslint/no-require-imports */
const metrics = { frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const nav = { navigate: jest.fn() };
// One device = one query cache: a new cache is the app closed and reopened (nothing kept in memory).
const device = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
const wrap = (client: QueryClient, node: React.ReactNode) => render(
  <QueryClientProvider client={client}><SafeAreaProvider initialMetrics={metrics}><ToastProvider>{node}</ToastProvider></SafeAreaProvider></QueryClientProvider>);
const writes = () => mockServer.calls.filter(([n]) => n === "titan_adventure_consequence_action_v1").map(([, a]) => [a.p_action, ...((a.p_marks as string[]) ?? [])]);
/** The return point: the Camp de base. One tap on its card = action 1; the World screen then shows the access first. */
async function fromCamp(client: QueryClient) {
  const camp = wrap(client, <CampScreen navigation={nav} />);
  const card = await screen.findByTestId(`camp-retour-${mockServer.outcome}`);
  const text = card.props.accessibilityLabel as string;
  fireEvent.press(card);
  expect(nav.navigate).toHaveBeenLastCalledWith("World", { id: "aube", focus: "retour" });
  camp.unmount();
  wrap(client, <AdventureConsequence owner="owner-a" world="aube" />);
  await screen.findByTestId("consequence");
  return text;
}
beforeEach(() => { Object.assign(mockServer, { owner: "owner-a", outcome: "passage_rouvert", missing: false, c: null, calls: [] }); mockOnline = true; nav.navigate.mockClear(); resetConsequenceContract(); });

test("la corniche: from the Camp, two landmarks align the shortcut; next visit, two actions to take it", async () => {
  const phone = device();
  expect(await fromCamp(phone)).toMatch(/Le camp retrouve le passage rouvert.*Monter au belvédère/);
  expect(screen.getByText("Le belvédère du passage")).toBeTruthy();
  // Action 2 starts the interaction: the first landmark stays on the phone.
  fireEvent.press(screen.getByTestId("consequence-mark-tour"));
  expect(screen.getByTestId("consequence-selected").props.children).toMatch(/la tour des passeurs/);
  expect(writes()).toEqual([]);
  await act(async () => { fireEvent.press(screen.getByTestId("consequence-mark-cascade")); });
  expect(await screen.findByTestId("consequence-feedback-wrong")).toBeTruthy();
  expect(screen.getByText(/La cascade tombe de la falaise, hors de ton croquis/)).toBeTruthy();
  fireEvent.press(screen.getByTestId("consequence-mark-cairn"));
  await act(async () => { fireEvent.press(screen.getByTestId("consequence-mark-pin")); });
  expect(await screen.findByTestId("consequence-feedback-right")).toBeTruthy();
  expect(screen.getByText(/Le raccourci est ouvert/)).toBeTruthy();
  expect(screen.getByText("La clairière des lucioles ⇄ Le passage du Veilleur")).toBeTruthy();
  expect(writes()).toEqual([["discover", "tour", "cascade"], ["discover", "cairn", "pin"]]);
  // Next visit: Camp card (1), then the shortcut (2).
  expect(await fromCamp(phone)).toMatch(/Emprunter le raccourci$/);
  await act(async () => { fireEvent.press(screen.getByTestId("consequence-visit")); });
  expect((await screen.findByTestId("consequence-vignette")).props.children).toMatch(/Tu descends la sente entre le cairn et le pin/);
  expect(screen.getByTestId("consequence-visits").props.children).toMatch(/1 passage/);
  expect(mockServer.calls.every(([n]) => !/titan_live_build|titan_adventure_rpg|guardian/.test(n))).toBe(true);
});

test("les ruines: one engraving reveals the annex room — another content, another action", async () => {
  mockServer.outcome = "serment_restitue";
  const phone = device();
  expect(await fromCamp(phone)).toMatch(/Le camp retrouve le serment restauré.*Ouvrir l’archive/);
  expect(screen.getByText("L’archive des passeurs")).toBeTruthy();
  expect(screen.queryByTestId("consequence-selected")).toBeNull();
  await act(async () => { fireEvent.press(screen.getByTestId("consequence-mark-vague")); });
  expect(await screen.findByTestId("consequence-feedback-wrong")).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByTestId("consequence-mark-cerf")); });
  expect(await screen.findByTestId("consequence-access")).toBeTruthy();
  expect(screen.getByText(/une porte s’ouvre au fond de l’archive/)).toBeTruthy();
  expect(await fromCamp(phone)).toMatch(/Entrer dans la salle annexe$/);
  await act(async () => { fireEvent.press(screen.getByTestId("consequence-visit")); });
  expect((await screen.findByTestId("consequence-vignette")).props.children).toMatch(/registres des passeurs/);
  expect(writes()).toEqual([["discover", "vague"], ["discover", "cerf"], ["visit"]]);
});

test("app closed and reopened, then a second device answering late: the same access, nothing replayed", async () => {
  const tablet = device();
  await fromCamp(tablet);
  fireEvent.press(screen.getByTestId("consequence-mark-tour"));
  // Meanwhile the phone discovers, then the app is closed: its cache is gone.
  mockServer.c = { attempts: 1, lastAnswer: ["cairn", "pin"], discoveredAt: "2026-11-19T10:00:00Z", visits: 1 };
  await act(async () => { fireEvent.press(screen.getByTestId("consequence-mark-cascade")); });
  expect(await screen.findByTestId("consequence-access")).toBeTruthy();
  expect(mockServer.c.attempts).toBe(1);
  expect(mockServer.c.discoveredAt).toBe("2026-11-19T10:00:00Z");
  const reopened = device();
  expect(await fromCamp(reopened)).toMatch(/Emprunter le raccourci$/);
  expect(screen.getByTestId("consequence-access")).toBeTruthy();
  expect(screen.queryByTestId("consequence-mark-cairn")).toBeNull();
  expect(screen.getByTestId("consequence-visits").props.children).toMatch(/1 passage/);
});

test("no pilot arc, or a server without V1.5.2: no card in the Camp, no access in the Vallée, no error", async () => {
  for (const setup of [() => { mockServer.outcome = null; }, () => { mockServer.missing = true; }]) {
    setup(); resetConsequenceContract();
    const client = device();
    const camp = wrap(client, <CampScreen navigation={nav} />);
    await waitFor(() => expect(mockServer.calls.some(([n]) => n.startsWith("titan_adventure_consequence"))).toBe(true));
    await screen.findByText("Bâtiments");
    expect(screen.queryByTestId(/camp-retour-/)).toBeNull();
    camp.unmount();
    wrap(client, <AdventureConsequence owner="owner-a" world="aube" />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByTestId("consequence")).toBeNull();
    expect(writes()).toEqual([]);
    Object.assign(mockServer, { outcome: "passage_rouvert", missing: false, calls: [] });
  }
});

test("offline: nothing is sent; back online the access reads the server again", async () => {
  mockServer.outcome = "serment_restitue";
  const phone = device();
  await fromCamp(phone);
  // The connection drops: the screen is shown again offline, from what the server last confirmed.
  mockOnline = false;
  screen.unmount();
  wrap(phone, <AdventureConsequence owner="owner-a" world="aube" />);
  fireEvent.press(await screen.findByTestId("consequence-mark-cerf"));
  expect(screen.getByTestId("consequence-notice").props.children).toMatch(/Hors ligne/);
  expect(writes()).toEqual([]);
  mockServer.c = { attempts: 1, lastAnswer: ["cerf"], discoveredAt: "2026-11-19T10:00:00Z", visits: 0 };
  mockOnline = true;
  await act(async () => { mockReconnect?.(); });
  expect(await screen.findByTestId("consequence-access")).toBeTruthy();
  expect(writes()).toEqual([]);
});
