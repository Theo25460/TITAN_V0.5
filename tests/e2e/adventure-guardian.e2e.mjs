// V1.5.1 — Gardiens on the website. A Node-side fake of titan_adventure_guardian_*_v1 with the same JSON shape and the same
// rules as the SQL functions (frozen milestone thresholds, one preparation, one outcome), shared by every browser context so
// that two devices of one account see one canonical encounter. Screenshots: TITAN_SHOTS=docs/v151 node --test <this file>.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
let browser,server,base;
const ROOT=new URL('../..',import.meta.url).pathname,SHOTS=process.env.TITAN_SHOTS?ROOT+process.env.TITAN_SHOTS:null;
if(SHOTS)mkdirSync(SHOTS,{recursive:true});
before(async()=>{
 const port=await new Promise(resolve=>{const probe=createServer();probe.listen(0,()=>{const p=probe.address().port;probe.close(()=>resolve(p));});});
 base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['tools/serve-public.mjs',String(port)],{cwd:ROOT,stdio:'ignore'});
 for(let i=0;i<60;i++){try{if((await fetch(base+'/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();
});
after(async()=>{await browser?.close();server?.kill();});

const T=15,CFG={corniche:{choice:0,clue:'prise',sign:'fissure',outcome:'passage_rouvert'},ruines:{choice:1,clue:'serment',sign:'gravure',outcome:'serment_restitue'}};
// Same sessions for every account: what differs is only the route. 80 points on 3 days opens the observation (5 x 15, 3 days).
function account(owner,route,{effort=80,days=3,earned=[1,2,3,4]}={}){
 return {owner,route,effort,days,earned:new Set(earned),g:null,since:0,corrected:0,calls:[],failNext:0};
}
const ready=(a,n)=>!a.earned.has(n)&&(n===1||a.earned.has(n-1))&&a.effort>=n*T&&a.days>=Math.ceil(n/2);
function guardian(a,ms){
 const c=CFG[a.route],m5=ms[4],m6=ms[5],g=a.g;
 if(a.earned.has(6)&&!g?.outcome)return {state:'legacy',id:'veilleur',version:1,route:a.route};
 const state=!a.earned.has(4)?'locked':!a.earned.has(5)?'observe':!g?.preparedAt?'prepare':g.outcome?'resolved':m6.ready?'ready':'waiting';
 const m=['locked','observe'].includes(state)?m5:m6;
 return {state,id:'veilleur',version:1,route:a.route,clue:c.clue,observeOrdinal:5,ordinal:6,signs:['fissure','gravure','mousse'],
  observedAt:a.earned.has(5)?'2026-11-18T08:00:00Z':null,attempts:g?.attempts||0,lastSign:g?.lastSign||null,
  lastCorrect:g?.lastSign?g.lastSign===c.sign:null,preparedAt:g?.preparedAt||null,outcome:g?.outcome||null,resolvedAt:g?.resolvedAt||null,
  threshold:{ordinal:m.ordinal,effort:a.effort,effortTarget:m.effortTarget,days:a.days,daysTarget:m.daysTarget,chapter:9,chapterTarget:3,ready:m.ready},
  sincePrepared:{effort:a.since*10,sessions:a.since},corrected:{effort:a.corrected,sessions:a.corrected?1:0}};
}
function snapshot(a){
 const milestones=Array.from({length:18},(_,i)=>{const n=i+1;return {ordinal:n,effortTarget:n*T,daysTarget:Math.ceil(n/2),chapter:Math.ceil(n/2),earned:a.earned.has(n),ready:ready(a,n)};});
 const c=CFG[a.route];
 return {version:1,owner:a.owner,world:'aube',active:true,chapter:9,target:T,days:a.days,effort:a.effort,familyTitles:[],milestones,
  rewards:[...a.earned].sort((x,y)=>x-y).map(o=>({ordinal:o,choice:o===2?c.choice:null,earnedAt:'2026-11-10T08:00:00Z'})),
  branchContract:1,branch:{state:'confirmed',pilot:'aube-arc1',version:1,route:a.route,effortSince:40,daysSince:2,
   steps:[{ordinal:3,kind:'scene',effortTarget:T,daysTarget:1,branchReady:true,earned:true},{ordinal:4,kind:'clue',effortTarget:2*T,daysTarget:2,branchReady:true,earned:true}],
   clue:{id:c.clue,state:'usable'}},
  guardianContract:1,guardian:guardian(a,milestones)};
}
function serve(a,name,args){
 // This fake is a server with V1.5.1 but without V1.5.3: the campaign RPCs do not exist and the client falls back.
 if(name.startsWith('titan_adventure_campaign_'))return {data:null,error:{code:'PGRST202',message:'Could not find the function public.'+name}};
 a.calls.push([name,args]);
 if(a.failNext>0){a.failNext--;return {__network:true};}
 const fail=message=>({data:null,error:{message}});
 if(name==='titan_adventure_guardian_action_v1'){
  const s=snapshot(a),g=s.guardian,c=CFG[a.route];
  if(args.p_action==='claim'){if(!s.milestones[args.p_ordinal-1].ready)return fail('ENCOUNTER_INCOMPLETE');if(args.p_ordinal===6&&!a.g?.outcome)return fail('ENCOUNTER_INCOMPLETE');a.earned.add(args.p_ordinal);}
  if(args.p_action==='prepare'){
   if(['locked','observe'].includes(g.state))return fail('GUARDIAN_NOT_OBSERVED');
   if(g.state==='prepare'){if(!['fissure','gravure','mousse'].includes(args.p_sign))return fail('INVALID_SIGN');
    a.g={...(a.g||{attempts:0}),attempts:(a.g?.attempts||0)+1,lastSign:args.p_sign,preparedAt:args.p_sign===c.sign?new Date().toISOString():null};}
  }
  if(args.p_action==='resolve'){
   if(['locked','observe'].includes(g.state))return fail('GUARDIAN_NOT_OBSERVED');
   if(g.state==='prepare')return fail('GUARDIAN_NOT_PREPARED');
   if(g.state==='waiting')return fail('ENCOUNTER_INCOMPLETE');
   if(g.state==='ready'){a.g={...a.g,outcome:c.outcome,resolvedAt:new Date().toISOString()};a.earned.add(6);} // one outcome; later calls read it back
  }
 }
 return {data:snapshot(a),error:null};
}
async function device(a,{width=390,reducedMotion='no-preference'}={}){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion,deviceScaleFactor:SHOTS?2:1});
 await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 await context.addInitScript(()=>localStorage.setItem('titan_first_run_guide_v2','done'));
 await context.exposeFunction('fakeGuardianServer',(name,args)=>serve(a,name,args));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/adventure');await page.waitForFunction(()=>window.TitanAdventure?.status==='ready');
 await page.evaluate(owner=>{
  window.state.user.id=owner;window.state.meta={...window.state.meta,firstRunGuideSeen:true,firstRunGuideVersion:'v2'};window.titanCloseFirstRunGuide?.();
  window.titanClient.auth.getSession=async()=>({data:{session:{user:{id:window.state.user.id},access_token:`token-${window.state.user.id}`}}});
  window.titanClient.rpc=(name,args)=>({setHeader:async()=>{const r=await window.fakeGuardianServer(name,args);if(r?.__network)throw new TypeError('Failed to fetch');return r;}});
  window.TitanRpgPanel.reset();const host=document.createElement('section');host.dataset.rpgHost='';host.id='rpg-test';document.body.replaceChildren(host);
  window.TitanRpgPanel.mount(host,'aube');
 },a.owner);
 await page.locator('[data-rpg-secondary]>summary').click();
 await page.locator('.av-guardian').waitFor();
 return {context,page,errors};
}
const writes=a=>a.calls.filter(([,args])=>args.p_action).map(([,args])=>[args.p_action,args.p_sign??args.p_ordinal??null]);
// Screenshots only: the app's fixed bars would cover part of the captured section.
const shot=async(page,name)=>{if(!SHOTS)return;await page.evaluate(()=>document.querySelectorAll('body *').forEach(el=>{if(getComputedStyle(el).position==='fixed')el.style.visibility='hidden';}));
 await page.locator('.av-guardian').screenshot({path:`${SHOTS}/${name}.png`});};
const state=page=>page.locator('.av-guardian').getAttribute('data-guardian-state');

test('two accounts, same sessions: observe, prepare with a corrected interpretation and resolve, for the same effort',async()=>{
 const runs={};
 for(const route of ['corniche','ruines']){
  const a=account(`00000000-0000-4000-8000-0000000001${route==='corniche'?'01':'02'}`,route);
  const {context,page,errors}=await device(a,{width:320});
  try{
   const run={};
   assert.equal(await state(page),'observe');
   run.observe=await page.locator('[data-guardian-threshold]').innerText();
   assert.match(await page.locator('[data-guardian-caption]').innerText(),/bloque entièrement/);
   if(route==='corniche')await shot(page,'01-observer');
   await page.locator('.av-guardian [data-rpg-action="claim"]').click();
   await page.locator('.av-guardian[data-guardian-state="prepare"]').waitFor();
   assert.match(await page.locator('[data-guardian-caption]').innerText(),/fissure.*gravure.*mousse/);
   // A wrong interpretation gets a concrete answer tied to the clue, and stays correctable.
   const wrong=route==='corniche'?'gravure':'fissure';
   await page.locator(`[data-rpg-action="prepare"][data-guardian-sign="${wrong}"]`).click();
   await page.locator('[data-guardian-feedback="wrong"]').waitFor();
   run.wrong=await page.locator('[data-guardian-feedback]').innerText();
   assert.equal(await state(page),'prepare');
   if(route==='corniche')await shot(page,'02-preparer-erreur');
   await page.locator(`[data-rpg-action="prepare"][data-guardian-sign="${CFG[route].sign}"]`).click();
   await page.locator('.av-guardian[data-guardian-state="waiting"]').waitFor();
   run.right=await page.locator('[data-guardian-feedback]').innerText();
   run.waiting=await page.locator('[data-guardian-threshold]').innerText();
   assert.match(await page.locator('[data-guardian-next]').innerText(),/^Aucune séance validée depuis ta préparation\. Ce qui ouvre la suite : 10 point\(s\)/);
   assert.equal(await page.locator('[data-rpg-action="resolve"]').isDisabled(),true);
   if(route==='corniche')await shot(page,'03-attente-reprise');
   // The next eligible contribution, then a sync: the server opens the resolution. The session itself needed nothing from the game.
   a.effort=100;a.days=4;a.since=1;
   await page.locator('[data-rpg-action="sync"]').click();
   await page.locator('.av-guardian[data-guardian-state="ready"] [data-rpg-action="resolve"]:not([disabled])').waitFor();
   run.action=await page.locator('[data-rpg-action="resolve"]').innerText();
   await page.locator('[data-rpg-action="resolve"]').click();
   await page.locator('.av-guardian[data-guardian-state="resolved"]').waitFor();
   // The Veilleur moves from its previous pose: wait for the final one before reading the scene.
   await page.locator(`.av-guardian-scene[data-pose="${route==='corniche'?'aside':'bowing'}"]`).waitFor();
   const fig=page.locator('.av-guardian-scene');
   run.pose=await fig.getAttribute('data-pose');run.passage=await fig.getAttribute('data-passage');run.oath=await fig.getAttribute('data-oath');
   run.outcome=await page.locator('.av-guardian-outcome').getAttribute('data-guardian-outcome');
   run.outcomeText=await page.locator('.av-guardian-outcome').innerText();
   run.caption=await page.locator('[data-guardian-caption]').innerText();
   run.bestiary=await page.locator('details.av-rules').first().locator('summary').innerText();
   run.writes=writes(a).map(([k])=>k);
   await shot(page,`04-issue-${route}`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll at 320 px');
   assert.deepEqual(errors,[]);
   runs[route]=run;
  }finally{await context.close();}
 }
 const [c,r]=[runs.corniche,runs.ruines];
 assert.equal(c.observe,r.observe);assert.match(c.observe,/^75\/75 points · 3\/3 jours actifs · chapitre 3\/3$/);
 assert.equal(c.waiting,r.waiting);assert.match(c.waiting,/^80\/90 points · 3\/3 jours actifs/);
 assert.deepEqual(c.writes,r.writes,'same server actions in the same order');
 assert.equal(c.bestiary,r.bestiary,'same usual rewards');
 assert.match(c.wrong,/entaille dans la roche/);assert.match(r.wrong,/ligne qui manque/);
 assert.match(c.right,/paroi peut tenir/);assert.match(r.right,/ligne qui manque au serment/);
 assert.equal(c.action,'Rouvrir le passage');assert.equal(r.action,'Restituer le serment');
 assert.equal(c.outcome,'passage_rouvert');assert.equal(r.outcome,'serment_restitue');
 assert.deepEqual([c.pose,c.passage],['aside','open']);assert.deepEqual([r.pose,r.oath,r.passage],['bowing','complete','closed']);
 assert.match(c.outcomeText,/Indice décisif : la prise dans la roche, associée à la fissure\.[\s\S]*Décision : tu as sécurisé la paroi/);
 assert.match(r.outcomeText,/Indice décisif : le fragment du serment, associé à la gravure\.[\s\S]*Décision : tu as restitué le serment/);
 assert.notEqual(c.caption,r.caption);
});

test('retry after a synchronisation failure, then a corrected session closes the resolution again',async()=>{
 const a=account('00000000-0000-4000-8000-000000000103','ruines',{effort:100,days:4,earned:[1,2,3,4,5]});
 a.g={attempts:1,lastSign:'gravure',preparedAt:'2026-11-18T09:00:00Z'};a.since=1;
 const {context,page,errors}=await device(a);
 try{
  assert.equal(await state(page),'ready');
  a.failNext=1; // the network drops on the next request
  await page.locator('[data-rpg-action="resolve"]').click();
  await page.locator('[data-rpg-error]:has-text("Synchronisation impossible")').waitFor();
  assert.equal(await state(page),'ready','the last confirmed state stays on screen');
  assert.equal(a.g.outcome,undefined,'nothing resolved by a failed request');
  // A correction meanwhile: the session is archived, its 20 points no longer count; the server closes the resolution again.
  a.effort=80;a.corrected=20;a.since=0;
  await page.locator('[data-rpg-action="sync"]').click();
  await page.locator('.av-guardian[data-guardian-state="waiting"]').waitFor();
  assert.match(await page.locator('[data-guardian-corrected]').innerText(),/Une séance corrigée ou en attente ne compte plus : 20 point\(s\)/);
  assert.equal(await page.locator('[data-rpg-action="resolve"]').isDisabled(),true);
  await shot(page,'05-seance-corrigee');
  a.effort=100;a.corrected=0;a.since=1; // restored (or replaced by another session)
  await page.locator('[data-rpg-action="sync"]').click();
  await page.locator('[data-rpg-action="resolve"]:not([disabled])').click();
  await page.locator('.av-guardian[data-guardian-state="resolved"]').waitFor();
  assert.equal(await page.locator('[data-rpg-error]').innerText(),'','the retry clears the failure');
  assert.equal(writes(a).filter(([k])=>k==='resolve').length,2,'one failed request, one retry');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('offline: nothing is sent; back online, the outcome confirmed on another device is shown; a third device resumes',async()=>{
 const a=account('00000000-0000-4000-8000-000000000104','corniche',{effort:100,days:4,earned:[1,2,3,4,5]});
 a.g={attempts:2,lastSign:'fissure',preparedAt:'2026-11-18T09:00:00Z'};
 const phone=await device(a),laptop=await device(a),stale=await device(a);
 try{
  await phone.context.setOffline(true);
  await phone.page.locator('[data-rpg-action="resolve"]').click();
  await phone.page.locator('[data-rpg-error]:has-text("Hors ligne")').waitFor();
  assert.equal(writes(a).filter(([k])=>k==='resolve').length,0,'nothing queued or replayed');
  // Meanwhile the laptop resolves; the phone, back online, reads the canonical outcome without replaying anything.
  await laptop.page.locator('[data-rpg-action="resolve"]').click();
  await laptop.page.locator('.av-guardian[data-guardian-state="resolved"]').waitFor();
  const resolvedAt=a.g.resolvedAt;
  await phone.context.setOffline(false);
  await phone.page.locator('.av-guardian[data-guardian-state="resolved"]').waitFor();
  assert.equal(await phone.page.locator('.av-guardian-outcome').getAttribute('data-guardian-outcome'),'passage_rouvert');
  assert.equal(writes(a).filter(([k])=>k==='resolve').length,1);
  // Double confirmation from a device still showing the ready state: the server reads the same outcome back.
  assert.equal(await state(stale.page),'ready');
  await stale.page.locator('[data-rpg-action="resolve"]').click();
  await stale.page.locator('.av-guardian[data-guardian-state="resolved"]').waitFor();
  assert.equal(a.g.resolvedAt,resolvedAt,'the second confirmation did not rewrite the outcome');
  assert.equal(await stale.page.locator('.av-guardian-outcome').getAttribute('data-guardian-outcome'),'passage_rouvert');
  await stale.context.close();
  const tablet=await device(a);
  try{
   assert.equal(await state(tablet.page),'resolved');
   assert.match(await tablet.page.locator('[data-guardian-resume]').innerText(),/Issue : le passage rouvert/);
   assert.equal(await tablet.page.locator('.av-guardian [data-rpg-action]').count(),0,'nothing to replay on another device');
   assert.deepEqual(tablet.errors,[]);
  }finally{await tablet.context.close();}
  assert.deepEqual(phone.errors,[]);assert.deepEqual(laptop.errors,[]);
 }finally{await phone.context.close();await laptop.context.close();}
});

test('reduced motion: the Veilleur changes pose without transition and the caption describes the whole scene',async()=>{
 const a=account('00000000-0000-4000-8000-000000000105','corniche',{effort:100,days:4,earned:[1,2,3,4,5]});
 a.g={attempts:1,lastSign:'fissure',preparedAt:'2026-11-18T09:00:00Z'};
 const moving=await device(a);
 try{
  assert.equal(await moving.page.locator('.av-guardian-figure').evaluate(el=>getComputedStyle(el).transitionDuration.split(',')[0]),'0.9s');
  // With motion, the new pose starts from the previous one at the moment the server confirms the outcome.
  await moving.page.locator('[data-rpg-action="resolve"]').click();
  await moving.page.locator('.av-guardian-scene[data-pose="aside"]').waitFor();
  assert.equal(await moving.page.locator('.av-guardian-figure').evaluate(el=>el.getAnimations().length>0||getComputedStyle(el).transform!=='none'),true);
 }finally{await moving.context.close();}
 const b=account('00000000-0000-4000-8000-000000000106','corniche',{effort:100,days:4,earned:[1,2,3,4,5]});
 b.g={attempts:1,lastSign:'fissure',preparedAt:'2026-11-18T09:00:00Z'};
 const {context,page,errors}=await device(b,{reducedMotion:'reduce'});
 try{
  const fig=page.locator('.av-guardian-figure');
  // The site-wide reduced-motion rule (css/ascension.css) brings every transition down to 0.01 ms: the pose changes at once.
  assert.ok(await fig.evaluate(el=>getComputedStyle(el).transitionDuration.split(',').every(d=>parseFloat(d)<0.001)),'no visible transition');
  assert.equal(await page.locator('.av-guardian-stage').getAttribute('aria-hidden'),'true','decorative stage');
  await page.locator('[data-rpg-action="resolve"]').click();
  await page.locator('.av-guardian[data-guardian-state="resolved"]').waitFor();
  assert.equal(await page.locator('.av-guardian-scene').getAttribute('data-pose'),'aside','no intermediate pose with reduced motion');
  const transform=await fig.evaluate(el=>getComputedStyle(el).transform);
  assert.notEqual(transform,'none','final pose applied at once');
  assert.equal(await page.locator('[data-guardian-caption]').innerText(),'Le Veilleur s’est écarté sur le côté. La paroi tient : le passage est ouvert.');
  assert.match(await page.locator('[data-guardian-feedback-live]').innerText(),/le passage rouvert/,'the outcome is announced');
  await shot(page,'06-mouvement-reduit');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
