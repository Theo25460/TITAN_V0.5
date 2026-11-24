// V1.8.5 — Rencontres entre clubs: the shared module mirrors the server's score rule, words only what the server gives, and the
// simulations of the score (tools/simulate-club-match.mjs) hold the exit proofs of the brief.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { sizes, heavy, withdrawal, invalidated, small, goals, margins, markdown, all } from "../tools/simulate-club-match.mjs";

const require = createRequire(import.meta.url);
const M = require("../js/core/club-match.js");
const sql = readFileSync(new URL("../supabase/migrations/20261128090000_club_match.sql", import.meta.url), "utf8");

test("the rule of the module is the rule of the migration", () => {
  assert.match(sql, /having least\(90, sum\(x\.effort_minutes\)\) >= 12/);
  assert.equal(M.RULE.activeMinutes, 12);
  assert.equal(M.RULE.dailyCap, 90);
  // Each participant counts up to their own share (cap 1 ×), the rate is rounded down, from 3 participants still in.
  assert.match(sql, /coalesce\(sum\(least\(m\.days, m\.share\)\), 0\)/);
  assert.equal(M.RULE.shareCap, 1);
  assert.match(sql, /'scored', t\.participants >= 3 and t\.target > 0/);
  assert.match(sql, /floor\(100\.0 \* t\.total \/ t\.target\)/);
  assert.equal(M.RULE.threshold, 3);
  // Cooperation: mean of the two rates rounded down, reached at 60. Comparison: tie under 5 points, two weeks only.
  assert.match(sql, /v_common := floor\(\(\(h->>'rate'\)::integer \+ \(g->>'rate'\)::integer\) \/ 2\.0\)::integer;/);
  assert.match(sql, /v_common >= 60 end/);
  assert.equal(M.RULE.goal, 60);
  assert.match(sql, /abs\(\(h->>'rate'\)::integer - \(g->>'rate'\)::integer\) < 5/);
  assert.equal(M.RULE.tieMargin, 5);
  assert.match(sql, /check \(format <> 'versus' or weeks = 2\)/);
  assert.equal(M.RULE.versusWeeks, 2);
  assert.match(sql, /p_weeks not between 1 and 2/);
  assert.deepEqual(M.RULE.weeks, [1, 2]);
  assert.match(sql, /p_starts_on < v_today \+ 1 or p_starts_on > v_today \+ 28/);
  assert.equal(M.RULE.startFromDays, 1);
  assert.equal(M.RULE.startWithinDays, 28);
  assert.match(sql, /\(p_starts_on \+ 2\)::timestamp at time zone 'Europe\/Paris'/);
  assert.equal(M.RULE.joinDays, 2);
  assert.match(sql, /interval '60 days'/);
  assert.equal(M.RULE.reportDays, 60);
  for (const code of sql.matchAll(/raise exception '([A-Z_]+)'/g)) {
    if (code[1] === "AUTH_REQUIRED") continue;
    assert.ok(M.MESSAGES[code[1]], `a clear message for ${code[1]}`);
  }
  // The share: pace × weeks for a full participant, prorated and rounded up otherwise.
  assert.equal(M.share(3, 1), 3);
  assert.equal(M.share(2, 2), 4);
  assert.equal(M.share(3, 3 / 7), 2);
  assert.equal(M.share(3, 6 / 7), 3);
  assert.equal(M.counted(5, 3), 3);
  assert.ok(M.isActiveDay(12) && !M.isActiveDay(11.5) && M.isActiveDay(400));
});

test("the score model: rates by club, common score, comparison", () => {
  const s3 = 3;
  // The SQL scenario (sql/tests/300_club_match.sql): 9 cyclists against 3 multisport members.
  const rouleurs = M.side([{ days: 5, share: s3 }, ...Array.from({ length: 7 }, () => ({ days: 2, share: s3 })), { days: 0, share: s3 }]);
  const multi = M.side([{ days: 5, share: s3 }, { days: 2, share: s3 }, { days: 1, share: s3 }]);
  assert.deepEqual(rouleurs, { participants: 9, total: 17, target: 27, scored: true, rate: 62 });
  assert.deepEqual(multi, { participants: 3, total: 6, target: 9, scored: true, rate: 66 });
  assert.deepEqual(M.common(62, 66), { value: 64, reached: true });
  assert.deepEqual(M.common(62, 55), { value: 58, reached: false });
  assert.equal(M.common(null, 66), null);
  assert.equal(M.outcome(37, 16), "a");
  assert.equal(M.outcome(16, 37), "b");
  assert.equal(M.outcome(40, 36), "tie");
  assert.equal(M.outcome(0, 0), "tie");
  assert.equal(M.outcome(40, 35), "a");
  // Two participants: no rate. A participant who left does not count as present.
  assert.equal(M.side([{ days: 3, share: 3 }, { days: 3, share: 3 }]).rate, null);
  assert.equal(M.side([{ days: 3, share: 3 }, { days: 3, share: 3 }, { days: 1, share: 2, in: false }]).scored, false);
});

