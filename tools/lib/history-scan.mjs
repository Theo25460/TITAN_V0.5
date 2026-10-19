// Looks for server secrets in EVERY version of EVERY file reachable from any ref, not only in the current tree.
// A secret removed from the tree is still a secret until it is rotated: this finds those. Read-only; findings carry
// the paths, the first commit that introduced the content and the kind, never the value.
// Fails closed: a shallow or partial clone, a missing object or an oversized text file throws instead of reporting OK.
import { execFileSync } from 'node:child_process';
import { findSecrets } from './release-safety.mjs';

const BINARY = /\.(?:png|jpe?g|webp|gif|ico|avif|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|ogg|pdf|zip|gz|br|wasm|mov|heic|aab|apk|keystore|jks)$/i;
const MAX_BLOB = 5 * 1024 * 1024;
// Files whose job is to quote fake secrets: reported separately, they do not fail the scan.
const ILLUSTRATIVE = /^(?:tests|docs)\//;
const ZERO = /^0+$/;

const git = (cwd, args, input, raw = false) => {
  const out = execFileSync('git', args, { cwd, input, maxBuffer: 1024 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  return raw ? out : out.toString('utf8');
};

// Every (content, path) pair ever recorded: each commit's diff against all its parents (-m), plus the final trees.
function collectPaths(cwd) {
  const paths = new Map(); // sha -> Set(path)
  const add = (sha, path) => {
    if (!sha || ZERO.test(sha) || !path) return;
    if (!paths.has(sha)) paths.set(sha, new Set());
    paths.get(sha).add(path);
  };
  let pending;
  for (const field of git(cwd, ['log', '--all', '--raw', '-r', '-m', '--root', '--no-renames', '--no-abbrev', '--format=', '-z']).split('\0')) {
    // With -z a record is ":oldmode newmode oldsha newsha status" then the path in the next NUL-separated field.
    const text = field.replace(/^\n+/, '');
    if (text.startsWith(':')) pending = text.split(' ')[3];
    else if (pending !== undefined) { add(pending, text); pending = undefined; }
  }
  for (const line of git(cwd, ['rev-list', '--objects', '--all']).split('\n')) {
    const space = line.indexOf(' ');
    if (space > 0) add(line.slice(0, space), line.slice(space + 1));
  }
  return paths;
}

export function scanHistory(cwd) {
  if (git(cwd, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    throw new Error('shallow clone: the history is incomplete (fetch with full depth)');
  }
  const all = collectPaths(cwd);
  const candidates = [...all.entries()].filter(([, set]) => ![...set].every((p) => BINARY.test(p)));
  const shas = candidates.map(([sha]) => sha);
  const infos = git(cwd, ['cat-file', '--batch-check'], shas.join('\n') + '\n').split('\n').filter(Boolean);
  if (infos.length !== shas.length) throw new Error('unexpected git cat-file answer');
  const blobs = [];
  const skipped = [];
  infos.forEach((info, i) => {
    const [, type, size] = info.split(' ');
    if (type === undefined || info.endsWith('missing')) throw new Error('missing object: the repository is incomplete');
    if (type !== 'blob') return;
    const [sha, set] = candidates[i];
    if (Number(size) > MAX_BLOB) skipped.push({ sha, paths: [...set], reason: 'larger than 5 MB' });
    else blobs.push(sha);
  });
  if (skipped.length) {
    const error = new Error(`${skipped.length} text file version(s) larger than 5 MB were not scanned: ${skipped.map((s) => s.paths[0]).join(', ')}`);
    error.skipped = skipped;
    throw error;
  }
  const findings = [];
  let scanned = 0;
  if (blobs.length) {
    const out = git(cwd, ['cat-file', '--batch'], blobs.join('\n') + '\n', true);
    let offset = 0;
    for (const sha of blobs) {
      const eol = out.indexOf(0x0a, offset);
      const header = out.subarray(offset, eol).toString('utf8').split(' ');
      const size = Number(header[2]);
      const body = out.subarray(eol + 1, eol + 1 + size);
      offset = eol + 1 + size + 1;
      if (header[0] !== sha || !Number.isFinite(size)) throw new Error('unexpected git cat-file --batch answer');
      if (body.includes(0)) continue;
      scanned += 1;
      const paths = [...all.get(sha)];
      for (const f of findSecrets(body.toString('utf8'), paths[0])) {
        findings.push({ blob: sha, line: f.line, kind: f.kind, paths, illustrative: paths.every((p) => ILLUSTRATIVE.test(p)) });
      }
    }
  }
  for (const f of findings) {
    // The first commit is only worth a full-history search for a real leak, not for a quotation in docs or tests.
    const first = f.illustrative ? null : git(cwd, ['log', '--all', '-m', '--reverse', '--format=%h', `--find-object=${f.blob}`]).split('\n').find(Boolean);
    f.commit = first || (f.illustrative ? 'not searched' : 'unknown');
    f.blob = f.blob.slice(0, 10);
  }
  return { scannedBlobs: scanned, findings, skipped };
}
