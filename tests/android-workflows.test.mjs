// AND03: both Android workflows are manual, pin the same toolchain, and keep real secrets out of the trial build.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;
const release = readFileSync(`${root}.github/workflows/android-twa.yml`, "utf8");
const trial = readFileSync(`${root}.github/workflows/android-twa-debug.yml`, "utf8");

test("both workflows are manual only, least-privilege, with a time limit", () => {
  for (const [name, text] of [["release", release], ["trial", trial]]) {
    assert.match(text, /^on:\s*\n\s+workflow_dispatch:/m, `${name}: manual trigger`);
    assert.doesNotMatch(text, /^\s+(push|pull_request|schedule):/m, `${name}: no automatic trigger`);
    assert.match(text, /permissions:\s*\n\s+contents: read/, `${name}: read-only token`);
    assert.match(text, /timeout-minutes:\s*\d+/, `${name}: timeout`);
  }
});

test("the same pinned toolchain builds the trial and the release bundle", () => {
  const pin = (text, re) => (text.match(re) || [])[1];
  assert.ok(pin(release, /@bubblewrap\/cli@(\d+\.\d+\.\d+)/), "Bubblewrap is pinned to an exact version");
  assert.equal(pin(trial, /@bubblewrap\/cli@(\d+\.\d+\.\d+)/), pin(release, /@bubblewrap\/cli@(\d+\.\d+\.\d+)/));
  assert.equal(pin(trial, /java-version:\s*(\d+)/), pin(release, /java-version:\s*(\d+)/));
  assert.equal(pin(trial, /node-version:\s*(\d+)/), pin(release, /node-version:\s*(\d+)/));
});

test("the release workflow needs the upload key secrets and the trial build uses none", () => {
  for (const secret of ["ANDROID_KEYSTORE_BASE64", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_PASSWORD"]) {
    assert.match(release, new RegExp(`secrets\\.${secret}`), `release uses ${secret}`);
    assert.doesNotMatch(trial, new RegExp(secret), `trial never references ${secret}`);
  }
  assert.doesNotMatch(trial, /\$\{\{\s*secrets\./, "trial uses no repository secret");
  assert.match(trial, /NE-PAS-PUBLIER/, "the trial artifact says it must not be published");
  assert.match(trial, /keytool -genkeypair/, "the trial key is generated on the runner");
});
