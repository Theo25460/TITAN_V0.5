// V1.9.4 — Programmation multi-semaines: the shared wording of a multi-week programme, replayed on the server's own answers
// (tests/fixtures/coach-program.json, printed by tools/db/coach-program/fixtures.sql on PostgreSQL 16).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
globalThis.TitanCoachFollowup = require("../js/core/coach-followup.js");
const P = require("../js/core/coach-program.js");
const FU = globalThis.TitanCoachFollowup;
const FX = JSON.parse(readFileSync(new URL("./fixtures/coach-program.json", import.meta.url), "utf8"));
const byKey = (plan, k) => plan.sessions.find((s) => s.key === k);

test("a cycle starts on a Monday; its weeks are worded as days", () => {
  assert.deepEqual(P.mondays("2026-11-25", 3), ["2026-11-23", "2026-11-30", "2026-12-07"]);
  assert.deepEqual(P.mondays("2026-11-29", 1), ["2026-11-23"], "a Sunday belongs to the week that began on Monday");
  assert.equal(P.sessionDate("2026-11-30", 2, 7), "2026-12-13");
  assert.equal(P.weekLabel({ start_date: "2026-11-30", weeks: 4 }, 2), "Semaine 2 sur 4 · du lundi 7 déc. au dimanche 13 déc.");
  const p = FX.adapt.plan;
  for (const s of p.sessions) assert.equal(s.planned_date, P.sessionDate(p.start_date, s.week, s.day), "the server and the module date a session alike");
});

test("the template is versioned; a draft keeps the version it came from", () => {
  assert.equal(FX.library_empty.programs.length, 0);
  const g = FX.library.programs[0];
  assert.equal(g.title, "Course et renforcement — 4 semaines");
  assert.equal(g.version, 1);
  assert.equal(g.sessions.length, 12);
  const h = P.head(FX.adapt.plan);
  assert.equal(h.stateLabel, "Brouillon");
  assert.equal(h.origin, "Modèle « Course et renforcement — 4 semaines », version 1");
  assert.match(P.summary(FX.adapt.plan), /^12 séances sur 4 semaines · brouillon, rien n’est envoyé$/);
  assert.match(P.head({ ...FX.adapt.plan, program: { ...FX.adapt.plan.program, current_version: 2 } }).origin, /le modèle est maintenant en version 2 ; ce programme garde la sienne/);
});

test("adapted for Inès: the preview lists what differs from the template", () => {
  const ch = P.changes(FX.edit.plan);
  assert.deepEqual(ch.map((c) => `${c.key}:${c.kind}`), ["w1-thu:removed", "w2-tue:changed", "w2-sat:changed", "w2-thu:changed"]);
  assert.deepEqual(ch[0].rows, [{ field: "when", label: "Quand", before: "semaine 1, jeudi", after: "—" }]);
  assert.deepEqual(ch[1].rows, [{ field: "day", label: "Jour", before: "mardi", after: "lundi" }]);
  assert.deepEqual(ch[2].rows, [{ field: "day", label: "Jour", before: "samedi", after: "dimanche" }]);
  assert.deepEqual(ch[3].rows.map((r) => `${r.label}: ${r.before} → ${r.after}`), ["Jour: jeudi → dimanche", "Nom: Renforcement 30 min → Gainage 20 min", "Consignes: Gainage, fentes, pompes → Planche, gainage latéral"]);
  assert.equal(FX.link_draft.plans[0].state, "draft");
  assert.equal(FX.link_draft.plans[0].revision, 2);
});

