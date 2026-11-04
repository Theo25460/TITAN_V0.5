/* TITAN's own step bookkeeping (no third party): the phone's hardware step counter only knows a cumulative total since the last boot,
   so this ledger turns successive readings of that total into steps per day, for one account on this phone.

   What it guarantees, because the number is shown to a person:
   - nothing is invented: before the first reading there is no number (never 0), and steps taken before the counter was switched on
     are not guessed;
   - the same reading twice adds nothing; a reboot (the total restarts from zero) never produces negative or doubled steps;
   - steps taken while TITAN was closed are credited when it opens again; when that gap spans midnight they are shared between the days
     in proportion to the usual waking hours (07:00–22:00) and the earlier days' share is flagged as an estimate (`est`);
   - an implausible jump (a sensor glitch) is capped, a day never exceeds MAX_DAY.
   Pure functions only: the storage and the sensor live elsewhere. */
import { localDay } from "./steps";

export const MAX_DAY = 100_000;
export const MAX_STEPS_PER_HOUR = 12_000; // sprinting cadence for a full hour: anything above is a sensor artefact
export const KEEP_DAYS = 60;
const WAKE_FROM = 7;
const WAKE_TO = 22;
const REBOOT_TOLERANCE_MS = 120_000;

export type Ledger = {
  v: 1;
  /** Wall-clock instant of the boot the last reading belongs to. */
  boot: number | null;
  /** Last cumulative total read from the sensor. */
  last: number | null;
  /** When that reading was taken (ms). */
  lastAt: number | null;
  /** Steps per local day (YYYY-MM-DD). */
  days: Record<string, number>;
  /** Of those, the steps that were shared across midnight after a gap: an estimate, said as such. */
  est: Record<string, number>;
  /** First instant counted: "counted since 14:12" is honest on the first day. */
  firstAt: number | null;
};

export const emptyLedger = (): Ledger => ({ v: 1, boot: null, last: null, lastAt: null, days: {}, est: {}, firstAt: null });

export type Reading = { total: number; boot: number; at: number };

const dayKey = (t: number) => localDay(new Date(t));

