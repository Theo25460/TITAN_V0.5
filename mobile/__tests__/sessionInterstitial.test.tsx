/* After-session advertising from the result screen: counted only when confirmed, shown only when ready and every ceiling allows,
   never delaying the user, recorded so the next one respects the gap. SDK, storage and rights are faked. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

process.env.EXPO_PUBLIC_TITAN_ADS = "1";
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("react-native").Platform.OS = "android";

const mockDisk = new Map<string, unknown>();
const mockRights = { is_elite: false };
const mockAds = { phase: "ready", canRequestAds: true, privacyOptions: false };
const mockInter = { prepare: jest.fn(), ready: true, show: jest.fn(async () => true) };
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/data/hooks", () => ({ useProfile: () => ({ data: mockRights }) }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true }));
jest.mock("../src/lib/gpsNative", () => ({ recorder: { load: async () => null, subscribe: () => () => undefined } }));
jest.mock("../src/lib/storage", () => ({
  ownerKey: (s: string, o: string) => `${s}:${o}`,
  readJSON: async (k: string, d: unknown) => (mockDisk.has(k) ? JSON.parse(JSON.stringify(mockDisk.get(k))) : d),
  writeJSON: async (k: string, v: unknown) => void mockDisk.set(k, JSON.parse(JSON.stringify(v))),
}));
jest.mock("../src/ads/sdk", () => ({
  adsManager: { subscribe: () => () => undefined, get: () => mockAds, start: () => Promise.resolve() },
  sessionInterstitial: { prepare: () => mockInter.prepare(), isReady: () => mockInter.ready, show: () => mockInter.show() },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { useSessionInterstitial } = require("../src/ads/useSessionInterstitial");
/* eslint-enable @typescript-eslint/no-require-imports */

function Probe({ id, confirmed = true, countable = true, onResult }: { id: string; confirmed?: boolean; countable?: boolean; onResult: (v: boolean) => void }) {
  const go = useSessionInterstitial(id, confirmed, countable);
  return (
    <Pressable testID="done" onPress={() => go().then(onResult)}>
      <Text>Terminer</Text>
    </Pressable>
  );
}
const state = () => mockDisk.get("ads:owner-a") as { sessions: number; today: number; lastShownSession: number } | undefined;
async function finishSession(id: string, over: Partial<{ confirmed: boolean; countable: boolean }> = {}) {
  const results: boolean[] = [];
  const view = render(<Probe id={id} {...over} onResult={(v) => results.push(v)} />);
  await act(async () => {});
  await act(async () => void fireEvent.press(screen.getByTestId("done")));
  await waitFor(() => expect(results.length).toBe(1));
  view.unmount();
  return results[0];
}

beforeEach(() => {
  mockDisk.clear();
  Object.assign(mockRights, { is_elite: false });
  Object.assign(mockAds, { phase: "ready", canRequestAds: true });
  mockInter.ready = true;
  mockInter.prepare.mockClear();
  mockInter.show.mockClear();
});

test("the first sessions are discovery: counted, nothing shown, nothing preloaded", async () => {
  for (const id of ["s1", "s2"]) expect(await finishSession(id)).toBe(false);
  expect(state()?.sessions).toBe(2);
  expect(mockInter.show).not.toHaveBeenCalled();
  expect(mockInter.prepare).not.toHaveBeenCalled();
});

test("from the third session: preloaded in the background, shown at Terminer, then not again for five sessions", async () => {
  for (const id of ["s1", "s2"]) await finishSession(id);
  expect(await finishSession("s3")).toBe(true);
  expect(mockInter.prepare).toHaveBeenCalled();
  expect(state()).toMatchObject({ sessions: 3, today: 1, lastShownSession: 3 });
  for (const id of ["s4", "s5", "s6", "s7"]) expect(await finishSession(id)).toBe(false);
  expect(mockInter.show).toHaveBeenCalledTimes(1);
});

test("a session reported twice (re-render, reopened result) counts once", async () => {
  await finishSession("same");
  await finishSession("same");
  expect(state()?.sessions).toBe(1);
});

test("not confirmed (queued/failed save) or historical: not counted and never shown", async () => {
  for (const id of ["a", "b", "c"]) await finishSession(id);
  mockInter.show.mockClear();
  expect(await finishSession("q1", { confirmed: false })).toBe(false);
  expect(await finishSession("h1", { countable: false })).toBe(false);
  expect(state()?.sessions).toBe(3);
  expect(mockInter.show).not.toHaveBeenCalled();
});

test("Premium never sees one, and an ad that is not ready is skipped without waiting", async () => {
  Object.assign(mockRights, { is_elite: true });
  for (const id of ["a", "b", "c", "d"]) expect(await finishSession(id)).toBe(false);
  expect(mockInter.show).not.toHaveBeenCalled();
  Object.assign(mockRights, { is_elite: false });
  mockInter.ready = false;
  expect(await finishSession("e")).toBe(false);
  expect(mockInter.show).not.toHaveBeenCalled();
});

test("without consent no ad is requested", async () => {
  Object.assign(mockAds, { canRequestAds: false });
  for (const id of ["a", "b", "c", "d"]) expect(await finishSession(id)).toBe(false);
  expect(mockInter.prepare).not.toHaveBeenCalled();
});

test("a show that throws is swallowed: the user just leaves", async () => {
  for (const id of ["a", "b"]) await finishSession(id);
  mockInter.show.mockRejectedValueOnce(new Error("sdk"));
  expect(await finishSession("c")).toBe(false);
});
