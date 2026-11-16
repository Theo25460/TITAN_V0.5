/* AUD-20: discovery accounts — « Essayer sans compte » only when the owner opened it, and a provisional account saved without losing anything. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const mockAuth = { notice: null, clearNotice: jest.fn(), startDiscovery: jest.fn(async () => undefined), saveDiscovery: jest.fn(async (_n: string, _e: string, _p: string) => ({ needsConfirmation: true })), isDiscovery: true };
const mockFlags = jest.fn(async () => ({} as Record<string, boolean>));
jest.mock("../src/data/auth", () => ({ useAuth: () => mockAuth }));
jest.mock("../src/data/api", () => ({ fetchPublicFlags: () => mockFlags() }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true }));
/* eslint-disable @typescript-eslint/no-require-imports */
const { WelcomeScreen } = require("../src/screens/auth/WelcomeScreen");
const { DiscoveryBanner, SaveAccountScreen } = require("../src/screens/settings/SaveAccountScreen");
/* eslint-enable @typescript-eslint/no-require-imports */

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const nav = { navigate: jest.fn() } as never;
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

beforeEach(() => jest.clearAllMocks());

test("no discovery button while the owner has not opened it", async () => {
  wrap(<WelcomeScreen navigation={nav} route={{} as never} />);
  await waitFor(() => expect(mockFlags).toHaveBeenCalled());
  expect(screen.queryByTestId("welcome-discovery")).toBeNull();
});

test("with the flag on, « Essayer sans compte » starts a discovery account", async () => {
  mockFlags.mockResolvedValueOnce({ "auth.anonymous": true });
  wrap(<WelcomeScreen navigation={nav} route={{} as never} />);
  fireEvent.press(await screen.findByTestId("welcome-discovery"));
  await waitFor(() => expect(mockAuth.startDiscovery).toHaveBeenCalled());
});

test("saving keeps everything and asks only for name, e-mail and password", async () => {
  wrap(<SaveAccountScreen />);
  fireEvent.press(screen.getByTestId("save-submit"));
  expect(await screen.findByText("Indique une adresse e-mail valide.")).toBeTruthy();
  expect(mockAuth.saveDiscovery).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByTestId("save-name"), "Théo");
  fireEvent.changeText(screen.getByTestId("save-email"), "athlete@example.com");
  fireEvent.changeText(screen.getByTestId("save-password"), "motdepasse");
  fireEvent.press(screen.getByTestId("save-submit"));
  await waitFor(() => expect(mockAuth.saveDiscovery).toHaveBeenCalledWith("Théo", "athlete@example.com", "motdepasse"));
  expect(await screen.findByText(/Confirme ton adresse/)).toBeTruthy();
});

test("the banner shows only for a discovery account", () => {
  const onPress = jest.fn();
  const view = wrap(<DiscoveryBanner onPress={onPress} />);
  fireEvent.press(screen.getByTestId("discovery-banner"));
  expect(onPress).toHaveBeenCalled();
  mockAuth.isDiscovery = false;
  view.rerender(<SafeAreaProvider initialMetrics={metrics}><DiscoveryBanner onPress={onPress} /></SafeAreaProvider>);
  expect(screen.queryByTestId("discovery-banner")).toBeNull();
  mockAuth.isDiscovery = true;
});
