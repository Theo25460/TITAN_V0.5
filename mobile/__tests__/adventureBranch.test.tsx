/* V1.5.0 — Bifurcations on Android: same server snapshots as the website, two routes on the same sessions, explicit and
   stable decision, simultaneous confirmation, pending session, resume on another device, offline → online. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
const mockFetch = jest.fn();
const mockAction = jest.fn();
const mockBranch = jest.fn();
let mockOnline = true;
let mockReconnect: (() => void) | null = null;
jest.mock("../src/data/adventureRpg", () => ({
  fetchAdventureRpg: (...args: unknown[]) => mockFetch(...args),
  adventureRpgAction: (...args: unknown[]) => mockAction(...args),
  adventureBranchAction: (...args: unknown[]) => mockBranch(...args),
}));
jest.mock("../src/lib/network", () => ({ useOnline: () => mockOnline, onReconnect: (cb: () => void) => { mockReconnect = cb; return () => { mockReconnect = null; }; } }));
import { AdventureEncounters } from "../src/components/AdventureEncounters";

type Branch = Record<string, unknown>;
// Same sessions for both accounts: target 15, 20 confirmed points and 1 active day since the decision.
function snapshot(branch: Branch, earned: number[] = [1], ready: number[] = [], owner = "a") {
  return {
    version: 1, owner, world: "aube", active: true, chapter: 9, target: 15, days: 6, effort: 120, familyTitles: [],
    rewards: earned.map(ordinal => ({ ordinal, choice: ordinal === 2 ? (branch.route === "ruines" ? 1 : 0) : null, earnedAt: "2026-11-10T08:00:00Z" })),
    milestones: Array.from({ length: 18 }, (_, i) => ({ ordinal: i + 1, arc: Math.floor(i / 6) + 1, chapter: Math.ceil((i + 1) / 2), kind: "x",
      effortTarget: (i + 1) * 15, daysTarget: Math.ceil((i + 1) / 2), ready: ready.includes(i + 1), earned: earned.includes(i + 1) })),
    branchContract: 1, branch: { pilot: "aube-arc1", version: 1, ...branch },
  };
}
const confirmed = (route: string, extra: Branch = {}) => ({ state: "confirmed", route, confirmedAt: "2026-11-09T08:00:00Z", effortSince: 20, daysSince: 1,
  steps: [{ ordinal: 3, kind: "scene", effortTarget: 15, daysTarget: 1, branchReady: true, earned: false, earnedAt: null },
    { ordinal: 4, kind: "clue", effortTarget: 30, daysTarget: 2, branchReady: false, earned: false, earnedAt: null }], clue: null, ...extra });
const open = async () => { fireEvent.press(screen.getByRole("button", { name: "Rencontres secondaires · 18 souvenirs facultatifs" })); };
beforeEach(() => { mockOnline = true; mockReconnect = null; mockFetch.mockReset(); mockAction.mockReset(); mockBranch.mockReset(); });

test("two accounts, same sessions: different scene, interaction and clue for the same effort", async () => {
  const seen: Record<string, string> = {};
  for (const route of ["corniche", "ruines"]) {
    mockFetch.mockResolvedValue(snapshot(confirmed(route), [1, 2], [3]));
    const view = render(<AdventureEncounters owner="a" world="aube" />); await open();
    await screen.findByTestId("branch-step-3");
    seen[route] = JSON.stringify(view.toJSON());
    expect(screen.getByText("15/15 points · 1/1 jours actifs depuis ta décision · Le serveur confirme l’étape.")).toBeTruthy();
    view.unmount();
  }
  expect(seen.corniche).toContain("La corniche effondrée"); expect(seen.corniche).toContain("Dégager les éboulis");
  expect(seen.ruines).toContain("Le poste des passeurs"); expect(seen.ruines).toContain("Fouiller la salle scellée");
  expect(seen.corniche).not.toContain("Le poste des passeurs"); expect(seen.ruines).not.toContain("La corniche effondrée");
  // Clues after the interaction: two distinct usable clues.
  for (const [route, name] of [["corniche", "La prise dans la roche"], ["ruines", "Le fragment du serment"]]) {
    mockFetch.mockResolvedValue(snapshot(confirmed(route, { effortSince: 40, daysSince: 2, clue: { id: route === "corniche" ? "prise" : "serment", state: "usable", foundAt: "x", usableAt: "y" } }), [1, 2, 3, 4], []));
    const view = render(<AdventureEncounters owner="a" world="aube" />); await open();
    expect(await screen.findByTestId(`branch-clue-${route === "corniche" ? "prise" : "serment"}`)).toBeTruthy();
    expect(screen.getAllByText(name).length).toBeGreaterThan(0); expect(screen.getByText("Indice utilisable face au Veilleur de pierre")).toBeTruthy();
    view.unmount();
  }
});

test("the choice is explicit: selecting sends nothing, only the confirmation does", async () => {
  mockFetch.mockResolvedValue(snapshot({ state: "entered", enteredAt: "x" }, [1], [2]));
  mockBranch.mockResolvedValue(snapshot(confirmed("corniche"), [1, 2], [3]));
  render(<AdventureEncounters owner="a" world="aube" />); await open();
  fireEvent.press(await screen.findByText("Choisir la corniche"));
  expect(mockBranch).not.toHaveBeenCalled();
  expect(screen.getByText("Confirmer la corniche ?")).toBeTruthy();
  expect(screen.getByText("Même effort pour les deux voies : 30 points d’effort confirmés et 2 jours actifs après ta décision.")).toBeTruthy();
  fireEvent.press(screen.getByText("Revoir les deux voies")); fireEvent.press(screen.getByText("Choisir les ruines"));
  fireEvent.press(screen.getByText("Confirmer les ruines"));
  await waitFor(() => expect(mockBranch).toHaveBeenCalledWith("a", "aube", "confirm", "ruines"));
  expect(mockBranch).toHaveBeenCalledTimes(1);
});

test("simultaneous confirmation: the second device reads the canonical route back", async () => {
  mockFetch.mockResolvedValue(snapshot({ state: "entered", enteredAt: "x" }, [1], [2]));
  mockBranch.mockResolvedValue(snapshot(confirmed("corniche"), [1, 2], [3]));
  render(<AdventureEncounters owner="a" world="aube" />); await open();
  fireEvent.press(await screen.findByText("Choisir les ruines")); fireEvent.press(screen.getByText("Confirmer les ruines"));
  expect(await screen.findByText("Ta voie était déjà confirmée depuis un autre appareil : la corniche. Elle reste ta voie.")).toBeTruthy();
  expect(screen.getAllByText("Voie suivie : la corniche").length).toBeGreaterThan(0); expect(screen.queryByText("Choisir les ruines")).toBeNull();
});

test("a session still pending keeps the step closed; resume on another device shows the server route only", async () => {
  mockFetch.mockResolvedValue(snapshot(confirmed("ruines", { steps: [{ ordinal: 3, earned: true }, { ordinal: 4, kind: "clue", effortTarget: 30, daysTarget: 2, branchReady: false, earned: false }],
    clue: { id: "serment", state: "found", foundAt: "x", usableAt: null } }), [1, 2, 3], []));
  render(<AdventureEncounters owner="a" world="aube" />); await open();
  expect(await screen.findByText("20/30 points · 1/2 jours actifs depuis ta décision")).toBeTruthy();
  expect(screen.getByText("Seules les séances confirmées après ta décision comptent. Une séance en attente compte dès sa validation, après actualisation.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Déchiffrer le serment" }).props.accessibilityState?.disabled).toBe(true);
  expect(screen.getAllByText("Voie suivie : les ruines").length).toBeGreaterThan(0); expect(screen.getByText("Voie non empruntée : la corniche")).toBeTruthy();
  expect(screen.queryByText(/Choisir/)).toBeNull(); expect(mockBranch).not.toHaveBeenCalled();
});

test("offline: the decision is not sent; back online, the canonical state is re-read", async () => {
  mockOnline = false;
  mockFetch.mockResolvedValue(snapshot({ state: "entered", enteredAt: "x" }, [1], [2]));
  render(<AdventureEncounters owner="a" world="aube" />); await open();
  fireEvent.press(await screen.findByText("Choisir la corniche"));
  expect(screen.getByText("Hors ligne : ta décision n’est pas envoyée. Reconnecte-toi pour la confirmer.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Confirmer la corniche" }).props.accessibilityState?.disabled).toBe(true);
  expect(mockBranch).not.toHaveBeenCalled();
  mockFetch.mockResolvedValue(snapshot(confirmed("ruines"), [1, 2], [3]));
  await act(async () => { mockReconnect!(); });
  expect((await screen.findAllByText("Voie suivie : les ruines")).length).toBeGreaterThan(0); expect(mockBranch).not.toHaveBeenCalled();
});

test("compatible entry is explicit; a campaign already past the choice keeps its version", async () => {
  mockFetch.mockResolvedValue(snapshot({ state: "available" }, [1], [2]));
  mockBranch.mockResolvedValue(snapshot({ state: "entered", enteredAt: "x" }, [1], [2]));
  const view = render(<AdventureEncounters owner="a" world="aube" />); await open();
  expect(screen.queryByText("Suivre les lucioles")).toBeNull();
  fireEvent.press(await screen.findByText("Découvrir les deux voies"));
  await waitFor(() => expect(mockBranch).toHaveBeenCalledWith("a", "aube", "enter", null));
  view.unmount();
  mockFetch.mockResolvedValue({ ...snapshot({ state: "legacy" }, [1, 2], [3]), rewards: [{ ordinal: 1, choice: null, earnedAt: "x" }, { ordinal: 2, choice: 0, earnedAt: "x" }] });
  render(<AdventureEncounters owner="a" world="aube" />); await open();
  expect(await screen.findByText("Ta campagne avait déjà passé cet embranchement : elle garde sa version d’origine.")).toBeTruthy();
  expect(screen.getByText("Tu prends le temps de regarder. La clairière des lucioles révèle une route oubliée.")).toBeTruthy();
});
