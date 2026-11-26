// /css and /js are served with a seven-day browser cache (netlify.toml). A page must therefore never address a first-party stylesheet or
// script by a hand-written key alone: nine deployments of the Programme redesign changed css/ascension.css and css/ascension-app.css while
// their ?v= keys stayed the same, so a returning visitor saw the new pages drawn with the old styles. The build stamps each address with a
// digest of the file; this test builds the site and proves it, and proves the digest follows the bytes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

// Code and stylesheets request first-party files too, and those requests hit the same seven-day cache: a script added at runtime
// (assistance.js loads config.js, moment.js the live scene), a worker (seance.js starts the GPX worker, which
// importScripts the parser) and a CSS @import (design-system.css imports fonts.css). Before the build stamped them, each kept a stale copy
// for a week after a deployment, the incident class this file exists for.
const distFiles = (dir, ext) => readdirSync(ROOT + "dist/" + dir, { recursive: true }).map(String).filter(f => f.endsWith(ext)).map(f => `${dir}/${f.split("\\").join("/")}`);
const RUNTIME_LITERAL = /(['"])(\.?\/(?:js\/(?!vendor\/)[^'"#]+\.js|css\/[^'"#]+\.css)(?:\?[^'"#]*)?)\1/g;
const revOf = url => new URLSearchParams(url.split("?")[1] || "").get("rev");

test("every first-party address written in a built script or stylesheet carries the digest of the file it names (vendor excluded)", () => {
  const found = [];
  for (const file of distFiles("js", ".js").filter(f => !f.startsWith("js/vendor/"))) {
    const text = readFileSync(ROOT + "dist/" + file, "utf8");
    for (const [, , url] of text.matchAll(RUNTIME_LITERAL)) {
      const path = url.split("?")[0];
      assert.equal(revOf(url), digest(path), `${file}: ${url} must carry rev=<digest of ${path}>`);
      found.push(`${file} -> ${path}`);
    }
    // The build stamps plain string literals only: an address assembled in a template literal would silently keep the stale cache.
    assert.doesNotMatch(text, /`\.?\/(?:js\/(?!vendor\/)|css\/)/, `${file}: write a first-party script or stylesheet address as a plain string so the build can stamp it`);
  }
  for (const file of distFiles("css", ".css")) {
    const text = readFileSync(ROOT + "dist/" + file, "utf8");
    for (const [, , href] of text.matchAll(/@import\s+(?:url\(\s*)?(['"]?)([^'"()\s]+)\1/g)) {
      const target = new URL(href, `https://titan.invalid/${file}`);
      if (target.origin !== "https://titan.invalid") continue;
      assert.equal(revOf(href), digest(target.pathname), `${file}: @import ${href} must carry rev=<digest of ${target.pathname}>`);
      found.push(`${file} -> ${target.pathname}`);
    }
  }
  for (const expected of ["js/app/seance.js -> /js/core/gpx-worker.js", "js/core/gpx-worker.js -> /js/core/gpx.js", "js/app/moment.js -> /js/core/live-scene.js", "js/app/assistance.js -> /js/config.js", "css/design-system.css -> /css/fonts.css"]) {
    assert.ok(found.includes(expected), `${expected} is no longer found: the scan lost a reference the code still makes`);
  }
  // Vendor files are versioned by their file name and left as written.
  assert.match(readFileSync(ROOT + "dist/js/app/assistance.js", "utf8"), /script\('\/js\/vendor\/supabase-2\.111\.0\.js'\)/);
});

test("the offline shell holds the stamped addresses the code requests, and every entry resolves to a built file with its current digest", () => {
  const sw = readFileSync(ROOT + "dist/sw.js", "utf8");
  const precache = JSON.parse(sw.match(/const ASSETS_TO_CACHE = (\[[\s\S]*?\]);/)[1]);
  const worker = readFileSync(ROOT + "dist/js/app/seance.js", "utf8").match(/new Worker\("([^"]+)"\)/)[1];
  assert.ok(revOf(worker), "seance.js starts the worker by its stamped address");
  assert.ok(precache.includes(worker), "the worker is precached under the address seance.js requests");
  const parser = readFileSync(ROOT + "dist/js/core/gpx-worker.js", "utf8").match(/importScripts\('([^']+)'\)/)[1];
  assert.ok(precache.includes(parser), "what the worker imports is precached under the address it requests");
  for (const url of precache) {
    const path = url.split("?")[0];
    const file = path === "/" ? "index.html" : path.includes(".") ? path.slice(1) : `${path.slice(1)}.html`;
    assert.ok(existsSync(ROOT + "dist/" + file), `precache entry ${url} resolves to dist/${file}`);
    if (revOf(url)) assert.equal(revOf(url), digest(path), `precache entry ${url} names the current bytes of ${path}`);
  }
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
