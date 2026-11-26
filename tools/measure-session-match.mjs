// V1.6.2 — measure session matching on the annotated fixtures (tests/fixtures/session-match-annotated.json).
// Usage: node tools/measure-session-match.mjs [fixtures.json]   → prints the per-case table and the summary as JSON.
// Compares the V15 rule alone (TitanSportContracts.findDuplicate: link or not) with V1.6.2 (same / ambiguous / distinct), counts
// false matches, missed matches and the confirmations asked to the athlete, and the totals of the journal before and after decisions.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
require("../js/training-store.js");
require("../js/core/format.js");
require("../js/core/sports-catalog.js");
require("../js/core/sports.js");
const C = require("../js/core/sport-contracts.js");
const M = require("../js/core/session-match.js");

const asLog = (e) => (e.started_at ? null : e);

export function measure(cases) {
  const rows = [];
  for (const c of cases) {
    const f = M.facts(c.entry);
    const v15 = !!C.findDuplicate({ sport: f.sport, date: new Date(f.start).toISOString(), minutes: f.minutes }, c.journal);
    const m = M.classify(c.entry, c.journal);
    const verdict = m ? m.verdict : "distinct";
    rows.push({ id: c.id, title: c.title, truth: c.truth, expect: c.expect, v15: v15 ? "lié" : "séparé", verdict, reasons: m?.reasons || [], ok: verdict === c.expect, entry: c.entry, journal: c.journal });
  }
  const n = (pred) => rows.filter(pred).length;
  const summary = {
    cases: rows.length,
    truthSame: n((r) => r.truth === "same"),
    truthDistinct: n((r) => r.truth === "distinct"),
    v15: {
      falseMatches: n((r) => r.truth === "distinct" && r.v15 === "lié"),
      missed: n((r) => r.truth === "same" && r.v15 === "séparé"),
    },
    v162: {
      falseMatchesSilent: n((r) => r.truth === "distinct" && r.verdict === "same"),
      falseMatchesFlagged: n((r) => r.truth === "distinct" && r.verdict === "ambiguous"),
      missed: n((r) => r.truth === "same" && r.verdict === "distinct"),
      confirmationsAsked: n((r) => r.verdict === "ambiguous"),
      manualCorrections: n((r) => r.verdict === "ambiguous" || (r.truth === "distinct" && r.verdict === "same")),
      verdictAsExpected: n((r) => r.ok),
    },
  };
  // Totals of one journal holding every case: truth, no matching at all, V15, V1.6.2 before decisions, V1.6.2 after the athlete's decisions.
  const sum = (pick) => {
    const logs = [];
    for (const r of rows) {
      logs.push(...r.journal);
      if (pick(r)) logs.push(asLog(r.entry) || { sport: r.entry.sport, unit: r.entry.distance_km ? "km" : "min", val: r.entry.distance_km || r.entry.duration_minutes, date: r.entry.started_at, details: { duration: r.entry.duration_minutes } });
    }
    return M.totals(logs);
  };
  summary.totals = {
    truth: sum((r) => r.truth === "distinct"),
    noMatching: sum(() => true),
    v15: sum((r) => r.v15 === "séparé"),
    v162BeforeDecisions: sum((r) => r.verdict === "distinct"),
    v162AfterDecisions: sum((r) => (r.verdict === "same" || r.verdict === "ambiguous" ? r.truth === "distinct" : true)),
  };
  return { rows, summary };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] || new URL("../tests/fixtures/session-match-annotated.json", import.meta.url);
  const { rows, summary } = measure(JSON.parse(readFileSync(file, "utf8")).cases);
  for (const r of rows) console.log(`${r.id}  vérité=${r.truth.padEnd(8)} V15=${r.v15.padEnd(6)} V1.6.2=${r.verdict.padEnd(9)} ${r.ok ? "ok " : "ÉCART"} ${r.reasons.join(",")}  ${r.title}`);
  console.log(JSON.stringify(summary, null, 2));
}
