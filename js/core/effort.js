/* TITAN 300 — normalized effort, XP and level curve.
   Mirror of public.titan_effort_v300 / public.titan_level_requirement on the server.
   The server stays the only authority; this module explains and previews. */
(function (root) {
  "use strict";

  // Typical speeds used only when a session has no declared duration.
  const PROFILE_SPEED_KMH = {
    running: 10,
    trail: 8,
    mountain_endurance: 5,
    hiking: 4.5,
    cycling: 22,
    mtb: 14,
    glide: 14,
    water: 7,
    mixed: 11,
    mixed_conditioning: 9,
  };
  const SPORT_SPEED_KMH = {
    walking: 5,
    nordic_walk: 5.5,
    hiking: 4,
    snowshoeing: 3.5,
    trail: 8,
    race_walking: 7,
    treadmill: 10,
    orienteering: 7,
    mountain_bike: 14,
    gravel: 18,
    velotaf: 16,
    cycling_indoor: 25,
    rowing: 10,
    coastal_rowing: 9,
    kayak: 7,
    paddle: 5,
    cross_country_skiing: 10,
    alpine_skiing: 20,
    ski_touring: 4,
    ski_mountaineering: 4,
  };
  const SWIM_METERS_PER_MIN = 40;
  const DAILY_XP_CAP = 1800;
  const WEEKLY_XP_CAP = 9600;
  const HISTORY_DAYS = 30;
  const RANKS = [
    { level: 1, id: "eclaireur", name: "Éclaireur" },
    { level: 3, id: "explorateur", name: "Explorateur" },
    { level: 6, id: "sentinelle", name: "Sentinelle" },
    { level: 10, id: "gardien", name: "Gardien" },
    { level: 15, id: "champion", name: "Champion" },
    { level: 25, id: "titan", name: "Titan" },
    { level: 40, id: "legende", name: "Légende" },
  ];

  const num = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const positive = (v) => {
    const n = num(v);
    return n !== null && n > 0 ? n : null;
  };

  function declaredMinutes(unit, val, details = {}) {
    for (const candidate of [
      details?.gpxStats?.movingMinutes,
      details?.val2,
      details?.duration,
      unit === "min" ? val : null,
      unit === "h" ? num(val) * 60 : null,
    ]) {
      const n = positive(candidate);
      if (n !== null) return n;
    }
    return null;
  }

  function countSets(details = {}) {
    let sets = 0;
    for (const exercise of Array.isArray(details.exercises) ? details.exercises : []) {
      if (Array.isArray(exercise.setRows)) sets += exercise.setRows.length;
      else sets += Math.max(0, Math.round(num(exercise.sets) || 0));
    }
    return sets;
  }

  function estimatedMinutes({ sport, profile, unit, val, details = {} }) {
    const value = positive(val) || 0;
    if (unit === "km") {
      const speed = SPORT_SPEED_KMH[sport] || PROFILE_SPEED_KMH[profile] || 10;
      return (value / speed) * 60;
    }
    if (unit === "m") {
      if (profile === "swimming") return value / SWIM_METERS_PER_MIN;
      if (profile === "climbing") return 45;
      return 20;
    }
    if (unit === "kg") {
      const sets = countSets(details);
      return sets > 0 ? Math.max(15, sets * 2.5) : 45;
    }
    if (unit === "reps") return Math.min(90, Math.max(10, value * 0.15));
    if (unit === "saut") return value * 10;
    return 30;
  }

  function rpeOf(details = {}) {
    const raw = num(details?.bio?.rpe ?? details?.rpe);
    if (raw === null) return null;
    return Math.min(10, Math.max(1, raw));
  }

  /** Normalized effort of one session. Same inputs, same result as the server. */
  function effort({ sport = "", profile = "", unit = "", val = 0, details = {} } = {}) {
    let minutes = declaredMinutes(unit, val, details);
    let estimated = false;
    if (minutes === null) {
      minutes = estimatedMinutes({ sport, profile, unit, val, details });
      estimated = true;
    }
    minutes = Math.min(1440, Math.max(0, minutes));
    const counted = Math.min(minutes, 90) + 0.5 * Math.min(Math.max(minutes - 90, 0), 90);
    const rpe = rpeOf(details);
    const intensity = 0.6 + 0.08 * (rpe === null ? 5 : rpe);
    return {
      minutes: Math.round(minutes * 10) / 10,
      estimated,
      rpe,
      intensity: Math.round(intensity * 100) / 100,
      counted: Math.round(counted * 10) / 10,
      effortMinutes: Math.round(counted * intensity * 10) / 10,
      xp: Math.max(1, Math.round(counted * intensity * 10)),
    };
  }

  function isHistorical(date, now = Date.now()) {
    const t = new Date(date).getTime();
    return Number.isFinite(t) && t < now - HISTORY_DAYS * 86400000;
  }

  const levelRequirement = (level) =>
    Math.max(1, Math.round(500 * Math.pow(Math.max(1, Number(level) || 1), 1.3)));

  function totalForLevel(level) {
    let total = 0;
    for (let l = 1; l < level; l++) total += levelRequirement(l);
    return total;
  }

  /** Level, remaining XP and next requirement from a cumulated XP total. */
  function levelFromTotal(total) {
    let level = 1;
    let rest = Math.max(0, Math.floor(Number(total) || 0));
    while (rest >= levelRequirement(level) && level < 500) {
      rest -= levelRequirement(level);
      level++;
    }
    return { level, xp: rest, next: levelRequirement(level) };
  }

  const rank = (level) =>
    [...RANKS].reverse().find((r) => (Number(level) || 1) >= r.level) || RANKS[0];
  const nextRank = (level) => RANKS.find((r) => r.level > (Number(level) || 1)) || null;

  const api = {
    PROFILE_SPEED_KMH,
    SPORT_SPEED_KMH,
    DAILY_XP_CAP,
    WEEKLY_XP_CAP,
    HISTORY_DAYS,
    RANKS,
    declaredMinutes,
    estimatedMinutes,
    effort,
    isHistorical,
    levelRequirement,
    totalForLevel,
    levelFromTotal,
    rank,
    nextRank,
  };
  root.TitanEffort = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
