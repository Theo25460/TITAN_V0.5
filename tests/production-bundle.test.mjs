// The production bundle must be exactly what the generator builds from the repository migrations: a bundle edited by hand, or
// left stale after a migration changed, would reintroduce the retyping drift (D1) the bundle exists to prevent.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { build, pendingMigrations, wrap } from "../tools/db/build-production-bundle.mjs";

const DIR = new URL("../supabase/release-v131/", import.meta.url);

test("bundle files match the generator output byte for byte", () => {
  const { files } = build();
  const onDisk = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  assert.deepEqual(onDisk, Object.keys(files).sort());
  for (const [name, text] of Object.entries(files)) assert.equal(readFileSync(new URL(name, DIR), "utf8"), text, name);
});

test("every migration body is embedded unchanged, guarded and registered under its own version", () => {
  const list = pendingMigrations();
  assert.ok(list.length >= 10);
  list.forEach((m, i) => {
    const text = wrap(m, i === 0 ? "20261110130137" : list[i - 1].version);
    assert.ok(text.includes(m.sql.replace(/\s*$/, "")), `${m.file} embedded verbatim`);
    assert.match(text, /^-- .*\nbegin;\n/);
    assert.match(text, /\ncommit;\n$/);
    assert.ok(text.includes(`values ('${m.version}', '${m.name}')`));
    assert.ok(text.includes(`version = '${m.version}') then`), "refuses a second run");
  });
});

test("a migration that opens its own transaction is refused", () => {
  assert.throws(() => wrap({ file: "x.sql", version: "20990101000000", name: "x", sql: "begin;\nselect 1;\ncommit;\n" }, "20261110130137"));
});
