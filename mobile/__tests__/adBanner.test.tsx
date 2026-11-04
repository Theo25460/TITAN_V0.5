/* The banner is a policy-gated, labelled, collapsible slot: it renders nothing unless everything allows it, and gives its
   space back at once when there is no ad. The native SDK is replaced by a fake; no network, no real ad unit. */
import { act, fireEvent, render, screen } from "@testing-library/react-native";

process.env.EXPO_PUBLIC_TITAN_ADS = "1";
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("react-native").Platform.OS = "android";
const mockState = { profile: { is_elite: false } as { is_elite: boolean } | undefined, online: true, effort: null as unknown, timer: { elapsed: 0, started: null as number | null }, draftsReady: true, gpsReadFails: false };
const mockAds = { phase: "ready", canRequestAds: true, privacyOptions: false };
const mockProps: { current: Record<string, unknown> | null } = { current: null };
const mockStart = jest.fn();
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/data/hooks", () => ({ useProfile: () => ({ data: mockState.profile }), usePrefs: () => ({ favoriteSports: [] }), useLogs: () => ({ active: [] }) }));
jest.mock("../src/data/drafts", () => ({ useDrafts: () => ({ ready: mockState.draftsReady, timer: mockState.timer }) }));
jest.mock("../src/lib/network", () => ({ useOnline: () => mockState.online }));
jest.mock("../src/lib/gpsNative", () => ({ recorder: { load: async () => { if (mockState.gpsReadFails) throw new Error("disk unavailable"); return mockState.effort; }, subscribe: () => () => undefined } }));
jest.mock("../src/ads/sdk", () => ({
  adsManager: {
    subscribe: () => () => undefined,
    get: () => mockAds,
    start: (...a: unknown[]) => (mockStart(...a), Promise.resolve()),
  },
  bannerParts: () => ({
    size: "INLINE_ADAPTIVE_BANNER",
    BannerAd: (p: Record<string, unknown>) => {
      const { Text: RNText } = jest.requireActual("react-native");
      mockProps.current = p;
      return <RNText testID="fake-banner">{String(p.unitId)}</RNText>;
    },
  }),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { AdBanner } = require("../src/components/AdBanner");
const { LIVE_UNITS, TEST_UNITS, bannerUnit, interstitialUnit, ADS_LIVE } = require("../src/ads/adIds");
/* eslint-enable @typescript-eslint/no-require-imports */

const reset = () => {
  Object.assign(mockState, { profile: { is_elite: false }, online: true, effort: null, timer: { elapsed: 0, started: null }, draftsReady: true, gpsReadFails: false });
  Object.assign(mockAds, { phase: "ready", canRequestAds: true });
  mockProps.current = null;
  mockStart.mockClear();
};
beforeEach(reset);

test("a free account with consent gets a labelled banner on a TEST unit while the live switch is off", async () => {
  render(<AdBanner placement="hq" />);
  expect(await screen.findByTestId("fake-banner")).toBeTruthy();
  expect(screen.getByText("Publicité")).toBeTruthy();
  expect(mockProps.current?.unitId).toBe(TEST_UNITS.banner);
  expect(ADS_LIVE).toBe(false);
  expect(mockStart).toHaveBeenCalled();
});

test("Premium (own, coach, or a seat included by a coach: all is_elite) sees nothing and never starts the consent flow", async () => {
  mockState.profile = { is_elite: true };
  render(<AdBanner placement="stats" />);
  await act(async () => {});
  expect(screen.queryByTestId("fake-banner")).toBeNull();
  expect(screen.queryByText("Publicité")).toBeNull();
  expect(mockStart).not.toHaveBeenCalled();
});

test.each([
  ["rights not known yet", () => (mockState.profile = undefined)],
  ["no consent", () => (mockAds.canRequestAds = false)],
  ["SDK not ready", () => (mockAds.phase = "starting")],
  ["offline", () => (mockState.online = false)],
  ["a running workout", () => (mockState.timer = { elapsed: 0, started: Date.now() })],
  ["a paused workout", () => (mockState.timer = { elapsed: 5000, started: null })],
  ["GPS state cannot be read", () => (mockState.gpsReadFails = true)],
  ["workout state is unread", () => (mockState.draftsReady = false)],
  ["a GPS recording is open", () => (mockState.effort = { status: "recording", owner: "owner-a" })],
])("nothing is rendered: %s", async (_label, arrange) => {
  arrange();
  render(<AdBanner placement="journal" />);
  await act(async () => {});
  expect(screen.queryByTestId("fake-banner")).toBeNull();
});

test("a banner that fails to load gives its space back at once", async () => {
  render(<AdBanner placement="hq" />);
  await screen.findByTestId("fake-banner");
  act(() => (mockProps.current!.onAdFailedToLoad as () => void)());
  expect(screen.queryByTestId("fake-banner")).toBeNull();
  expect(screen.queryByTestId("ad-hq")).toBeNull();
});

test("the owner's production units are the ones configured, used only in live mode, and the native unit is used nowhere", () => {
  expect(LIVE_UNITS).toEqual({
    hq: "ca-app-pub-8126986266950187/7318104775",
    journal: "ca-app-pub-8126986266950187/4447352676",
    stats: "ca-app-pub-8126986266950187/3187288070",
    sessionEnd: "ca-app-pub-8126986266950187/2101884223",
    nativeReserved: "ca-app-pub-8126986266950187/7536550445",
  });
  expect(bannerUnit("journal", true)).toBe(LIVE_UNITS.journal);
  expect(bannerUnit("journal", false)).toBe(TEST_UNITS.banner);
  expect(interstitialUnit(true)).toBe(LIVE_UNITS.sessionEnd);
  expect(interstitialUnit(false)).toBe(TEST_UNITS.interstitial);
  const fs = require("fs") as typeof import("fs");
  const src = ["../src/ads/sdk.ts", "../src/ads/useAds.ts", "../src/components/AdBanner.tsx", "../src/ads/useSessionInterstitial.ts"].map((f) => fs.readFileSync(require.resolve(f), "utf8")).join("\n");
  expect(src).not.toMatch(/nativeReserved/);
});

test("the interactive guide suppresses ads across its real-screen visits until closed", async () => {
  const { GuideScreen } = require("../src/screens/settings/GuideScreen");
  const { SafeAreaProvider } = require("react-native-safe-area-context");
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const frame = (guide: boolean) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
    {guide ? <GuideScreen navigation={navigation} /> : null}
    <AdBanner placement="journal" />
  </SafeAreaProvider>;
  const view = render(frame(true));
  await screen.findByTestId("guide-step-concept");
  expect(screen.queryByTestId("fake-banner")).toBeNull();
  fireEvent.press(screen.getByTestId("guide-next"));
  fireEvent.press(screen.getByTestId("guide-open"));
  expect(navigation.navigate).toHaveBeenCalledWith("Sports");
  expect(screen.queryByTestId("fake-banner")).toBeNull();
  view.rerender(frame(false));
  expect(await screen.findByTestId("fake-banner")).toBeTruthy();
});
