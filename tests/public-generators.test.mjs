// The public pages are generated (tools/build-public-site.mjs and tools/build-public-docs.mjs). A page edited by hand without its
// source drifts: the next rebuild silently reverts it (this happened to /service, whose help centre the generator no longer knew).
// Both generators run in a scratch copy of their inputs and every page they write must equal the committed one, byte for byte.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;

test("regenerating the public pages changes nothing in the repository", () => {
  const dir = mkdtempSync(join(tmpdir(), "titan-public-"));
  try {
    for (const input of ["js", "tools"]) cpSync(join(ROOT, input), join(dir, input), { recursive: true });
    for (const generator of ["tools/build-public-site.mjs", "tools/build-public-docs.mjs"]) {
      execFileSync(process.execPath, [generator], { cwd: dir, stdio: "pipe" });
    }
    const pages = readdirSync(dir).filter((f) => f.endsWith(".html"));
    assert.ok(pages.length >= 25, `generators wrote ${pages.length} pages`);
    assert.ok(pages.includes("service.html"), "the help centre is generated");
    for (const page of pages) {
      assert.equal(readFileSync(join(dir, page), "utf8"), readFileSync(join(ROOT, page), "utf8"), `${page} differs from its generator: edit the source, then rebuild`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the help centre keeps its support form, categories and scripts", () => {
  const html = readFileSync(join(ROOT, "service.html"), "utf8");
  assert.match(html, /<script src="\/js\/app\/assistance\.js\?v=[\d.]+" defer><\/script>/);
  assert.match(html, /id="help-categories"/);
  assert.match(html, /data-support-category="bug"/);
  assert.match(html, /id="help-form"/);
});
