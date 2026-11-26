// SEO guard (docs/seo/SEO_GUARD.md): parsers, Netlify emulator, build context, approvals and bounded network. The staged defects are in
// tests/seo-guard-defects.test.mjs and the intended changes in tests/seo-guard-changes.test.mjs.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { before, describe, test } from "node:test";
import { createSite, matchPattern, parseHeadersFile, parseNetlifyToml } from "../tools/lib/netlify-emulator.mjs";
import { extractPage, robotsDirectives } from "../tools/lib/seo-html.mjs";
import { isAllowed, parseRobots, parseSitemap } from "../tools/lib/seo-robots.mjs";
import { loadApprovals, boundedFetch } from "../tools/lib/seo-guard.mjs";
import { buildContext, previewHeaders } from "../tools/lib/build-context.mjs";
import { COMMIT, ROOT, TOML, fixture, setup } from "./seo-guard-fixture.mjs";

before(() => setup());

describe("parsers", () => {
  test("raw HTML: title, canonical, robots, H1, main text, links and calls to action", () => {
    const page = extractPage(`<!doctype html><html lang="fr"><head><title>T &amp; co</title><meta name="description" content="Desc"><link rel="canonical" href="https://titan-app.fr/x"><meta name="robots" content="index, follow"><script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{},{}]}</script></head><body><nav><a href="/nav">Nav</a></nav><main><h1>Titre <em>fort</em></h1><p>Un deux trois quatre.</p><script>var a = "<p>pas du texte</p>";</script><a class="asc-btn asc-btn-primary" href="/onboarding">Commencer</a><a href="https://titan-app.fr/y?z=1#f">Y</a><a href="https://autre.fr/">Ext</a></main></body></html>`);
    assert.equal(page.title, "T & co");
    assert.deepEqual(page.canonical, ["https://titan-app.fr/x"]);
    assert.deepEqual(page.h1, ["Titre fort"]);
    assert.equal(page.lang, "fr");
    assert.deepEqual(page.links, ["/nav", "/onboarding", "/y"]);
    assert.deepEqual(page.ctas.map((c) => [c.href, c.primary]), [["/onboarding", true]]);
    assert.equal(page.faqQuestions, 2);
    assert.ok(page.mainBlocks.includes("Un deux trois quatre."));
    assert.ok(!page.mainBlocks.join(" ").includes("pas du texte"), "script content is not page text");
  });
  test("noindex from the meta or from X-Robots-Tag, with or without a user agent", () => {
    assert.equal(robotsDirectives({ robotsMeta: ["noindex,nofollow"] }).noindex, true);
    assert.equal(robotsDirectives({ xRobotsTag: "googlebot: noindex" }).noindex, true);
    assert.equal(robotsDirectives({ xRobotsTag: "none" }).noindex, true);
    assert.equal(robotsDirectives({ robotsMeta: ["index, follow, max-image-preview:large"], xRobotsTag: "" }).noindex, false);
  });
  test("robots.txt follows Google: longest rule wins, Allow wins a tie, * and $ patterns, most specific agent", () => {
    const robots = parseRobots(readFileSync(join(ROOT, "robots.txt"), "utf8"));
    assert.equal(isAllowed(robots, "/").allowed, true);
    assert.equal(isAllowed(robots, "/suivi-escalade").allowed, true);
    assert.equal(isAllowed(robots, "/sql/x.sql").allowed, false);
    assert.equal(isAllowed(robots, "/README.md").allowed, false);
    assert.equal(isAllowed(robots, "/README.mdx").allowed, true, "$ anchors the end");
    assert.deepEqual(robots.sitemaps, ["https://titan-app.fr/sitemap.xml"]);
    assert.equal(isAllowed(parseRobots("User-agent: *\nDisallow: /\nUser-agent: Googlebot\nAllow: /\n"), "/x").allowed, true);
    assert.equal(isAllowed(parseRobots("User-agent: *\nDisallow: /p\nAllow: /p\n"), "/p").allowed, true);
  });
  test("sitemap: a urlset with a loc per url", () => {
    assert.equal(parseSitemap(readFileSync(join(ROOT, "sitemap.xml"), "utf8")).valid, true);
    assert.equal(parseSitemap("<urlset><url><loc>x</loc></url></urlset>").valid, false, "namespace required");
    assert.equal(parseSitemap('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url></url></urlset>').valid, false, "loc required");
  });
});

