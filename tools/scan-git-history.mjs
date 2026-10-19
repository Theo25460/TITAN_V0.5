#!/usr/bin/env node
// Usage: node tools/scan-git-history.mjs   — exits 1 when a server secret appears anywhere in the history
// outside tests/ and docs/. Never prints a secret value.
import { scanHistory } from './lib/history-scan.mjs';

const cwd = process.argv[2] || process.cwd();
let result;
try {
  result = scanHistory(cwd);
} catch (error) {
  console.error(`Cannot scan the git history: ${String(error.message || error).split('\n')[0]}`);
  process.exit(2);
}
const real = result.findings.filter((f) => !f.illustrative);
const quoted = result.findings.filter((f) => f.illustrative);
for (const f of real) console.log(`LEAK  ${f.file}:${f.line} (${f.kind}) first seen in commit ${f.commit}, blob ${f.blob}`);
for (const f of quoted) console.log(`quote ${f.file}:${f.line} (${f.kind}) in docs/tests, commit ${f.commit}`);
for (const s of result.skipped) console.log(`skipped ${s.path} (${s.reason})`);
if (real.length) {
  console.error(`History scan FAILED: ${real.length} server secret(s) found in ${result.scannedBlobs} file versions. Rotate them: docs/SECRETS_ROTATION_PLAN.md.`);
  process.exit(1);
}
console.log(`History scan OK: no server secret in ${result.scannedBlobs} file versions${quoted.length ? ` (${quoted.length} quoted in docs/tests, checked as illustrative)` : ''}${result.skipped.length ? `; ${result.skipped.length} oversized file(s) not scanned` : ''}.`);
