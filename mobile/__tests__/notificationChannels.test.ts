/* Notification channels: one per kind, TITAN accent, private on a locked screen, recording channel quiet; the historical id is kept. */
const mockCalls: { channels: Record<string, unknown>[]; groups: string[]; categories: string[] } = { channels: [], groups: [], categories: [] };
jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3, LOW: 2 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  setNotificationChannelGroupAsync: async (id: string) => void mockCalls.groups.push(id),
  setNotificationChannelAsync: async (id: string, c: Record<string, unknown>) => void mockCalls.channels.push({ id, ...c }),
  setNotificationCategoryAsync: async (id: string) => void mockCalls.categories.push(id),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("react-native").Platform.OS = "android";
/* eslint-disable @typescript-eslint/no-require-imports */
const { ACCENT, CATEGORY_REMINDER, CHANNELS, GROUP, ensureChannels } = require("../src/lib/notificationChannels");
/* eslint-enable @typescript-eslint/no-require-imports */

test("three channels in one TITAN group, the old reminders id kept, private on the lock screen, the recording one silent and low", async () => {
  await ensureChannels();
  expect(mockCalls.groups).toEqual([GROUP]);
  expect(mockCalls.channels.map((c) => c.id)).toEqual(["reminders", "recap", "recording"]);
  expect(CHANNELS.reminders.id).toBe("reminders");
  for (const c of mockCalls.channels) {
    expect(c).toMatchObject({ groupId: GROUP, lightColor: ACCENT, lockscreenVisibility: 0, showBadge: false });
  }
  const rec = mockCalls.channels.find((c) => c.id === "recording")!;
  expect(rec).toMatchObject({ importance: 2, sound: null, enableVibrate: false });
  expect(mockCalls.categories).toEqual([CATEGORY_REMINDER]);
});

test("every channel has a French name and description a person can read in system settings", () => {
  for (const c of Object.values(CHANNELS) as { name: string; description: string }[]) {
    expect(c.name.length).toBeGreaterThan(5);
    expect(c.description.length).toBeGreaterThan(15);
  }
});
