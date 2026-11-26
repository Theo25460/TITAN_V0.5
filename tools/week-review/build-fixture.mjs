// V1.7.3 — writes tests/fixtures/week-review-v173.json, the shared test set of the bilan (website tests/week-review.test.mjs and the
// Android copy mobile/__tests__/weekReview.test.tsx). Synthetic sessions of the V1.7 pilot sports (running, bouldering, strength), no
// account. Usage: node tools/week-review/build-fixture.mjs
import { writeFileSync } from "node:fs";

const tz = { timezone: "Europe/Paris" };
const run = (id, date, km, min) => ({ id, client_event_id: id, sport: "running", date, val: km, unit: "km", details: { ...tz, duration: min, client_event_id: id } });
const bloc = (id, date, grade) => ({ id, client_event_id: id, sport: "bouldering", date, val: 90, unit: "min", details: { ...tz, duration: 90, client_event_id: id, extras: { grade_system: "Fontainebleau bloc", climbing_discipline: "Bloc", max_done: grade } } });
const lift = (id, date, sets) => ({ id, client_event_id: id, sport: "muscu_gym", date, val: 1, unit: "kg", details: { ...tz, duration: 60, client_event_id: id, exercises: [{ name: "Squat", variant: "Barre", setRows: Array.from({ length: sets }, () => ({ weight: 100, reps: 5 })) }] } });

const logs = [
  // Week of 26 October: everything as planned.
  run("run-w1", "2026-10-27T17:30:00.000Z", 8.1, 45), bloc("bloc-w1", "2026-10-29T18:00:00.000Z", "6A"), lift("lift-w1", "2026-10-31T09:00:00.000Z", 4),
  // Week of 2 November: the Tuesday run moved to Wednesday (decision), done on Wednesday.
  run("run-w2", "2026-11-04T17:30:00.000Z", 8.4, 46), bloc("bloc-w2", "2026-11-05T18:00:00.000Z", "6A+"), lift("lift-w2", "2026-11-07T09:00:00.000Z", 4),
  // Week of 9 November: as planned.
  run("run-w3", "2026-11-10T17:30:00.000Z", 8.0, 44), bloc("bloc-w3", "2026-11-12T18:00:00.000Z", "6A+"), lift("lift-w3", "2026-11-14T09:00:00.000Z", 5),
  // Week of 16 November: the run done on Wednesday, tied to the Tuesday occurrence by the athlete.
  run("run-w4", "2026-11-18T17:30:00.000Z", 9.2, 50), bloc("bloc-w4", "2026-11-19T18:00:00.000Z", "6B"), lift("lift-w4", "2026-11-21T09:00:00.000Z", 5),
  // Week of 23 November (the week after the first bilan).
  run("run-w5", "2026-11-25T17:30:00.000Z", 9.0, 49), bloc("bloc-w5", "2026-11-26T18:00:00.000Z", "6B"), lift("lift-w5", "2026-11-28T09:00:00.000Z", 5),
  run("run-w5-tue", "2026-11-24T17:30:00.000Z", 6.0, 33),
];
const W1 = ["run-w1", "bloc-w1", "lift-w1"], W2 = ["run-w2", "bloc-w2", "lift-w2"], W3 = ["run-w3", "bloc-w3", "lift-w3"], W4 = ["run-w4", "bloc-w4", "lift-w4"], W5 = ["run-w5", "bloc-w5", "lift-w5"];
const history = [
  { op: "decide", id: "2026-11-02/1", decision: { kind: "move", day: "2026-11-04" }, today: "2026-11-03", at: "2026-11-03T07:00:00.000Z" },
  { op: "decide", id: "2026-11-16/1", decision: { kind: "link", session: "run-w4" }, today: "2026-11-18", at: "2026-11-18T19:00:00.000Z" },
];
// The typical week, followed since Monday 26 October (a V1.7.2 revision: the weeks before are « reconstructed » and never observed).
function withRevision(from) {
  const days = { tuesday: { sport: "running", minutes: 45, note: "Footing" }, thursday: { sport: "bouldering", minutes: 90 }, saturday: { sport: "muscu_gym", minutes: 60 } };
  const list = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((k) => (days[k] ? { sport: days[k].sport, minutes: days[k].minutes, note: days[k].note || "" } : null));
  return { ...days, revisions: { [from]: { days: list, at: `${from}T08:00:00.000Z` } } };
}
const R1 = "2026-11-16", R2 = "2026-11-23", D1 = "2026-11-22", D2 = "2026-11-29";
const move = (scope, from = 1, to = 2) => ({ kind: "move", from, to, scope });
const apply = (action, extra = {}) => ({ op: "apply", week: R1, action, today: D1, at: "2026-11-22T18:00:00.000Z", ...extra });

