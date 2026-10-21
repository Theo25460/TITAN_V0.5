#!/usr/bin/env node
// Usage: node tools/scan-git-history.mjs   — exits 1 when a server secret appears anywhere in the history
// outside tests/ and docs/. Never prints a secret value.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanHistory } from './lib/history-scan.mjs';

const cwd = process.argv[2] || process.cwd();
let result;
try {
  result = scanHistory(cwd);
} catch (error) {
  console.error(`Cannot scan the git history: ${String(error.message || error).split('\n')[0]}`);
  process.exit(2);
}
// Reviewed non-secrets that sit in the history for good (tools/history-scan-known.json): matched by the exact content
// hash, so any other content of the same file is still judged. Each entry carries the reason and who reviewed it.
const knownFile = join(cwd, 'tools', 'history-scan-known.json');
const known = existsSync(knownFile) ? JSON.parse(readFileSync(knownFile, 'utf8')).known || [] : [];
const isKnown = (f) => known.some((k) => k.blob && k.reason && String(f.blob).startsWith(k.blob) && (!k.kind || k.kind === f.kind));
const flagged = result.findings.filter((f) => !f.illustrative);
const real = flagged.filter((f) => !isKnown(f));
const acknowledged = flagged.filter(isKnown);
const quoted = result.findings.filter((f) => f.illustrative);
for (const f of acknowledged) console.log(`known ${f.paths.join(', ')}:${f.line} (${f.kind}) reviewed non-secret, content ${f.blob}`);
for (const f of real) console.log(`LEAK  ${f.paths.join(', ')}:${f.line} (${f.kind}) first seen in commit ${f.commit}, content ${f.blob}`);
for (const f of quoted) console.log(`quote ${f.paths.join(', ')}:${f.line} (${f.kind}) in docs/tests`);
if (real.length) {
  console.error(`History scan FAILED: ${real.length} server secret(s) found in ${result.scannedBlobs} file versions. Rotate them: docs/SECRETS_ROTATION_PLAN.md.`);
  process.exit(1);
}
console.log(`History scan OK: no server secret in ${result.scannedBlobs} file versions${quoted.length ? ` (${quoted.length} quoted in docs/tests, checked as illustrative)` : ''}.`);
