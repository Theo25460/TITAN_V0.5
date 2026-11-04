// Actual planner UI with synthetic account contexts and an intercepted settings gateway.
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
  assert.ok(ready, "local preview server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

const A='00000000-0000-4000-8000-000000000931',B='00000000-0000-4000-8000-000000000932';
async function fixture(width=360){
 const f=await newPage(width),{page}=f;page.setDefaultTimeout(2500);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/js/app/prevoir.js?*',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.goto(BASE+'/prevoir');await page.waitForFunction(()=>window.TitanAdventure?.status==='ready');
 await page.evaluate(({A,B})=>{
  window.planA=A;window.planB=B;window.planCalls=[];window.planNotices=[];
  window.makePlan=id=>({monday:{sport:id===A?'running':'yoga',minutes:id===A?30:45,note:id===A?'NOTE PRIVÉE A':'NOTE PRIVÉE B'}});
  window.state.user.id=A;window.state.user.schedule=window.makePlan(A);window.state.history=[];
  const data=window.TitanData;window.TitanData={...data,setPlanDay:(key,value)=>{window.planCalls.push({id:window.state.user.id,key,value});window.state.user.schedule[key]=value||{};window.dispatchEvent(new Event('titan:history-updated'));}};
  window.titanShell.toast=notice=>window.planNotices.push(notice);
  window.planSwitch=(id=B)=>{window.titanAccountTransition={active:true,owner:id,epoch:(window.titanAccountTransition?.epoch||0)+1};window.dispatchEvent(new Event('titan:account-changing'));window.state.user.id=id;window.state.user.schedule=window.makePlan(id);window.titanAccountTransition.active=false;window.dispatchEvent(new Event('titan:account-changed'));};
 },{A,B});
 await page.addScriptTag({path:ROOT+'/js/app/prevoir.js'});
 await page.locator('#prevoir .asc-row[data-day="monday"]').waitFor();return {...f,errors};
}
const day=page=>page.locator('#prevoir .asc-row[data-day="monday"]');
const dialog=page=>page.getByRole('dialog',{name:'Lundi',exact:true});
async function open(page){await day(page).focus();await page.keyboard.press('Enter');await dialog(page).waitFor();}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

test('planner context: account transition removes private notes before the new render',async()=>{
 for(const width of [360,1280]){
  const {page,context,errors}=await fixture(width);try{
   assert.match(await page.locator('#prevoir').textContent(),/NOTE PRIVÉE A/);
   await page.evaluate(()=>{window.titanAccountTransition.active=true;window.titanAccountTransition.epoch++;window.dispatchEvent(new Event('titan:account-changing'));});
   assert.doesNotMatch(await page.locator('#prevoir').textContent(),/NOTE PRIVÉE A/);
   await page.evaluate(()=>{window.state.user.id=window.planB;window.state.user.schedule=window.makePlan(window.planB);window.titanAccountTransition.active=false;window.dispatchEvent(new Event('titan:account-changed'));});
   await page.getByText(/NOTE PRIVÉE B/).first().waitFor();assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
});
for(const action of ['save','clear'])test(`planner context: changed account closes a draft and its detached ${action} cannot write`,async()=>{
 const {page,context,errors}=await fixture();try{
  await open(page);await page.evaluate(()=>{window.oldPlanForm=document.querySelector('dialog form');window.planSwitch();});
  assert.equal(await page.locator('dialog[open]').count(),0);
  await page.evaluate(action=>action==='save'?window.oldPlanForm.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})):window.oldPlanForm.querySelector('[data-clear]').click(),action);
  assert.deepEqual(await page.evaluate(()=>window.planCalls),[]);assert.deepEqual(await page.evaluate(()=>window.planNotices),[]);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
for(const action of ['save','clear'])test(`planner context: silent owner mismatch blocks ${action}`,async()=>{
 const {page,context,errors}=await fixture();try{
  await open(page);await page.evaluate(action=>{window.state.user.id=window.planB;window.state.user.schedule=window.makePlan(window.planB);const form=document.querySelector('dialog form');action==='save'?form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})):form.querySelector('[data-clear]').click();},action);
  assert.deepEqual(await page.evaluate(()=>window.planCalls),[]);assert.equal(await page.locator('dialog[open]').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('planner context: an original draft cannot save after A to B to A',async()=>{
 const {page,context,errors}=await fixture();try{
  await open(page);await page.evaluate(()=>{window.oldPlanForm=document.querySelector('dialog form');window.planSwitch();window.planSwitch(window.planA);});
  await settle(page);await page.evaluate(()=>window.oldPlanForm.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.deepEqual(await page.evaluate(()=>window.planCalls),[]);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('planner context: client replacement invalidates the old clear action',async()=>{
 const {page,context,errors}=await fixture();try{
  await open(page);await page.evaluate(()=>{window.titanClient={};document.querySelector('dialog [data-clear]').click();});
  assert.deepEqual(await page.evaluate(()=>window.planCalls),[]);assert.equal(await page.locator('dialog[open]').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('planner context: current save preserves its existing payload and keyboard return',async()=>{
 for(const width of [360,1280]){
  const {page,context,errors}=await fixture(width);try{
   await open(page);await dialog(page).locator('[name=minutes]').fill('50');await dialog(page).locator('[name=note]').fill('Repère courant');
   await dialog(page).getByRole('button',{name:'Enregistrer',exact:true}).click();await settle(page);
   assert.deepEqual(await page.evaluate(()=>window.planCalls),[{id:A,key:'monday',value:{sport:'running',minutes:'50',note:'Repère courant'}}]);
   assert.equal(await day(page).evaluate(el=>el===document.activeElement),true);assert.equal(await page.evaluate(()=>window.planNotices.length),1);assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
});
test('planner context: same-context rerender keeps the draft and its search focus',async()=>{
 const {page,context,errors}=await fixture();try{
  await open(page);await dialog(page).locator('[name=note]').fill('Brouillon courant');await dialog(page).locator('#pv-q').focus();
  await page.evaluate(()=>window.dispatchEvent(new Event('titan:history-updated')));await settle(page);
  assert.equal(await dialog(page).locator('[name=note]').inputValue(),'Brouillon courant');assert.equal(await dialog(page).locator('#pv-q').evaluate(el=>el===document.activeElement),true);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('planner context: closing an obsolete draft does not restore focus into the new account',async()=>{
 const {page,context,errors}=await fixture();try{
  await open(page);await page.evaluate(()=>{window.oldPlanDialog=document.querySelector('dialog');window.planSwitch();const b=document.createElement('button');b.id='new-focus';b.textContent='Autre action';document.body.append(b);b.focus();});await settle(page);
  await page.evaluate(()=>window.oldPlanDialog.dispatchEvent(new Event('close')));await settle(page);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'new-focus');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('planner context: an active transition blocks a new draft even from a retained day button',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.evaluate(()=>{window.oldPlanDay=document.querySelector('#prevoir .asc-row[data-day="monday"]');window.titanAccountTransition.active=true;window.dispatchEvent(new Event('titan:account-changing'));window.oldPlanDay.click();});
  assert.equal(await page.locator('dialog[open]').count(),0);assert.deepEqual(await page.evaluate(()=>window.planCalls),[]);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('planner context: a silent same-owner epoch shift invalidates the original submit',async()=>{
 const {page,context,errors}=await fixture();try{
  await open(page);await page.evaluate(()=>{window.titanAccountTransition.epoch++;document.querySelector('dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  assert.deepEqual(await page.evaluate(()=>window.planCalls),[]);assert.equal(await page.locator('dialog[open]').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
for(const action of ['save','clear'])test(`planner context: a form detached from its open dialog cannot ${action}`,async()=>{
 const {page,context,errors}=await fixture();try{
  await open(page);await page.evaluate(action=>{const form=document.querySelector('dialog form');form.remove();action==='save'?form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})):form.querySelector('[data-clear]').click();},action);
  assert.deepEqual(await page.evaluate(()=>window.planCalls),[]);assert.deepEqual(await page.evaluate(()=>window.planNotices),[]);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
