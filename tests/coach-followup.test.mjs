// V1.9.1 — Une séance assignée: the shared wording of the coach follow-up, replayed on the server's own answers
// (tests/fixtures/coach-followup.json, printed by tools/db/coach-followup/fixtures.sql on PostgreSQL 16).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const F = require("../js/core/coach-followup.js");
const FX = JSON.parse(readFileSync(new URL("./fixtures/coach-followup.json", import.meta.url), "utf8"));
const byTitle = (rows, t) => rows.find((r) => r.title === t);

test("calendar days are read as days, in French, without a time-zone shift", () => {
  assert.equal(F.day("2026-11-19"), "jeudi 19 nov.");
  assert.equal(F.day("2026-11-21T23:30:00+00:00"), "samedi 21 nov.");
  assert.equal(F.day(null), "");
});

test("the scenario: planned date, moved date and the decision, in one row for the coach", () => {
  const hill = byTitle(FX.queue_before.rows, "Côtes · 8 × 45 s");
  const c = F.forCoach(hill);
  assert.equal(c.label, "À rapprocher");
  assert.equal(c.next, "wait");
  assert.equal(c.nextLabel, "Attendre une réponse");
  assert.deepEqual(c.dates.map((d) => d.key), ["planned", "moved"]);
  assert.equal(c.text, `Déplacée au ${F.day(hill.moved_date)} ; une séance du journal pourrait correspondre : le sportif doit confirmer le rapprochement.`);
  assert.ok(!/\.\./.test(c.text), "no double full stop after an abbreviated month");
  assert.equal(hill.candidates, null, "the coach never receives the candidate session");
  const linked = F.forCoach(FX.detail_linked);
  assert.equal(linked.label, "Liée");
  assert.deepEqual(linked.dates.map((d) => d.key), ["planned", "moved", "done"]);
  assert.equal(linked.text, `Prévue ${F.day(FX.detail_linked.planned_date)}, faite ${F.day(FX.detail_linked.done_date)} : 2 jours plus tard.`);
  assert.equal(linked.next, "gap");
  assert.ok(linked.can.includes("seen"), "the coach handles the gap");
});

test("the four distinctions: en attente, proposée à nouveau, faite sans correspondance, liée", () => {
  const q = FX.queue_before.rows;
  assert.equal(F.forCoach(byTitle(q, "Natation technique")).label, "En attente");
  const easy = F.forCoach(byTitle(q, "Footing souple"));
  assert.equal(easy.label, "Proposée à nouveau");
  assert.match(easy.text, /la version acceptée reste en vigueur/);
  assert.deepEqual(easy.changes.map((x) => x.label), ["Date", "Consignes"]);
  assert.equal(easy.changes[1].before, "45 min en aisance");
  assert.equal(easy.changes[1].after, "50 min dont 10 min allure marathon");
  assert.ok(easy.can.includes("withdraw_change") && !easy.can.includes("propose_change"));
  const bike = F.forCoach(byTitle(q, "Sortie vélo 2 h"));
  assert.equal(bike.label, "Faite sans correspondance");
  assert.equal(bike.next, "gap");
  assert.match(bike.text, /aucune séance de son journal n’y est liée/);
  assert.equal(F.forCoach(FX.detail_linked).label, "Liée");
  const tempo = F.forCoach(byTitle(q, "Tempo 3 × 10 min"));
  assert.equal(tempo.next, "suggest");
  assert.ok(tempo.can.includes("propose_change"));
  assert.deepEqual(F.counts(q), { all: 5, gap: 1, suggest: 1, wait: 3 });
});

test("the athlete sees what changes and answers; a match is only suggested", () => {
  const rows = FX.athlete_before.rows;
  const easy = F.forAthlete(byTitle(rows, "Footing souple"));
  assert.match(easy.text, /Ta version acceptée reste valable tant que tu n’as pas répondu/);
  assert.ok(easy.can.includes("accept_change") && easy.can.includes("decline_change"));
  assert.ok(!easy.can.includes("decline"), "a pending change is answered first");
  const hill = F.forAthlete(byTitle(rows, "Côtes · 8 × 45 s"));
  assert.equal(hill.candidates.length, 1);
  assert.ok(hill.can.includes("confirm") && hill.can.includes("move") && hill.can.includes("declare"));
  assert.match(hill.text, /Confirme si c’est bien elle : rien n’est lié sans toi/);
  const linked = F.forAthlete(FX.link_ok.row);
  assert.deepEqual(linked.can, ["unlink"]);
});

test("a double attempt keeps the first link and is in the history", () => {
  assert.equal(FX.link_refused.ok, false);
  assert.equal(F.message(FX.link_refused.code), "Cette proposition est déjà liée à une séance : le lien en place est gardé.");
  const h = F.history(FX.link_refused.row).map((x) => x.text);
  assert.ok(h.includes("Seconde tentative de lien refusée : le lien en place est gardé"), h.join(" / "));
  assert.equal(h[0], "Proposée");
  assert.ok(h.some((t) => /^Déplacée du .+ au .+ \(« Réunion jeudi soir »\)$/.test(t)));
  assert.ok(h.some((t) => /^Liée à la séance du /.test(t)));
});

test("the original accepted, the correction and the linked activity are found side by side", () => {
  const v = F.versions(FX.detail_linked);
  assert.equal(v.original.title, "Côtes · 8 × 45 s");
  assert.equal(v.original.planned_date, FX.detail_linked.planned_date);
  assert.equal(v.activity.val, 9.4);
  assert.equal(v.activity.session_id, null, "the coach gets no journal id");
  const easy = F.versions(byTitle(FX.list_before.rows, "Footing souple"));
  assert.equal(easy.correction.pending, true);
  assert.equal(easy.correction.instructions, "50 min dont 10 min allure marathon");
});

test("after a revocation: the coach's queue empties, the athlete keeps a read-only view and her session", () => {
  assert.ok(FX.queue_revoked.rows.every((r) => r.athlete_name !== "Inès"));
  const hill = byTitle(FX.athlete_revoked.rows, "Côtes · 8 × 45 s");
  const a = F.forAthlete(hill);
  assert.equal(a.readOnly, true);
  assert.deepEqual(a.can, []);
  assert.equal(a.link, "Partage arrêté : lecture seule. Ta séance reste dans ton journal.");
  assert.equal(hill.linked.session_id, "19100000-0000-4000-8000-0000000005a1");
});

test("the wording never blames nor counts", () => {
  const all = [...FX.queue_before.rows.map(F.forCoach), ...FX.athlete_before.rows.map(F.forAthlete)].map((x) => `${x.label} ${x.text}`).join(" ");
  for (const word of ["manquée", "raté", "échec !", "retard", "série perdue", "urgent"]) assert.ok(!all.includes(word), word);
});
