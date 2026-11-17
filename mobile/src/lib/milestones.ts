/* AUD-41: life milestones in TITAN — the anniversary of one's first session and round numbers (sessions, hours of effort, held
   weeks). Derived from the journal on the phone; shown for 7 days after they happen, then they live in the history. These moments
   only exist because the history is here, and each one can become a story card. */
import { Format, Progress, type Cadence } from "../core";
import type { TrainingLog } from "../core/types";
import type { ShareCardData } from "../components/ShareCard";

const DAY = 86_400_000;
const SESSION_STEPS = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
const HOUR_STEPS = [10, 25, 50, 100, 200, 300, 500, 750, 1000];
const WEEK_STEPS = [4, 12, 26, 52, 78, 104, 156, 208];

export type Milestone = { id: string; date: Date; card: ShareCardData };

/** The most recent milestone reached in the last 7 days (anniversaries first), or null. */
export function recentMilestone(logs: TrainingLog[], { cadence = null, now = new Date() }: { cadence?: Cadence | null; now?: Date } = {}): Milestone | null {
  const list = logs.filter((l) => l?.sport && l.date).slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (!list.length) return null;
  const since = now.getTime() - 7 * DAY;
  const found: Milestone[] = [];

  // Anniversary of the first session.
  const first = new Date(list[0].date);
  for (let years = 1; years <= 20; years++) {
    const day = new Date(first.getFullYear() + years, first.getMonth(), first.getDate(), 12);
    if (day.getTime() > now.getTime()) break;
    if (day.getTime() >= since)
      found.push({ id: `anniversary-${years}`, date: day, card: { eyebrow: "Anniversaire TITAN", title: years === 1 ? "Un an sur TITAN" : `${years} ans sur TITAN`, value: `${years} an${years > 1 ? "s" : ""}`, caption: `Depuis ma première séance, le ${first.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} : ${Format.number(list.filter((l) => new Date(l.date).getTime() <= now.getTime()).length)} séances.`, icon: "crown", record: true } });
  }

  // Round numbers of sessions and hours: the session that crossed the step dates the milestone.
  let minutes = 0;
  list.forEach((l, i) => {
    const t = new Date(l.date).getTime();
    const before = minutes;
    minutes += Progress.minutesOf(l).minutes;
    if (t < since || t > now.getTime()) return;
    const n = i + 1;
    if (SESSION_STEPS.includes(n)) found.push({ id: `sessions-${n}`, date: new Date(t), card: { eyebrow: "Jalon", title: `Ma ${n}e séance`, value: `${n}`, caption: `${n} séances enregistrées depuis le ${first.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.`, icon: "medal" } });
    const h = HOUR_STEPS.find((s) => before < s * 60 && minutes >= s * 60);
    if (h) found.push({ id: `hours-${h}`, date: new Date(t), card: { eyebrow: "Jalon", title: `${h} heures d’effort`, value: `${h} h`, caption: "Tous sports confondus, chaque minute comptée.", icon: "bolt" } });
  });

  // Held weeks: the lifetime count shown when it lands exactly on a step this week.
  if (cadence && WEEK_STEPS.includes(cadence.lifetimeHeld) && cadence.currentDays >= cadence.target)
    found.push({ id: `weeks-${cadence.lifetimeHeld}`, date: now, card: { eyebrow: "Jalon", title: `${cadence.lifetimeHeld} semaines tenues`, value: `${cadence.lifetimeHeld}`, caption: "La régularité, sans jamais culpabiliser une pause.", icon: "ascent" } });

  if (!found.length) return null;
  return found.sort((a, b) => (a.id.startsWith("anniversary") ? -1 : 0) - (b.id.startsWith("anniversary") ? -1 : 0) || b.date.getTime() - a.date.getTime())[0];
}
