// Shared fixture of the SEO guard acceptance (docs/seo/SEO_GUARD.md, "Recette"). Every defect is staged on an ISOLATED copy of the built
// site, never on the repository or on production. The site is built in a temporary sandbox (tests/asset-cache-keys.test.mjs rebuilds the
// repository's dist/ in parallel, so these tests never touch it); each scenario serves a mutated copy through the Netlify emulator.
// The acceptance is split over three files so that node --test runs them in parallel processes (the guard is CPU-bound).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";
import { startEmulator } from "../tools/lib/netlify-emulator.mjs";
import { inspectDist, runGuard, toBaseline } from "../tools/lib/seo-guard.mjs";

export const ROOT = new URL("..", import.meta.url).pathname;
export const TOML = readFileSync(join(ROOT, "netlify.toml"), "utf8");
export const MANIFEST = JSON.parse(readFileSync(join(ROOT, "tools/seo/manifest.json"), "utf8"));
export const COMMIT = "a".repeat(40);
const temps = [];
const temp = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); temps.push(d); return d; };

// The public build, made in a sandbox with real copies (a symlink would let the build write into the sources).
function buildSandbox(env) {
  const dir = temp("titan-seo-build-");
  mkdirSync(join(dir, "tools/lib"), { recursive: true });
  for (const f of ["tools/build-public.mjs", "tools/lib/build-context.mjs"]) copyFileSync(join(ROOT, f), join(dir, f));
  for (const d of ["css", "js", "assets", "licenses"]) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
  mkdirSync(join(dir, "image"), { recursive: true });
  copyFileSync(join(ROOT, "image/logo-192.png"), join(dir, "image/logo-192.png"));
  for (const f of readdirSync(ROOT)) if (/\.(html|txt|xml|json|ico|js)$/.test(f) && statSync(join(ROOT, f)).isFile() && !["package.json"].includes(f)) copyFileSync(join(ROOT, f), join(dir, f));
  const r = spawnSync(process.execPath, [join(dir, "tools/build-public.mjs")], { encoding: "utf8", env: { ...process.env, NETLIFY: "", CONTEXT: "", COMMIT_REF: COMMIT, ...env } });
  assert.equal(r.status, 0, r.stderr);
  return join(dir, "dist");
}

export const fixture = { PROD: null, PREVIEW: null, BASELINE: null };

// A disposable copy of a built site: top-level files are copied (scenarios edit them), asset directories are symlinked (read only).
export function copySite(site, materialize = []) {
  const dir = temp("titan-seo-case-");
  for (const name of readdirSync(site)) {
    const from = join(site, name);
    if (statSync(from).isDirectory()) {
      if (materialize.includes(name)) cpSync(from, join(dir, name), { recursive: true });
      else symlinkSync(from, join(dir, name), "dir");
    } else copyFileSync(from, join(dir, name));
  }
  return dir;
}
export const edit = (dir, file, fn) => writeFileSync(join(dir, file), fn(readFileSync(join(dir, file), "utf8")));

export async function scenario({ site = fixture.PROD, mutate, toml = (t) => t, manifest = (m) => m, context = "production", baseline = fixture.BASELINE, approvals = { approvals: [] }, fetchImpl, expectCommit, timeoutMs, retries, materialize, today } = {}) {
  const dir = copySite(site, materialize);
  mutate?.(dir);
  const emu = await startEmulator({ dist: dir, netlifyToml: toml(TOML) });
  try {
    return await runGuard({ base: emu.url, manifest: manifest(structuredClone(MANIFEST)), baseline, approvals, context, distInfo: inspectDist(dir), expectCommit, concurrency: 8, timeoutMs: timeoutMs ?? 5000, retries: retries ?? 0, fetchImpl, today });
  } finally { await emu.close(); }
}
export const open = (report, severity) => report.findings.filter((f) => !f.approved && (!severity || f.severity === severity)).map((f) => `${f.rule} ${f.url}`);
export const has = (report, severity, rule, url) => assert.ok(open(report, severity).includes(`${rule} ${url}`), `expected ${severity} ${rule} ${url}; got ${JSON.stringify(open(report).slice(0, 12))}`);

/** Builds the production and preview sandboxes once per test file, and takes the clean production build as the reference. */
export async function setup({ preview = true } = {}) {
  fixture.PROD = buildSandbox({});
  if (preview) fixture.PREVIEW = buildSandbox({ NETLIFY: "true", CONTEXT: "deploy-preview", DEPLOY_ID: "0123456789abcdef01234567" });
  // The reference of these tests is the clean sandbox build itself: scenarios stay valid whatever the editorial state of the pages.
  const emu = await startEmulator({ dist: fixture.PROD, netlifyToml: TOML });
  const clean = await runGuard({ base: emu.url, manifest: MANIFEST, context: "production", distInfo: inspectDist(fixture.PROD), concurrency: 8 });
  await emu.close();
  fixture.BASELINE = toBaseline(clean, { reason: "test", commit: COMMIT, deployId: "test" });
}
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });

