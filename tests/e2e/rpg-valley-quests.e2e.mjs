// Real QG UI with synthetic account-scoped reads/actions; no live accounts or writes.
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
  assert.ok(ready, "local athlete server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  return { context, page, errors };
}

async function campaignPage(route, campaign, width=360) {
 const f=await newPage(width); const {page}=f; page.setDefaultTimeout(2500);
 await page.goto(BASE+route); await page.waitForFunction(()=>window.TitanAdventure?.status==='ready');
 await page.evaluate(c=>{
  const a=window.TitanAdventure;
  a.snapshot={...a.snapshot,selected_world:'aube',campaigns:[{id:'aube',route:'rhythm',...c}]};
  a.refresh=async()=>{};
  dispatchEvent(new Event('titan:adventure-updated'));
 },campaign);
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 return f;
}
const active={chapter:2,target:2,effort_target:0,started_at:'2026-10-01T12:00:00Z',evidence:{days:1,effort:20,source_ids:['current']}};
test('valley quests: narrative and three optional objectives appear at both widths',async()=>{
 for(const width of [360,1280]){const {page,context,errors}=await campaignPage('/adventure',active,width);try{
 const panel=page.locator('[data-valley-encounter]');await panel.waitFor();assert.match(await panel.textContent(),/pont/);
 const quests=page.locator('[data-rpg-quests]');await quests.locator('summary').click();await page.locator('[data-quest="days"]').waitFor();assert.equal(await page.locator('[data-quest]').count(),3);assert.match(await quests.textContent(),/facultatives/);assert.match(await quests.textContent(),/ni XP ni coins/);assert.equal(await page.locator('[data-claim="2"]').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}}
});
test('valley quests: source annotation updates a quest and refresh retains the opened journal',async()=>{
 const {page,context,errors}=await campaignPage('/adventure',active);try{
 const q=page.locator('[data-rpg-quests]');await q.locator('summary').click();
 await page.evaluate(()=>{window.state.history=[{id:'current',sport:'running',date:'2026-10-02T10:00:00Z',details:{note:'Une bonne séance calme'}}];dispatchEvent(new Event('titan:history-updated'));});
 await page.waitForFunction(()=>document.querySelector('[data-quest="note"]')?.dataset.complete==='true');assert.equal(await q.evaluate(el=>el.open),true);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('valley quests: a foreign owner snapshot never displays personal quests',async()=>{
 const {page,context,errors}=await campaignPage('/adventure',active);try{
 await page.locator('[data-valley-encounter]').waitFor();await page.evaluate(()=>{window.TitanAdventure.snapshot.owner='another-owner';dispatchEvent(new Event('titan:adventure-updated'));});await page.waitForFunction(()=>!document.querySelector('[data-valley-encounter]'));assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('valley quests: account transition withdraws the personal journal immediately',async()=>{
 const {page,context,errors}=await campaignPage('/adventure',active);try{
  await page.locator('[data-valley-encounter]').waitFor();
  const visible=await page.evaluate(()=>{window.titanAccountTransition={...window.titanAccountTransition,active:true};dispatchEvent(new Event('titan:account-changing'));return !!document.querySelector('[data-valley-encounter]');});
  assert.equal(visible,false);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
