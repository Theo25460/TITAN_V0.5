#!/usr/bin/env node
// V1.5.4 — graph control of the chains of quests between worlds (js/core/adventure-quests.js, audit()).
// Every clue names a fact an existing arc (V1.5.0 to V1.5.3) can really produce on the route it names; no chain depends on
// itself through other chains (cycle); every chain is reachable from the arcs and offers an alternative route; every step has a
// way out up to the scene of each manner; a later version never removes a clue; no main campaign depends on a chain; no time
// window, compulsory discipline or reward. Exit code 1 on any problem.   Usage: node tools/check-quest-graph.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.TitanAdventureRpg = require("../js/core/adventure-rpg.js");
globalThis.TitanAdventureBranches = require("../js/core/adventure-branches.js");
globalThis.TitanAdventureGuardian = require("../js/core/adventure-guardian.js");
globalThis.TitanAdventureCampaigns = require("../js/core/adventure-campaigns.js");
globalThis.TitanAdventureConsequence = require("../js/core/adventure-consequence.js");
const Q = require("../js/core/adventure-quests.js");
const { problems, chains, clues, edges } = Q.audit();
for (const id of chains) {
  const c = Q.current(id);
  console.log(`${id.padEnd(15)} v${c.version} · ${c.from} → ${c.to} · ${c.clues.map((x) => `${x.id} ⇐ ${x.origin.world}/${x.origin.route}/${x.origin.outcome} (${x.origin.fact})`).join(" | ")} · ${c.manners.map((m) => `${m.id} → ${m.outcome}`).join(" | ")}`);
}
console.log(`${chains.length} chains, ${clues.length} clues, ${edges.length} chain dependencies, ${problems.length} problem(s)`);
for (const p of problems) console.error(`  ✗ ${p}`);
process.exit(problems.length ? 1 : 0);