const cases = [
  { name: "1 — premier bilan : le créneau du mardi déplacé deux fois, le bloc régulier", journal: [...W1, ...W2, ...W3, ...W4], ops: history, read: { week: R1, today: D1 } },
  { name: "2 — aperçu : la semaine suivante seulement", journal: [...W1, ...W2, ...W3, ...W4], ops: history, preview: move("next"), read: { week: R1, today: D1 } },
  { name: "3 — aperçu : la semaine type", journal: [...W1, ...W2, ...W3, ...W4], ops: history, preview: move("type"), read: { week: R1, today: D1 } },
  { name: "4 — confirmé pour la semaine suivante : visible au programme", journal: [...W1, ...W2, ...W3, ...W4], ops: [...history, apply(move("next"))], read: { week: R1, today: D1, program: R2 } },
  { name: "5 — deuxième semaine : le bilan suivant distingue le changement décidé et ce qui a été observé", journal: [...W1, ...W2, ...W3, ...W4, ...W5], ops: [...history, apply(move("next"))], read: { week: R2, today: D2, program: R2 } },
  { name: "5b — deuxième semaine : la séance faite le mardi quand même", journal: [...W1, ...W2, ...W3, ...W4, "run-w5-tue", "bloc-w5", "lift-w5"], ops: [...history, apply(move("next"))], read: { week: R2, today: D2, program: R2 } },
  { name: "6 — confirmé dans la semaine type : le programme change à partir du lundi 23", journal: [...W1, ...W2, ...W3, ...W4, ...W5], ops: [...history, apply(move("type"))], read: { week: R2, today: D2, program: R2 } },
  { name: "7 — historique trop court : programme suivi depuis le lundi 16", journal: ["run-w4", "bloc-w4"], ops: [], type: withRevision("2026-11-16"), read: { week: R1, today: D1 } },
  { name: "7b — aucun programme", journal: W4, ops: [], type: {}, read: { week: R1, today: D1 } },
  { name: "8 — refus : la proposition est vue puis ignorée", journal: [...W1, ...W2, ...W3, ...W4], ops: history, preview: move("next"), read: { week: R1, today: D1, program: R2 } },
  { name: "9 — annulation d’un déplacement pour la semaine suivante", journal: [...W1, ...W2, ...W3, ...W4, ...W5], ops: [...history, apply(move("next")), { op: "undo", week: R1, today: "2026-11-23", at: "2026-11-23T07:00:00.000Z" }], read: { week: R2, today: D2, program: R2 } },
  { name: "9b — annulation d’un changement de la semaine type", journal: [...W1, ...W2, ...W3, ...W4], ops: [...history, apply(move("type")), { op: "undo", week: R1, today: D1, at: "2026-11-22T18:05:00.000Z" }], read: { week: R1, today: D1, program: R2 } },
  { name: "10 — mettre la semaine suivante en pause, puis le bilan suivant", journal: [...W1, ...W2, ...W3, ...W4, "bloc-w5"], ops: [...history, apply({ kind: "pause" })], read: { week: R2, today: D2, program: R2 } },
  { name: "10b — pause annulée", journal: [...W1, ...W2, ...W3, ...W4], ops: [...history, apply({ kind: "pause" }), { op: "undo", week: R1, today: D1, at: "2026-11-22T18:05:00.000Z" }], read: { week: R1, today: D1, program: R2 } },
  { name: "11 — reconduire le plan, puis le bilan suivant", journal: [...W1, ...W2, ...W3, ...W4, ...W5], ops: [...history, apply({ kind: "keep" })], read: { week: R2, today: D2, program: R2 } },
  { name: "12 — semaines régulières", journal: [...W1, "run-w2-tue", "bloc-w2", "lift-w2", ...W3, "run-w4-tue", "bloc-w4", "lift-w4"], ops: [], read: { week: R1, today: D1 } },
  { name: "13 — choix fait sur le téléphone, relu sur le site", journal: [...W1, ...W2, ...W3, ...W4], ops: history, remote: [apply(move("next"))], read: { week: R1, today: D1, program: R2 } },
  { name: "14 — bilan d’une semaine trop ancienne : lecture seule", journal: [...W1, ...W2, ...W3, ...W4], ops: history, read: { week: "2026-11-02", today: D1 } },
];
logs.push(run("run-w2-tue", "2026-11-03T17:30:00.000Z", 8.2, 45), run("run-w4-tue", "2026-11-17T17:30:00.000Z", 8.3, 45));

const fixture = {
  version: 1,
  about: "V1.7.3 — Bilan et ajustements. Shared test set of the website (tests/week-review.test.mjs) and of the Android copy (mobile/__tests__/weekReview.test.tsx). Typical week: running Tuesday, bouldering Thursday, strength Saturday. Four followed weeks from Monday 26 October 2026; the first bilan is the week of 16 November read on Sunday 22, the second the week of 23 November read on Sunday 29. Synthetic sessions, no account. Expected output: week-review-v173.expected.json (tools/week-review/write-expected.mjs).",
  zone: "Europe/Paris",
  type: withRevision("2026-10-26"),
  logs,
  cases,
};
writeFileSync(new URL("../../tests/fixtures/week-review-v173.json", import.meta.url), JSON.stringify(fixture, null, 2) + "\n");
console.log(`${cases.length} cases, ${logs.length} sessions`);
