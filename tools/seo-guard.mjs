#!/usr/bin/env node
// SEO guard (bouclier SEO) — command line. Explained in docs/seo/SEO_GUARD.md.
//
//   node tools/seo-guard.mjs check --dist dist [--context production|deploy-preview|branch-deploy] [--fail-on p0|p1] [--netlify-toml <file>]
//        the built artifact, served locally with the real netlify.toml rules (no network): run in CI and in the Netlify build
//   node tools/seo-guard.mjs check --base https://titan-app.fr [--scope smoke|full] [--expect-commit <sha>] [--wait-commit <seconds>]
//        a published site (production, or a deploy preview with --context deploy-preview)
//   node tools/seo-guard.mjs baseline --base https://titan-app.fr --reason "<why>"
//        rewrites tools/seo/baseline/production.json from PRODUCTION only, and only when production passes without P0
//
// Exit codes: 0 PASS (P2 warnings allowed) · 1 FAIL (P0, or an unapproved P1 unless --fail-on p0) · 3 INCONCLUSIVE (network) · 2 usage.
// Reports: <out>/<label>.json and <out>/<label>.md (default out: test-results/seo-guard). Nothing is ever sent anywhere.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startEmulator } from "./lib/netlify-emulator.mjs";
import { runGuard, toBaseline, toMarkdown, boundedFetch, inspectDist } from "./lib/seo-guard.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const PRODUCTION = "https://titan-app.fr";
const DUPLICATE_HOSTS = ["titano-app.netlify.app", "main--titano-app.netlify.app"];

function args(argv) {
  const [command, ...rest] = argv;
  const opts = { _: command };
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const value = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[(i += 1)] : "true";
    opts[name] = value;
  }
  return opts;
}
const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);
const usage = (message) => { console.error(`${message}\nUsage : voir l'en-tête de tools/seo-guard.mjs`); process.exit(2); };

// A preview or production URL must be one of this site's hosts: the guard never crawls a third party.
const ALLOWED_BASE = /^(https:\/\/titan-app\.fr|https:\/\/(?:deploy-preview-\d+|[a-f0-9]{24}|[a-z0-9-]+)--titano-app\.netlify\.app|http:\/\/127\.0\.0\.1:\d+)$/;

async function waitForCommit(base, sha, seconds) {
  const deadline = Date.now() + seconds * 1000;
  let last = "no answer";
  while (Date.now() < deadline) {
    const r = await boundedFetch(`${base}/build-info.json?t=${Date.now()}`, { timeoutMs: 10000, retries: 0 });
    if (r.status === 200) {
      try { const info = JSON.parse(r.body); if (info.commit === sha) return { ok: true, info }; last = `commit ${info.commit}`; } catch { last = "invalid build-info.json"; }
    } else last = r.error || `HTTP ${r.status}`;
    await new Promise((ok) => setTimeout(ok, 15000));
  }
  return { ok: false, last };
}

