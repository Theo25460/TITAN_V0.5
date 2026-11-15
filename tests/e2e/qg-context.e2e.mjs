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

test('QG recovers an owner-scoped draft as its only primary action', async () => {
 const {page,context,errors}=await fixture();try{
  await page.evaluate(()=>{
   localStorage.setItem(`titan_seance_draft_v3:${window.qgA}`,JSON.stringify({sport:'yoga',durM:'25',updatedAt:Date.now()}));
   window.dispatchEvent(new Event('titan:history-updated'));
  });
  const hero=page.locator('.qg-hero .asc-btn-primary');
  await page.getByRole('link',{name:'Reprendre le brouillon'}).waitFor();
  assert.equal(await hero.count(),1);
  assert.equal(await hero.getAttribute('href'),'/training?sport=yoga');
  const nav=page.getByRole('navigation',{name:'Raccourcis du QG'});
  for(const [name,href] of [['Sport','/training'],['Aventure','/adventure'],['Progrès','/stats']]) {
   assert.equal(await nav.getByRole('link',{name}).getAttribute('href'),href);
  }
  await page.evaluate(()=>window.qgSwitch());
  await visibleGoal(page,'B');
  assert.equal(await hero.getAttribute('href'),'/training');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('QG resumes the actual guest form with its saved measurements', async () => {
 const {page,context,errors}=await newPage();try{
  await page.goto(BASE+'/training?sport=yoga');
  await page.locator('[data-k="durM"]').fill('25');
  await page.waitForFunction(()=>{
   const id=window.state?.user?.id;
   return id?.startsWith('guest_') && JSON.parse(localStorage.getItem(`titan_seance_draft_v3:${id}`))?.durM==='25';
  });
  await page.goto(BASE+'/aujourdhui');
  await page.getByText('Mode découverte',{exact:true}).first().waitFor();
  await page.getByRole('link',{name:'Reprendre le brouillon'}).click();
  await page.getByText(/Brouillon repris/).waitFor();
  assert.equal(await page.locator('[data-k="durM"]').inputValue(),'25');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('QG links to the refused sessions panel and focuses it on arrival', async () => {
 const {page,context,errors}=await fixture();try{
  await page.evaluate(()=>{
   window.TitanData.pending=()=>[{status:'error',reason:'Mesures invalides'}];
   window.dispatchEvent(new Event('titan:pending-changed'));
  });
  const cta=page.getByRole('link',{name:'Voir les séances',exact:true});
  await cta.waitFor();
  assert.equal(await cta.getAttribute('href'),'/journal#attente');
  await cta.click();
  await page.waitForFunction(()=>!!window.TitanQueue);
  await page.evaluate(()=>{
   window.TitanQueue.list=()=>[{status:'error',reason:'Mesures invalides'}];
   window.dispatchEvent(new Event('titan:pending-changed'));
  });
  const pending=page.getByRole('region',{name:'Séances en attente d’envoi'});
  await pending.waitFor();
  assert.match(await pending.textContent(),/Mesures invalides/);
  await page.waitForFunction(()=>document.activeElement?.id==='attente');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

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

test('background QG refresh retains hero nodes, expanded details and focus',async()=>{
 const {page,context}=await fixture({width:1280});try{
  await page.evaluate(()=>{window.qgStableHero=document.querySelector('.qg-hero');window.qgStableWeek=document.querySelector('[aria-labelledby="qg-week"]');});
  const detail=page.locator('.qg-why').last();await detail.locator('summary').click();
  await detail.locator('summary').focus();
  await page.evaluate(()=>window.dispatchEvent(new Event('titan:steps-updated')));await settle(page);await settle(page);
  assert.equal(await page.evaluate(()=>window.qgStableHero===document.querySelector('.qg-hero')),true);
  assert.equal(await page.evaluate(()=>window.qgStableWeek===document.querySelector('[aria-labelledby="qg-week"]')),true);
  assert.equal(await detail.evaluate(e=>e.open),true);
  assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUMMARY');
  assert.equal(await page.locator('.qg-hero').evaluate(e=>getComputedStyle(e).animationName),'none');
 }finally{await context.close();}
});

test('the rank strip keeps character, level and crest on one row at 320 and 360 px, above the action of the day',async()=>{
 for(const width of [320,360]){
  const {page,context}=await fixture({width});try{
   const box=sel=>page.locator(sel).first().boundingBox();
   const portrait=await box('.qg-portrait'),name=await box('.qg-rank-name'),crest=await box('.qg-crest'),hero=await box('.qg-hero');
   assert.ok(portrait&&name&&crest&&hero,'the strip shows the character, the level with its rank and the crest');
   assert.match(await page.locator('.qg-rank-name').textContent(),/^Niveau \d+ · \S+/);
   assert(portrait.x+portrait.width<=name.x+1&&name.x+name.width<=crest.x+1,'nothing overlaps on the row');
   assert(crest.x+crest.width<=width,'the crest stays inside the screen');
   assert(Math.abs((portrait.y+portrait.height/2)-(crest.y+crest.height/2))<24,'character and crest share the row');
   assert(name.y+name.height<=hero.y,'the strip sits above the action of the day');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }finally{await context.close();}
 }
});

test('a new account reads what TITAN does and its week target, without empty figures',async()=>{
 const {page,context,errors}=await fixture();try{
  const how=page.getByRole('heading',{name:'Comment ça marche'});await how.waitFor();
  assert.equal(await page.locator('.qg-how-list li').count(),3);
  assert.equal(await page.locator('#qg-lead').isVisible(),true);
  assert.equal(await page.locator('[aria-labelledby="qg-week"] .asc-stat').count(),0,'no row of zeros before the first session');
  assert.equal(await page.locator('[data-action="cadence"]').isVisible(),true,'the week target stays reachable');
  assert.equal(await page.locator('.qg-hero .asc-btn-primary').count(),1);
  assert.equal(await page.locator('#qg .asc-btn-primary').count(),1,'one primary action on the QG');
  await page.evaluate(()=>{window.state.history=[{id:'s1',sport:'yoga',date:new Date().toISOString(),val:30,unit:'min',details:{duration:30}}];window.dispatchEvent(new Event('titan:history-updated'));});
  await page.getByRole('heading',{name:'Dernière séance'}).waitFor();
  assert.equal(await how.count(),0,'the explanation leaves once a session exists');
  assert.equal(await page.locator('#qg-lead').count(),0);
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('recent sessions show official XP only once the server confirmed them',async()=>{
 const {page,context,errors}=await fixture();try{
  await page.evaluate(()=>{
   const at=d=>new Date(Date.now()-d*86400000).toISOString();
   window.state.history=[
    {id:'c1',client_event_id:'c1',sport:'yoga',date:at(0.1),val:30,unit:'min',xp:300,syncStatus:'confirmed',details:{duration:30,serverReward:{xp:280}}},
    {id:'p1',client_event_id:'p1',sport:'yoga',date:at(1),val:40,unit:'min',xp:400,syncStatus:'pending',details:{duration:40}},
    {id:'h1',client_event_id:'h1',sport:'yoga',date:at(2),val:50,unit:'min',xp:500,syncStatus:'confirmed',details:{duration:50,serverReward:{reward_held:true,held_xp:500}}},
    {id:'o1',client_event_id:'o1',sport:'yoga',date:at(3),val:20,unit:'min',xp:200,syncStatus:'confirmed',details:{duration:20}}];
   window.dispatchEvent(new Event('titan:history-updated'));
  });
  const rows=page.locator('[aria-labelledby="qg-last"] a.asc-row');await rows.first().waitFor();
  assert.equal(await rows.count(),3,'three sessions at most');
  assert.match(await rows.nth(0).textContent(),/\+280 XP/);
  assert.match(await rows.nth(1).textContent(),/XP en attente/);assert.doesNotMatch(await rows.nth(1).textContent(),/\+\s?\d+ XP/);
  assert.match(await rows.nth(2).textContent(),/XP en vérification/);assert.doesNotMatch(await rows.nth(2).textContent(),/\+\s?\d+ XP/);
  assert.equal(await rows.nth(0).getAttribute('href'),'/journal?log=c1');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('a confirmed progression arriving late keeps the open ascent explanation and its keyboard focus',async()=>{
 const {page,context}=await fixture({width:1280});try{
  await page.evaluate(()=>{
   const read=window.TitanData.progression;window.qgConfirmed=false;
   window.TitanData.progression=()=>({...read(),guest:false,confirmed:window.qgConfirmed});
   window.dispatchEvent(new Event('titan:steps-updated'));
  });await settle(page);
  const detail=page.locator('.qg-ascent details');await detail.locator('summary').click();await detail.locator('summary').focus();
  await detail.evaluate(el=>window.qgExplanation=el);
  await page.evaluate(()=>{window.qgConfirmed=true;window.dispatchEvent(new Event('titan:steps-updated'));});await settle(page);await settle(page);
  assert.equal(await detail.evaluate(el=>el===window.qgExplanation),true);
  assert.equal(await detail.evaluate(el=>el.open),true);
  assert.equal(await page.evaluate(()=>document.activeElement===window.qgExplanation.querySelector('summary')),true);
 }finally{await context.close();}
});
