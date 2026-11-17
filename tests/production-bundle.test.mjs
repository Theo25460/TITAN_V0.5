// A production bundle must be exactly what the generator builds from the repository migrations: a bundle edited by hand, or
// left stale after a migration changed, would reintroduce the retyping drift (D1) the bundles exist to prevent.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { BUNDLES, build, pendingMigrations, wrap } from "../tools/db/build-production-bundle.mjs";

for (const name of Object.keys(BUNDLES)) {
  const dir = new URL(`../${BUNDLES[name].out}/`, import.meta.url);

  test(`${name}: bundle files match the generator output byte for byte`, () => {
    const { files } = build(name);
    const onDisk = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    assert.deepEqual(onDisk, Object.keys(files).sort());
    for (const [file, text] of Object.entries(files)) assert.equal(readFileSync(new URL(file, dir), "utf8"), text, file);
  });

  test(`${name}: every migration body is embedded unchanged, guarded and registered under its own version`, () => {
    const list = pendingMigrations(name);
    assert.ok(list.length >= 8);
    list.forEach((m, i) => {
      const text = wrap(m, i === 0 ? BUNDLES[name].after : list[i - 1].version);
      assert.ok(text.includes(m.sql.replace(/\s*$/, "")), `${m.file} embedded verbatim`);
      assert.match(text, /^-- .*\nbegin;\n/);
      assert.match(text, /\ncommit;\n$/);
      assert.ok(text.includes(`values ('${m.version}', '${m.name}')`));
      assert.ok(text.includes(`version = '${m.version}') then`), "refuses a second run");
    });
  });
}

test("bundles chain without a gap and cover every migration after the first bundle's start", () => {
  const names = Object.keys(BUNDLES);
  for (let i = 1; i < names.length; i++) assert.equal(BUNDLES[names[i]].after, BUNDLES[names[i - 1]].until, `${names[i]} starts where ${names[i - 1]} ends`);
  for (let i = 1; i < names.length; i++) assert.deepEqual(BUNDLES[names[i]].before, BUNDLES[names[i - 1]].expected, `${names[i]} expects the state ${names[i - 1]} leaves`);
  const bundled = new Set(names.flatMap((n) => pendingMigrations(n).map((m) => m.version)));
  const all = readdirSync(new URL("../supabase/migrations/", import.meta.url)).map((f) => f.slice(0, 14)).filter((v) => /^\d{14}$/.test(v) && v > BUNDLES[names[0]].after);
  assert.deepEqual(all.filter((v) => !bundled.has(v)), [], "a migration belongs to no production bundle: add it to the last bundle (--until) or open a new one");
});

test("a migration that opens its own transaction is refused", () => {
  assert.throws(() => wrap({ file: "x.sql", version: "20990101000000", name: "x", sql: "begin;\nselect 1;\ncommit;\n" }, "20261110130137"));
});
