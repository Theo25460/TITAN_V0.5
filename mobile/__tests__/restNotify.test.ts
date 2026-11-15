/* AUD-28: the end of a rest is announced even screen locked; skipping or changing the rest moves or cancels it; no permission asked. */
const mockSchedule = jest.fn(async (_r: unknown) => "id");
const mockCancel = jest.fn(async (_id: string) => undefined);
const mockPerm = jest.fn(async () => ({ granted: true }));
jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: (r: unknown) => mockSchedule(r),
  cancelScheduledNotificationAsync: (id: string) => mockCancel(id),
  getPermissionsAsync: () => mockPerm(),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));
jest.mock("../src/lib/notificationChannels", () => ({ ACCENT: "#000", CHANNELS: { rest: { id: "rest" } }, ensureChannels: jest.fn(async () => undefined) }));
import { cancelRestEnd, REST_NOTIFICATION_ID, scheduleRestEnd } from "../src/lib/restNotify";

beforeEach(() => jest.clearAllMocks());

test("a rest schedules one notification at its end, replacing the previous one", async () => {
  const now = Date.now();
  await scheduleRestEnd(now + 90_000, now);
  expect(mockCancel).toHaveBeenCalledWith(REST_NOTIFICATION_ID);
  const req = mockSchedule.mock.calls[0][0] as { identifier: string; trigger: { date: Date; channelId: string } };
  expect(req.identifier).toBe(REST_NOTIFICATION_ID);
  expect(req.trigger.date.getTime()).toBe(now + 90_000);
  expect(req.trigger.channelId).toBe("rest");
});

test("without notification permission nothing is scheduled and nothing is asked", async () => {
  mockPerm.mockResolvedValueOnce({ granted: false });
  await scheduleRestEnd(Date.now() + 60_000);
  expect(mockSchedule).not.toHaveBeenCalled();
});

test("a rest already over is not scheduled; cancelling removes it", async () => {
  const now = Date.now();
  await scheduleRestEnd(now + 500, now);
  expect(mockSchedule).not.toHaveBeenCalled();
  await cancelRestEnd();
  expect(mockCancel).toHaveBeenLastCalledWith(REST_NOTIFICATION_ID);
});
