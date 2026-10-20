// SHOP03: real money never buys coins or XP. The payment webhook only ever touches Premium entitlement; no page or script offers
// a coin pack. (The database side is covered by sql/tests/300_shop_policy.sql.)
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(`${root}${path}`, "utf8");

test("the payment webhook never reads or writes credits, XP or levels", () => {
  for (const file of ["functions/webhook.mjs", "netlify/functions/webhook.mts"]) {
    const text = read(file);
    assert.doesNotMatch(text, /\b(credits|total_xp|level_bonus|titan_apply_progression_reward)\b/i, `${file} touches the in-game currency`);
    assert.doesNotMatch(text, /\bxp\b/i, `${file} touches XP`);
  }
});

test("the Paddle entitlement RPC the webhook calls never touches the in-game currency", () => {
  const sql = read("sql/titan_billing_event_ordering_v87.sql");
  const start = sql.indexOf("create or replace function public.titan_apply_paddle_entitlement_v87");
  const end = sql.indexOf("revoke all on function public.titan_apply_paddle_entitlement_v87");
  assert.ok(start >= 0 && end > start, "the RPC was found");
  assert.doesNotMatch(sql.slice(start, end), /\b(credits|xp|level|titan_apply_progression_reward|shop_history)\b/i);
});

function walk(dir, out = []) {
  for (const name of readdirSync(`${root}${dir}`, { withFileTypes: true })) {
    if (name.name === "vendor" || name.name === "node_modules") continue;
    if (name.isDirectory()) walk(`${dir}/${name.name}`, out);
    else if (/\.(js|mjs|mts)$/.test(name.name)) out.push(`${dir}/${name.name}`);
  }
  return out;
}

test("no page or script offers to buy coins or XP with real money", () => {
  const files = [
    ...readdirSync(root).filter((f) => f.endsWith(".html") && f !== "sys_core_override_99.html"),
    ...walk("js"), ...walk("functions"), ...walk("netlify"),
  ];
  const currency = "(?:cr[ée]dits?|coins?|pi[èe]ces?|xp)";
  const offers = [
    // a purchase verb followed (digits allowed) by the currency, in the text of the page
    new RegExp(`\\b(?:acheter|achetez|achat|packs?|recharge[rz]?|buy|purchase)\\b[^<>\\n"'\`]{0,40}?\\b${currency}\\b`, "gi"),
    // a price in money next to the currency
    new RegExp(`\\b${currency}\\b[^<>\\n]{0,40}(?:€|\\beuros?\\b|\\busd\\b|\\d\\s?\\$)|(?:€|\\beuros?\\b|\\busd\\b)[^<>\\n]{0,40}\\b${currency}\\b`, "gi"),
  ];
  const found = [];
  for (const file of files) {
    for (const pattern of offers) {
      for (const m of read(file).matchAll(pattern)) found.push(`${file}: ${m[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(found, [], "an offer to buy the in-game currency with money");
  // The detector itself must catch the offers a reviewer tried.
  for (const sample of ["Acheter 500 crédits", "Achetez des crédits", "Pack de 500 crédits", "Buy 500 credits", "Obtenir 500 crédits pour 4,99 €", "Recharger tes pièces"]) {
    assert.ok(offers.some((p) => { p.lastIndex = 0; return p.test(sample); }), `detector misses: ${sample}`);
  }
});
