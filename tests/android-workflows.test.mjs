// AND03: both Android workflows are manual, pin the same toolchain, and keep real secrets out of the trial build.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;
const release = readFileSync(`${root}.github/workflows/android-twa.yml`, "utf8");
const trial = readFileSync(`${root}.github/workflows/android-twa-debug.yml`, "utf8");

test("the release workflow is manual only; both are least-privilege with a time limit", () => {
  for (const [name, text] of [["release", release], ["trial", trial]]) {
    assert.match(text, /^on:\s*(?:#[^\n]*)?\n(?:\s*#[^\n]*\n)*\s+workflow_dispatch:/m, `${name}: manual trigger`);
    assert.doesNotMatch(text, /^\s+(push|schedule|pull_request_target):/m, `${name}: no push, schedule or privileged pull-request trigger`);
    assert.match(text, /^permissions:\s*\n(?:\s+[a-z-]+: (?:read|none)\n)*\s+contents: read/m, `${name}: read-only token`);
    assert.doesNotMatch(text, /^\s+[a-z-]+: write\s*$/m, `${name}: no write permission`);
    assert.match(text, /timeout-minutes:\s*\d+/, `${name}: timeout`);
  }
});

test("only the secret-free trial may run on pull requests, and only for Android changes", () => {
  assert.doesNotMatch(release, /^\s+pull_request:/m, "the release workflow never runs on a pull request");
  assert.match(trial, /^\s+pull_request:\s*\n\s+paths:/m, "the trial is limited to Android paths");
});

test("the same pinned toolchain builds the trial and the release bundle", () => {
  const pin = (text, re) => (text.match(re) || [])[1];
  assert.match(release, /java-version:\s*17\b/, "Java 17");
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
  assert.match(trial, /openssl rand -hex/, "its password is drawn at random for each run, not written in the file");
  assert.match(trial, /::add-mask::/, "and masked in the logs");
});

test("an icon that is not published yet is served from the checkout, in the trial and in the release workflow (404 on the maskable icon broke the first real build)", () => {
  for (const [name, text] of [["release", release], ["trial", trial]]) {
    assert.match(text, /python3 -m http\.server 8765 --bind 127\.0\.0\.1/, `${name}: local icon server`);
    assert.match(text, /m\.\$key='http:\/\/127\.0\.0\.1:8765\/\$file'/, `${name}: icon URL rewritten to the local copy`);
    assert.ok(!text.includes("m.$key='https://titan-app.fr/image/logo-512.png'"), `${name}: no silent fallback to the wrong icon`);
  }
});

test("Play Billing is enabled in the Android bundle and verified before the file is offered for download (issue #112, decision 21/10/2026)", () => {
  const manifest = JSON.parse(readFileSync(`${root}android/twa-manifest.json`, "utf8"));
  assert.equal(manifest.features?.playBilling?.enabled, true, "native Play Billing in the TWA project");
  assert.equal(manifest.alphaDependencies?.enabled, true, "Bubblewrap needs the alpha dependencies for it");
  for (const [name, text] of [["release", release], ["trial", trial]]) {
    assert.match(text, /com\.android\.vending\.BILLING/, `${name}: the billing permission is expected`);
    assert.match(text, /grep -q "com\.android\.vending\.BILLING" permissions\.txt/, `${name}: and required`);
    assert.match(text, /grep -q "com\/android\/billingclient"/, `${name}: the billing library is looked for in the bundle`);
  }
  // Purchases themselves stay off in the application until the validation of issue #112.
  assert.match(readFileSync(`${root}js/config.js`, "utf8"), /window\.TITAN_PLAY_BILLING = \{\s*enabled: false/);
});
