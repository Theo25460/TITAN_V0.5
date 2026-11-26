// V1.7.5 — writes tests/fixtures/discipline-analysis-v175.expected.json: the view and its plain-text reading the website module
// produces for each case of the shared test set. The website test and the Android test compare their own output with this file.
// Usage: node tools/discipline-analysis/write-expected.mjs   (re-run only when VERSION changes, and review the diff)
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
for (const m of ["format.js", "../training-store.js", "effort.js", "sports-catalog.js", "sports.js", "../sport-insights.js", "progress.js", "progression.js"]) require(`../../js/core/${m}`);
const A = require("../../js/core/discipline-analysis.js");
globalThis.TitanSports.ensure();
if (new Date(2026, 0, 1).getTimezoneOffset() !== 0) throw new Error("run with TZ=UTC: the dates of the views are local dates");
const fixture = JSON.parse(readFileSync(new URL("../../tests/fixtures/discipline-analysis-v175.json", import.meta.url), "utf8"));
if (fixture.version !== A.VERSION) throw new Error(`fixture ${fixture.version} ≠ module ${A.VERSION}`);
const out = { version: A.VERSION, cases: fixture.cases.map((c) => {
  const v = A.view(fixture.history, { ...c.options, now: new Date(fixture.now), weeks: fixture.weeks });
  return { name: c.name, view: v, reading: A.reading(v) };
}) };
writeFileSync(new URL("../../tests/fixtures/discipline-analysis-v175.expected.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`${out.cases.length} cases written`);
