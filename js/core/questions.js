/* TITAN 300 — statistics that answer questions. Pure functions over sessions; every answer says
   what it is based on, and stays silent when the data is too thin to say something true. */
(function (root) {
  "use strict";
  const DAY = 86400000;
  const F = () => root.TitanFormat;
  const P = () => root.TitanProgress;
  const T = () => root.TitanTraining;
  const I = () => root.TitanInsights;

  const median = (values) => {
    const v = values.slice().sort((a, b) => a - b);
    if (!v.length) return null;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  };
  const monthKey = (d) => {
    const t = new Date(d);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  };
  const monthLabel = (key) => new Date(key + "-15T12:00:00").toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");

  /** Minutes, sessions and active days for the last `weeks` weeks (oldest first, current week last). */
  function weeklySeries(logs, { weeks = 12, now = new Date() } = {}) {
    const current = F().weekStart(now).getTime();
    const list = P().activeLogs(logs, now);
    const out = [];
    for (let k = weeks - 1; k >= 0; k--) {
      const from = F().weekStart(new Date(current - k * 7 * DAY + DAY)).getTime();
      const to = from + 7 * DAY;
      const inWeek = list.filter((l) => {
        const t = new Date(l.date).getTime();
        return t >= from && t < to;
      });
      const s = P().summarize(inWeek);
      out.push({ start: new Date(from), minutes: s.minutes, sessions: s.sessions, activeDays: s.activeDays, current: k === 0 });
    }
    return out;
  }

  /** Recent 4 complete weeks against the 4 before; null until there is enough history. */
  function volumeTrend(series) {
    const done = series.filter((w) => !w.current);
    if (done.length < 8) return null;
    const recent = done.slice(-4);
    const before = done.slice(-8, -4);
    if (before.every((w) => w.sessions === 0)) return null;
    const avg = (arr) => arr.reduce((n, w) => n + w.minutes, 0) / arr.length;
    const r = avg(recent),
      b = avg(before);
    const ratio = b > 0 ? r / b : null;
    const direction = ratio === null ? "new" : ratio >= 1.1 ? "up" : ratio <= 0.9 ? "down" : "stable";
    return { recent: Math.round(r), before: Math.round(b), ratio, direction };
  }

  /** Monthly median pace (s/km) of the main distance sport, for sessions long enough to compare. */
  function paceTrend(logs, { now = new Date(), months = 6 } = {}) {
    const list = P().activeLogs(logs, now).filter((l) => l.unit === "km" && Number(l.val) >= 3 && T().duration(l) > 0);
    if (!list.length) return null;
    const counts = {};
    for (const l of list) counts[l.sport] = (counts[l.sport] || 0) + 1;
    const sport = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const since = new Date(now);
    since.setMonth(since.getMonth() - months + 1, 1);
    since.setHours(0, 0, 0, 0);
    const byMonth = new Map();
    for (const l of list.filter((x) => x.sport === sport && new Date(x.date) >= since)) {
      const pace = (T().duration(l) * 60) / Number(l.val);
      if (pace < 120 || pace > 1800) continue; // 2:00 to 30:00 /km: anything else is a typo
      const k = monthKey(l.date);
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k).push(pace);
    }
    const points = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ month: k, label: monthLabel(k), pace: median(v), sessions: v.length }));
    const solid = points.filter((p) => p.sessions >= 2);
    if (solid.length < 2) return { sport, points, enough: false };
    const first = solid[0],
      last = solid[solid.length - 1];
    return { sport, points, enough: true, first, last, delta: last.pace - first.pace };
  }

  /** Most practised exercise: best working weight per month. */
  function strengthTrend(logs, { now = new Date(), months = 6 } = {}) {
    if (!I()?.strength) return null;
    const groups = I().strength(P().activeLogs(logs, now)).filter((g) => g.maxWeight && g.sessions.length >= 2);
    if (!groups.length) return null;
    const g = groups[0];
    const since = new Date(now);
    since.setMonth(since.getMonth() - months + 1, 1);
    since.setHours(0, 0, 0, 0);
    const byMonth = new Map();
    for (const s of g.sessions) {
      if (new Date(s.log.date) < since) continue;
      const ex = (s.log.details?.exercises || []).filter((e) => e.name && e.name.trim().toLocaleLowerCase("fr-FR") === g.name.trim().toLocaleLowerCase("fr-FR"));
      const best = Math.max(0, ...ex.flatMap((e) => I().sets(e).map((r) => r.weight)));
      if (!(best > 0)) continue;
      const k = monthKey(s.log.date);
      byMonth.set(k, Math.max(byMonth.get(k) || 0, best));
    }
    const points = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ month: k, label: monthLabel(k), weight: v }));
    return { name: g.name, variant: g.variant, sessions: g.sessions.length, points, enough: points.length >= 2, delta: points.length >= 2 ? points[points.length - 1].weight - points[0].weight : null };
  }

  /** Best climbed grade per month, inside one grading system only. */
  function climbingTrend(logs, { now = new Date(), months = 6 } = {}) {
    if (!I()?.grade) return null;
    const list = P().activeLogs(logs, now).filter((l) => l.details?.extras?.max_done && l.details?.extras?.grade_system);
    if (!list.length) return null;
    const bySystem = {};
    for (const l of list) bySystem[l.details.extras.grade_system] = (bySystem[l.details.extras.grade_system] || 0) + 1;
    const system = Object.keys(bySystem).sort((a, b) => bySystem[b] - bySystem[a])[0];
    const since = new Date(now);
    since.setMonth(since.getMonth() - months + 1, 1);
    since.setHours(0, 0, 0, 0);
    const byMonth = new Map();
    for (const l of list.filter((x) => x.details.extras.grade_system === system && new Date(x.date) >= since)) {
      const g = I().grade(l.details.extras.max_done, system);
      if (!g) continue;
      const k = monthKey(l.date);
      const prev = byMonth.get(k);
      if (!prev || g.score > prev.score) byMonth.set(k, g);
    }
    const points = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, g]) => ({ month: k, label: monthLabel(k), grade: g.label, score: g.score }));
    return { system, points, enough: points.length >= 2, up: points.length >= 2 && points[points.length - 1].score > points[0].score };
  }

  /** Training load (minutes × RPE) of the week against the 4 previous weeks. Needs RPE on most sessions. */
  function load(logs, { now = new Date() } = {}) {
    const list = P().activeLogs(logs, now);
    const current = F().weekStart(now).getTime();
    const weekLoad = (from) => {
      const inWeek = list.filter((l) => {
        const t = new Date(l.date).getTime();
        return t >= from && t < from + 7 * DAY;
      });
      const rated = inWeek.filter((l) => T().load(l) !== null);
      return { load: rated.reduce((n, l) => n + T().load(l), 0), sessions: inWeek.length, rated: rated.length };
    };
    const thisWeek = weekLoad(current);
    const previous = [1, 2, 3, 4].map((k) => weekLoad(F().weekStart(new Date(current - k * 7 * DAY + DAY)).getTime()));
    const sessions = previous.reduce((n, w) => n + w.sessions, 0) + thisWeek.sessions;
    const rated = previous.reduce((n, w) => n + w.rated, 0) + thisWeek.rated;
    if (sessions < 4 || rated / sessions < 0.6) return { enough: false, coverage: sessions ? rated / sessions : 0 };
    const base = previous.reduce((n, w) => n + w.load, 0) / 4;
    if (!(base > 0)) return { enough: false, coverage: rated / sessions };
    const ratio = thisWeek.load / base;
    return { enough: true, week: Math.round(thisWeek.load), base: Math.round(base), ratio, level: ratio > 1.5 ? "high" : ratio < 0.6 ? "low" : "usual" };
  }

  /** Where the time goes, by family, over a period. */
  function familyShare(logs, { now = new Date(), days = 84 } = {}) {
    const since = new Date(now).getTime() - days * DAY;
    const list = P().activeLogs(logs, now).filter((l) => new Date(l.date).getTime() >= since);
    const fam = {};
    const sports = {};
    let total = 0;
    for (const l of list) {
      const m = P().minutesOf(l).minutes || 0;
      const meta = P().sportMeta(l.sport);
      fam[meta.family] = (fam[meta.family] || 0) + m;
      sports[l.sport] = sports[l.sport] || { sport: l.sport, label: meta.label, minutes: 0, sessions: 0 };
      sports[l.sport].minutes += m;
      sports[l.sport].sessions++;
      total += m;
    }
    return {
      total: Math.round(total),
      sessions: list.length,
      families: Object.entries(fam)
        .map(([id, minutes]) => ({ id, minutes: Math.round(minutes), share: total ? minutes / total : 0 }))
        .sort((a, b) => b.minutes - a.minutes),
      sports: Object.values(sports).sort((a, b) => b.minutes - a.minutes).slice(0, 5),
    };
  }

  const api = { weeklySeries, volumeTrend, paceTrend, strengthTrend, climbingTrend, load, familyShare, median };
  root.TitanQuestions = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
