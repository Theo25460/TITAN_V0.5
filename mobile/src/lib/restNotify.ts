/* AUD-28: the rest between two sets also ends when the screen is locked or TITAN is in the background: a local notification is
   scheduled for the end of the rest and cancelled when the rest is skipped, changed or ends in the app. Nothing leaves the phone.
   If notifications are not allowed, nothing is asked here: the in-app countdown and haptic keep working. */
import * as Notifications from "expo-notifications";
import { ACCENT, CHANNELS, ensureChannels } from "./notificationChannels";

export const REST_NOTIFICATION_ID = "titan-rest-end";

export async function scheduleRestEnd(endsAt: number, now = Date.now()): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(REST_NOTIFICATION_ID).catch(() => {});
    if (endsAt <= now + 1000) return;
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await ensureChannels();
    await Notifications.scheduleNotificationAsync({
      identifier: REST_NOTIFICATION_ID,
      content: { title: "Repos terminé", body: "Série suivante quand tu es prêt.", color: ACCENT },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(endsAt), channelId: CHANNELS.rest.id },
    });
  } catch {
    // A notification is a convenience: the in-app timer stays the reference.
  }
}

export async function cancelRestEnd(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REST_NOTIFICATION_ID).catch(() => {});
}
