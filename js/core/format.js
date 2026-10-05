/* TITAN 300 — French formatting for sport data. Pure, testable. */
(function (root) {
  "use strict";
  const DAY = 86400000;
  const nf = (digits = 0) =>
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  const N0 = nf(0), N1 = nf(1), N2 = nf(2);

  const isNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

  function number(v, digits = 0) {
    if (!isNum(v)) return "—";
    return (digits === 0 ? N0 : digits === 1 ? N1 : N2).format(Number(v)).replace(/ /g, " ");
  }

  /** 95 → "1 h 35", 45 → "45 min", 0.5 → "30 s". */
  function duration(minutes) {
    if (!isNum(minutes) || Number(minutes) <= 0) return "—";
    const m = Number(minutes);
    if (m < 1) return `${Math.round(m * 60)} s`;
    const h = Math.floor(m / 60);
    const rest = Math.round(m - h * 60);
    if (h === 0) return `${Math.round(m)} min`;
    if (rest === 0) return `${h} h`;
    if (rest === 60) return `${h + 1} h`;
    return `${h} h ${String(rest).padStart(2, "0")}`;
  }

  /** Hours with one decimal for totals: 13.5 → "13,5 h". */
  function hours(minutes) {
    if (!isNum(minutes)) return "—";
    const h = Number(minutes) / 60;
    return `${number(h, h < 10 ? 1 : 0)} h`;
  }

  function distance(km) {
    if (!isNum(km) || Number(km) <= 0) return "—";
    const v = Number(km);
    if (v < 1) return `${number(v * 1000)} m`;
    return `${number(v, v < 100 ? 1 : 0)} km`;
  }

  /** Pace in min/km from distance (km) and duration (min): "5:12 /km". */
  function pace(km, minutes) {
    if (!isNum(km) || !isNum(minutes) || Number(km) <= 0 || Number(minutes) <= 0) return "—";
    const secPerKm = Math.round((Number(minutes) * 60) / Number(km));
    if (secPerKm > 3600) return "—";
    return `${Math.floor(secPerKm / 60)}:${String(secPerKm % 60).padStart(2, "0")} /km`;
  }

  function speed(km, minutes) {
    if (!isNum(km) || !isNum(minutes) || Number(km) <= 0 || Number(minutes) <= 0) return "—";
    return `${number(Number(km) / (Number(minutes) / 60), 1)} km/h`;
  }

  function weight(kg) {
    if (!isNum(kg)) return "—";
    const v = Number(kg);
    return v >= 1000 ? `${number(v / 1000, v >= 10000 ? 0 : 1)} t` : `${number(v, v % 1 ? 1 : 0)} kg`;
  }

  const startOfDay = (d) => {
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    return t;
  };

  /** "aujourd’hui", "hier", "mardi", "12 sept.", "12 sept. 2024". */
  function relativeDay(date, now = new Date()) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "—";
    const diff = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
    if (diff === 0) return "aujourd’hui";
    if (diff === 1) return "hier";
    if (diff > 1 && diff < 7) return d.toLocaleDateString("fr-FR", { weekday: "long" });
    const sameYear = d.getFullYear() === new Date(now).getFullYear();
    return d.toLocaleDateString("fr-FR", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  }

  function longDate(date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  }

  function time(date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  /** Days since a date, rounded down, never negative. */
  function daysSince(date, now = new Date()) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    return Math.max(0, Math.round((startOfDay(now) - startOfDay(d)) / DAY));
  }

  function plural(n, one, many) {
    return `${number(n)} ${Math.abs(Number(n)) >= 2 ? many : one}`;
  }

  /** Monday 00:00 of the week containing the date (local time). */
  function weekStart(date = new Date()) {
    const d = startOfDay(date);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  function dateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const api = { isNum, number, duration, hours, distance, pace, speed, weight, relativeDay, longDate, time, daysSince, plural, weekStart, startOfDay, dateKey, DAY };
  root.TitanFormat = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
