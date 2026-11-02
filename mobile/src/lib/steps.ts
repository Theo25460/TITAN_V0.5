/* Daily steps for the QG: pure arithmetic over what the server returns (one number per day: the highest source, never a sum of
   several sources) plus the optional personal goal. Steps never create a session, XP or a reward. */
export type DayRow = { day: string; steps: number; sources?: string[]; updatedAt?: string };
export const GOAL_MIN = 1000;
export const GOAL_MAX = 50000;
export const GOAL_PRESETS = [5000, 8000, 10000, 12000] as const;
export const AUTO_SYNC_MS = 30 * 60_000;

export const validGoal = (g: unknown): number | null => {
  const n = Math.round(Number(g));
  return Number.isFinite(n) && n >= GOAL_MIN && n <= GOAL_MAX ? n : null;
};
export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
};

export type StepsView = {
  today: number | null; // null = no number for today (never shown as 0)
  ratio: number | null; // 0..1 toward the goal, null without goal or without number
  goal: number | null;
  week: { day: string; steps: number | null }[]; // the last 7 days ending today
  weekAverage: number | null; // over days that have a number
  previousWeekAverage: number | null;
  trend: "up" | "down" | "flat" | null; // ±10 % against the week before
  month: { days: number; total: number; average: number | null }; // last 30 days
  lastUpdate: string | null;
};

const clean = (rows: DayRow[]) => rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day) && Number.isFinite(r.steps) && r.steps >= 0 && r.steps <= 200000);

export function summarize(rows: DayRow[], today: string, goal: number | null): StepsView {
  const by = new Map(clean(rows).map((r) => [r.day, r]));
  const at = (d: string) => by.get(d)?.steps ?? null;
  const last = (n: number, from: string) => Array.from({ length: n }, (_, i) => addDays(from, -(n - 1 - i)));
  const week = last(7, today).map((day) => ({ day, steps: at(day) }));
  const prev = last(7, addDays(today, -7)).map(at).filter((v): v is number => v !== null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const wv = week.map((w) => w.steps).filter((v): v is number => v !== null);
  const weekAverage = avg(wv);
  const previousWeekAverage = avg(prev);
  const monthVals = last(30, today).map(at).filter((v): v is number => v !== null);
  const t = at(today);
  const g = validGoal(goal);
  return {
    today: t,
    goal: g,
    ratio: t !== null && g ? Math.min(1, t / g) : null,
    week,
    weekAverage,
    previousWeekAverage,
    trend: weekAverage !== null && previousWeekAverage ? (weekAverage > previousWeekAverage * 1.1 ? "up" : weekAverage < previousWeekAverage * 0.9 ? "down" : "flat") : null,
    month: { days: monthVals.length, total: monthVals.reduce((a, b) => a + b, 0), average: avg(monthVals) },
    lastUpdate: [...by.values()].map((r) => r.updatedAt ?? "").filter(Boolean).sort().at(-1) ?? null,
  };
}

/** Automatic refresh when the QG opens: at most every 30 minutes, never without both the server consent and the Android permission. */
export const shouldAutoSync = (lastSyncAt: number | null, now: number, allowed: boolean) => allowed && (lastSyncAt === null || now - lastSyncAt >= AUTO_SYNC_MS);

export const stepsText = (n: number) => n.toLocaleString("fr-FR").replace(/ | /g, " ");
