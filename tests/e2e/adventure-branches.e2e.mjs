// V1.5.0 — Bifurcations on the website. A Node-side fake of titan_adventure_branch_*_v1 (same JSON shape as the SQL
// functions, shared by every browser context so that two devices of one account see one canonical route).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
let browser,server,base;
const ROOT=new URL('../..',import.meta.url).pathname;
before(async()=>{
 const port=await new Promise(resolve=>{const probe=createServer();probe.listen(0,()=>{const p=probe.address().port;probe.close(()=>resolve(p));});});
 base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['tools/serve-public.mjs',String(port)],{cwd:ROOT,stdio:'ignore'});
 for(let i=0;i<60;i++){try{if((await fetch(base+'/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();
});
after(async()=>{await browser?.close();server?.kill();});

const ROUTES={corniche:0,ruines:1};
// One account on the fake server. Sessions are the same for every account: what differs is only the route.
function account(owner,{entered=true,route=null,effortSince=20,daysSince=1,earned=[1]}={}){
 return {owner,entered,route,effortSince,daysSince,earned:new Set(earned),calls:[]};
}
function snapshot(a){
 const T=15,steps=[{ordinal:3,kind:'scene',effortTarget:T,daysTarget:1},{ordinal:4,kind:'clue',effortTarget:2*T,daysTarget:2}]
  .map(s=>({...s,branchReady:a.effortSince>=s.effortTarget&&a.daysSince>=s.daysTarget,earned:a.earned.has(s.ordinal),earnedAt:null}));
 const milestones=Array.from({length:18},(_,i)=>{const n=i+1,step=steps.find(s=>s.ordinal===n);
  const v1=!a.earned.has(n)&&(n===1||a.earned.has(n-1));
  return {ordinal:n,effortTarget:n*T,daysTarget:Math.ceil(n/2),earned:a.earned.has(n),ready:v1&&(!a.route||!step||step.branchReady)};});
 const state=a.route?'confirmed':a.entered?'entered':'available';
 return {version:1,owner:a.owner,world:'aube',active:true,chapter:9,target:T,days:6,effort:120,familyTitles:[],milestones,
  rewards:[...a.earned].sort((x,y)=>x-y).map(o=>({ordinal:o,choice:o===2?ROUTES[a.route]:null,earnedAt:'2026-11-10T08:00:00Z'})),
  branchContract:1,branch:state==='confirmed'?{state,pilot:'aube-arc1',version:1,route:a.route,effortSince:a.effortSince,daysSince:a.daysSince,steps,
   clue:a.earned.has(3)?{id:a.route==='corniche'?'prise':'serment',state:a.earned.has(4)?'usable':'found'}:null}:{state,pilot:'aube-arc1',version:1}};
}
function serve(a,name,args){
 // This fake is a server with V1.5.0 but without V1.5.1: the guardian RPCs do not exist and the client falls back.
 if(name.startsWith('titan_adventure_guardian_'))return {data:null,error:{code:'PGRST202',message:'Could not find the function public.'+name}};
 a.calls.push([name,args]);
 if(name==='titan_adventure_branch_action_v1'){
  if(args.p_action==='enter')a.entered=true;
  if(args.p_action==='confirm'&&!a.route){a.route=args.p_route;a.earned.add(2);} // first confirmation wins, later ones read it back
  if(args.p_action==='claim'){const m=snapshot(a).milestones.find(x=>x.ordinal===args.p_ordinal);if(!m.ready)return {data:null,error:{message:'ENCOUNTER_INCOMPLETE'}};a.earned.add(args.p_ordinal);}
 }
 return {data:snapshot(a),error:null};
}
async function device(a,{width=390}={}){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
 await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 await context.addInitScript(()=>localStorage.setItem('titan_first_run_guide_v2','done'));
 await context.exposeFunction('fakeBranchServer',(name,args)=>serve(a,name,args));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/adventure');await page.waitForFunction(()=>window.TitanAdventure?.status==='ready');
 await page.evaluate(owner=>{
  window.state.user.id=owner;window.state.meta={...window.state.meta,firstRunGuideSeen:true,firstRunGuideVersion:'v2'};window.titanCloseFirstRunGuide?.();
  window.titanClient.auth.getSession=async()=>({data:{session:{user:{id:window.state.user.id},access_token:`token-${window.state.user.id}`}}});
  window.titanClient.rpc=(name,args)=>({setHeader:async()=>window.fakeBranchServer(name,args)});
  window.TitanRpgPanel.reset();const host=document.createElement('section');host.dataset.rpgHost='';host.id='rpg-test';document.body.replaceChildren(host);
  window.TitanRpgPanel.mount(host,'aube');
 },a.owner);
 await page.locator('[data-rpg-secondary]>summary').click();
 await page.locator('.av-rpg-path li').first().waitFor();
 return {context,page,errors};
}
const writes=a=>a.calls.filter(([,args])=>args.p_action).map(([,args])=>[args.p_action,args.p_route??args.p_ordinal??null]);

test('two accounts, same sessions: two routes with different scenes, interactions and clues for the same effort',async()=>{
 const runs={};
 for(const route of ['corniche','ruines']){
  const a=account(`00000000-0000-4000-8000-00000000000${route==='corniche'?1:2}`,{route,earned:[1,2]});
  const {context,page,errors}=await device(a,{width:320});
  try{
   const step=page.locator('[data-branch-step="3"]');await step.waitFor();
   const progress=await step.locator('.asc-small').first().innerText();
   await step.locator('[data-rpg-action="claim"]').click();
   await page.locator('[data-branch-clue][data-clue-state="found"]').waitFor();
   a.effortSince=40;a.daysSince=2; // a second active day after the decision, same for both accounts
   await page.locator('[data-rpg-action="sync"]').click();
   const clueStep=page.locator('[data-branch-step="4"]');await clueStep.waitFor();
   const interaction=await clueStep.locator('[data-rpg-action="claim"]').innerText();
   await clueStep.locator('[data-rpg-action="claim"]').click();
   const clue=page.locator('[data-branch-clue][data-clue-state="usable"]');await clue.waitFor();
   runs[route]={progress,scene:await page.locator('.av-rpg-path li').nth(2).innerText(),interaction,clue:await clue.innerText(),clueId:await clue.getAttribute('data-branch-clue'),
    map:await page.locator('.av-rpg-path').first().innerText(),writes:writes(a)};
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll at 320 px');
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
 assert.equal(runs.corniche.progress,runs.ruines.progress,'same effort asked');
 assert.match(runs.corniche.progress,/^15\/15 points · 1\/1 jours actifs depuis ta décision/);
 assert.deepEqual(runs.corniche.writes,runs.ruines.writes,'same number and order of server actions');
 assert.equal(runs.corniche.interaction,'Éprouver la prise');assert.equal(runs.ruines.interaction,'Déchiffrer le serment');
 assert.match(runs.corniche.scene,/La corniche effondrée/);assert.match(runs.ruines.scene,/Le poste des passeurs/);
 assert.equal(runs.corniche.clueId,'prise');assert.equal(runs.ruines.clueId,'serment');
 assert.match(runs.corniche.clue,/La prise dans la roche/);assert.match(runs.ruines.clue,/Le fragment du serment/);
 assert.match(runs.corniche.clue,/Indice utilisable face au Veilleur de pierre/);assert.match(runs.ruines.clue,/Indice utilisable face au Veilleur de pierre/);
});

test('explicit entry and decision; simultaneous confirmation on two devices; resume on a third device',async()=>{
 const a=account('00000000-0000-4000-8000-000000000003',{entered:false,earned:[1]});
 const phone=await device(a),laptop=await device(a);
 try{
  // Compatible point: the pilot is offered, never entered silently.
  await phone.page.locator('[data-branch-state="available"]').waitFor();
  assert.equal(await phone.page.locator('[data-rpg-choice]').count(),0,'legacy choice buttons replaced by the explicit entry');
  await phone.page.locator('[data-rpg-action="enter"]').click();
  await phone.page.locator('[data-branch-state="entered"]').waitFor();
  await laptop.page.locator('[data-rpg-action="sync"]').click();await laptop.page.locator('[data-branch-state="entered"]').waitFor();
  // Selecting is local; the confirmation states that the route becomes final.
  await phone.page.locator('[data-rpg-action="select"][data-branch-route="corniche"]').click();
  await laptop.page.locator('[data-rpg-action="select"][data-branch-route="ruines"]').click();
  assert.deepEqual(writes(a),[['enter',null],['sync',null]]);
  assert.match(await phone.page.locator('.av-branch-confirm').innerText(),/Confirmer la corniche \?[\s\S]*définitive pour ce compte, sur le Web comme sur Android/);
  // Both devices confirm at the same moment, each with its own route.
  await Promise.all([phone.page.locator('[data-rpg-action="confirm"]').click(),laptop.page.locator('[data-rpg-action="confirm"]').click()]);
  await phone.page.locator('[data-branch-state="confirmed"]').waitFor();await laptop.page.locator('[data-branch-state="confirmed"]').waitFor();
  const winner=a.route,loser=winner==='corniche'?laptop:phone,name=winner==='corniche'?'la corniche':'les ruines';
  assert.equal(writes(a).filter(([k])=>k==='confirm').length,2);
  assert.equal(await phone.page.locator('[data-branch-followed]').getAttribute('data-branch-followed'),winner);
  assert.equal(await laptop.page.locator('[data-branch-followed]').getAttribute('data-branch-followed'),winner);
  assert.equal(await loser.page.locator('[data-rpg-error]').innerText(),`Ta voie était déjà confirmée depuis un autre appareil : ${name}. Elle reste ta voie.`);
  assert.equal(await phone.page.locator('[data-rpg-action="select"]').count(),0,'stable after confirmation');
  // Resume on another device: the canonical route, the other one shown as not taken, no way to choose again.
  const tablet=await device(a);
  try{
   const text=await tablet.page.locator('[data-branch-state="confirmed"]').innerText();
   assert.match(text,new RegExp(`Voie suivie : ${name}`));assert.match(text,/Voie non empruntée/);
   assert.equal(await tablet.page.locator('[data-rpg-action="select"],[data-rpg-action="confirm"]').count(),0);
   assert.deepEqual(tablet.errors,[]);
  }finally{await tablet.context.close();}
  assert.deepEqual(phone.errors,[]);assert.deepEqual(laptop.errors,[]);
 }finally{await phone.context.close();await laptop.context.close();}
});

test('a session still pending keeps the next step closed until validation and sync',async()=>{
 const a=account('00000000-0000-4000-8000-000000000004',{route:'ruines',earned:[1,2,3],effortSince:20,daysSince:1});
 const {context,page,errors}=await device(a);
 try{
  const step=page.locator('[data-branch-step="4"]');await step.waitFor();
  assert.match(await step.innerText(),/20\/30 points · 1\/2 jours actifs depuis ta décision/);
  assert.match(await step.innerText(),/Une séance en attente compte dès sa validation, après actualisation/);
  assert.equal(await step.locator('[data-rpg-action="claim"]').isDisabled(),true);
  a.effortSince=40;a.daysSince=2; // moderation validated the pending session; nothing moves before a sync
  assert.equal(await step.locator('[data-rpg-action="claim"]').isDisabled(),true);
  await page.locator('[data-rpg-action="sync"]').click();
  await page.locator('[data-branch-step="4"] [data-rpg-action="claim"]:not([disabled])').waitFor();
  assert.match(await page.locator('[data-branch-step="4"]').innerText(),/30\/30 points · 2\/2 jours actifs/);
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('offline: the decision is not sent; back online, the canonical state decided elsewhere is shown',async()=>{
 const a=account('00000000-0000-4000-8000-000000000005',{entered:true,earned:[1]});
 const {context,page,errors}=await device(a);
 try{
  await page.locator('[data-rpg-action="select"][data-branch-route="corniche"]').click();
  await context.setOffline(true);
  await page.locator('[data-rpg-action="confirm"]').click();
  assert.equal(await page.locator('[data-rpg-error]').innerText(),'Hors ligne : ta décision n’est pas envoyée. Reconnecte-toi pour la confirmer.');
  assert.equal(writes(a).filter(([k])=>k==='confirm').length,0,'nothing queued or replayed');
  assert.equal(await page.locator('[data-rpg-action="confirm"][data-branch-route="corniche"]').count(),1,'the selection is kept');
  a.route='ruines';a.earned.add(2); // meanwhile, another device confirmed
  await context.setOffline(false);
  await page.locator('[data-branch-followed="ruines"]').waitFor();
  assert.equal(await page.locator('[data-rpg-error]').innerText(),'');
  assert.equal(writes(a).filter(([k])=>k==='confirm').length,0);
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