describe("Netlify emulator (behaviour measured on titan-app.fr, 26/11/2026)", () => {
  test("patterns: splat, placeholder, extension splat and domain-level rules", () => {
    assert.deepEqual(matchPattern("/u/*", "/u/abc/def", null), { splat: "abc/def" });
    assert.ok(matchPattern("/*.md", "/README.md", null));
    assert.equal(matchPattern("/*.md", "/README.mdx", null), null);
    assert.deepEqual(matchPattern("/news/:slug", "/news/a", null), { slug: "a" });
    assert.ok(matchPattern("https://titano-app.netlify.app/*", "/x", "titano-app.netlify.app"));
    assert.equal(matchPattern("https://titano-app.netlify.app/*", "/x", "titan-app.fr"), null);
  });
  test("toml subset: redirects and headers, escaped quotes included", () => {
    const parsed = parseNetlifyToml(TOML);
    assert.ok(parsed.redirects.length > 100);
    assert.ok(parsed.headers.some((h) => h.for === "/profile" && /noindex/.test(h.values["X-Robots-Tag"])));
    assert.deepEqual(parseHeadersFile("/*\n  X-Robots-Tag: noindex\n"), [{ for: "/*", values: { "X-Robots-Tag": "noindex" } }]);
  });
  test("first match, forced rules, shadowing, rewrites, 404 catch-all, headers on the requested path only, none on a 3xx", () => {
    const site = createSite({ dist: fixture.PROD, netlifyToml: TOML });
    assert.equal(site.resolveRequest("/fonctionnalites").status, 200);
    assert.equal(site.resolveRequest("/fonctionnalites.html").headers.location, "/fonctionnalites");
    assert.equal(site.resolveRequest("/fonctionnalites/").headers.location, "/fonctionnalites");
    assert.equal(site.resolveRequest("/page-inconnue").status, 404);
    assert.equal(site.resolveRequest("/README.md").status, 404);
    assert.equal(site.resolveRequest("/Tarifs").status, 404, "rule paths are case-sensitive");
    assert.match(site.resolveRequest("/profile").headers["x-robots-tag"], /noindex/);
    assert.equal(site.resolveRequest("/athlete").headers["x-robots-tag"], undefined, "the /athlete.html header does not apply to /athlete");
    assert.equal(site.resolveRequest("/profile.html").headers["x-robots-tag"], undefined, "a redirect carries no header rule");
    assert.equal(site.resolveRequest("/u/exemple").file.endsWith("athlete.html"), true);
    assert.equal(site.resolveRequest("/seance-live.html").status, 200, "a file shadows the non-forced rules");
  });
  test("the duplicate production hosts answer 301 to titan-app.fr; deploy previews and permalinks are not matched", () => {
    const site = createSite({ dist: fixture.PROD, netlifyToml: TOML });
    for (const host of ["titano-app.netlify.app", "main--titano-app.netlify.app"]) {
      const r = site.resolveRequest("/suivi-escalade?x=1", host);
      assert.equal(r.status, 301, host);
      assert.equal(r.headers.location, "https://titan-app.fr/suivi-escalade");
    }
    for (const host of ["deploy-preview-170--titano-app.netlify.app", "6afec02bcf8ca878e98133e6--titano-app.netlify.app", "titan-app.fr"]) assert.equal(site.resolveRequest("/suivi-escalade", host).status, 200, host);
  });
});

describe("build context", () => {
  test("only an explicit non-production Netlify context writes the noindex _headers", () => {
    for (const context of ["deploy-preview", "branch-deploy", "dev"]) assert.match(previewHeaders(buildContext({ NETLIFY: "true", CONTEXT: context, COMMIT_REF: COMMIT })), /X-Robots-Tag: noindex/);
    for (const env of [{ NETLIFY: "true", CONTEXT: "production" }, { NETLIFY: "true", CONTEXT: "" }, { NETLIFY: "true", CONTEXT: "staging" }, {}]) assert.equal(previewHeaders(buildContext(env)), null, JSON.stringify(env));
    assert.deepEqual(buildContext({ NETLIFY: "true", CONTEXT: "production", COMMIT_REF: COMMIT, DEPLOY_ID: "d", BRANCH: "main" }), { commit: COMMIT, context: "production", branch: "main", deployId: "d", reviewId: null });
  });
  test("the sandbox builds carry their provenance; the preview build alone has the noindex file", () => {
    assert.equal(JSON.parse(readFileSync(join(fixture.PROD, "build-info.json"), "utf8")).commit, COMMIT);
    assert.equal(existsSync(join(fixture.PROD, "_headers")), false);
    assert.match(readFileSync(join(fixture.PREVIEW, "_headers"), "utf8"), /X-Robots-Tag: noindex/);
  });
});

describe("approvals", () => {
  test("one URL, one rule, one exact value, with a reason, a reference and an approver; patterns and contract rules are refused", () => {
    const { active, expired, problems } = loadApprovals({ approvals: [
      { id: "ok", path: "/x", rule: "title-changed", to: "T", reason: "r", ref: "PR #1", approvedBy: "owner" },
      { id: "old", path: "/x", rule: "title-changed", to: "T", reason: "r", ref: "PR #1", approvedBy: "owner", expires: "2026-01-01" },
      { id: "star", path: "/*", rule: "title-changed", to: "T", reason: "r", ref: "PR", approvedBy: "o" },
      { id: "contract", path: "/x", rule: "noindex-unexpected", to: "x", reason: "r", ref: "PR", approvedBy: "o" },
      { id: "incomplete", path: "/x", rule: "title-changed", to: "T" },
    ] }, { today: "2026-11-26" });
    assert.deepEqual(active.map((a) => a.id), ["ok"]);
    assert.deepEqual(expired.map((a) => a.id), ["old"]);
    assert.equal(problems.length, 3);
  });
});

describe("bounded network", () => {
  test("boundedFetch gives up after its retries and reports the error", async () => {
    let calls = 0;
    const r = await boundedFetch("http://127.0.0.1:9/never", { retries: 2, timeoutMs: 200, fetchImpl: () => { calls += 1; return Promise.reject(Object.assign(new Error("refused"), { cause: { code: "ECONNREFUSED" } })); } });
    assert.equal(r.ok, false);
    assert.equal(calls, 3);
    assert.equal(r.error, "ECONNREFUSED");
  });
});
