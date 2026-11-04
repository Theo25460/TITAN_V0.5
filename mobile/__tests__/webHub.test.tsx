import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { WEB_FEATURES, webUrl } from "../src/lib/webHub";
import { WebHubScreen } from "../src/screens/settings/WebHubScreen";

const metrics = { frame: { x: 0, y: 0, width: 360, height: 740 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };

test("every website-only feature keeps a door in the app, opening the real site page", () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  render(<SafeAreaProvider initialMetrics={metrics}><WebHubScreen /></SafeAreaProvider>);
  expect(WEB_FEATURES.length).toBeGreaterThanOrEqual(4);
  fireEvent.press(screen.getByTestId("web-coaching"));
  expect(open).toHaveBeenCalledWith("https://titan-app.fr/coaching");
  expect(webUrl("stats")).toBe("https://titan-app.fr/stats");
  for (const f of WEB_FEATURES) expect(f.path.startsWith("/")).toBe(true);
  open.mockRestore();
});
