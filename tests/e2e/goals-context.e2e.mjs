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

const A='00000000-0000-4000-8000-000000000941',B='00000000-0000-4000-8000-000000000942';
async function fixture({width=360,held=false}={}){
 const f=await newPage(width),{page}=f;page.setDefaultTimeout(2500);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/js/app/objectifs.js?*',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.goto(BASE+'/objectifs');await page.waitForFunction(()=>window.TitanAdventure?.status==='ready');
 await page.evaluate(({A,B,held})=>{
  window.goalA=A;window.goalB=B;window.state.user.id=A;window.state.history=[];
  const row=id=>({id:id===A?'00000000-0000-4000-8000-000000000951':'00000000-0000-4000-8000-000000000952',user_id:id,title:id===A?'Objectif privé A':'Objectif privé B',metric:'sessions',target:12,sport:null,start_date:'2026-01-01',end_date:'2027-01-01',revision:1,created_at:'2026-01-01T00:00:00Z'});
  window.goalRows={[A]:[row(A)],[B]:[row(B)]};window.goalReads=[];window.goalHoldReads=held;window.goalHoldWrites=false;window.goalWrites=[];window.goalNotices=[];window.goalEvents=[];window.goalWriteError=false;
  const d=window.TitanData;window.TitanData={...d,goals:()=>{const id=window.state.user.id,data=structuredClone(window.goalRows[id]||[]);return new Promise((resolve,reject)=>{const job={id,release:()=>resolve(data),fail:()=>reject(Error('Read unavailable'))};window.goalReads.push(job);if(!window.goalHoldReads)job.release();});}};
  window.titanClient={from:table=>{
   if(table!=='sport_goals')throw Error('Unexpected table');
   let kind,fields;const filters={};
   const q={insert:v=>{kind='insert';fields=v;return q;},update:v=>{kind='update';fields=v;return q;},eq:(k,v)=>{filters[k]=v;return q;},select:()=>q,single:()=>new Promise(resolve=>{
    const id=fields.user_id||filters.user_id;
    const old=kind==='update'?window.goalRows[id].find(r=>r.id===filters.id):null;
    const data={...old,...fields,user_id:id,id:old?.id||crypto.randomUUID(),revision:(old?.revision||0)+1,created_at:old?.created_at||new Date().toISOString()};
    const job={id,kind,fields:structuredClone(fields),filters:structuredClone(filters),release:(error,foreign)=>{if(error||window.goalWriteError)return resolve({error:{code:'PGRST116'}});window.goalRows[id]=[data,...window.goalRows[id].filter(r=>r.id!==data.id)];resolve({data:foreign?{...data,user_id:foreign}:data});}};
    window.goalWrites.push(job);if(!window.goalHoldWrites)job.release();
   })};return q;
  }};
  window.titanShell.toast=n=>window.goalNotices.push(n);window.TitanAnalytics={track:(name,data)=>window.goalEvents.push({name,data,id:window.state.user.id})};
  window.goalSwitch=(id=B)=>{window.titanAccountTransition={active:true,owner:id,epoch:(window.titanAccountTransition?.epoch||0)+1};window.dispatchEvent(new Event('titan:account-changing'));window.state.user.id=id;window.titanAccountTransition.active=false;window.dispatchEvent(new Event('titan:account-changed'));};
 },{A,B,held});
 await page.addScriptTag({path:ROOT+'/js/app/objectifs.js'});await page.waitForFunction(()=>window.goalReads.length>0);
 if(!held)await page.getByRole('heading',{name:'Objectif privé A',exact:true}).waitFor();return {...f,errors};
}
const form=page=>page.locator('dialog[open] .ob-form');
async function edit(page){await page.locator('[data-edit]').first().click();await form(page).waitFor();}
async function create(page,title='Création courante'){await page.locator('[data-new]').click();await form(page).waitFor();await form(page).locator('[name=title]').fill(title);}
async function submit(page){await form(page).locator('[type=submit]').click();}
async function settle(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function visible(page,label){await page.getByRole('heading',{name:'Objectif privé '+label,exact:true}).waitFor();}

test('goals context: transition clears private rows before the new read finishes',async()=>{
 for(const width of [360,1280]){
  const {page,context,errors}=await fixture({width});try{
   await page.evaluate(()=>{window.goalHoldReads=true;window.goalSwitch();});
   assert.doesNotMatch(await page.locator('#objectifs').textContent(),/Objectif privé A/);
   await page.waitForFunction(()=>window.goalReads.some(r=>r.id===window.goalB));await page.evaluate(()=>window.goalReads.filter(r=>r.id===window.goalB).at(-1).release());await visible(page,'B');assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
});
test('goals context: a delayed old read cannot become the new account list',async()=>{
 const {page,context,errors}=await fixture({held:true});try{
  await page.evaluate(()=>{window.goalHoldReads=false;window.goalSwitch();});await visible(page,'B');
  await page.evaluate(()=>window.goalReads[0].release());await settle(page);assert.doesNotMatch(await page.locator('#objectifs').textContent(),/Objectif privé A/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('goals context: changed account closes an editor and its old submit cannot write',async()=>{
 const {page,context,errors}=await fixture();try{
  await edit(page);await page.evaluate(()=>{window.oldGoalForm=document.querySelector('.ob-form');window.goalSwitch();});
  assert.equal(await page.locator('dialog[open]').count(),0);
  await page.evaluate(()=>window.oldGoalForm.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await settle(page);
  assert.deepEqual(await page.evaluate(()=>window.goalWrites.map(w=>w.fields)),[]);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('goals context: old archive confirmation closes and cannot mutate the new account',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.locator('[data-archive]').first().click();await page.getByRole('dialog').waitFor();
  await page.evaluate(()=>{window.oldGoalConfirm=document.querySelector('dialog [data-ok]');window.goalSwitch();});
  assert.equal(await page.locator('dialog[open]').count(),0);await page.evaluate(()=>window.oldGoalConfirm.click());await settle(page);
  assert.equal(await page.evaluate(()=>window.goalWrites.length),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
for(const change of ['owner','epoch','client'])test(`goals context: silent ${change} mismatch blocks the original editor`,async()=>{
 const {page,context,errors}=await fixture();try{
  await edit(page);await page.evaluate(change=>{if(change==='owner')window.state.user.id=window.goalB;else if(change==='epoch')window.titanAccountTransition.epoch++;else window.titanClient={};document.querySelector('.ob-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));},change);await settle(page);
  assert.equal(await page.evaluate(()=>window.goalWrites.length),0);assert.equal(await page.locator('dialog[open]').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('goals context: late confirmed creation cannot refresh or notify under the new account',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.evaluate(()=>{window.goalHoldWrites=true;});await create(page,'Création privée A');await submit(page);
  await page.evaluate(()=>window.goalSwitch());await visible(page,'B');await create(page,'Brouillon B');
  await page.evaluate(()=>window.goalWrites[0].release());await settle(page);
  assert.equal(await form(page).locator('[name=title]').inputValue(),'Brouillon B');assert.deepEqual(await page.evaluate(()=>window.goalNotices),[]);assert.deepEqual(await page.evaluate(()=>window.goalEvents),[]);
  assert.doesNotMatch(await page.locator('#objectifs').textContent(),/Création privée A/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('goals context: old rejected update does not alter a new pending editor',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.evaluate(()=>{window.goalHoldWrites=true;});await edit(page);await submit(page);
  await page.evaluate(()=>window.goalSwitch());await visible(page,'B');await create(page,'Création B');await submit(page);
  await page.evaluate(()=>window.goalWrites[0].release(true));await settle(page);
  assert.equal(await form(page).locator('[type=submit]').isDisabled(),true);assert.equal(await form(page).getByRole('alert').count(),0);
  await page.evaluate(()=>window.goalWrites[1].release());await settle(page);assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.evaluate(()=>window.goalNotices.length),1);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('goals context: repeated submits launch one current create and preserve its receipt',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.evaluate(()=>{window.goalHoldWrites=true;});await create(page);await submit(page);
  await page.evaluate(()=>document.querySelector('.ob-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(await page.evaluate(()=>window.goalWrites.length),1);
  await page.evaluate(()=>window.goalWrites[0].release());await page.getByRole('heading',{name:'Création courante',exact:true}).waitFor();await settle(page);
  assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.evaluate(()=>window.goalEvents.length),1);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('goals context: current revision conflict keeps its draft and can be retried explicitly',async()=>{
 const {page,context,errors}=await fixture();try{
  await edit(page);await form(page).locator('[name=title]').fill('Révision courante');await page.evaluate(()=>{window.goalWriteError=true;});await submit(page);
  await form(page).getByRole('alert').waitFor();assert.equal(await form(page).locator('[name=title]').inputValue(),'Révision courante');assert.equal(await form(page).locator('[type=submit]').isEnabled(),true);
  await page.evaluate(()=>{window.goalWriteError=false;});await submit(page);await page.getByRole('heading',{name:'Révision courante',exact:true}).waitFor();
  const writes=await page.evaluate(()=>window.goalWrites.map(w=>({id:w.id,kind:w.kind,filters:w.filters})));assert.equal(writes.length,2);assert.equal(writes[0].id,A);assert.deepEqual(writes[0].filters,{id:'00000000-0000-4000-8000-000000000951',user_id:A,revision:1});assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('goals context: same-account rerender preserves the current draft and keyboard focus',async()=>{
 const {page,context,errors}=await fixture();try{
  await edit(page);await form(page).locator('[name=title]').fill('Brouillon courant');await form(page).locator('[name=title]').focus();
  await page.evaluate(()=>window.dispatchEvent(new Event('titan:history-updated')));await settle(page);
  assert.equal(await form(page).locator('[name=title]').inputValue(),'Brouillon courant');assert.equal(await form(page).locator('[name=title]').evaluate(el=>el===document.activeElement),true);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('goals context: A to B to A rejects the original delayed read',async()=>{
 const {page,context,errors}=await fixture({held:true});try{
  await page.evaluate(()=>{window.goalSwitch();window.goalRows[window.goalA][0].title='Objectif A récent';window.goalHoldReads=false;window.goalSwitch(window.goalA);});
  await page.getByRole('heading',{name:'Objectif A récent',exact:true}).waitFor();await page.evaluate(()=>window.goalReads[0].release());await settle(page);
  assert.doesNotMatch(await page.locator('#objectifs').textContent(),/Objectif privé A/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('goals context: a foreign write receipt remains an error without reload or analytics',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.evaluate(()=>{window.goalHoldWrites=true;});await create(page,'Réponse étrangère');await submit(page);
  await page.evaluate(()=>window.goalWrites[0].release(false,window.goalB));await form(page).getByRole('alert').waitFor();
  assert.match(await form(page).getByRole('alert').textContent(),/pas pu être vérifiée/);
  assert.equal(await page.evaluate(()=>window.goalReads.length),1);assert.deepEqual(await page.evaluate(()=>window.goalEvents),[]);assert.deepEqual(await page.evaluate(()=>window.goalNotices),[]);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('goals context: a closed editor receipt cannot close or rewrite a newer same-account draft',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.evaluate(()=>{window.goalHoldWrites=true;});await create(page,'Ancienne création confirmée');await submit(page);await form(page).locator('[data-cancel]').click();
  await page.locator('dialog[open]').waitFor({state:'hidden'});await create(page,'Nouveau brouillon');
  await page.evaluate(()=>window.goalWrites[0].release());await settle(page);
  assert.equal(await form(page).locator('[name=title]').inputValue(),'Nouveau brouillon');assert.deepEqual(await page.evaluate(()=>window.goalNotices),[]);
  assert.equal(await page.evaluate(()=>window.goalEvents.length),1);assert.equal(await page.evaluate(()=>window.goalEvents[0].id),A);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
