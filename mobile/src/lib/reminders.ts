/* Optional local reminders (no push server, no tracking): the weekly recap on Monday morning and training
   reminders on the days the user chooses. Nothing is scheduled until the user turns it on. */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type ReminderSettings = { weeklyRecap: boolean; training: boolean; days: number[]; hour: number; minute: number };
export const DEFAULT_REMINDERS: ReminderSettings = { weeklyRecap: false, training: false, days: [1, 3, 5], hour: 18, minute: 0 };

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

const CHANNEL = "reminders";

export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

/** Monday = 1 … Sunday = 7 in TITAN; expo uses 1 = Sunday … 7 = Saturday. */
const toExpoWeekday = (d: number) => (d % 7) + 1;

export async function applyReminders(s: ReminderSettings) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!s.weeklyRecap && !s.training) return;
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: "Rappels TITAN", importance: Notifications.AndroidImportance.DEFAULT, description: "Récap de la semaine et rappels d’entraînement choisis dans TITAN" });
  if (s.weeklyRecap)
    await Notifications.scheduleNotificationAsync({
      content: { title: "Ta semaine TITAN", body: "Ton récap est prêt : volume, records et prochaine étape.", data: { url: "titan://progres" } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: toExpoWeekday(1), hour: 9, minute: 0, channelId: CHANNEL },
    });
  if (s.training)
    for (const d of s.days)
      await Notifications.scheduleNotificationAsync({
        content: { title: "Un créneau pour bouger ?", body: "Même une courte séance fait avancer ta semaine et ton aventure.", data: { url: "titan://seance" } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: toExpoWeekday(d), hour: s.hour, minute: s.minute, channelId: CHANNEL },
      });
}

export async function cancelReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}
