/* Séance tab (V1.3.1): the ways to record are all visible — by hand, GPS, GPX file, watch — and what waits on the phone is said first. */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const mockNavigate = jest.fn();
let mockItems: { status: "pending" | "error"; payload: object }[] = [];
jest.mock("@react-navigation/native", () => ({ ...jest.requireActual("@react-navigation/native"), useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/data/drafts", () => ({ useDraftSport: () => null }));
jest.mock("../src/data/queue", () => ({ useQueue: () => ({ owner: "owner-a", items: mockItems }) }));
jest.mock("../src/data/hooks", () => ({ usePrefs: () => ({ favoriteSports: ["running"] }), useLogs: () => ({ active: [] }) }));
jest.mock("../src/lib/haptics", () => ({ haptic: jest.fn() }));

import { RecordScreen } from "../src/screens/session/RecordScreen";

const show = () => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } }}><RecordScreen /></SafeAreaProvider>);
beforeEach(() => { mockItems = []; mockNavigate.mockClear(); });

test("manual entry stays first, and GPS, GPX and watch each have a labelled entry", () => {
  show();
  expect(screen.getByTestId("record-choose-sport")).toBeTruthy();
  fireEvent.press(screen.getByTestId("sport-running"));
  expect(mockNavigate).toHaveBeenLastCalledWith("SessionForm", { sport: "running" });
  fireEvent.press(screen.getByTestId("gps-shortcut"));
  expect(mockNavigate).toHaveBeenLastCalledWith("GpsRecord", { sport: "running" });
  // The GPX import lives in the form of a distance sport: the entry says so and opens that form.
  expect(screen.getByTestId("record-gpx").props.accessibilityLabel).toMatch(/Importer un fichier GPX.*bouton d’import/);
  fireEvent.press(screen.getByTestId("record-gpx"));
  expect(mockNavigate).toHaveBeenLastCalledWith("SessionForm", { sport: "running" });
  fireEvent.press(screen.getByTestId("record-sources"));
  expect(mockNavigate).toHaveBeenLastCalledWith("Sources");
  // Nothing waits: no pending line.
  expect(screen.queryByTestId("record-pending")).toBeNull();
});

test("a session kept on the phone is announced without any XP claim, and opens the pending list", () => {
  mockItems = [{ status: "pending", payload: {} }];
  show();
  const line = screen.getByTestId("record-pending");
  expect(line.props.accessibilityLabel).toMatch(/1 séance en attente d’envoi/);
  expect(screen.getByText(/Aucune XP avant la confirmation/)).toBeTruthy();
  fireEvent.press(line);
  expect(mockNavigate).toHaveBeenLastCalledWith("Pending");
});

test("a refused session is named as such, with its way out", () => {
  mockItems = [{ status: "error", payload: {} }, { status: "pending", payload: {} }];
  show();
  expect(screen.getByTestId("record-pending").props.accessibilityLabel).toMatch(/1 séance refusée par le serveur.*corriger ou renvoyer/);
});
