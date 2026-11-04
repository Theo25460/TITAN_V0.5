/* "Depuis ta dernière visite" (V12-38): an honest, compact look back after at least most of a day away. It only ever counts sessions the
   server confirmed (a session recorded on this phone, an import, a session from the website), never shows a negative figure, a missed
   day or a streak, and says nothing at all when nothing happened. The time of the last visit stays on the phone, per account. */
import type { TrainingLog } from "../core/types";
import { ownerKey, readJSON, writeJSON } from "./storage";

export const MIN_AWAY_MS = 18 * 3_600_000;

export type Since = { sessions: number; xp: number; minutes: number; away: string };

const stamp = (l: TrainingLog) => Date.parse(l.created_at ?? l.date);

/** What was confirmed since `since`, or null when the break was short, there is no earlier visit, or nothing happened. */
export function sinceLastVisit(logs: TrainingLog[], since: number | null, now: number): Since | null {
  if (since === null || !Number.isFinite(since) || now - since < MIN_AWAY_MS) return null;
  const fresh = logs.filter((l) => l.syncStatus === "confirmed" && !l.archived_at && stamp(l) > since && stamp(l) <= now);
  if (!fresh.length) return null;
  const days = Math.floor((now - since) / 86_400_000);
  return {
    sessions: fresh.length,
    xp: fresh.reduce((n, l) => n + (Number(l.xp) > 0 ? Number(l.xp) : 0), 0),
    minutes: Math.round(fresh.reduce((n, l) => n + (Number((l.details as { duration?: number } | undefined)?.duration) || 0), 0)),
    away: days >= 2 ? `${days} jours` : "hier",
  };
}

const key = (owner: string) => ownerKey("last-visit", owner);
export const loadLastVisit = (owner: string) => readJSON<number | null>(key(owner), null);
export const saveLastVisit = (owner: string, at: number) => writeJSON(key(owner), at).catch(() => {});
