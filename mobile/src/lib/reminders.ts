/* Optional local reminders (no push server, no tracking): the weekly recap on Monday morning and training
   reminders on the days the user chooses. Nothing is scheduled until the user turns it on. Training reminders are
   re-planned whenever the journal changes or the app returns to the foreground (ReminderSync), skipping active days. */
import * as Notifications from "expo-notifications";
import { ACCENT, CATEGORY_REMINDER, CHANNELS, ensureChannels } from "./notificationChannels";

export type ReminderSettings = { weeklyRecap: boolean; training: boolean; days: number[]; hour: number; minute: number };
export const DEFAULT_REMINDERS: ReminderSettings = { weeklyRecap: false, training: false, days: [1, 3, 5], hour: 18, minute: 0 };

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});


export async function ensurePermission(explain?: () => Promise<boolean>): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  if (explain && !(await explain())) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

/** Monday = 1 … Sunday = 7 in TITAN; expo uses 1 = Sunday … 7 = Saturday. */
const toExpoWeekday = (d: number) => (d % 7) + 1;

const pad = (n: number) => String(n).padStart(2, "0");
/** The local calendar day of a session date: a bare "YYYY-MM-DD" is already a local day, a full timestamp is read in local time. */
export function localDayOf(date: string | Date): string {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const REMINDER_HORIZON_DAYS = 14;

/** AUD-18: training reminders are planned as dated occurrences over the next two weeks, on the chosen days, at the chosen time,
    never in the past and never on a day already active. A weekly repeating trigger could not skip the day you already trained. */
export function planTrainingReminders(s: ReminderSettings, now: Date, activeDays: ReadonlySet<string>, horizon = REMINDER_HORIZON_DAYS): Date[] {
  if (!s.training || !s.days.length) return [];
  const out: Date[] = [];
  for (let i = 0; i < horizon; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, s.hour, s.minute, 0, 0);
    const weekday = ((at.getDay() + 6) % 7) + 1; // Monday = 1 … Sunday = 7
    if (!s.days.includes(weekday) || at.getTime() <= now.getTime() || activeDays.has(localDayOf(at))) continue;
    out.push(at);
  }
  return out;
}

export async function applyReminders(s: ReminderSettings, { activeDays = new Set<string>(), now = new Date() }: { activeDays?: ReadonlySet<string>; now?: Date } = {}) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!s.weeklyRecap && !s.training) return;
  await ensureChannels();
  if (s.weeklyRecap)
    await Notifications.scheduleNotificationAsync({
      content: { title: "Ta semaine TITAN", body: "Ton récap est prêt : volume, records et prochaine étape.", data: { url: "titan://progres" }, color: ACCENT },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: toExpoWeekday(1), hour: 9, minute: 0, channelId: CHANNELS.recap.id },
    });
  for (const at of planTrainingReminders(s, now, activeDays))
    await Notifications.scheduleNotificationAsync({
      content: { title: "Un créneau pour bouger ?", body: "Même une courte séance fait avancer ta semaine et ton aventure.", data: { url: "titan://seance" }, color: ACCENT, categoryIdentifier: CATEGORY_REMINDER },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNELS.reminders.id },
    });
}

export async function cancelReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}
