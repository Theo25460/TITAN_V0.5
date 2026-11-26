// V1.7.5 — writes tests/fixtures/discipline-analysis-v175.json, the shared test set of the three depth views (website module,
// Android copy, browser journey). Synthetic sessions only. Re-run only when the set itself changes, then write-expected.mjs.
// Usage: node tools/discipline-analysis/build-fixture.mjs
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
for (const m of ["format.js", "../training-store.js", "sports-catalog.js", "sports.js"]) require(`../../js/core/${m}`);
require("../../js/core/week-plan.js");
const B = require("../../js/core/training-block.js");
globalThis.TitanSports.ensure();

const at = (day, hour = 9) => `${day}T${String(hour).padStart(2, "0")}:00:00Z`;
/** One-kilometre splits of a ride: first half at v1 km/h, second half at v2, with a fixed small ripple (never random). */
function splits(km, v1, v2) {
  const ripple = [0.4, -0.3, 0.2, -0.5, 0.3, -0.1];
  const out = [];
  for (let i = 0; i < Math.floor(km); i++) {
    const v = (i < Math.floor(km) / 2 ? v1 : v2) + ripple[i % ripple.length];
    out.push({ index: i, distanceKm: 1, durationSeconds: Math.round((3600 / v) * 10) / 10 });
  }
  return out;
}
const ride = (id, day, km, minutes, extra = {}) => {
  const { surface = "Chemin roulant", elevation, hr, split, sport = "gravel", ...rest } = extra;
  const details = { ...(minutes ? { duration: minutes } : {}), ...(elevation !== undefined ? { elevation } : {}), extras: { surface, ...(hr ? { avg_hr: hr } : {}) } };
  if (split) details.gpxStats = { distanceKm: km, movingMinutes: minutes, splits: splits(km, ...split) };
  return { id, client_event_id: id, sport, unit: "km", val: km, date: at(day, 8), details, ...rest };
};
const set = (weight, reps, rir) => ({ weight, reps, ...(rir !== undefined ? { rir } : {}) });
const lift = (id, day, exercises, rest = {}) => ({ id, client_event_id: id, sport: "muscu_gym", unit: "kg", val: 1, date: at(day, 18), details: { duration: 60, exercises }, ...rest });
const squat = (variant, rows) => ({ name: "Squat", ...(variant ? { variant } : {}), setRows: rows });
const climb = (id, day, x, rest = {}) => ({ id, client_event_id: id, sport: "bouldering", unit: "min", val: 90, date: at(day, 19), details: { duration: 90, extras: { grade_system: "Fontainebleau bloc", climbing_discipline: "Bloc", location: "Salle", ...x } }, ...rest });

