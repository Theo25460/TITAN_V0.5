/* V1.5.1 — Gardiens on Android: same server snapshots as the website. Two routes on the same sessions end with two distinct
   resolutions for the same effort; wrong interpretation then correction; no contribution yet; corrected session; synchronisation
   failure and retry; offline → online; double confirmation; resume on another device; reduced motion; legacy account. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
const mockFetch = jest.fn();
const mockAction = jest.fn();
const mockBranch = jest.fn();
const mockGuardian = jest.fn();
let mockOnline = true;
let mockReduced = false;
let mockReconnect: (() => void) | null = null;
jest.mock("../src/data/adventureRpg", () => ({
  fetchAdventureRpg: (...args: unknown[]) => mockFetch(...args),
  adventureRpgAction: (...args: unknown[]) => mockAction(...args),
  adventureBranchAction: (...args: unknown[]) => mockBranch(...args),
  adventureGuardianAction: (...args: unknown[]) => mockGuardian(...args),
}));
jest.mock("../src/lib/network", () => ({ useOnline: () => mockOnline, onReconnect: (cb: () => void) => { mockReconnect = cb; return () => { mockReconnect = null; }; } }));
jest.mock("../src/lib/motion", () => ({ useReducedMotion: () => mockReduced, reducedMotion: () => mockReduced }));
import { AdventureEncounters } from "../src/components/AdventureEncounters";

const ROUTE: Record<string, { clue: string; sign: string; outcome: string; choice: number }> = {
  corniche: { clue: "prise", sign: "fissure", outcome: "passage_rouvert", choice: 0 }, ruines: { clue: "serment", sign: "gravure", outcome: "serment_restitue", choice: 1 },
};
type G = { state: string; lastSign?: string | null; attempts?: number; effort?: number; days?: number; since?: number; corrected?: number };
// Same sessions for both accounts: target 15; the observation needs 75 points and 3 days, the resolution 90 points and 3 days.
function snapshot(route: string, g: G, owner = "a") {
  const r = ROUTE[route], effort = g.effort ?? 80, days = g.days ?? 3, ord = ["locked", "observe"].includes(g.state) ? 5 : 6;
  const prepared = ["waiting", "ready", "resolved"].includes(g.state);
  const earned = [1, 2, 3, 4, ...(ord === 6 ? [5] : []), ...(g.state === "resolved" ? [6] : [])];
  return {
    version: 1, owner, world: "aube", active: true, chapter: 9, target: 15, days, effort, familyTitles: [],
    rewards: earned.map(ordinal => ({ ordinal, choice: ordinal === 2 ? r.choice : null, earnedAt: "2026-11-10T08:00:00Z" })),
    milestones: Array.from({ length: 18 }, (_, i) => ({ ordinal: i + 1, arc: Math.floor(i / 6) + 1, chapter: Math.ceil((i + 1) / 2), kind: "x",
      effortTarget: (i + 1) * 15, daysTarget: Math.ceil((i + 1) / 2), ready: i + 1 === ord && effort >= ord * 15 && days >= 3 && g.state !== "resolved", earned: earned.includes(i + 1) })),
    branchContract: 1, branch: { state: "confirmed", pilot: "aube-arc1", version: 1, route, clue: { id: r.clue, state: "usable" } },
    guardianContract: 1,
    guardian: { state: g.state, id: "veilleur", version: 1, route, clue: r.clue, observeOrdinal: 5, ordinal: 6, signs: ["fissure", "gravure", "mousse"],
      observedAt: ord === 6 || g.state === "prepare" ? "x" : null, attempts: g.attempts ?? (prepared ? 1 : 0), lastSign: prepared ? r.sign : g.lastSign ?? null,
      lastCorrect: prepared ? true : g.lastSign ? g.lastSign === r.sign : null, preparedAt: prepared ? "y" : null,
      outcome: g.state === "resolved" ? r.outcome : null, resolvedAt: g.state === "resolved" ? "z" : null,
      threshold: { ordinal: ord, effort, effortTarget: ord * 15, days, daysTarget: 3, chapter: 9, chapterTarget: 3, ready: effort >= ord * 15 && days >= 3 },
      sincePrepared: { effort: (g.since ?? 0) * 10, sessions: g.since ?? 0 }, corrected: { effort: g.corrected ?? 0, sessions: g.corrected ? 1 : 0 } },
  };
}
// Every string rendered under a node (the host tree keeps the props, so circular children are never serialised).
const textOf = (id: string) => screen.getByTestId(id).findAll(n => typeof n.props.children === "string" || (Array.isArray(n.props.children) && n.props.children.every((c: unknown) => typeof c === "string")))
  .map(n => [n.props.children].flat().join("")).join(" | ");
const open = async () => { fireEvent.press(screen.getByRole("button", { name: "Rencontres secondaires · 18 souvenirs facultatifs" })); };
beforeEach(() => { mockOnline = true; mockReduced = false; mockReconnect = null; [mockFetch, mockAction, mockBranch, mockGuardian].forEach(m => m.mockReset()); });

test("two routes, same sessions: same phases and thresholds, distinct resolutions and outcomes", async () => {
  const seen: Record<string, { observe: string; waiting: string; outcome: string; actions: unknown[] }> = {};
  for (const route of ["corniche", "ruines"]) {
    mockFetch.mockResolvedValueOnce(snapshot(route, { state: "observe" }));
    mockAction.mockResolvedValueOnce(snapshot(route, { state: "prepare" }));
    const view = render(<AdventureEncounters owner="a" world="aube" />); await open();
    await screen.findByTestId("guardian-observe");
    const observe = String(screen.getByTestId("guardian-threshold").props.children);
    expect(screen.getByTestId("guardian-caption").props.children).toMatch(/bloque entièrement/);
    fireEvent.press(screen.getByText("Observer le Veilleur"));
    await screen.findByTestId("guardian-prepare");
    expect(mockAction).toHaveBeenLastCalledWith("a", "aube", "claim", 5, null);
    // A wrong interpretation, a concrete answer, then the right sign.
    const wrong = route === "corniche" ? "gravure" : "fissure";
    mockGuardian.mockResolvedValueOnce(snapshot(route, { state: "prepare", lastSign: wrong, attempts: 1 }));
    fireEvent.press(screen.getByText(`Associer « ${route === "corniche" ? "La prise dans la roche" : "Le fragment du serment"} » à la ${wrong}`));
    await screen.findByTestId("guardian-feedback-wrong");
    expect(mockGuardian).toHaveBeenLastCalledWith("a", "aube", "prepare", wrong);
    mockGuardian.mockResolvedValueOnce(snapshot(route, { state: "waiting", attempts: 2 }));
    fireEvent.press(screen.getByText(new RegExp(`à la ${ROUTE[route].sign}$`)));
    await screen.findByTestId("guardian-waiting");
    const waiting = String(screen.getByTestId("guardian-threshold").props.children);
    expect(screen.getByTestId("guardian-next").props.children).toMatch(/^Aucune séance validée depuis ta préparation\./);
    // Next eligible contribution, sync, resolve.
    mockAction.mockResolvedValueOnce(snapshot(route, { state: "ready", effort: 100, days: 4, since: 1 }));
    fireEvent.press(screen.getByText("Actualiser les preuves de ce monde"));
    await screen.findByTestId("guardian-ready");
    mockGuardian.mockResolvedValueOnce(snapshot(route, { state: "resolved", effort: 100, days: 4, since: 1 }));
    fireEvent.press(screen.getByText(route === "corniche" ? "Rouvrir le passage" : "Restituer le serment"));
    await screen.findByTestId(`guardian-outcome-${ROUTE[route].outcome}`);
    seen[route] = { observe, waiting, outcome: textOf(`guardian-outcome-${ROUTE[route].outcome}`), actions: [...mockAction.mock.calls, ...mockGuardian.mock.calls].map(c => c[2]) };
    expect(screen.queryByTestId(route === "corniche" ? "guardian-scene-aside" : "guardian-scene-bowing")).toBeNull(); // decorative: hidden from screen readers
    expect(screen.getByTestId(route === "corniche" ? "guardian-scene-aside" : "guardian-scene-bowing", { includeHiddenElements: true })).toBeTruthy();
    view.unmount(); mockAction.mockReset(); mockGuardian.mockReset();
  }
  expect(seen.corniche.observe).toBe(seen.ruines.observe); expect(seen.corniche.observe).toBe("75/75 points · 3/3 jours actifs · chapitre 3/3");
  expect(seen.corniche.waiting).toBe(seen.ruines.waiting); expect(seen.corniche.waiting).toMatch(/^80\/90 points/);
  expect(seen.corniche.actions).toEqual(seen.ruines.actions);
  expect(seen.corniche.outcome).toContain("le passage rouvert"); expect(seen.corniche.outcome).toContain("Indice décisif : la prise dans la roche, associée à la fissure.");
  expect(seen.ruines.outcome).toContain("le serment restitué"); expect(seen.ruines.outcome).toContain("Indice décisif : le fragment du serment, associé à la gravure.");
});

test("synchronisation failure keeps the last state and can be retried; a corrected session closes the resolution", async () => {
  mockFetch.mockResolvedValueOnce(snapshot("ruines", { state: "ready", effort: 100, days: 4, since: 1 }));
  render(<AdventureEncounters owner="a" world="aube" />); await open();
  await screen.findByTestId("guardian-ready");
  mockGuardian.mockRejectedValueOnce(new TypeError("Network request failed"));
  fireEvent.press(screen.getByText("Restituer le serment"));
  expect(await screen.findByText(/Synchronisation impossible/)).toBeTruthy();
  expect(screen.getByTestId("guardian-ready")).toBeTruthy();
  mockAction.mockResolvedValueOnce(snapshot("ruines", { state: "waiting", effort: 80, corrected: 20 }));
  fireEvent.press(screen.getByText("Actualiser les preuves de ce monde"));
  await screen.findByTestId("guardian-waiting");
  expect(screen.getByTestId("guardian-corrected").props.children).toMatch(/20 point\(s\)/);
  mockAction.mockResolvedValueOnce(snapshot("ruines", { state: "ready", effort: 100, days: 4, since: 1 }));
  fireEvent.press(screen.getByText("Actualiser les preuves de ce monde"));
  await screen.findByTestId("guardian-ready");
  mockGuardian.mockResolvedValueOnce(snapshot("ruines", { state: "resolved", effort: 100, days: 4 }));
  fireEvent.press(screen.getByText("Restituer le serment"));
  await screen.findByTestId("guardian-outcome-serment_restitue");
  expect(mockGuardian).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(/Synchronisation impossible/)).toBeNull();
});

test("offline: nothing is sent; back online the outcome confirmed elsewhere is read; a double confirmation keeps it", async () => {
  mockOnline = false;
  mockFetch.mockResolvedValueOnce(snapshot("corniche", { state: "ready", effort: 100, days: 4 }));
  const view = render(<AdventureEncounters owner="a" world="aube" />); await open();
  await screen.findByTestId("guardian-ready");
  fireEvent.press(screen.getByText("Rouvrir le passage"));
  expect(await screen.findByText(/Hors ligne : la rencontre n’avance qu’avec le serveur/)).toBeTruthy();
  expect(mockGuardian).not.toHaveBeenCalled();
  mockOnline = true;
  mockFetch.mockResolvedValueOnce(snapshot("corniche", { state: "resolved", effort: 100, days: 4 }));
  view.rerender(<AdventureEncounters owner="a" world="aube" />);
  await act(async () => { mockReconnect?.(); });
  await screen.findByTestId("guardian-outcome-passage_rouvert");
  expect(mockGuardian).not.toHaveBeenCalled();
  view.unmount();
  // A second device still showing "ready" resolves: the server returns the same outcome.
  mockFetch.mockResolvedValueOnce(snapshot("corniche", { state: "ready", effort: 100, days: 4 }));
  mockGuardian.mockResolvedValueOnce(snapshot("corniche", { state: "resolved", effort: 100, days: 4 }));
  render(<AdventureEncounters owner="a" world="aube" />); await open();
  fireEvent.press(await screen.findByText("Rouvrir le passage"));
  await screen.findByTestId("guardian-outcome-passage_rouvert");
  expect(mockGuardian).toHaveBeenCalledTimes(1);
});

test("resume on another device shows what is acquired, nothing to replay; legacy and reduced motion", async () => {
  mockReduced = true;
  mockFetch.mockResolvedValueOnce(snapshot("ruines", { state: "resolved", effort: 100, days: 4 }));
  const view = render(<AdventureEncounters owner="a" world="aube" />); await open();
  await screen.findByTestId("guardian-resolved");
  const resume = textOf("guardian-resume");
  for (const line of ["Voie suivie : les ruines", "Indice : Le fragment du serment", "Veilleur observé", "Signe associé : la gravure", "Issue : le serment restitué"]) expect(resume).toContain(line);
  expect(screen.queryByText("Restituer le serment")).toBeNull();
  // Reduced motion: the final pose is shown at once and fully described in text.
  expect(screen.getByTestId("guardian-scene-bowing", { includeHiddenElements: true })).toBeTruthy(); expect(screen.getByTestId("guardian-oath-complete", { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByTestId("guardian-caption").props.children).toBe("Le Veilleur incline la tête. La gravure de son poitrail est complète ; le passage reste sous sa garde.");
  view.unmount();
  const legacy = snapshot("corniche", { state: "observe" }); legacy.guardian = { state: "legacy", id: "veilleur", version: 1, route: "corniche" } as typeof legacy.guardian;
  mockFetch.mockResolvedValueOnce(legacy);
  render(<AdventureEncounters owner="a" world="aube" />); await open();
  await screen.findByTestId("guardian-legacy");
  expect(screen.getByText(/ta victoire est conservée telle quelle/)).toBeTruthy();
  await waitFor(() => expect(mockGuardian).not.toHaveBeenCalled());
});
