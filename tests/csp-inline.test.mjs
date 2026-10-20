// script-src carries no 'unsafe-inline': no shipped page or script may rely on an inline event handler or a javascript: URL.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const EXCLUDED = new Set(["sys_core_override_99.html", "googleb8fedd43e28cf7d4.html"]);
const files = [
  ...readdirSync(ROOT).filter((f) => f.endsWith(".html") && !EXCLUDED.has(f)),
  ...readdirSync(`${ROOT}js`).filter((f) => f.endsWith(".js")).map((f) => `js/${f}`),
  ...["app", "core"].flatMap((dir) => readdirSync(`${ROOT}js/${dir}`).filter((f) => f.endsWith(".js")).map((f) => `js/${dir}/${f}`)),
];
const policy = /Content-Security-Policy\s*=\s*"([^"]+)"/.exec(readFileSync(`${ROOT}netlify.toml`, "utf8"))[1];
const directive = (name) => policy.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) || "";

test("script-src does not allow 'unsafe-inline'", () => {
  assert.doesNotMatch(directive("script-src"), /'unsafe-inline'/);
});

test("no shipped file uses an inline event handler attribute or a javascript: URL", () => {
  const offenders = [];
  for (const file of files) {
    const text = readFileSync(`${ROOT}${file}`, "utf8");
    for (const m of text.matchAll(/\son[a-z]+\s*=\s*["']|setAttribute\(\s*["']on[a-z]+|javascript:/gi)) {
      offenders.push(`${file}: ${m[0].trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("every inline <script> is a non-executed JSON-LD block", () => {
  for (const file of files.filter((f) => f.endsWith(".html"))) {
    for (const m of readFileSync(`${ROOT}${file}`, "utf8").matchAll(/<script(?![^>]*\ssrc=)([^>]*)>/g)) {
      assert.match(m[1], /type="application\/ld\+json"/, `${file} has an executable inline script`);
    }
  }
});