/** The local days an interval touches, with the milliseconds of "usual waking hours" each one holds. */
function wakingWeights(from: number, to: number): { day: string; w: number }[] {
  const out: { day: string; w: number }[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  for (let guard = 0; cursor.getTime() < to && guard < 400; guard++) {
    const start = new Date(cursor);
    start.setHours(WAKE_FROM, 0, 0, 0);
    const end = new Date(cursor);
    end.setHours(WAKE_TO, 0, 0, 0);
    const w = Math.max(0, Math.min(to, end.getTime()) - Math.max(from, start.getTime()));
    out.push({ day: localDay(cursor), w });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Shares `steps` between days in proportion to `w`, in whole steps that add up exactly (largest remainder). */
function share(steps: number, parts: { day: string; w: number }[]): { day: string; n: number }[] {
  const total = parts.reduce((s, p) => s + p.w, 0);
  const raw = parts.map((p) => ({ day: p.day, exact: (steps * p.w) / total }));
  const out = raw.map((r) => ({ day: r.day, n: Math.floor(r.exact), frac: r.exact - Math.floor(r.exact) }));
  let left = steps - out.reduce((s, r) => s + r.n, 0);
  for (const r of [...out].sort((a, b) => b.frac - a.frac)) {
    if (left <= 0) break;
    r.n += 1;
    left -= 1;
  }
  return out.map(({ day, n }) => ({ day, n }));
}

function prune(days: Record<string, number>, est: Record<string, number>, today: string) {
  const keep = Object.keys(days).sort().slice(-KEEP_DAYS);
  const k = new Set(keep.concat(today));
  const d: Record<string, number> = {};
  const e: Record<string, number> = {};
  for (const day of k) {
    if (days[day] !== undefined) d[day] = days[day];
    if (est[day] !== undefined) e[day] = est[day];
  }
  return { d, e };
}

export function applyReading(ledger: Ledger, r: Reading): Ledger {
  if (!Number.isFinite(r.total) || r.total < 0 || !Number.isFinite(r.at)) return ledger;
  // First reading ever: the counter starts here. What happened before is not guessed.
  if (ledger.last === null || ledger.lastAt === null) {
    return { ...ledger, boot: r.boot, last: r.total, lastAt: r.at, firstAt: ledger.firstAt ?? r.at, days: { ...ledger.days, [dayKey(r.at)]: ledger.days[dayKey(r.at)] ?? 0 } };
  }
  const rebooted = ledger.boot !== null && Math.abs(r.boot - ledger.boot) > REBOOT_TOLERANCE_MS;
  // After a reboot, or if the total went backwards, the sensor restarted from zero: everything it reports now is new.
  let delta = rebooted || r.total < ledger.last ? r.total : r.total - ledger.last;
  const hours = Math.max(1 / 60, (r.at - ledger.lastAt) / 3_600_000);
  delta = Math.min(Math.round(delta), Math.ceil(hours * MAX_STEPS_PER_HOUR));
  const base: Ledger = { ...ledger, boot: r.boot, last: r.total, lastAt: r.at };
  if (delta <= 0) return base;

  const today = dayKey(r.at);
  const sameDay = r.at < ledger.lastAt || dayKey(ledger.lastAt) === today;
  let parts: { day: string; n: number }[];
  if (sameDay) parts = [{ day: today, n: delta }];
  else {
    const w = wakingWeights(ledger.lastAt, r.at);
    // A gap spent entirely at night is credited to the day it ends on.
    parts = w.reduce((s, p) => s + p.w, 0) > 0 ? share(delta, w).filter((p) => p.n > 0) : [{ day: today, n: delta }];
  }
  const days = { ...ledger.days };
  const est = { ...ledger.est };
  for (const p of parts) {
    const before = days[p.day] ?? 0;
    const next = Math.min(MAX_DAY, before + p.n);
    days[p.day] = next;
    // Earlier days' share of a catch-up is an estimate; today's share is exact (it is what the counter gained since the last reading).
    if (!sameDay && p.day !== today) est[p.day] = Math.min(next, (est[p.day] ?? 0) + p.n);
  }
  const { d, e } = prune(days, est, today);
  return { ...base, days: d, est: e };
}

/** Steps counted today, or null when nothing has been counted yet (never a made-up zero). */
export function todaySteps(ledger: Ledger, now: number): number | null {
  if (ledger.firstAt === null) return null;
  return ledger.days[dayKey(now)] ?? (dayKey(ledger.firstAt) === dayKey(now) ? 0 : null);
}

/** True while "today" started counting in the middle of the day: the first day is "counted since …", not "your steps today". */
export const partialFirstDay = (ledger: Ledger, now: number) => ledger.firstAt !== null && dayKey(ledger.firstAt) === dayKey(now) && new Date(ledger.firstAt).getHours() * 60 + new Date(ledger.firstAt).getMinutes() > 5;

/** The ledger's days in the shape the QG already understands (see lib/steps.ts DayRow). */
export function ledgerRows(ledger: Ledger): { day: string; steps: number; sources: string[]; updatedAt?: string }[] {
  const updatedAt = ledger.lastAt ? new Date(ledger.lastAt).toISOString() : undefined;
  return Object.entries(ledger.days)
    .filter(([, steps]) => Number.isFinite(steps))
    .map(([day, steps]) => ({ day, steps, sources: ["titan"], updatedAt }));
}

/** One number per day, several sources never added: the larger one wins and says where it came from. */
export function mergeDays(
  own: { day: string; steps: number; sources?: string[]; updatedAt?: string }[],
  server: { day: string; steps: number; sources?: string[]; updatedAt?: string }[],
): { day: string; steps: number; sources: string[]; updatedAt?: string }[] {
  const by = new Map<string, { day: string; steps: number; sources: string[]; updatedAt?: string }>();
  for (const r of [...server, ...own]) {
    const cur = by.get(r.day);
    if (!cur || r.steps > cur.steps) by.set(r.day, { day: r.day, steps: r.steps, sources: r.sources ?? [], updatedAt: r.updatedAt });
    else if (r.updatedAt && (!cur.updatedAt || r.updatedAt > cur.updatedAt)) cur.updatedAt = r.updatedAt;
  }
  return [...by.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** A walking distance for display only, clearly approximate: an average adult stride, 0.75 m. */
export const approxKm = (steps: number) => Math.round((steps * 0.75) / 100) / 10;
