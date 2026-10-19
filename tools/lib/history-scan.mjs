// Looks for server secrets in EVERY version of EVERY file reachable from any ref, not only in the current tree.
// A secret removed from the tree is still a secret until it is rotated: this finds those. Read-only; findings carry
// the file, the first commit that introduced the blob and the kind, never the value.
import { execFileSync } from 'node:child_process';
import { findSecrets } from './release-safety.mjs';

const BINARY = /\.(?:png|jpe?g|webp|gif|ico|avif|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|ogg|pdf|zip|gz|br|wasm|mov|heic|aab|apk|keystore|jks)$/i;
const MAX_BLOB = 5 * 1024 * 1024;
// Files whose job is to quote fake secrets: reported separately, they do not fail the scan.
const ILLUSTRATIVE = /^(?:tests|docs)\//;

const git = (cwd, args, input) => execFileSync('git', args, { cwd, input, encoding: 'utf8', maxBuffer: 1024 * 1024 * 512, stdio: ['pipe', 'pipe', 'pipe'] });

export function scanHistory(cwd) {
  const listing = git(cwd, ['rev-list', '--objects', '--all']).split('\n').filter(Boolean);
  const blobs = new Map();
  for (const line of listing) {
    const space = line.indexOf(' ');
    if (space < 0) continue;
    const sha = line.slice(0, space);
    const path = line.slice(space + 1);
    if (!BINARY.test(path) && !blobs.has(`${sha}\0${path}`)) blobs.set(`${sha}\0${path}`, { sha, path });
  }
  const entries = [...blobs.values()];
  const types = git(cwd, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], entries.map((e) => e.sha).join('\n') + '\n')
    .split('\n').filter(Boolean).map((l) => l.split(' '));
  const findings = [];
  const skipped = [];
  entries.forEach((entry, i) => {
    const [, type, size] = types[i] || [];
    if (type !== 'blob') return;
    if (Number(size) > MAX_BLOB) { skipped.push({ path: entry.path, reason: 'larger than 5 MB' }); return; }
    const text = git(cwd, ['cat-file', 'blob', entry.sha]);
    if (text.includes('\0')) return;
    for (const f of findSecrets(text, entry.path)) findings.push({ ...f, blob: entry.sha.slice(0, 10) });
  });
  for (const f of findings) {
    const commit = git(cwd, ['log', '--all', '--format=%h', '--diff-filter=AM', `--find-object=${f.blob}`, '-n', '1']).trim();
    f.commit = commit || 'unknown';
    f.illustrative = ILLUSTRATIVE.test(f.file);
  }
  return { scannedBlobs: entries.length, findings, skipped };
}
