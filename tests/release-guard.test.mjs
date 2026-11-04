import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const guard = () => spawnSync(process.execPath, ["tools/check-release-guard.mjs"], { cwd: root, encoding: "utf8" });

function sandbox(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "titan-guard-"));
  for (const p of ["tools/check-release-guard.mjs", "netlify", "functions", "netlify.toml", "js/app/auth.js", "js/vendor/supabase-2.111.0.js", "login.html", "index.html", "profile.html"]) {
    cpSync(join(root, p), join(dir, p), { recursive: true });
  }
  mutate(dir);
  const r = spawnSync(process.execPath, ["tools/check-release-guard.mjs"], { cwd: dir, encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  return r;
}

test("the repository passes its own release guard", () => {
  const r = guard();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /6 fonctions/);
});

test("the Netlify build runs the guard before anything else, so an incomplete branch can never replace the live site", () => {
  const toml = readFileSync(join(root, "netlify.toml"), "utf8");
  assert.match(toml, /command = "node tools\/check-release-guard\.mjs && node tools\/build-public\.mjs"/);
});

test("the guard refuses a build where the Google button disappears", () => {
  const r = sandbox((d) => writeFileSync(join(d, "js/app/auth.js"), readFileSync(join(d, "js/app/auth.js"), "utf8").replaceAll("Continuer avec Google", "")));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /bouton « Continuer avec Google » a disparu/);
});

test("the guard refuses a build where the auth.google flag or the OAuth call disappears", () => {
  const r = sandbox((d) => writeFileSync(join(d, "js/app/auth.js"), readFileSync(join(d, "js/app/auth.js"), "utf8").replaceAll('"auth.google"', '"x"').replace(/signInWithOAuth/g, "signInX")));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /drapeau auth\.google/);
  assert.match(r.stderr, /appel OAuth Google/);
});

test("the guard refuses a build that ships a single function, like the 4 November deploy", () => {
  const r = sandbox((d) => { for (const n of ["assistance", "garmin", "play-billing", "play-notifications", "play-reconcile"]) rmSync(join(d, `netlify/functions/${n}.mts`)); });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /fonction manquante : netlify\/functions\/garmin\.mts/);
  assert.match(r.stderr, /play-billing\.mts/);
});

test("the guard refuses a missing implementation behind a function entry", () => {
  const r = sandbox((d) => rmSync(join(d, "functions/garmin.mjs")));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /implémentation de garmin est introuvable/);
});

test("the guard refuses a page that loads config.js before the Supabase SDK, or no SDK at all", () => {
  const swapped = sandbox((d) => {
    const html = readFileSync(join(d, "login.html"), "utf8");
    writeFileSync(join(d, "login.html"), html.replace('    <script src="/js/vendor/supabase-2.111.0.js"></script>\n', "").replace("</body>", '    <script src="/js/vendor/supabase-2.111.0.js"></script>\n  </body>'));
  });
  assert.equal(swapped.status, 1);
  assert.match(swapped.stderr, /login\.html : le SDK Supabase doit être chargé avant js\/config\.js/);
  const missing = sandbox((d) => rmSync(join(d, "js/vendor/supabase-2.111.0.js")));
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /SDK Supabase .* est absent/);
});

test("every page that creates the Supabase client loads the SDK first (login page included)", () => {
  const login = readFileSync(join(root, "login.html"), "utf8");
  assert.ok(login.indexOf("/js/vendor/supabase-") < login.indexOf("/js/config.js"));
});
