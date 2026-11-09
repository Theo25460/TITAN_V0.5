import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Linking } from "react-native";
import { GarminScreen } from "../src/screens/settings/GarminScreen";
import { GuildChat } from "../src/components/GuildChat";

let mockOwner = "a";
const mockRead = jest.fn(); const mockConnect = jest.fn(); const mockDisconnect = jest.fn(); const mockLoad = jest.fn(); const mockPost = jest.fn();
jest.mock("../src/data/auth", () => ({ useOwner: () => mockOwner }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true }));
jest.mock("../src/lib/nativeConnections", () => ({ ...jest.requireActual("../src/lib/nativeConnections"), readGarmin: (...a: unknown[]) => mockRead(...a), connectGarmin: (...a: unknown[]) => mockConnect(...a), disconnectGarmin: (...a: unknown[]) => mockDisconnect(...a), loadGuildChat: (...a: unknown[]) => mockLoad(...a), postGuildMessage: (...a: unknown[]) => mockPost(...a) }));
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
function show(ui: React.ReactElement) { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return render(ui, { wrapper: ({ children }) => <QueryClientProvider client={client}><SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider></QueryClientProvider> }); }
beforeEach(() => { mockOwner = "a"; [mockRead, mockConnect, mockDisconnect, mockLoad, mockPost].forEach((f) => f.mockReset()); mockRead.mockResolvedValue({ enabled: true, linked: false }); mockLoad.mockResolvedValue({ messages: [], maxLength: 280, cost: 0 }); });

test("Garmin cannot connect before explicit consent and preserves an honest failure", async () => {
  mockConnect.mockRejectedValue(new Error("offline")); show(<GarminScreen />);
  const button = await screen.findByTestId("garmin-connect"); fireEvent.press(button); expect(mockConnect).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("switch"));
  fireEvent.press(button);
  await waitFor(() => expect(mockConnect).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/La demande n’a pas été confirmée/)).toBeTruthy();
});
test("guild duplicate taps send once and a failed send retains the message", async () => {
  let reject!: (e: Error) => void;
  mockPost.mockImplementation(() => new Promise((_r, j) => { reject = j; }));
  show(<GuildChat />); await screen.findByText("Aucun message récent.");
  fireEvent.changeText(screen.getByTestId("guild-message"), "Bonjour à tous");
  fireEvent.press(screen.getByTestId("guild-send")); fireEvent.press(screen.getByTestId("guild-send"));
  expect(mockPost).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("offline")));
  expect(screen.getByTestId("guild-message").props.value).toBe("Bonjour à tous");
  expect(screen.getByText(/Envoi non confirmé/)).toBeTruthy();
});
test("guild ignores a delayed previous account's private messages", async () => {
  let release!: (r: unknown) => void;
  mockLoad.mockImplementationOnce(() => new Promise((r) => { release = r; }));
  const view = show(<GuildChat />); mockOwner = "b"; view.rerender(<GuildChat />);
  await act(async () => release({ messages: [{ id: "private", sender_name: "A", content: "secret du compte A" }], maxLength: 280, cost: 0 }));
  expect(screen.queryByText("secret du compte A")).toBeNull();
});

test("a warm Garmin return refreshes the account and shows a sanitized recovery stage", async () => {
  let returned: ((event: { url: string }) => void) | undefined;
  const initial = jest.spyOn(Linking, "getInitialURL").mockResolvedValue(null);
  const subscription = jest.spyOn(Linking, "addEventListener").mockImplementation((_type, listener) => {
    returned = listener;
    return { remove: jest.fn() } as unknown as ReturnType<typeof Linking.addEventListener>;
  });
  try {
    show(<GarminScreen />);
    await screen.findByTestId("garmin-connect");
    const reads = mockRead.mock.calls.length;
    await act(async () => returned?.({ url: "titan://garmin?garmin=error&garmin_reason=token&secret=upstream-secret" }));
    expect(await screen.findByText(/GARMIN_TOKEN/)).toBeTruthy();
    await waitFor(() => expect(mockRead.mock.calls.length).toBeGreaterThan(reads));
    expect(screen.queryByText("Compte Garmin connecté")).toBeNull();
    expect(screen.queryByText(/upstream-secret/)).toBeNull();
  } finally {
    initial.mockRestore();
    subscription.mockRestore();
  }
});

test.each([
  [true, "La liaison Garmin est confirmée."],
  [false, "Garmin a répondu. La liaison reste à terminer depuis TITAN."],
])("an OK Garmin return reports the current server status (linked=%s)", async (linked, expected) => {
  let returned: ((event: { url: string }) => void) | undefined;
  const initial = jest.spyOn(Linking, "getInitialURL").mockResolvedValue(null);
  const subscription = jest.spyOn(Linking, "addEventListener").mockImplementation((_type, listener) => {
    returned = listener;
    return { remove: jest.fn() } as unknown as ReturnType<typeof Linking.addEventListener>;
  });
  try {
    show(<GarminScreen />);
    await screen.findByTestId("garmin-connect");
    mockRead.mockResolvedValue({ enabled: true, linked });
    await act(async () => returned?.({ url: "titan://garmin?garmin=ok" }));
    expect(await screen.findByText(expected)).toBeTruthy();
    expect(screen.queryByText(/Vérification de l’état du compte en cours/)).toBeNull();
  } finally {
    initial.mockRestore();
    subscription.mockRestore();
  }
});