async function main() {
  const opts = args(process.argv.slice(2));
  if (!["check", "baseline"].includes(opts._)) usage("Commande inconnue (check ou baseline).");
  const manifest = readJson(join(root, "tools/seo/manifest.json"));
  const approvals = readJson(join(root, "tools/seo/approvals.json"), { approvals: [] });
  const baselinePath = join(root, "tools/seo/baseline/production.json");
  const baseline = opts["no-baseline"] === "true" ? null : readJson(baselinePath, null);
  const out = resolve(root, opts.out || "test-results/seo-guard");
  // Same rule as tools/lib/build-context.mjs: only an explicit non-production Netlify context expects the preview noindex; an empty or
  // unknown CONTEXT is checked as production (the build writes no noindex for it either).
  const requested = opts.context === "true" ? "" : opts.context || "";
  let context = requested === "dev" ? "branch-deploy" : ["deploy-preview", "branch-deploy"].includes(requested) ? requested : "production";
  if (requested && requested !== context && requested !== "dev") console.log(`Contexte « ${requested} » inconnu : contrôlé comme la production.`);

  let base, emulator = null, distInfo = null, label = opts.label;
  if (opts.dist) {
    const dist = resolve(root, opts.dist);
    if (!existsSync(join(dist, "index.html"))) usage(`${dist} n'est pas un site construit : lancer d'abord node tools/build-public.mjs.`);
    // --netlify-toml lets the guard judge another checkout (a branch of a parallel lot) with that checkout's own routing rules.
    emulator = await startEmulator({ dist, netlifyToml: readFileSync(resolve(root, opts["netlify-toml"] || "netlify.toml"), "utf8") });
    base = emulator.url;
    distInfo = inspectDist(dist);
    label ||= `dist-${context}`;
  } else {
    base = String(opts.base || "").replace(/\/+$/, "");
    if (!ALLOWED_BASE.test(base)) usage(`--base doit être https://titan-app.fr, un déploiement *--titano-app.netlify.app ou un émulateur local (reçu « ${base} »).`);
    if (base !== PRODUCTION && context === "production" && opts._ === "check") context = "deploy-preview";
    label ||= base === PRODUCTION ? `production-${opts.scope || "full"}` : `preview-${new URL(base).hostname.split("--")[0]}`;
    if (opts["wait-commit"] && opts["expect-commit"]) {
      const waited = await waitForCommit(base, opts["expect-commit"], Number(opts["wait-commit"]));
      if (!waited.ok) {
        const message = `${base} n'a pas servi le commit ${opts["expect-commit"]} en ${opts["wait-commit"]} s (dernier état : ${waited.last}).`;
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, `${label}.md`), `## Bouclier SEO — INCONCLUSIVE\n\n${message}\n`);
        console.log(`INCONCLUSIVE: ${message}`);
        if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Bouclier SEO — INCONCLUSIVE\n\n${message}\n`);
        process.exit(3);
      }
    }
  }

  if (opts._ === "baseline" && (base !== PRODUCTION || opts.dist)) usage("La référence se prend sur la production seulement (jamais une preview ni un build local).");
  if (opts._ === "baseline" && !opts.reason) usage('--reason "<pourquoi la référence change>" est obligatoire.');
  const report = await runGuard({
    base, manifest, baseline, approvals, context, scope: opts.scope || "full", expectCommit: opts["expect-commit"], distInfo,
    duplicateHosts: !opts.dist && base === PRODUCTION && opts["check-hosts"] !== "false" ? DUPLICATE_HOSTS : [],
    failOn: opts["fail-on"] || "p1", targetLabel: opts.dist ? `dist/ (${opts.dist}) via netlify.toml` : base, concurrency: Number(opts.concurrency || 4),
    timeoutMs: Number(opts.timeout || 15000), retries: Number(opts.retries ?? 2),
  });
  await emulator?.close();

  if (opts._ === "baseline") {
    if (report.summary.P0 || report.summary.inconclusive) {
      console.error(`Refusé : la production a ${report.summary.P0} P0 et ${report.summary.inconclusive} résultats non concluants. Une production défectueuse ne devient jamais la référence.`);
      for (const f of report.findings.filter((x) => x.severity === "P0")) console.error(` - ${f.rule} ${f.url}: ${JSON.stringify(f.actual)}`);
      process.exit(1);
    }
    const next = toBaseline(report, { reason: opts.reason, commit: report.build?.commit || opts.commit || null, deployId: report.build?.deployId || opts["deploy-id"] || null });
    mkdirSync(join(root, "tools/seo/baseline"), { recursive: true });
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Référence écrite : tools/seo/baseline/production.json (${Object.keys(next.pages).length} pages publiques, commit ${next.commit ?? "inconnu"}, déploiement ${next.deployId ?? "inconnu"}). Relire le diff, puis le commiter.`);
    return;
  }

  delete report._observed;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${label}.json`), `${JSON.stringify(report, null, 2)}\n`);
  const md = toMarkdown(report);
  writeFileSync(join(out, `${label}.md`), md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  const s = report.summary;
  console.log(`Bouclier SEO ${s.verdict} — ${report.target} [${report.context}, ${report.scope}] — P0 ${s.P0} · P1 ${s.P1} · P2 ${s.P2} · approuvés ${s.approved} · non concluants ${s.inconclusive} — ${s.routes} routes en ${(report.durationMs / 1000).toFixed(1)} s`);
  for (const f of report.findings.filter((x) => !x.approved && x.severity !== "P2")) {
    console.log(` ${f.severity}${f.inconclusive ? " (non concluant)" : ""} ${f.rule} ${f.url}\n    attendu : ${JSON.stringify(f.expected)}\n    obtenu  : ${JSON.stringify(f.actual)}\n    piste   : ${f.hint}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::${f.severity === "P0" ? "error" : "warning"} title=SEO ${f.severity} ${f.rule}::${f.url} — attendu ${JSON.stringify(f.expected)}, obtenu ${JSON.stringify(f.actual)}`);
  }
  console.log(`Rapport : ${join(out, `${label}.json`).replace(`${root}/`, "")} et .md`);
  process.exitCode = s.verdict === "FAIL" ? 1 : s.verdict === "INCONCLUSIVE" ? 3 : 0;
}

main().catch((error) => { console.error(error?.stack || error); process.exit(2); });
