/* « Partager » (before V2): a session or a success becomes a 1080 × 1920 story picture in one of three styles, previewed before
   anything leaves the phone; the route is a shape without coordinates, its ends removed. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRef } from "react";
import type { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StoryCard } from "../src/components/StoryCard";
import { ToastProvider } from "../src/components/Toast";
import { buildStory, recordStory, sessionStory, ShareStory, type StoryRequest } from "../src/core/shareStory";
import type { RecordEntry } from "../src/core";
import type { TrainingLog } from "../src/core/types";
import { captureStory, saveStoryFile, shareStoryFile } from "../src/lib/storyExport";
import { toPlanar } from "../src/lib/storyRoute";
import { logs } from "../test-fixtures/data";

const mockCapture = jest.fn(async (_ref: unknown, _o: unknown) => "file:///cache/titan-story.png");
const mockAvailable = jest.fn(async () => true);
const mockShare = jest.fn(async (_uri: string, _o: unknown) => undefined);
const mockRoute = jest.fn(async (_owner: string, _id: string | null | undefined) => null as { segs: number[][][] } | null);
const mockSaf = {
  getUriForDirectoryInRoot: jest.fn((name: string) => `content://root/${name}`),
  requestDirectoryPermissionsAsync: jest.fn(async (_initial?: string) => ({ granted: true, directoryUri: "content://tree/Pictures" })),
  createFileAsync: jest.fn(async (dir: string, name: string, _mime: string) => `${dir}/${name}.png`),
  writeAsStringAsync: jest.fn(async (_uri: string, _data: string, _o: unknown) => undefined),
};
jest.mock("react-native-view-shot", () => ({ captureRef: (r: unknown, o: unknown) => mockCapture(r, o) }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: () => mockAvailable(), shareAsync: (u: string, o: unknown) => mockShare(u, o) }));
jest.mock("expo-file-system/legacy", () => ({
  EncodingType: { Base64: "base64", UTF8: "utf8" },
  readAsStringAsync: jest.fn(async () => "iVBORw0KGgo="),
  get StorageAccessFramework() {
    return mockSaf;
  },
}));
jest.mock("../src/data/hooks", () => ({ ...jest.requireActual("../src/data/hooks"), useProfile: () => ({ data: { username: "Athlète Test" } }) }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a", useAuth: () => ({ owner: "owner-a" }) }));
jest.mock("../src/lib/storyRoute", () => ({ ...jest.requireActual("../src/lib/storyRoute"), storyRoute: (o: string, id: string | null | undefined) => mockRoute(o, id) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockRoute.mockResolvedValue(null);
});

const gpsLog: TrainingLog = {
  ...logs[0]!,
  id: "gps-1",
  client_event_id: "evt-gps-1",
  syncStatus: "confirmed",
  xp: 594,
  details: { ...logs[0]!.details, elevation: 120, note: "Rue des Granges, genou raide", gpxStats: { ascent: 120 }, hasGpx: true, heartRate: 168 } as TrainingLog["details"],
};
const loop = { segs: [[[0, 0], [900, 60], [950, 1300], [2200, 1250], [2300, 2100], [3100, 2350], [3300, 900], [2100, 300]]] };
const allText = () => screen.getAllByText(/.*/, { includeHiddenElements: true }).map((n) => String(n.props.children)).join(" | ");

