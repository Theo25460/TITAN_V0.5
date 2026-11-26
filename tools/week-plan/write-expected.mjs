// V1.7.2 — writes tests/fixtures/week-plan-v172.expected.json from the website module; the website and Android tests compare to it.
// Usage: node tools/week-plan/write-expected.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { replay } from "./replay.mjs";
const require = createRequire(import.meta.url);
for (const m of ["format.js", "../training-store.js", "sports-catalog.js", "sports.js"]) require(`../../js/core/${m}`);
globalThis.TitanSports.ensure();
const W = require("../../js/core/week-plan.js");
const fixtureUrl = new URL("../../tests/fixtures/week-plan-v172.json", import.meta.url);
const fixture = JSON.parse(readFileSync(fixtureUrl, "utf8"));
const label = (s) => globalThis.TitanSports.label(s);
const out = { version: W.VERSION, cases: {} };
for (const c of fixture.cases) {
  const { view } = replay(W, fixture, c);
  out.cases[c.name] = { view: W.snapshot(view), words: view.occurrences.map((o) => W.describe(o, { label })), bilan: W.summarize(view) };
}
writeFileSync(new URL("../../tests/fixtures/week-plan-v172.expected.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`${fixture.cases.length} cases written`);
