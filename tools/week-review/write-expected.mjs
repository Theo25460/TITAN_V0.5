// V1.7.3 — writes tests/fixtures/week-review-v173.expected.json from the website modules; the website and Android tests compare to it.
// Usage: node tools/week-review/write-expected.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { replay, project } from "./replay.mjs";
const require = createRequire(import.meta.url);
for (const m of ["format.js", "../training-store.js", "sports-catalog.js", "sports.js"]) require(`../../js/core/${m}`);
globalThis.TitanSports.ensure();
const W = require("../../js/core/week-plan.js");
const R = require("../../js/core/week-review.js");
const fixture = JSON.parse(readFileSync(new URL("../../tests/fixtures/week-review-v173.json", import.meta.url), "utf8"));
const label = (s) => globalThis.TitanSports.label(s);
const dayLong = (k) => k;
const out = { version: R.VERSION, cases: {} };
for (const c of fixture.cases) out.cases[c.name] = project(W, R, replay(W, R, fixture, c), label, dayLong);
writeFileSync(new URL("../../tests/fixtures/week-review-v173.expected.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`${fixture.cases.length} cases written`);
