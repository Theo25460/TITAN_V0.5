/* The offers screen reads store prices and gates new purchases and replacements on the account and Play inventory. */
import { act, fireEvent, render, screen } from "@testing-library/react-native";

process.env.EXPO_PUBLIC_TITAN_BILLING = "1";
const mockProfile = { data: { is_elite: false } as { is_elite: boolean } | undefined };
const mockFetchProfile = jest.fn(async () => mockProfile.data ?? null);
let mockSessionOwner = "owner-a";
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/data/hooks", () => ({ keys: { profile: (o: string) => ["profile", o] }, useProfile: () => mockProfile }));
jest.mock("../src/data/api", () => ({ fetchProfile: () => mockFetchProfile() }));
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
beforeEach(() => { mockProfile.data = { is_elite: false }; mockSessionOwner = "owner-a"; mockFetchProfile.mockClear(); });
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

test("a loading profile never exposes a new subscription action", async () => {
  mockProfile.data = undefined;
  fake([{ id: "titan01", price: "Plus offer" }]);
  show();
  await screen.findByText("Plus offer");
  expect(screen.queryByTestId("subscribe-titan_plus")).toBeNull();
});

test("a current Google Play subscriber can replace their plan instead of starting a second subscription", async () => {
  mockProfile.data = { is_elite: true };
  const current = { productId: "titan01", purchaseToken: "old-play-token-1234", purchaseState: "purchased", obfuscatedAccountIdAndroid: "owner-a" };
  const requestPurchase = jest.fn().mockRejectedValue({ code: "user-cancelled" });
  fake([{ id: "titan01", price: "Plus offer" }, { id: "titan02", price: "Coach offer" }], { getAvailablePurchases: async () => [current], requestPurchase });
  const fetcher = jest.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ active: true, acknowledged: true, status: "active", ends_at: null }), { status: 200 }));
  try {
    show();
    const change = await screen.findByRole("button", { name: "Passer à Coach" });
    expect(screen.queryByTestId("subscribe-titan_plus")).toBeNull();
    expect(screen.queryByTestId("subscribe-coach")).toBeNull();
    await act(async () => { fireEvent.press(change); });
    expect(fetcher).toHaveBeenNthCalledWith(2, "https://titan-app.fr/functions/play-billing", expect.objectContaining({
      method: "POST", body: JSON.stringify({ purchase_token: "old-play-token-1234", product_id: "titan01" }),
    }));
    expect(requestPurchase).toHaveBeenCalledWith({ type: "subs", request: { google: {
      skus: ["titan02"], obfuscatedAccountId: "owner-a", subscriptionOffers: [{ sku: "titan02", offerToken: "tok-titan02" }],
      purchaseToken: "old-play-token-1234", subscriptionProductReplacementParams: { oldProductId: "titan01", replacementMode: "charge-full-price" },
    } } });
  } finally { fetcher.mockRestore(); }
});

test("a stale free profile cannot start a separate subscription when TITAN reports existing access", async () => {
  const requestPurchase = jest.fn().mockRejectedValue({ code: "user-cancelled" });
  fake([{ id: "titan01", price: "Plus offer" }], { requestPurchase });
  mockFetchProfile.mockResolvedValueOnce({ is_elite: true });
  const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }));
  try {
    show();
    const subscribe = await screen.findByTestId("subscribe-titan_plus");
    await act(async () => { fireEvent.press(subscribe); });
    expect(requestPurchase).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Restaurer mes achats/);
  } finally { fetcher.mockRestore(); }
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
