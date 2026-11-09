import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { shareTextFile } from "../src/lib/exportFile";

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/", EncodingType: { UTF8: "utf8" }, writeAsStringAsync: jest.fn(),
}));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

test("GPX export writes the supplied XML and passes a local GPX to the share sheet", async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  const gpx = '<gpx><trk><trkseg><trkpt lat="45" lon="6"/></trkseg></trk></gpx>';
  await shareTextFile("sortie.gpx", gpx, "application/gpx+xml");
  expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith("file:///cache/sortie.gpx", gpx, { encoding: "utf8" });
  expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/sortie.gpx", { mimeType: "application/gpx+xml", dialogTitle: "sortie.gpx" });
});

test("an unavailable share sheet or invalid filename leaves no GPX copy in cache", async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
  await expect(shareTextFile("sortie.gpx", "private trace", "application/gpx+xml")).rejects.toThrow("partage de fichiers");
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  await expect(shareTextFile("../sortie.gpx", "private trace", "application/gpx+xml")).rejects.toThrow("Nom de fichier");
  expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});
