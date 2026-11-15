/* AUD-18: keeps the local training reminders in step with the journal. Whenever the active days change (a session saved, synced
   or edited) or the app comes back to the foreground on a new day, the next two weeks are re-planned so that no reminder rings on a
   day already trained. Nothing happens for a person who never turned reminders on. */
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { applyReminders, DEFAULT_REMINDERS, localDayOf, type ReminderSettings } from "../lib/reminders";
import { ownerKey, readJSON } from "../lib/storage";
import { useOwner } from "./auth";
import { useLogs, usePrefs } from "./hooks";

export function ReminderSync() {
  const owner = useOwner();
  const { active } = useLogs();
  const target = usePrefs().weeklyGoalSessions;
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
      .then((s) => {
        if (!alive || !s.training) return;
        return applyReminders(s, { activeDays: new Set(key ? key.split(",") : []), weekTarget: target });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [owner, key, today, target]);
  return null;
}
