// V1.9.6 — js/core/coach-group.js on the server's own answers (tests/fixtures/coach-group.json, printed by tools/db/coach-group/fixtures.sql
// on PostgreSQL 16): the preview of the block for eight athletes, the variants, the per-recipient results of each send, the replay of a lost
// answer, the resumption, the group review and the coach's load, and what a group view never shows.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const FX = JSON.parse(readFileSync(ROOT + "tests/fixtures/coach-group.json", "utf8"));
globalThis.window = globalThis;
await import("../js/core/coach-group.js");
const CG = globalThis.TitanCoachGroup;
const byName = (rows) => Object.fromEntries(rows.map((r) => [r.name, r]));

test("the preview says who receives which version and who receives nothing, with the reason", () => {
  const pv = CG.preview(FX.variant_malo.dispatch);
  assert.equal(pv.rows.length, 8);
  assert.equal(pv.headline, "5 sportifs recevront sa version · 3 versions adaptées");
  assert.equal(pv.can_send, true);
  const r = byName(pv.rows);
  assert.deepEqual(Object.keys(r).sort(), ["Hugo", "Inès", "Léa", "Malo", "Noé", "Paul", "Suivi arrêté", "Zoé"].sort());
  for (const n of ["Zoé", "Noé", "Paul", "Inès", "Malo"]) assert.equal(r[n].label, "Recevra sa version", n);
  assert.equal(r["Léa"].label, "Ne recevra rien : suivi en pause");
  assert.equal(r["Hugo"].code, "COACH_CAPACITY_PAUSED");
  assert.equal(r["Suivi arrêté"].label, "Ne recevra rien : suivi arrêté");
  assert.equal(r["Suivi arrêté"].sessions.length, 0, "an ended link shows no version");
  assert.equal(pv.blocked.length, 3);
});

test("each variant is worded and the version per athlete has its own dates", () => {
  const r = byName(CG.preview(FX.variant_malo.dispatch).rows);
  assert.equal(r["Zoé"].variant, "Version commune");
  assert.equal(r["Paul"].variant, "Commence 1 semaine plus tard");
  assert.equal(r["Inès"].variant, "mardi → mercredi");
  assert.equal(r["Malo"].variant, "Sortie longue 2 : dimanche, semaine 2 · Sans Course 10 km");
  assert.equal(r["Malo"].session_count, 11);
  assert.deepEqual(r["Malo"].removed, ["Course 10 km"]);
  assert.ok(r["Inès"].sessions.filter((s) => s.title.startsWith("Fractionné")).every((s) => s.when.startsWith("mercredi")), "Inès: Wednesdays");
  assert.ok(r["Paul"].sessions[0].when.startsWith("mardi"));
  const mon = FX.ids.monday;
  assert.equal(FX.variant_malo.dispatch.recipients.find((x) => x.name === "Paul").start_date, new Date(Date.parse(mon + "T12:00:00Z") + 7 * 864e5).toISOString().slice(0, 10));
});

test("variantFrom gives the server exactly the variants of the scenario", () => {
  const t = FX.prepare.dispatch.sessions;
  assert.deepEqual(CG.variantFrom(t, { shift: 1 }), { shift_weeks: 1 });
  assert.deepEqual(CG.variantFrom(t, { map: { 2: 3, 4: 4, 6: 6 } }), { day_map: { 2: 3 } });
  assert.deepEqual(CG.variantFrom(t, { keep: { "w4-sat": false }, place: { "w2-sat": { week: 2, day: 7 }, "w1-tue": { week: 1, day: 2 } } }), { moves: [{ key: "w2-sat", week: 2, day: 7 }], skip: ["w4-sat"] });
  // A session placed where the weekday map already puts it is not a move.
  assert.deepEqual(CG.variantFrom(t, { map: { 2: 3 }, place: { "w1-tue": { week: 1, day: 3 } } }), { day_map: { 2: 3 } });
  assert.deepEqual(CG.variantFrom(t, {}), {});
});

