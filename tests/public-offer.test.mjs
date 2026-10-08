// Exercise the real public generator in an isolated output directory.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = mkdtempSync(join(tmpdir(), "titan-public-offer-"));
after(() => rmSync(output, { recursive: true, force: true }));
symlinkSync(join(root, "js"), join(output, "js"), "dir");
execFileSync(process.execPath, [join(root, "tools/build-public-site.mjs")], { cwd: output });
const generated = (name) => readFileSync(join(output, name), "utf8");

test("regeneration preserves the permanent inventory policy in visible and structured answers", () => {
  const html = generated("tarifs.html");
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])["@graph"];
  const faq = graph.find((x) => x["@type"] === "FAQPage");
  const expiry = faq.mainEntity.find((x) => /fin de TITAN\+/.test(x.name)).acceptedAnswer.text;
  assert.match(expiry, /pièces acquises avec tes crédits restent à toi/);
  assert.match(expiry, /seul l’accès temporaire aux pièces non acquises prend fin/);
  assert.ok(html.includes(`<p>${expiry}</p>`), "visible FAQ and structured FAQ agree");
  assert.doesNotMatch(expiry, /pièces TITAN\+ reviennent au style d’origine/);
});

test("both generated offers explain temporary access and free acquisition", () => {
  for (const name of ["index.html", "tarifs.html"]) {
    const html = generated(name);
    assert.ok(/Accès temporaire à Aegis, Givre, Aurores et Obsidienne, aussi gagnables gratuitement avec les crédits d’activité/.test(html), `${name}: explain the free acquisition path`);
    assert.ok(!/4 pièces de collection TITAN\+/.test(html), `${name}: no exclusive collection promise`);
  }
});

test("committed landing and prices are reproducible from the offer generator", () => {
  for (const name of ["index.html", "tarifs.html"]) {
    assert.ok(generated(name) === readFileSync(join(root, name), "utf8"), `${name}: regenerate after editing the source`);
  }
});
