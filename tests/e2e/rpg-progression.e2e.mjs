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
const guardian={chapter:9,target:3,effort_target:150,evidence:{days:3,effort:40}};
test('RPG progress: QG shows the remaining guardian effort at mobile and desktop widths',async()=>{
 for(const width of [360,1280]){
  const {page,context,errors}=await campaignPage('/aujourdhui',guardian,width);
  try{
   const row=page.locator('#qg a[href="/adventure?world=aube"]');
   await row.waitFor();assert.match(await row.textContent(),/40\s*\/\s*150 min/);
   assert.match(await row.textContent(),/110 min/);
   assert.equal(await row.locator("[data-rpg-summary]").evaluate(el=>el.scrollWidth<=el.clientWidth && getComputedStyle(el).whiteSpace!=="nowrap"),true,"all objective values remain readable on mobile");
   assert.match(await row.locator('.asc-ascent > span').getAttribute('style'),/27%/);
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
});
test('RPG progress: Aventure retains both objectives and enables claim only when both are met',async()=>{
 const {page,context,errors}=await campaignPage('/adventure',guardian);
 try{
  await page.locator('[data-rpg-remaining]').waitFor();
  assert.match(await page.locator('[data-rpg-remaining]').textContent(),/110 min/);
  assert.equal(await page.locator('[data-claim="9"]').count(),0);
  await page.evaluate(()=>{window.TitanAdventure.snapshot.campaigns[0].evidence.effort=150;dispatchEvent(new Event('titan:adventure-updated'));});
  await page.locator('[data-claim="9"]').waitFor();
  assert.match(await page.locator('[data-rpg-remaining]').textContent(),/prête à valider/);
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('RPG departure: explains when a session starts counting and separates badge from session rewards',async()=>{
 for(const width of [360,1280]){
  const {page,context,errors}=await campaignPage('/adventure',{chapter:0,target:0},width);
  try{
   const guide=page.locator('[data-rpg-departure]');await guide.waitFor({state:'attached'});
   await guide.locator('summary').click();
   await page.evaluate(()=>dispatchEvent(new Event('titan:adventure-updated')));
   await page.evaluate(()=>new Promise(requestAnimationFrame));
   assert.equal(await guide.evaluate(el=>el.open),true,'the departure guide remains readable after a refresh');
   assert.match(await guide.textContent(),/avant ta prochaine séance/);
   assert.match(await guide.textContent(),/journal/);
   assert.match(await guide.textContent(),/ni XP ni coins/);
   assert.equal(await page.locator('[data-start]').isEnabled(),true);
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
});
test('RPG progress: legacy server requires no invented guardian effort',async()=>{
 const {page,context,errors}=await campaignPage('/aujourdhui',{chapter:9,target:3,evidence:{days:2},route:'journal'});
 try{
  const row=page.locator('#qg a[href="/adventure?world=aube"]');await row.waitFor();
  assert.doesNotMatch(await row.textContent(),/150|NaN|Infinity/);
  assert.match(await row.textContent(),/annoté/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
