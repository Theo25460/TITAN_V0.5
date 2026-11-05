// EQ-018: a CSS variable that is used but never defined silently falls back to nothing (a colour that is not there).
// Every var(--x) without a fallback must be defined somewhere in the stylesheets, or be set at run time by a known script.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const css = readdirSync(new URL("../css/", import.meta.url)).filter((f) => f.endsWith(".css"));
const sources = css.map((f) => [f, readFileSync(new URL(`../css/${f}`, import.meta.url), "utf8")]);
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === "vendor" ? [] : walk(p)) : p.endsWith(".js") ? [p] : []; });
// Scripts set some variables at run time (style="--h:40%", style.setProperty("--toast-color", …)): those count as defined.
const js = walk(new URL("../js/", import.meta.url).pathname).map((f) => readFileSync(f, "utf8")).join("\n");
const inline = [...readdirSync(new URL("../", import.meta.url)).filter((f) => f.endsWith(".html"))].map((f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8")).join("\n");

const defined = new Set();
for (const [, text] of sources) for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1]);
for (const m of (js + inline).matchAll(/(--[a-z0-9-]+)\s*[:"',]/gi)) defined.add(m[1]);
for (const m of js.matchAll(/setProperty\(\s*["'`](--[a-z0-9-]+)/g)) defined.add(m[1]);

test("every CSS variable used without a fallback is defined", () => {
  const missing = [];
  for (const [file, text] of sources) {
    for (const m of text.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)) if (!defined.has(m[1])) missing.push(`${file}: ${m[1]}`);
  }
  assert.deepEqual([...new Set(missing)], []);
});

test("the amber token is --am (EQ-018): the favourite star can never lose its colour again", () => {
  const app = readFileSync(new URL("../css/ascension-app.css", import.meta.url), "utf8");
  assert.doesNotMatch(app, /var\(--amber\)/);
  assert.match(app, /\.sn-favorite\[aria-pressed="true"\]\s*\{\s*color:\s*var\(--am\)/);
});
