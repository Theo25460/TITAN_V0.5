// V1.9.5 — Bilans de cycle partageables: the shared wording of a cycle report, replayed on the server's own answers
// (tests/fixtures/coach-cycle.json, printed by tools/db/coach-cycle/fixtures.sql on PostgreSQL 16).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
globalThis.TitanCoachFollowup = require("../js/core/coach-followup.js");
const CY = require("../js/core/coach-cycle.js");
const FX = JSON.parse(readFileSync(new URL("./fixtures/coach-cycle.json", import.meta.url), "utf8"));
const fig = (t, id, unit) => t.figures.find((f) => f.id === id && (!unit || f.unit === unit));
const ses = (r, k) => r.sessions.find((s) => s.key === k);

// The reference report of the lot: what a coach would count by hand on the scenario (6 weeks, 18 sessions, see sql/tests/300_coach_cycle_reports.sql).
const REFERENCE = {
  counts: { proposed: 18, accepted: 16, done: 8, moved: 3, declared: 1, open: 6, declined: 1, cancelled: 1, archived: 1 },
  km: 70, kmSessions: 7, minutes: 414, minuteSessions: 7,
  weeks: [[3, 3, 0], [3, 2, 1], [2, 0, 0], [3, 2, 1], [3, 2, 1], [2, 0, 0]],
  moved: ["w2-sat", "w3-tue", "w5-tue"],
};

test("the cycle the report is about: listed on the link, without a report yet", () => {
  assert.equal(FX.link_none.reports.length, 0);
  assert.equal(FX.link_none.cycles.length, 1);
  assert.equal(FX.link_none.cycles[0].state, "closed");
  assert.equal(FX.athlete_none.reports.length, 0, "Inès sees nothing before it is proposed");
  assert.equal(FX.link_ines_none.reports.length, 0);
});

test("the coach's working copy: figures with their period and sources, no note, no check-in, no journal id", () => {
  const r = FX.start.report;
  assert.equal(r.state, "draft");
  assert.equal(r.hosted, "none");
  const t = CY.totals(r.draft.totals, r.draft.sessions);
  assert.equal(t.weeksCount, 6);
  assert.match(t.period, /^du lundi \d+ \S+ au dimanche \d+ \S+$/);
  for (const f of t.figures) {
    assert.ok(f.period, `${f.id} has a period`);
    assert.match(f.source, /^Source : /, `${f.id} has a source`);
  }
  // Before Inès chooses anything, the coach reads the measures inside the link's scope: all eight done sessions, so 9 h 24 over 8.
  assert.equal(fig(r.draft.totals, "done").n, 8);
  assert.equal(fig(r.draft.totals, "volume", "km").value, 70);
  assert.equal(fig(r.draft.totals, "duration").value, 444);
  const text = JSON.stringify(r);
  assert.doesNotMatch(text, /Genou|Bonnes jambes|Semaine chargée/);
  assert.doesNotMatch(text, /session_id|"ref"/);
  assert.equal(r.draft.checkins, undefined);
});

test("published version = reference report (counts, measures, weeks, moved sessions)", () => {
  const pub = FX.report_published.published;
  for (const [id, n] of Object.entries(REFERENCE.counts)) assert.equal(fig(pub.totals, id).n, n, id);
  assert.equal(fig(pub.totals, "volume", "km").value, REFERENCE.km);
  assert.equal(fig(pub.totals, "volume", "km").n, REFERENCE.kmSessions);
  assert.equal(fig(pub.totals, "duration").value, REFERENCE.minutes);
  assert.equal(fig(pub.totals, "duration").n, REFERENCE.minuteSessions);
  assert.equal(fig(pub.totals, "volume", "reps"), undefined, "the strength session's measure stays private");
  assert.deepEqual(pub.totals.weeks.map((w) => [w.planned, w.done, w.moved]), REFERENCE.weeks);
  assert.deepEqual(fig(pub.totals, "moved").sources, REFERENCE.moved);
  // The sum of the figures is the cycle: every session counted once.
  const c = REFERENCE.counts;
  assert.equal(c.done + c.declared + c.open + c.declined + c.cancelled + c.archived, c.proposed);
  // And the athlete sees exactly what the coach sees.
  assert.deepEqual(FX.report_ines_published.published, pub);
});

test("what the screen shows matches the reference, figure by figure", () => {
  const pub = FX.report_published.published;
  const t = CY.totals(pub.totals, pub.sessions);
  const shown = Object.fromEntries(t.figures.map((f) => [f.unit ? `${f.id}:${f.unit}` : f.id, f.value]));
  assert.deepEqual(shown, { proposed: "18", accepted: "16", done: "8", moved: "3", declared: "1", open: "6", declined: "1", cancelled: "1", archived: "1", "duration:min": "6 h 54", "volume:km": "70 km" });
  assert.equal(fig(t, "volume", "km").count, "7 séances");
  assert.deepEqual(fig(t, "moved").sources.map((s) => s.key), REFERENCE.moved);
  assert.match(fig(t, "moved").sources[0].text, /^dimanche \d+ \S+ · Sortie longue 12 km$/, "a moved session is named by its date in force");
  assert.equal(CY.summary(pub.totals), "18 proposées · 16 acceptées · 8 réalisées · 3 reportées");
  assert.deepEqual(t.weeks.map((w) => [w.planned, w.done, w.moved]), REFERENCE.weeks);
});

