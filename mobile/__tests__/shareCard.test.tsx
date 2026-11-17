/* AUD-21: a proud moment becomes a 1080×1920 story picture shared through Android's sheet; TITAN uploads nothing. */
import { render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import type { View } from "react-native";
import { ShareCard } from "../src/components/ShareCard";
import { shareCardImage } from "../src/lib/shareImage";

const mockCapture = jest.fn(async (_ref: unknown, _o: unknown) => "file:///tmp/card.png");
const mockAvailable = jest.fn(async () => true);
const mockShare = jest.fn(async (_uri: string, _o: unknown) => undefined);
jest.mock("react-native-view-shot", () => ({ captureRef: (r: unknown, o: unknown) => mockCapture(r, o) }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: () => mockAvailable(), shareAsync: (u: string, o: unknown) => mockShare(u, o) }));

const data = { eyebrow: "Nouveau record", title: "Course à pied", value: "12,1 km", caption: "Plus longue distance · avant : 10,3 km", facts: [["Durée", "1:05:12"], ["Allure", "5:23 /km"]] as [string, string][], icon: "run" as const, week: { done: 2, target: 3 }, record: true };

beforeEach(() => jest.clearAllMocks());

test("the card shows the moment, the week and the site address", () => {
  render(<ShareCard data={data} />);
  expect(screen.getByText("12,1 km", { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByText("Ma semaine · 2/3 jours actifs", { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByText("titan-app.fr", { includeHiddenElements: true })).toBeTruthy();
});

test("sharing captures a 1080×1920 PNG and opens the share sheet", async () => {
  const ref = createRef<View>();
  render(<ShareCard ref={ref} data={data} />);
  await shareCardImage(ref);
  expect(mockCapture.mock.calls[0][1]).toMatchObject({ format: "png", width: 1080, height: 1920 });
  expect(mockShare).toHaveBeenCalledWith("file:///tmp/card.png", expect.objectContaining({ mimeType: "image/png" }));
});

test("no share sheet on the device: a clear error, nothing captured", async () => {
  mockAvailable.mockResolvedValueOnce(false);
  const ref = createRef<View>();
  render(<ShareCard ref={ref} data={data} />);
  await expect(shareCardImage(ref)).rejects.toThrow(/pas disponible/);
  expect(mockCapture).not.toHaveBeenCalled();
});
