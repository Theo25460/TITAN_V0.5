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
test('guardian phases: the least complete objective drives the trial at both widths',async()=>{
 for(const width of [360,1280]){const{page,context,errors}=await campaignPage('/adventure',guardian,width);try{
 const trial=page.locator('[data-campaign-encounter]');await trial.waitFor();assert.equal(await trial.locator('[data-phase]').count(),3);assert.equal(await trial.locator('[role="progressbar"]').getAttribute('aria-valuenow'),'27');assert.equal(await page.locator('[data-claim="9"]').count(),0);assert.match(await trial.textContent(),/objectif le moins avancé/);assert.deepEqual(errors,[]);
 }finally{await context.close();}}
});
test('guardian phases: ready is distinct from a confirmed campaign and a rejected claim keeps the trial',async()=>{
 const{page,context,errors}=await campaignPage('/adventure',{...guardian,evidence:{days:3,effort:150}});try{
 await page.locator('[data-campaign-encounter][data-state="ready"]').waitFor();await page.evaluate(()=>{window.TitanAdventure.action=async()=>{throw Error('QUEST_INCOMPLETE');};});await page.locator('[data-claim="9"]').click();await page.locator('#av-error').filter({hasText:'pas encore terminée'}).waitFor();assert.equal(await page.evaluate(()=>window.TitanAdventure.snapshot.campaigns[0].chapter),9);assert.equal(await page.locator('[data-campaign-encounter]').count(),1);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('guardian phases: historical server has no invented effort condition',async()=>{
 const{page,context,errors}=await campaignPage('/adventure',{chapter:9,target:3,evidence:{days:2}});try{
 const trial=page.locator('[data-campaign-encounter]');await trial.waitFor();assert.equal(await trial.locator('[data-phase]').count(),2);assert.equal(await trial.locator('[data-phase="effort"]').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('valley obstacle: current chapter evidence controls the passage and transition removes it',async()=>{
 const{page,context,errors}=await campaignPage('/adventure',{chapter:2,target:2,evidence:{days:1,effort:20}});try{
 const trial=page.locator('[data-campaign-encounter]');await trial.waitFor();assert.match(await trial.textContent(),/pont/i);assert.equal(await trial.locator('[role="progressbar"]').getAttribute('aria-valuenow'),'50');assert.equal(await page.evaluate(()=>{window.titanAccountTransition={active:true};dispatchEvent(new Event('titan:account-changing'));return !!document.querySelector('[data-campaign-encounter]');}),false);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('guardian phases: real discovery engine confirms the final chapter and stores its unique badge',async()=>{
 const f=await newPage();const{page,context,errors}=f;try{
 await page.goto(BASE+'/adventure');await page.waitForFunction(()=>window.TitanAdventure?.status==='ready');
 await page.evaluate(async()=>{const id=window.state.user.id;localStorage.setItem('titan_adventure_v1:'+id,JSON.stringify({owner:id,revision:1,selected_world:'aube',rewards:[],campaigns:[{id:'aube',chapter:9,route:'rhythm',started_at:'2026-10-01T00:00:00Z'}]}));window.state.history=[2,3,4].map(n=>({id:'g'+n,sport:'running',val:5,unit:'km',date:'2026-10-0'+n+'T12:00:00Z',created_at:'2026-10-0'+n+'T13:00:00Z',details:{duration:50,bio:{rpe:5}}}));await window.TitanAdventure.refresh({force:true});});
 await page.locator('[data-campaign-encounter][data-state="ready"]').waitFor();await page.locator('[data-claim="9"]').click();await page.waitForFunction(()=>window.TitanAdventure.snapshot.campaigns.find(c=>c.id==='aube').chapter===10);assert.equal(await page.locator('[data-campaign-encounter]').count(),0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('titan_adventure_v1:'+window.state.user.id)).rewards.filter(r=>r.world==='aube'&&r.chapter===9).length),1);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
