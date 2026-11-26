// V1.6.6 — Journal longue durée: a deterministic, realistic five-year profile of 10 000 sessions for one synthetic account.
// Rows have the shape titan_submit_training_session stores in public.training_logs (details with duration, bio.rpe, extras,
// serverReward, GPX summaries with their profile and kilometre splits). The GPX traces themselves are produced apart (traces[]):
// TITAN keeps them out of training_logs, so the journal never downloads them. Same seed, same rows, byte for byte.
export const OWNER = "00000000-0000-4000-8000-000000166600";
export const NOW = Date.parse("2026-11-23T18:00:00.000Z");
const DAY = 86400000;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const uuid = (n) => `00000000-0000-4${String(Math.floor(n / 1e12) % 1000).padStart(3, "0")}-8${String(Math.floor(n / 1e9) % 1000).padStart(3, "0")}-${String(n % 1e12).padStart(12, "0")}`;
export const idOf = (i) => uuid(166600000000 + i);

// [sport, category, unit, weight %, minutes range, km per hour range]
const SPORTS = [
  ["running", "cardio", "km", 30, [25, 110], [9, 14]],
  ["cycling", "cardio", "km", 22, [45, 300], [20, 32]],
  ["muscu_gym", "force", "kg", 18, [40, 95], null],
  ["swimming", "cardio", "m", 8, [30, 70], [2, 3.4]],
  ["trail", "cardio", "km", 6, [60, 360], [6, 10]],
  ["hiking", "cardio", "km", 5, [90, 420], [3.5, 5]],
  ["yoga", "mobilite", "min", 6, [20, 75], null],
  ["bouldering", "technique", "min", 5, [60, 150], null],
];
const EXERCISES = [["Développé couché", "Barre"], ["Squat", "Barre"], ["Soulevé de terre", "Barre"], ["Rowing", "Haltères"], ["Développé militaire", "Barre"], ["Tractions", "Poids du corps"], ["Fentes", "Haltères"]];
const NOTES = ["", "", "", "Bonnes sensations", "Vent de face", "Sortie du club", "Récupération", "Fractionné 6×800", "Sous la pluie", "Avec Léa", "Seuil", "Jambes lourdes"];

function profilePoints(r, km, ascent) {
  const out = [];
  let alt = 200 + Math.round(r() * 600);
  for (let i = 0; i <= 60; i++) {
    alt += Math.round((r() - 0.45) * ascent / 12);
    out.push({ d: Math.round((km * i / 60) * 1000) / 1000, a: Math.max(0, alt) });
  }
  return out;
}

