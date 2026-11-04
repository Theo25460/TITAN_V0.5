/* V11-56 (HC-P0-06): the quiet "pas" line of the day, read from the daily-activity layer (migration 39). Pure: nothing is sent anywhere.
   Steps are NOT sessions and never give XP, credits, quests or records. A day without a number is "no data", never zero, and several sources
   for one day are never added (the server already keeps the highest). */

/**
 * @typedef {{ day: string, steps: number, sources?: string[], updatedAt?: string }} DayEntry
 * @typedef {{ day: string, steps: number | null }} WeekDay
 * @typedef {{ today: DayEntry | null, week: WeekDay[], average7: number | null, average30: number | null, daysWithData30: number, goal: number | null, goalPercent: number | null, lastUpdate: string | null, empty: boolean }} StepsSummary
 */
(function (root) {
  "use strict";
  const SOURCE_NAMES = { health_connect: "Santé Connect" };
  const MAX_GOAL = 100000;

  /** @param {string} key YYYY-MM-DD @param {number} delta */
  function shift(key, delta) {
    const [y, m, d] = key.split("-").map(Number);
    const t = new Date(Date.UTC(y || 1970, (m || 1) - 1, (d || 1) + delta));
    return t.toISOString().slice(0, 10);
  }

  /** @param {unknown} v */
  const validDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

  /** @param {unknown} value */
  function goalOf(value) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 1000 && n <= MAX_GOAL ? n : null;
  }

  /**
   * @param {unknown} days the server answer (list of days)
   * @param {{ today: string, goal?: unknown }} options `today` is the local calendar day of the account, YYYY-MM-DD
   * @returns {StepsSummary}
   */
  function summarize(days, { today, goal }) {
    /** @type {Map<string, DayEntry>} */
    const byDay = new Map();
    for (const e of Array.isArray(days) ? days : []) {
      if (!e || !validDay(e.day) || !Number.isFinite(Number(e.steps)) || Number(e.steps) < 0) continue;
      byDay.set(e.day, { day: e.day, steps: Math.round(Number(e.steps)), sources: Array.isArray(e.sources) ? e.sources.map(String) : [], updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : undefined });
    }
    /** @type {WeekDay[]} */
    const week = [];
    for (let i = 6; i >= 0; i--) { const day = shift(today, -i); week.push({ day, steps: byDay.get(day)?.steps ?? null }); }
    /** @param {number} n */
    const average = (n) => {
      let sum = 0, count = 0;
      for (let i = 0; i < n; i++) { const v = byDay.get(shift(today, -i)); if (v) { sum += v.steps; count++; } }
      return { value: count ? Math.round(sum / count) : null, count };
    };
    const a7 = average(7), a30 = average(30);
    const entry = byDay.get(today) || null;
    const g = goalOf(goal);
    let lastUpdate = null;
    for (const e of byDay.values()) if (e.updatedAt && (!lastUpdate || e.updatedAt > lastUpdate)) lastUpdate = e.updatedAt;
    return {
      today: entry, week, average7: a7.value, average30: a30.value, daysWithData30: a30.count, goal: g,
      goalPercent: entry && g ? Math.min(100, Math.round((entry.steps / g) * 100)) : null,
      lastUpdate: entry?.updatedAt || lastUpdate, empty: a30.count === 0,
    };
  }

  /** @param {unknown} source */
  const sourceName = (source) => (typeof source === "string" && source in SOURCE_NAMES ? SOURCE_NAMES[/** @type {keyof typeof SOURCE_NAMES} */ (source)] : "une source connectée");

  const api = { summarize, goalOf, sourceName, shift, MAX_GOAL };
  /** @type {any} */ (root).TitanSteps = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
