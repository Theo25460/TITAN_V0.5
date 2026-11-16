/* AUD-46: « ta semaine type » — the median of the last 12 complete weeks (active days, minutes), learned from the journal. The more
   history, the more personal the reference: this week is told against it (« déjà 2 h sur ta semaine type de 2 h 40 »). */
import { Progress, Questions } from "../core";
import type { TrainingLog } from "../core/types";

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type Baseline = { minutes: number; activeDays: number; weeks: number; current: { minutes: number; activeDays: number } };

/** Null until 4 complete weeks with at least one session exist (no reference from too little history). */
export function weeklyBaseline(logs: TrainingLog[], now = new Date()): Baseline | null {
  const series = Questions.weeklySeries(Progress.activeLogs(logs, now), { weeks: 13, now });
  const done = series.filter((w) => !w.current).slice(-12);
  const lived = done.filter((w) => w.sessions > 0);
  if (lived.length < 4) return null;
  const cur = series.find((w) => w.current);
  return {
    minutes: Math.round(median(done.map((w) => w.minutes))),
    activeDays: Math.round(median(done.map((w) => w.activeDays))),
    weeks: done.length,
    current: { minutes: Math.round(cur?.minutes ?? 0), activeDays: cur?.activeDays ?? 0 },
  };
}

export function baselineLine(b: Baseline, duration: (m: number) => string): string {
  const ratio = b.minutes ? b.current.minutes / b.minutes : 0;
  if (ratio >= 1.2) return `Déjà ${duration(b.current.minutes)} : au-dessus de ta semaine type (${duration(b.minutes)}).`;
  if (ratio >= 1) return `Ta semaine type est atteinte : ${duration(b.current.minutes)} sur ${duration(b.minutes)}.`;
  return `${duration(b.current.minutes)} sur ta semaine type de ${duration(b.minutes)} · ${b.current.activeDays}/${b.activeDays} jour${b.activeDays > 1 ? "s" : ""}.`;
}