const history = [
  // Gravel — long outings on « Chemin roulant », 6 weeks before (28 Aug – 9 Oct) and the last 6 weeks (9 Oct – 20 Nov).
  ride("g-r1", "2026-09-05", 68, 210, { elevation: 600, hr: 142, split: [19.9, 18.6] }),
  ride("g-r2", "2026-09-19", 72, 220, { elevation: 650, hr: 145, split: [20.2, 19.0] }),
  ride("g-r3", "2026-10-03", 70, 212, { elevation: 620 }),
  ride("g-c1", "2026-10-17", 74, 215, { elevation: 700, hr: 144, split: [20.9, 20.3] }),
  ride("g-hilly", "2026-10-24", 72, 260, { elevation: 2200 }),
  ride("g-c2", "2026-10-31", 76, 218, { elevation: 640, split: [21.1, 20.8] }),
  ride("g-arch", "2026-11-01", 80, 200, { elevation: 650, archived_at: "2026-11-02T10:00:00Z" }),
  ride("g-c4", "2026-11-07", 75, null, { elevation: 660 }),
  ride("g-road", "2026-11-10", 72, 160, { surface: "Route", elevation: 300 }),
  ride("g-short", "2026-11-12", 30, 85, { elevation: 200 }),
  ride("g-c3", "2026-11-14", 78, 222, { elevation: 690, hr: 146 }),
  ride("g-pending", "2026-11-16", 73, 205, { elevation: 640, syncStatus: "pending" }),
  // Running — a history too short: one run in the last 6 weeks, none before.
  { id: "run-1", client_event_id: "run-1", sport: "running", unit: "km", val: 10, date: at("2026-11-15", 7), details: { duration: 52, extras: { surface: "Route" } } },
  // Strength — Squat (Barre) over both periods, Squat (Front) and a squat without variant apart, one archived heavy session.
  lift("s-r1", "2026-09-08", [squat("Barre", [set(90, 5, 2), set(90, 5, 2), set(90, 5, 2)]), { name: "Développé couché", setRows: [set(60, 8), set(60, 8), set(60, 8)] }]),
  lift("s-r2", "2026-09-22", [squat("Barre", [set(92.5, 5, 2), set(92.5, 5, 2), set(92.5, 5, 1)])]),
  lift("s-r3", "2026-10-06", [squat("Barre", [set(95, 5), set(95, 5), set(95, 4)])]),
  lift("s-c1", "2026-10-13", [squat("Barre", [set(95, 5, 2), set(95, 5, 2), set(95, 5, 2), set(95, 5, 1)]), { name: "Tractions", setRows: [set(0, 8), set(0, 7), set(0, 6)] }]),
  lift("s-c2", "2026-10-27", [squat("Barre", [set(100, 5, 1), set(100, 5, 1), set(100, 5, 1), set(102.5, 3, 0)]), { name: "Tractions", setRows: [set(0, 9), set(0, 8), set(0, 7)] }]),
  lift("s-front", "2026-11-03", [squat("Front", [set(70, 5), set(70, 5), set(70, 5)])]),
  lift("s-novar", "2026-11-05", [{ name: "squat ", setRows: [set(60, 8), set(60, 8)] }]),
  lift("s-c3", "2026-11-10", [squat("Barre", [set(102.5, 5), set(102.5, 5), set(102.5, 5)])]),
  lift("s-arch", "2026-11-12", [squat("Barre", [set(110, 5), set(110, 5)])], { archived_at: "2026-11-13T08:00:00Z" }),
  // Climbing — Fontainebleau bloc over both periods; a V-scale session, a YDS session and a session without scale apart.
  climb("c-r1", "2026-09-10", { attempts: 20, successful_routes: 10, flashes: 3, max_done: "6A", max_tried: "6B" }),
  climb("c-r2", "2026-09-24", { attempts: 18, successful_routes: 9, max_done: "6A+", max_tried: "6B" }),
  climb("c-r3", "2026-10-08", { attempts: 22, successful_routes: 12, flashes: 2, max_done: "6B" }),
  climb("c-c1", "2026-10-15", { attempts: 20, successful_routes: 12, flashes: 2, max_done: "6B", max_tried: "6C" }),
  climb("c-c2", "2026-10-29", { attempts: 24, successful_routes: 15, flashes: 4, max_done: "6B+" }),
  climb("c-yds", "2026-11-02", { grade_system: "YDS", attempts: 12, successful_routes: 7, max_done: "5.10a" }),
  climb("c-vscale", "2026-11-05", { grade_system: "V-scale bloc", attempts: 15, successful_routes: 8, max_done: "V4" }),
  climb("c-arch", "2026-11-08", { attempts: 10, successful_routes: 5, max_done: "7A" }, { archived_at: "2026-11-09T08:00:00Z" }),
  climb("c-c3", "2026-11-12", { max_done: "6C", max_tried: "7A" }),
  { id: "c-noscale", client_event_id: "c-noscale", sport: "bouldering", unit: "min", val: 60, date: at("2026-11-18", 19), details: { duration: 60, extras: { attempts: 8, successful_routes: 4 } } },
];

