// V1.8.4 — Saisons privées de club: the shared module mirrors the server rule and words only what the server gives.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const S = require("../js/core/club-season.js");
const sql = readFileSync(new URL("../supabase/migrations/20261127090000_club_season.sql", import.meta.url), "utf8");

test("the rule of the module is the rule of the migration", () => {
  assert.match(sql, /when 'douce' then 2 when 'soutenue' then 4 else 3/);
  assert.deepEqual(Object.values(S.PACES).map((p) => [p.id, p.perWeek]), [["douce", 2], ["reguliere", 3], ["soutenue", 4]]);
  assert.match(sql, /having least\(90, sum\(x\.effort_minutes\)\) >= 12/);
  assert.equal(S.RULE.activeMinutes, 12);
  assert.equal(S.RULE.dailyCap, 90);
  assert.match(sql, /ceil\(round\(1\.5 \* private\.titan_club_season_per_week/);
  assert.equal(S.RULE.capShare, 1.5);
  assert.match(sql, /v_visible := v_in >= 3;/);
  assert.equal(S.RULE.threshold, 3);
  assert.match(sql, /v_need := least\(2, v_ever\);/);
  assert.equal(S.RULE.contributors, 2);
  assert.match(sql, /p_weeks not between 2 and 8/);
  assert.match(sql, /p_starts_on > v_today \+ 28/);
  assert.match(sql, /p_days not in \(7, 14\)/);
  assert.match(sql, /s\.postponed >= 2/);
  for (const code of sql.matchAll(/raise exception '([A-Z_]+)'/g)) {
    if (code[1] === "AUTH_REQUIRED") continue;
    assert.ok(S.MESSAGES[code[1]], `a clear message for ${code[1]}`);
  }
  assert.equal(S.share("reguliere", 4), 12);
  assert.equal(S.cap("reguliere", 4), 18);
  assert.deepEqual(S.thresholds(44), [15, 30, 44]);
  assert.ok(S.isActiveDay(12) && !S.isActiveDay(11.5) && S.isActiveDay(400));
});

const running = {
  id: "s1", title: "Quatre semaines ensemble", pace: "reguliere", weeks: 4, phase: "running", week: 3, startsAt: "2026-11-02T00:00:00+01:00",
  endsAt: "2026-11-30T00:00:00+01:00", postponed: 0, participants: 4, threshold: 3, visible: true, paused: 1, contributors: 4, total: 32, target: 44, next: 3,
  stages: [{ n: 1, threshold: 15, reachedAt: "2026-11-12T10:00:00Z" }, { n: 2, threshold: 30, reachedAt: "2026-11-20T10:00:00Z" }, { n: 3, threshold: 44, reachedAt: null }],
  me: { status: "active", days: 5, cap: 18, share: 12, capped: false }, can: ["pause", "leave"],
};

test("a running season above the threshold: goal, stages, the stage in progress while a member pauses", () => {
  assert.equal(S.header(running), "Semaine 3 sur 4 · fin le 30 novembre · 4 semaines · allure régulière (3 jours actifs par semaine chacun)");
  assert.equal(S.group(running), "4 participants dont 1 en pause · 4 ont déjà contribué");
  assert.deepEqual(S.progress(running), { total: 32, target: 44, pct: 73, line: "32 jours actifs ensemble sur 44 jours visés" });
  const st = S.stages(running);
  assert.deepEqual(st.map((x) => x.status), ["reached", "reached", "current"]);
  assert.equal(st[0].text, "Étape 1 · Le départ tenu — atteinte le 12 novembre");
  assert.equal(st[2].text, "Étape 3 · La saison bouclée — en cours : 44 jours actifs ensemble (l’objectif entier)");
  assert.match(S.ongoing(running), /^Objectif en cours : étape 3, « La saison bouclée »\. Les membres en pause gardent ce qu’ils ont apporté/);
  assert.equal(S.mine(running), "Tu participes · 5 jours actifs comptés sur ta part de 12 · plafond 18.");
  assert.deepEqual(S.actions(running).map((a) => a.id), ["pause", "leave"]);
});

test("below the threshold nothing of the group is worded, only the number of participants and one's own part", () => {
  const small = { ...running, participants: 2, visible: false, paused: null, contributors: null, total: null, target: null, next: null, stages: [{ n: 1 }, { n: 2 }, { n: 3 }] };
  assert.equal(S.group(small), "2 participants. La progression du groupe s’affiche à partir de 3 participants : personne ne peut en déduire la part d’un autre.");
  assert.equal(S.progress(small), null);
  assert.equal(S.ongoing(small), "");
  assert.ok(S.stages(small).every((x) => x.status === "hidden" && !/jour|atteinte|en cours/.test(x.text)));
  assert.match(S.mine(small), /^Tu participes · 5 jours actifs comptés/);
});

test("consent, pause, departure, cap and the organiser's role are said plainly", () => {
  assert.match(S.mine({ ...running, me: null, can: ["join"] }), /Rejoindre la saison est un choix/);
  assert.equal(S.mine({ ...running, me: { ...running.me, status: "paused" } }), "Tu es en pause : rien ne compte pendant la pause et ta part restante est libérée. Tes 5 jours actifs comptés restent acquis pour le groupe.");
  assert.match(S.mine({ ...running, me: { ...running.me, status: "paused", days: 0 } }), /Rien n’avait encore été compté pour toi\.$/);
  assert.match(S.mine({ ...running, me: { ...running.me, status: "left" } }), /restent acquis pour le groupe\.$/);
  assert.match(S.mine({ ...running, me: { ...running.me, days: 18, capped: true } }), /plafond atteint : 18 au plus, pour que personne ne porte le groupe seul/);
  assert.match(S.role({ role: "organizer" }), /Tu organises les saisons de ce club \(administrateur\)/);
  assert.match(S.role({ role: "member" }), /organisées par les administrateurs du club\. Chacun choisit de participer/);
  assert.equal(S.confirmText("leave").confirm, "Quitter");
  assert.match(S.confirmText("stop", { phase: "upcoming" }).message, /annulée avant son départ/);
  assert.equal(S.confirmText("pause"), null);
  const up = { ...running, phase: "upcoming", postponed: 1, can: ["join", "postpone", "stop"] };
  assert.match(S.header(up), /^Départ le 2 novembre \(reporté une fois\)/);
  assert.deepEqual(S.actions(up).map((a) => a.id), ["join", "postpone", "stop"]);
});

test("the report is a record of milestones, never a ranking", () => {
  const last = { title: "Quatre semaines ensemble", phase: "closed", weeks: 4, endsAt: "2026-11-30T00:00:00+01:00", visible: true, reached: 2, total: 34, target: 47,
    participants: 4, stages: [{ n: 1, reachedAt: "2026-11-12T10:00:00Z" }, { n: 2, reachedAt: "2026-11-20T10:00:00Z" }, { n: 3, reachedAt: null }], me: { days: 18, left: false } };
  const r = S.report(last);
  assert.equal(r.title, "Bilan de « Quatre semaines ensemble »");
  assert.deepEqual(r.lines, [
    "Terminée le 30 novembre après 4 semaines.",
    "2 étapes atteintes sur 3 · 34 jours actifs ensemble sur 47 visés · 4 participants à la fin.",
    "Étape 1 · Le départ tenu — atteinte le 12 novembre.",
    "Étape 2 · Le cap du milieu — atteinte le 20 novembre.",
    "Ta part : 18 jours actifs comptés.",
    "Aucun classement : ce bilan ne montre que ce que le groupe a accompli.",
  ]);
  assert.match(S.report({ ...last, visible: false, total: null }).lines[1], /^Moins de 3 participants à la fin : le bilan du groupe reste privé\.$/);
  assert.deepEqual(S.report({ title: "Hiver", phase: "cancelled" }).lines, ["Saison annulée avant son départ par les administrateurs du club."]);
});

test("the creation form is checked like the server checks it, and errors get words", () => {
  const ok = { title: "Quatre semaines", pace: "reguliere", weeks: 4, startsOn: "2026-11-24" };
  assert.equal(S.validate(ok, "2026-11-24"), null);
  assert.equal(S.validate({ ...ok, title: "ab" }, "2026-11-24"), "SEASON_INVALID");
  assert.equal(S.validate({ ...ok, weeks: 9 }, "2026-11-24"), "SEASON_INVALID");
  assert.equal(S.validate({ ...ok, pace: "folle" }, "2026-11-24"), "SEASON_INVALID");
  assert.equal(S.validate({ ...ok, startsOn: "2026-11-23" }, "2026-11-24"), "SEASON_INVALID");
  assert.equal(S.validate({ ...ok, startsOn: "2026-12-23" }, "2026-11-24"), "SEASON_INVALID");
  assert.equal(S.message({ message: "SEASON_POSTPONE_LIMIT" }), "Le départ a déjà été reporté deux fois.");
  assert.equal(S.message({ message: "anything else" }), null);
});
