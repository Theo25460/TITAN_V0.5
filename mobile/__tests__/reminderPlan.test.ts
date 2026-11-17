/* AUD-18: training reminders are dated occurrences over two weeks, on the chosen days and time, never in the past and never on a
   day that already has a session. */
jest.mock("expo-notifications", () => ({ setNotificationHandler: jest.fn(), SchedulableTriggerInputTypes: { WEEKLY: "weekly", DATE: "date" } }));
jest.mock("../src/lib/notificationChannels", () => ({ ACCENT: "#000", CATEGORY_REMINDER: "r", CHANNELS: { recap: { id: "recap" }, reminders: { id: "reminders" } }, ensureChannels: jest.fn() }));
import { localDayOf, planTrainingReminders, type ReminderSettings } from "../src/lib/reminders";

const settings: ReminderSettings = { weeklyRecap: false, training: true, days: [1, 3, 5], hour: 18, minute: 0 };
// Monday 16 November 2026, 10:00 local time.
const monday = new Date(2026, 10, 16, 10, 0, 0);

test("planned on the chosen days only, at the chosen time, over two weeks", () => {
  const plan = planTrainingReminders(settings, monday, new Set());
  expect(plan).toHaveLength(6);
  expect(plan.map((d) => [d.getDay(), d.getHours(), d.getMinutes()])).toEqual([[1, 18, 0], [3, 18, 0], [5, 18, 0], [1, 18, 0], [3, 18, 0], [5, 18, 0]]);
});

test("a day that already has a session gets no reminder", () => {
  const plan = planTrainingReminders(settings, monday, new Set(["2026-11-16", "2026-11-20"]));
  expect(plan.map(localDayOf)).toEqual(["2026-11-18", "2026-11-23", "2026-11-25", "2026-11-27"]);
});

test("a time already past today is not planned for today", () => {
  const evening = new Date(2026, 10, 16, 19, 0, 0);
  expect(planTrainingReminders(settings, evening, new Set()).map(localDayOf)[0]).toBe("2026-11-18");
});

test("nothing when training reminders are off or no day is chosen", () => {
  expect(planTrainingReminders({ ...settings, training: false }, monday, new Set())).toEqual([]);
  expect(planTrainingReminders({ ...settings, days: [] }, monday, new Set())).toEqual([]);
});

test("a bare session date is already a local day", () => {
  expect(localDayOf("2026-11-16")).toBe("2026-11-16");
  expect(localDayOf(new Date(2026, 10, 16, 23, 30))).toBe("2026-11-16");
});

test("a reminder says how many active days are left in the player's week (AUD-32)", () => {
  const { reminderText } = jest.requireActual("../src/lib/reminders");
  const wednesday = new Date(2026, 10, 18, 18, 0);
  expect(reminderText(wednesday, new Set(["2026-11-16"]), 3).body).toContain("Encore 2 jours actifs");
  expect(reminderText(wednesday, new Set(["2026-11-16", "2026-11-17"]), 3).title).toBe("Plus qu’un jour pour tenir ta semaine");
  expect(reminderText(new Date(2026, 10, 19, 18), new Set(["2026-11-16", "2026-11-17", "2026-11-18"]), 3).title).toBe("Ta semaine est déjà tenue");
  expect(reminderText(wednesday, new Set(), 0).title).toBe("Un créneau pour bouger ?");
});

test("the Monday recap tells the real week and is planned for next Monday 9:00 (AUD-47)", () => {
  const { recapText, nextMonday } = jest.requireActual("../src/lib/reminders");
  expect(recapText({ sessions: 4, minutes: 160, activeDays: 3 }, 3)).toEqual({ title: "Semaine tenue !", body: "3/3 jours actifs · 4 séances · 2 h 40 d’effort. Ton récap complet t’attend." });
  expect(recapText({ sessions: 0, minutes: 0, activeDays: 0 }, 3).title).toBe("Ta semaine TITAN");
  const m = nextMonday(new Date(2026, 10, 18, 20));
  expect([m.getDay(), m.getDate(), m.getHours()]).toEqual([1, 23, 9]);
  expect(nextMonday(new Date(2026, 10, 16, 8)).getDate()).toBe(23);
});
