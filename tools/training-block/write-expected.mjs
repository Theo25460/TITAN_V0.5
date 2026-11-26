// V1.7.4 — writes tests/fixtures/training-block-v174.expected.json from the website modules; the website and Android tests compare to it.
// Usage: node tools/training-block/write-expected.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
for (const m of ["format.js", "../training-store.js", "sports-catalog.js", "sports.js"]) require(`../../js/core/${m}`);
globalThis.TitanSports.ensure();
const W = require("../../js/core/week-plan.js");
const B = require("../../js/core/training-block.js");
const { replay, project } = require("./replay.cjs");
const fixture = JSON.parse(readFileSync(new URL("../../tests/fixtures/training-block-v174.json", import.meta.url), "utf8"));
const label = (s) => globalThis.TitanSports.label(s);
const dayLong = (k) => k;
const out = { version: B.VERSION, cases: {} };
for (const c of fixture.cases) out.cases[c.name] = project(W, B, replay(W, B, fixture, c), label, dayLong);
writeFileSync(new URL("../../tests/fixtures/training-block-v174.expected.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`${fixture.cases.length} cases written`);
