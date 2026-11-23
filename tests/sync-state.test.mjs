// V1.6.1 — the shared sync wording (js/core/sync-state.js), used unchanged by the website journal and the Android app.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
require("../js/core/format.js");
const S = require("../js/core/sync-state.js");

const item = (o = {}) => ({ key: "a:e1", ownerId: "a", status: "pending", queuedAt: "2026-11-22T07:00:00Z", attempts: 0, payload: { details: { client_event_id: "e1234567-aaaa" } }, ...o });
const NOW = Date.parse("2026-11-22T12:00:00Z");

test("four states, from what the device really holds", () => {
  assert.equal(S.stateOf({ item: item() }), "stored");
  assert.equal(S.stateOf({ item: item({ attempts: 1, lastAttemptAt: "2026-11-22T08:00:00Z" }) }), "pending");
  assert.equal(S.stateOf({ item: item({ status: "error", attempts: 1 }) }), "refused");
  assert.equal(S.stateOf({ log: { syncStatus: "confirmed" }, item: item() }), "confirmed", "the server receipt wins over a queue item not yet removed");
  assert.equal(S.stateOf({ log: { syncStatus: "local" } }), "local");
  assert.equal(S.stateOf({ item: item({ attempts: 1 }), sending: true }), "sending");
  assert.equal(S.stateOf({ item: item({ status: "error", deferred: true }) }), "pending", "a too-old session waits, it is not refused");
  const labels = ["stored", "pending", "confirmed", "refused"].map((s) => S.STATES[s].label);
  assert.deepEqual(labels, ["Sur cet appareil", "En attente d’envoi", "Confirmée dans ton compte", "Refusée : à corriger"]);
});

test("each state carries the facts and the existing recovery action that fits its reason", () => {
  const waiting = S.describe({ item: item({ attempts: 3, lastAttemptAt: "2026-11-22T11:00:00Z", reason: "Connexion indisponible" }), now: NOW });
  assert.deepEqual(waiting.facts.map((f) => f.label), ["Enregistrée sur cet appareil", "Dernière tentative", "Motif", "Référence"]);
  assert.match(waiting.facts[1].value, /\(3 essais\)$/);
  assert.equal(waiting.facts[3].value, "e1234567");
  assert.deepEqual(waiting.actions.map((a) => a.id), ["send"]);
  const refused = (code) => S.describe({ item: item({ status: "error", attempts: 1, code, reason: "x" }), now: NOW });
  assert.deepEqual(refused("TRAINING_VALUE_OUT_OF_RANGE").actions.map((a) => a.label), ["Corriger et renvoyer", "Retirer de cet appareil"]);
  assert.deepEqual(refused("EVENT_CONTENT_CONFLICT").actions.map((a) => a.id), ["discard"]);
  assert.deepEqual(refused("42501").actions.map((a) => a.id), ["send", "discard"]);
  assert.deepEqual(S.describe({ item: item({ status: "error", deferred: true, reason: "trop ancienne" }) }).actions.map((a) => a.id), ["export"]);
  const confirmed = S.describe({ log: { syncStatus: "confirmed", client_event_id: "e1234567-aaaa", xp: 90, details: { serverReward: { xp: 90 } } } });
  assert.deepEqual(confirmed.facts, [{ label: "Reçu du serveur", value: "+90 XP" }, { label: "Référence", value: "e1234567" }]);
  assert.deepEqual(confirmed.actions, []);
});

test("only a refused session can be replaced by its correction", () => {
  assert.equal(S.replaceable(item({ status: "error" })), true);
  assert.equal(S.replaceable(item()), false);
  assert.equal(S.replaceable(item({ status: "error", deferred: true })), false);
});

test("the Android app ships this exact module", () => {
  assert.equal(readFileSync(new URL("../mobile/src/core/web/sync-state.js", import.meta.url), "utf8"), readFileSync(new URL("../js/core/sync-state.js", import.meta.url), "utf8"));
});