test("simulations: different sizes, comparable completion → close results; raw totals would favour the big club", () => {
  for (const x of sizes(3000)) {
    assert.ok(Math.abs(x.meanA - x.meanB) < 2, `${x.a} against ${x.b}: mean rates ${x.meanA} / ${x.meanB}`);
    assert.ok(Math.abs(x.aWins - x.bWins) < 0.06, `${x.a} against ${x.b}: neither size leads more often`);
    if (x.b >= 3 * x.a) assert.ok(x.rawBig > 0.95, `a raw total would give ${x.b} the lead over ${x.a}`);
  }
});

test("simulations: a very active member never carries the club; withdrawals, invalidated sessions and small teams follow the rule", () => {
  for (const x of heavy()) {
    assert.ok(x.heavyAlone <= Math.ceil(100 / x.n), `alone, at most 1/${x.n} of the rate`);
    assert.ok(x.rate <= x.cap15 && x.cap15 <= x.uncapped, "the published cap is the strictest");
  }
  assert.equal(heavy()[0].rate, 33);
  for (const x of withdrawal()) {
    assert.ok(x.rule >= x.kept && x.rule <= x.removed, "a withdrawal keeps the share of the time spent");
    if (x.k >= 6) assert.equal(x.rule, x.stayed, "making the inactive leave at the end raises nothing");
  }
  const inv = invalidated();
  for (const x of inv) assert.ok(x.drop >= 0 && x.drop <= Math.ceil(100 / (x.n * 3)), `${x.n}: one day less moves the rate by at most 100 ÷ (n × share)`);
  assert.equal(inv[0].drop, 11);
  const sm = small();
  assert.equal(sm.two.rate, null);
  assert.equal(sm.commonWithTwo, null);
  assert.equal(sm.threeLeft.rate, null);
  assert.equal(sm.three.rate, 66);
});

test("simulations: the common goal separates clubs that held their pace; a one-week comparison is decided by chance too often", () => {
  const g = goals(1500);
  const at = (goal) => g.find((x) => x.goal === goal).reach;
  // [μ 0.5, 0.6, 0.7, 0.8, 0.9]: the chosen goal is reached by most clubs at 0.7 and above, rarely by clubs at half their pace.
  assert.ok(at(60)[2] > 0.5 && at(60)[0] < 0.15, `60 %: ${at(60)}`);
  assert.ok(at(70)[2] < 0.3, `70 % would fail most clubs at μ 0.7: ${at(70)}`);
  assert.ok(at(50)[0] > 0.3, `50 % would be reached by a third of the clubs at half their pace: ${at(50)}`);
  const mg = margins(1500);
  const row = (small, weeks, margin) => mg.find((x) => x.small === small && x.weeks === weeks && x.margin === margin);
  assert.ok(row(4, 1, 5).wrongWinner > 0.1, "a club of 4 over one week: the worse club leads more than once in ten");
  assert.ok(row(8, 2, 5).wrongWinner < row(4, 1, 5).wrongWinner, "two weeks and a bigger club decide better");
  assert.ok(row(4, 1, 5).tieEqual > row(4, 1, 0).tieEqual, "the margin declares ties between equivalent clubs");
});

test("the simulation report is reproducible and is the one in docs/V185_SIMULATIONS.md", () => {
  const doc = readFileSync(new URL("../docs/V185_SIMULATIONS.md", import.meta.url), "utf8");
  assert.equal(markdown(all(20000)) + "\n", doc, "regenerate with node tools/simulate-club-match.mjs --write");
});

const running = {
  id: "m1", format: "cooperation", pace: "reguliere", perWeek: 3, weeks: 1, phase: "running", side: "host",
  startsAt: "2026-11-18T23:00:00Z", endsAt: "2026-11-25T23:00:00Z", joinUntil: "2026-11-20T23:00:00Z", asOf: "2026-11-23T23:00:00Z",
  threshold: 3, goal: 60, tieMargin: 5,
  us: { name: "Les Rouleurs", participants: 9, scored: true, rate: 62, total: 17, target: 27 },
  them: { name: "Multisport du parc", participants: 3, scored: true, rate: 66 },
  common: 64, reached: true, lead: null, me: { status: "active", club: "c1", days: 2, share: 3 }, can: ["leave", "stop"],
};

test("a running cooperation: both clubs, the common score as of midnight, one's own part", () => {
  assert.equal(M.header(running), "En cours jusqu’au 25 novembre inclus · avec « Multisport du parc »");
  assert.equal(M.header({ ...running, phase: "upcoming" }), "Départ le 19 novembre · avec « Multisport du parc » · participations jusqu’au 20 novembre inclus");
  assert.deepEqual(M.sides(running), [
    "Les Rouleurs (ton club) : 9 participants · 62 % de l’objectif d’équipe (17 jours actifs sur 27 visés)",
    "Multisport du parc : 3 participants · 66 % de l’objectif d’équipe",
  ]);
  assert.equal(M.score(running), "Score commun : 64 % sur 60 % visés — seuil atteint ensemble (arrêté à minuit : personne ne voit quand un membre s’entraîne).");
  assert.equal(M.mine(running), "Tu participes · 2 jours actifs comptés sur ta part de 3. Au-delà de ta part, rien de plus ne compte : personne ne porte son club seul. Cette part n’est montrée qu’à toi.");
  assert.deepEqual(M.actions(running).map((a) => a.id), ["leave", "stop"]);
  assert.match(M.rules(running), /jusqu’à sa propre part, jamais au-delà/);
  assert.match(M.confirmText("stop", running).message, /sans résultat/);
});