test("sent once: eleven proposals waiting, a replay answers « already »", () => {
  assert.equal(FX.send.already, false);
  assert.equal(FX.send_again.already, true);
  assert.equal(FX.send.plan.counts.sessions, 11);
  assert.equal(P.summary(FX.send.plan), "11 en attente de réponse");
  assert.equal(FX.assignments_sent.total, 11, "ordinary proposals of the portal");
  assert.ok(FX.assignments_sent.rows.every((r) => r.plan_id === FX.send.plan.id && r.status === "proposed"));
  const ath = FX.athlete_sent.plans[0];
  assert.equal(ath.coach_name, "Coach Lou");
  assert.equal(ath.basis, undefined, "the athlete never reads the coach's working basis");
  assert.equal(ath.changes, undefined);
  assert.deepEqual(P.toAnswer(ath), { sessions: 11, changes: 0 });
  const hist = FU.history(byKey(FX.plan_answered, "w1-tue"));
  assert.ok(hist.some((h) => h.text === "Fait partie du programme « Course et renforcement — Inès », semaine 1 sur 4"));
});

test("the coach sees which sessions were accepted, declined or are to discuss", () => {
  const p = FX.link_answered.plans[0];
  assert.equal(P.summary(p), "9 acceptées · 1 à discuter · 1 déclinée");
  const w3 = P.session(byKey(FX.plan_answered, "w3-sat"), "coach");
  assert.equal(w3.label, "À discuter");
  assert.equal(w3.discuss, "Je préfère des côtes ce samedi-là");
  assert.equal(w3.text, "Le sportif souhaite en discuter : « Je préfère des côtes ce samedi-là ». Tu peux la modifier ; il peut toujours l’accepter ou la décliner.");
  assert.equal(P.session(byKey(FX.plan_answered, "w4-thu"), "coach").label, "Déclinée");
  const answers = FX.answer.results.map((r) => P.answerText(r));
  assert.equal(answers.filter((t) => t === "Acceptée").length, 9);
  assert.ok(answers.includes("À discuter") && answers.includes("Déclinée"));
});

test("the case to discuss reaches the V1.9.1 queue and the V1.9.3 review with its programme", () => {
  const row = FX.queue_discuss.rows.find((r) => r.state === "to_discuss");
  assert.equal(row.coach_next, "gap");
  assert.equal(FU.planLine(row), "Programme « Course et renforcement — Inès » · semaine 3 sur 4");
  const card = FX.review_discuss.cards.find((c) => c.name === "Inès");
  assert.equal(card.next, "gap");
  assert.equal(card.dossier.state, "to_discuss");
  assert.equal(FU.planLine(card.dossier), "Programme « Course et renforcement — Inès » · semaine 3 sur 4");
});

test("replacing one occurrence not answered yet: previewed, then updated", () => {
  const v = P.revision(FX.dry_occurrence, FX.plan_answered);
  assert.equal(v.title, "Cette séance est modifiée");
  assert.deepEqual(v.effects.map((e) => `${e.key}:${e.effect}`), ["w3-sat:updated"]);
  assert.deepEqual(v.effects[0].rows.map((r) => `${r.label}: ${r.before} → ${r.after}`), ["Nom: Sortie longue 14 km → Sortie 10 km avec côtes", "Consignes: Allure confortable → 6 côtes de 200 m au milieu"]);
  assert.ok(v.applies && v.key);
  assert.equal(FX.revise_occurrence.version, 2);
});

