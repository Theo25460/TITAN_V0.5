/* V1.7.2 — Planifié et réalisé on Android: the week of the shared module (src/core/web/week-plan.js) read from the profile's
   typical week and the journal of this phone (confirmed sessions and sessions waiting to be sent), in the phone's time zone. */
import { useMemo } from "react";
import { Format, WeekPlan, type Schedule, type WeekPlanView } from "../core";
import { useLogs, usePrefs } from "../data/hooks";

export const deviceZone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};
export const todayKey = (now = new Date()) => Format.dateKey(now);

/** The week containing `day` (a YYYY-MM-DD key; this week by default). */
export function useWeekPlan(day?: string, now = new Date()): WeekPlanView {
  const prefs = usePrefs();
  const { logs } = useLogs();
  const today = todayKey(now);
  return useMemo(
    () => WeekPlan.week((prefs.schedule ?? {}) as Schedule, logs, { week: day, today, zone: deviceZone(), pauses: prefs.cadencePauses }),
    [prefs.schedule, prefs.cadencePauses, logs, day, today],
  );
}

/** The sport of each day of the week once moves and replacements are applied (skipped occurrences leave the day free). */
export function effectiveSports(view: WeekPlanView): (string | null)[] {
  const out: (string | null)[] = [null, null, null, null, null, null, null];
  for (const o of view.occurrences) {
    if (o.status === "skipped") continue;
    const i = WeekPlan.dayIndex(o.effective.day);
    if (!out[i]) out[i] = o.effective.sport;
  }
  return out;
}
