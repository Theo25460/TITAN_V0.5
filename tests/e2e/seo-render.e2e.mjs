// SEO guard, rendered side (docs/seo/SEO_GUARD.md): the built dist/, served with the real netlify.toml rules, rendered in Chromium on a
// phone and a desktop, third parties cut. The clean build passes; scripts that empty the main content, rewrite the canonical from the
// request host or add a noindex after loading are caught (staged on a copy of dist/, never on the repository).
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { chromium } from "playwright";
import { startEmulator } from "../../tools/lib/netlify-emulator.mjs";
import { renderCheck } from "../../tools/seo-render.mjs";

const ROOT = new URL("../..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const TOML = readFileSync(join(ROOT, "netlify.toml"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "tools/seo/manifest.json"), "utf8"));
const temps = [];
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });

test("the built public pages render with their content, title, canonical and call to action, and the journeys complete", async () => {
  const emu = await startEmulator({ dist: DIST, netlifyToml: TOML });
  try {
    const report = await renderCheck({ base: emu.url, manifest: MANIFEST, chromium });
    assert.equal(report.summary.verdict, "PASS", JSON.stringify(report.findings, null, 1));
    assert.ok(Object.keys(report.observations).length >= 12, "six critical pages × two screens");
    for (const [label, o] of Object.entries(report.observations)) assert.ok(o.words >= o.rawWords * 0.9, `${label}: ${o.words} rendered words of ${o.rawWords}`);
  } finally { await emu.close(); }
});

test("scripts that empty the content, rewrite the canonical from the host or add noindex are caught", async () => {
  const dir = mkdtempSync(join(tmpdir(), "titan-seo-render-"));
  temps.push(dir);
  for (const name of readdirSync(DIST)) {
    const from = join(DIST, name);
    if (statSync(from).isDirectory()) symlinkSync(from, join(dir, name), "dir"); else copyFileSync(from, join(dir, name));
  }
  // External files (the Content-Security-Policy refuses inline scripts, as in production).
  writeFileSync(join(dir, "sabotage-vide.js"), "addEventListener('DOMContentLoaded',()=>{document.querySelector('main').innerHTML='<p>Chargement…</p>';});");
  writeFileSync(join(dir, "sabotage-meta.js"), "addEventListener('DOMContentLoaded',()=>{document.querySelector('link[rel=canonical]').href=location.origin+location.pathname;const m=document.createElement('meta');m.name='robots';m.content='noindex';document.head.append(m);});");
  const inject = (file, script) => writeFileSync(join(dir, file), readFileSync(join(dir, file), "utf8").replace("</head>", `<script src="/${script}"></script></head>`));
  inject("suivi-escalade.html", "sabotage-vide.js");
  inject("fonctionnalites.html", "sabotage-meta.js");
  const emu = await startEmulator({ dist: dir, netlifyToml: TOML });
  try {
    const report = await renderCheck({ base: emu.url, manifest: MANIFEST, chromium, paths: ["/suivi-escalade", "/fonctionnalites"] });
    const got = report.findings.map((f) => `${f.severity} ${f.rule} ${f.url}`);
    for (const expected of ["P0 render-content-lost /suivi-escalade @mobile", "P0 render-h1-missing /suivi-escalade @desktop", "P0 render-canonical-changed /fonctionnalites @mobile", "P0 render-noindex-added /fonctionnalites @desktop"]) {
      assert.ok(got.includes(expected), `${expected} — got ${JSON.stringify(got)}`);
    }
    assert.equal(report.summary.verdict, "FAIL");
  } finally { await emu.close(); }
});
