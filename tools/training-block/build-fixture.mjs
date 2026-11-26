// V1.7.4 — writes tests/fixtures/training-block-v174.json: the shared test set of the website and Android for training blocks.
// The scenario of the cahier des charges: a gravel ride of 90 km prepared over six weeks while keeping one bouldering session a week,
// two milestones chosen by the athlete, a paused week, a shift of one week, a changed milestone; plus a block created then removed
// over past sessions, duplication, the revision of one week, refusals, a declared action and two devices. Sessions are synthetic.
// Usage: node tools/training-block/build-fixture.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
for (const m of ["format.js", "../training-store.js", "sports-catalog.js", "sports.js"]) require(`../../js/core/${m}`);
globalThis.TitanSports.ensure();
const W = require("../../js/core/week-plan.js");
const B = require("../../js/core/training-block.js");

const zone = "Europe/Paris";
const typeDays = [null, { sport: "bouldering", minutes: 90, note: "Bloc" }, null, null, null, { sport: "gravel", minutes: 120, note: "Sortie" }, null];
const type = { tuesday: typeDays[1], saturday: typeDays[5], revisions: { "2026-10-26": { days: typeDays, at: "2026-10-26T08:00:00.000Z" } } };

const log = (id, sport, date, { km, min, dplus } = {}) => ({
  id, client_event_id: id, sport, date, val: km ?? min ?? 1, unit: km ? "km" : "min",
  details: { timezone: zone, client_event_id: id, ...(min ? { duration: min } : {}), ...(dplus ? { elevation: dplus } : {}), ...(sport === "bouldering" ? { extras: { grade_system: "Fontainebleau bloc", climbing_discipline: "Bloc", max_done: "6A" } } : {}) },
});
const logs = [
  log("bloc-1", "bouldering", "2026-11-03T18:00:00.000Z", { min: 90 }),
  log("grav-1a", "gravel", "2026-11-04T17:00:00.000Z", { km: 25, min: 80 }),
  log("grav-1b", "gravel", "2026-11-07T09:00:00.000Z", { km: 45, min: 180, dplus: 420 }),
  log("bloc-2", "bouldering", "2026-11-10T18:00:00.000Z", { min: 90 }),
  log("grav-2a", "gravel", "2026-11-11T17:00:00.000Z", { km: 30, min: 90 }),
  log("grav-2b", "gravel", "2026-11-14T09:00:00.000Z", { km: 50, min: 205, dplus: 510 }),
  log("bloc-3", "bouldering", "2026-11-17T18:00:00.000Z", { min: 85 }),
  log("grav-3b", "gravel", "2026-11-21T08:30:00.000Z", { km: 56, min: 230, dplus: 640 }),
  // Week of 23 November: ill, nothing done; the week is paused.
  log("bloc-5", "bouldering", "2026-12-01T18:00:00.000Z", { min: 90 }),
  log("grav-5b", "gravel", "2026-12-05T09:00:00.000Z", { km: 42, min: 170 }),
  log("bloc-6", "bouldering", "2026-12-08T18:00:00.000Z", { min: 90 }),
  log("grav-6a", "gravel", "2026-12-09T17:00:00.000Z", { km: 30, min: 90 }),
  log("grav-6b", "gravel", "2026-12-12T07:30:00.000Z", { km: 91.4, min: 305, dplus: 980 }),
];
const ALL = logs.map((l) => l.id);
const UNTIL_22 = ["bloc-1", "grav-1a", "grav-1b", "bloc-2", "grav-2a", "grav-2b", "bloc-3", "grav-3b"];

const weeks = B.draft("endurance", { type: typeDays, sport: "gravel", weeks: 6, peak: 300 });
const gravel = {
  id: "gravel-90", title: "Gravel 90 km", intent: "Préparer une sortie gravel de 90 km en gardant une séance de bloc par semaine.", template: "endurance",
  sports: ["gravel", "bouldering"], start: "2026-11-02", weeks,
  goal: { title: "Sortie gravel de 90 km", date: "2026-12-12", kind: "measure", sport: "gravel", metric: "distance", target: 90 },
  milestones: [
    { id: "j1", title: "Sortie de 54 km", week: 2, kind: "measure", sport: "gravel", metric: "distance", target: 54 },
    { id: "j2", title: "Sortie de 72 km", week: 4, kind: "measure", sport: "gravel", metric: "distance", target: 72 },
  ],
};
const CREATE = { op: "create", input: gravel, today: "2026-11-01", at: "2026-11-01T18:00:00.000Z", preview: true };
const EXCEPTION = { op: "decide", id: "2026-11-30/2", decision: { kind: "skip" }, today: "2026-11-22", at: "2026-11-22T19:00:00.000Z" };
const PAUSE = { op: "pause", week: "2026-11-23", today: "2026-11-24" };
const SHIFT = { op: "shift", block: "gravel-90", args: { from: 4, weeks: 1 }, today: "2026-11-24", at: "2026-11-24T08:00:00.000Z", preview: true };
const J2 = { op: "milestone", block: "gravel-90", args: { id: "j2", title: "Sortie de 75 km", week: 5, kind: "measure", sport: "gravel", metric: "distance", target: 75 }, today: "2026-11-26", at: "2026-11-26T19:00:00.000Z", preview: true };
const ALLWEEKS = ["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14"];

