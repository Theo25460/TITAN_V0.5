/* V11-14: the monthly report (and, COM-B8, the weekly one: Monday to Sunday), free, computed on the device from the confirmed journal. Pure: nothing is sent anywhere.
   Volumes are never mixed across units (time is the common measure, distance is shown only for distance sports), a month in progress
   is compared with the same days of the previous month, and estimated durations are always flagged. */
/**
 * @typedef {{ date: string | number | Date, sport?: string, unit?: string, val?: number | string, status?: string, archived_at?: unknown, is_suspicious?: boolean, details?: { distance_unknown?: boolean } | null }} JournalLog
 * @typedef {{ minutes: number, estimated?: boolean }} Minutes
 * @typedef {(log: JournalLog) => Minutes | null | undefined} MinutesOf
 * @typedef {{ sport: string, label: string, sessions: number, minutes: number, distanceKm: number | null }} SportSlice
 * @typedef {{ sessions: number, activeDays: number, minutes: number, estimatedMinutes: number, sports: SportSlice[] }} Slice
 */
(function (root) {
  "use strict";
  const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  /** @param {Date} d */
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  /** @param {JournalLog | null | undefined} l */
  const counted = (l) => l && !l.archived_at && !l.is_suspicious && !["flagged", "pending_review"].includes(String(l.status)) && Number.isFinite(new Date(l.date).getTime());

  /** @param {JournalLog[]} logs @param {Date} from @param {Date} to @param {MinutesOf} minutesOf @param {(sport: string) => string} label @returns {Slice} */
  function slice(logs, from, to, minutesOf, label) {
    const days = new Set(), sports = new Map();
    /** @type {Slice} */
    const out = { sessions: 0, activeDays: 0, minutes: 0, estimatedMinutes: 0, sports: [] };
    for (const l of logs) {
      const t = new Date(l.date).getTime();
      if (t < from.getTime() || t >= to.getTime()) continue;
      const m = minutesOf(l) || { minutes: 0, estimated: true };
      const minutes = Number.isFinite(m.minutes) ? m.minutes : 0;
      out.sessions++;
      out.minutes += minutes;
      if (m.estimated) out.estimatedMinutes += minutes;
      days.add(dayKey(new Date(l.date)));
      const key = String(l.sport);
      const s = sports.get(key) || { sport: key, label: label(key), sessions: 0, minutes: 0, distanceKm: 0, hasDistance: false };
      s.sessions++;
      s.minutes += minutes;
      if (l.unit === "km" && Number(l.val) > 0 && !l.details?.distance_unknown) { s.distanceKm += Number(l.val); s.hasDistance = true; }
      sports.set(key, s);
    }
    out.activeDays = days.size;
    out.minutes = Math.round(out.minutes);
    out.estimatedMinutes = Math.round(out.estimatedMinutes);
    out.sports = [...sports.values()].map((s) => ({ sport: s.sport, label: s.label, sessions: s.sessions, minutes: Math.round(s.minutes), distanceKm: s.hasDistance ? Math.round(s.distanceKm * 10) / 10 : null }))
      .sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions || a.label.localeCompare(b.label, "fr"));
    return out;
  }

  /** period "month" (default) or "year"; offset 0 = the one in progress, 1 = the one before…
   * @param {unknown} logs
   * @param {{ now?: Date, offset?: number, period?: string, minutesOf: MinutesOf, label?: (sport: string) => string, recordsOf?: (from: number, to: number) => unknown[], adventureOf?: (from: number, to: number) => unknown[] }} options */
  function build(logs, { now = new Date(), offset = 0, period = "month", minutesOf, label = (s) => s, recordsOf = () => [], adventureOf = () => [] }) {
    const list = (Array.isArray(logs) ? /** @type {JournalLog[]} */ (logs) : []).filter(counted).filter((l) => new Date(l.date).getTime() <= now.getTime() + 10 * 60000);
    const year = period === "year", week = period === "week";
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - offset * 7);
    const from = week ? monday : year ? new Date(now.getFullYear() - offset, 0, 1) : new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const fullTo = week ? new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7) : year ? new Date(from.getFullYear() + 1, 0, 1) : new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    const current = offset === 0;
    const to = current ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) : fullTo;
    const prevFrom = week ? new Date(from.getFullYear(), from.getMonth(), from.getDate() - 7) : year ? new Date(from.getFullYear() - 1, 0, 1) : new Date(from.getFullYear(), from.getMonth() - 1, 1);
    const prevFull = from;
    // The same stretch of days as elapsed in a period in progress, never more than the previous one has.
    let prevTo = prevFull;
    if (current) {
      const same = week ? new Date(prevFrom.getFullYear(), prevFrom.getMonth(), prevFrom.getDate() + Math.round((to.getTime() - from.getTime()) / 86400000)) : year ? new Date(prevFrom.getFullYear(), now.getMonth(), now.getDate() + 1) : new Date(prevFrom.getFullYear(), prevFrom.getMonth(), Math.min(now.getDate(), new Date(prevFull.getTime() - 1).getDate()) + 1);
      prevTo = same < prevFull ? same : prevFull;
    }
    const cur = slice(list, from, to, minutesOf, label);
    const prev = slice(list, prevFrom, prevTo, minutesOf, label);
    const comparable = prev.sessions > 0;
    /** @param {Date} d */
    const name = (d) => (week ? `la semaine du ${d.getDate()} ${MONTHS[d.getMonth()]}` : year ? String(d.getFullYear()) : MONTHS[d.getMonth()]);
    return {
      period: week ? "week" : year ? "year" : "month",
      from, to: fullTo, current, label: week ? `semaine du ${from.getDate()} ${MONTHS[from.getMonth()]}` : year ? String(from.getFullYear()) : `${MONTHS[from.getMonth()]} ${from.getFullYear()}`,
      ...cur,
      distanceKm: Math.round(cur.sports.reduce((a, s) => a + (s.distanceKm || 0), 0) * 10) / 10,
      records: (recordsOf(from.getTime(), to.getTime()) || []).slice(0, 5),
      adventure: (adventureOf(from.getTime(), fullTo.getTime()) || []).slice(0, 5),
      estimatedShare: cur.minutes > 0 ? cur.estimatedMinutes / cur.minutes : 0,
      previous: comparable ? { label: name(prevFrom), sessions: prev.sessions, activeDays: prev.activeDays, minutes: prev.minutes, estimatedMinutes: prev.estimatedMinutes } : null,
      comparison: comparable ? { minutes: cur.minutes - prev.minutes, activeDays: cur.activeDays - prev.activeDays, sessions: cur.sessions - prev.sessions, sameDays: current } : null,
    };
  }

  /** Words for the screen and the card. Never a verdict: a quieter month is described, not judged. */
  /** @param {any} r @param {{ duration?: (minutes: number) => string }} [options] */
  function describe(r, { duration = (m) => `${m} min` } = {}) {
    /** @param {number} n @param {string} one @param {string} many */
    const s = (n, one, many) => `${n} ${n > 1 ? many : one}`;
    const week = r?.period === "week";
    const unit = week ? "semaine" : r?.period === "year" ? "année" : "mois";
    if (!r || r.sessions === 0) return week ? { title: r?.current ? "La semaine commence." : "Une semaine de repos.", text: "Aucune séance enregistrée sur cette semaine.", notes: [] } : { title: r?.period === "year" ? (r.current ? "L’année commence." : "Une année sans séance enregistrée.") : r?.current ? "Le mois commence." : "Un mois de repos.", text: `Aucune séance enregistrée sur cette ${unit}.`.replace("cette mois", "ce mois"), notes: [] };
    const title = `${s(r.activeDays, "jour actif", "jours actifs")}, ${s(r.sports.length, "sport", "sports")}.`;
    let text;
    if (!r.comparison) text = week ? "Première semaine mesurée : la comparaison viendra avec la suivante." : r.period === "year" ? "Première année mesurée : la comparaison viendra avec la suivante." : "Premier mois mesuré : la comparaison viendra avec le suivant.";
    else {
      const d = r.comparison.minutes, since = r.comparison.sameDays ? ` sur les mêmes jours de ${r.previous.label}` : week ? ` que ${r.previous.label}` : r.period === "year" ? ` qu’en ${r.previous.label}` : ` qu’en ${r.previous.label}`;
      text = Math.abs(d) < 10 ? `${week ? "Dans le même rythme que" : "Dans ton rythme de"} ${r.previous.label}.` : d > 0 ? `${duration(d)} de plus${since}.` : `${duration(-d)} de moins${since}.`;
    }
    const notes = [];
    if (r.records?.length) notes.push(`${s(r.records.length, "record battu", "records battus")} ${week ? "cette semaine" : r.period === "year" ? "cette année" : "ce mois-ci"}.`);
    if (r.estimatedMinutes > 0) notes.push(`Dont ${duration(r.estimatedMinutes)} estimées pour des séances sans durée.`);
    if (r.current) notes.push(`${week ? "Semaine" : r.period === "year" ? "Année" : "Mois"} en cours : le bilan évolue avec tes séances.`);
    return { title, text, notes };
  }

  const api = { build, describe, MONTHS };
  /** @type {any} */ (root).TitanMonthReport = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
