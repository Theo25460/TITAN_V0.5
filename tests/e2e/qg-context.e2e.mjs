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

const A='00000000-0000-4000-8000-000000000921',B='00000000-0000-4000-8000-000000000922';
async function fixture({width=360,held=false,adventureHeld=false}={}){
 const f=await newPage(width),{page}=f;page.setDefaultTimeout(2500);
 await page.route('**/js/app/qg.js?*',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.goto(BASE+'/aujourdhui');await page.waitForFunction(()=>window.TitanAdventure?.status==='ready');
 await page.evaluate(({A,B,held,adventureHeld})=>{
  window.state.user.id=A;window.state.user.name='Compte A';window.state.history=[];
  window.qgA=A;window.qgB=B;window.qgHold=held;window.qgReads=[];window.qgImports=[];window.qgSettings=[];window.qgNotices=[];window.qgFail=false;
  window.qgGoal=id=>({id:'goal-'+id,title:'Objectif privé '+(id===A?'A':'B'),metric:'sessions',target:5,start_date:'2026-01-01',end_date:'2030-12-31'});
  const d=window.TitanData;window.TitanData={...d,
   goals:()=>{const id=window.state.user.id;return new Promise((resolve,reject)=>{const job={id,release:()=>resolve([window.qgGoal(id)]),fail:()=>reject(Error('Unavailable'))};window.qgReads.push(job);if(!window.qgHold)window.qgFail?job.fail():job.release();});},
   guestCandidates:async()=>adventureHeld&&!window.qgAdventureReady?[]:[{},{}],
   importGuestSessions:()=>new Promise((resolve,reject)=>window.qgImports.push({id:window.state.user.id,release:()=>resolve(2),fail:()=>reject(Error('Unavailable'))})),
   setCadenceTarget:n=>window.qgSettings.push({id:window.state.user.id,n}),togglePause:week=>{window.qgSettings.push({id:window.state.user.id,week});return true;}};
  window.TitanAdventure.refresh=()=>adventureHeld?new Promise(resolve=>{window.qgAdventureRelease=()=>{window.qgAdventureReady=true;resolve();};}):Promise.resolve();window.titanShell.toast=notice=>window.qgNotices.push(notice);
  window.qgSwitch=(id=B)=>{window.titanAccountTransition={active:true,owner:id,epoch:(window.titanAccountTransition?.epoch||0)+1};window.dispatchEvent(new Event('titan:account-changing'));window.state.user.id=id;window.state.user.name=id===A?'Compte A':'Compte B';window.titanAccountTransition.active=false;window.dispatchEvent(new Event('titan:account-changed'));};
 },{A,B,held,adventureHeld});
 await page.addScriptTag({path:ROOT+'/js/app/qg.js'});
 if(adventureHeld){await page.waitForFunction(()=>Boolean(window.qgAdventureRelease));return f;}
 await page.waitForFunction(()=>window.qgReads.length>0);
 if(!held)await page.getByText('Objectif privé A',{exact:true}).first().waitFor();
 return f;
}
async function visibleGoal(page,label){await page.getByText('Objectif privé '+label,{exact:true}).first().waitFor();}
async function settle(page){await page.evaluate(()=>new Promise(requestAnimationFrame));}

test('qg context: account change clears private goals before the new read completes',async()=>{
 for(const width of [360,1280]){
  const {page,context,errors}=await fixture({width});try{
   await page.evaluate(()=>{window.qgHold=true;window.qgSwitch();});
   assert.doesNotMatch(await page.locator('#qg').textContent(),/Objectif privé A/);
   await page.waitForFunction(()=>window.qgReads.some(r=>r.id===window.qgB));
   await page.evaluate(()=>window.qgReads.filter(r=>r.id===window.qgB).at(-1).release());await visibleGoal(page,'B');
   assert.doesNotMatch(await page.locator('#qg').textContent(),/Objectif privé A/);assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
});
test('qg context: a late old-account read cannot replace the new goals',async()=>{
 const {page,context,errors}=await fixture({held:true});try{
  await page.evaluate(()=>{window.qgHold=false;window.qgSwitch();});await visibleGoal(page,'B');
  await page.evaluate(()=>window.qgReads[0].release());await settle(page);
  assert.doesNotMatch(await page.locator('#qg').textContent(),/Objectif privé A/);await visibleGoal(page,'B');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('qg context: A to B to A rejects the original epoch read',async()=>{
 const {page,context,errors}=await fixture({held:true});try{
  await page.evaluate(()=>{window.qgSwitch();window.qgHold=false;window.qgSwitch(window.qgA);});await visibleGoal(page,'A');
  await page.evaluate(()=>{window.qgGoal=()=>({id:'old',title:'OLD EPOCH',metric:'sessions',target:5,start_date:'2026-01-01',end_date:'2030-12-31'});window.qgReads[0].release();});await settle(page);
  assert.doesNotMatch(await page.locator('#qg').textContent(),/OLD EPOCH/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('qg context: an open cadence sheet closes on account transition',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.locator('[data-action="cadence"]').click();await page.getByRole('dialog',{name:'Ta semaine type'}).waitFor();
  await page.evaluate(()=>{window.qgDetached=document.querySelector('dialog [data-n="4"]');window.qgSwitch();});
  assert.equal(await page.locator('dialog[open]').count(),0);
  await page.evaluate(()=>window.qgDetached.click());assert.deepEqual(await page.evaluate(()=>window.qgSettings),[]);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('qg context: silent owner mismatch blocks a cadence action',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.locator('[data-action="cadence"]').click();
  await page.evaluate(()=>{window.state.user.id=window.qgB;document.querySelector('dialog [data-pause]').click();});
  assert.deepEqual(await page.evaluate(()=>window.qgSettings),[]);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('qg context: current cadence and pause retain their settings contract',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.locator('[data-action="cadence"]').click();await page.locator('dialog [data-n="4"]').click();await page.locator('dialog [data-pause]').click();
  const calls=await page.evaluate(()=>window.qgSettings);assert.equal(calls[0].id,A);assert.equal(calls[0].n,4);assert.equal(calls[1].id,A);assert.match(calls[1].week,/^\d{4}-\d{2}-\d{2}$/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('qg context: history reads are refreshed beyond the first event',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.evaluate(()=>window.dispatchEvent(new Event('titan:history-updated')));
  await page.waitForFunction(()=>window.qgReads.length===2);
  await page.evaluate(()=>window.dispatchEvent(new Event('titan:history-updated')));
  await page.waitForFunction(()=>window.qgReads.length===3);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('qg context: latest history read wins in the same account',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.evaluate(()=>{window.qgHold=true;window.dispatchEvent(new Event('titan:history-updated'));window.dispatchEvent(new Event('titan:history-updated'));});
  await page.waitForFunction(()=>window.qgReads.length===3);
  await page.evaluate(()=>window.qgReads[2].release());await visibleGoal(page,'A');
  await page.evaluate(()=>{window.qgGoal=()=>({id:'old',title:'STALE READ',metric:'sessions',target:5,start_date:'2026-01-01',end_date:'2030-12-31'});window.qgReads[1].release();});await settle(page);
  assert.doesNotMatch(await page.locator('#qg').textContent(),/STALE READ/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('qg context: pending import survives rerender without a second invocation',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.locator('[data-action="import-guest"]').click();await page.evaluate(()=>window.dispatchEvent(new Event('titan:pending-changed')));await settle(page);
  assert.equal(await page.locator('[data-action="import-guest"]').isDisabled(),true);
  await page.evaluate(()=>document.querySelector('[data-action="import-guest"]').click());
  assert.equal(await page.evaluate(()=>window.qgImports.length),1);
  await page.evaluate(()=>window.qgImports[0].release());await settle(page);
  assert.equal(await page.locator('[data-action="import-guest"]').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
for(const mode of ['release','fail'])test(`qg context: old import ${mode} has no feedback under the new account`,async()=>{
 const {page,context,errors}=await fixture();try{
  await page.locator('[data-action="import-guest"]').click();await page.evaluate(()=>window.qgSwitch());await visibleGoal(page,'B');
  await page.locator('[data-action="import-guest"]').click();
  await page.evaluate(mode=>window.qgImports[0][mode](),mode);await settle(page);
  assert.deepEqual(await page.evaluate(()=>window.qgNotices),[]);assert.equal(await page.locator('[data-action="import-guest"]').isDisabled(),true);
  await page.evaluate(()=>window.qgImports[1].release());await settle(page);assert.equal(await page.evaluate(()=>window.qgNotices.length),1);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('qg context: failed current import can be retried explicitly',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.locator('[data-action="import-guest"]').click();await page.evaluate(()=>window.qgImports[0].fail());await settle(page);
  assert.equal(await page.locator('[data-action="import-guest"]').isEnabled(),true);assert.equal(await page.evaluate(()=>window.qgNotices.length),1);
  await page.locator('[data-action="import-guest"]').click();assert.equal(await page.evaluate(()=>window.qgImports.length),2);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('qg context: first candidate read waits for the adventure rules snapshot',async()=>{
 const {page,context,errors}=await fixture({adventureHeld:true});try{
  assert.equal(await page.evaluate(()=>window.qgReads.length),0);
  await page.evaluate(()=>window.qgAdventureRelease());await visibleGoal(page,'A');
  await page.locator('[data-action="import-guest"]').waitFor();assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('qg context: failed reads settle without leaking old goals and a later event retries',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.evaluate(()=>{window.qgFail=true;window.dispatchEvent(new Event('titan:history-updated'));});
  await page.waitForFunction(()=>window.qgReads.length===2);await settle(page);
  assert.doesNotMatch(await page.locator('#qg').textContent(),/Objectif privé A/);
  await page.evaluate(()=>{window.qgFail=false;window.dispatchEvent(new Event('titan:history-updated'));});await visibleGoal(page,'A');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
