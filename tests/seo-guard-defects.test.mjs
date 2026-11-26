// SEO guard acceptance — staged defects (docs/seo/SEO_GUARD.md, "Recette"): each one must turn the check red.
import assert from "node:assert/strict";
import { copyFileSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { before, describe, test } from "node:test";
import { ROOT, edit, has, open, scenario, setup } from "./seo-guard-fixture.mjs";

before(() => setup({ preview: false }));

describe("staged defects are caught", { concurrency: 4 }, () => {
  test("a public page removed from the build → P0", async () => {
    const r = await scenario({ mutate: (d) => unlinkSync(join(d, "suivi-velo.html")) });
    has(r, "P0", "page-unavailable", "/suivi-velo");
    assert.equal(r.summary.verdict, "FAIL");
  });
  test("a 500 answer → P0, after bounded retries", async () => {
    const fetchImpl = (url, init) => (new URL(url).pathname === "/sports" ? Promise.resolve(new Response("boom", { status: 500 })) : fetch(url, init));
    const r = await scenario({ fetchImpl, retries: 1 });
    has(r, "P0", "server-error", "/sports");
  });
  test("soft 404: a page emptied into the 404 page, and a fallback answering 200 for unknown URLs → P0", async () => {
    const r = await scenario({ mutate: (d) => writeFileSync(join(d, "debuter-titan.html"), readFileSync(join(d, "404.html"))) });
    has(r, "P0", "soft-404", "/debuter-titan");
    const fallback = await scenario({ toml: (t) => t.replace(/\[\[redirects\]\]\n {2}from = "\/\*"\n {2}to = "\/404\.html"\n {2}status = 404/, '[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200') });
    has(fallback, "P0", "soft-404", "/page-inconnue-seo-guard");
  });
  test("a redirect loop → P0; a chain of two hops → P1", async () => {
    const loop = await scenario({ toml: (t) => t.replace("[[redirects]]", '[[redirects]]\nfrom = "/guide"\nto = "/guide-boucle"\nstatus = 301\nforce = true\n\n[[redirects]]\nfrom = "/guide-boucle"\nto = "/guide"\nstatus = 301\nforce = true\n\n[[redirects]]') });
    has(loop, "P0", "redirect-loop", "/guide");
    const chain = await scenario({ toml: (t) => t.replace("[[redirects]]", '[[redirects]]\nfrom = "/guide"\nto = "/guide-etape"\nstatus = 301\nforce = true\n\n[[redirects]]\nfrom = "/guide-etape"\nto = "/debuter-titan"\nstatus = 301\nforce = true\n\n[[redirects]]') });
    has(chain, "P1", "redirect-hops", "/guide");
  });
  test("a canonical pointing at a preview → P0", async () => {
    const r = await scenario({ mutate: (d) => edit(d, "fonctionnalites.html", (h) => h.replace('href="https://titan-app.fr/fonctionnalites"', 'href="https://deploy-preview-170--titano-app.netlify.app/fonctionnalites"')) });
    has(r, "P0", "canonical-mismatch", "/fonctionnalites");
  });
  test("an accidental noindex, in a page or in a netlify.toml header → P0", async () => {
    const meta = await scenario({ mutate: (d) => edit(d, "index.html", (h) => h.replace('content="index, follow, max-image-preview:large"', 'content="noindex, follow"')) });
    has(meta, "P0", "noindex-unexpected", "/");
    const header = await scenario({ toml: (t) => `${t}\n[[headers]]\nfor = "/sports"\n[headers.values]\nX-Robots-Tag = "noindex"\n` });
    has(header, "P0", "noindex-unexpected", "/sports");
  });
  test("a blocking robots.txt → P0 on every public page", async () => {
    const r = await scenario({ mutate: (d) => writeFileSync(join(d, "robots.txt"), "User-agent: *\nDisallow: /\n\nSitemap: https://titan-app.fr/sitemap.xml\n") });
    has(r, "P0", "robots-disallowed", "/");
    assert.equal(open(r, "P0").filter((f) => f.startsWith("robots-disallowed")).length, 27);
  });
  test("a sitemap listing a private page, a non-canonical URL and a preview host → P0/P1", async () => {
    const r = await scenario({ mutate: (d) => edit(d, "sitemap.xml", (x) => x.replace("</urlset>", "  <url><loc>https://titan-app.fr/profile</loc></url>\n  <url><loc>https://titan-app.fr/fonctionnalites.html</loc></url>\n  <url><loc>https://deploy-preview-170--titano-app.netlify.app/</loc></url>\n</urlset>")) });
    has(r, "P0", "sitemap-private", "/profile");
    has(r, "P1", "sitemap-non-indexable", "/fonctionnalites.html");
    has(r, "P0", "sitemap-foreign-url", "/sitemap.xml");
  });
  test("main content gone from the raw HTML → P0", async () => {
    const r = await scenario({ mutate: (d) => edit(d, "suivi-escalade.html", (h) => h.replace(/<main([^>]*)>[\s\S]*<\/main>/, "<main$1><h1>Suivi escalade</h1><p>Bientôt de retour.</p></main>")) });
    has(r, "P0", "content-removed", "/suivi-escalade");
    has(r, "P0", "soft-404", "/suivi-escalade");
  });
  test("the sign-up target removed → P0 on the journey; a button that no longer leads to it → P1", async () => {
    const r = await scenario({ mutate: (d) => unlinkSync(join(d, "onboarding.html")) });
    has(r, "P0", "cta-broken", "/fonctionnalites");
    const moved = await scenario({ mutate: (d) => edit(d, "debuter-titan.html", (h) => h.replaceAll('href="/onboarding"', 'href="/inscription"')) });
    has(moved, "P1", "cta-missing", "/debuter-titan");
  });
  test("a title copied from another page and a broken hreflang pair are reported, without blocking the duplicate", async () => {
    const title = readFileSync(join(ROOT, "index.html"), "utf8").match(/<title>([^<]*)<\/title>/)[1];
    const r = await scenario({ mutate: (d) => {
      edit(d, "sports.html", (h) => h.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`));
      edit(d, "suivi-velo.html", (h) => h.replace("</head>", '<link rel="alternate" hreflang="en" href="https://titan-app.fr/suivi-escalade"></head>'));
    } });
    assert.ok(open(r, "P2").some((f) => f.startsWith("title-duplicate ")), JSON.stringify(open(r, "P2")));
    has(r, "P1", "hreflang-reciprocity", "/suivi-velo");
  });
  test("a heavier showcase page (an app SDK on a public page) → P1, reproducible from bytes", async () => {
    const r = await scenario({ mutate: (d) => edit(d, "fonctionnalites.html", (h) => h.replace("</head>", '<script src="/js/vendor/supabase-2.111.0.js" defer></script></head>')) });
    has(r, "P1", "scripts-added", "/fonctionnalites");
    has(r, "P1", "weight-regression", "/fonctionnalites");
    // The snippets Netlify injects itself (rum in production, cdp on previews) are not the site's code.
    const platform = await scenario({ mutate: (d) => edit(d, "fonctionnalites.html", (h) => h.replace("</head>", '<script src="/.netlify/scripts/cdp" async></script><script src="/.netlify/scripts/rum" defer></script></head>')) });
    assert.ok(!open(platform).includes("scripts-added /fonctionnalites"), JSON.stringify(open(platform)));
  });
  test("a network timeout is diagnosed as inconclusive, within bounded time, never as a pass", async () => {
    const fetchImpl = (url, init) => (new URL(url).pathname === "/fonctionnalites" ? new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))) : fetch(url, init));
    const started = Date.now();
    const r = await scenario({ fetchImpl, timeoutMs: 300, retries: 1 });
    const f = r.findings.find((x) => x.rule === "unreachable" && x.url === "/fonctionnalites");
    assert.ok(f?.inconclusive, JSON.stringify(f));
    assert.match(f.actual, /timeout after 300 ms/);
    assert.ok(r.findings.filter((x) => x.rule === "unreachable").every((x) => x.inconclusive), "the .html and / variants that lead to it are inconclusive too, not dead ends");
    assert.equal(r.summary.verdict, "INCONCLUSIVE");
    assert.ok(Date.now() - started < 15000);
  });
  test("a page of the reference dropped from the contract → P0; an internal file exposed → P0; a stray _redirects → P1", async () => {
    has(await scenario({ manifest: (m) => { m.routes = m.routes.filter((r) => r.path !== "/partenariats"); return m; } }), "P0", "route-dropped", "/partenariats");
    // /TODO_PUBLIC_RELEASE.md is only covered by the "/*.md" rule (README* has a rule of its own): remove that rule and publish the file.
    const exposed = await scenario({ mutate: (d) => writeFileSync(join(d, "TODO_PUBLIC_RELEASE.md"), "# interne"), toml: (t) => t.replace(/\[\[redirects\]\]\n {2}from = "\/\*\.md"\n {2}to = "\/404\.html"\n {2}status = 404\n {2}force = true\n/, "") });
    has(exposed, "P0", "file-exposed", "/TODO_PUBLIC_RELEASE.md");
    has(await scenario({ mutate: (d) => copyFileSync(join(ROOT, "_redirects"), join(d, "_redirects")) }), "P1", "redirects-file", "dist/_redirects");
  });
});
