/* AUD-26: « TITAN Rétro » — the year in five story cards, computed on the phone from the journal (CareerRules, Questions,
   Progress). Nothing is sent, nothing is invented: a card without data is simply left out. */
import { CareerRules, Format, Progress, Questions, Sports, type Cadence } from "../core";
import type { TrainingLog } from "../core/types";
import type { ShareCardData } from "../components/ShareCard";

/** The Rétro is offered from 1 December to 31 January (the previous year in January), and always from the Career screen. */
export function retroYear(now = new Date()): number | null {
  const m = now.getMonth();
  if (m === 11) return now.getFullYear();
  if (m === 0) return now.getFullYear() - 1;
  return null;
}

export function buildRetro(logs: TrainingLog[], { year, cadence, rank }: { year: number; cadence?: Cadence | null; rank?: { name: string; level: number } | null }): ShareCardData[] {
  // Career "year" is the calendar year of `now`: read it at the last instant of the year asked.
  const end = new Date(year, 11, 31, 23, 59, 59);
  const now = Math.min(Date.now(), end.getTime());
  const career = CareerRules.build(logs, { now, range: "year" });
  if (career.empty || !career.totals.sessions) return [];
  const t = career.totals;
  const hours = Math.round(t.minutes / 60);
  const cards: ShareCardData[] = [];
  cards.push({
    eyebrow: `TITAN Rétro ${year}`,
    title: "Mon effort réel",
    value: `${Format.number(hours)} h`,
    caption: `${Format.number(t.sessions)} séance${t.sessions > 1 ? "s" : ""} · ${Format.number(t.activeDays)} jour${t.activeDays > 1 ? "s" : ""} actif${t.activeDays > 1 ? "s" : ""} · ${t.sports} sport${t.sports > 1 ? "s" : ""}`,
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
  const weeks = Questions.weeklySeries(logs, { weeks: 53, now: new Date(now) }).filter((w) => w.start.getFullYear() === year || new Date(w.start.getTime() + 6 * 86400000).getFullYear() === year);
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
      eyebrow: `${career.records.length} record${career.records.length > 1 ? "s" : ""} cette année`,
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
