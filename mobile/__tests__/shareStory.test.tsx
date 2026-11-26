/* « Partager » (before V2): a session or a success becomes a 1080 × 1920 story picture, previewed before anything leaves the phone. */
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
import { logs } from "../test-fixtures/data";

const mockCapture = jest.fn(async (_ref: unknown, _o: unknown) => "file:///cache/titan-story.png");
const mockAvailable = jest.fn(async () => true);
const mockShare = jest.fn(async (_uri: string, _o: unknown) => undefined);
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

beforeEach(() => jest.clearAllMocks());

const gpsLog: TrainingLog = {
  ...logs[0],
  id: "gps-1",
  syncStatus: "confirmed",
  xp: 594,
  details: { ...logs[0].details, elevation: 120, note: "Rue des Granges, genou raide", gpxStats: { ascent: 120 }, route: [[47.2378, 6.0241]], heartRate: 168 } as TrainingLog["details"],
};

const allText = () => screen.getAllByText(/.*/, { includeHiddenElements: true }).map((n) => String(n.props.children)).join(" | ");

describe("what a session card may show", () => {
  test("a confirmed GPS run: measures and XP, never the trace, the place, the note or the heart rate", () => {
    const input = sessionStory(gpsLog, { logs: [gpsLog], name: "Athlète Test", receipt: { xp: 594, level_after: 7 } });
    const model = buildStory({ kind: "session", input });
    render(<StoryCard model={model} width={360} sportId={input.sportId} />);
    const text = allText();
    expect(text).toContain("10 km");
    expect(text).toContain("Distance");
    expect(text).toContain("XP");
    expect(text).toContain("Niveau 7");
    expect(text).toContain("titan-app.fr");
    for (const secret of ["Granges", "genou", "47.23", "6.02", "168", "6/10", "Athlète Test"]) expect(text).not.toContain(secret);
  });

  test("a pending or held session carries no XP; the name only once ticked", () => {
    expect(sessionStory({ ...gpsLog, syncStatus: "pending" }, { logs: [] }).xp).toBeNull();
    expect(sessionStory(gpsLog, { logs: [], receipt: { xp: 594, reward_held: true } }).xp).toBeNull();
    const input = sessionStory(gpsLog, { logs: [], name: "Athlète Test" });
    expect(buildStory({ kind: "session", input }).name).toBeNull();
    expect(buildStory({ kind: "session", input }, { name: true }).name).toBe("Athlète Test");
  });

  test("a manual session without distance and a climbing session draw only what was entered", () => {
    const yoga = sessionStory({ ...logs[0], id: "y", sport: "yoga", unit: "min", val: 40, details: { duration: 40 } }, { logs: [] });
    const m = buildStory({ kind: "session", input: yoga });
    expect(m.hero?.label).toBe("Durée");
    expect(m.facts.find(([k]) => k === "Distance")).toBeUndefined();
    const climb = buildStory({ kind: "session", input: sessionStory(logs[3], { logs: [] }) });
    expect(JSON.stringify(climb)).not.toContain("Salle");
  });

  test("a record of the Records screen becomes a success card with its previous step", () => {
    const r = { id: "r1", kind: "distance", sport: "running", label: "Plus longue distance", value: 12.1, unit: "km", log: gpsLog, context: "" } as RecordEntry;
    const model = buildStory({ kind: "achievement", input: recordStory(r, { previous: 10.3 }) });
    expect(model.eyebrow).toBe("Record personnel · Course à pied");
    expect(model.progress).toMatch(/^avant : 10,3/);
    expect(buildStory({ kind: "achievement", input: recordStory(r) }).progress).toBe("Premier repère");
  });
});

describe("export on Android", () => {
  test("the capture is a 1080 × 1920 PNG and the share sheet receives it as image/png", async () => {
    const ref = createRef<View>();
    render(<StoryCard ref={ref} model={buildStory({ kind: "session", input: sessionStory(gpsLog, { logs: [] }) })} width={384} />);
    const uri = await captureStory(ref);
    expect(mockCapture.mock.calls[0][1]).toMatchObject({ format: "png", width: 1080, height: 1920, result: "tmpfile" });
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
    expect(mockSaf.requestDirectoryPermissionsAsync).toHaveBeenCalledTimes(1);
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
      <QueryClientProvider client={new QueryClient()}>
        <SafeAreaProvider initialMetrics={metrics}>
          <ToastProvider>
            <ShareStoryScreen navigation={nav} route={{ key: "k", name: "ShareStory", params }} />
          </ToastProvider>
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  const request: StoryRequest = { kind: "session", input: sessionStory(gpsLog, { logs: [gpsLog], name: "Athlète Test", receipt: { xp: 594, level_after: 7 } }) };

  test("the name is hidden until ticked; the XP and the date can be hidden", () => {
    open(request);
    expect(allText()).not.toContain("Athlète Test");
    fireEvent.press(screen.getByTestId("story-option-name"));
    expect(allText()).toContain("Athlète Test");
    expect(allText()).toContain("Niveau 7");
    fireEvent.press(screen.getByTestId("story-option-xp"));
    expect(allText()).not.toContain("Niveau 7");
    expect(screen.getByText(/Jamais sur l’image : tracé GPS/)).toBeTruthy();
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
    expect(screen.queryByTestId("story-option-xp")).toBeNull();
    fireEvent.press(screen.getByTestId("story-invite"));
    expect(nav.navigate).toHaveBeenCalledWith("Community", { sheet: "invite" });
  });
});

test("the shared module is the website's (sizes and margins of the story)", () => {
  expect(ShareStory.SIZE).toEqual({ width: 1080, height: 1920 });
  expect(ShareStory.SAFE.top).toBeGreaterThanOrEqual(220);
});
