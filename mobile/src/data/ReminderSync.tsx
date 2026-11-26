/* AUD-18: keeps the local training reminders in step with the journal. Whenever the active days change (a session saved, synced
   or edited) or the app comes back to the foreground on a new day, the next two weeks are re-planned so that no reminder rings on a
   day already trained. Nothing happens for a person who never turned reminders on. */
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { applyReminders, DEFAULT_REMINDERS, localDayOf, type ReminderSettings, type WeekStats } from "../lib/reminders";
import { Progress, Questions, Sports } from "../core";
import { comebackDates, plannedFor } from "../lib/habits";
import { readIntention } from "../lib/intention";
import { ownerKey, readJSON } from "../lib/storage";
import { useOwner } from "./auth";
import { useLogs, usePrefs } from "./hooks";

export function ReminderSync() {
  const owner = useOwner();
  const { active } = useLogs();
  const prefs = usePrefs();
  const target = prefs.weeklyGoalSessions;
  // The seven days only: a decision of the week (V1.7.2, schedule.weeks) does not re-plan the reminders.
  const scheduleKey = JSON.stringify(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((k) => prefs.schedule?.[k] ?? null));
  const lastSession = useMemo(() => active.reduce((m, l) => Math.max(m, new Date(l.date).getTime() || 0), 0), [active]);
  // AUD-47: this week's figures, for the Monday recap planned now and re-planned after every session.
  const week = useMemo<WeekStats | null>(() => {
    const cur = Questions.weeklySeries(Progress.activeLogs(active), { weeks: 1 }).find((w) => w.current);
    return cur ? { sessions: cur.sessions, minutes: Math.round(cur.minutes), activeDays: cur.activeDays } : null;
  }, [active]);
  const weekKey = week ? `${week.sessions}:${week.minutes}:${week.activeDays}` : "none";
  const [today, setToday] = useState(() => localDayOf(new Date()));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") setToday(localDayOf(new Date()));
    });
    return () => sub.remove();
  }, []);
  // Only the days from today on matter; the key changes only when one of them gains or loses a session.
  // From the Monday of this week: earlier days of the week shape what the reminder says (AUD-32), later ones skip a reminder.
  const monday = useMemo(() => { const t = new Date(`${today}T12:00:00`); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return localDayOf(t); }, [today]);
  const key = useMemo(() => [...new Set(active.map((l) => localDayOf(l.date)).filter((d) => d >= monday))].sort().join(","), [active, monday]);
  useEffect(() => {
    let alive = true;
    readJSON<ReminderSettings>(ownerKey("reminders", owner), DEFAULT_REMINDERS)
      .then(async (s) => {
        if (!alive || (!s.training && !s.weeklyRecap)) return;
        const intention = await readIntention(owner);
        return applyReminders(s, {
          activeDays: new Set(key ? key.split(",") : []), weekTarget: target, week,
          habits: { planned: (day) => plannedFor(prefs.schedule ?? {}, day, Sports.label), intention, comeback: comebackDates(active) },
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, key, today, target, weekKey, scheduleKey, lastSession]);
  return null;
}
