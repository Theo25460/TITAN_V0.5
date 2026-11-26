// V1.9.2 — Retour sur la séance: the shared wording of a coach feedback, replayed on the server's own answers
// (tests/fixtures/coach-feedback.json, assembled by tools/db/coach-feedback/build-fixtures.mjs on PostgreSQL 16).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const F = require("../js/core/coach-feedback.js");
const FU = require("../js/core/coach-followup.js");
const FX = JSON.parse(readFileSync(new URL("./fixtures/coach-feedback.json", import.meta.url), "utf8"));

test("the composer shows what the link shares now: date, measures, exercises with their sets, the shared check-in, never the note", () => {
  const v = F.session(FX.compose.session, "coach");
  assert.equal(v.state, "shared");
  assert.equal(v.heading, `Séance du ${F.day(FX.compose.session.day)} · Musculation en salle`);
  assert.deepEqual(v.measures.map((m) => m.text), ["3 840 kg", "55 min"]);
  assert.equal(v.exercises[0].name, "Squat");
  assert.equal(v.exercises[0].summary, "4 × 6 à 80 kg");
  assert.deepEqual(v.exercises[0].sets, ["80 kg × 6 (RIR 2)", "80 kg × 6 (RIR 1)", "80 kg × 6 (RIR 1)", "80 kg × 5 (RIR 0)"]);
  assert.match(v.checkin, /^Check-in de la semaine du .+, partagé : Fatigue 4\/5 · Sommeil 2\/5 — « Semaine chargée »$/);
  assert.equal(v.note, "", "the note is not shared");
  assert.equal(v.hidden, "Non partagé par le sportif : la note.");
  assert.ok(!JSON.stringify(FX.compose).includes("Épaule"), "the server never sent the private note");
  assert.equal(FX.compose.targets.length, 2, "the open proposals an adjustment may target");
});

test("observation and proposal are two blocks; the proposal is pending with what would change", () => {
  const c = F.forCoach(FX.given);
  assert.match(c.observation, /^La dernière série est descendue à RIR 0/);
  assert.equal(c.adjustment.kind, "change");
  assert.equal(c.adjustment.label, "À confirmer");
  assert.equal(c.adjustment.heading, "Ajuster « Force · Squat 5 × 5 »");
  assert.deepEqual(c.adjustment.changes, [{ field: "instructions", label: "Consignes", before: "5 séries de 5 à 82,5 kg", after: "5 séries de 5 à 80 kg, RIR 2 sur chaque série" }]);
  assert.equal(c.adjustment.note, "On consolide avant de monter");
  assert.equal(c.adjustment.text, "En attente de la réponse du sportif : rien ne change sans son accord.");
  assert.deepEqual(c.can, ["withdraw"]);
  assert.equal(F.message(FX.stale_key.error), "La séance ou son partage a changé pendant ta rédaction. Relis les mesures puis renvoie : ton texte est gardé.");
});

test("the thread carries the observation and says which message is a feedback", () => {
  const m = FX.thread_athlete.rows.find((r) => r.feedback_id);
  assert.equal(m.feedback_id, FX.given.id);
  assert.match(m.body, /^La dernière série/);
  assert.ok(!JSON.stringify(FX.thread_athlete).includes("setRows"), "no measure in the thread");
});

test("the athlete reads it from their session and decides", () => {
  const r = FX.athlete_session.rows[0];
  const v = F.forAthlete(r);
  assert.deepEqual(v.can, ["accept", "decline", "read"]);
  assert.equal(v.adjustment.text, "Rien ne change tant que tu n’as pas répondu. Accepter met à jour la proposition ; décliner ne change rien.");
  assert.equal(v.session.hidden, "Tu ne partages pas : la note.");
  assert.equal(F.preview(r, "athlete"), `Retour du ${F.writtenOn(r.created_at)} · « Force · Squat 4 × 6 » · séance du ${F.day(r.session.day)} · 2 exercices · proposition à confirmer`);
});

