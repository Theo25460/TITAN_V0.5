// Real onboarding and local storage under production CSP. Synthetic account transitions only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {before,after,test} from 'node:test';
import {chromium} from 'playwright';
const ROOT=new URL('../..',import.meta.url).pathname;
const POLICY=/Content-Security-Policy\s*=\s*"([^"]+)"/.exec(readFileSync(`${ROOT}/netlify.toml`,'utf8'))[1];
const B='00000000-0000-4000-8000-000000000951', PREFIX='titan_onboarding_draft_v1:';
let server,browser,BASE;
before(async()=>{
 const port=await new Promise(resolve=>{const s=createServer();s.listen(0,()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 BASE=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['tools/serve-public.mjs',String(port)],{cwd:ROOT,stdio:'ignore'});
 let ready=false;for(let i=0;i<50;i++){try{if((await fetch(BASE)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.ok(ready);browser=await chromium.launch();
});
after(async()=>{await browser?.close();server?.kill();});
async function fixture(width=360,blocked=false){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  if(new URL(route.request().url()).hostname!=='127.0.0.1')return route.abort('internetdisconnected');
  try{
   const response=await route.fetch(),headers={...response.headers()};
   if(route.request().resourceType()==='document')headers['content-security-policy']=POLICY;
   await route.fulfill({response,headers});
  }catch{/* a request still in flight when the page navigates or the context closes is already settled */}
 });
 if(blocked)await context.addInitScript(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('titan_onboarding_draft_v1:'))throw Error('Synthetic draft storage failure');return set.call(this,k,v);};});
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(2500);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Content Security Policy/i.test(m.text()))errors.push(m.text());});
 await page.goto(BASE+'/onboarding');await page.locator('[data-next]').waitFor();
 const owner=await page.evaluate(()=>window.state.user.id);
 return {page,context,errors,owner};
}
async function close(context){await context.unrouteAll({behavior:'wait'});await context.close();}
async function step(page,n){assert.equal(await page.locator('[role="progressbar"]').getAttribute('aria-valuenow'),String(n));}
async function go(page){for(let i=0;i<3;i++)await page.locator('[data-next]').click();}
async function switchTo(page,id,user){
 await page.evaluate(({id,user})=>{
  window.titanAccountTransition={active:true,owner:id,epoch:(window.titanAccountTransition?.epoch||0)+1};
  window.dispatchEvent(new Event('titan:account-changing'));
  window.state.user=user||{...window.state.user,id,favoriteSports:[],weeklyGoalSessions:3,onboardingComplete:false,onboardedAt:null};
  window.titanAccountTransition.active=false;window.dispatchEvent(new Event('titan:account-changed'));
 },{id,user});
}
for(const width of [360,1280]){
 test(`onboarding resume: sports/rhythm/step survive reload without applying preferences or draft consent at ${width}px`,async()=>{
  const {page,context,errors,owner}=await fixture(width);
  try{
   const before=await page.evaluate(()=>({sports:window.state.user.favoriteSports,target:window.state.user.weeklyGoalSessions}));
   await page.locator('[data-pick="running"]').click();await page.locator('[data-next]').click();
   await page.locator('[data-target="2"]').click();await page.locator('[data-next]').click();
   await page.locator('[data-analytics]').check();
   assert.equal(await page.evaluate(()=>window.TitanAnalytics.consent()==='granted'),false,'draft checkbox grants nothing');
   assert.deepEqual(await page.evaluate(()=>({sports:window.state.user.favoriteSports,target:window.state.user.weeklyGoalSessions})),before);
   const draft=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),PREFIX+owner);
   assert.equal(draft.ownerId,owner);assert.equal(Object.hasOwn(draft,'analytics'),false,'consent is never in the draft');
   await page.reload();await page.locator('[data-analytics]').waitFor();await step(page,3);
   assert.equal(await page.locator('[data-analytics]').isChecked(),false,'current consent, not stale provisional choice');
   await page.locator('[data-back]').click();assert.equal(await page.locator('[data-target="2"]').getAttribute('aria-checked'),'true');
   await page.locator('[data-back]').click();assert.equal(await page.locator('[data-pick="running"]').getAttribute('aria-pressed'),'true');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  }finally{await close(context);}
 });
 test(`onboarding resume: return from another page then finish clears the draft; sport and adventure remain optional at ${width}px`,async()=>{
  const {page,context,errors,owner}=await fixture(width);
  try{
   await go(page);await page.goto(BASE+'/service');await page.goto(BASE+'/onboarding');
   await page.locator('[data-finish]').first().waitFor();await step(page,4);
   assert.equal(await page.locator('[data-finish][href="/training"]').count(),1,'no sport choice mandatory');
   assert.equal(await page.locator('[data-finish][href="/adventure"]').count(),1,'adventure is an independent choice');
   await page.locator('[data-finish][href="/aujourdhui"]').click();await page.waitForURL('**/aujourdhui');
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),PREFIX+owner),null);
   await page.goto(BASE+'/onboarding?again=1');await page.locator('[data-next]').waitFor();await step(page,1);
   assert.deepEqual(errors,[]);
  }finally{await close(context);}
 });
}
test('onboarding resume: expired, future, malformed and foreign drafts never supply choices',async()=>{
 const {page,context,errors,owner}=await fixture();
 try{
  for(const bad of ['syntax','expired','future','owner','basis','version','step','target','sport','duplicate']){
   await page.evaluate(({key,owner,bad})=>{
    const d={version:1,ownerId:owner,basis:'',updatedAt:Date.now(),step:2,sports:['running'],target:2};
    if(bad==='expired')d.updatedAt-=48*3600000+1;if(bad==='future')d.updatedAt+=3600000;
    if(bad==='owner')d.ownerId='foreign';if(bad==='basis')d.basis='different';if(bad==='version')d.version=999;
    if(bad==='step')d.step=99;if(bad==='target')d.target=0;if(bad==='sport')d.sports=['invented'];if(bad==='duplicate')d.sports=['running','running'];
    localStorage.setItem(key,bad==='syntax'?'{':JSON.stringify(d));
   },{key:PREFIX+owner,owner,bad});
   await page.reload();await page.locator('[data-next]').waitFor();await step(page,1);
   assert.equal(await page.locator('[data-pick="running"]').getAttribute('aria-pressed'),'false',bad);
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),PREFIX+owner),null,bad);
  }
  assert.deepEqual(errors,[]);
 }finally{await close(context);}
});
test('onboarding resume: blocked storage is explained and does not prevent a local finish',async()=>{
 const {page,context,errors}=await fixture(360,true);
 try{
  await page.locator('[data-pick="running"]').click();
  await page.getByRole('status').filter({hasText:/reprise.*indisponible/i}).waitFor();
  await go(page);await page.locator('[data-finish][href="/aujourdhui"]').click();await page.waitForURL('**/aujourdhui');
  assert.deepEqual(errors,[]);
 }finally{await close(context);}
});
test('onboarding resume: A→B→A restores only each owner’s draft',async()=>{
 const {page,context,errors,owner}=await fixture();
 try{
  const user=await page.evaluate(()=>structuredClone(window.state.user));
  await page.locator('[data-pick="running"]').click();await page.locator('[data-next]').click();
  await switchTo(page,B);await page.locator('[data-pick="running"]').waitFor();await step(page,1);
  assert.equal(await page.locator('[data-pick="running"]').getAttribute('aria-pressed'),'false');
  await page.locator('[data-pick]').first().click();await page.locator('[data-next]').click();await page.locator('[data-target="7"]').click();
  await switchTo(page,owner,user);await page.locator('[data-target="3"]').waitFor();await step(page,2);
  assert.equal(await page.locator('[data-target="3"]').getAttribute('aria-checked'),'true');
  await page.locator('[data-back]').click();assert.equal(await page.locator('[data-pick="running"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).target,PREFIX+B),7);assert.deepEqual(errors,[]);
 }finally{await close(context);}
});
test('onboarding resume: a silent owner change invalidates the old click instead of applying it to B',async()=>{
 const {page,context,errors}=await fixture();
 try{
  await page.locator('[data-pick="running"]').click();
  await page.evaluate(id=>{window.state.user={...window.state.user,id,favoriteSports:[],weeklyGoalSessions:3,onboardingComplete:false};},B);
  await page.locator('[data-next]').click();await step(page,1);
  assert.equal(await page.locator('[data-pick="running"]').getAttribute('aria-pressed'),'false');assert.deepEqual(errors,[]);
 }finally{await close(context);}
});
test('onboarding resume: a late finish cannot navigate, finish or clear the new owner',async()=>{
 const {page,context,errors}=await fixture();
 try{
  await go(page);await page.evaluate(()=>{window.saveState=()=>new Promise(resolve=>{window.releaseOldOnboarding=resolve;});window.TitanAnalytics.setConsent=()=>true;});
  await page.locator('[data-finish]').first().click();await page.locator('#onboarding[aria-busy="true"]').waitFor();
  await switchTo(page,B);await page.locator('[data-next]').waitFor();
  await page.evaluate(async()=>{window.releaseOldOnboarding();await new Promise(resolve=>setTimeout(resolve,100));});
  assert.equal(new URL(page.url()).pathname,'/onboarding');await step(page,1);
  assert.equal(await page.evaluate(()=>window.state.user.onboardingComplete),false);
  assert.equal(await page.locator('#onboarding').getAttribute('aria-busy'),null);assert.deepEqual(errors,[]);
 }finally{await close(context);}
});
test('onboarding resume: silent owner replacement during finish unlocks a fresh journey',async()=>{
 const {page,context,errors}=await fixture();
 try{
  await go(page);await page.evaluate(()=>{window.saveState=()=>new Promise(resolve=>{window.releaseOldOnboarding=resolve;});window.TitanAnalytics.setConsent=()=>true;});
  await page.locator('[data-finish]').first().click();await page.locator('#onboarding[aria-busy="true"]').waitFor();
  await page.evaluate(id=>{window.state.user={...window.state.user,id,favoriteSports:[],weeklyGoalSessions:3,onboardingComplete:false,onboardedAt:null};window.releaseOldOnboarding();},B);
  await page.locator('[data-next]').waitFor();await step(page,1);
  assert.equal(new URL(page.url()).pathname,'/onboarding');
  assert.equal(await page.evaluate(()=>window.state.user.onboardingComplete),false);
  assert.equal(await page.locator('#onboarding').getAttribute('aria-busy'),null);assert.deepEqual(errors,[]);
 }finally{await close(context);}
});
test('onboarding resume: same-owner client and epoch replacements discard stale clicks',async()=>{
 const {page,context,errors}=await fixture();
 try{
  await page.locator('[data-pick="running"]').click();
  for(const replacement of ['client','epoch']){
   await page.evaluate(kind=>{if(kind==='client')window.titanClient={};else window.titanAccountTransition={active:false,epoch:(window.titanAccountTransition?.epoch||0)+1};},replacement);
   await page.locator('[data-next]').click();await step(page,1);
   assert.equal(await page.locator('[data-pick="running"]').getAttribute('aria-pressed'),'true');
   assert.deepEqual(await page.evaluate(()=>window.state.user.favoriteSports||[]),[]);
  }
  assert.deepEqual(errors,[]);
 }finally{await close(context);}
});
