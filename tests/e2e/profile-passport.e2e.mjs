import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, base;

before(async () => {
  const port = await new Promise(resolve => {
    const probe = createServer();
    probe.listen(0, () => { const port = probe.address().port; probe.close(() => resolve(port)); });
  });
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/local-static-server.mjs"], {
    cwd: ROOT, stdio: "ignore", env: { ...process.env, PORT: String(port) },
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base + "/profile")).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

for (const width of [320, 360, 1280]) {
  test(`passport personalization, disclosure and reflow at ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const group = key => page.locator(`[data-profile-group="${key}"]`);
    const metrics = page.locator("[data-profile-metric]");
    try {
      await page.goto(base + "/profile");
      await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
      await metrics.first().waitFor();
      assert.equal(await page.locator("[data-profile-group]").count(), 4);
      assert.equal(await page.locator("[data-profile-group][open]").count(), 0);
      assert.equal(await metrics.count(), 3);
      assert.equal(await page.locator(".pf-crest svg").isVisible(), true);
      assert.equal(await page.getByRole("link", { name: /Mon parcours sportif/ }).getAttribute("href"), "/stats");

      if (process.env.TITAN_QA_SCREENSHOTS) {
        await mkdir("artifacts/v13", { recursive: true });
        await page.screenshot({ path: `artifacts/v13/profile-web-${width}.png`, fullPage: true });
      }
      await page.getByRole("link", { name: "Personnaliser" }).click();
      assert.equal(await group("identity").getAttribute("open"), "");
      await page.locator('[data-profile-metric-slot="0"]').selectOption("favorite");
      await page.locator('[data-profile-metric="favorite"]').waitFor();
      assert.equal(await metrics.count(), 3);
      await page.reload();
      await page.locator('[data-profile-metric="favorite"]').waitFor();

      await page.evaluate(() => { location.hash = "sources"; });
      await page.locator("#sources").waitFor();
      assert.equal(await group("account").getAttribute("open"), "");
      await group("sport").locator("summary").click();
      await page.locator('[data-cadence="3"]').focus();
      await page.keyboard.press("ArrowRight");
      await page.locator('[data-cadence="4"][aria-checked="true"]').waitFor();

      const longName = "UnNomDeCompteTrèsLongSansEspace";
      await page.evaluate(async name => {
        document.documentElement.style.fontSize = "200%";
        const owner = "00000000-0000-4000-8000-000000000333";
        window.state.user.id = owner;
        window.state.user.name = name;
        const snapshot = { ...window.TitanAdventure.snapshot, owner, local: false };
        window.TitanAdventure = { status: "ready", snapshot, refresh: async () => snapshot };
        window.dispatchEvent(new Event("titan:history-updated"));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, longName);
      await page.getByRole("heading", { name: longName }).waitFor();
      assert.deepEqual(await metrics.evaluateAll(elements => elements.map(element => element.dataset.profileMetric)),
        ["sessions", "time", "weeks"], "a second account uses its own metric selection");
      for (const key of ["identity", "sport", "account", "preferences"]) {
        if (await group(key).getAttribute("open") === null) await group(key).locator("summary").click();
      }
      const geometry = await page.evaluate(() => ({
        width: innerWidth,
        content: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll("#profil *")]
          .filter(element => element.getBoundingClientRect().right > innerWidth + 1)
          .map(element => element.className?.baseVal || element.className).slice(0, 10),
      }));
      assert.ok(geometry.content <= geometry.width, JSON.stringify(geometry));
      assert.equal(await page.locator(".pf-crest svg").isVisible(), true);
      const targets = await page.locator("[data-profile-group] > summary, [data-profile-personalize], .pf-sport-passport")
        .evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
      assert.equal(targets.length, 6);
      assert.ok(targets.every(height => height >= 44), String(targets));
      if (process.env.TITAN_QA_SCREENSHOTS) {
        await page.screenshot({ path: `artifacts/v13/profile-web-${width}-text200.png`, fullPage: true });
      }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
}
