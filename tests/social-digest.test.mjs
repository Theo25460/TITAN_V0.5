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

// V1.8.3 — a group that sets off again: the digest says when the group waits for my answer, and how my own proposal is received.
test("a proposal to set off again: the answer that waits, a choice between two, my proposal's acceptances, never a reminder to a refusal", () => {
  const one = D.lines({ suites: [{ id: "k1", route: "aube", waiting: 1, proposals: [
    { id: "p1", route: "marees", pace: "douce", days: 14, status: "open", by: "Léa", mine: false, myAnswer: null, yes: 1, eligible: 4, turn: ["accept", "decline"] }] }] }, NOW);
  assert.equal(one.length, 1);
  assert.equal(one[0].text, "Léa propose à ta cordée de « Les crêtes de l’Aube » de repartir sur « La passe des Marées » · allure douce · 14 jours. Accepte ou décline quand tu veux.");
  assert.equal(one[0].href, "#cordee");
  assert.equal(one[0].kind, "together");
  assert.ok(D.hasNews({ suites: [{ id: "k1", route: "aube", proposals: [{ id: "p1", route: "marees", pace: "douce", days: 14, status: "open", by: "Membre de la cordée", turn: ["accept", "decline"] }] }] }, NOW));
  assert.match(D.lines({ suites: [{ id: "k1", route: "aube", proposals: [{ id: "p1", route: "marees", pace: "douce", days: 14, status: "open", by: "Membre de la cordée", turn: ["accept"] }] }] }, NOW)[0].text, /^Un membre propose/);
  const two = D.lines({ suites: [{ id: "k1", route: "aube", choice: true, proposals: [
    { id: "p1", route: "marees", pace: "douce", days: 14, status: "open", by: "Léa", turn: ["accept", "decline"] },
    { id: "p2", route: "forge", pace: "soutenue", days: 7, status: "open", by: "Sam", turn: ["accept", "decline"] }] }] }, NOW);
  assert.deepEqual(two.map((l) => l.text), ["Ta cordée de « Les crêtes de l’Aube » propose 2 itinéraires pour repartir : choisis celui qui te va, ou aucun."]);
  const declined = D.lines({ suites: [{ id: "k1", route: "aube", proposals: [{ id: "p1", route: "marees", pace: "douce", days: 14, status: "open", by: "Léa", myAnswer: "no", turn: ["accept"] }] }] }, NOW);
  assert.deepEqual(declined, [], "someone who declined is never reminded");
  const mine = D.lines({ suites: [{ id: "k1", route: "aube", proposals: [{ id: "p2", route: "forge", pace: "douce", days: 14, status: "open", mine: true, yes: 2, eligible: 5, turn: ["withdraw"] }] }] }, NOW);
  assert.deepEqual(mine.map((l) => l.text), ["Ta proposition pour repartir sur « Les cols d’Obsidienne » : 2 sur 5 ont accepté."]);
  const started = D.lines({ cordees: [{ id: "n1", route: "marees", status: "active", myStatus: "invited", follows: "aube", percent: 0, camps: 0 }] }, NOW);
  assert.deepEqual(started.map((l) => l.text), ["Ton groupe de « Les crêtes de l’Aube » est reparti sur « La passe des Marées », compteurs à zéro. Tu peux t’encorder ou décliner."]);
  const all = JSON.stringify([one, two, mine, started]);
  for (const bad of [/derni[eè]re chance/i, /tu vas perdre/i, /dépêche/i, /plus que \d/i, /a décliné/i]) assert.doesNotMatch(all, bad);
});
