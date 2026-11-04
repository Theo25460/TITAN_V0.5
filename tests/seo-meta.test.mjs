// SEO04 / SEO05 / SEO06 / SEO07: every public page carries its own title, description, canonical, share metadata and
// structured data, consistent with the sitemap; robots.txt points to the sitemap and blocks nothing public.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;
const sitemap = readFileSync(`${root}sitemap.xml`, "utf8");
const entries = [...sitemap.matchAll(/<loc>(https?:\/\/[^/]+)([^<]*)<\/loc>/g)].map((m) => ({ origin: m[1], path: m[2] || "/" }));
const file = (path) => (path === "/" ? "index.html" : `${path.replace(/^\//, "")}.html`);
const read = (path) => readFileSync(`${root}${file(path)}`, "utf8");
const attr = (html, re) => (html.match(re) || [])[1];
const meta = (html, key) => attr(html, new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']*)["']`, "i"))
  ?? attr(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${key}["']`, "i"));

test("each public page has a distinct title, description and a canonical equal to its sitemap URL", () => {
  const titles = new Map();
  const descriptions = new Map();
  for (const { origin, path } of entries) {
    const html = read(path);
    const title = attr(html, /<title>([^<]*)<\/title>/i);
    const description = meta(html, "description");
    const canonical = attr(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
    assert.ok(title && title.length >= 10 && title.length <= 80, `${path}: title (${title?.length})`);
    assert.ok(description && description.length >= 50 && description.length <= 200, `${path}: description (${description?.length})`);
    assert.equal(canonical, `${origin}${path === "/" ? "/" : path}`, `${path}: canonical`);
    assert.ok(!titles.has(title), `${path}: same title as ${titles.get(title)}`);
    assert.ok(!descriptions.has(description), `${path}: same description as ${descriptions.get(description)}`);
    titles.set(title, path);
    descriptions.set(description, path);
  }
});

test("each public page has Open Graph metadata pointing to a real image and to itself", () => {
  for (const { origin, path } of entries) {
    const html = read(path);
    for (const key of ["og:title", "og:description", "og:image", "og:url", "twitter:card"]) {
      assert.ok(meta(html, key), `${path}: ${key}`);
    }
    assert.equal(meta(html, "og:url"), `${origin}${path === "/" ? "/" : path}`, `${path}: og:url`);
    const image = meta(html, "og:image");
    assert.ok(image.startsWith(origin), `${path}: og:image on the product domain`);
    assert.ok(readFileSync(`${root}${image.slice(origin.length).replace(/^\//, "")}`), `${path}: og:image file exists`);
  }
});

test("structured data parses and robots.txt serves the sitemap without blocking public pages", () => {
  for (const { path } of entries) {
    const html = read(path);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const data = JSON.parse(m[1]);
      assert.ok(data["@context"] || Array.isArray(data) || data["@graph"], `${path}: JSON-LD has a context`);
    }
  }
  const robots = readFileSync(`${root}robots.txt`, "utf8");
  assert.match(robots, /^Sitemap:\s*https?:\/\/[^\s]+\/sitemap\.xml/m);
  for (const { path } of entries) {
    for (const rule of robots.matchAll(/^Disallow:\s*(\S+)/gm)) {
      if (/[*$]/.test(rule[1])) continue; // file-type patterns (/*.sql$) never match a page route
      assert.ok(!(rule[1] === "/" || path.startsWith(rule[1])), `${path} is blocked by robots.txt (${rule[1]})`);
    }
  }
});

test("the homepage declares the organisation, the website and the application", () => {
  const types = new Set();
  for (const m of read("/").matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const data = JSON.parse(m[1]);
    for (const node of data["@graph"] || [data]) types.add(node["@type"]);
  }
  assert.ok(types.has("Organization"), "Organization structured data on the homepage");
  assert.ok(types.has("WebSite") || types.has("WebPage"), "a WebSite or WebPage entity on the homepage");
  assert.ok(types.has("WebApplication") || types.has("SoftwareApplication"), "an application entity on the homepage");
});

test("favicon, touch icon and the PWA manifest icons exist at usable resolutions", () => {
  const manifest = JSON.parse(readFileSync(`${root}manifest.json`, "utf8"));
  const sizes = new Set();
  for (const icon of manifest.icons || []) {
    assert.ok(readFileSync(`${root}${String(icon.src).replace(/^\//, "").split("?")[0]}`), `manifest icon ${icon.src} exists`);
    for (const size of String(icon.sizes || "").split(/\s+/)) sizes.add(size);
  }
  assert.ok(sizes.has("192x192") && sizes.has("512x512"), `manifest icons 192 and 512 (${[...sizes]})`);
  assert.ok((manifest.icons || []).some((i) => /maskable/.test(i.purpose || "")), "a maskable icon");
  for (const path of ["favicon.ico", "image/apple-touch-icon.png"]) assert.ok(readFileSync(`${root}${path}`).length > 500, `${path} exists`);
  assert.match(read("/"), /rel="apple-touch-icon"/);
  assert.match(read("/"), /rel="icon"/);
});
