// V1.7.6 — writes tests/fixtures/block-scenario-v176.json: the shared test set of the website and Android for scenarios.
// The scenario of the cahier des charges: over four weeks, two long bike rides or one long and one short that leaves room for
// badminton, compared on time per sport, free days, overlaps and milestones that move, inside an eight-week block (V1.7.4) that keeps
// one bouldering session a week; a week of reduced availability, a paused week, a decision already taken (V1.7.2), the chosen
// variant applied from an explicit Monday, then undone. Plus: drafts edited without touching the active programme, an undo after a
// week was lived, a scenario on the typical week (no block), refusals and two devices. Sessions are synthetic.
// Usage: node tools/block-scenario/build-fixture.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
for (const m of ["format.js", "../training-store.js", "sports-catalog.js", "sports.js"]) require(`../../js/core/${m}`);
globalThis.TitanSports.ensure();
require("../../js/core/week-plan.js");
const B = require("../../js/core/training-block.js");
const S = require("../../js/core/block-scenario.js");

const zone = "Europe/Paris";
const BLOC = { sport: "bouldering", minutes: 90, note: "Bloc" };
const BAD = { sport: "badminton", minutes: 60, note: "Club" };
const typeDays = [null, BLOC, null, BAD, null, { sport: "cycling", minutes: 180, note: "Sortie" }, null];
const type = { tuesday: typeDays[1], thursday: typeDays[3], saturday: typeDays[5], revisions: { "2026-10-26": { days: typeDays, at: "2026-10-26T08:00:00.000Z" } } };

const log = (id, sport, date, { km, min } = {}) => ({
  id, client_event_id: id, sport, date, val: km ?? min ?? 1, unit: km ? "km" : "min",
  details: { timezone: zone, client_event_id: id, ...(min ? { duration: min } : {}), ...(sport === "bouldering" ? { extras: { grade_system: "Fontainebleau bloc", climbing_discipline: "Bloc", max_done: "6A" } } : {}) },
});
const logs = [
  log("bloc-1", "bouldering", "2026-11-03T18:00:00.000Z", { min: 90 }),
  log("bad-1", "badminton", "2026-11-05T19:00:00.000Z", { min: 60 }),
  log("velo-1", "cycling", "2026-11-07T09:00:00.000Z", { km: 55, min: 170 }),
  log("bloc-2", "bouldering", "2026-11-10T18:00:00.000Z", { min: 85 }),
  log("bad-2", "badminton", "2026-11-12T19:00:00.000Z", { min: 60 }),
  log("velo-2", "cycling", "2026-11-14T09:00:00.000Z", { km: 64, min: 185 }),
  log("bloc-3", "bouldering", "2026-11-17T18:00:00.000Z", { min: 90 }),
  log("velo-3", "cycling", "2026-11-21T08:30:00.000Z", { km: 82, min: 215 }),
  // Week of 23 November (the week the athlete compares, Tuesday 24 November).
  log("bloc-4", "bouldering", "2026-11-24T18:00:00.000Z", { min: 90 }),
  // Week of 30 November, lived under the scenario « Une longue et une courte ».
  log("bloc-5", "bouldering", "2026-12-01T18:00:00.000Z", { min: 90 }),
  log("velo-5a", "cycling", "2026-12-02T17:00:00.000Z", { km: 22, min: 60 }),
  log("bad-5", "badminton", "2026-12-03T19:00:00.000Z", { min: 55 }),
  log("velo-5b", "cycling", "2026-12-05T08:30:00.000Z", { km: 88, min: 220 }),
];
const UNTIL_24 = ["bloc-1", "bad-1", "velo-1", "bloc-2", "bad-2", "velo-2", "bloc-3", "velo-3", "bloc-4"];
const ALL = logs.map((l) => l.id);
const WEEKS = ["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14", "2026-12-21", "2026-12-28"];

// The block in force: eight weeks of the typical week, a milestone of 80 km and one of 100 km, the goal on 20 December.
const cyclo = {
  id: "cyclo-100", title: "Cyclo 100 km", intent: "Monter à 100 km en gardant le bloc et le badminton.", template: "routine", sports: ["cycling", "bouldering", "badminton"],
  start: "2026-11-02", weeks: B.draft("routine", { type: typeDays, weeks: 8 }),
  goal: { title: "Sortie vélo de 100 km", date: "2026-12-20", kind: "measure", sport: "cycling", metric: "distance", target: 100 },
  milestones: [
    { id: "m80", title: "Sortie de 80 km", week: 3, kind: "measure", sport: "cycling", metric: "distance", target: 80 },
    { id: "m100", title: "Sortie de 100 km", week: 6, kind: "measure", sport: "cycling", metric: "distance", target: 100 },
  ],
};
const BLOCK = { op: "block", input: cyclo, today: "2026-11-01", at: "2026-11-01T18:00:00.000Z" };
// A decision already taken (V1.7.2): the bouldering of Tuesday 8 December moves to Thursday 10 December, the badminton day.
const DECISION = { op: "decide", id: "2026-12-07/1", decision: { kind: "move", day: "2026-12-10" }, today: "2026-11-22", at: "2026-11-22T19:00:00.000Z" };

