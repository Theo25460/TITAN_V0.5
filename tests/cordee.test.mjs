// La Grande Cordée (social lot C): the shared module mirrors the server rule exactly, and the rule is fair between sports and levels.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("../js/core/cordee.js");
const SQL = readFileSync(new URL("../supabase/migrations/20261120110000_grande_cordee.sql", import.meta.url), "utf8");

test("the module mirrors the SQL rule: thresholds, cap, variety, shares, routes, paces and durations", () => {
  assert.match(SQL, /when minutes >= 35 then 2 when minutes >= 12 then 1 else 0/);
  assert.equal(C.RULE.oneLongueur, 12);
  assert.equal(C.RULE.twoLongueurs, 35);
  assert.match(SQL, /v_cap := ceil\(v_share \* 1\.5\)/);
  assert.equal(C.RULE.capShare, 1.5);
  assert.match(SQL, /least\(8, 2 \* greatest\(0, jsonb_array_length\(v_families\) - 1\)\)/);
  assert.equal(C.variety(["endurance", "force", "mobilite"]), 4);
  assert.equal(C.variety(["endurance", "force", "technique", "jeu", "mobilite"]), 8);
  assert.match(SQL, /when 'douce' then 3 when 'soutenue' then 8 else 5 end/);
  for (const [pace, days, expected] of [["douce", 7, 3], ["reguliere", 14, 10], ["soutenue", 28, 32], ["douce", 21, 9]]) assert.equal(C.share(pace, days), expected, `${pace} ${days}`);
  for (const route of Object.keys(C.ROUTES)) assert.ok(SQL.includes(`'${route}'`), route);
  assert.match(SQL, /p_days not in \(7, 14, 21, 28\)/);
  assert.deepEqual([...C.DAYS], [7, 14, 21, 28]);
  for (const r of Object.values(C.ROUTES)) {
    assert.equal(r.camps.length, C.RULE.camps);
    assert.ok(SQL.includes(r.title.replace("’", "’")), `the server labels the title ${r.title}`);
    assert.ok(SQL.includes(r.name), `the server names the route ${r.name}`);
  }
});

test("a day brings 0, 1 or 2 longueurs whatever the sport or its length", () => {
  assert.equal(C.longueursOfDay(0), 0);
  assert.equal(C.longueursOfDay(11.9), 0);
  assert.equal(C.longueursOfDay(12), 1);
  assert.equal(C.longueursOfDay(34), 1);
  assert.equal(C.longueursOfDay(35), 2);
  assert.equal(C.longueursOfDay(600), 2, "an ultra is worth a 35-minute session");
});

test("fairness: a beginner is never useless, a trained athlete cannot summit alone", () => {
  // 14 days, regular pace: a trail runner training every day for 2 hours, a beginner walking 20 min three times a week.
  const expert = { days: Array(14).fill(120), families: ["endurance"] };
  const beginner = { days: [20, 0, 0, 20, 0, 20, 0, 20, 0, 0, 20, 0, 20, 0], families: ["mobilite"] };
  const alone = C.simulate({ pace: "reguliere", days: 14, members: [expert] });
  assert.equal(alone.counted[0], 15, "28 longueurs earned, 15 counted (1.5 × share)");
  const pair = C.simulate({ pace: "reguliere", days: 14, members: [expert, beginner] });
  assert.equal(pair.target, 20);
  assert.equal(pair.counted[1], 6);
  assert.ok(pair.counted[1] / (pair.counted[0] + pair.counted[1]) > 0.25, "the beginner brings more than a quarter of the ropes");
  assert.equal(pair.total, 15 + 6 + 2, "two families add 2 longueurs");
  assert.ok(pair.summit, "together they summit");
  const twoExperts = C.simulate({ pace: "reguliere", days: 14, members: [expert, { ...expert, families: ["endurance"] }] });
  assert.ok(twoExperts.summit);
  const expertAndIdle = C.simulate({ pace: "reguliere", days: 14, members: [expert, { days: [], families: [] }] });
  assert.equal(expertAndIdle.summit, false, "the expert cannot carry an idle member to the summit alone");
});

test("fairness across sports: the same regularity gives the same longueurs in every family", () => {
  const week = [45, 0, 45, 0, 45, 0, 0];
  const families = ["endurance", "force", "technique", "jeu", "mobilite"];
  const counts = families.map((f) => C.simulate({ pace: "douce", days: 7, members: [{ days: week, families: [f] }] }).counted[0]);
  assert.deepEqual(new Set(counts).size, 1, counts.join(","));
});

test("explain says the common goal, my part, the group, what is open, and never pressures", () => {
  const e = C.explain({ route: "forge", status: "active", target: 30, share: 10, joined: 3, total: 18, variety: 2, camps: 2,
    families: ["force", "endurance"], me: { counted: 4, strand: false } });
  assert.match(e.goal, /30 longueurs ensemble, soit 10 par membre/);
  assert.match(e.mine, /4 longueurs sur 10/);
  assert.match(e.group, /18 \/ 30 \(dont 2 grâce à la variété/);
  assert.match(e.variety, /Acier, Souffle/);
  assert.match(e.unlocked, /La halle des souffleurs · Le pont des enclumes/);
  assert.equal(e.next.name, "La porte du Colosse");
  const done = C.explain({ route: "aube", status: "summited", target: 20, camps: 4, me: { counted: 12, strand: true } });
  assert.match(done.unlocked, /Titre « Brin de l’Aube »/);
  assert.equal(done.next, null);
  const text = JSON.stringify([C.ROUTES, C.PACES, e, done]);
  for (const bad of [/derni[eè]re chance/i, /tu vas perdre/i, /dépêche/i, /vite/i, /classement/i]) assert.doesNotMatch(text, bad);
});

test("the suggested pace never asks more than what the player already does", () => {
  assert.equal(C.suggestPace(0), "douce");
  assert.equal(C.suggestPace(7), "douce");
  assert.equal(C.suggestPace(8), "reguliere");
  assert.equal(C.suggestPace(20), "soutenue");
});

test("with friends in it, two members must bring longueurs: one strong member with two sports cannot summit alone", () => {
  const strong = { days: [60, 40, 0, 0, 0, 0, 0], families: ["endurance", "mobilite"] };
  const waiting = { days: [], families: [] };
  const pair = C.simulate({ pace: "douce", days: 7, members: [strong, waiting] });
  assert.equal(pair.total, 6, "4 longueurs + 2 of variety");
  assert.equal(pair.target, 6);
  assert.equal(pair.summit, false, "one contributor out of two");
  assert.equal(C.simulate({ pace: "douce", days: 7, members: [strong] }).summit, true, "a solo climb stays possible");
  const SQL2 = readFileSync(new URL("../supabase/migrations/20261120110000_grande_cordee.sql", import.meta.url), "utf8");
  assert.match(SQL2, /'needs', least\(2, v_joined \+ v_pending\)/);
  assert.equal(C.RULE.contributors, 2);
});
