/* The offers screen: four cards, prices only from Google Play, buttons only for what Play returns, nothing to buy for an account
   that already has access, an honest "coming soon" when billing is not switched on. Play is faked; no payment is possible here. */
import { act, fireEvent, render, screen } from "@testing-library/react-native";

process.env.EXPO_PUBLIC_TITAN_BILLING = "1";
const mockProfile = { data: { is_elite: false } as { is_elite: boolean } | undefined };
let mockSessionOwner = "owner-a";
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/data/hooks", () => ({ keys: { profile: (o: string) => ["profile", o] }, useProfile: () => mockProfile }));
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: mockSessionOwner } } } }) } } }));
jest.mock("@tanstack/react-query", () => ({ ...jest.requireActual("@tanstack/react-query"), useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { TitanPlusScreen } = require("../src/screens/settings/TitanPlusScreen");
const billing = require("../src/lib/playBilling");
/* eslint-enable @typescript-eslint/no-require-imports */

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const show = () => render(<SafeAreaProvider initialMetrics={metrics}><TitanPlusScreen /></SafeAreaProvider>);
const fake = (products: { id: string; price: string }[], overrides = {}) =>
  billing._setIapForTests({
    initConnection: async () => true,
    endConnection: async () => undefined,
    fetchProducts: async () => products.map((p) => ({ id: p.id, displayPrice: p.price, subscriptionOffers: [{ offerTokenAndroid: `tok-${p.id}`, displayPrice: p.price }] })),
    requestPurchase: async () => undefined,
    getAvailablePurchases: async () => [],
    finishTransaction: async () => undefined,
    purchaseUpdatedListener: () => ({ remove: () => undefined }),
    purchaseErrorListener: () => ({ remove: () => undefined }),
    deepLinkToSubscriptions: async () => undefined,
    ...overrides,
  });
beforeEach(() => { mockProfile.data = { is_elite: false }; mockSessionOwner = "owner-a"; });
afterAll(() => billing._setIapForTests(null));

test("four cards; each price is exactly what Google Play returned; a missing product says so; no price is invented", async () => {
  fake([{ id: "titan01", price: "4,99 € / mois" }, { id: "titan02", price: "19,99 € / mois" }]);
  show();
  expect(await screen.findByText("4,99 € / mois")).toBeTruthy();
  expect(screen.getByText("19,99 € / mois")).toBeTruthy();
  expect(screen.getByTestId("plan-free")).toBeTruthy();
  expect(screen.getByTestId("plan-coach_pro")).toBeTruthy();
  expect(screen.getByText("Pas encore proposé")).toBeTruthy();
  expect(screen.getByTestId("subscribe-titan_plus")).toBeTruthy();
  expect(screen.getByTestId("subscribe-coach")).toBeTruthy();
  expect(screen.queryByTestId("subscribe-coach_pro")).toBeNull();
  expect(screen.getByTestId("restore-purchases")).toBeTruthy();
});

test("coach cards state the shared suite and the capacity, Coach and Coach Ultra differ only by capacity", async () => {
  fake([{ id: "titan02", price: "x" }, { id: "titan03", price: "y" }]);
  show();
  await screen.findByText("x");
  expect(screen.getByText("• 5 sportifs suivis bénéficient de TITAN+")).toBeTruthy();
  expect(screen.getByText("• 15 sportifs suivis bénéficient de TITAN+")).toBeTruthy();
  expect(screen.getByText(/tu paies la capacité, pas des fonctions/)).toBeTruthy();
});

test("an account that already has access sees no buy button, only a way to manage in Google Play", async () => {
  mockProfile.data = { is_elite: true };
  fake([{ id: "titan01", price: "4,99 € / mois" }]);
  show();
  await screen.findByText("4,99 € / mois");
  expect(screen.queryByTestId("subscribe-titan_plus")).toBeNull();
  expect(screen.getByText("Ouvrir mes abonnements Google Play")).toBeTruthy();
});

test("when Google Play is unreachable the screen stays honest: coming soon, nothing to buy", async () => {
  billing._setIapForTests({ initConnection: async () => false } as never);
  show();
  await act(async () => {});
  expect(await screen.findByText(/Google Play n’est pas joignable/)).toBeTruthy();
  expect(screen.queryByTestId("subscribe-titan_plus")).toBeNull();
  expect(screen.getAllByText("Bientôt disponible").length).toBeGreaterThan(0);
});

test("restore is available even while the store is still loading prices", async () => {
  fake([], { fetchProducts: () => new Promise(() => {}) });
  const result = jest.spyOn(billing, "restore").mockResolvedValueOnce({ checked: 1, active: 1, failed: 0 });
  try {
    show();
    fireEvent.press(screen.getByTestId("restore-purchases"));
    expect(await screen.findByText("Achats restaurés.")).toBeTruthy();
  } finally { result.mockRestore(); }
});

test("an account change cannot open checkout using the previous screen owner", async () => {
  fake([{ id: "titan01", price: "Store offer" }]);
  const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 503 }));
  try {
    show();
    await screen.findByText("Store offer");
    mockSessionOwner = "owner-b";
    fireEvent.press(screen.getByTestId("subscribe-titan_plus"));
    expect(await screen.findByText(/Reconnecte-toi/)).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
  } finally { fetcher.mockRestore(); }
});

test("two plans pressed before the screen can update still start only one checkout", async () => {
  fake([{ id: "titan01", price: "Plus offer" }, { id: "titan02", price: "Coach offer" }]);
  const purchase = jest.spyOn(billing, "buy").mockResolvedValue({ kind: "cancelled" });
  try {
    show();
    await screen.findByText("Plus offer");
    const plus = screen.getByTestId("subscribe-titan_plus"), coach = screen.getByTestId("subscribe-coach");
    await act(async () => { fireEvent.press(plus); fireEvent.press(coach); });
    expect(purchase).toHaveBeenCalledTimes(1);
  } finally { purchase.mockRestore(); }
});


test("an access flag is not payment proof and a yearly offer is never relabelled monthly", async () => {
  mockProfile.data = { is_elite: true };
  fake([{ id: "titan01", price: "Store offer / year" }]);
  show();
  await screen.findByText("Store offer / year");
  expect(screen.getByText(/Un accès offert, de test ou inclus par un coach ne prouve pas un abonnement payé/)).toBeTruthy();
  expect(screen.queryByText(/Abonnement mensuel renouvelé automatiquement/)).toBeNull();
  expect(screen.queryByTestId("subscribe-titan_plus")).toBeNull();
});

test.each([
  [{ active: false, acknowledged: false, status: "expired", ends_at: null }, /Aucun accès actif n’a été confirmé/],
  [{ active: true, acknowledged: true, status: "active", ends_at: null, access_kind: "test" }, /Accès de test actif/],
  [{ active: true, acknowledged: true, status: "active", ends_at: null, access_kind: "verified_purchase" }, /Un achat vérifié peut comporter un essai gratuit/],
])("purchase feedback follows the server verdict and provenance: %j", async (verdict, expected) => {
  fake([{ id: "titan01", price: "Store offer" }]);
  const result = jest.spyOn(billing, "buy").mockResolvedValueOnce({ kind: "active", verdict });
  try {
    show();
    await screen.findByText("Store offer");
    fireEvent.press(screen.getByTestId("subscribe-titan_plus"));
    expect(await screen.findByText(expected)).toBeTruthy();
    expect(screen.queryByText(/Merci ! Ton abonnement est actif/)).toBeNull();
  } finally { result.mockRestore(); }
});
