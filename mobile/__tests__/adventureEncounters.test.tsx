import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
let mockResolve: ((data: unknown) => void) | null = null;
const mockFetch = jest.fn();
const mockAction = jest.fn();
jest.mock("../src/data/adventureRpg", () => ({ fetchAdventureRpg: (...args: unknown[]) => mockFetch(...args), adventureRpgAction: (...args: unknown[]) => mockAction(...args) }));
import { AdventureEncounters } from "../src/components/AdventureEncounters";
const fixture = (owner = "a") => ({ version: 1, owner, world: "aube", active: false, chapter: 1, target: 15, days: 0, effort: 0, milestones: [], rewards: [], familyTitles: [] });
beforeEach(() => { mockResolve = null; mockFetch.mockReset(); mockAction.mockReset(); mockFetch.mockResolvedValue(fixture()); });
test("read-only mount never starts a journey; start requires an explicit tap", async () => {
 mockAction.mockResolvedValue(fixture()); render(<AdventureEncounters owner="a" world="aube" />);
 fireEvent.press(screen.getByRole("button", { name: "Rencontres secondaires · 18 souvenirs facultatifs" }));
 await screen.findByText("Ouvrir ce chemin"); expect(mockAction).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText("Ouvrir ce chemin")); await waitFor(() => expect(mockAction).toHaveBeenCalledWith("a", "aube", "start", null, null));
});
test("missing RPC has a readable failure and retry, no invented rewards", async () => {
 mockFetch.mockRejectedValue(new Error("PGRST202")); render(<AdventureEncounters owner="a" world="aube" />);
 fireEvent.press(screen.getByRole("button", { name: "Rencontres secondaires · 18 souvenirs facultatifs" }));
 await screen.findByText("La rencontre est indisponible. Tes acquis sont conservés."); expect(screen.queryByText("Ouvrir ce chemin")).toBeNull();
 mockFetch.mockResolvedValue(fixture()); fireEvent.press(screen.getByText("Réessayer")); await screen.findByText("Ouvrir ce chemin"); expect(mockAction).not.toHaveBeenCalled();
});
test("old read cannot repopulate after account switch or unmount", async () => {
 mockFetch.mockImplementationOnce(() => new Promise(resolve => { mockResolve = resolve; }));
 const result = render(<AdventureEncounters owner="a" world="aube" />);
 result.rerender(<AdventureEncounters owner="b" world="aube" />);
 await act(async () => { mockResolve!({ ...fixture("a"), active: true, rewards: [{ ordinal: 1 }] }); });
 expect(screen.queryByText(/1\/18 souvenirs/)).toBeNull(); result.unmount();
});
test("guest does not call any server function", () => {
 render(<AdventureEncounters owner="guest_local" world="aube" />); expect(mockFetch).not.toHaveBeenCalled(); expect(mockAction).not.toHaveBeenCalled();
});

test("secondary encounters remain collapsed until explicitly requested, without writes", async () => {
 render(<AdventureEncounters owner="a" world="aube" />);
 const toggle = screen.getByRole("button", { name: "Rencontres secondaires · 18 souvenirs facultatifs" });
 expect(toggle.props.accessibilityState.expanded).toBe(false);
 expect(screen.queryByText("Ouvrir ce chemin")).toBeNull();
 fireEvent.press(toggle); await screen.findByText("Ouvrir ce chemin");
 fireEvent.press(toggle); expect(screen.queryByText("Ouvrir ce chemin")).toBeNull();
 expect(mockAction).not.toHaveBeenCalled();
});
