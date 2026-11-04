import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const { describe } = createRequire(import.meta.url)("../js/core/periodic-quests.js");

const week = (kind, target, progress, extra = {}) => ({ scope: "week", kind, target, progress, complete: false, claimed: false, ...extra });

test("each kind says what the server asks, kindly and without pressure", () => {
  const starter = describe(week("starter", { sessions: 1, minSessionMinutes: 15 }, { sessions: 0 }));
  assert.match(starter.text, /15 minutes/);
  const back = describe(week("return", { sessions: 1, minSessionMinutes: 20 }, { sessions: 0 }));
  assert.match(back.text, /Aucune pression/);
  const rhythm = describe(week("constancy", { days: 3 }, { days: 1 }));
  assert.match(rhythm.text, /3 jours actifs/);
  assert.equal(rhythm.percent, 33);
  const up = describe(week("progress", { minutes: 100 }, { minutes: 40 }));
  assert.match(up.text, /Une semaine plus calme n’enlève rien/);
  const multi = describe({ scope: "month", kind: "multisport", target: { sports: 3 }, progress: { sports: 2 }, complete: false, claimed: false });
  assert.match(multi.text, /pratiques déjà/);
  assert.match(multi.text, /Pas besoin d’en découvrir un nouveau/);
  assert.equal(multi.scopeLabel, "Quête du mois");
  const reg = describe({ scope: "month", kind: "regularity", target: { days: 8 }, progress: { days: 8 }, complete: true, claimed: false });
  assert.equal(reg.state, "ready");
});

test("progress never exceeds the target and states follow the server", () => {
  assert.equal(describe(week("constancy", { days: 3 }, { days: 5 })).value, 3);
  assert.equal(describe(week("constancy", { days: 3 }, { days: 3 }, { complete: true })).state, "ready");
  assert.equal(describe(week("constancy", { days: 3 }, { days: 3 }, { complete: true, claimed: true })).state, "claimed");
});

test("anything the server did not define in this contract is ignored", () => {
  for (const bad of [null, undefined, {}, { kind: "unknown", target: {} }, { kind: "constancy" }, { kind: "constancy", target: "3" }]) assert.equal(describe(bad), null);
});

test("no wording threatens, counts down or promises a reward other than a keepsake", () => {
  const src = readFileSync(new URL("../js/core/periodic-quests.js", import.meta.url), "utf8");
  assert.ok(!/(perdu|échou|expire|compte à rebours|dernière chance|plus que \d+ ?h|punition|XP en plus|crédits en plus)/i.test(src));
});
