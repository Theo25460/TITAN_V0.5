import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../src/core/web/manifest.json";

test("vendored website modules are unchanged copies (re-sync with scripts/sync-web-core.mjs)", () => {
  for (const [name, hash] of Object.entries(manifest.files)) {
    const source = readFileSync(join(__dirname, "../src/core/web", name), "utf8");
    expect([name, createHash("sha256").update(source).digest("hex")]).toEqual([name, hash]);
  }
  expect(manifest.sha).toMatch(/^[0-9a-f]{40}$/);
});
