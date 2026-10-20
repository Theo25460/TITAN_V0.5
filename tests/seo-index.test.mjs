// SEO08: no private or account page is indexable by mistake. Every page that is not in the sitemap must say noindex;
// every page in the sitemap must not.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;
const sitemap = readFileSync(`${root}sitemap.xml`, "utf8");
const routes = [...sitemap.matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
const publicFiles = new Set(routes.map((r) => (r === "/" ? "index.html" : `${r.replace(/^\//, "")}.html`)));
// Verification file of the search console and the retired console page (blocked in robots.txt and answered 404).
const EXEMPT = new Set(["googleb8fedd43e28cf7d4.html", "sys_core_override_99.html"]);
const pages = readdirSync(root).filter((f) => f.endsWith(".html"));
const noindex = (file) => /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(readFileSync(`${root}${file}`, "utf8"));

test("the sitemap lists existing, indexable pages only", () => {
  assert.ok(routes.length >= 20, "sitemap read");
  for (const file of publicFiles) {
    assert.ok(pages.includes(file), `${file} is in the sitemap but missing`);
    assert.ok(!noindex(file), `${file} is in the sitemap but marked noindex`);
  }
});

test("every page outside the sitemap is noindex", () => {
  const leaks = pages.filter((f) => !publicFiles.has(f) && !EXEMPT.has(f) && !noindex(f));
  assert.deepEqual(leaks, [], "private pages that search engines may index");
  assert.ok(pages.filter((f) => !publicFiles.has(f) && !EXEMPT.has(f)).length >= 15, "the private pages were found");
});
