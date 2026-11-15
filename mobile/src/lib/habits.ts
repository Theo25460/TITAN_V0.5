/* Lot 8 « habitudes » — pure, local helpers behind the habit features (H1–H10). Nothing here is sent; nothing grants anything.
   They read the journal (and the player's own preferences) to make the habit visible, planned, easy to start and easy to resume. */
import { Progress, type Cadence } from "../core";
import type { TrainingLog } from "../core/types";

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyOf = (date: string) => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : dayKey(new Date(date)));
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

/** H1: the last 53 weeks as a grid of days (Monday first), each with its effort minutes, for the « Mon année en carrés » heatmap. */
export function yearGrid(logs: TrainingLog[], now = new Date()): { weeks: { key: string; minutes: number; future: boolean }[][]; activeDays: number } {
  const minutes = new Map<string, number>();
  for (const l of logs) if (l?.sport && l.date) minutes.set(keyOf(l.date), (minutes.get(keyOf(l.date)) ?? 0) + Progress.minutesOf(l).minutes);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY);
  const start = new Date(monday.getTime() - 52 * 7 * DAY);
  const weeks: { key: string; minutes: number; future: boolean }[][] = [];
  let active = 0;
  for (let w = 0; w < 53; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const k = dayKey(day);
      const m = minutes.get(k) ?? 0;
      if (m > 0 && day <= today) active++;
      col.push({ key: k, minutes: m, future: day > today });
    }
    weeks.push(col);
  }
  return { weeks, activeDays: active };
}

/** H3: the hour at which the player usually trains (most frequent start hour over the last 60 sessions with a time), or null. */
export function usualHour(logs: TrainingLog[]): number | null {
  const hours = logs
    .filter((l) => l?.date && !/^\d{4}-\d{2}-\d{2}$/.test(l.date))
    .slice(0, 60)
    .map((l) => new Date(l.date).getHours())
    .filter((h) => h >= 5 && h <= 22);
  if (hours.length < 5) return null;
  const count = new Map<number, number>();
  for (const h of hours) count.set(h, (count.get(h) ?? 0) + 1);
  const [best, n] = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return n / hours.length >= 0.3 ? best : null;
}

/** H2: what the weekly plan says for a given day (« Course · 45 min »), or null. */
export function plannedFor(schedule: Record<string, { sport: string | null; minutes?: number | null } | undefined>, day: Date, label: (sport: string) => string): string | null {
  const p = schedule[WEEKDAYS[day.getDay()]];
  if (!p?.sport) return null;
  return `${label(p.sport)}${p.minutes ? ` · ${p.minutes} min` : ""}`;
}

/** H6: the gentle comeback dates — 5 and 10 days after the last session, at 18:00, only those still in the future. */
export function comebackDates(logs: TrainingLog[], now = new Date()): Date[] {
  const last = logs.reduce<number>((m, l) => Math.max(m, new Date(l.date).getTime() || 0), 0);
  if (!last) return [];
  const base = new Date(last);
  return [5, 10].map((n) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + n, 18, 0, 0)).filter((d) => d.getTime() > now.getTime());
}

/** H9: consecutive held weeks up to the last complete one (a week in pause is skipped, never a break). */
export function heldStreak(cadence: Cadence | null | undefined): number {
  if (!cadence?.weeks?.length) return 0;
  let n = 0;
  for (const w of cadence.weeks.slice().reverse()) {
    if (w.state === "current" || w.state === "pause") continue;
    if (w.state === "held") n++;
    else break;
  }
  return n;
}

/** H10: hours of effort this calendar year and the projection at the current pace to 31 December. */
export function yearProjection(logs: TrainingLog[], now = new Date()): { hours: number; projected: number; year: number } | null {
  const start = new Date(now.getFullYear(), 0, 1).getTime();
  const minutes = logs.filter((l) => new Date(l.date).getTime() >= start && new Date(l.date).getTime() <= now.getTime()).reduce((n, l) => n + Progress.minutesOf(l).minutes, 0);
  if (minutes <= 0) return null;
  const elapsed = Math.max(14, (now.getTime() - start) / DAY);
  const total = (new Date(now.getFullYear() + 1, 0, 1).getTime() - start) / DAY;
  return { hours: Math.round(minutes / 60), projected: Math.round((minutes / elapsed) * total / 60), year: now.getFullYear() };
}

/** H8: what today's energy suggests (1 = épuisé … 5 = en pleine forme), never a reproach. */
export function energyAdvice(level: number): string {
  if (level <= 1) return "Journée repos ou marche douce : récupérer fait partie de l’entraînement.";
  if (level === 2) return "Une séance courte et facile suffit aujourd’hui (20 min, ressenti 3-4).";
  if (level === 3) return "Une séance normale, à ton rythme.";
  if (level === 4) return "Bonne énergie : c’est un bon jour pour ta séance clé de la semaine.";
  return "Pleine forme : profite-en, sans dépasser ce que ta semaine demande.";
}
