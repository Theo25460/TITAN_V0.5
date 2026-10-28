/* V11-12: long efforts are recognised on their own, with cosmetic souvenirs, and never with extra XP (XP stays degressive and capped by the server).
   Pure and read-only: derived from sessions the account already holds. A session the server held or flagged, or whose average speed is
   impossible, earns nothing here. Nothing is stored or granted. */
(function (root) {
  "use strict";
  const DISTANCE_KM = [50, 100, 200, 300, 500];
  const DURATION_H = [4, 8, 12, 24];
  const ELEVATION_M = [1000, 3000, 5000, 8848];
  const NAMES = {
    distance: { 50: "50 km d’une traite", 100: "Centurion : 100 km", 200: "200 km d’une traite", 300: "Ultra : 300 km", 500: "Ultra : 500 km" },
    duration: { 4: "Longue sortie : 4 h", 8: "Grande sortie : 8 h", 12: "Journée d’effort : 12 h", 24: "24 h d’effort" },
    elevation: { 1000: "1 000 m de dénivelé", 3000: "3 000 m de dénivelé", 5000: "5 000 m de dénivelé", 8848: "Everest : 8 848 m de dénivelé" },
  };
  const MAX_KMH = 120;

  const number = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const trusted = (l) => l && !l.archived_at && !l.is_suspicious && !["rejected", "flagged", "pending_review"].includes(l.status)
    && !l.details?.rewardHeld && !l.details?.reward_held && !l.details?.held;

  /** Best single-session values among trusted sessions: { distanceKm, durationH, elevationM }. */
  function bests(logs) {
    let distanceKm = 0, durationH = 0, elevationM = 0;
    for (const l of logs || []) {
      if (!trusted(l)) continue;
      const minutes = number(l.details?.duration ?? l.details?.val2) || (String(l.unit).toLowerCase() === "min" ? number(l.val) : 0);
      const km = String(l.unit).toLowerCase() === "km" ? number(l.val) : 0;
      if (km > 0 && minutes > 0 && km / (minutes / 60) > MAX_KMH) continue; // an impossible pace earns nothing
      distanceKm = Math.max(distanceKm, km);
      durationH = Math.max(durationH, Math.min(minutes, 1440) / 60);
      elevationM = Math.max(elevationM, Math.min(number(l.details?.elevation), 12000));
    }
    return { distanceKm, durationH, elevationM };
  }

  /** Earned souvenirs (highest per family first) and the next target of each family. */
  function highlights(logs) {
    const b = bests(logs);
    const families = [["distance", b.distanceKm, DISTANCE_KM], ["duration", b.durationH, DURATION_H], ["elevation", b.elevationM, ELEVATION_M]];
    const earned = [], next = [];
    for (const [family, value, steps] of families) {
      const reached = steps.filter((s) => value >= s);
      for (const s of reached.slice().reverse()) earned.push({ key: `endurance:${family}:${s}`, family, step: s, label: NAMES[family][s] });
      const n = steps.find((s) => value < s);
      if (n !== undefined) next.push({ family, step: n, label: NAMES[family][n] });
    }
    return { earned, next, bests: b };
  }

  const api = { highlights, bests, DISTANCE_KM, DURATION_H, ELEVATION_M };
  root.TitanEndurance = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
