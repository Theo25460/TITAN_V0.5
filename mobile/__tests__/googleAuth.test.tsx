/* Google sign-in on Android: nothing shown until the build says the provider is ready; the browser answer is parsed strictly; the button starts the flow
   and tells a failure instead of staying silent. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { parseCallback, REDIRECT, googleEnabled } from "../src/lib/googleAuth";

const mockSignInWithGoogle = jest.fn();
jest.mock("../src/data/auth", () => ({ useAuth: () => ({ signInWithGoogle: mockSignInWithGoogle, signIn: jest.fn(), notice: null, clearNotice: jest.fn() }) }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true }));
/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { GoogleButton } = require("../src/components/GoogleButton");
/* eslint-enable @typescript-eslint/no-require-imports */
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const show = (onError = jest.fn()) => render(<SafeAreaProvider initialMetrics={metrics}><GoogleButton onError={onError} /></SafeAreaProvider>);

describe("Google sign-in (Android)", () => {
  afterEach(() => { delete process.env.EXPO_PUBLIC_TITAN_GOOGLE; mockSignInWithGoogle.mockReset(); });
  test("the callback address is read strictly", () => {
    expect(REDIRECT).toBe("titan://auth-callback");
    expect(parseCallback("titan://auth-callback?code=abcdEFGH1234")).toEqual({ code: "abcdEFGH1234" });
    expect(parseCallback("titan://auth-callback?error=access_denied&error_description=Annul%C3%A9")).toEqual({ error: "Annulé" });
    expect(parseCallback("titan://auth-callback#error=server_error")).toEqual({ error: "server_error" });
    expect(parseCallback("titan://auth-callback")).toEqual({ error: "Réponse de connexion incomplète." });
    expect(parseCallback("titan://auth-callback?code=<script>")).toEqual({ error: "Réponse de connexion incomplète." });
    expect(parseCallback("titan://qg")).toBeNull();
    expect(parseCallback("https://titan-app.fr/?code=abcdEFGH1234")).toBeNull();
    expect(parseCallback(null)).toBeNull();
  });
  test("nothing is shown unless the build enables it", () => {
    expect(googleEnabled()).toBe(false);
    show();
    expect(screen.queryByTestId("google-signin")).toBeNull();
  });
  test("enabled: the button starts the flow and says what TITAN receives", async () => {
    process.env.EXPO_PUBLIC_TITAN_GOOGLE = "1";
    mockSignInWithGoogle.mockResolvedValue(undefined);
    show();
    expect(screen.getByText(/TITAN reçoit ton nom et ton adresse e-mail, rien d’autre/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("google-signin"));
    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1));
  });
  test("a failure is told to the player", async () => {
    process.env.EXPO_PUBLIC_TITAN_GOOGLE = "1";
    mockSignInWithGoogle.mockRejectedValue(new Error("Google n’est pas disponible pour le moment."));
    const onError = jest.fn();
    show(onError);
    fireEvent.press(screen.getByTestId("google-signin"));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Google n’est pas disponible pour le moment."));
  });
});

describe("PKCE storage", () => {
  const { createPkceStorage } = require("../src/lib/googleAuth");
  const fake = () => { const m = new Map<string, string>(); return { m, getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v), removeItem: async (k: string) => void m.delete(k) }; };
  it("persists only the code verifier and keeps the session in memory", async () => {
    const secure = fake();
    const s = createPkceStorage(secure);
    await s.setItem("titan-google-code-verifier", "v");
    await s.setItem("titan-google", "SESSION-TOKENS");
    expect([...secure.m.keys()]).toEqual(["titan-google-code-verifier"]);
    expect(await s.getItem("titan-google")).toBe("SESSION-TOKENS");
    s.wipeMemory();
    expect(await s.getItem("titan-google")).toBeNull();
    expect(await s.getItem("titan-google-code-verifier")).toBe("v"); // survives an app restart
    await s.removeItem("titan-google-code-verifier");
    expect(secure.m.size).toBe(0);
  });
});
