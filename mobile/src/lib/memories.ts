/* AUD-38 / AUD-39: what only a long history can say. « Ce jour-là » brings back a session done exactly a month or a year ago
   (or more), and « Toi contre toi » compares the last 30 days with the same 30 days a year earlier. Pure, local, nothing sent. */
import { Progress } from "../core";
import type { TrainingLog } from "../core/types";

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const localKey = (date: string) => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : dayKey(new Date(date)));

export type Memory = { log: TrainingLog; label: string; yearsAgo: number; monthsAgo: number };

/** The best memory for today: the oldest « same day » session (years first, then one month ago), one per day at most. */
export function memoryOfTheDay(logs: TrainingLog[], now = new Date()): Memory | null {
  const byDay = new Map<string, TrainingLog[]>();
  for (const l of logs) {
    if (!l?.sport || !l.date) continue;
    const k = localKey(l.date);
    byDay.set(k, [...(byDay.get(k) ?? []), l]);
  }
  for (let years = 10; years >= 1; years--) {
    const d = new Date(now.getFullYear() - years, now.getMonth(), now.getDate());
    if (d.getDate() !== now.getDate()) continue; // 29 February
    const found = byDay.get(dayKey(d));
    if (found?.length) return { log: pickLongest(found), label: years === 1 ? "Il y a un an, jour pour jour" : `Il y a ${years} ans, jour pour jour`, yearsAgo: years, monthsAgo: years * 12 };
  }
  const m = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  if (m.getDate() === now.getDate()) {
    const found = byDay.get(dayKey(m));
    if (found?.length) return { log: pickLongest(found), label: "Il y a un mois, jour pour jour", yearsAgo: 0, monthsAgo: 1 };
  }
  return null;
}

const pickLongest = (list: TrainingLog[]) => list.slice().sort((a, b) => Progress.minutesOf(b).minutes - Progress.minutesOf(a).minutes)[0];

export type SelfComparison = { minutes: [number, number]; sessions: [number, number]; activeDays: [number, number]; ratio: number };

/** The last 30 days against the same 30 days one year earlier; null until a year of history exists in that window. */
export function selfVsLastYear(logs: TrainingLog[], now = new Date()): SelfComparison | null {
  const DAY = 86_400_000;
  const end = now.getTime();
  const start = end - 30 * DAY;
  const window = (from: number, to: number) => {
    const list = logs.filter((l) => {
      const t = new Date(l.date).getTime();
      return t >= from && t < to;
    });
    return {
      minutes: Math.round(list.reduce((n, l) => n + Progress.minutesOf(l).minutes, 0)),
      sessions: list.length,
      activeDays: new Set(list.map((l) => localKey(l.date))).size,
    };
  };
  const year = 365 * DAY;
  const before = window(start - year, end - year);
  if (!before.sessions) return null;
  const cur = window(start, end);
  return {
    minutes: [cur.minutes, before.minutes],
    sessions: [cur.sessions, before.sessions],
    activeDays: [cur.activeDays, before.activeDays],
    ratio: before.minutes ? cur.minutes / before.minutes - 1 : 0,
  };
}