test("an accepted adjustment is carried into the next proposal, whose history says so", () => {
  const a = F.adjustment(FX.answer_accepted.row.adjustment, "athlete");
  assert.equal(a.label, "Acceptée");
  assert.match(a.text, /^Acceptée le .+ : « Force · Squat 5 × 5 » est à jour, prévue .+\.$/);
  assert.ok(!/\.\./.test(a.text), "no double full stop after an abbreviated month");
  assert.equal(FX.next_after.instructions, "5 séries de 5 à 80 kg, RIR 2 sur chaque série");
  assert.equal(FX.next_after.accepted_version.instructions, "5 séries de 5 à 82,5 kg", "the first accepted version is kept (V1.9.1)");
  const h = FU.history(FX.next_after);
  assert.equal(h.at(-1).text, "Ajustée après un retour du coach, accepté par le sportif");
  assert.equal(FU.versions(FX.next_after).correction.instructions, "5 séries de 5 à 80 kg, RIR 2 sur chaque série");
});

test("a new session suggested is worded as such and waits", () => {
  const r = FX.athlete_inbox.rows.find((x) => x.adjustment?.kind === "new");
  const a = F.adjustment(r.adjustment, "athlete");
  assert.equal(a.heading, "Ajouter « Décharge »");
  assert.deepEqual(a.changes.map((c) => c.field), ["title", "sport", "planned_date", "instructions"]);
  assert.equal(FX.athlete_inbox.rows[0].id, r.id, "what waits for an answer comes first");
});

test("details withdrawn by the athlete leave every coach view and preview at the next read", () => {
  const before = FX.list_coach.rows.find((r) => r.id === FX.given.id);
  const after = FX.list_coach_withdrawn.rows.find((r) => r.id === FX.given.id);
  assert.match(F.preview(before, "coach"), /2 exercices/);
  assert.doesNotMatch(F.preview(after, "coach"), /exercice/);
  const v = F.session(FX.detail_coach_withdrawn.session, "coach");
  assert.deepEqual(v.exercises, []);
  assert.equal(v.checkin, "", "the check-in sharing was withdrawn too");
  assert.equal(v.hidden, "Non partagé par le sportif : le détail des exercices et la note.");
  for (const k of ["detail_coach_withdrawn", "list_coach_withdrawn"]) {
    const t = JSON.stringify(FX[k]);
    assert.ok(!t.includes("setRows") && !t.includes("Squat\"") && !t.includes("Semaine chargée"), `${k} carries nothing withdrawn`);
  }
});

test("archived: no measure for the coach, the context stays", () => {
  const c = F.forCoach(FX.detail_coach_archived);
  assert.equal(c.session.state, "archived");
  assert.equal(c.session.measures.length, 0);
  assert.equal(c.session.text, "Le sportif a archivé ou remplacé cette séance dans son journal : ses mesures ne sont plus affichées. Ton retour et la proposition restent.");
  assert.match(c.observation, /^La dernière série/);
  assert.equal(c.adjustment.label, "Acceptée");
  assert.equal(F.preview(FX.detail_coach_archived, "coach").includes("séance archivée"), true);
});

test("after revocation: the coach's direct link is refused, the athlete reads without acting, the journal kept its values", () => {
  assert.equal(FX.coach_detail_revoked.error, "SHARING_UNAVAILABLE");
  assert.equal(F.message("SHARING_UNAVAILABLE"), "Ce partage a été arrêté ou n’est plus accessible : ce retour ne peut plus être ouvert.");
  for (const r of FX.athlete_revoked.rows) {
    const v = F.forAthlete(r);
    assert.deepEqual(v.can, []);
    assert.equal(v.link, "Partage arrêté : lecture seule. Ton coach ne voit plus ce retour ni ta séance.");
  }
  assert.equal(FX.journal_after.details.exercises[0].setRows[3].reps, 5, "the athlete's values are untouched by every feedback action");
  assert.equal(FX.journal_after.details.note, "Épaule un peu raide");
});

test("days and written dates read without a time-zone shift", () => {
  assert.equal(F.day("2026-11-22"), "dimanche 22 nov.");
  assert.equal(F.writtenOn("2026-11-24T23:30:00Z"), "25 nov.");
  assert.equal(F.exercise({ name: "Gainage", sets: 3 }).summary, "3 séries");
});
