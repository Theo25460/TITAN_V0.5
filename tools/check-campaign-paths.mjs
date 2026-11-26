#!/usr/bin/env node
// V1.5.3 — automatic dead-path control of the four first arcs (js/core/adventure-campaigns.js, audit()).
// Every canonical choice leads to a route, every route to a mechanic solvable from what the route showed and to one resolution,
// every declared resolution is reachable, conditions only know effort points and active days (no time window, no discipline),
// every visible string exists. Exit code 1 on any problem.   Usage: node tools/check-campaign-paths.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.TitanAdventureRpg = require("../js/core/adventure-rpg.js");
globalThis.TitanAdventureBranches = require("../js/core/adventure-branches.js");
globalThis.TitanAdventureGuardian = require("../js/core/adventure-guardian.js");
const C = require("../js/core/adventure-campaigns.js");
const { problems, resolutions, primitives } = C.auditAll();
for (const world of C.WORLDS) {
  const d = C.describe(world);
  console.log(`${world.padEnd(8)} ${d.id} v${d.version} · ${primitives[world].padEnd(8)} · ${d.routes.map((r) => `${r.id} → ${r.outcome}`).join(" · ")}`);
}
console.log(`${resolutions.length} resolutions reachable, ${problems.length} problem(s)`);
for (const p of problems) console.error(`  ✗ ${p}`);
process.exit(problems.length ? 1 : 0);
