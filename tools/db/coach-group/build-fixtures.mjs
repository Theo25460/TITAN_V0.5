#!/usr/bin/env node
// V1.9.6: runs tools/db/coach-group/fixtures.sql with the psql arguments given (a disposable titan_test_ database) and writes the
// server's answers to tests/fixtures/coach-group.json. Usage: node tools/db/coach-group/build-fixtures.mjs psql -h … -d titan_test_…
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [bin, ...args] = process.argv.slice(2);
if (!bin || !args.some((a) => /titan_test_/.test(a))) { console.error("Refused: the fixtures need a titan_test_ disposable database"); process.exit(1); }
const root = new URL("../../..", import.meta.url).pathname;
const out = execFileSync(bin, [...args, "-At", "-v", "ON_ERROR_STOP=1", "-f", root + "tools/db/coach-group/fixtures.sql"], { encoding: "utf8" });
const fx = { generated_on: new Date().toISOString().slice(0, 10), source: "tools/db/coach-group/fixtures.sql on PostgreSQL 16 (titan_coach_group_v1, rolled back)" };
for (const line of out.split("\n")) {
  if (!line.startsWith("{")) continue;
  const { key, value } = JSON.parse(line);
  fx[key] = value;
}
writeFileSync(root + "tests/fixtures/coach-group.json", JSON.stringify(fx, null, 1) + "\n");
console.log(Object.keys(fx).filter((k) => !["generated_on", "source"].includes(k)).join(", "));
