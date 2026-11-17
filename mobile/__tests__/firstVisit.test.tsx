/* The guided visit before sign-up (Opération Masterpiece, § 6): four stops in the real spaces, optional, shown once, resumed when
   interrupted. It must create nothing: no account, no session, no XP, no request to the server, no permission. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { BackHandler } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Everything that could write something real is replaced by a spy that must stay silent.
const mockServer = jest.fn();
const mockQueue = jest.fn();
const mockAuth = { notice: null, clearNotice: jest.fn(), startDiscovery: jest.fn(async () => undefined), signUp: jest.fn(), signIn: jest.fn() };
jest.mock("../src/data/api", () => new Proxy({}, { get: (_t, name) => (name === "__esModule" ? false : (...args: unknown[]) => mockServer(name, ...args)) }));
jest.mock("../src/data/queue", () => ({ enqueue: (...a: unknown[]) => mockQueue(...a), useQueue: () => ({ items: [], owner: null }) }));
jest.mock("../src/data/auth", () => ({ useAuth: () => mockAuth }));
jest.mock("../src/lib/haptics", () => ({ haptic: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ ...jest.requireActual("@react-navigation/native"), useFocusEffect: (effect: () => void | (() => void)) => jest.requireActual("react").useEffect(effect, [effect]), useRoute: () => ({ name: "Tour" }) }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { TourScreen } = require("../src/screens/auth/TourScreen");
const { FIRST_VISIT_KEY, closeFirstVisit, loadFirstVisit, useFirstVisit } = require("../src/lib/firstVisit");
/* eslint-enable @typescript-eslint/no-require-imports */

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const nav = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
const show = (params?: { replay?: boolean }) => render(<SafeAreaProvider initialMetrics={metrics}><TourScreen navigation={nav as never} route={{ key: "t", name: "Tour", params } as never} /></SafeAreaProvider>);
const stored = async () => JSON.parse((await AsyncStorage.getItem(FIRST_VISIT_KEY)) ?? "null");
const settle = () => act(async () => {});

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe("when it opens", () => {
  test("a first install starts the visit; a phone that finished or skipped it goes straight to the welcome screen", async () => {
    const first = renderHook(() => useFirstVisit(false));
    await waitFor(() => expect(first.result.current).toEqual({ seen: false, step: 0 }));
    await closeFirstVisit();
    const again = renderHook(() => useFirstVisit(false));
    await waitFor(() => expect(again.result.current).toEqual({ seen: true, step: 0 }));
  });

  test("an existing user after an update is never walked through: being signed in closes the visit for this phone", async () => {
    const view = renderHook(() => useFirstVisit(true));
    await waitFor(() => expect(view.result.current?.seen).toBe(true));
    expect(await stored()).toEqual({ seen: true, step: 0 });
    // …and signing out later does not bring it back.
    const out = renderHook(() => useFirstVisit(false));
    await waitFor(() => expect(out.result.current?.seen).toBe(true));
  });

  test("an unreadable or foreign stored value is read as a first visit, never as a crash", async () => {
    await AsyncStorage.setItem(FIRST_VISIT_KEY, JSON.stringify({ seen: "yes", step: 99 }));
    expect(await loadFirstVisit()).toEqual({ seen: false, step: 0 });
    await AsyncStorage.setItem(FIRST_VISIT_KEY, "{not json");
    expect(await loadFirstVisit()).toEqual({ seen: false, step: 0 });
  });
});

describe("the four stops", () => {
  test("it opens on the promise, shows where we are and that the figures are an example", async () => {
    show();
    await settle();
    expect(screen.getByText("Tes efforts deviennent une aventure.")).toBeTruthy();
    expect(screen.getByText("Démonstration")).toBeTruthy();
    expect(screen.getByLabelText("Visite guidée, étape 1 sur 4")).toBeTruthy();
    expect(screen.getByText("1 sur 4")).toBeTruthy();
    expect(screen.queryByTestId("tour-back")).toBeNull();
  });

  test("« Continuer » walks QG, Séance, Aventure, Profil, and the last stop leads to the welcome screen with sign-up, sign-in and discovery", async () => {
    show();
    await settle();
    const titles = ["Tes efforts deviennent une aventure.", "Une séance, une minute.", "Chaque effort fait avancer ton monde.", "Ton parcours t’appartient."];
    for (let i = 0; i < titles.length; i++) {
      expect(screen.getByText(titles[i]!)).toBeTruthy();
      if (i < titles.length - 1) fireEvent.press(screen.getByTestId("tour-next"));
    }
    expect(screen.getByText("Créer mon compte")).toBeTruthy();
    fireEvent.press(screen.getByTestId("tour-next"));
    expect(nav.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: "Welcome" }] });
    await waitFor(async () => expect(await stored()).toEqual({ seen: true, step: 0 }));
  });

  test("touching the ringed element moves on too, and the expedition stop only draws: its button adds a waypoint on the screen", async () => {
    show();
    await settle();
    fireEvent.press(screen.getByTestId("tour-target"));
    expect(screen.getByText("Une séance, une minute.")).toBeTruthy();
    fireEvent.press(screen.getByTestId("tour-target"));
    expect(screen.getByText("Chaque effort fait avancer ton monde.")).toBeTruthy();
    const lit = () => screen.getByTestId("live-expedition").props.accessibilityLabel as string;
    const before = lit();
    fireEvent.press(screen.getByTestId("tour-target"));
    expect(lit()).not.toBe(before);
    expect(screen.getByText("Chaque effort fait avancer ton monde.")).toBeTruthy();
  });

  test("the text about TITAN LIVE does not promise it to everyone", async () => {
    show();
    await settle();
    fireEvent.press(screen.getByTestId("tour-next"));
    fireEvent.press(screen.getByTestId("tour-next"));
    expect(screen.getByText(/TITAN LIVE.*il s’ouvre progressivement/)).toBeTruthy();
  });
});

