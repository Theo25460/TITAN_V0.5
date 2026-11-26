// V2.0 (A2) — the canonical sequence of the future migrations: unique versions that no lot branch ever used, in the order the SQL
// object matrix requires, bodies identical to the lots' files except the listed edits, nothing applied in production renamed or
// edited, and the map old SHA/name → new file/version kept in step with the tree.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { test } from "node:test";
import { ALL, BUNDLES, OLD_VERSIONS, PRODUCTION_HEAD, MAIN_SHA, computeMap, fileOf } from "../tools/db/v2-canonical.mjs";
import { BUNDLES as PROD } from "../tools/db/build-production-bundle.mjs";

const root = new URL("../", import.meta.url);
const migrations = readdirSync(new URL("supabase/migrations/", root)).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
const git = (...a) => execFileSync("git", a, { cwd: root.pathname, encoding: "utf8", maxBuffer: 1 << 28 });

test("canonical versions are unique, above production, never an old lot version, and increase in package order", () => {
  const versions = ALL.map((m) => m.version);
  assert.equal(new Set(versions).size, versions.length, "a canonical version is used twice");
  assert.deepEqual([...versions].sort(), versions, "versions must increase in the order of the packages");
  for (const m of ALL) {
    assert.ok(m.version > PRODUCTION_HEAD, `${m.file} is not above the production head`);
    assert.ok(!OLD_VERSIONS.includes(m.version), `${m.file} reuses a version a lot branch used`);
    assert.notEqual(m.version.slice(10, 12), "00", `${m.file}: canonical versions have non-zero minutes`);
  }
  for (const v of OLD_VERSIONS) assert.equal(v.slice(10), "0000", `old version ${v} was expected to end in 0000`);
  assert.equal(new Set(BUNDLES.map((b) => b.name)).size, BUNDLES.length);
});

test("no two migration files share a version, and no old lot file name is left", () => {
  const seen = new Map();
  for (const f of migrations) {
    const v = f.slice(0, 14);
    assert.ok(!seen.has(v), `${f} and ${seen.get(v)} share version ${v}`);
    seen.set(v, f);
  }
  for (const m of ALL.filter((x) => x.old)) assert.ok(!migrations.includes(m.old), `${m.old} must be renamed ${m.file}`);
  const unknown = migrations.filter((f) => f.slice(0, 14) > PRODUCTION_HEAD && !ALL.some((m) => m.file === f));
  assert.deepEqual(unknown, [], "a future migration is not in the canonical plan (tools/db/v2-canonical.mjs)");
});

test("every migration already in production's registry is unchanged since main", () => {
  const atMain = git("ls-tree", "-r", MAIN_SHA, "supabase/migrations/").trim().split("\n").map((l) => { const [meta, path] = l.split("\t"); return [path, meta.split(" ")[2]]; });
  const now = new Map(git("ls-tree", "-r", "HEAD", "supabase/migrations/").trim().split("\n").map((l) => { const [meta, path] = l.split("\t"); return [path, meta.split(" ")[2]]; }));
  for (const [path, blob] of atMain) {
    if (path.slice(20, 34) > PRODUCTION_HEAD) continue;
    assert.equal(now.get(path), blob, `${path} is applied in production: it must never change`);
    assert.equal(execFileSync("git", ["hash-object", path], { cwd: root.pathname, encoding: "utf8" }).trim(), blob, `${path} changed in the working tree`);
  }
});

test("the map is up to date and every present body is the lot's file, byte for byte, unless an edit is declared", () => {
  const computed = computeMap();
  assert.deepEqual(JSON.parse(readFileSync(new URL("tools/db/v2-migration-map.json", root), "utf8")), computed, "run node tools/db/v2-canonical.mjs map");
  for (const e of computed.migrations.filter((x) => x.new.present && !x.written_by_a2)) {
    assert.ok(e.old.blob, `${e.old.file}: the lot SHA ${e.old.source_sha} is not available (git fetch)`);
    if (e.edit) assert.equal(e.identical, false, `${e.new.file} declares an edit but is identical`);
    else assert.equal(e.identical, true, `${e.new.file} differs from ${e.old.file} at ${e.old.source_sha} without a declared edit`);
  }
});

test("each canonical package is generated, chained on the production head and documented with every lot README it replaces", () => {
  const v2 = Object.entries(PROD).filter(([n]) => n.startsWith("v2-"));
  const present = BUNDLES.filter((b) => b.migrations.every((m) => migrations.includes(fileOf(m))));
  assert.deepEqual(v2.map(([n]) => n), present.map((b) => b.name));
  assert.equal(v2[0]?.[1].after, PRODUCTION_HEAD);
  assert.deepEqual(v2[0]?.[1].before, PROD.v20.expected, "the first package must expect the state v20 leaves (measured on the replica)");
  for (const b of present) {
    const readme = readFileSync(new URL(`supabase/release-${b.name}/README.md`, root), "utf8");
    for (const m of b.migrations.filter((x) => x.old)) {
      assert.ok(readme.includes(`### ${m.lot} — \`supabase/${m.oldPackage.split(" ")[0]}/README.md\``), `${b.name}: README of ${m.lot} not carried over`);
      assert.ok(readme.includes(m.old) && readme.includes(fileOf(m)));
    }
  }
  // the lot packages are gone from the tree (retrieve them with git show <lot sha>:supabase/<package>/)
  for (const d of readdirSync(new URL("supabase/", root))) assert.ok(!/^release-(v2[1-9]|v19\d|partage)$/.test(d), `obsolete lot package ${d} still in the tree`);
});
