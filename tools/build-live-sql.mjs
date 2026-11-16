#!/usr/bin/env node
// Generates the seed section of the TITAN LIVE migration from js/core/live-*.js (sport → Voie, missions, finds), so the
// server verifies exactly what the client engine proposes.
//   node tools/build-live-sql.mjs            print the seed SQL
//   node tools/build-live-sql.mjs --check    fail if the migration's seed section differs from the engine
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRATION = join(ROOT, "supabase/migrations/20261116090000_live_rpg_v1.sql");
const require = createRequire(import.meta.url);
require(join(ROOT, "js/core/sports-catalog.js"));
const Voies = require(join(ROOT, "js/core/live-voies.js"));
const World = require(join(ROOT, "js/core/live-world.js"));

const q = (v) => (v === null || v === undefined ? "null" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

export function missionRule(m) {
  const c = m.check;
  if (c.metric === "declared") return { verify: "declared", field: null, op: null, threshold: null, requires: null, per_field: null, per_max: null };
  if (c.metric === "report") {
    const op = c.per ? "per" : c.lte != null ? "lte" : "gte";
    return { verify: "report", field: c.field, op, threshold: c.per ? null : op === "lte" ? c.lte : c.gte, requires: c.requires || null, per_field: c.per?.field || null, per_max: c.per?.max ?? null };
  }
  if (m.verify === "log" && ["activeMin", "distanceM", "elevationM"].includes(c.metric))
    return { verify: "log", field: c.metric, op: "gte", threshold: typeof c.gte === "number" ? c.gte : null, requires: null, per_field: null, per_max: null };
  return { verify: "engine", field: c.metric, op: null, threshold: null, requires: null, per_field: null, per_max: null };
}

export function seed() {
  const all = Voies.all();
  const missions = new Map();
  for (const c of all) for (const m of c.missions) if (!missions.has(m.id)) missions.set(m.id, { id: m.id, voie: c.voie, ...missionRule(m) });
  const lines = [];
  lines.push("-- BEGIN GENERATED SEED (node tools/build-live-sql.mjs) — do not edit by hand.");
  lines.push("insert into private.titan_live_voies(voie,essence,family) values");
  lines.push(Object.values(Voies.VOIES).map((v) => `(${q(v.id)},${q(v.essence)},${q(Voies.ESSENCES[v.essence].family)})`).join(",\n") + "\non conflict(voie) do update set essence=excluded.essence,family=excluded.family;");
  lines.push("insert into private.titan_live_sports(sport,voie) values");
  lines.push(all.sort((a, b) => a.sport.localeCompare(b.sport)).map((c) => `(${q(c.sport)},${q(c.voie)})`).join(",\n") + "\non conflict(sport) do update set voie=excluded.voie;");
  lines.push("insert into private.titan_live_missions(id,voie,verify,field,op,threshold,requires,per_field,per_max) values");
  lines.push([...missions.values()].sort((a, b) => a.id.localeCompare(b.id)).map((m) => `(${[m.id, m.voie, m.verify, m.field, m.op, m.threshold, m.requires, m.per_field, m.per_max].map(q).join(",")})`).join(",\n")
    + "\non conflict(id) do update set voie=excluded.voie,verify=excluded.verify,field=excluded.field,op=excluded.op,threshold=excluded.threshold,requires=excluded.requires,per_field=excluded.per_field,per_max=excluded.per_max;");
  lines.push("insert into private.titan_live_finds(voie,idx,name,rare) values");
  lines.push(Object.entries(World.FINDS).flatMap(([v, list]) => list.map((f, i) => `(${q(v)},${i},${q(f[0])},${i >= list.length - 2})`)).join(",\n") + "\non conflict(voie,idx) do update set name=excluded.name,rare=excluded.rare;");
  lines.push("-- END GENERATED SEED");
  return lines.join("\n");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.argv.includes("--check")) {
    const text = readFileSync(MIGRATION, "utf8");
    const a = text.indexOf("-- BEGIN GENERATED SEED"), b = text.indexOf("-- END GENERATED SEED");
    const current = a >= 0 && b > a ? text.slice(a, b + "-- END GENERATED SEED".length) : "";
    if (current !== seed()) { console.error("TITAN LIVE seed differs from the engine. A shipped migration is immutable: add a new migration with the new seed."); process.exit(1); }
    console.log("TITAN LIVE seed matches the engine.");
  } else process.stdout.write(seed() + "\n");
}