test("a session in words: moved by whom, done when, archived, declared", () => {
  const pub = FX.report_published.published;
  const s = CY.session(ses(pub, "w2-sat"));
  assert.equal(s.label, "Réalisée");
  assert.deepEqual(s.dates.map((d) => d.label), ["Prévue", "Reportée par le sportif au", "Faite"]);
  assert.equal(s.measure, "12 km · 1 h 15");
  assert.equal(s.note, "Sortie décalée, bien passée");
  assert.equal(CY.session(ses(pub, "w5-tue")).dates[1].label, "Reportée par le coach au");
  assert.match(CY.session(ses(pub, "w3-sat")).text, /archivée depuis/);
  assert.equal(CY.session(ses(pub, "w3-sat")).measure, "");
  assert.equal(CY.session(ses(pub, "w4-tue")).label, "Dite faite");
  assert.equal(CY.session(ses(pub, "w1-thu")).measure, "", "done, measure kept private by Inès");
  assert.match(CY.session(ses(pub, "w1-thu")).text, /pas partagée/);
  assert.equal(CY.session(ses(pub, "w6-sat")).label, "Annulée");
});

test("validation: notes and check-ins are never ticked for the athlete; a note goes with its measure", () => {
  const p = FX.report_ines_proposed.proposal;
  const c = CY.choices(p);
  assert.equal(Object.keys(c.measures).length, 8, "eight measures offered (the archived run is not)");
  assert.ok(Object.values(c.measures).every(Boolean), "first validation: measures ticked to start from");
  assert.ok(Object.values(c.notes).every((v) => v === false), "no note ticked");
  assert.ok(Object.values(c.checkins).every((v) => v === false), "no check-in ticked, even the one already shared by the check-in tool");
  assert.equal(p.checkins.find((x) => x.already_shared)?.week, p.checkins[1].week);
  c.measures["w1-thu"] = false; c.notes["w1-sat"] = true; c.notes["w2-sat"] = true; c.notes["w1-tue"] = true; c.measures["w1-tue"] = false; c.checkins[p.checkins[0].week] = true;
  const v = CY.validation(p, c, { opId: "x", decisions: { d1: "approve", d2: "decline", d3: "approve", d4: "maybe" }, allowExport: true, understood: "clear" });
  assert.deepEqual(v.share.notes, ["w1-sat", "w2-sat"], "the note of a session whose measure is not shared is dropped");
  assert.equal(v.share.measures.length, 6);
  assert.deepEqual(v.decisions, [{ key: "d1", answer: "approve" }, { key: "d2", answer: "decline" }, { key: "d3", answer: "approve" }]);
  assert.equal(v.preview_key, p.preview_key);
  assert.match(CY.shareSummary(p, c), /^Ton coach verra : 6 mesure\(s\) sur 8, 2 notes, 1 check-in\./);
  // A later validation starts from what was validated last.
  const again = CY.choices(FX.report_ines_withdrawn.proposal);
  assert.equal(again.measures["w1-thu"], false);
  assert.equal(again.notes["w1-sat"], false, "the retracted note is not ticked again");
  assert.equal(again.notes["w2-sat"], true);
});

test("retracted: gone from the hosted version and the next file; the earlier file is in the log", () => {
  assert.match(JSON.stringify(FX.export_coach), /Genou sensible/);
  const after = FX.report_retracted.published;
  assert.equal(ses(after, "w1-sat").note, undefined);
  assert.equal(ses(after, "w1-sat").measure.val, 10, "the measure stays: only the note was retracted");
  assert.doesNotMatch(JSON.stringify(FX.report_retracted), /Genou/);
  assert.doesNotMatch(JSON.stringify(FX.export_coach_retracted), /Genou/);
  assert.doesNotMatch(JSON.stringify(FX.export_ines), /Genou/);
  assert.equal(CY.retractedLine(after.retracted[0]).startsWith("une note · retiré le "), true);
  const log = FX.report_ines_retracted.exports.map(CY.exportLine);
  assert.equal(log.length, 3);
  assert.match(log[2], /^Ton coach · .* · version 1 · 7 mesure\(s\), 2 note\(s\), 1 check-in\(s\)$/);
  assert.match(log[0], /^Toi · /);
  assert.equal(FX.report_retracted.exports, undefined, "the log belongs to the athlete");
});

