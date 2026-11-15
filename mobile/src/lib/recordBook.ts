/* AUD-42: « Livre d'or des records » — for each current record, the dated chain of its improvements since the first time. Computed
   from the journal on the phone with the website's record rules, one snapshot per month (bounded cost: at most one record pass per
   month of history). Only a long history makes this book thick, and it cannot be rebuilt elsewhere. */
import { Insights } from "../core";
import type { TrainingLog } from "../core/types";

export type RecordStep = { value: number | string; unit: string; date: string; logId: string };

export function recordHistory(logs: TrainingLog[], now = Date.now()): Map<string, RecordStep[]> {
  const pool = logs.filter((l) => l?.sport && l.date && (l.syncStatus === "confirmed" || !l.syncStatus)).slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const out = new Map<string, RecordStep[]>();
  if (!pool.length) return out;
  const first = new Date(pool[0].date);
  const cursor = new Date(first.getFullYear(), first.getMonth() + 1, 1);
  const ends: number[] = [];
  while (cursor.getTime() < now && ends.length < 240) {
    ends.push(cursor.getTime());
    cursor.setMonth(cursor.getMonth() + 1);
  }
  ends.push(now + 1);
  let i = 0;
  for (const end of ends) {
    while (i < pool.length && new Date(pool[i].date).getTime() < end) i++;
    for (const r of Insights.records(pool.slice(0, i), "all", end - 1)) {
      const steps = out.get(r.id) ?? [];
      const last = steps[steps.length - 1];
      if (!last || last.logId !== r.log.id) steps.push({ value: r.value, unit: r.unit, date: r.log.date, logId: r.log.id });
      out.set(r.id, steps);
    }
  }
  return out;
}
