import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootNavigator } from "../src/navigation/RootNavigator";
import { Tabs } from "../src/navigation/Tabs";

let mockReduceMotion = false;
const mockStackOptions = jest.fn();
const mockStackScreen = jest.fn();
const mockTabOptions = jest.fn();

jest.mock("../src/lib/motion", () => ({ ...jest.requireActual("../src/lib/motion"), useReducedMotion: () => mockReduceMotion }));
jest.mock("../src/data/auth", () => ({ useAuth: () => ({ owner: "a", status: "signedIn" }) }));
jest.mock("../src/data/hooks", () => ({ useProfile: () => ({ data: null }) }));
jest.mock("../src/data/queue", () => ({ useQueue: () => ({ items: [] }) }));
jest.mock("../src/lib/reminders", () => ({}));
jest.mock("@react-navigation/native-stack", () => ({ createNativeStackNavigator: () => ({
  Navigator: ({ screenOptions, children }: { screenOptions: unknown; children: React.ReactNode }) => { mockStackOptions(screenOptions); return children; },
  Screen: ({ name, options }: { name: string; options: unknown }) => { mockStackScreen(name, options); return null; },
}) }));
jest.mock("@react-navigation/bottom-tabs", () => ({ createBottomTabNavigator: () => ({
  Navigator: ({ screenOptions }: { screenOptions: (p: { route: { name: string } }) => unknown }) => { mockTabOptions(screenOptions({ route: { name: "QG" } })); return null; },
  Screen: () => null,
}) }));

const metrics = { frame: { x: 0, y: 0, width: 320, height: 480 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const navigation = <SafeAreaProvider initialMetrics={metrics}><RootNavigator /><Tabs /></SafeAreaProvider>;

test("the Android reduced-motion preference disables stack, tab and session-result transitions", () => {
  mockReduceMotion = false;
  const rendered = render(navigation);
  expect(mockStackOptions).toHaveBeenLastCalledWith(expect.objectContaining({ animation: expect.not.stringMatching(/^none$/) }));
  expect(mockTabOptions).toHaveBeenLastCalledWith(expect.objectContaining({ animation: expect.not.stringMatching(/^none$/) }));

  mockReduceMotion = true;
  rendered.rerender(<SafeAreaProvider initialMetrics={metrics}><RootNavigator /><Tabs /></SafeAreaProvider>);
  expect(mockStackOptions).toHaveBeenLastCalledWith(expect.objectContaining({ animation: "none" }));
  expect(mockTabOptions).toHaveBeenLastCalledWith(expect.objectContaining({ animation: "none" }));
  expect(mockStackScreen).toHaveBeenCalledWith("SessionResult", expect.objectContaining({ animation: "none" }));
});