test("two weeks later: week 1 played, week 2 current; shifting week 2 keeps the session done", () => {
  const p = FX.plan_aged;
  assert.equal(p.current_week, 2);
  const w = P.weeks(p, "coach");
  assert.deepEqual(w.map((x) => x.state), ["played", "current", "coming", "coming"]);
  assert.equal(w[0].stateLabel, "Jouée");
  assert.equal(P.session(byKey(p, "w1-tue"), "coach").label, "Liée");
  assert.equal(FX.week_played, "WEEK_PLAYED");
  assert.equal(P.message(FX.week_played), "Cette semaine est déjà jouée : elle reste dans l’historique telle qu’elle a été.");
  const v = P.revision(FX.dry_week, p);
  assert.equal(v.title, "La semaine 2 est décalée de 2 jours plus tard");
  assert.deepEqual(v.effects.map((e) => `${e.key}:${e.effect}`), ["w2-tue:kept_done", "w2-sat:change_proposed", "w2-thu:change_proposed"]);
  assert.equal(v.effects[0].text, "Faite et liée à une séance : conservée telle quelle.");
  assert.equal(v.effects[1].text, "Acceptée : le changement attend sa réponse, la version acceptée reste en vigueur.");
  assert.equal(v.counts, "2 changement(s) proposé(s) au sportif · 1 conservée(s)");
  assert.equal(v.note, "Déplacement pro dimanche");
  assert.equal(FX.revise_week.version, 3);
  assert.equal(FX.revise_week_again.already, true, "the same op_id replays the version, nothing more");
  assert.equal(FX.revise_week_again.version, 3);
  assert.deepEqual(FX.plan_week.versions.map((x) => P.version(x).text), [
    "Envoyé : 11 séances, 4 adaptations du modèle",
    "Une séance modifiée : 1 mise(s) à jour (« Côtes comme demandé »)",
    "Semaine 2 décalée de 2 jours : 2 changement(s) proposé(s), 1 faite(s) conservée(s) (« Déplacement pro dimanche »)",
  ]);
});

test("the athlete answers the changes: accepted, or her version kept", () => {
  const ath = FX.athlete_changes.plans[0];
  assert.deepEqual(P.toAnswer(ath), { sessions: 0, changes: 2 });
  const thu = P.session(byKey(ath, "w2-thu"), "athlete");
  assert.ok(thu.changePending && thu.can.includes("accept_change"));
  assert.deepEqual(thu.changes.map((c) => c.field), ["planned_date"]);
  assert.deepEqual(P.answers({ "w2-thu": { answer: "accept_change" }, "w2-sat": { answer: "keep_version" }, "w3-tue": {} }),
    [{ key: "w2-thu", answer: "accept_change" }, { key: "w2-sat", answer: "keep_version" }]);
  assert.deepEqual(P.answers({ "w3-sat": { answer: "discuss", note: "x".repeat(400) } })[0].note.length, 300);
  assert.deepEqual(FX.answer_changes.results.map((r) => P.answerText(r)).sort(), ["Changement accepté", "Version gardée"]);
  const rest = P.revision(FX.dry_rest, FX.plan_week);
  assert.equal(rest.title, "La suite du cycle, à partir de la semaine 3 est décalée de 7 jours plus tard");
  assert.equal(rest.effects.find((e) => e.key === "w4-thu").text, "Déclinée : laissée telle quelle.");
  assert.equal(FX.answer_all.results.filter((r) => r.effect === "change_accepted").length, 5);
});

test("pause, revocation and closing: read-only, the athlete keeps her own sessions", () => {
  assert.equal(FX.paused_error, "COACH_CAPACITY_PAUSED");
  const paused = FX.athlete_paused.plans[0];
  assert.equal(P.head(paused).link, "Suivi en pause : lecture seule, rien n’est supprimé.");
  assert.equal(paused.can_act, false);
  const linked = byKey(paused, "w1-tue");
  assert.equal(linked.state, "linked");
  assert.ok(linked.linked.session_id, "Inès reads her own session");
  assert.ok(P.session(linked, "athlete").readOnly);
  assert.equal(FX.revoked_error, "SHARING_UNAVAILABLE");
  const revoked = FX.athlete_revoked.plans[0];
  assert.equal(P.head(revoked).link, "Partage arrêté : lecture seule.");
  assert.equal(revoked.state, "sent");
  assert.equal(FX.close.plan.state, "closed");
  assert.equal(P.head(FX.close.plan).stateLabel, "Clos");
  assert.match(P.version(FX.plan_closed.versions.at(-1)).text, /^Cycle clos : \d+ acceptée\(s\), 2 liée\(s\)/);
  assert.equal(FX.athlete_closed.plans[0].versions.length, 5, "the athlete reads every version (sent, three revisions, closing)");
});

test("an op_id is a v4 uuid, new for every preview", () => {
  const a = P.opId(), b = P.opId();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, b);
});