test("the send is told recipient by recipient; a replay sends nothing again; the resumption serves only the rest", () => {
  const s1 = CG.results(FX.send1);
  assert.equal(s1.headline, "5 envois réussis · 3 sportifs n’ont rien reçu");
  assert.equal(s1.note, "Les envois réussis sont faits une fois pour toutes. Reprendre ne renverra qu’aux sportifs restants.");
  const r = byName(s1.rows);
  assert.equal(r["Malo"].label, "Envoyé (11 séances)");
  assert.equal(r["Zoé"].label, "Envoyé (12 séances)");
  assert.equal(r["Léa"].label, "Ne recevra rien : suivi en pause");
  assert.equal(r["Suivi arrêté"].sent, false);
  const replay = CG.results(FX.send1_replay);
  assert.equal(replay.replayed, true);
  assert.equal(replay.note, "Cet envoi avait déjà été fait : rien n’a été renvoyé.");
  assert.deepEqual(FX.send1_replay.results, FX.send1.results);
  const s2 = CG.results(FX.send2);
  assert.equal(s2.headline, "0 envoi réussi · 3 sportifs n’ont rien reçu");
  const p2 = CG.preview(FX.dispatch_sent2);
  assert.equal(p2.can_send, false, "nothing ready while the places are full");
  assert.equal(p2.incomplete, true);
  const resume = CG.preview(FX.dispatch_resume);
  assert.equal(resume.counts.ready, 2);
  const s3 = CG.results(FX.send3);
  assert.deepEqual(s3.rows.filter((x) => x.sent).map((x) => x.name).sort(), ["Hugo", "Léa"]);
  assert.equal(s3.rows.length, 3, "only the three remaining were tried");
  assert.equal(CG.results(FX.send4).headline, "Rien à envoyer : chaque sportif a reçu sa version ou a été laissé de côté.");
  assert.equal(CG.preview(FX.dispatch_complete).complete, true);
});

test("the group review gives the next action per athlete and the coach's load, counts only", () => {
  const rv = CG.review(FX.review);
  const r = byName(rv.rows);
  assert.equal(r["Noé"].label, "Répondre à une demande de discussion");
  assert.equal(r["Zoé"].label, "Rien à faire pour l’instant");
  assert.equal(r["Paul"].short, "Réponses attendues");
  assert.match(r["Zoé"].plan, /^Bloc 10 km — 4 semaines · 12\/12 acceptées$/);
  assert.equal(r["Suivi arrêté"].label, "Plus rien à suivre");
  assert.equal(rv.headline, "1 cas à traiter · 1 sportif à voir · 70 réponses attendues");
  assert.equal(rv.places, "7 / 15 places de ton offre");
  const text = JSON.stringify(FX.review);
  for (const secret of ["Genou fragile", "6 × 400", "instructions", "session_id", "discuss_note"]) assert.ok(!text.includes(secret), secret);
  const left = byName(CG.review(FX.review_left).rows);
  assert.ok(!("Malo" in left), "an ended link has no name");
});

test("an athlete never sees a group, another athlete or a variant", () => {
  assert.equal(FX.athlete_group_error, "COACH_ONLY");
  const text = JSON.stringify(FX.program_athlete_zoe) + JSON.stringify(FX.snapshot_zoe);
  for (const other of ["Noé", "Paul", "Inès", "Malo", "Léa", "Hugo", "Sacha", "Groupe 10 km", "variant", "dispatch", "basis"]) assert.ok(!text.includes(other), other);
  for (const id of Object.entries(FX.ids.links).filter(([n]) => n !== "Zoé").map(([, v]) => v)) assert.ok(!text.includes(id));
  assert.equal(FX.program_athlete_zoe.plans.length, 1);
  assert.equal(FX.program_athlete_paul.plans[0].start_date > FX.program_athlete_zoe.plans[0].start_date, true, "Paul a week later");
  assert.deepEqual(FX.program_athlete_zoe_after_delete.plans.map((p) => p.id), FX.program_athlete_zoe.plans.map((p) => p.id), "deleting the group takes nothing back");
  assert.equal(FX.groups_after_delete.groups.length, 0);
});

test("messages of the server codes", () => {
  assert.match(CG.message("COACH_CONFLICT"), /Relis l’aperçu/);
  assert.match(CG.message("ALREADY_SENT"), /déjà reçu sa version/);
  assert.equal(CG.outcome("WHATEVER").label, "Non envoyé");
});
