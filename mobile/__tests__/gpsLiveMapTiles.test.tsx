/* V1.7.7 — the base map under a GPS outing: tiles and their attribution appear only when the build carries a tile provider AND
   the athlete turned the base map on. The provider is set here before the modules are loaded, as a build would. */
process.env.EXPO_PUBLIC_TITAN_TILES_URL = "https://tiles.example.test/{z}/{x}/{y}.png";
process.env.EXPO_PUBLIC_TITAN_TILES_ATTRIBUTION = "© Contributeurs Exemple";

/* eslint-disable @typescript-eslint/no-require-imports */
const { render } = require("@testing-library/react-native") as typeof import("@testing-library/react-native");
const { Image } = require("react-native");
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { GpsLiveMap } = require("../src/components/GpsLiveMap") as typeof import("../src/components/GpsLiveMap");
const { GpsSettingsSheet } = require("../src/components/GpsSheets") as typeof import("../src/components/GpsSheets");
const { DEFAULT_GPS_PREFS } = require("../src/lib/gpsPrefs") as typeof import("../src/lib/gpsPrefs");
/* eslint-enable @typescript-eslint/no-require-imports */

const segs = [[{ lat: 48.58, lon: 7.7 }, { lat: 48.59, lon: 7.71 }]];

test("no tile is requested without the opt-in; with it, tiles are drawn under the trace with the provider's attribution", () => {
  const off = render(<GpsLiveMap segs={segs} sport="cycling" accessibilityLabel="Carte" mode="overview" height={220} basemap={false} />);
  expect(off.UNSAFE_queryAllByType(Image)).toHaveLength(0);
  expect(off.getByText("Fond neutre : trace et position seulement")).toBeTruthy();
  off.unmount();
  const on = render(<GpsLiveMap segs={segs} sport="cycling" accessibilityLabel="Carte" mode="overview" height={220} basemap />);
  const tiles = on.UNSAFE_queryAllByType(Image);
  expect(tiles.length).toBeGreaterThan(0);
  expect(tiles[0]!.props.source.uri).toMatch(/^https:\/\/tiles\.example\.test\/\d+\/\d+\/\d+\.png$/);
  expect(on.getByText("© Contributeurs Exemple")).toBeTruthy();
  expect(on.queryByText("Fond neutre : trace et position seulement")).toBeNull();
});

test("with a provider in the build, the settings offer the base map switch and say what turning it on reveals", () => {
  const onBasemap = jest.fn();
  const view = render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <GpsSettingsSheet visible onClose={() => {}} sport="cycling" prefs={DEFAULT_GPS_PREFS} onPrefs={() => {}} basemap={false} onBasemap={onBasemap} voice onVoice={() => {}} />
    </SafeAreaProvider>,
  );
  expect(view.getByText(/Le fournisseur de tuiles voit alors la zone regardée/)).toBeTruthy();
  expect(view.queryByTestId("gps-basemap-off")).toBeNull();
  const { fireEvent } = require("@testing-library/react-native") as typeof import("@testing-library/react-native"); // eslint-disable-line @typescript-eslint/no-require-imports
  fireEvent.press(view.getByTestId("gps-basemap"));
  expect(onBasemap).toHaveBeenCalledWith(true);
});
