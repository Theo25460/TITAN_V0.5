// Founder decision of 21/10/2026: Paddle disabled, no purchase on the web, TITAN+ "Bientôt disponible" until Google Play Billing is validated.
// Nothing public may name Paddle as seller, state a price for TITAN+, or lead to a web checkout.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const pages = readdirSync(root).filter((f) => f.endsWith(".html") && !/^(admin|sys_core_override_99|googleb8fedd43e28cf7d4)\.html$/.test(f));

test("no public page names Paddle as seller or payment processor, or states a TITAN+ price", () => {
  for (const file of pages) {
    const html = readFileSync(new URL(file, root), "utf8");
    const text = html.replace(/<script[\s\S]*?<\/script>/g, (m) => (m.includes("ld+json") ? m : "")); // the sport "Paddle" is a sport, not the vendor
    assert.ok(!/(opérés? par|vendeur officiel|reçu Paddle|par Paddle|via Paddle|Paddle,? vendeur|chez Paddle|relève de Paddle)/i.test(text), `${file} names Paddle as vendor`);
    assert.ok(!/TITAN\+[^<]{0,40}\b[1-9]\d*([,.]\d+)?\s?(€|euros?)|\b[1-9]\d*([,.]\d+)?\s?(€|euros?)\s?(\/|par)\s?mois|"price":"[1-9]/i.test(html), `${file} states a TITAN+ price`);
    assert.ok(!/href="\/boutique#plus"/.test(html), `${file} leads to a web purchase`);
  }
});

test("the web checkout is switched off in the configuration and refused by the code", () => {
  const config = readFileSync(new URL("js/config.js", root), "utf8");
  assert.match(config, /window\.TITAN_PAYMENTS = \{\s*webCheckout: false\s*\}/);
  assert.match(readFileSync(new URL("js/main.js", root), "utf8"), /window\.openEliteCheckout = async function[^\n]*\n[^\n]*\n\s*if \(window\.TITAN_PAYMENTS\?\.webCheckout !== true\) return false;/);
  const atelier = readFileSync(new URL("js/app/atelier.js", root), "utf8");
  const buttons = [...atelier.matchAll(/<button[^>]*data-checkout/g)];
  assert.equal(buttons.length, 1, "one dormant web checkout button remains in the code");
  assert.match(atelier, /window\.TITAN_PAYMENTS\?\.webCheckout === true && !window\.titanInAndroidApp\?\.\(\) \? `<div class="at-plus-cta"><button[^>]*data-checkout/, "and it is only rendered when the switch is on, never in the Android app");
  assert.ok(!/e-mail de reçu Paddle/.test(atelier), "the Atelier names no Paddle receipt");
  assert.match(atelier, /TITAN\+ : bientôt disponible\. Aucun paiement n’est proposé pour le moment/);
});

test("the legal texts describe Google Play, not a web seller", () => {
  const cgu = readFileSync(new URL("legal_cgu.html", root), "utf8");
  assert.match(cgu, /TITAN\+ n’est pas encore en vente/);
  assert.match(cgu, /Aucun paiement n’est accepté sur le site/);
  assert.match(cgu, /quatre campagnes/);
  assert.ok(!/deux campagnes/.test(cgu), "all four campaigns are free");
});

test("TITAN+ has one canonical « Bientôt disponible » page and every old pricing route leads to it", () => {
  const page = readFileSync(new URL("titan-plus.html", root), "utf8");
  assert.match(page, /<title>TITAN\+ — Bientôt disponible/);
  assert.match(page, /<h1>TITAN\+ — Bientôt disponible/);
  assert.match(page, /rel="canonical" href="https:\/\/titan-app\.fr\/titan-plus"/);
  assert.ok(!/<(button|a)[^>]*(checkout|paddle|data-play-checkout)/i.test(page), "no purchase control on the page");
  const toml = readFileSync(new URL("netlify.toml", root), "utf8");
  for (const from of ["/tarifs", "/tarifs.html", "/titan-plus.html"]) {
    assert.match(toml, new RegExp(`from = "${from.replace(".", "\\.")}"\\nto = "/titan-plus"\\nstatus = 301`), `${from} redirects to /titan-plus`);
  }
  const readme = [...pages, "js/app/atelier.js", "js/app/rapports.js", "js/app/analyses.js", "tools/lib/public-template.mjs", "tools/build-public-site.mjs"];
  for (const file of readme) assert.ok(!/["'(=]\/tarifs\b/.test(readFileSync(new URL(file, root), "utf8")), `${file} still links to /tarifs`);
});

test("V1 has no advertising and says nothing false about it (LEG12), and virtual goods are described as having no monetary value (LEG07)", () => {
  const config = readFileSync(new URL("js/config.js", root), "utf8");
  assert.match(config, /adsEnabled:\s*false/);
  const adsTxt = readFileSync(new URL("ads.txt", root), "utf8");
  // 29/10/2026 (owner): the file may carry the single AdSense line of the publisher so that the site can be verified. Declaring a seller shows
  // nothing: ads stay off (adsEnabled false above) and no advertising code ships (checked below). Any other seller line is refused.
  const sellers = adsTxt.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  assert.ok(sellers.every((l) => /^google\.com, pub-\d{10,20}, DIRECT, f08c47fec0942fa0$/.test(l)) && sellers.length <= 1, "ads.txt authorises at most the owner's single AdSense line, nothing else");
  const everything = [...pages.map((f) => readFileSync(new URL(f, root), "utf8")), ...readdirSync(new URL("js/", root), { recursive: true }).filter((f) => String(f).endsWith(".js")).map((f) => readFileSync(new URL(`js/${f}`, root), "utf8"))].join("\n");
  assert.ok(!/(doubleclick|googlesyndication|adservice\.google|pagead2|applovin|admob|ca-pub-\d)/i.test(everything), "no advertising network code or publisher id ships");
  const cgu = readFileSync(new URL("legal_cgu.html", root), "utf8");
  assert.match(cgu, /sans valeur monétaire[\s\S]{0,120}ne s’achètent pas, ne se vendent pas, ne s’échangent pas et ne sont pas remboursables/);
  assert.match(readFileSync(new URL("js/app/atelier.js", root), "utf8"), /Elle ne s’achète pas/);
});

test("V1.1 (V11-10): no public page or app screen still talks about a pending server update, and the four campaigns are never presented as unavailable", () => {
  const sources = [...pages.map((f) => [f, readFileSync(new URL(f, root), "utf8")]),
    ...readdirSync(new URL("js/", root), { recursive: true }).filter((f) => String(f).endsWith(".js") && !String(f).startsWith("vendor")).map((f) => [`js/${f}`, readFileSync(new URL(`js/${f}`, root), "utf8")]),
    ["tools/build-public-site.mjs", readFileSync(new URL("tools/build-public-site.mjs", root), "utf8")]];
  for (const [file, text] of sources) {
    assert.ok(!/(prochaine mise à jour du serveur|mise à jour (du )?serveur|attend la mise à jour|après mise à jour)/i.test(text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")), `${file} still mentions a pending server update`);
  }
  const index = readFileSync(new URL("index.html", root), "utf8");
  assert.ok(!/campagnes complètes et les nouvelles analyses sont en préparation/.test(index));
  assert.match(index, /Quatre mondes/);
});
