// Real goals screen with synthetic account reads and an intercepted table-write boundary.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise(resolve => {
    const probe = createServer();
    probe.listen(0, () => { const port = probe.address().port; probe.close(() => resolve(port)); });
  });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(BASE + "/")).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, "local goals server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}


const A = '00000000-0000-4000-8000-000000000941';
for (const width of [360, 1280]) for (const change of ['client', 'epoch', 'round-trip']) {
  test(`real goals cache: ${change} late response and offline return at ${width}`, async () => {
    const {page, context} = await newPage(width);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.route('**/js/app/objectifs.js?*', route => route.fulfill({contentType:'text/javascript', body:''}));
      await page.goto(BASE + '/objectifs');
      await page.waitForFunction(() => window.TitanAdventure?.status === 'ready');
      await page.evaluate(A => {
        window.state.user.id = A;
        window.state.history = [];
        window.titanAccountTransition = {epoch: 10, active: false};
        window.goalJobs = [];
        window.goalClient = () => ({from: table => {
          if (table !== 'sport_goals') throw Error('Unexpected table');
          const q = {select:()=>q, eq:()=>q, order:()=>q, limit:()=>new Promise(resolve => window.goalJobs.push(resolve))};
          return q;
        }});
        window.titanClient = window.goalClient();
        window.goalRow = title => ({id:'00000000-0000-4000-8000-000000000951', user_id:A, title,
          metric:'sessions', target:12, sport:null, start_date:'2026-01-01', end_date:'2027-01-01', revision:1});
      }, A);
      await page.addScriptTag({path:ROOT + '/js/app/objectifs.js'});
      await page.waitForFunction(() => window.goalJobs.length === 1);
      await page.evaluate(change => {
        if (change === 'client') window.titanClient = window.goalClient();
        if (change === 'epoch') window.titanAccountTransition.epoch++;
        if (change === 'round-trip') {
          for (const id of ['00000000-0000-4000-8000-000000000942', window.state.user.id]) {
            window.titanAccountTransition = {epoch:window.titanAccountTransition.epoch + 1, active:true};
            window.dispatchEvent(new Event('titan:account-changing'));
            window.state.user.id = id;
            window.titanAccountTransition.active = false;
            window.dispatchEvent(new Event('titan:account-changed'));
          }
        }
        window.dispatchEvent(new Event('titan:history-updated'));
      }, change);
      await page.waitForFunction(() => window.goalJobs.length === 2);
      await page.evaluate(() => window.goalJobs[1]({data:[window.goalRow('Objectif récent')]}));
      await page.getByRole('heading', {name:'Objectif récent', exact:true}).waitFor();
      await page.evaluate(async () => {
        window.goalJobs[0]({data:[window.goalRow('Objectif obsolète')]});
        await new Promise(resolve => setTimeout(resolve, 20));
      });
      assert.deepEqual(await page.evaluate(A => JSON.parse(localStorage.getItem('titan_goals_v1:' + A)).map(g => g.title), A), ['Objectif récent']);
      assert.deepEqual(await page.evaluate(async () => (await window.TitanData.goals()).map(g => g.title)), ['Objectif récent']);
      await context.setOffline(true);
      await page.evaluate(() => {
        window.titanAccountTransition.epoch++;
        window.dispatchEvent(new Event('titan:account-changing'));
        window.dispatchEvent(new Event('titan:account-changed'));
      });
      await page.getByRole('heading', {name:'Objectif récent', exact:true}).waitFor();
      assert.doesNotMatch(await page.locator('#objectifs').textContent(), /Objectif obsolète/);
      assert.deepEqual(errors, []);
    } finally {await context.close();}
  });
}