const block = { kind: "block", id: "blk-base", title: "Base aérobie", start: "2026-09-14", end: "2026-10-11" };
// The same block as a real V1.7.4 training block, created on 10 September (the browser journey reads it from the schedule).
const day = { sport: "gravel", minutes: 210, note: "Sortie longue" };
const typical = { saturday: day };
const weeks = Array.from({ length: 4 }, () => ({ days: [null, null, null, null, null, day, null] }));
const schedule = B.create(typical, { id: block.id, title: block.title, template: "blank", sports: ["gravel"], start: block.start, weeks }, { today: "2026-09-10", at: "2026-09-10T08:00:00.000Z" }).schedule;
const cases = [
  { name: "Endurance — long gravel outings on « Chemin roulant », the last 6 weeks against the 6 before", options: { discipline: "endurance", sport: "gravel", group: "endurance:g-c3", reference: { kind: "period" } } },
  { name: "Endurance — the same group against the training block « Base aérobie »", options: { discipline: "endurance", sport: "gravel", group: "endurance:g-c3", reference: block } },
  { name: "Endurance — against one reference outing (19 September)", options: { discipline: "endurance", sport: "gravel", group: "endurance:g-c3", reference: { kind: "session", id: "g-r2" } } },
  { name: "Endurance — a road outing as reference is not comparable to the « Chemin roulant » group", options: { discipline: "endurance", sport: "gravel", group: "endurance:g-c3", reference: { kind: "session", id: "g-road" } } },
  { name: "Endurance — an archived outing as reference is refused", options: { discipline: "endurance", sport: "gravel", group: "endurance:g-c3", reference: { kind: "session", id: "g-arch" } } },
  { name: "Endurance — history too short (one run)", options: { discipline: "endurance", sport: "running", reference: { kind: "period" } } },
  { name: "Force — Squat (Barre), the last 6 weeks against the 6 before", options: { discipline: "strength", group: "strength:muscu_gym|squat|barre|", reference: { kind: "period" } } },
  { name: "Force — a Squat (Front) session as reference is not merged with Squat (Barre)", options: { discipline: "strength", group: "strength:muscu_gym|squat|barre|", reference: { kind: "session", id: "s-front" } } },
  { name: "Force — Squat without variant, one session: values without a trend", options: { discipline: "strength", group: "strength:muscu_gym|squat||", reference: { kind: "period" } } },
  { name: "Force — Tractions without load: repetitions, reference period empty", options: { discipline: "strength", group: "strength:muscu_gym|tractions||", reference: { kind: "period" } } },
  { name: "Escalade — Fontainebleau bloc, attempts, successes and levels, the last 6 weeks against the 6 before", options: { discipline: "climbing", group: "climbing:bouldering|Fontainebleau bloc|bloc", reference: { kind: "period" } } },
  { name: "Escalade — a V-scale session as reference is not converted", options: { discipline: "climbing", group: "climbing:bouldering|Fontainebleau bloc|bloc", reference: { kind: "session", id: "c-vscale" } } },
  { name: "Escalade — YDS, a scale TITAN does not order: only attempts and successes", options: { discipline: "climbing", group: "climbing:bouldering|YDS|bloc", reference: { kind: "period" } } },
];

const fixture = {
  about: "V1.7.5 — Analyse avancée par discipline. One synthetic history read unchanged by tests/discipline-analysis.test.mjs (website module), mobile/__tests__/disciplineAnalysis.test.tsx (Android copy) and tests/e2e/discipline-analysis.e2e.mjs (Progrès page). Each case is a call of TitanDisciplineAnalysis.view with now and weeks below. The expected output is discipline-analysis-v175.expected.json.",
  version: "2026.11-a1",
  now: "2026-11-20T12:00:00Z",
  weeks: 6,
  block,
  schedule,
  history,
  cases,
};
writeFileSync(new URL("../../tests/fixtures/discipline-analysis-v175.json", import.meta.url), JSON.stringify(fixture, null, 1) + "\n");
console.log(`${history.length} sessions, ${cases.length} cases`);