test("under the threshold and in the comparison: nothing derivable", () => {
  const under = { ...running, them: { name: "Multisport du parc", participants: 2, scored: false, rate: null }, common: null, reached: null };
  assert.equal(M.sides(under)[1], "Multisport du parc : 2 participants · taux affiché à partir de 3 participants");
  assert.equal(M.score(under), "Score commun affiché quand chaque club compte 3 participants.");
  const versus = { ...running, format: "versus", weeks: 2, common: null, reached: null, lead: "tie" };
  assert.match(M.score(versus), /^À égalité \(moins de 5 points d’écart\)/);
  assert.match(M.score({ ...versus, lead: "them" }), /^« Multisport du parc » mène/);
  assert.equal(M.score({ ...versus, lead: null }), "Pas encore de comparaison : chaque club doit compter 3 participants.");
});

test("the organiser's paths: proposal, preview, recaps without personal contributions", () => {
  const proposed = { ...running, phase: "proposed", code: "ABCD2345", them: null, me: null, can: ["stop"] };
  assert.equal(M.sides(proposed).length, 0);
  assert.match(M.proposal(proposed), /ABCD2345/);
  const pv = M.preview({ host: "Les Rouleurs", format: "cooperation", pace: "reguliere", weeks: 1, startsAt: running.startsAt, endsAt: running.endsAt, joinUntil: running.joinUntil });
  assert.equal(pv.lines[0], "Du 19 novembre au 25 novembre inclus ; chacun choisit de participer jusqu’au 20 novembre.");
  assert.equal(pv.title, "« Les Rouleurs » propose une rencontre");
  assert.match(pv.lines[2], /Jamais un nom, une séance ou une présence/);
  const closed = { phase: "closed", format: "cooperation", startsAt: running.startsAt, endsAt: running.endsAt, us: running.us, them: running.them, common: 64, reached: true, me: { days: 2, share: 3, left: false }, can: ["feedback"] };
  const r = M.report(closed);
  assert.equal(r.title, "Rencontre terminée avec « Multisport du parc »");
  assert.ok(r.lines.includes("Score commun : 64 % — seuil de 60 % atteint ensemble."));
  assert.ok(r.lines.some((l) => l.startsWith("Ta part : 2 jours actifs comptés sur 3")));
  assert.match(r.lines.at(-1), /Aucun classement de personnes/);
  assert.match(M.report({ ...closed, phase: "short" }).lines.join(" "), /moins de 3 participants à la fin : pas de résultat/);
  assert.equal(M.report({ ...closed, format: "versus", lead: "tie", common: null }).lines[3], "Égalité : moins de 5 points d’écart.");
  assert.match(M.report({ phase: "abandoned", stoppedBy: "them", stoppedAt: running.endsAt, them: { name: "Multisport du parc" } }).lines[0], /par les administrateurs de « Multisport du parc » : pas de résultat/);
  assert.match(M.report({ phase: "refused", them: { name: "Multisport du parc" } }).lines[0], /a refusé la proposition/);
  assert.match(M.report({ phase: "cancelled", stoppedBy: "us", them: { name: "X" } }).lines[0], /de ton club/);
});

test("the form check, the code and the server's refusals", () => {
  assert.equal(M.validate({ format: "cooperation", pace: "reguliere", weeks: 1, startsOn: "2026-11-25" }, "2026-11-24"), null);
  assert.equal(M.validate({ format: "cooperation", pace: "reguliere", weeks: 1, startsOn: "2026-11-24" }, "2026-11-24"), "MATCH_INVALID");
  assert.equal(M.validate({ format: "cooperation", pace: "reguliere", weeks: 3, startsOn: "2026-11-25" }, "2026-11-24"), "MATCH_INVALID");
  assert.equal(M.validate({ format: "versus", pace: "reguliere", weeks: 1, startsOn: "2026-11-25" }, "2026-11-24"), "MATCH_INVALID");
  assert.equal(M.validate({ format: "versus", pace: "douce", weeks: 2, startsOn: "2026-12-22" }, "2026-11-24"), null);
  assert.equal(M.validate({ format: "cooperation", pace: "reguliere", weeks: 1, startsOn: "2026-12-23" }, "2026-11-24"), "MATCH_INVALID");
  assert.equal(M.code(" abcd-2345 "), "ABCD2345");
  assert.equal(M.message(new Error("MATCH_SAME_ORGANISER")), M.MESSAGES.MATCH_SAME_ORGANISER);
  assert.equal(M.message({ message: "VERSUS_CLOSED" }), "Seul le format coopération est ouvert pendant le pilote.");
  assert.equal(M.message("nothing"), null);
});
