// « Depuis ta dernière visite » (social lot D): what is said, what is never said.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
globalThis.TitanCordee = require("../js/core/cordee.js");
const D = require("../js/core/social-digest.js");
const NOW = Date.parse("2026-11-20T12:00:00Z");

test("nothing happened: nothing is said (no reproach, no counter)", () => {
  assert.deepEqual(D.lines({ friendMoments: { count: 0, latest: [] }, cheersReceived: 0, requestsIn: 0, friendsActive: [], cordees: [], duo: null, challengesEnded: [], memories: [], suggestion: null }, NOW), []);
  assert.deepEqual(D.lines(null), []);
  const onlySuggestion = { suggestion: { kind: "cordee", pace: "douce", activeDays28: 0, friends: 0 } };
  assert.equal(D.hasNews(onlySuggestion, NOW), false, "a suggestion alone is not news");
  assert.match(D.lines(onlySuggestion, NOW)[0].text, /seul·e, ou avec un ami invité par lien : allure douce/);
});

test("a full digest: celebration first, then what we do together, the circle, a memory, one suggestion", () => {
  const l = D.lines({
    cordees: [{ id: "k1", route: "aube", status: "summited", myStatus: "joined", summitedSince: true, earned: true, percent: 100, camps: 4 },
      { id: "k2", route: "forge", status: "active", myStatus: "joined", percent: 64, camps: 2, mine: 6 }],
    duo: { status: "active", partner: "Léa", together: 8, target: 12 },
    challengesEnded: [{ id: "c1", title: "Semaine d’effort", reached: true }],
    friendMoments: { count: 3, latest: [{ author: "Léa", title: "Premier 10 km" }, { author: "Sam", title: "Bloc 6a" }] },
    cheersReceived: 2, requestsIn: 1, friendsActive: ["Léa", "Sam", "Zoé", "Max"],
    memories: [{ id: "k0", route: "aurores", summitedAt: "2026-10-01T12:00:00Z", members: 4 }],
    suggestion: null,
  }, NOW);
  const text = l.map((x) => x.text);
  assert.equal(l[0].kind, "celebrate");
  assert.match(text[0], /Sommet atteint : Les crêtes de l’Aube\. Le titre « Brin de l’Aube » t’attend/);
  assert.match(text[1], /Les cols d’Obsidienne : 2 camps atteints sur 4, 64 % de l’objectif commun — ta part : 6 longueurs/);
  assert.match(text[2], /TITAN Duo avec Léa : 8 \/ 12 jours actifs à deux/);
  assert.match(text[3], /Défi « Semaine d’effort » : objectif atteint/);
  assert.match(text[4], /Léa et Sam ont partagé 3 Moments, dont « Premier 10 km »/);
  assert.match(text[5], /2 encouragements reçus/);
  assert.match(text[6], /1 demande d’ami à regarder quand tu veux/);
  assert.match(text[7], /Léa, Sam, Zoé et 1 autre ami ont bougé/);
  assert.match(text[8], /Souvenir : il y a 50 jours, vous atteigniez La voûte des Aurores à 4/);
  assert.ok(D.hasNews({ cheersReceived: 1 }, NOW));
  assert.match(D.lines({ friendMoments: { count: 2, latest: [{ author: "Léa", title: "A" }, { author: "Léa", title: "B" }] } }, NOW)[0].text, /^Léa a partagé 2 Moments/);
  assert.match(D.lines({ friendMoments: { count: 2, latest: [] } }, NOW)[0].text, /^Tes amis ont partagé 2 Moments/);
});

test("a finished Duo that was not reached is told kindly; the wording never pressures", () => {
  const l = D.lines({ duo: { status: "finished", partner: null, together: 7, target: 12, reached: false }, suggestion: { kind: "cordee", pace: "reguliere", activeDays28: 9, friends: 2 } }, NOW);
  assert.match(l[0].text, /Ce qui est fait reste fait/);
  assert.match(l[1].text, /allure régulière irait bien avec 9 jours actifs/);
  const all = JSON.stringify(l);
  for (const bad of [/derni[eè]re chance/i, /tu vas perdre/i, /rat[ée]/i, /pas fait/i, /dépêche/i, /série/i, /retard/i]) assert.doesNotMatch(all, bad);
});
