// SEO V1.3.1 (Opération SEO, 18/11/2026): a crawl of the public pages as a robot reads them. It guards what seo-meta.test.mjs does not:
// broken internal links, links that pay a needless 301 (.html), structured data that would claim ratings or reviews TITAN does not have,
// and the words that tell this TITAN apart from its namesakes in a cut search-result title.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;
const ORIGIN = "https://titan-app.fr";
const sitemap = readFileSync(`${root}sitemap.xml`, "utf8");
const paths = [...sitemap.matchAll(/<loc>https:\/\/titan-app\.fr([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
const file = (path) => (path === "/" ? "index.html" : `${path.replace(/^\//, "").replace(/\/$/, "")}.html`);
const read = (path) => readFileSync(`${root}${file(path)}`, "utf8");
const redirects = new Set([...readFileSync(`${root}netlify.toml`, "utf8").matchAll(/^from\s*=\s*"([^"]+)"/gm)].map((m) => m[1]));
const title = (html) => (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";

function internalLinks(html) {
  return [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)]
    .map((m) => m[1].replace(/&amp;/g, "&"))
    .map((href) => (href.startsWith(ORIGIN) ? href.slice(ORIGIN.length) || "/" : href))
    .filter((href) => href.startsWith("/") && !href.startsWith("//"))
    .map((href) => href.split(/[?#]/)[0] || "/");
}

test("every internal link of a public page reaches a page, a file or a declared redirect", () => {
  const broken = [];
  for (const path of paths) {
    for (const target of internalLinks(read(path))) {
      if (/\.[a-z0-9]{2,5}$/i.test(target) && !target.endsWith(".html")) {
        if (!existsSync(`${root}${target.slice(1)}`)) broken.push(`${path} → ${target}`);
        continue;
      }
      const clean = target.replace(/\.html$/, "").replace(/(.)\/$/, "$1");
      if (!existsSync(`${root}${file(clean)}`) && !redirects.has(clean)) broken.push(`${path} → ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});

test("public pages link to clean addresses, never to a .html variant that answers with a 301", () => {
  const variants = paths.flatMap((path) => internalLinks(read(path)).filter((t) => t.endsWith(".html")).map((t) => `${path} → ${t}`));
  assert.deepEqual(variants, []);
});

test("structured data never declares ratings, reviews or an aggregate score", () => {
  for (const path of paths) {
    for (const [, json] of read(path).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      assert.doesNotMatch(json, /"(?:aggregateRating|review|reviewRating|ratingValue|ratingCount)"/, `${path}: no invented rating or review`);
    }
  }
});

test("the titles shown for brand searches say what TITAN is before a result page cuts them", () => {
  // About 60 characters survive in a result title on a phone; « titan » alone also names other products.
  for (const path of ["/", "/service"]) {
    const visible = title(read(path)).slice(0, 60).toLowerCase();
    assert.match(visible, /titan/, `${path}: brand in the visible title`);
    assert.match(visible, /application/, `${path}: « application » in the visible title`);
    assert.match(visible, /sport/, `${path}: « sport » in the visible title`);
  }
});

test("sport guides open on a one-line call to action that leads to the free start", () => {
  for (const path of ["/journal-course-a-pied", "/carnet-musculation", "/suivi-escalade", "/suivi-sportif", "/journal-entrainement", "/suivi-velo"]) {
    const head = (read(path).match(/<header class="pub-page-head">[\s\S]*?<\/header>/) || [""])[0];
    const cta = head.match(/<a class="asc-btn asc-btn-primary" href="([^"]+)">([^<]*)</);
    assert.ok(cta, `${path}: primary call to action`);
    assert.equal(cta[1], "/onboarding", `${path}: leads to the onboarding`);
    assert.ok(cta[2].trim().length <= 23, `${path}: « ${cta[2].trim()} » fits on one line at 320 px`);
  }
});
