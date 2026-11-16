/* AUD-30: one spoken split per whole kilometre, in French, pace or speed according to the sport. */
jest.mock("expo-speech", () => ({ speak: jest.fn(), stop: jest.fn() }));
import { splitAnnouncement } from "../src/lib/voiceCoach";

test("nothing until a new whole kilometre is reached", () => {
  expect(splitAnnouncement(0, 0.98, 300, "pace")).toBeNull();
  expect(splitAnnouncement(1.02, 1.6, 500, "pace")).toBeNull();
});

test("a running split gives the time and the pace per kilometre", () => {
  expect(splitAnnouncement(0.99, 1.0, 333, "pace")).toBe("1 kilomètre, en 5 minutes 33, allure 5 minutes 33 au kilomètre.");
  expect(splitAnnouncement(2.98, 3.01, 1000, "pace")).toMatch(/^3 kilomètres, en 16 minutes 40, allure 5 minutes 32 au kilomètre\.$/);
});

test("a cycling split gives the average speed", () => {
  expect(splitAnnouncement(9.9, 10.0, 1200, "speed")).toBe("10 kilomètres, en 20 minutes, 30 kilomètres heure de moyenne.");
});