describe("what a session card may show", () => {
  test("a confirmed GPS run: measures, no reward, never the place, the note, the heart rate or the perceived effort", () => {
    const input = sessionStory(gpsLog, { logs: [gpsLog], name: "Athlète Test" });
    expect(input.routeEventId).toBe("evt-gps-1");
    const model = buildStory({ kind: "session", input: { ...input, route: loop } });
    render(<StoryCard model={model} style="champ" width={360} />);
    const text = allText();
    expect(text).toContain("10");
    expect(text).toContain("titan-app.fr");
    for (const secret of ["Granges", "genou", "168", "6/10", "Athlète Test", "XP", "Niveau"]) expect(text).not.toContain(secret);
    expect(JSON.stringify(model.route)).not.toMatch(/4\d\.\d{3}/);
  });

  test("the name only once ticked; every style draws the same values", () => {
    const input = sessionStory(gpsLog, { logs: [], name: "Athlète Test" });
    expect(buildStory({ kind: "session", input }).name).toBeNull();
    expect(buildStory({ kind: "session", input }, { name: true }).name).toBe("Athlète Test");
    for (const style of ShareStory.STYLES) {
      const plan = ShareStory.layout(buildStory({ kind: "session", input }, { style }), style);
      expect(plan.ops.some((o) => o.t === "text" && o.text === "titan-app.fr")).toBe(true);
    }
  });

  test("a manual session without distance and a climbing session draw only what was entered", () => {
    const yoga = sessionStory({ ...logs[0]!, id: "y", sport: "yoga", unit: "min", val: 40, details: { duration: 40 } }, { logs: [] });
    const m = buildStory({ kind: "session", input: yoga });
    expect(m.hero?.label).toBe("Durée");
    expect(m.facts.find(([k]) => k === "Distance")).toBeUndefined();
    const climb = buildStory({ kind: "session", input: sessionStory(logs[3]!, { logs: [] }) });
    expect(JSON.stringify(climb)).not.toContain("Salle");
  });

  test("a record of the Records screen becomes a success card with its previous step", () => {
    const r = { id: "r1", kind: "distance", sport: "running", label: "Plus longue distance", value: 12.1, unit: "km", log: gpsLog, context: "" } as RecordEntry;
    const model = buildStory({ kind: "achievement", input: recordStory(r, { previous: 10.3 }) });
    expect(model.tone).toBe("amber");
    expect(model.progress).toMatch(/^avant : 10,3/);
    expect(buildStory({ kind: "achievement", input: recordStory(r) }).progress).toBe("Premier repère");
  });

  test("the route handed to the card is planar metres from its south-west corner, not coordinates", () => {
    const shape = toPlanar({ rejected: 0, segs: [[{ lat: 47.2378, lon: 6.0241, alt: null, altAcc: null, acc: 5, t: 0 }, { lat: 47.2468, lon: 6.0341, alt: null, altAcc: null, acc: 5, t: 1 }]] });
    expect(shape!.segs[0]![0]).toEqual([0, 0]);
    expect(shape!.segs[0]![1]![1]).toBeGreaterThan(900);
    expect(JSON.stringify(shape)).not.toMatch(/47\.|6\.02/);
  });
});

describe("export on Android", () => {
  test("the capture is a 1080 × 1920 PNG and the share sheet receives it as image/png", async () => {
    const ref = createRef<View>();
    render(<StoryCard ref={ref} model={buildStory({ kind: "session", input: sessionStory(gpsLog, { logs: [] }) })} style="feuille" width={384} />);
    const uri = await captureStory(ref);
    expect(mockCapture.mock.calls[0]![1]).toMatchObject({ format: "png", width: 1080, height: 1920, result: "tmpfile" });
    await shareStoryFile(uri, "Partager ma séance");
    expect(mockShare).toHaveBeenCalledWith("file:///cache/titan-story.png", expect.objectContaining({ mimeType: "image/png" }));
  });

  test("no share target on the device: a clear error that points to saving", async () => {
    mockAvailable.mockResolvedValueOnce(false);
    await expect(shareStoryFile("file:///x.png", "t")).rejects.toThrow(/Enregistrer/);
  });

  test("saving asks for a folder once, writes the PNG there, and asks again when that folder is gone", async () => {
    const mem = new Map<string, string>();
    const store = { get: async (k: string) => mem.get(k) ?? null, set: async (k: string, v: string) => void mem.set(k, v), remove: async (k: string) => void mem.delete(k) };
    expect(await saveStoryFile("file:///cache/a.png", "titan-seance.png", store)).toBe("content://tree/Pictures/titan-seance.png");
    expect(mockSaf.createFileAsync).toHaveBeenCalledWith("content://tree/Pictures", "titan-seance", "image/png");
    await saveStoryFile("file:///cache/a.png", "titan-seance.png", store);
    expect(mockSaf.requestDirectoryPermissionsAsync).toHaveBeenCalledTimes(1);
    mockSaf.createFileAsync.mockRejectedValueOnce(new Error("revoked"));
    await saveStoryFile("file:///cache/a.png", "titan-seance.png", store);
    expect(mockSaf.requestDirectoryPermissionsAsync).toHaveBeenCalledTimes(2);
  });

  test("closing the folder picker is a cancellation, not an error", async () => {
    mockSaf.requestDirectoryPermissionsAsync.mockResolvedValueOnce({ granted: false } as never);
    const store = { get: async () => null, set: async () => {}, remove: async () => {} };
    expect(await saveStoryFile("file:///cache/a.png", "titan-succes.png", store)).toBeNull();
    expect(mockSaf.writeAsStringAsync).not.toHaveBeenCalled();
  });
});

