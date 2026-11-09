import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { shareTextFile } from "../src/lib/exportFile";

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/", EncodingType: { UTF8: "utf8" }, writeAsStringAsync: jest.fn(),
  readDirectoryAsync: jest.fn(async () => []), makeDirectoryAsync: jest.fn(), deleteAsync: jest.fn(),
}));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock("expo-crypto", () => {
  let sequence = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}` };
});

beforeEach(() => jest.clearAllMocks());

test("GPX export writes the supplied XML and passes a local GPX to the share sheet", async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  const gpx = '<gpx><trk><trkseg><trkpt lat="45" lon="6"/></trkseg></trk></gpx>';
  await shareTextFile("sortie.gpx", gpx, "application/gpx+xml");
  const [[first]] = jest.mocked(FileSystem.writeAsStringAsync).mock.calls;
  expect(first).toMatch(/^file:\/\/\/cache\/titan-exports\/[^/]+\/sortie\.gpx$/);
  expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(first, gpx, { encoding: "utf8" });
  expect(Sharing.shareAsync).toHaveBeenCalledWith(first, { mimeType: "application/gpx+xml", dialogTitle: "sortie.gpx" });
  await shareTextFile("sortie.gpx", "<gpx/>", "application/gpx+xml");
  const [, [second]] = jest.mocked(FileSystem.writeAsStringAsync).mock.calls;
  expect(second).not.toBe(first);
  expect(second).toMatch(/\/sortie\.gpx$/);
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
});

test("expired export copies are purged without deleting recent shares", async () => {
  const suffix = "-00000000-0000-4000-8000-000000000099";
  const old = `${Date.now() - 48 * 3600000}${suffix}`;
  jest.mocked(FileSystem.readDirectoryAsync).mockResolvedValueOnce([old, `${Date.now()}${suffix}`, "unrelated"]);
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  await shareTextFile("sortie.gpx", "<gpx/>", "application/gpx+xml");
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`file:///cache/titan-exports/${old}`, { idempotent: true });
});

test("an unavailable share sheet or invalid filename leaves no GPX copy in cache", async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
  await expect(shareTextFile("sortie.gpx", "private trace", "application/gpx+xml")).rejects.toThrow("partage de fichiers");
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  await expect(shareTextFile("../sortie.gpx", "private trace", "application/gpx+xml")).rejects.toThrow("Nom de fichier");
  expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});
