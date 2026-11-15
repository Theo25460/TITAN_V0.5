/* AUD-26 / AUD-37: « TITAN Rétro » — a year or a month in story cards, computed on the phone from the journal (CareerRules,
   Questions). Nothing is sent, nothing is invented: a card without data is simply left out. Each Rétro compares itself with the
   period before: that comparison only exists where the history lives, which is what makes TITAN hard to replace. */
import { CareerRules, Format, Progress, Questions, Sports, type Cadence } from "../core";
import type { TrainingLog } from "../core/types";
import type { ShareCardData } from "../components/ShareCard";

export type RetroPeriod = { year: number; month?: number | null };

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** The yearly Rétro is offered from 1 December to 31 January (the previous year in January), and always from the Career screen. */
export function retroYear(now = new Date()): number | null {
  const m = now.getMonth();
  if (m === 11) return now.getFullYear();
  if (m === 0) return now.getFullYear() - 1;
  return null;
}

/** AUD-37: the monthly Rétro of the previous month is offered during the first seven days of a month. */
export function retroMonth(now = new Date()): { year: number; month: number } | null {
  if (now.getDate() > 7) return null;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: prev.getFullYear(), month: prev.getMonth() };
}

export function periodBounds({ year, month }: RetroPeriod): { from: Date; to: Date; label: string; previous: RetroPeriod; previousLabel: string } {
  if (month == null) return { from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1), label: String(year), previous: { year: year - 1 }, previousLabel: String(year - 1) };
  const prev = new Date(year, month - 1, 1);
  return {
    from: new Date(year, month, 1),
    to: new Date(year, month + 1, 1),
    label: `${MONTHS[month]} ${year}`,
    previous: { year: prev.getFullYear(), month: prev.getMonth() },
    previousLabel: MONTHS[prev.getMonth()],
  };
}

const inPeriod = (logs: TrainingLog[], p: RetroPeriod) => {
  const { from, to } = periodBounds(p);
  return logs.filter((l) => {
    const t = new Date(l.date).getTime();
    return t >= from.getTime() && t < to.getTime();
  });
};

/** A short, honest comparison with the period before (« +18 % d'effort que l'an dernier »), or null without history. */
export function compareWithPrevious(logs: TrainingLog[], p: RetroPeriod): string | null {
  const { previous, previousLabel } = periodBounds(p);
  const now = periodBounds(p).to.getTime() - 1;
  const cur = CareerRules.build(inPeriod(logs, p), { now, range: "all" });
  const before = CareerRules.build(inPeriod(logs, previous), { now: periodBounds(previous).to.getTime() - 1, range: "all" });
  if (before.empty || !before.totals.minutes || cur.empty) return null;
  const ratio = cur.totals.minutes / before.totals.minutes - 1;
  const pct = Math.round(ratio * 100);
  const vs = `qu’en ${previousLabel}`;
  if (Math.abs(pct) < 3) return `Autant d’effort ${vs} : la régularité, c’est ça.`;
  return pct > 0 ? `+${pct} % d’effort ${vs}.` : `${pct} % d’effort ${vs} : une période plus calme, ça fait partie du chemin.`;
}

export function buildRetro(logs: TrainingLog[], { year, month = null, cadence, rank }: RetroPeriod & { cadence?: Cadence | null; rank?: { name: string; level: number } | null }): ShareCardData[] {
  const period: RetroPeriod = { year, month };
  const { from, to, label } = periodBounds(period);
  const subset = inPeriod(logs, period);
  const now = Math.min(Date.now(), to.getTime() - 1);
  const career = CareerRules.build(subset, { now, range: "all" });
  if (career.empty || !career.totals.sessions) return [];
  const isMonth = month != null;
  const t = career.totals;
  const cards: ShareCardData[] = [];
  const comparison = compareWithPrevious(logs, period);
  cards.push({
    eyebrow: `TITAN Rétro · ${label}`,
    title: "Mon effort réel",
    value: t.minutes >= 120 ? `${Format.number(Math.round(t.minutes / 60))} h` : Format.duration(t.minutes),
    caption: [`${Format.number(t.sessions)} séance${t.sessions > 1 ? "s" : ""} · ${Format.number(t.activeDays)} jour${t.activeDays > 1 ? "s" : ""} actif${t.activeDays > 1 ? "s" : ""} · ${t.sports} sport${t.sports > 1 ? "s" : ""}`, comparison].filter(Boolean).join("\n"),
    icon: "bolt",
  });
  const fams = career.families.filter((f) => f.sessions > 0).slice(0, 3);
  const top = career.sports[0];
  if (top) {
    cards.push({
      eyebrow: "Mon ADN sportif",
      title: top.label,
      value: `${Math.round((fams[0]?.share ?? 0) * 100)} %`,
      caption: fams.length > 1 ? `${fams.map((f) => `${f.label} ${Math.round(f.share * 100)} %`).join(" · ")}` : `${fams[0]?.label ?? ""} avant tout`,
      facts: career.sports.slice(0, 3).map((s) => [s.label, Format.duration(s.minutes)] as [string, string]),
      icon: Sports.iconOf(top.sport),
    });
  }
  const weeks = Questions.weeklySeries(subset, { weeks: isMonth ? 6 : 53, now: new Date(now) }).filter((w) => w.start.getTime() < to.getTime() && w.start.getTime() + 7 * 86400000 > from.getTime());
  const best = weeks.reduce<(typeof weeks)[number] | null>((b, w) => (!b || w.minutes > b.minutes ? w : b), null);
  if (best && best.minutes > 0) {
    cards.push({
      eyebrow: "Ma plus grosse semaine",
      title: `Semaine du ${best.start.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`,
      value: Format.duration(best.minutes),
      caption: `${best.sessions} séance${best.sessions > 1 ? "s" : ""} sur ${best.activeDays} jour${best.activeDays > 1 ? "s" : ""}`,
      icon: "calendar",
    });
  }
  if (career.records.length) {
    const r = career.records[0];
    cards.push({
      eyebrow: `${career.records.length} record${career.records.length > 1 ? "s" : ""} ${isMonth ? "ce mois-ci" : "cette année"}`,
      title: `${r.sportLabel} · ${r.label}`,
      value: `${typeof r.value === "number" ? Format.number(r.value) : r.value}${r.unit ? ` ${r.unit}` : ""}`,
      icon: "trophy",
      record: true,
    });
  }
  if (cadence || rank) {
    cards.push({
      eyebrow: "Ma régularité",
      title: rank ? `Rang ${rank.name} · niveau ${rank.level}` : "Semaines tenues",
      value: cadence ? `${cadence.lifetimeHeld} sem.` : `Niv. ${rank!.level}`,
      caption: cadence ? "tenues depuis mes débuts sur TITAN, sans jamais culpabiliser une pause" : null,
      icon: "ascent",
    });
  }
  return cards;
}

/** Re-exported so the screen and the QG agree on what counts. */
export const activeForRetro = (logs: TrainingLog[]) => Progress.activeLogs(logs);
