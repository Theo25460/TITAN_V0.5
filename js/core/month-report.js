/* V11-14: the monthly report, free, computed on the device from the confirmed journal. Pure: nothing is sent anywhere.
   Volumes are never mixed across units (time is the common measure, distance is shown only for distance sports), a month in progress
   is compared with the same days of the previous month, and estimated durations are always flagged. */
(function (root) {
  "use strict";
  const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const counted = (l) => l && !l.archived_at && !l.is_suspicious && !["flagged", "pending_review"].includes(l.status) && Number.isFinite(new Date(l.date).getTime());

  function slice(logs, from, to, minutesOf, label) {
    const days = new Set(), sports = new Map();
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
      const s = sports.get(l.sport) || { sport: l.sport, label: label(l.sport), sessions: 0, minutes: 0, distanceKm: 0, hasDistance: false };
      s.sessions++;
      s.minutes += minutes;
      if (l.unit === "km" && Number(l.val) > 0 && !l.details?.distance_unknown) { s.distanceKm += Number(l.val); s.hasDistance = true; }
      sports.set(l.sport, s);
    }
    out.activeDays = days.size;
    out.minutes = Math.round(out.minutes);
    out.estimatedMinutes = Math.round(out.estimatedMinutes);
    out.sports = [...sports.values()].map((s) => ({ sport: s.sport, label: s.label, sessions: s.sessions, minutes: Math.round(s.minutes), distanceKm: s.hasDistance ? Math.round(s.distanceKm * 10) / 10 : null }))
      .sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions || a.label.localeCompare(b.label, "fr"));
    return out;
  }

  /** offset 0 = this month (in progress), 1 = last month… */
  function build(logs, { now = new Date(), offset = 0, minutesOf, label = (s) => s } = {}) {
    const list = (logs || []).filter(counted).filter((l) => new Date(l.date).getTime() <= now.getTime() + 10 * 60000);
    const from = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const fullTo = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    const current = offset === 0;
    const to = current ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) : fullTo;
    const prevFrom = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    const prevFull = from;
    // Same number of days as elapsed in a month in progress, never more than the previous month has.
    const elapsed = current ? now.getDate() : null;
    const prevTo = elapsed ? new Date(prevFrom.getFullYear(), prevFrom.getMonth(), Math.min(elapsed, new Date(prevFull.getTime() - 1).getDate()) + 1) : prevFull;
    const cur = slice(list, from, to, minutesOf, label);
    const prev = slice(list, prevFrom, prevTo, minutesOf, label);
    const comparable = prev.sessions > 0;
    return {
      from, to: fullTo, current, label: `${MONTHS[from.getMonth()]} ${from.getFullYear()}`,
      ...cur,
      distanceKm: Math.round(cur.sports.reduce((a, s) => a + (s.distanceKm || 0), 0) * 10) / 10,
      estimatedShare: cur.minutes > 0 ? cur.estimatedMinutes / cur.minutes : 0,
      previous: comparable ? { label: `${MONTHS[prevFrom.getMonth()]}`, sessions: prev.sessions, activeDays: prev.activeDays, minutes: prev.minutes, estimatedMinutes: prev.estimatedMinutes } : null,
      comparison: comparable ? { minutes: cur.minutes - prev.minutes, activeDays: cur.activeDays - prev.activeDays, sessions: cur.sessions - prev.sessions, sameDays: current } : null,
    };
  }

  /** Words for the screen and the card. Never a verdict: a quieter month is described, not judged. */
  function describe(r, { duration = (m) => `${m} min` } = {}) {
    const s = (n, one, many) => `${n} ${n > 1 ? many : one}`;
    if (!r || r.sessions === 0) return { title: r?.current ? "Le mois commence." : "Un mois de repos.", text: "Aucune séance enregistrée sur ce mois.", notes: [] };
    const title = `${s(r.activeDays, "jour actif", "jours actifs")}, ${s(r.sports.length, "sport", "sports")}.`;
    let text;
    if (!r.comparison) text = "Premier mois mesuré : la comparaison viendra avec le suivant.";
    else {
      const d = r.comparison.minutes, since = r.comparison.sameDays ? ` sur les mêmes jours de ${r.previous.label}` : ` qu’en ${r.previous.label}`;
      text = Math.abs(d) < 10 ? `Dans ton rythme${r.comparison.sameDays ? ` de ${r.previous.label}` : ` de ${r.previous.label}`}.` : d > 0 ? `${duration(d)} de plus${since}.` : `${duration(-d)} de moins${since}.`;
    }
    const notes = [];
    if (r.estimatedMinutes > 0) notes.push(`Dont ${duration(r.estimatedMinutes)} estimées pour des séances sans durée.`);
    if (r.current) notes.push("Mois en cours : le bilan évolue avec tes séances.");
    return { title, text, notes };
  }

  const api = { build, describe, MONTHS };
  root.TitanMonthReport = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
