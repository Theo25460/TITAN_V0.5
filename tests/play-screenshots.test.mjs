// GP03: the Google Play visuals in docs/play-store/ exist and respect the Play Console limits (no browser needed).
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const DIR = new URL("../docs/play-store/", import.meta.url).pathname;
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BYTES = 8 * 1024 * 1024;

function ihdr(file) {
  const buf = readFileSync(DIR + file);
  assert.ok(buf.subarray(0, 8).equals(SIGNATURE), `${file} is not a PNG`);
  assert.equal(buf.toString("ascii", 12, 16), "IHDR", `${file}: IHDR must be the first chunk`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), depth: buf[24], colorType: buf[25] };
}

const phones = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^phone-\d{2}-.+\.png$/.test(f)).sort() : [];

test("between 2 and 8 phone screenshots", () => {
  assert.ok(phones.length >= 2 && phones.length <= 8, `found ${phones.length} phone screenshots`);
});

test("every phone screenshot is a 1080x1920 PNG", () => {
  for (const file of phones) {
    const h = ihdr(file);
    assert.deepEqual([h.width, h.height], [1080, 1920], file);
  }
});

test("the feature graphic is a 1024x500, 8-bit RGB PNG without alpha", () => {
  const file = "feature-graphic-1024x500.png";
  assert.ok(existsSync(DIR + file), `${file} is missing`);
  const h = ihdr(file);
  assert.deepEqual([h.width, h.height], [1024, 500]);
  assert.equal(h.depth, 8);
  assert.equal(h.colorType, 2, "colour type 2 = RGB, no alpha");
});

test("the README exists and every file stays under 8 MB", () => {
  assert.ok(existsSync(DIR + "README.md"), "docs/play-store/README.md is missing");
  for (const file of readdirSync(DIR)) assert.ok(statSync(DIR + file).size <= MAX_BYTES, `${file} exceeds 8 MB`);
});
