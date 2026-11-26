// V1.7.1 — writes tests/fixtures/comparables-v171.expected.json: the selection the website module produces for each case of the
// shared test set. The website test and the Android test both compare their own output with this file, field by field.
// Usage: node tools/comparables/write-expected.mjs   (re-run only when RULES_VERSION changes, and review the diff)
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
for (const m of ["format.js", "../training-store.js", "effort.js", "sports-catalog.js", "sports.js", "../sport-insights.js", "progress.js"]) require(`../../js/core/${m}`);
const P = require("../../js/core/progression.js");
globalThis.TitanSports.ensure();
const fixture = JSON.parse(readFileSync(new URL("../../tests/fixtures/comparables-v171.json", import.meta.url), "utf8"));
if (fixture.rulesVersion !== P.RULES_VERSION) throw new Error(`fixture ${fixture.rulesVersion} ≠ module ${P.RULES_VERSION}`);
const out = { rulesVersion: P.RULES_VERSION, cases: {} };
for (const c of fixture.cases) {
  const log = fixture.history.find((l) => l.id === c.subject);
  const cmp = P.compare(log, fixture.history);
  out.cases[c.subject] = {
    selection: P.snapshot(P.comparables(log, fixture.history)),
    comparison: cmp ? { previous: cmp.previous.id, basis: cmp.basis, items: cmp.items.map((i) => ({ id: i.id, now: P.formatValue(i), before: P.formatValue(i, "previous"), direction: i.direction })) } : null,
  };
}
writeFileSync(new URL("../../tests/fixtures/comparables-v171.expected.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`${Object.keys(out.cases).length} cases written`);
