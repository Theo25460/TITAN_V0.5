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

test("no page or script offers to buy coins or XP with real money", () => {
  const files = [
    ...readdirSync(root).filter((f) => f.endsWith(".html") && f !== "sys_core_override_99.html"),
    ...["js", "js/app", "js/core"].flatMap((dir) => readdirSync(`${root}${dir}`).filter((f) => f.endsWith(".js")).map((f) => `${dir}/${f}`)),
  ];
  const offers = [];
  for (const file of files) {
    for (const m of read(file).matchAll(/\b(acheter|achat de|pack de|recharge[rz]?)[a-zéèêàùç' ]{0,40}\b(cr[ée]dits|coins|pi[èe]ces|xp)\b|\b(buy|purchase)[a-z ]{0,30}\b(credits|coins|xp)\b/gi)) {
      offers.push(`${file}: ${m[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(offers, [], "an offer to buy the in-game currency with money");
});