describe("leaving, coming back", () => {
  test("« Passer » closes the visit for good and opens the welcome screen", async () => {
    show();
    await settle();
    fireEvent.press(screen.getByTestId("tour-skip"));
    expect(nav.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: "Welcome" }] });
    await waitFor(async () => expect((await stored()).seen).toBe(true));
  });

  test("an interrupted visit resumes at its stop", async () => {
    const first = show();
    await settle();
    fireEvent.press(screen.getByTestId("tour-next"));
    fireEvent.press(screen.getByTestId("tour-next"));
    await waitFor(async () => expect(await stored()).toEqual({ seen: false, step: 2 }));
    first.unmount();
    show();
    expect(await screen.findByText("Chaque effort fait avancer ton monde.")).toBeTruthy();
    expect(screen.getByText("3 sur 4")).toBeTruthy();
  });

  test("Android Back goes one stop back, and on the first stop it is left to the system", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listeners: ((...args: any[]) => boolean | null | undefined)[] = [];
    const spy = jest.spyOn(BackHandler, "addEventListener").mockImplementation((_e, fn) => { listeners.push(fn); return { remove: () => void listeners.splice(listeners.indexOf(fn), 1) }; });
    try {
      show();
      await settle();
      expect(listeners.at(-1)!()).toBe(false);
      fireEvent.press(screen.getByTestId("tour-next"));
      await settle();
      let handled: boolean | null | undefined;
      await act(async () => { handled = listeners.at(-1)!(); });
      expect(handled).toBe(true);
      expect(screen.getByText("Tes efforts deviennent une aventure.")).toBeTruthy();
      fireEvent.press(screen.getByTestId("tour-next"));
      fireEvent.press(screen.getByTestId("tour-back"));
      expect(screen.getByText("1 sur 4")).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  test("« Revoir la visite guidée » replays it without touching the stored state and closes by going back", async () => {
    await closeFirstVisit();
    show({ replay: true });
    await settle();
    expect(screen.getByText("1 sur 4")).toBeTruthy();
    for (let i = 0; i < 3; i++) fireEvent.press(screen.getByTestId("tour-next"));
    expect(screen.getByText("Terminer la visite")).toBeTruthy();
    fireEvent.press(screen.getByTestId("tour-next"));
    expect(nav.goBack).toHaveBeenCalled();
    expect(nav.reset).not.toHaveBeenCalled();
    expect(await stored()).toEqual({ seen: true, step: 0 });
  });
});

test("the whole visit creates nothing: no server call, no queued session, no account, and the only key written is its own", async () => {
  show();
  await settle();
  for (let i = 0; i < 2; i++) fireEvent.press(screen.getByTestId("tour-next"));
  for (let i = 0; i < 5; i++) fireEvent.press(screen.getByTestId("tour-target"));
  fireEvent.press(screen.getByTestId("tour-next"));
  fireEvent.press(screen.getByTestId("tour-next"));
  await waitFor(() => expect(nav.reset).toHaveBeenCalled());
  expect(mockServer).not.toHaveBeenCalled();
  expect(mockQueue).not.toHaveBeenCalled();
  expect(mockAuth.startDiscovery).not.toHaveBeenCalled();
  expect(mockAuth.signUp).not.toHaveBeenCalled();
  expect(mockAuth.signIn).not.toHaveBeenCalled();
  expect(await AsyncStorage.getAllKeys()).toEqual([FIRST_VISIT_KEY]);
});