const routine = {
  id: "routine-bloc", title: "Routine bloc et gravel", intent: "Quatre semaines régulières.", template: "routine", sports: ["bouldering", "gravel"], start: "2026-11-02",
  weeks: B.draft("routine", { type: typeDays, weeks: 4 }),
  goal: { title: "8 séances de bloc", date: "2026-11-29", kind: "measure", sport: "bouldering", metric: "sessions", target: 8 },
  milestones: [
    { id: "r1", title: "2 séances de bloc", week: 1, kind: "measure", sport: "bouldering", metric: "sessions", target: 2 },
    { id: "r2", title: "Sortie de 100 km", week: 3, kind: "measure", sport: "gravel", metric: "distance", target: 100 },
  ],
};

const cases = [
  { name: "1 — création : six semaines sur deux sports, deux jalons choisis, aperçu", journal: [], ops: [CREATE], read: { today: "2026-11-01", weeks: ["2026-10-26", "2026-11-02", "2026-11-09"] } },
  { name: "2 — trois semaines jouées : le premier jalon atteint par une vraie séance", journal: UNTIL_22, ops: [CREATE], read: { today: "2026-11-22", weeks: ALLWEEKS.slice(0, 5), context: ["2026-11-16"] } },
  { name: "3 — semaine en pause puis décalage d’une semaine, avec aperçu", journal: UNTIL_22, ops: [CREATE, EXCEPTION, PAUSE, SHIFT], read: { today: "2026-11-24", weeks: ALLWEEKS, context: ["2026-11-30", "2026-12-07"] } },
  { name: "3 bis — le même journal et la même pause, sans décalage", journal: UNTIL_22, ops: [CREATE, EXCEPTION, PAUSE], read: { today: "2026-11-24", weeks: ALLWEEKS } },
  {
    name: "4 — changement de jalon ; un jalon atteint et une semaine commencée ne changent pas", journal: UNTIL_22, ops: [CREATE, EXCEPTION, PAUSE, SHIFT, J2,
      { op: "milestone", block: "gravel-90", args: { id: "j1", title: "Sortie de 60 km", week: 2, kind: "measure", sport: "gravel", metric: "distance", target: 60 }, today: "2026-11-26", at: "2026-11-26T19:05:00.000Z", expect: "TRAINING_BLOCK_MILESTONE_CLOSED" },
      { op: "shift", block: "gravel-90", args: { from: 3, weeks: 1 }, today: "2026-11-26", at: "2026-11-26T19:06:00.000Z", expect: "TRAINING_BLOCK_WEEK_STARTED" },
      { op: "week", block: "gravel-90", args: { index: 3, days: typeDays }, today: "2026-11-26", at: "2026-11-26T19:07:00.000Z", expect: "TRAINING_BLOCK_WEEK_STARTED" },
    ], read: { today: "2026-11-26", weeks: ALLWEEKS, context: ["2026-12-07"] },
  },
  { name: "5 — fin du bloc : l’objectif atteint le 12 décembre par la sortie de 91,4 km", journal: ALL, ops: [CREATE, EXCEPTION, PAUSE, SHIFT, J2], read: { today: "2026-12-13", weeks: ALLWEEKS, context: ["2026-11-23", "2026-11-30", "2026-12-07"] } },
  {
    name: "6 — deux appareils : décalage sur le site, jalon et décision sur le téléphone", journal: UNTIL_22, ops: [CREATE, EXCEPTION, PAUSE, SHIFT], split: 1,
    remote: [
      { op: "decide", id: "2026-11-23/1", decision: { kind: "skip" }, today: "2026-11-24", at: "2026-11-24T09:00:00.000Z" },
      { ...J2, today: "2026-11-24", at: "2026-11-24T09:30:00.000Z", args: { ...J2.args, week: 4 }, preview: false },
    ],
    read: { today: "2026-11-24", weeks: ALLWEEKS },
  },
  { name: "7 — bloc créé sur d’anciennes séances : il ne s’applique qu’aux semaines à venir", journal: UNTIL_22, ops: [{ op: "create", input: routine, today: "2026-11-22", at: "2026-11-22T20:00:00.000Z", preview: true }], read: { today: "2026-11-22", weeks: ALLWEEKS.slice(0, 5), context: ["2026-11-09"] } },
  { name: "8 — puis retiré : les séances restent au journal, rien n’est marqué comme atteint", journal: UNTIL_22, ops: [{ op: "create", input: routine, today: "2026-11-22", at: "2026-11-22T20:00:00.000Z" }, { op: "remove", block: "routine-bloc", today: "2026-11-22", at: "2026-11-22T20:10:00.000Z", preview: true }], read: { today: "2026-11-22", weeks: ALLWEEKS.slice(0, 5), context: ["2026-11-23"] } },
  { name: "8 bis — le même journal sans bloc", journal: UNTIL_22, ops: [], read: { today: "2026-11-22", weeks: ALLWEEKS.slice(0, 5) } },
  {
    name: "9 — duplication : une semaine copiée sur une autre, puis le bloc dupliqué pour janvier", journal: [], ops: [CREATE,
      { op: "copy", block: "gravel-90", args: { from: 1, to: 3 }, today: "2026-11-01", at: "2026-11-01T18:10:00.000Z", preview: true },
      { op: "duplicate", block: "gravel-90", args: { start: "2027-01-04", newId: "gravel-90-janvier" }, today: "2026-11-01", at: "2026-11-01T18:20:00.000Z", preview: true },
    ], read: { today: "2026-11-01", weeks: ["2026-11-23"] },
  },
  {
    name: "10 — révision d’une seule semaine avec aperçu", journal: UNTIL_22, ops: [CREATE,
      { op: "week", block: "gravel-90", args: { index: 5, days: [null, typeDays[1], null, null, null, null, { sport: "gravel", minutes: 240, note: "Sortie longue" }] }, today: "2026-11-22", at: "2026-11-22T20:00:00.000Z", preview: true },
    ], read: { today: "2026-11-22", weeks: ["2026-11-30", "2026-12-07"] },
  },
  {
    name: "11 — refus : deux blocs sur les mêmes semaines, un bloc déjà fini", journal: [], ops: [CREATE,
      { op: "create", input: { ...routine, start: "2026-11-30" }, today: "2026-11-01", at: "2026-11-01T18:30:00.000Z", expect: "TRAINING_BLOCK_OVERLAP" },
      { op: "create", input: { ...routine, id: "old", start: "2026-09-07" }, today: "2026-11-01", at: "2026-11-01T18:31:00.000Z", expect: "TRAINING_BLOCK_IN_THE_PAST" },
    ], read: { today: "2026-11-01" },
  },
  {
    name: "12 — action déclarée : un jalon sans mesure n’est atteint que par la déclaration", journal: ALL, ops: [CREATE, EXCEPTION, PAUSE, SHIFT,
      { op: "milestone", block: "gravel-90", args: { newId: "j3", title: "Réviser le vélo", week: 5, kind: "declared" }, today: "2026-11-26", at: "2026-11-26T20:00:00.000Z" },
      { op: "declare", block: "gravel-90", args: { milestone: "j1" }, today: "2026-11-26", at: "2026-11-26T20:01:00.000Z", expect: "TRAINING_BLOCK_NOT_DECLARED" },
      { op: "declare", block: "gravel-90", args: { milestone: "j3" }, today: "2026-12-10", at: "2026-12-10T19:00:00.000Z" },
    ], read: { today: "2026-12-13", context: ["2026-12-07"] },
  },
];

const fixture = { version: B.VERSION, about: "V1.7.4 — Objectifs et blocs d’entraînement. Synthetic sessions; replayed by tests/training-block.test.mjs and mobile/__tests__/trainingBlock.test.tsx through tools/training-block/replay.cjs.", zone, type, logs, cases };
writeFileSync(new URL("../../tests/fixtures/training-block-v174.json", import.meta.url), JSON.stringify(fixture, null, 2) + "\n");
console.log(`${cases.length} cases, ${logs.length} sessions`);
