// V1.9.3 — Revue de suivi: the shared wording of the coach's weekly review, replayed on the server's own answers
// (tests/fixtures/coach-review.json, printed by tools/db/coach-review/fixtures.sql on PostgreSQL 16).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
globalThis.TitanCoachFollowup = require("../js/core/coach-followup.js");
const R = require("../js/core/coach-review.js");
const FU = globalThis.TitanCoachFollowup;
const FX = JSON.parse(readFileSync(new URL("./fixtures/coach-review.json", import.meta.url), "utf8"));
const card = (week, name) => week.cards.find((c) => c.name === name);

test("weeks are Paris Mondays, worded as days", () => {
  assert.equal(R.monday("2026-11-25"), "2026-11-23");
  assert.equal(R.monday("2026-11-29"), "2026-11-23", "a Sunday belongs to the week that began on Monday");
  assert.equal(R.monday("2026-11-23"), "2026-11-23");
  assert.equal(R.addDays("2026-11-23", -7), "2026-11-16");
  assert.equal(R.weekLabel("2026-11-23"), "Semaine du lundi 23 nov. au dimanche 29 nov.");
  assert.equal(R.monday(FX.week_all.today), FX.week_all.week, "the server's week is the Monday of its day");
});

test("the scenario: two answers awaited, a session to comment, an athlete ready, an empty dossier, two paused links", () => {
  const w = FX.week_actionable;
  assert.equal(R.summary(w.counts), "2 réponses attendues · 1 retour à laisser · 2 suites à préparer · 2 suivis en pause");
  assert.deepEqual(w.cards.map((c) => `${c.name}:${c.next}`), ["Lina:feedback", "Noé:prepare", "Zoé:prepare", "Léa:paused", "Paul:paused"], "actionable first; waiting athletes are left out by default");
  const lina = R.forCoach(card(w, "Lina"));
  assert.equal(lina.label, "Laisser un retour");
  assert.match(lina.text, /^Séance « Footing 8 km » faite le \w+ \d+ \w+\.?, liée par le sportif, sans retour pour l’instant\.$/);
  assert.equal(lina.source, `Séance liée du ${FU.day(card(w, "Lina").source.date)} · proposition « Footing 8 km »`);
  assert.deepEqual(lina.can, ["open", "feedback", "prepare"]);
  const zoe = R.forCoach(card(w, "Zoé"));
  assert.equal(zoe.label, "Préparer la suite");
  assert.equal(zoe.text, "Rien n’est prévu pour la semaine qui vient : prépare la suite.");
  assert.equal(zoe.source, `Proposition « Sortie longue 10 km » du ${FU.day(card(w, "Zoé").source.date)}`);
  assert.match(zoe.checkin, /^Semaine du lundi \d+ \w+\.? · Fatigue 2\/5 · Énergie 4\/5 · Sommeil 4\/5 · Motivation 5\/5$/);
  const noe = R.forCoach(card(w, "Noé"));
  assert.equal(noe.source, "Dossier vide : aucune proposition ni séance liée pour l’instant");
  assert.equal(noe.text, "Aucune séance proposée : prépare une première proposition à partir d’un modèle.");
  assert.deepEqual(noe.can, ["prepare"], "an empty dossier can still be prepared");
  const paul = R.forCoach(card(w, "Paul"));
  assert.equal(paul.paused, true);
  assert.deepEqual(paul.can, [], "nothing is read or prepared on a paused link");
  assert.equal(card(w, "Paul").items, undefined, "the server sends a paused link's name only");
});

test("waiting athletes and the link's contract: no unshared check-in, no private note, nothing from another coach", () => {
  const all = FX.week_all;
  const ines = R.forCoach(card(all, "Inès"));
  assert.equal(ines.label, "Attendre sa réponse");
  assert.equal(ines.text, "« Footing 45 min » attend sa réponse.");
  assert.equal(ines.checkin, "", "Inès did not share her check-in");
  assert.equal(R.forCoach(card(all, "Malo")).text, "Changement proposé sur « Fractionné 6 × 400 m » : le sportif décide.");
  const raw = JSON.stringify(FX.week_all);
  assert.ok(!raw.includes("Semaine très dure") && !raw.includes("Genou"), "neither the unshared check-in nor the private note is in the payload");
});

