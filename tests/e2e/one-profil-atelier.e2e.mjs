// TITAN ONE « Signature », lot « Profil, Atelier 2.0 et abonnements » — what the recomposition must keep true, on the real pages, as a
// signed-in established account under the production flags (the same fixture as real-account.e2e.mjs: it plays the server inside the
// page, nothing is written anywhere). The purchase itself is refused by that fixture (it has no purchase function), which is exactly the
// failure the confirmation must survive; the second attempt is answered by a stand-in that only returns what the server would.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { buildConnectedData, connectedScript } from "../../tools/visual/fixture-connected.mjs";

const ROOT = new URL("../..", import.meta.url).pathname;
const FLAGS = JSON.parse(readFileSync(ROOT + "tools/visual/flags-production.json", "utf8"));
let server, browser, BASE;
before(async () => {
  const port = await new Promise(resolve => { const probe = createServer(); probe.listen(0, () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) { try { ready = (await fetch(BASE + "/")).ok; } catch {} if (!ready) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(ready);
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

async function open(path, { width = 390, connected = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, locale: "fr-FR", timezoneId: "Europe/Paris", serviceWorkers: "block", reducedMotion: "reduce" });
  const host = new URL(BASE).host;
  await context.route(url => url.host !== host, route => /\/rpc\/titan_feature_flags_v1$/.test(new URL(route.request().url()).pathname)
    ? route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ flags: FLAGS.flags, version: FLAGS.version }) })
    : route.abort("internetdisconnected"));
  if (connected) {
    const script = connectedScript(buildConnectedData());
    await context.route(url => url.host === host && /\/js\/config\.js$/.test(url.pathname), async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()) + script }); });
  }
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + path, { waitUntil: "load" });
  if (connected) await page.waitForFunction(() => window.state?.user && window.titanFlags?.enabled("screens.activityhub"), null, { timeout: 10000 });
  return { page, context, errors };
}
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const look = page => page.evaluate(() => JSON.stringify(window.state.user.appearance || {}));