describe("the preview screen", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ShareStoryScreen } = require("../src/screens/share/ShareStoryScreen");
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
  const nav = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() };
  const open = (params: StoryRequest) =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}>
        <SafeAreaProvider initialMetrics={metrics}>
          <ToastProvider>
            <ShareStoryScreen navigation={nav} route={{ key: "k", name: "ShareStory", params }} />
          </ToastProvider>
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  const request: StoryRequest = { kind: "session", input: sessionStory(gpsLog, { logs: [gpsLog], name: "Athlète Test" }) };

  test("the route arrives, is drawn by default and can be removed; the name is hidden until ticked", async () => {
    mockRoute.mockResolvedValue(loop);
    open(request);
    await waitFor(() => expect(screen.getByTestId("story-option-route")).toBeTruthy());
    expect(mockRoute).toHaveBeenCalledWith("owner-a", "evt-gps-1");
    expect(allText()).not.toContain("Athlète Test");
    fireEvent.press(screen.getByTestId("story-option-name"));
    expect(allText()).toContain("Athlète Test");
    expect(screen.getByText(/Jamais dessus : fond de carte, coordonnées/)).toBeTruthy();
  });

  test("the three styles are offered; the week is a choice of Champ and Feuille only", async () => {
    open(request);
    for (const label of ["Champ", "Feuille", "Carnet"]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByTestId("story-option-week")).toBeTruthy();
    fireEvent.press(screen.getByText("Carnet"));
    await waitFor(() => expect(screen.queryByTestId("story-option-week")).toBeNull());
  });

  test("sharing captures once and opens the share sheet; nothing is claimed as published", async () => {
    open(request);
    fireEvent.press(screen.getByTestId("story-share"));
    await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(1));
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/publiée|publié !/)).toBeNull();
    fireEvent.press(screen.getByTestId("story-share"));
    await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(2));
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  test("a failed capture shows an error with a retry that works", async () => {
    mockCapture.mockRejectedValueOnce(new Error("boom"));
    open(request);
    fireEvent.press(screen.getByTestId("story-share"));
    await waitFor(() => expect(screen.getByTestId("story-error")).toBeTruthy());
    expect(mockShare).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("story-retry"));
    await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("story-error")).toBeNull();
  });

  test("inviting a friend is a separate action that opens the existing invitation sheet", () => {
    open({ kind: "achievement", input: { type: "milestone", title: "Ma 100e séance", value: "100" } });
    expect(screen.queryByTestId("story-option-route")).toBeNull();
    fireEvent.press(screen.getByTestId("story-invite"));
    expect(nav.navigate).toHaveBeenCalledWith("Community", { sheet: "invite" });
  });
});
