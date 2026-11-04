/* TITAN's Android notification channels: one per kind, so the user can mute one without losing the others, each with the TITAN
   accent, a clear name and a role-appropriate importance. Android decides the final look (icon, colour, grouping); we use only what
   the system allows: a monochrome small icon (app.config), an accent colour, channels, a group, importance, lock-screen visibility
   and action buttons. Nothing here asks for a permission. */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const ACCENT = "#3DD9E8";
export const GROUP = "titan";

export type ChannelDef = { id: string; name: string; description: string; importance: "DEFAULT" | "LOW"; sound: boolean; vibrate: boolean };
/** `reminders` keeps its historical id so existing installs keep their settings. */
export const CHANNELS: Record<"reminders" | "recap" | "recording", ChannelDef> = {
  reminders: { id: "reminders", name: "Rappels d’entraînement", description: "Les créneaux sportifs que tu as choisis", importance: "DEFAULT", sound: false, vibrate: true },
  recap: { id: "recap", name: "Récap de la semaine", description: "Ton bilan du lundi : volume, records, prochaine étape", importance: "DEFAULT", sound: false, vibrate: false },
  recording: { id: "recording", name: "Enregistrement en cours", description: "Visible pendant un suivi GPS que tu as démarré, jamais autrement", importance: "LOW", sound: false, vibrate: false },
};

export const CATEGORY_REMINDER = "titan-reminder";
export const ACTION_OPEN_SESSION = "open-session";

export async function ensureChannels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelGroupAsync(GROUP, { name: "TITAN", description: "Rappels et enregistrements de TITAN" }).catch(() => {});
  for (const c of Object.values(CHANNELS))
    await Notifications.setNotificationChannelAsync(c.id, {
      name: c.name,
      description: c.description,
      groupId: GROUP,
      importance: c.importance === "LOW" ? Notifications.AndroidImportance.LOW : Notifications.AndroidImportance.DEFAULT,
      lightColor: ACCENT,
      enableLights: c.importance !== "LOW",
      enableVibrate: c.vibrate,
      vibrationPattern: c.vibrate ? [0, 180, 90, 180] : undefined,
      sound: c.sound ? "default" : null,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE, // title only is not shown on a locked screen: private content stays private
      showBadge: false,
    }).catch(() => {});
  await Notifications.setNotificationCategoryAsync(CATEGORY_REMINDER, [{ identifier: ACTION_OPEN_SESSION, buttonTitle: "Enregistrer une séance", options: { opensAppToForeground: true } }]).catch(() => {});
}
