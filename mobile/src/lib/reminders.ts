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

/** AUD-32: what a reminder says, from the week as it will stand on that day (days already active before it, the player's own goal). */
export function reminderText(at: Date, activeDays: ReadonlySet<string>, target = 0): { title: string; body: string } {
  if (target < 1) return { title: "Un créneau pour bouger ?", body: "Même une courte séance fait avancer ta semaine et ton aventure." };
  const monday = new Date(at.getFullYear(), at.getMonth(), at.getDate() - ((at.getDay() + 6) % 7));
  let done = 0;
  for (let d = new Date(monday); d < at; d.setDate(d.getDate() + 1)) if (activeDays.has(localDayOf(d))) done++;
  const left = Math.max(0, target - done);
  const daysLeftInWeek = 7 - ((at.getDay() + 6) % 7);
  if (left === 0) return { title: "Ta semaine est déjà tenue", body: "Tout ce qui suit est du bonus. Une séance douce ou du repos : les deux comptent." };
  if (left === 1) return { title: "Plus qu’un jour pour tenir ta semaine", body: "Une séance courte suffit : 20 minutes comptent autant qu’une autre." };
  if (left >= daysLeftInWeek) return { title: "Un créneau pour bouger ?", body: `Encore ${left} jours actifs possibles cette semaine. Sans pression : la semaine prochaine repart de zéro.` };
  return { title: "Un créneau pour bouger ?", body: `Encore ${left} jours actifs pour tenir ta semaine. Même une courte séance compte.` };
}

export type WeekStats = { sessions: number; minutes: number; activeDays: number };

/** AUD-47: the Monday recap says what this week really was (re-planned after every session), never a generic sentence. */
export function recapText(week: WeekStats | null, target = 0): { title: string; body: string } {
  if (!week || !week.sessions) return { title: "Ta semaine TITAN", body: "Une nouvelle semaine commence : une séance suffit pour la lancer." };
  const h = week.minutes >= 60 ? `${Math.floor(week.minutes / 60)} h ${String(Math.round(week.minutes % 60)).padStart(2, "0")}` : `${Math.round(week.minutes)} min`;
  const held = target > 0 && week.activeDays >= target;
  return {
    title: held ? "Semaine tenue !" : "Ta semaine TITAN",
    body: `${week.activeDays}${target ? `/${target}` : ""} jour${week.activeDays > 1 ? "s" : ""} actif${week.activeDays > 1 ? "s" : ""} · ${week.sessions} séance${week.sessions > 1 ? "s" : ""} · ${h} d’effort. Ton récap complet t’attend.`,
  };
}

/** The next Monday 9:00 after `now`. */
export function nextMonday(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
  const add = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + add);
  return d;
}

/** H7: the next Sunday 18:00 after `now`, for « prépare ta semaine ». */
export function nextSundayEvening(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0, 0);
  const add = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + add);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
  return d;
}

export type HabitContext = {
  /** H2: what the weekly plan says for a day, e.g. « Course · 45 min ». */
  planned?: (day: Date) => string | null;
  /** H4: the player's own implementation intention, e.g. « Après le travail, je cours ». */
  intention?: string | null;
  /** H6: gentle comeback dates (5 and 10 days after the last session). */
  comeback?: Date[];
};

export async function applyReminders(s: ReminderSettings, { activeDays = new Set<string>(), now = new Date(), weekTarget = 0, week = null, habits = {} }: { activeDays?: ReadonlySet<string>; now?: Date; weekTarget?: number; week?: WeekStats | null; habits?: HabitContext } = {}) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!s.weeklyRecap && !s.training) return;
  await ensureChannels();
  if (s.weeklyRecap)
    await Notifications.scheduleNotificationAsync({
      content: { ...recapText(week, weekTarget), data: { url: "titan://progres" }, color: ACCENT },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextMonday(now), channelId: CHANNELS.recap.id },
    });
  for (const at of planTrainingReminders(s, now, activeDays)) {
    const base = reminderText(at, activeDays, weekTarget);
    const planned = habits.planned?.(at);
    const text = {
      title: habits.intention ? `Ton créneau : ${habits.intention}` : base.title,
      body: planned ? `Prévu aujourd’hui : ${planned}. ${base.body}` : base.body,
    };
    await Notifications.scheduleNotificationAsync({
      content: { ...text, data: { url: "titan://seance" }, color: ACCENT, categoryIdentifier: CATEGORY_REMINDER },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNELS.reminders.id },
    });
  }
  if (s.training)
    for (const [i, at] of (habits.comeback ?? []).entries())
      await Notifications.scheduleNotificationAsync({
        content: {
          title: i === 0 ? "On reprend ensemble ?" : "Ta place t’attend",
          body: i === 0 ? "Ta dernière séance date de 5 jours. 15 minutes suffisent pour relancer ta semaine." : "Une pause, ça arrive. Une séance courte, et ta régularité repart. Rien n’est perdu.",
          data: { url: "titan://seance" }, color: ACCENT, categoryIdentifier: CATEGORY_REMINDER,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNELS.reminders.id },
      });
  if (s.training || s.weeklyRecap)
    await Notifications.scheduleNotificationAsync({
      content: { title: "Prépare ta semaine en 30 secondes", body: "Choisis tes jours et tes sports : une semaine prévue est une semaine qui se tient.", data: { url: "titan://plan" }, color: ACCENT },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextSundayEvening(now), channelId: CHANNELS.recap.id },
    });
}

export async function cancelReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}
