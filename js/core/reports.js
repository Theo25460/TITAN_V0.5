/* TITAN — validate server report aggregates and export the same calendar snapshot. */
(function () {
  "use strict";
  const stamp = v => typeof v === "string" && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
  const day = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + "T12:00:00Z")) && new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
  const number = v => typeof v === "number" && Number.isFinite(v) && v >= 0;
  const count = v => number(v) && Number.isSafeInteger(v);
  const uuid = v => typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
  const shift = (v, n, months = false) => {
    const d = new Date(v + "T12:00:00Z");
    if (months) d.setUTCMonth(d.getUTCMonth() + n); else d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const distance = (a, b) => (Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000;
  const localDay = (v, zone) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(v));
    const get = k => parts.find(p => p.type === k).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  };
  const metrics = (v, days) => v && count(v.sessions) && count(v.active_days) && number(v.minutes) && count(v.estimated_sessions)
    && v.active_days <= Math.min(days, v.sessions) && v.estimated_sessions <= v.sessions
    && (v.sessions > 0 ? v.active_days > 0 : v.minutes === 0 && v.estimated_sessions === 0);
  const sameSum = (rows, total, includeDays) => {
    for (const key of ["sessions", "estimated_sessions", ...(includeDays ? ["active_days"] : [])]) {
      if (rows.reduce((a, r) => a + r[key], 0) !== total[key]) return false;
    }
    return Math.abs(rows.reduce((a, r) => a + r.minutes, 0) - total.minutes) <= 0.05 * (rows.length + 1) + 1e-8;
  };
  function valid(j, options, owner) {
    try {
      if (!uuid(owner) || j?.version !== 1 || j.owner !== owner || j.available !== true || !stamp(j.as_of)
        || !["month", "year"].includes(j.period) || ![0, 1].includes(j.offset) || j.current !== (j.offset === 0)
        || j.period !== options.p_period || j.offset !== options.p_offset || j.timezone !== options.p_timezone) return false;
      const today = localDay(j.as_of, j.timezone), annual = j.period === "year";
      const start = annual ? today.slice(0, 4) + "-01-01" : today.slice(0, 7) + "-01";
      const from = shift(start, -j.offset * (annual ? 12 : 1), true), to = shift(from, annual ? 12 : 1, true);
      const observedTo = j.current ? shift(today, 1) : to;
      const days = distance(from, observedTo);
      const size = j.current ? Number(today.slice(annual ? 5 : 8, annual ? 7 : 10)) : (annual ? 12 : distance(from, to));
      if (j.from !== from || j.to !== to || !metrics(j, days) || !Array.isArray(j.sports) || !Array.isArray(j.series)
        || j.series.length !== size || !Array.isArray(j.sources) || j.sources.length !== Math.min(5, j.sessions)) return false;
      if (j.series.some((r, i) => r.from !== shift(from, i, annual) || r.to !== shift(from, i + 1, annual)
        || !metrics(r, distance(r.from, r.to < observedTo ? r.to : observedTo)))) return false;
      if (!sameSum(j.series, j, true) || !sameSum(j.sports, j, false)) return false;
      const sports = new Map();
      for (const s of j.sports) {
        if (typeof s.sport !== "string" || !s.sport || s.sport.length > 80 || sports.has(s.sport) || s.sessions === 0
          || !metrics(s, j.active_days)) return false;
        sports.set(s.sport, s);
      }
      if (j.sports.reduce((a, s) => a + s.active_days, 0) < j.active_days) return false;
      const seen = new Set(), sourceRows = [];
      for (let i = 0; i < j.sources.length; i++) {
        const s = j.sources[i], prev = j.sources[i - 1];
        if (!uuid(s.id) || seen.has(s.id) || !sports.has(s.sport) || !stamp(s.date) || !number(s.minutes) || typeof s.estimated !== "boolean") return false;
        const date = localDay(s.date, j.timezone);
        if (!day(date) || date < from || date >= to || Date.parse(s.date) >= Date.parse(j.as_of)
          || (prev && (Date.parse(prev.date) < Date.parse(s.date) || (Date.parse(prev.date) === Date.parse(s.date) && prev.id < s.id)))) return false;
        seen.add(s.id);
        sourceRows.push({ ...s, day: date, sessions: 1, active_days: 1, estimated_sessions: Number(s.estimated) });
      }
      // The bounded examples cannot exceed the aggregates they explain.
      for (const row of [...j.sports, ...j.series]) {
        const subset = sourceRows.filter(s => row.sport ? s.sport === row.sport : s.day >= row.from && s.day < row.to);
        if (subset.length > row.sessions || new Set(subset.map(s => s.day)).size > row.active_days
          || subset.reduce((a, s) => a + s.estimated_sessions, 0) > row.estimated_sessions
          || subset.reduce((a, s) => a + s.minutes, 0) > row.minutes + 0.05 * (subset.length + 1) + 1e-8) return false;
      }
      if (j.sessions <= 5 && (!sameSum(sourceRows, j, false) || new Set(sourceRows.map(s => s.day)).size !== j.active_days)) return false;
      return true;
    } catch { return false; }
  }
  function csv(j, labelOf = v => v) {
    const cell = v => {
      let s = String(v);
      if (typeof v === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const rows = [["Type", "Libellé", "Début inclus", "Fin exclue", "Fuseau", "Statut", "Calcul arrêté à", "Séances", "Jours actifs", "Minutes", "Durées estimées"]];
    const add = (type, label, r, from = j.from, to = j.to) => rows.push([type, label, from, to, j.timezone, j.current ? "Provisoire" : "Période complète", j.as_of, r.sessions, r.active_days, r.minutes, r.estimated_sessions]);
    add("Total", "Tous les sports", j);
    for (const s of j.sports) add("Sport", labelOf(s.sport), s);
    for (const s of j.series) add(j.period === "month" ? "Jour" : "Mois", s.from, s, s.from, s.to);
    return "\uFEFF" + rows.map(r => r.map(cell).join(";")).join("\r\n") + "\r\n";
  }
  window.TitanReports = { valid, csv };
})();
