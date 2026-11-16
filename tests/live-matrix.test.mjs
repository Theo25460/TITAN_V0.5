// TITAN LIVE — generated documents and server seeds never drift from the engine.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const node = (args) => execFileSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });

test("the 260-sport matrix is regenerated from the engine", () => {
  assert.match(node(["tools/build-live-matrix.mjs", "--check"]), /up to date \(260 sports\)/);
});

test("the migration seeds exactly the engine's sports, Voies, missions and finds", () => {
  assert.match(node(["tools/build-live-sql.mjs", "--check"]), /matches the engine/);
});

test("the live migration grants no XP or credits and never writes profiles or training logs", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261117090000_live_rpg_v1.sql", import.meta.url), "utf8").toLowerCase();
  assert.ok(!/update\s+public\.(profiles|training_logs)/.test(sql));
  assert.ok(!/insert\s+into\s+public\.(profiles|training_logs)/.test(sql));
  assert.ok(!/titan_apply_progression_reward|credits\s*=\s*credits|xp\s*=\s*xp/.test(sql));
  assert.ok(sql.includes("security definer set search_path=''"));
  assert.ok(!sql.includes("insert into private.titan_feature_flags"), "flags are created by an administrator, never seeded");
});
