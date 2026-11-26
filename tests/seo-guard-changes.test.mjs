// SEO guard acceptance — intended changes, previews and provenance (docs/seo/SEO_GUARD.md, "Recette"): what must pass, passes; what
// must be reviewed or refused, is.
import assert from "node:assert/strict";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { before, describe, test } from "node:test";
import { COMMIT, edit, fixture, has, open, scenario, setup } from "./seo-guard-fixture.mjs";
import { toMarkdown } from "../tools/lib/seo-guard.mjs";

before(() => setup());

describe("intended changes pass, previews stay out of the index, provenance is checked", { concurrency: 4 }, () => {
  test("the clean production build passes, with its reference", async () => {
    const r = await scenario();
    assert.equal(r.summary.P0, 0, JSON.stringify(open(r, "P0")));
    assert.equal(r.summary.P1, 0, JSON.stringify(open(r, "P1")));
    assert.equal(r.summary.verdict, "PASS");
    assert.match(toMarkdown(r), /Bouclier SEO — PASS/);
  });
  test("an intended title change fails until it is approved for that exact value; an expired approval no longer counts", async () => {
    const mutate = (d) => edit(d, "fonctionnalites.html", (h) => h.replace(/<title>[^<]*<\/title>/, "<title>Fonctionnalités de TITAN : journal, records et aventure</title>"));
    const without = await scenario({ mutate });
    has(without, "P1", "title-changed", "/fonctionnalites");
    assert.equal(without.summary.verdict, "FAIL");
    const approval = { id: "2026-11-26-titre", path: "/fonctionnalites", rule: "title-changed", to: "Fonctionnalités de TITAN : journal, records et aventure", reason: "Titre plus explicite", ref: "PR #test", approvedBy: "owner" };
    const approved = await scenario({ mutate, approvals: { approvals: [approval] } });
    assert.equal(approved.summary.verdict, "PASS", JSON.stringify(open(approved)));
    assert.equal(approved.summary.approved, 1);
    const stale = await scenario({ mutate, approvals: { approvals: [{ ...approval, expires: "2026-11-01" }] }, today: "2026-11-26" });
    has(stale, "P1", "title-changed", "/fonctionnalites");
    has(stale, "P2", "approval-expired", "/fonctionnalites");
  });
  test("a preview is not indexable; the production build checked as a preview is caught", async () => {
    const preview = await scenario({ site: fixture.PREVIEW, context: "deploy-preview" });
    assert.equal(preview.summary.P0, 0, JSON.stringify(open(preview, "P0")));
    const wrong = await scenario({ site: fixture.PROD, context: "deploy-preview" });
    has(wrong, "P0", "preview-indexable", "/");
  });
  test("the preview noindex propagating to production → P0", async () => {
    const r = await scenario({ site: fixture.PREVIEW, context: "production" });
    has(r, "P0", "noindex-propagation", "dist/_headers");
    has(r, "P0", "noindex-unexpected", "/");
    has(r, "P0", "build-context", "/build-info.json");
  });
  test("an application-only change (the QG) leaves the public contract intact", async () => {
    const r = await scenario({ mutate: (d) => edit(d, "aujourdhui.html", (h) => h.replace("</body>", '<section><h2>Nouveau module du QG</h2><p>Texte de l’application.</p></section><script src="/js/app/nouveau-module.js" defer></script></body>')) });
    assert.equal(r.summary.P0 + r.summary.P1, 0, JSON.stringify(open(r)));
  });
  test("a new valid public page passes once declared; undeclared it needs a decision", async () => {
    const mutate = (d) => {
      const html = readFileSync(join(d, "suivi-velo.html"), "utf8").replaceAll("https://titan-app.fr/suivi-velo", "https://titan-app.fr/suivi-natation").replace(/<title>[^<]*/, "<title>Suivi natation : carnet de nage | TITAN");
      writeFileSync(join(d, "suivi-natation.html"), html);
      edit(d, "sitemap.xml", (x) => x.replace("</urlset>", "  <url><loc>https://titan-app.fr/suivi-natation</loc></url>\n</urlset>"));
    };
    const toml = (t) => t.replace("[[redirects]]", '[[redirects]]\nfrom = "/suivi-natation.html"\nto = "/suivi-natation"\nstatus = 301\nforce = true\n\n[[redirects]]');
    const declared = await scenario({ mutate, toml, manifest: (m) => { m.routes.push({ path: "/suivi-natation", group: "guide" }); return m; } });
    assert.equal(declared.summary.P0 + declared.summary.P1, 0, JSON.stringify(open(declared)));
    has(declared, "P2", "new-route", "/suivi-natation");
    has(declared, "P2", "orphan", "/suivi-natation"); // linked from no other public page yet: a warning, not a block
    const undeclared = await scenario({ mutate, toml });
    has(undeclared, "P1", "route-unclassified", "/suivi-natation");
  });
  test("a URL migration with its 301 and its manifest entry passes; the same move without redirect → P0", async () => {
    const mutate = (d) => {
      renameSync(join(d, "suivi-velo.html"), join(d, "velo.html"));
      edit(d, "velo.html", (h) => h.replaceAll("https://titan-app.fr/suivi-velo", "https://titan-app.fr/velo"));
      edit(d, "sitemap.xml", (x) => x.replace("https://titan-app.fr/suivi-velo<", "https://titan-app.fr/velo<"));
    };
    const manifest = (m) => { m.routes = m.routes.filter((r) => r.path !== "/suivi-velo"); m.routes.push({ path: "/velo", group: "guide" }, { path: "/suivi-velo", group: "redirect", location: "/velo" }); return m; };
    const rules = '[[redirects]]\nfrom = "/suivi-velo"\nto = "/velo"\nstatus = 301\nforce = true\n\n[[redirects]]\nfrom = "/velo.html"\nto = "/velo"\nstatus = 301\nforce = true\n\n[[redirects]]';
    const migrated = await scenario({ mutate, manifest, toml: (t) => t.replace("[[redirects]]", rules).replace('from = "/suivi-velo"\nto = "/suivi-velo.html"\nstatus = 200', 'from = "/x-unused"\nto = "/suivi-velo.html"\nstatus = 200') });
    assert.equal(migrated.summary.P0 + migrated.summary.P1, 0, JSON.stringify(open(migrated)));
    const broken = await scenario({ mutate });
    has(broken, "P0", "page-unavailable", "/suivi-velo");
  });
  test("the published build is not the validated commit (an obsolete pull request) → P0", async () => {
    has(await scenario({ expectCommit: "b".repeat(40) }), "P0", "build-mismatch", "/build-info.json");
    assert.equal(open(await scenario({ expectCommit: COMMIT })).filter((f) => f.startsWith("build-")).length, 0);
  });
});
