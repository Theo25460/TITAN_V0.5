// /css and /js are served with a seven-day browser cache (netlify.toml). A page must therefore never address a first-party stylesheet or
// script by a hand-written key alone: nine deployments of the Programme redesign changed css/ascension.css and css/ascension-app.css while
// their ?v= keys stayed the same, so a returning visitor saw the new pages drawn with the old styles. The build stamps each address with a
// digest of the file; this test builds the site and proves it, and proves the digest follows the bytes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
execFileSync(process.execPath, ["tools/build-public.mjs"], { cwd: ROOT, stdio: "ignore" });
const pages = readdirSync(ROOT + "dist").filter(f => f.endsWith(".html"));
const digest = path => createHash("sha256").update(readFileSync(ROOT + "dist/" + path.replace(/^\.?\//, ""))).digest("hex").slice(0, 12);

test("every first-party stylesheet and script of every built page is addressed by a digest of its bytes", () => {
  let checked = 0;
  for (const page of pages) {
    const html = readFileSync(ROOT + "dist/" + page, "utf8");
    const refs = [...html.matchAll(/<link\b[^>]*\shref="(\.?\/css\/[^"#?]+\.css(?:\?[^"#]*)?)"/g), ...html.matchAll(/<script\b[^>]*\ssrc="(\.?\/js\/(?!vendor\/)[^"#]+)"/g)].map(m => m[1]);
    for (const url of refs) {
      const [path, query = ""] = url.split("?");
      const rev = new URLSearchParams(query).get("rev");
      assert.equal(rev, digest(path), `${page}: ${url} must carry rev=<digest of ${path}>`);
      checked++;
    }
  }
  assert.ok(checked > 400, `only ${checked} references were checked`);
});

test("the cache policy that makes the digest necessary is the one this test assumes", () => {
  const toml = readFileSync(ROOT + "netlify.toml", "utf8");
  for (const dir of ["css", "js"]) assert.match(toml, new RegExp(`for = "/${dir}/\\*"\\s+\\[headers.values\\]\\s+Cache-Control = "public, max-age=604800`), `/${dir}/* long cache`);
  assert.match(toml, /for = "\/\*\.html"\s+\[headers.values\]\s+Cache-Control = "public, max-age=0, must-revalidate"/, "pages are always revalidated, so they always carry the current digests");
});

test("the review drawer Netlify adds to deploy previews cannot cover the navigation", () => {
  for (const sheet of ["css/ascension.css", "css/design-system.css"]) assert.match(readFileSync(ROOT + sheet, "utf8"), /\[data-netlify-deploy-id\]\s*\{\s*display:\s*none\s*!important;?\s*\}/, sheet);
  for (const page of pages.filter(p => !/^google/.test(p))) assert.match(readFileSync(ROOT + "dist/" + page, "utf8"), /css\/(ascension|design-system)\.css/, `${page} loads one of the two base sheets`);
});