/** n sessions over five years, newest first. traces: the separate GPX points of the GPS sessions (not in the rows). */
export function generate({ n = 10000, seed = 166, now = NOW } = {}) {
  const r = rng(seed);
  const span = 5 * 365 * DAY;
  const logs = [], traces = [];
  for (let i = 0; i < n; i++) {
    // Spread evenly with jitter, at realistic hours, oldest at i = n - 1.
    const t = now - 2 * 3600000 - Math.floor((i / n) * span) - Math.floor(r() * (span / n));
    const d = new Date(t);
    d.setUTCHours([5, 6, 7, 11, 16, 17, 18][Math.floor(r() * 7)], Math.floor(r() * 60), 0, 0);
    if (d.getTime() > now - 3600000) d.setTime(now - 3600000);
    let acc = 0, pick = SPORTS[0];
    const roll = r() * 100;
    for (const s of SPORTS) { acc += s[3]; if (roll < acc) { pick = s; break; } }
    const [sport, category, unit, , [m0, m1], speed] = pick;
    const minutes = Math.round(m0 + r() * (m1 - m0));
    const details = { client_event_id: idOf(i), performedAt: d.toISOString(), timezone: "Europe/Paris", duration: minutes, val2: minutes, bio: { rpe: 3 + Math.floor(r() * 7) } };
    let val;
    if (unit === "km") {
      val = Math.round((minutes / 60) * (speed[0] + r() * (speed[1] - speed[0])) * 100) / 100;
      const ascent = Math.round(val * (sport === "cycling" ? 8 + r() * 14 : sport === "trail" ? 30 + r() * 40 : sport === "hiking" ? 40 + r() * 50 : 2 + r() * 6));
      // The positive elevation sits in details.elevation (entry forms of the website and Android) for the sports that ask for it.
      if (sport !== "running") details.elevation = ascent;
      if (sport === "cycling" && r() < 0.6) details.extras = { cadence: 75 + Math.floor(r() * 20) };
      if (r() < 0.45) {
        details.hasGpx = true;
        details.gpxFingerprint = `gpx-${i}`;
        const km = Math.floor(val);
        details.gpxStats = {
          distanceKm: val, movingMinutes: Math.max(1, minutes - Math.floor(r() * 6)), elapsedMinutes: minutes, pauseMinutes: Math.floor(r() * 6),
          ascent, descent: ascent - Math.floor(r() * 20), points: 900 + Math.floor(r() * 4000), cleanPoints: 900, ignoredPoints: Math.floor(r() * 12),
          kind: "track", altitudeSource: "gps", analysisVersion: 3, terrainVersion: 2, source: "gpx_import", verified: false,
          profile: profilePoints(r, val, ascent),
          splits: Array.from({ length: Math.min(km, 60) }, (_, k) => ({ index: k + 1, distanceKm: 1, durationSeconds: Math.round((minutes * 60 / val) * (0.9 + r() * 0.2)) })),
        };
        traces.push({ log_id: idOf(i), points: details.gpxStats.points });
      }
    } else if (unit === "m") {
      val = Math.round((minutes / 60) * (speed[0] + r() * (speed[1] - speed[0])) * 1000 / 25) * 25;
      details.extras = { pool: r() < 0.8 ? "25" : "open" };
    } else if (unit === "kg") {
      const ex = [];
      for (let k = 0, m = 3 + Math.floor(r() * 3); k < m; k++) {
        const [name, equipment] = EXERCISES[(i + k * 3) % EXERCISES.length];
        const base = 20 + Math.floor(r() * 80);
        const setRows = Array.from({ length: 3 + Math.floor(r() * 3) }, () => ({ weight: base + Math.floor(r() * 4) * 2.5, reps: 5 + Math.floor(r() * 8), rir: r() < 0.5 ? null : Math.floor(r() * 4) }));
        ex.push({ name, variant: "", equipment, kind: name === "Tractions" ? "bodyweight" : "weighted", setRows, sets: setRows.length, totalReps: setRows.reduce((a, s) => a + s.reps, 0), volume: setRows.reduce((a, s) => a + s.weight * s.reps, 0), weight: Math.max(...setRows.map((s) => s.weight)) });
      }
      details.exercises = ex;
      val = ex.reduce((a, e) => a + e.volume, 0);
      details.unitOverride = "kg";
    } else {
      val = minutes;
      if (sport === "bouldering") details.extras = { grade_system: "Fontainebleau bloc", max_done: ["5c", "6a", "6a+", "6b", "6b+"][Math.floor(r() * 5)], attempts: 10 + Math.floor(r() * 25) };
    }
    details.val1 = val;
    const note = NOTES[Math.floor(r() * NOTES.length)];
    if (note) details.note = note;
    const xp = Math.round(minutes * (1 + r()));
    details.serverReward = { log_id: idOf(i), xp, credits: Math.round(xp / 10), requested_xp: xp, requested_credits: Math.round(xp / 10), reward_held: false, held_xp: 0, held_credits: 0 };
    const created = t + (r() < 0.04 ? 40 * DAY : 3600000);
    logs.push({
      id: idOf(i), user_id: OWNER, client_event_id: idOf(i), sport, category, val, unit, date: d.toISOString(), created_at: new Date(Math.min(created, now)).toISOString(),
      xp, revision: 1, archived_at: null, status: "valid", is_suspicious: false, details,
    });
  }
  // About 2 % archived over the years (duplicates of imports, mistakes), each archive a revision of its own.
  for (let i = 37; i < n; i += 50) { logs[i].archived_at = new Date(Date.parse(logs[i].date) + 2 * DAY).toISOString(); logs[i].revision = 2; }
  // The session the scenario looks for: an old ride of 2022 with a note, whose elevation the athlete corrects.
  const old = logs.findIndex((l, k) => k > n * 0.7 && l.sport === "cycling" && !l.archived_at);
  logs[old].details = { ...logs[old].details, note: "Col du Galibier par Valloire", elevation: 1450 };
  return { logs, traces, oldId: logs[old].id };
}

export const sizeOf = (logs) => Buffer.byteLength(JSON.stringify(logs));
