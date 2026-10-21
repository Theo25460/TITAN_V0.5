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