const T = "2026-11-24";
const at = (h, m = 0) => `2026-11-24T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
const ID = "velo-badminton";
const CREATE = { op: "sc-create", input: { id: ID, title: "Vélo ou badminton", start: "2026-11-30", count: 4, names: { a: "Deux sorties longues", b: "Une longue et une courte" } }, today: T, at: at(17) };
const day = (variant, d, value, minute) => ({ op: "sc-day", id: ID, args: { variant, week: "all", day: d, value }, today: T, at: at(17, minute) });
const DRAFTS = [
  // A: two long rides (Wednesday 2 h 30, Saturday 3 h 30), Thursday freed.
  day("a", 2, { sport: "cycling", minutes: 150, note: "Sortie longue" }, 1),
  day("a", 3, null, 2),
  day("a", 5, { sport: "cycling", minutes: 210, note: "Sortie longue" }, 3),
  // B: one long ride (Saturday 3 h 30) and a short one on Wednesday (1 h), badminton kept on Thursday.
  day("b", 2, { sport: "cycling", minutes: 60, note: "Sortie courte" }, 4),
  day("b", 5, { sport: "cycling", minutes: 210, note: "Sortie longue" }, 5),
  // With two long rides a week, A brings the 100 km milestone one week earlier.
  { op: "sc-place", id: ID, args: { variant: "a", milestone: "m100", week: 1 }, today: T, at: at(17, 6) },
  // The week of 14 December: away on Wednesday and Thursday. The week of 21 December: a pause.
  { op: "sc-avail", id: ID, args: { week: 2, days: [true, true, false, false, true, true, true] }, today: T, at: at(17, 7) },
  { op: "sc-avail", id: ID, args: { week: 3, pause: true }, today: T, at: at(17, 8) },
  // B is made compatible with both weeks; A is left as it is.
  { op: "sc-fit", id: ID, args: { variant: "b", week: 2 }, today: T, at: at(17, 9) },
  { op: "sc-fit", id: ID, args: { variant: "b", week: 3 }, today: T, at: at(17, 10) },
];
const BASE = [BLOCK, DECISION];
const SCENARIO = [...BASE, CREATE, ...DRAFTS];
const APPLY_B = { op: "sc-apply", id: ID, args: { variant: "b", from: "2026-11-30" }, today: T, at: at(18), preview: true };
const UNDO_26 = { op: "sc-undo", id: ID, today: "2026-11-26", at: "2026-11-26T20:00:00.000Z", preview: true };

const cases = [
  { name: "0 — programme actif sans scénario (référence des calendriers)", journal: UNTIL_24, ops: BASE, read: { today: T, weeks: ["2026-11-30", "2026-12-07"] } },
  { name: "1 — deux variantes comparées sur quatre semaines : temps par sport, jours libres, chevauchements, jalons déplacés", journal: UNTIL_24, ops: SCENARIO, read: { today: T, compare: [ID], weeks: ["2026-11-30", "2026-12-07"] } },
  { name: "2 — modifier un brouillon n’altère pas le programme actif", journal: UNTIL_24, ops: [...SCENARIO,
    day("a", 6, { sport: "badminton", minutes: 45 }, 20),
    { op: "sc-name", id: ID, args: { variant: "a", name: "Deux longues + badminton dimanche" }, today: T, at: at(17, 21) },
    { op: "sc-add", id: ID, args: { newId: "sm-col", title: "Repérer le col", kind: "declared", week: 3, variants: ["a"] }, today: T, at: at(17, 22) },
    { op: "sc-copy", id: ID, args: { from: "b", to: "a" }, today: T, at: at(17, 23) },
  ], read: { today: T, compare: [ID], weeks: ["2026-11-30", "2026-12-07"] } },
  { name: "3 — appliquer « Une longue et une courte » à partir du lundi 30 novembre, avec aperçu", journal: UNTIL_24, ops: [...SCENARIO, APPLY_B], read: { today: T, compare: [ID], weeks: ["2026-11-30", "2026-12-07", "2026-12-14", "2026-12-21"], context: ["2026-11-30"], followUp: ["2026-11-30"] } },
  { name: "4 — puis annuler le jeudi 26 novembre : le programme d’avant revient, les séances restent", journal: UNTIL_24, ops: [...SCENARIO, APPLY_B, UNDO_26], read: { today: "2026-11-26", weeks: ["2026-11-30", "2026-12-07"], context: ["2026-11-30"], followUp: ["2026-11-30"] } },
  { name: "4 bis — le même journal sans scénario, lu le jeudi 26 novembre", journal: UNTIL_24, ops: BASE, read: { today: "2026-11-26", weeks: ["2026-11-30", "2026-12-07"] } },
  { name: "5 — une semaine vécue avec le scénario puis annulation : la semaine commencée le garde, la suite revient", journal: ALL, ops: [...SCENARIO, APPLY_B, { op: "sc-undo", id: ID, today: "2026-12-03", at: "2026-12-03T21:00:00.000Z", preview: true }], read: { today: "2026-12-06", weeks: ["2026-11-30", "2026-12-07"], context: ["2026-11-30", "2026-12-07"], followUp: ["2026-11-30", "2026-12-07"] } },
  { name: "6 — bilan suivant : la semaine du 30 novembre relit la décision et ce qui a été fait", journal: ALL, ops: [...SCENARIO, APPLY_B], read: { today: "2026-12-06", weeks: ["2026-11-30"], context: ["2026-11-30"], followUp: ["2026-11-30"] } },
  { name: "7 — date explicite : « Deux sorties longues » à partir du lundi 7 décembre, la semaine du 30 novembre ne bouge pas", journal: UNTIL_24, ops: [...SCENARIO, { op: "sc-apply", id: ID, args: { variant: "a", from: "2026-12-07" }, today: T, at: at(18), preview: true }], read: { today: T, compare: [ID], weeks: ["2026-11-30", "2026-12-07"] } },
  { name: "8 — sur la semaine type, sans bloc : appliquer crée un bloc, annuler le retire", journal: UNTIL_24, ops: [
    { op: "sc-create", input: { id: "type-4", title: "Semaine type, quatre semaines", start: "2026-11-30", count: 4 }, today: T, at: at(17) },
    { op: "sc-day", id: "type-4", args: { variant: "b", week: "all", day: 2, value: { sport: "cycling", minutes: 60 } }, today: T, at: at(17, 1) },
    { op: "sc-day", id: "type-4", args: { variant: "b", week: 1, day: 6, value: { sport: "badminton" } }, today: T, at: at(17, 2) },
    { op: "sc-apply", id: "type-4", args: { variant: "b", from: "2026-11-30" }, today: T, at: at(18), preview: true },
    { op: "sc-undo", id: "type-4", today: T, at: at(19), preview: true },
  ], read: { today: T, compare: ["type-4"], weeks: ["2026-11-30", "2026-12-07"] } },
  { name: "8 bis — le même journal sur la semaine type, sans scénario", journal: UNTIL_24, ops: [], read: { today: T, weeks: ["2026-11-30", "2026-12-07"] } },
  { name: "9 — refus : semaine commencée, deux applications, bloc modifié depuis, période à cheval sur la fin du bloc", journal: UNTIL_24, ops: [...SCENARIO,
    { op: "sc-create", input: { id: "late", title: "Fin d’année", start: "2026-12-21", count: 3 }, today: T, at: at(17, 30), expect: "SCENARIO_OUTSIDE_BLOCK" },
    { op: "sc-apply", id: ID, args: { variant: "b", from: "2026-11-23" }, today: T, at: at(17, 31), expect: "SCENARIO_BAD_FROM" },
    { op: "sc-apply", id: ID, args: { variant: "b", from: "2026-11-30" }, today: "2026-12-01", at: "2026-12-01T08:00:00.000Z", expect: "SCENARIO_WEEK_STARTED" },
    APPLY_B,
    { op: "sc-apply", id: ID, args: { variant: "a", from: "2026-12-07" }, today: T, at: at(18, 5), expect: "SCENARIO_ALREADY_APPLIED" },
    { op: "shift", block: "cyclo-100", args: { from: 6, weeks: 1 }, today: "2026-11-25", at: "2026-11-25T08:00:00.000Z" },
    { op: "sc-undo", id: ID, today: "2026-11-25", at: "2026-11-25T09:00:00.000Z", expect: "SCENARIO_CHANGED_SINCE" },
  ], read: { today: "2026-11-25" } },
  { name: "10 — deux appareils : le site applique B pendant que le téléphone modifie le brouillon A", journal: UNTIL_24, ops: [...SCENARIO, APPLY_B], split: 1,
    remote: [day("a", 0, { sport: "running", minutes: 40 }, 50)],
    read: { today: T, compare: [ID], weeks: ["2026-11-30", "2026-12-07"] } },
  { name: "11 — deux appareils : le téléphone annule ce que le site a appliqué", journal: UNTIL_24, ops: [...SCENARIO, APPLY_B, { op: "sc-avail", id: ID, args: { week: 1, days: [true, true, true, true, false, true, true] }, today: "2026-11-25", at: "2026-11-25T10:00:00.000Z" }], split: 1,
    remote: [{ op: "sc-undo", id: ID, today: "2026-11-25", at: "2026-11-25T11:00:00.000Z" }],
    read: { today: "2026-11-25", compare: [ID], weeks: ["2026-11-30", "2026-12-07"] } },
];

const fixture = { version: S.VERSION, about: "V1.7.6 — Scénarios multisports. Synthetic sessions; replayed by tests/block-scenario.test.mjs and mobile/__tests__/blockScenario.test.tsx through tools/block-scenario/replay.cjs.", zone, type, logs, weeks: WEEKS, cases };
writeFileSync(new URL("../../tests/fixtures/block-scenario-v176.json", import.meta.url), JSON.stringify(fixture, null, 2) + "\n");
console.log(`${cases.length} cases, ${logs.length} sessions`);
