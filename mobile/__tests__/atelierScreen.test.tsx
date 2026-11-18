import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AtelierScreen } from "../src/screens/profile/AtelierScreen";

// The Atelier exchanges credits earned by training for cosmetics. These tests pin what the player is told after an exchange:
// a piece is said to be worn only when the server accepted both the exchange and the change of appearance.
const mockToast = jest.fn();
const mockPurchase = jest.fn();
const mockAppearance = jest.fn();
const mockAlert = jest.fn();
const item = { id: "frame-ember", slot: "frame", cosmetic: "ember", name: "Cadre Braise", unlock: "credits", price: 120, owned: false, min_level: 1 };
const mockAtelier = { credits: 300, week_credits: 40, week_credit_cap: 200, level: 4, appearance: { frame: "base" }, items: [item] };

jest.mock("@tanstack/react-query", () => ({ ...jest.requireActual("@tanstack/react-query"), useQueryClient: () => ({ invalidateQueries: jest.fn(async () => undefined) }) }));
jest.mock("../src/data/hooks", () => ({
  keys: { atelier: (o: string) => ["atelier", o], profile: (o: string) => ["profile", o], adventure: (o: string) => ["adventure", o] },
  useAtelier: () => ({ data: mockAtelier, isLoading: false, isRefetching: false, refetch: jest.fn() }),
  useAdventure: () => ({ data: { level: 4, avatar: "scout" } }),
}));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true }));
jest.mock("../src/components/Toast", () => ({ useToast: () => mockToast }));
jest.mock("../src/components/Dialog", () => ({ Alert: { alert: (...args: unknown[]) => mockAlert(...args) } }));
jest.mock("../src/data/api", () => ({
  purchaseItem: (...a: unknown[]) => mockPurchase(...a),
  setAppearance: (...a: unknown[]) => mockAppearance(...a),
}));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 740 }, insets: { top: 24, bottom: 16, left: 0, right: 0 } };

async function exchange() {
  render(<SafeAreaProvider initialMetrics={metrics}><AtelierScreen /></SafeAreaProvider>);
  fireEvent.press(screen.getByTestId("atelier-preview-frame-ember"));
  expect(screen.getByText("Solde après échange · 180 crédits")).toBeTruthy();
  expect(mockPurchase).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Obtenir pour 120 crédits"));
  expect(mockAlert).toHaveBeenCalledTimes(1);
  const [title, body, buttons] = mockAlert.mock.calls[0] as [string, string, { text: string; onPress?: () => Promise<void> }[]];
  expect(title).toBe("Obtenir « Cadre Braise » ?");
  expect(body).toMatch(/Purement visuel/);
  const confirm = buttons.find((b) => b.text === "Échanger 120 crédits");
  await act(async () => { await confirm!.onPress!(); });
}

beforeEach(() => { mockToast.mockReset(); mockPurchase.mockReset(); mockAppearance.mockReset(); mockAlert.mockReset(); });

test("an exchange whose piece cannot be put on says it is in the collection but not worn", async () => {
  mockPurchase.mockResolvedValue(undefined);
  mockAppearance.mockRejectedValue(new Error("NETWORK"));
  await exchange();
  expect(mockPurchase).toHaveBeenCalledWith("owner-a", "frame-ember");
  expect(mockAppearance).toHaveBeenCalledWith("owner-a", "frame", "frame-ember");
  expect(mockToast).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledWith({ kind: "ok", title: "Cadre Braise ajouté à ta collection", message: "Il n’a pas pu être équipé : touche « Équiper » sur sa carte." });
});

test("an exchange that is also put on says so", async () => {
  mockPurchase.mockResolvedValue(undefined);
  mockAppearance.mockResolvedValue(undefined);
  await exchange();
  expect(mockToast).toHaveBeenCalledWith({ kind: "ok", title: "Cadre Braise ajouté et équipé" });
});

test("a refused exchange never tries to put the piece on and explains the refusal", async () => {
  mockPurchase.mockRejectedValue(new Error("INSUFFICIENT_CREDITS"));
  await exchange();
  expect(mockAppearance).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ kind: "err", title: "Échange impossible" }));
});

test("le solde insuffisant permet l’essayage et explique le chemin restant", () => {
  mockAtelier.credits = 20;
  try {
    render(<SafeAreaProvider initialMetrics={metrics}><AtelierScreen /></SafeAreaProvider>);
    fireEvent.press(screen.getByTestId("atelier-preview-frame-ember"));
    expect(screen.getByText("Encore 100 crédits à gagner en séance.")).toBeTruthy();
    fireEvent.press(screen.getByText("Obtenir pour 120 crédits"));
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mockPurchase).not.toHaveBeenCalled();
  } finally {
    mockAtelier.credits = 300;
  }
});

test("une pièce acquise s’équipe sans second échange", async () => {
  item.owned = true;
  try {
    mockAppearance.mockResolvedValue(undefined);
    render(<SafeAreaProvider initialMetrics={metrics}><AtelierScreen /></SafeAreaProvider>);
    fireEvent.press(screen.getByTestId("atelier-preview-frame-ember"));
    await act(async () => { fireEvent.press(screen.getByText("Équiper")); });
    expect(mockPurchase).not.toHaveBeenCalled();
    expect(mockAppearance).toHaveBeenCalledWith("owner-a", "frame", item.id);
    expect(mockToast).toHaveBeenCalledWith({ kind: "ok", title: "Cadre Braise équipé" });
  } finally {
    item.owned = false;
  }
});
