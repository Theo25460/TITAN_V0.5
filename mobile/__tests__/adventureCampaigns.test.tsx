/* V1.5.3 — Quatre mondes, quatre mécaniques on Android: same server snapshots and same shared configuration as the website.
   Marées first (entry, choice, scene, clue, observation, map of currents with a wrong answer corrected, resolution), then the
   same engine in the Forge (order of pieces) and the Aurores (beacons to link); legacy chapter; offline; another device resumes. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
const mockFetch = jest.fn();
const mockAction = jest.fn();
const mockBranch = jest.fn();
const mockGuardian = jest.fn();
const mockSolve = jest.fn();
let mockOnline = true;
jest.mock("../src/data/adventureRpg", () => ({
  fetchAdventureRpg: (...args: unknown[]) => mockFetch(...args),
  adventureRpgAction: (...args: unknown[]) => mockAction(...args),
  adventureBranchAction: (...args: unknown[]) => mockBranch(...args),
  adventureGuardianAction: (...args: unknown[]) => mockGuardian(...args),
  adventureCampaignSolve: (...args: unknown[]) => mockSolve(...args),
}));
jest.mock("../src/lib/network", () => ({ useOnline: () => mockOnline, onReconnect: () => () => undefined }));
jest.mock("../src/lib/motion", () => ({ useReducedMotion: () => true, reducedMotion: () => true }));
import { AdventureEncounters } from "../src/components/AdventureEncounters";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const C = require("../src/core/web/adventure-campaigns.js");

const T = 15;
type Acc = { world: string; route: string | null; entered: boolean; legacy?: boolean; effort: number; days: number; since: number; sinceDays: number; earned: Set<number>; g: { attempts: number; lastAnswer: string[] | null; preparedAt: string | null; outcome: string | null } | null };
const account = (world: string, extra: Partial<Acc> = {}): Acc => ({ world, route: null, entered: false, effort: 40, days: 2, since: 0, sinceDays: 0, earned: new Set([1]), g: null, ...extra });
// Same rules as the server (and as the website's fake): v1 milestones, route steps counted from the decision, the shared primitive.
function snapshot(a: Acc) {
  const c = C.campaignFor(a.world), route = c.routes.find((r: { id: string }) => r.id === a.route);
  const step = (n: number) => c.steps.find((s: { ordinal: number }) => s.ordinal === n);
  const ready = (n: number) => !a.earned.has(n) && (n === 1 || a.earned.has(n - 1)) && a.effort >= n * T && a.days >= Math.ceil(n / 2)
    && (!route || !step(n) || (a.since >= step(n).effortTargets * T && a.sinceDays >= step(n).daysTarget));
  const milestones = Array.from({ length: 18 }, (_, i) => ({ ordinal: i + 1, arc: Math.ceil((i + 1) / 6), chapter: Math.ceil((i + 1) / 2), kind: "x", effortTarget: (i + 1) * T, daysTarget: Math.ceil((i + 1) / 2), earned: a.earned.has(i + 1), ready: ready(i + 1) }));
  const bstate = a.legacy ? "legacy" : !a.entered ? "available" : !a.route ? "entered" : "confirmed";
  const branch: Record<string, unknown> = { state: bstate, pilot: c.id, version: 1 };
  let guardian: Record<string, unknown> = { state: "none" }, mechanic: Record<string, unknown> = { state: "none" };
  if (bstate === "confirmed") {
    Object.assign(branch, { route: a.route, effortSince: a.since, daysSince: a.sinceDays, clue: a.earned.has(3) ? { id: route.clue, state: a.earned.has(4) ? "usable" : "found" } : null,
      steps: c.steps.map((s: { ordinal: number; kind: string; effortTargets: number; daysTarget: number }) => ({ ordinal: s.ordinal, kind: s.kind, effortTarget: s.effortTargets * T, daysTarget: s.daysTarget, earned: a.earned.has(s.ordinal) })) });
    const g = a.g, m = milestones[a.earned.has(5) ? 5 : 4];
    const state = !a.earned.has(4) ? "locked" : !a.earned.has(5) ? "observe" : !g?.preparedAt ? "prepare" : g.outcome ? "resolved" : milestones[5].ready ? "ready" : "waiting";
    guardian = { state, id: c.guardian.id, version: 1, route: a.route, clue: route.clue, observeOrdinal: 5, ordinal: 6, signs: [], observedAt: a.earned.has(5) ? "x" : null,
      attempts: g?.attempts ?? 0, preparedAt: g?.preparedAt ?? null, outcome: g?.outcome ?? null, resolvedAt: g?.outcome ? "z" : null,
      threshold: { ordinal: m.ordinal, effort: a.effort, effortTarget: m.effortTarget, days: a.days, daysTarget: m.daysTarget, chapter: 9, chapterTarget: 3, ready: m.ready },
      sincePrepared: { effort: 0, sessions: 0 }, corrected: { effort: 0, sessions: 0 } };
    const r = g?.lastAnswer ? C.check(c.guardian.primitive, route, g.lastAnswer) : null;
    mechanic = { state, primitive: c.guardian.primitive, route: a.route, slots: route.slots, attempts: g?.attempts ?? 0, lastAnswer: g?.lastAnswer ?? null, lastCorrect: r ? r.correct : null, firstWrong: r ? r.firstWrong : null, solved: !!g?.preparedAt };
  }
  return { version: 1, owner: "a", world: a.world, active: true, chapter: 9, target: T, days: a.days, effort: a.effort, familyTitles: [], milestones,
    rewards: [...a.earned].map(o => ({ ordinal: o, choice: o === 2 ? (a.legacy ? 1 : route?.choice ?? null) : null, earnedAt: "x" })), branch, guardian, mechanic, campaign: c.id };
}
function server(a: Acc) {
  const reply = () => Promise.resolve(snapshot(a));
  mockFetch.mockImplementation(reply);
  mockAction.mockImplementation((_o: string, _w: string, action: string, ordinal: number) => {
    const s = snapshot(a);
    if (action === "claim") { if (!s.milestones[ordinal - 1].ready || (ordinal === 6 && !a.g?.outcome)) return Promise.reject(new Error("ENCOUNTER_INCOMPLETE")); a.earned.add(ordinal); }
    return reply();
  });
  mockBranch.mockImplementation((_o: string, _w: string, action: string, route: string) => {
    if (action === "enter") a.entered = true;
    if (action === "confirm" && !a.route) { a.route = route; a.earned.add(2); }
    return reply();
  });
  mockSolve.mockImplementation((_o: string, _w: string, answer: string[]) => {
    const c = C.campaignFor(a.world), route = c.routes.find((r: { id: string }) => r.id === a.route);
    if (!a.g?.preparedAt) { const r = C.check(c.guardian.primitive, route, answer); if (!r.valid) return Promise.reject(new Error("INVALID_ANSWER"));
      a.g = { attempts: (a.g?.attempts ?? 0) + 1, lastAnswer: answer, preparedAt: r.correct ? "y" : null, outcome: null }; }
    return reply();
  });
  mockGuardian.mockImplementation((_o: string, _w: string, action: string) => {
    const c = C.campaignFor(a.world), route = c.routes.find((r: { id: string }) => r.id === a.route);
    if (action === "resolve" && a.g?.preparedAt && snapshot(a).milestones[5].ready) { a.g.outcome = route.outcome; a.earned.add(6); }
    return reply();
  });
}
const session = (a: Acc) => { a.effort += 20; a.days += 1; if (a.route) { a.since += 20; a.sinceDays += 1; } };
const open = () => fireEvent.press(screen.getByRole("button", { name: "Rencontres secondaires · 18 souvenirs facultatifs" }));
const press = (label: string | RegExp) => fireEvent.press(screen.getByRole("button", { name: label }));
const sync = async (a: Acc) => { session(a); press("Actualiser les preuves de ce monde"); await waitFor(() => expect(mockAction).toHaveBeenLastCalledWith("a", a.world, "sync", null, null)); };
const board = (answer: string[], slots: { id: string }[]) => answer.forEach((x, i) => fireEvent.press(screen.getByTestId(`mechanic-${slots[i].id}-${x}`)));
beforeEach(() => { mockOnline = true; [mockFetch, mockAction, mockBranch, mockGuardian, mockSolve].forEach(m => m.mockReset()); });

async function playArc(world: string, routeId: string, wrong: string[]) {
  const a = account(world); server(a);
  const c = C.campaignFor(world), route = c.routes.find((r: { id: string }) => r.id === routeId);
  const view = render(<AdventureEncounters owner="a" world={world as "marees"} />); open();
  await screen.findByTestId("branch-available");
  const equal = screen.getByText(/N’importe quel sport compte/).props.children;
  press("Découvrir les deux voies"); await screen.findByTestId("branch-entered");
  press(C.t("pilot.choose", { route: C.t(`${c.id}.route.${routeId}.name`) })); await screen.findByTestId("branch-confirm");
  press(C.t("pilot.confirm", { route: C.t(`${c.id}.route.${routeId}.name`) })); await screen.findByTestId("branch-confirmed");
  await sync(a); await screen.findByTestId("branch-step-3");
  const scene = screen.getByTestId("branch-step-3").findAll(n => n.props.variant === "h3")[0].props.children;
  press(C.t(`${c.id}.route.${routeId}.scene.action`)); await screen.findByTestId(`branch-clue-${route.clue}`);
  await sync(a); await screen.findByTestId("branch-step-4");
  press(C.t(`${c.id}.route.${routeId}.clue.action`)); await screen.findByTestId("guardian-observe");
  const observe = String(screen.getByTestId("guardian-threshold").props.children);
  press(C.t(`${c.id}.observe.action`)); await screen.findByTestId(`mechanic-${c.guardian.primitive}`);
  // Incomplete board: nothing is sent.
  press(C.t(`${c.id}.prepare.submit`)); await screen.findByTestId("mechanic-incomplete"); expect(mockSolve).not.toHaveBeenCalled();
  board(wrong, route.slots); const boardText = String([screen.getByTestId("mechanic-board").props.children].flat().join(""));
  press(C.t(`${c.id}.prepare.submit`)); await screen.findByTestId("guardian-feedback-wrong");
  const wrongText = screen.getByTestId("guardian-feedback-wrong").props.children;
  board(route.answer, route.slots); press(C.t(`${c.id}.prepare.submit`)); await screen.findByTestId("guardian-waiting");
  await sync(a); await screen.findByTestId("guardian-ready");
  press(C.t(`${c.id}.route.${routeId}.action`)); await screen.findByTestId(`guardian-outcome-${route.outcome}`);
  const outcome = screen.getByTestId(`guardian-outcome-${route.outcome}`).findAll(n => n.props.variant === "bodyStrong")[0].props.children;
  const calls = [mockAction, mockBranch, mockSolve, mockGuardian].map(m => m.mock.calls.length);
  view.unmount();
  return { equal, scene, observe, boardText, wrongText, outcome, calls, solves: mockSolve.mock.calls.map(x => x[2]) };
}

test("Marées first: both routes on the same sessions, same thresholds, two scenes, the map of currents, two resolutions", async () => {
  const a = await playArc("marees", "carte", ["est", "est", "chenal"]);
  [mockFetch, mockAction, mockBranch, mockGuardian, mockSolve].forEach(m => m.mockReset());
  const b = await playArc("marees", "gardienne", ["calme", "est", "chenal"]);
  expect(a.equal).toBe(b.equal); expect(a.observe).toBe(b.observe); expect(a.calls).toEqual(b.calls);
  expect(a.scene).toBe("La crique des cartes"); expect(b.scene).toBe("Le ponton des pêcheurs");
  expect(a.boardText).toMatch(/Courant au nord de la crique : vers l’est · Courant au sud de la crique : vers l’est/);
  expect(a.wrongText).toMatch(/bouées du sud/); expect(b.wrongText).toMatch(/Le chant évite ce passage/);
  expect(a.outcome).toBe("le chenal ouvert"); expect(b.outcome).toBe("le large franchi");
  expect(a.solves).toEqual([["est", "est", "chenal"], ["est", "ouest", "chenal"]]);
});

test("the same engine in the Forge and the Aurores: order of pieces and beacons to link", async () => {
  const f = await playArc("forge", "artisans", ["ressort", "axe", "tete"]);
  expect(f.boardText).toMatch(/1\. le ressort → 2\. l’axe → 3\. la tête du marteau/); expect(f.wrongText).toMatch(/tout commence/); expect(f.outcome).toBe("l’enclume qui chante");
  [mockFetch, mockAction, mockBranch, mockGuardian, mockSolve].forEach(m => m.mockReset());
  const s = await playArc("aurores", "constellations", ["cairn", "rocher", "col"]);
  expect(s.boardText).toMatch(/la balise du cairn — la balise du rocher — la balise du col/); expect(s.outcome).toBe("les balises rallumées");
  expect(f.observe).toBe(s.observe); expect(f.calls).toEqual(s.calls);
});

test("a piece already placed is marked as used; another device resumes the last answer; offline sends nothing", async () => {
  const a = account("forge", { entered: true, route: "soufflet", effort: 80, days: 4, since: 40, sinceDays: 2, earned: new Set([1, 2, 3, 4, 5]), g: { attempts: 1, lastAnswer: ["charniere", "buse", "cuir"], preparedAt: null, outcome: null } });
  server(a);
  const view = render(<AdventureEncounters owner="a" world="forge" />); open();
  await screen.findByTestId("guardian-feedback-wrong");
  expect(screen.getByTestId("guardian-feedback-wrong").props.children).toMatch(/le plan montre ce qui couvre le cadre/);
  expect(screen.getByTestId("mechanic-p1-charniere").props.accessibilityState.checked).toBe(true);
  expect(screen.getByTestId("mechanic-p3-cuir").props.accessibilityState.checked).toBe(true);
  expect(screen.getByTestId("mechanic-p2-charniere").props.accessibilityLabel).toBe("la charnière (déjà dans une autre case)");
  mockOnline = false; view.rerender(<AdventureEncounters owner="a" world="forge" />);
  expect(screen.getByRole("button", { name: /Monter les pièces/ }).props.accessibilityState.disabled).toBe(true);
  press(/Monter les pièces/);
  expect(mockSolve).not.toHaveBeenCalled();
});

test("an old Marées chapter keeps its version and acquired rewards; nothing to enter", async () => {
  const a = account("marees", { legacy: true, earned: new Set([1, 2]) }); server(a);
  render(<AdventureEncounters owner="a" world="marees" />); open();
  await screen.findByTestId("branch-legacy");
  expect(screen.getByText(/version d’origine et tous ses acquis/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Découvrir les deux voies" })).toBeNull();
  expect(screen.getByText(/2\/18 souvenirs/)).toBeTruthy();
});
