/* TITAN — « le programme »: a person's practice laid out like the schedule of a sports meeting, one line per sport and one
   column per day (or per week). It is TITAN's signature figure: it shows at a glance what only a multisport journal knows, which
   sports, on which days, for how long. Pure and deterministic, shared by the website and Android: renderers only draw the result.
   Nothing here grants or estimates anything: a cell exists because confirmed sessions exist on that day. */
(function (root) {
  "use strict";

  const DAY = 86400000;
  const LETTERS = ["L", "M", "M", "J", "V", "S", "D"];
  const NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

  const pad = (n) => (n < 10 ? "0" + n : "" + n);
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function monday(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  /* Four steps of ink for a cell, from the minutes of the day (0 = nothing). The thresholds are those of the effort rules people
     already read elsewhere in TITAN: a short session, half an hour, an hour. */
  function level(minutes) {
    if (!(minutes > 0)) return 0;
    if (minutes < 20) return 1;
    if (minutes < 45) return 2;
    if (minutes < 75) return 3;
    return 4;
  }

  function accessors(o) {
    return {
      minutesOf: typeof o.minutesOf === "function" ? o.minutesOf : (l) => Number(l && l.minutes) || 0,
      familyOf: typeof o.familyOf === "function" ? o.familyOf : () => "endurance",
      labelOf: typeof o.labelOf === "function" ? o.labelOf : (s) => String(s),
    };
  }

  /* Lines sorted by time spent, the longest first; beyond `maxRows` the rest is folded in one line « Autres » so the figure keeps
     its height on a phone. */
  function fold(bySport, columns, maxRows, a) {
    const all = Object.keys(bySport).map((sport) => bySport[sport]).sort((x, y) => y.minutes - x.minutes || y.sessions - x.sessions || (x.sport < y.sport ? -1 : 1));
    const rows = all.slice(0, all.length > maxRows ? maxRows - 1 : maxRows);
    const rest = all.slice(rows.length);
    let more = null;
    if (rest.length) {
      more = { sports: rest.length, minutes: 0, sessions: 0, cells: Array.from({ length: columns }, () => null) };
      for (const r of rest) {
        more.minutes += r.minutes; more.sessions += r.sessions;
        r.cells.forEach((c, i) => { if (c) { const t = more.cells[i] || (more.cells[i] = { minutes: 0, sessions: 0, level: 0 }); t.minutes += c.minutes; t.sessions += c.sessions; t.level = level(t.minutes); } });
      }
    }
    return { rows: rows.map((r) => ({ sport: r.sport, label: a.labelOf(r.sport), family: a.familyOf(r.sport), minutes: Math.round(r.minutes), sessions: r.sessions, cells: r.cells })), more };
  }

  /** One week, Monday to Sunday. options: { start (any day of the week, default now), now, maxRows (4), plan (array of 7 sport
      ids or null: the person's usual week), minutesOf, familyOf, labelOf }. */
  function week(logs, options) {
    const o = options || {};
    const a = accessors(o);
    const now = o.now ? new Date(o.now) : new Date();
    const from = monday(o.start || now);
    const todayKey = keyOf(now);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(from, i);
      const key = keyOf(d);
      return { key, index: i, letter: LETTERS[i], name: NAMES[i], date: d.getDate(), today: key === todayKey, future: key > todayKey };
    });
    const index = {};
    days.forEach((d) => { index[d.key] = d.index; });
    const bySport = {};
    const totals = { minutes: 0, sessions: 0, activeDays: 0, cells: Array.from({ length: 7 }, () => 0) };
    for (const l of logs || []) {
      if (!l || !l.sport || !l.date) continue;
      const i = index[keyOf(new Date(l.date))];
      if (i === undefined) continue;
      const m = Math.max(0, Number(a.minutesOf(l)) || 0);
      const row = bySport[l.sport] || (bySport[l.sport] = { sport: l.sport, minutes: 0, sessions: 0, cells: Array.from({ length: 7 }, () => null) });
      const cell = row.cells[i] || (row.cells[i] = { minutes: 0, sessions: 0, level: 0 });
      cell.minutes += m; cell.sessions += 1; cell.level = Math.max(1, level(cell.minutes));
      row.minutes += m; row.sessions += 1;
      totals.minutes += m; totals.sessions += 1; totals.cells[i] += m;
    }
    totals.minutes = Math.round(totals.minutes);
    totals.activeDays = totals.cells.filter((m, i) => m > 0 || Object.keys(bySport).some((s) => bySport[s].cells[i])).length;
    const folded = fold(bySport, 7, Math.max(1, o.maxRows || 4), a);
    // The usual week: a planned day that has no session yet and is not in the past shows as an empty frame on its sport's line.
    const plan = Array.isArray(o.plan) ? o.plan : null;
    const planned = [];
    if (plan) days.forEach((d) => {
      const sport = plan[d.index];
      if (!sport || (!d.today && !d.future)) return;
      const row = folded.rows.find((r) => r.sport === sport);
      if (row && row.cells[d.index]) return;
      planned.push({ day: d.index, sport, label: a.labelOf(sport), family: a.familyOf(sport), row: row ? folded.rows.indexOf(row) : -1 });
    });
    return { kind: "week", from: keyOf(from), to: days[6].key, days, rows: folded.rows, more: folded.more, totals, planned };
  }

  /** Several weeks, one column per week, the current week last. options: { weeks (8, 2 to 26), now, maxRows (5), … }. */
  function span(logs, options) {
    const o = options || {};
    const a = accessors(o);
    const now = o.now ? new Date(o.now) : new Date();
    const count = Math.max(2, Math.min(26, Math.floor(o.weeks || 8)));
    const last = monday(now);
    const first = addDays(last, -7 * (count - 1));
    const columns = Array.from({ length: count }, (_, i) => { const d = addDays(first, i * 7); return { key: keyOf(d), index: i, date: d.getDate(), month: d.getMonth(), current: i === count - 1 }; });
    const bySport = {};
    const totals = { minutes: 0, sessions: 0, cells: Array.from({ length: count }, () => 0) };
    const seenDay = {};
    for (const l of logs || []) {
      if (!l || !l.sport || !l.date) continue;
      const d = new Date(l.date);
      const i = Math.round((monday(d).getTime() - first.getTime()) / (7 * DAY));
      if (i < 0 || i >= count) continue;
      const m = Math.max(0, Number(a.minutesOf(l)) || 0);
      const row = bySport[l.sport] || (bySport[l.sport] = { sport: l.sport, minutes: 0, sessions: 0, cells: Array.from({ length: count }, () => null) });
      const cell = row.cells[i] || (row.cells[i] = { minutes: 0, sessions: 0, days: 0, level: 0 });
      const dayKey = l.sport + "|" + keyOf(d);
      if (!seenDay[dayKey]) { seenDay[dayKey] = true; cell.days += 1; }
      cell.minutes += m; cell.sessions += 1;
      // Per week the ink follows the hours: under an hour, up to two, up to four, beyond.
      cell.level = cell.minutes < 60 ? 1 : cell.minutes < 120 ? 2 : cell.minutes < 240 ? 3 : 4;
      row.minutes += m; row.sessions += 1;
      totals.minutes += m; totals.sessions += 1; totals.cells[i] += m;
    }
    totals.minutes = Math.round(totals.minutes);
    const folded = fold(bySport, count, Math.max(1, o.maxRows || 5), a);
    return { kind: "span", from: columns[0].key, to: keyOf(addDays(last, 6)), columns, rows: folded.rows, more: folded.more, totals };
  }

  /** What a screen reader says of a week: the figure is a picture, this is its sentence. */
  function describe(grid) {
    if (!grid.rows.length && !grid.more) return "Aucune séance sur cette période.";
    const parts = grid.rows.map((r) => `${r.label} : ${r.sessions} séance${r.sessions > 1 ? "s" : ""}, ${r.minutes} minutes`);
    if (grid.more) parts.push(`${grid.more.sports} autre${grid.more.sports > 1 ? "s" : ""} sport${grid.more.sports > 1 ? "s" : ""} : ${Math.round(grid.more.minutes)} minutes`);
    return parts.join(". ") + ".";
  }

  const api = { week, span, level, describe, LETTERS };
  root.TitanProgram = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
