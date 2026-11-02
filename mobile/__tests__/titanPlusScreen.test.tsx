/* The offers screen: four cards, prices only from Google Play, buttons only for what Play returns, nothing to buy for an account
   that already has access, an honest "coming soon" when billing is not switched on. Play is faked; no payment is possible here. */
import { act, render, screen } from "@testing-library/react-native";

process.env.EXPO_PUBLIC_TITAN_BILLING = "1";
const mockProfile = { data: { is_elite: false } as { is_elite: boolean } | undefined };
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/data/hooks", () => ({ keys: { profile: (o: string) => ["profile", o] }, useProfile: () => mockProfile }));
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } } }));
jest.mock("@tanstack/react-query", () => ({ ...jest.requireActual("@tanstack/react-query"), useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { TitanPlusScreen } = require("../src/screens/settings/TitanPlusScreen");
const billing = require("../src/lib/playBilling");
/* eslint-enable @typescript-eslint/no-require-imports */

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const show = () => render(<SafeAreaProvider initialMetrics={metrics}><TitanPlusScreen /></SafeAreaProvider>);
const fake = (products: { id: string; price: string }[]) =>
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
  });
beforeEach(() => (mockProfile.data = { is_elite: false }));
afterAll(() => billing._setIapForTests(null));

test("four cards; each price is exactly what Google Play returned; a missing product says so; no price is invented", async () => {
  fake([{ id: "titan_plus", price: "4,99 € / mois" }, { id: "coach", price: "20,00 € / mois" }]);
  show();
  expect(await screen.findByText("4,99 € / mois")).toBeTruthy();
  expect(screen.getByText("20,00 € / mois")).toBeTruthy();
  expect(screen.getByTestId("plan-free")).toBeTruthy();
  expect(screen.getByTestId("plan-coach_pro")).toBeTruthy();
  expect(screen.getByText("Pas encore proposé")).toBeTruthy();
  expect(screen.getByTestId("subscribe-titan_plus")).toBeTruthy();
  expect(screen.getByTestId("subscribe-coach")).toBeTruthy();
  expect(screen.queryByTestId("subscribe-coach_pro")).toBeNull();
  expect(screen.getByTestId("restore-purchases")).toBeTruthy();
});

test("coach cards state the shared suite and the capacity, Coach and Coach Pro differ only by capacity", async () => {
  fake([{ id: "coach", price: "x" }, { id: "coach_pro", price: "y" }]);
  show();
  await screen.findByText("x");
  expect(screen.getByText("• 5 sportifs suivis bénéficient de TITAN+")).toBeTruthy();
  expect(screen.getByText("• 15 sportifs suivis bénéficient de TITAN+")).toBeTruthy();
  expect(screen.getByText(/tu paies la capacité, pas des fonctions/)).toBeTruthy();
});

test("an account that already has access sees no buy button, only a way to manage in Google Play", async () => {
  mockProfile.data = { is_elite: true };
  fake([{ id: "titan_plus", price: "4,99 € / mois" }]);
  show();
  await screen.findByText("4,99 € / mois");
  expect(screen.queryByTestId("subscribe-titan_plus")).toBeNull();
  expect(screen.getByText("Gérer dans Google Play")).toBeTruthy();
});

test("when Google Play is unreachable the screen stays honest: coming soon, nothing to buy", async () => {
  billing._setIapForTests({ initConnection: async () => false } as never);
  show();
  await act(async () => {});
  expect(await screen.findByText(/Google Play n’est pas joignable/)).toBeTruthy();
  expect(screen.queryByTestId("subscribe-titan_plus")).toBeNull();
  expect(screen.getAllByText("Bientôt disponible").length).toBeGreaterThan(0);
});
