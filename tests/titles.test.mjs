import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ["js/renaissance-catalog.js", "js/core/titles.js"]) vm.runInContext(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), ctx);
const T = ctx.window.TitanTitles, catalog = ctx.window.TitanCodex;

test("an earned insignia is wearable under the name of its chapter, newest first, with its region", () => {
  const list = T.earned({ catalog, rewards: [{ world: "aube", chapter: 1, earned_at: "2026-10-01" }, { world: "marees", chapter: 3, earned_at: "2026-10-05" }] });
  assert.deepEqual([...list.map((t) => t.key)], ["chapter:marees:3", "chapter:aube:1"]);
  assert.equal(list[0].label, catalog.worlds[1].chapters[2].title);
  assert.match(list[0].detail, /chapitre 3/);
  assert.equal(list[0].source, "chapter");
});

test("expedition titles are wearable with the server wording and unknown rewards are ignored", () => {
  const list = T.earned({ catalog, rewards: [{ world: "inconnu", chapter: 1 }, { world: "aube", chapter: 12 }], expeditionTitles: [{ id: "automne-2026", title: "Passe-brume", expedition: "La traversée des brumes" }, { title: "sans id" }] });
  assert.deepEqual([...list.map((t) => t.key)], ["exp:automne-2026"]);
  assert.equal(list[0].label, "Passe-brume");
});

test("a worn key is named by the catalogue or by the server and never invented", () => {
  assert.equal(T.label("chapter:aube:1", { catalog }), catalog.worlds[0].chapters[0].title);
  assert.equal(T.label("exp:automne-2026", { serverLabel: "Passe-brume" }), "Passe-brume");
  assert.equal(T.label("exp:automne-2026", {}), null);
  for (const bad of [null, undefined, "", "Champion", "chapter:aube:10", "chapter:ailleurs:1", 42]) assert.equal(T.label(bad, { catalog }), null, String(bad));
});