test("the preview of a prepared proposal: from the template, what the athlete receives, what changed", () => {
  const p1 = R.preview(FX.prep1.draft);
  assert.equal(p1.basis, "Modèle « Seuil 3 × 8 min »");
  assert.deepEqual(p1.changes.map((c) => [c.label, c.before]), [["Date prévue", "—"]], "only the date differs from the template");
  const p2 = R.preview(FX.prep2.draft);
  assert.deepEqual(p2.changes.map((c) => c.label), ["Date prévue", "Consignes"]);
  assert.match(p2.changes[1].before, /récupération 2 min$/);
  assert.match(p2.changes[1].after, /récupération 3 min$/);
  assert.deepEqual(p2.receive.map((x) => x.label), ["Nom", "Sport", "Date prévue", "Consignes"]);
  assert.equal(p2.receive[2].text, FU.day(FX.prep2.draft.content.planned_date));
  assert.equal(p2.canSend, true);
  assert.equal(FX.resumed.resumed, true);
  assert.equal(FX.resumed.draft.id, FX.prep2.draft.id, "preparing again after an interruption resumes the same draft");
  const zoe = R.forCoach(card(FX.week_resume, "Zoé"));
  assert.equal(zoe.label, "Reprendre la proposition préparée");
  assert.equal(zoe.source, `Proposition préparée le ${FU.day(card(FX.week_resume, "Zoé").source.date)} à partir de « Seuil 3 × 8 min »`);
  assert.deepEqual(zoe.can, ["resume"]);
});

test("revocation in the middle of the review, a send once, and the decision in the following week", () => {
  assert.equal(FX.send_revoked, "SHARING_UNAVAILABLE");
  assert.equal(R.message(FX.send_revoked), "Ce partage a été arrêté ou n’est plus accessible : rien n’a été envoyé.");
  assert.equal(FX.week_revoked.cards.some((c) => c.name === "Noé"), false, "Noé left the review");
  assert.equal(card(FX.week_revoked, "Paul").next, "prepare", "his place freed, Paul's link resumes by itself");
  assert.equal(FX.send.already, false);
  assert.equal(FX.send_again.already, true);
  assert.equal(FX.send_again.assignment.id, FX.send.assignment.id, "a second send creates nothing");
  const zoe = R.forCoach(card(FX.week_sent, "Zoé"));
  assert.equal(zoe.label, "Attendre sa réponse");
  assert.match(zoe.sent[0], /^« Seuil 3 × 8 min » du \w+ \d+ \w+\.? envoyée : en attente de sa réponse$/);
  const h = FU.history(FX.detail_sent);
  assert.equal(h.at(-1).text, `Préparée lors de la revue de la semaine du ${FU.day(FX.week_all.week)}, envoyée par le coach`);
  assert.ok(FX.athlete.rows.some((r) => r.id === FX.send.assignment.id && r.state === "awaiting"), "Zoé finds it in her own space");
  const next = R.forCoach(card(FX.week_next, "Zoé"));
  assert.match(next.previous[0], /^« Seuil 3 × 8 min » du .+ : acceptée$/, "her decision comes back the week after");
});

test("empty reviews and unknown codes stay readable", () => {
  assert.equal(R.summary({ athletes: 0 }), "Aucun sportif suivi pour l’instant.");
  assert.equal(R.summary({ athletes: 3, none: 3 }), "Rien à traiter cette semaine.");
  assert.equal(R.forCoach({}).label, "Rien à traiter cette semaine");
  assert.equal(R.message("NOPE"), "");
  assert.equal(R.preview(null).canSend, false);
});
