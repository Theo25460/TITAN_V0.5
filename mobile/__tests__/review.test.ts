/* AUD-13: the Play rating request is rare and only at a proud moment. */
const mockAvailable = jest.fn(async () => true);
const mockRequest = jest.fn(async () => undefined);
jest.mock("expo-store-review", () => ({ isAvailableAsync: () => mockAvailable(), requestReview: () => mockRequest() }));
const mockStore = new Map<string, unknown>();
jest.mock("../src/lib/storage", () => ({
  ownerKey: (scope: string, owner: string) => `titan.${scope}.v1:${owner}`,
  readJSON: async (k: string, f: unknown) => (mockStore.has(k) ? mockStore.get(k) : f),
  writeJSON: async (k: string, v: unknown) => void mockStore.set(k, v),
}));
import { maybeAskForReview, shouldAskForReview } from "../src/lib/review";

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 16);
const base = { confirmedSessions: 12, newRecord: false, historical: false, lastAskedAt: null, now };

beforeEach(() => {
  mockStore.clear();
  mockAvailable.mockClear();
  mockRequest.mockClear();
  mockAvailable.mockResolvedValue(true);
});

test("never before the third session, never for history, otherwise only after a record or from the tenth session", () => {
  expect(shouldAskForReview({ ...base, confirmedSessions: 2, newRecord: true })).toBe(false);
  expect(shouldAskForReview({ ...base, historical: true })).toBe(false);
  expect(shouldAskForReview({ ...base, confirmedSessions: 5 })).toBe(false);
  expect(shouldAskForReview({ ...base, confirmedSessions: 5, newRecord: true })).toBe(true);
  expect(shouldAskForReview({ ...base, confirmedSessions: 10 })).toBe(true);
});

test("at most once every 90 days", () => {
  expect(shouldAskForReview({ ...base, lastAskedAt: now - 30 * DAY })).toBe(false);
  expect(shouldAskForReview({ ...base, lastAskedAt: now - 90 * DAY })).toBe(true);
});

test("asks once, remembers it per account, and stays silent when Play cannot show the dialog", async () => {
  expect(await maybeAskForReview("a", { confirmedSessions: 12, newRecord: false, historical: false }, now)).toBe(true);
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(await maybeAskForReview("a", { confirmedSessions: 13, newRecord: true, historical: false }, now + DAY)).toBe(false);
  expect(mockRequest).toHaveBeenCalledTimes(1);
  mockAvailable.mockResolvedValue(false);
  expect(await maybeAskForReview("b", { confirmedSessions: 12, newRecord: false, historical: false }, now)).toBe(false);
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test("a failure never escapes to the screen", async () => {
  mockRequest.mockRejectedValueOnce(new Error("play"));
  await expect(maybeAskForReview("c", { confirmedSessions: 12, newRecord: false, historical: false }, now)).resolves.toBe(false);
});