test("the file holds the authorised fields only, and says it cannot be taken back", () => {
  const f = CY.exportFile(FX.export_coach_retracted);
  assert.equal(f.filename, "bilan-course-et-renforcement-6-semaines-v1.txt");
  assert.match(f.text, /^Bilan de cycle — Course et renforcement — 6 semaines\n/);
  assert.match(f.text, /Sportif : Inès · Coach : Coach Lou/);
  assert.match(f.text, /- Réalisées : 8 — du lundi .* Source : les séances du journal que le sportif a liées\./);
  assert.match(f.text, /- Volume : 70 km \(7 séances\)/);
  assert.match(f.text, /Note du sportif : Sortie décalée, bien passée/);
  assert.match(f.text, /Semaine chargée au travail/);
  assert.match(f.text, /Les sorties longues passent mieux le dimanche \(séances sources : /);
  assert.match(f.text, /Objectif : Un renforcement par semaine, le jeudi ou le vendredi — Non retenue/);
  assert.match(f.text, /1 élément retiré par le sportif depuis la validation : ce fichier ne les contient pas\./);
  assert.match(f.text, /Il ne se met pas à jour/);
  assert.doesNotMatch(f.text, /Genou|Bonnes jambes|19500000-/);
  assert.match(CY.exportFile(FX.export_ines).text, /un fichier ne peut pas être repris/);
  assert.match(CY.SHARE_NOTICE, /Un fichier déjà téléchargé ne peut pas être repris/);
});

test("withdrawn, scope revised, paused, revoked: the coach reads no shared content", () => {
  for (const k of ["report_withdrawn", "report_revalidate"]) {
    const r = FX[k];
    assert.equal(r.published, undefined, k);
    assert.doesNotMatch(JSON.stringify(r), /Sortie décalée|Semaine chargée|Bon cycle/, k);
  }
  assert.equal(FX.report_withdrawn.hosted, "withdrawn");
  assert.match(CY.head(FX.report_withdrawn, "coach").hostedText, /retiré l’accès/);
  assert.equal(FX.withdrawn_error, "REPORT_WITHDRAWN");
  assert.doesNotMatch(JSON.stringify(FX.link_withdrawn), /Sortie décalée/);
  assert.equal(FX.report_revalidate.hosted, "revalidate");
  assert.equal(FX.revalidate_error, "REPORT_REVALIDATION");
  assert.match(CY.head(FX.report_ines_revalidate, "athlete").hostedText, /valide à nouveau/);
  assert.equal(FX.report_ines_revalidate.proposal.contract.sport, "running");
  assert.equal(FX.paused_error, "COACH_CAPACITY_PAUSED");
  assert.equal(FX.report_ines_paused.link_state, "paused");
  assert.equal(FX.report_ines_paused.can_act, false);
  for (const k of ["revoked_error", "revoked_export_error", "revoked_link_error"]) assert.equal(FX[k], "SHARING_UNAVAILABLE", k);
  assert.equal(FX.report_ines_revoked.link_state, "revoked");
  assert.equal(FX.report_ines_revoked.published.version, 2, "Inès keeps her version, read-only");
  assert.equal(FX.report_ines_revoked.proposal, undefined);
  assert.equal(CY.head(FX.report_ines_revoked, "athlete").link, "Partage arrêté : lecture seule.");
  assert.match(CY.message("EXPORT_NOT_ALLOWED"), /n’a pas autorisé/);
});

test("the next cycle takes only the approved objectives and says where they come from", () => {
  const n = FX.next.plan;
  assert.equal(n.state, "draft");
  assert.deepEqual(n.goals, ["Courir 12 km en aisance"]);
  assert.equal(n.sessions.filter((s) => s.key === "r-d3").length, 1);
  assert.equal(FX.next_again.already, true);
  assert.equal(FX.next_again.plan.id, n.id);
  const o = CY.origin(n);
  assert.match(o.text, /^Repris du bilan du cycle « Course et renforcement — 6 semaines » \(version 1, validée le .*\) : 2 décisions approuvées\.$/);
  assert.deepEqual(o.items.map((x) => [x.kindLabel, x.text, x.kept]), [["Objectif", "Courir 12 km en aisance", true], ["Séance à proposer", "Test 10 km", true]]);
  assert.doesNotMatch(JSON.stringify(n.goals), /renforcement par semaine/, "the declined decision is not taken");
  const sent = FX.program_athlete_next.plans.find((p) => p.id === n.id);
  assert.equal(sent.origin.plan_title, "Course et renforcement — 6 semaines", "Inès sees the origin of her new cycle");
  assert.match(CY.head(FX.report_next, "coach").next, /^Cycle suivant · « Course et renforcement — 6 semaines » \(brouillon\)$/);
});

test("validation and proposal replays answer « already »", () => {
  assert.equal(FX.propose_again.already, true);
  assert.equal(FX.validate_again.already, true);
  assert.equal(FX.validate_again.version, 1);
  assert.equal(FX.validate_v2.version, 2);
  assert.match(CY.versionLine(FX.report_v2.versions[0]), /^Version 1 · validée le .* · 1 élément retiré depuis · fichier autorisé$/);
  assert.equal(CY.head(FX.report_ines_proposed, "athlete").stateLabel, "À valider");
});