for (const width of [320, 390, 1440]) {
  test(`Atelier at ${width} px: the reserve, collections by real condition, a state in words on every plate, « essayer » that saves nothing`, async () => {
    const { page, context, errors } = await open("/boutique", { width });
    try {
      await page.locator("#collection .at-item").first().waitFor();
      // The reserve: the object, the balance the server gave, this week's earning against the cap.
      assert.equal(await page.locator(".at-reserve .sig-object img").evaluate(img => img.complete && img.naturalWidth > 0), true, "the chest is drawn");
      assert.match((await page.locator(".at-balance").innerText()).trim(), /^\d[\d\s  ]*$/);
      assert.equal(await page.locator('.at-week [role="progressbar"]').getAttribute("aria-valuemax"), "960");
      assert.match(await page.locator(".at-sources").innerText(), /D’où viennent tes crédits/);
      assert.match(await page.locator(".at-reserve").innerText(), /Elle ne s’achète pas/);
      // Collections are named after the real way a piece is obtained, in the order of the server's conditions.
      assert.deepEqual(await page.locator("#collection [data-group]").evaluateAll(els => els.map(el => el.dataset.group)), ["default", "credits", "rank", "plus"]);
      const plates = await page.locator("#collection .at-item").evaluateAll(els => els.map(el => ({ state: el.dataset.state, word: el.querySelector(".sig-state")?.textContent.trim() || "", unlock: el.dataset.unlock, bar: !!el.querySelector('[role="progressbar"]'), path: el.querySelector(".at-path")?.textContent || "" })));
      assert.equal(plates.length, 12, "the twelve frames of the catalogue, none added, none hidden");
      assert.ok(plates.every(p => p.word.length > 2), "every plate says its state in words");
      assert.deepEqual(plates.filter(p => p.state === "worn").map(p => p.word), ["Porté"]);
      assert.ok(plates.filter(p => p.state === "owned").every(p => p.word === "Acquis"));
      for (const p of plates.filter(p => p.state === "locked" && p.unlock === "rank")) {
        assert.match(p.word, /^Niveau \d+$/);
        assert.ok(p.bar && /encore \d+ niveaux?/.test(p.path), "a locked rank piece shows the real way to it");
      }
      assert.ok(plates.filter(p => p.state === "locked" && p.unlock === "credits").every(p => /crédits$/.test(p.word)), "a locked credit piece shows its price");
      assert.equal(await page.locator("#collection .at-action .asc-btn").evaluateAll(els => els.every(el => el.getBoundingClientRect().height >= 44)), true, "44 px actions");

      // « Essayer » a frame: on my portrait, nothing acquired, nothing equipped, nothing sent.
      const before = await look(page);
      const tryFrame = page.locator('[data-preview="cos_frame_crimson"]');
      await tryFrame.click();
      const sheet = page.locator("dialog[open]");
      assert.equal(await sheet.locator('[data-frame="frame-crimson"]').count(), 1);
      assert.equal(await sheet.locator("[data-buy], [data-wear], [data-remove]").count(), 0);
      assert.match(await sheet.innerText(), /rien n’est enregistré/i);
      assert.match(await sheet.innerText(), /ne change pas ton style et ne dépense aucun crédit/);
      await sheet.getByRole("button", { name: "Revenir à la collection", exact: true }).click();
      await page.waitForSelector("dialog[open]", { state: "hidden" });
      assert.equal(await tryFrame.evaluate(el => el === document.activeElement), true, "the keyboard is back on the piece");
      assert.equal(await look(page), before);

      // An ambience is tried on each world of the Aventure.
      await page.locator('[data-slot="map"][role="tab"]').click();
      await page.locator('[data-preview="cos_map_night"]').click();
      const src = () => sheet.locator(".at-map img").getAttribute("src");
      const first = await src();
      await sheet.locator("[data-trial-world]").nth(2).click();
      assert.notEqual(await src(), first);
      assert.equal(await sheet.locator('[data-trial-world][aria-pressed="true"]').count(), 1);
      await page.keyboard.press("Escape");
      await page.waitForSelector("dialog[open]", { state: "hidden" });

      // A card style is tried on my own latest record, drawn by the real card renderer.
      await page.locator('[data-slot="card"][role="tab"]').click();
      await page.locator('[data-preview="cos_card_ember"]').click();
      await sheet.locator('canvas[data-card="card-ember"]').waitFor();
      assert.equal(await sheet.locator('[data-card="card-ember"]').count(), 1);
      await page.keyboard.press("Escape");
      await page.waitForSelector("dialog[open]", { state: "hidden" });
      assert.equal(await look(page), before);

      // The confirmation: the piece and the account of the reserve; a refusal is readable and the same button tries again.
      const balance = Number((await page.locator(".at-balance").innerText()).replace(/\D/g, ""));
      await page.locator('[data-buy="cos_card_ember"]').click();
      assert.equal(await sheet.locator(".at-confirm .at-card").count(), 1);
      assert.deepEqual((await sheet.locator(".at-ledger dd").allInnerTexts()).map(t => Number(t.replace(/\D/g, ""))), [balance, 800, balance - 800]);
      const confirm = sheet.getByRole("button", { name: "Débloquer et porter", exact: true });
      await confirm.click();
      await page.waitForFunction(() => document.querySelector("dialog[open] [data-error]")?.textContent.length > 0);
      assert.match(await sheet.locator("[data-error]").innerText(), /Tes crédits sont intacts/);
      assert.equal(await confirm.isEnabled(), true);
      assert.equal(Number((await page.locator(".at-balance").innerText()).replace(/\D/g, "")), balance, "a refused purchase spends nothing");
      await page.evaluate(left => {
        const rpc = window.titanClient.rpc.bind(window.titanClient);
        window.titanClient.rpc = (name, params) => name === "titan_purchase_shop_item" ? { setHeader: async () => ({ data: [{ credits_after: left }], error: null }) }
          : name === "titan_set_appearance" ? { setHeader: async () => ({ data: { ...window.state.user.appearance, [params.p_slot]: "card-ember" }, error: null }) }
          : rpc(name, params);
      }, balance - 800);
      await confirm.click();
      await page.waitForSelector("dialog[open]", { state: "hidden" });
      assert.equal(Number((await page.locator(".at-balance").innerText()).replace(/\D/g, "")), balance - 800);
      const ember = page.locator('[data-piece="cos_card_ember"]');
      assert.equal(await ember.getAttribute("data-state"), "worn");
      assert.match(await ember.innerText(), /Porté[\s\S]*Acquis définitivement/);
      await page.waitForFunction(() => document.activeElement?.closest('[data-piece="cos_card_ember"]'));

      // The next rewards lead to their piece.
      await page.locator("[data-goto-piece]").first().click();
      await page.waitForFunction(() => document.activeElement?.matches("[data-preview]"));
      // What no credit reaches is counted, never sold.
      assert.equal(await page.locator("#merite [data-buy], #merite [data-checkout]").count(), 0);
      assert.ok(await page.locator("#merite .at-merit").count() >= 2);

      if (width >= 1100) {
        await page.locator('[data-slot="frame"][role="tab"]').click();
        await page.locator('[data-piece="cos_frame_legend"] .at-try').hover();
        await page.waitForFunction(() => document.querySelector('[data-look="frame"]')?.dataset.trial === "cos_frame_legend");
        assert.match(await page.locator("[data-look-note]").innerText(), /rien n’est enregistré/);
        await page.mouse.move(4, 4);
        await page.waitForFunction(() => !document.querySelector('[data-look="frame"]')?.dataset.trial);
      }
      assert.ok(await sideways(page) <= 1, `sideways scroll at ${width} px`);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

for (const width of [320, 1440]) {
  test(`Profil at ${width} px: three ways out of the passport, groups one recognises, a drawn switch, the deletion alone`, async () => {
    const { page, context, errors } = await open("/profile", { width });
    try {
      await page.locator(".pf-ways").waitFor();
      assert.equal(await page.locator(".pf-crest.sig-object .crest").isVisible(), true);
      const ways = page.locator(".pf-ways a");
      assert.deepEqual((await ways.allInnerTexts()).map(t => t.trim()), ["Personnaliser", "Atelier", "Carte publique"]);
      assert.equal(await ways.evaluateAll(els => els.every(el => el.getBoundingClientRect().height >= 44)), true);
      assert.equal(await page.locator("[data-profile-atelier]").getAttribute("href"), "/boutique");
      assert.equal(await page.locator("[data-profile-group] > summary .pf-group-icon").count(), 4);
      assert.equal(await page.locator("[data-profile-group][open]").count(), 0);
      // The public card is opened in place.
      await page.locator("[data-profile-card]").click();
      assert.equal(await page.locator('[data-profile-group="identity"]').getAttribute("open"), "");
      await page.waitForFunction(() => { const r = document.getElementById("public")?.getBoundingClientRect(); return r && r.top < innerHeight && r.bottom > 0; });
      // The switch is drawn and still does what it did.
      await page.locator('[data-profile-group="preferences"] > summary').click();
      const motion = page.locator("#profil [data-motion-toggle]");
      const knob = () => motion.evaluate(el => getComputedStyle(el, "::after").transform);
      const off = await knob();
      await motion.click();
      assert.equal(await motion.getAttribute("aria-pressed"), "true");
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-motion")), "reduced");
      assert.notEqual(await knob(), off, "the state is drawn, not only announced");
      await motion.click();
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-motion")), null);
      // The deletion stands alone, after the exports and the privacy switches, and still asks before doing anything.
      await page.locator('[data-profile-group="account"] > summary').click();
      assert.equal(await page.locator(".pf-danger-zone [data-delete]").count(), 1);
      assert.equal(await page.locator(".pf-data [data-delete]").count(), 0);
      assert.equal(await page.evaluate(() => { const order = (a, b) => !!(document.querySelector(a).compareDocumentPosition(document.querySelector(b)) & Node.DOCUMENT_POSITION_FOLLOWING); return order("[data-export-json]", "[data-delete]") && order("[data-analytics]", "[data-delete]"); }), true);
      await page.locator("[data-delete]").click();
      await page.locator('dialog[open] [name="confirm"]').waitFor();
      await page.keyboard.press("Escape");
      assert.ok(await sideways(page) <= 1, `sideways scroll at ${width} px`);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

for (const width of [320, 390, 1440]) {
  test(`TITAN+ at ${width} px: the offers in order, the comparison grouped and readable without sideways scroll`, async () => {
    const { page, context, errors } = await open("/titan-plus", { width, connected: false });
    try {
      await page.locator("#comparer").waitFor();
      // The order of the page: for me (Classique, TITAN+), what never changes, for coaches, then what is open today.
      const tops = await page.evaluate(() => [".tp-plans:not(.is-coach)", ".tp-never", ".tp-plans.is-coach", ".tp-avail", "#concret", "#comparer"].map(s => document.querySelector(s).getBoundingClientRect().top));
      assert.deepEqual(tops, [...tops].sort((a, b) => a - b));
      assert.deepEqual(await page.locator(".tp-plans .pub-card .pub-eyebrow").allInnerTexts().then(list => list.map(t => t.trim().toUpperCase())), ["CLASSIQUE", "TITAN+", "COACH", "COACH ULTRA"]);
      assert.match(await page.locator('.tp-avail [data-availability="planned"]').innerText(), /bientôt disponible/);
      assert.match(await page.locator(".tp-never").innerText(), /Pas d’XP en plus, pas de crédits en plus, pas de plafond relevé/);
      // The table: what a subscription adds first, then what stays identical; three offers per line.
      const groups = await page.locator("#comparer tbody").evaluateAll(els => els.map(el => ({ title: el.querySelector(".tp-group").textContent.trim(), rows: el.querySelectorAll("tr:not(.tp-group)").length })));
      assert.deepEqual(groups, [{ title: "Ce qu’un abonnement ajoute", rows: 8 }, { title: "Ce qui reste identique, avec ou sans abonnement", rows: 9 }]);
      assert.equal(await page.locator("#comparer tbody.is-same tr:not(.tp-group)").evaluateAll(rows => rows.every(r => new Set([...r.querySelectorAll("td")].map(td => td.textContent)).size === 1)), true, "« identique » holds on every line of that group");
      const seats = page.locator("#comparer tr", { hasText: "Sportifs suivis dans l’espace coach" }).locator("td");
      assert.deepEqual(await seats.allInnerTexts().then(list => list.map(t => t.trim())), ["3", "20", "5 avec Coach, 15 avec Coach Ultra"]);
      assert.ok(await sideways(page) <= 1, `sideways scroll at ${width} px`);
      if (width < 760) {
        assert.equal(await page.locator("#comparer .pub-table").evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, "the comparison needs no sideways scroll on a phone");
        assert.equal(await seats.first().evaluate(td => getComputedStyle(td, "::before").content), '"Classique"');
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}
