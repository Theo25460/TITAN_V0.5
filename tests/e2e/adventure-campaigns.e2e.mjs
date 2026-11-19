// V1.5.3 — Quatre mondes, quatre mécaniques on the website. A Node-side fake of titan_adventure_campaign_*_v1 with the same JSON
// shape and the same rules as the SQL functions (V1.5.0 entry and route steps counted from the decision, frozen milestones 5
// and 6, one solved mechanic checked with the shared primitive, one outcome), built from the shared configuration itself and
// shared by every browser context so that two devices of one account see one canonical arc.
// Screenshots: TITAN_SHOTS=docs/v153 node --test tests/e2e/adventure-campaigns.e2e.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
globalThis.TitanAdventureRpg=require('../../js/core/adventure-rpg.js');
globalThis.TitanAdventureBranches=require('../../js/core/adventure-branches.js');
globalThis.TitanAdventureGuardian=require('../../js/core/adventure-guardian.js');
const C=require('../../js/core/adventure-campaigns.js');
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

const T=15;
// One admissible history for every account: 40 points on 2 days before the decision, then 20 points per new active day.
function account(owner,world,{legacy=false,noCampaign=false}={}){
 return {owner,world,legacy,noCampaign,entered:false,route:null,effort:40,days:2,effortSince:0,daysSince:0,earned:new Set(legacy?[1,2]:[1]),g:null,calls:[]};
}
const session=a=>{a.effort+=20;a.days+=1;if(a.route){a.effortSince+=20;a.daysSince+=1;}}; // one new confirmed session, any sport, any hour
const arc=world=>C.describe(world); // same configuration as the server (the Vallée through its V1.5.0/V1.5.1 contracts)
function snapshot(a){
 const d=arc(a.world),route=d.routes.find(r=>r.id===a.route);
 const v1=n=>!a.earned.has(n)&&(n===1||a.earned.has(n-1))&&a.effort>=n*T&&a.days>=Math.ceil(n/2);
 const step=n=>d.steps.find(s=>s.ordinal===n);
 const ready=n=>v1(n)&&(!route||!step(n)||(a.effortSince>=step(n).effortTargets*T&&a.daysSince>=step(n).daysTarget));
 const milestones=Array.from({length:18},(_,i)=>{const n=i+1;return {ordinal:n,arc:Math.ceil(n/6),chapter:Math.ceil(n/2),kind:'x',effortTarget:n*T,daysTarget:Math.ceil(n/2),earned:a.earned.has(n),ready:ready(n)};});
 const bstate=a.legacy?'legacy':!a.entered?'available':!a.route?'entered':'confirmed';
 const branch={state:bstate,pilot:d.id,version:1};
 if(bstate==='confirmed')Object.assign(branch,{route:a.route,effortSince:a.effortSince,daysSince:a.daysSince,
  steps:d.steps.map(s=>({ordinal:s.ordinal,kind:s.kind,effortTarget:s.effortTargets*T,daysTarget:s.daysTarget,branchReady:a.effortSince>=s.effortTargets*T&&a.daysSince>=s.daysTarget,earned:a.earned.has(s.ordinal)})),
  clue:a.earned.has(3)?{id:route.clue,state:a.earned.has(4)?'usable':'found'}:null});
 let guardian={state:'none'},mechanic={state:'none'};
 if(bstate==='confirmed'){
  const g=a.g,m=milestones[a.earned.has(5)?5:4];
  const state=!a.earned.has(4)?'locked':!a.earned.has(5)?'observe':!g?.preparedAt?'prepare':g.outcome?'resolved':milestones[5].ready?'ready':'waiting';
  guardian={state,id:d.guardian.id,version:1,route:a.route,clue:route.clue,observeOrdinal:5,ordinal:6,signs:a.world==='aube'?route.slots[0].pool:[],
   observedAt:a.earned.has(5)?'2026-11-18T08:00:00Z':null,attempts:g?.attempts||0,lastSign:a.world==='aube'?g?.lastAnswer?.[0]||null:null,
   lastCorrect:a.world==='aube'&&g?.lastAnswer?g.lastAnswer[0]===route.answer[0]:null,preparedAt:g?.preparedAt||null,outcome:g?.outcome||null,resolvedAt:g?.resolvedAt||null,
   threshold:{ordinal:m.ordinal,effort:a.effort,effortTarget:m.effortTarget,days:a.days,daysTarget:m.daysTarget,chapter:9,chapterTarget:3,ready:m.ready},
   sincePrepared:{effort:0,sessions:0},corrected:{effort:0,sessions:0}};
  const check=g?.lastAnswer?C.check(d.guardian.primitive,route,g.lastAnswer):null;
  mechanic=['none','legacy','unknown'].includes(state)?{state:'none'}:{state,primitive:d.guardian.primitive,route:a.route,slots:route.slots,attempts:g?.attempts||0,
   lastAnswer:g?.lastAnswer||null,lastCorrect:check?check.correct:null,firstWrong:check?check.firstWrong:null,solved:!!g?.preparedAt};
 }
 return {version:1,owner:a.owner,world:a.world,active:true,chapter:9,target:T,days:a.days,effort:a.effort,familyTitles:[],milestones,
  rewards:[...a.earned].sort((x,y)=>x-y).map(o=>({ordinal:o,choice:o===2?(a.legacy?1:route?.choice??null):null,earnedAt:'2026-11-10T08:00:00Z'})),
  branchContract:1,branch,guardianContract:1,guardian,campaignContract:1,campaign:d.id,mechanic};
}
function serve(a,name,args){
 a.calls.push([name,args]);
 const fail=message=>({data:null,error:{message}});
 if(a.noCampaign&&name.startsWith('titan_adventure_campaign_'))return {data:null,error:{code:'PGRST202',message:'Could not find the function'}};
 if(a.noCampaign){ // a server without V1.5.3: no arc in this world, the v1 journal keeps working
  const s=snapshot(a);return {data:{...s,branch:{state:'none'},guardian:{state:'none'},campaign:undefined,mechanic:undefined},error:null};
 }
 const s=snapshot(a),d=arc(a.world),route=d.routes.find(r=>r.id===a.route),g=s.guardian;
 switch(args.p_action){
  case 'claim':{
   const n=args.p_ordinal;if(a.earned.has(n))break;
   if(!s.milestones[n-1].ready||(n===6&&!a.g?.outcome))return fail('ENCOUNTER_INCOMPLETE');
   a.earned.add(n);break;}
  case 'enter':if(a.legacy)return fail('BRANCH_INCOMPATIBLE');a.entered=true;break;
  case 'confirm':{
   if(!a.entered)return fail('BRANCH_NOT_ENTERED');if(a.route)break; // stable: a second device reads the canonical route back
   if(!d.routes.some(r=>r.id===args.p_route))return fail('INVALID_ROUTE');
   if(!s.milestones[1].ready)return fail('ENCOUNTER_INCOMPLETE');a.route=args.p_route;a.earned.add(2);break;}
  case 'solve':{
   if(g.state==='none')return fail('GUARDIAN_UNAVAILABLE');if(['locked','observe'].includes(g.state))return fail('GUARDIAN_NOT_OBSERVED');
   if(g.state!=='prepare')break; // solved: a late answer is not counted
   const r=C.check(d.guardian.primitive,route,args.p_answer);if(!r.valid)return fail(a.world==='aube'?'INVALID_SIGN':'INVALID_ANSWER');
   a.g={...(a.g||{}),attempts:(a.g?.attempts||0)+1,lastAnswer:args.p_answer,preparedAt:r.correct?new Date().toISOString():null};break;}
  case 'resolve':
   if(g.state==='prepare')return fail('GUARDIAN_NOT_PREPARED');if(g.state==='waiting')return fail('ENCOUNTER_INCOMPLETE');
   if(g.state==='ready'){a.g={...a.g,outcome:route.outcome,resolvedAt:new Date().toISOString()};a.earned.add(6);}break;
 }
 return {data:snapshot(a),error:null};
}
async function device(a,{width=390,reducedMotion='no-preference'}={}){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion,deviceScaleFactor:SHOTS?2:1});
 await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 await context.addInitScript(()=>localStorage.setItem('titan_first_run_guide_v2','done'));
 await context.exposeFunction('fakeCampaignServer',(name,args)=>serve(a,name,args));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/adventure');await page.waitForFunction(()=>window.TitanAdventure?.status==='ready');
 await page.evaluate(({owner,world})=>{
  window.state.user.id=owner;window.state.meta={...window.state.meta,firstRunGuideSeen:true,firstRunGuideVersion:'v2'};window.titanCloseFirstRunGuide?.();
  window.titanClient.auth.getSession=async()=>({data:{session:{user:{id:window.state.user.id},access_token:`token-${window.state.user.id}`}}});
  window.titanClient.rpc=(name,args)=>({setHeader:async()=>window.fakeCampaignServer(name,args)});
  window.TitanRpgPanel.reset();const host=document.createElement('section');host.dataset.rpgHost='';host.id='rpg-test';document.body.replaceChildren(host);
  window.TitanRpgPanel.mount(host,world);
 },{owner:a.owner,world:a.world});
 await page.locator('[data-rpg-secondary]>summary').click();
 await page.locator('[data-rpg-action="sync"]').waitFor();
 return {context,page,errors};
}
const writes=a=>a.calls.filter(([,args])=>args.p_action).map(([,args])=>args.p_action+(args.p_ordinal?`:${args.p_ordinal}`:''));
const shot=async(page,selector,name)=>{if(!SHOTS)return;await page.evaluate(()=>document.querySelectorAll('body *').forEach(el=>{if(getComputedStyle(el).position==='fixed')el.style.visibility='hidden';}));
 await page.locator(selector).first().screenshot({path:`${SHOTS}/${name}.png`});};
const gstate=page=>page.locator('.av-guardian').getAttribute('data-guardian-state');
const noScroll=page=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);
async function syncAfterSession(page,a){session(a);await page.locator('[data-rpg-action="sync"]').click();await page.waitForFunction(()=>document.querySelector('#rpg-test')?.getAttribute('aria-busy')==='false');}
async function setBoard(page,answer,slots){for(let i=0;i<slots.length;i++)await page.locator(`[data-mech-slot="${slots[i].id}"] input[value="${answer[i]}"]`).check();}

/* The whole first arc of a world, from the explicit entry to the resolution, with one wrong answer corrected. */
async function playArc(world,routeId,{width=390,shots=false,wrong}={}){
 const a=account(`00000000-0000-4000-8000-${world.padEnd(6,'0').slice(0,6)}${routeId.slice(0,6).padEnd(6,'0')}`.replace(/[^0-9a-f-]/g,'a'),world);
 const d=arc(world),route=d.routes.find(r=>r.id===routeId),p=k=>`${world}-${routeId}-${k}`;
 const {context,page,errors}=await device(a,{width});
 const run={};
 try{
  // Entry and choice: explicit, local until confirmed.
  await page.locator('.av-branch[data-branch-state="available"]').waitFor();
  run.equal=await page.locator('.av-branch .asc-small').first().innerText();
  await page.locator('[data-rpg-action="enter"]').click();
  await page.locator('.av-branch[data-branch-state="entered"]').waitFor();
  await page.locator(`[data-rpg-action="select"][data-branch-route="${routeId}"]`).click();
  if(shots)await shot(page,'.av-branch',p('01-choix'));
  await page.locator('[data-rpg-action="confirm"]').click();
  await page.locator(`.av-branch[data-branch-followed="${routeId}"]`).waitFor();
  // Route scene and clue: one new session each, any sport.
  await syncAfterSession(page,a);
  run.scene=await page.locator('.av-branch [data-branch-step] h4').innerText();
  run.sceneProgress=await page.locator('.av-branch [data-branch-step] .asc-small').first().innerText();
  if(shots)await shot(page,'.av-branch',p('02-scene'));
  await page.locator('.av-branch [data-rpg-action="claim"]').click();
  await page.locator('[data-branch-clue][data-clue-state="found"]').waitFor();
  await syncAfterSession(page,a);
  await page.locator('.av-branch [data-rpg-action="claim"]').click();
  await page.locator('[data-branch-clue][data-clue-state="usable"]').waitFor();
  run.clue=await page.locator('[data-branch-clue] p:last-child').innerText();
  // Observation (frozen milestone 5), then the world's mechanic.
  assert.equal(await gstate(page),'observe');run.observe=await page.locator('[data-guardian-threshold]').innerText();
  await page.locator('.av-guardian [data-rpg-action="claim"]').click();
  await page.locator('.av-guardian[data-guardian-state="prepare"]').waitFor();
  run.mechanic=await page.locator('.av-guardian').getAttribute('data-mechanic');
  run.phase=await page.locator('.av-guardian-phases li[aria-current="step"]').innerText();
  if(world==='aube'){
   // The Vallée keeps its three signs: each button is the one-slot answer of the common action.
   await page.locator(`[data-rpg-action="prepare"][data-guardian-sign="${wrong[0]}"]`).click();
   await page.locator('[data-guardian-feedback="wrong"]').waitFor();run.wrong=await page.locator('[data-guardian-feedback]').innerText();
   await page.locator(`[data-rpg-action="prepare"][data-guardian-sign="${route.answer[0]}"]`).click();
  }else{
  // An incomplete board is not sent.
  const before=a.calls.length;await page.locator('[data-rpg-action="solve"]').click();
  await page.locator('[data-rpg-error]',{hasText:'Choisis une réponse pour chaque case'}).waitFor();assert.equal(a.calls.length,before,'nothing sent');
  await setBoard(page,wrong,route.slots);
  run.board=await page.locator('[data-mech-board]').innerText();
  await page.locator('[data-rpg-action="solve"]').click();
  await page.locator('[data-guardian-feedback="wrong"]').waitFor();
  run.wrong=await page.locator('[data-guardian-feedback]').innerText();run.wrongSlot=await page.locator('[data-guardian-feedback]').getAttribute('data-feedback-slot');
  assert.equal(await gstate(page),'prepare');
  assert.deepEqual(await page.locator('[data-mech-slot] input:checked').evaluateAll(x=>x.map(i=>i.value)),wrong,'the last answer stays on the board');
  if(shots)await shot(page,'.av-guardian',p('03-mecanique-erreur'));
  await setBoard(page,route.answer,route.slots);
  await page.locator('[data-rpg-action="solve"]').click();
  }
  await page.locator('.av-guardian[data-guardian-state="waiting"]').waitFor();
  run.right=await page.locator('[data-guardian-feedback]').innerText();
  assert.equal(await page.locator('[data-rpg-action="resolve"]').isDisabled(),true);
  run.waiting=await page.locator('[data-guardian-threshold]').innerText();
  if(shots)await shot(page,'.av-guardian',p('04-attente'));
  await syncAfterSession(page,a);
  await page.locator('.av-guardian[data-guardian-state="ready"]').waitFor();
  await page.locator('[data-rpg-action="resolve"]').click();
  await page.locator(`[data-guardian-outcome="${route.outcome}"]`).waitFor();
  run.outcome=await page.locator('.av-guardian-outcome').innerText();run.caption=await page.locator('[data-guardian-caption]').innerText();
  run.resume=await page.locator('[data-guardian-resume]').innerText();
  if(shots)await shot(page,'.av-guardian',p('05-issue'));
  run.noScroll=await noScroll(page);run.writes=writes(a);run.errors=errors;
  return {run,a};
 }finally{await context.close();}
}

const WRONG={carte:['est','est','chenal'],gardienne:['calme','est','chenal'],soufflet:['charniere','buse','cuir'],artisans:['ressort','axe','tete'],
 constellations:['cairn','rocher','col'],histoire:['rocher','pin','cairn']};

test('Marées first: the full arc on both routes, same sessions, same thresholds, two scenes, one chart mechanic, two resolutions',async()=>{
 const runs={};
 for(const route of ['carte','gardienne'])runs[route]=(await playArc('marees',route,{width:route==='carte'?390:320,shots:true,wrong:WRONG[route]})).run;
 const [a,b]=[runs.carte,runs.gardienne];
 for(const r of [a,b]){assert.deepEqual(r.errors,[]);assert.equal(r.noScroll,true,'no horizontal scroll');assert.equal(r.mechanic,'chart');assert.match(r.phase,/^Tracer la carte/);}
 assert.equal(a.equal,b.equal);assert.match(a.equal,/30 points d’effort confirmés et 2 jours actifs.*N’importe quel sport compte, à l’heure qui te convient/);
 assert.equal(a.sceneProgress,b.sceneProgress);assert.equal(a.observe,b.observe);assert.equal(a.waiting,b.waiting);
 assert.match(a.observe,/^75\/75 points · 4\/3 jours actifs|^75\/75 points · 3\/3 jours actifs/);
 assert.deepEqual(a.writes,b.writes,'same server actions in the same order');
 assert.notEqual(a.scene,b.scene);assert.equal(a.scene,'La crique des cartes');assert.equal(b.scene,'Le ponton des pêcheurs');
 assert.match(a.clue,/au nord, le courant porte vers l’est.*Au sud, les bouées dérivent vers l’ouest/);
 assert.equal(a.wrongSlot,'sud');assert.match(a.wrong,/bouées du sud/);assert.equal(b.wrongSlot,'passage');
 assert.match(a.board,/Courant au nord de la crique : vers l’est · Courant au sud de la crique : vers l’est · Passage vers l’île : le chenal du nord/);
 assert.match(a.outcome,/le chenal ouvert/);assert.match(b.outcome,/le large franchi/);assert.notEqual(a.caption,b.caption);
 assert.match(a.resume,/Carte tracée : vers l’est, vers l’ouest, le chenal du nord/);
});

test('the same engine in the Forge and the Aurores: order of pieces and beacons to link, two resolutions each',async()=>{
 const out={};
 for(const [world,routes] of [['forge',['soufflet','artisans']],['aurores',['constellations','histoire']]])
  for(const route of routes)out[route]=(await playArc(world,route,{shots:true,wrong:WRONG[route]})).run;
 for(const r of Object.values(out)){assert.deepEqual(r.errors,[]);assert.equal(r.noScroll,true);}
 assert.equal(out.soufflet.mechanic,'sequence');assert.equal(out.constellations.mechanic,'link');
 assert.match(out.soufflet.phase,/^Assembler/);assert.match(out.histoire.phase,/^Relier les balises/);
 assert.deepEqual(out.soufflet.writes,out.histoire.writes,'same engine, same server actions');
 assert.equal(out.soufflet.observe,out.constellations.observe,'same thresholds in two worlds');
 assert.match(out.soufflet.board,/1\. la charnière → 2\. la buse → 3\. le cuir/);assert.equal(out.soufflet.wrongSlot,'p2');
 assert.match(out.artisans.wrong,/tout commence/);assert.match(out.constellations.board,/la balise du cairn — la balise du rocher — la balise du col/);
 assert.equal(out.histoire.wrongSlot,'arrivee');
 assert.match(out.soufflet.outcome,/le foyer ranimé/);assert.match(out.artisans.outcome,/l’enclume qui chante/);
 assert.match(out.constellations.outcome,/les balises rallumées/);assert.match(out.histoire.outcome,/le récit transmis/);
 assert.match(out.artisans.resume,/Ordre de montage : l’axe → le ressort → la tête du marteau/);
});

test('the Vallée keeps its routes and clues: the Veilleur is played through the common API (solve = one sign)',async()=>{
 const {run,a}=await playArc('aube','ruines',{wrong:['fissure']}).catch(e=>{throw e;});
 assert.deepEqual(run.errors,[]);assert.equal(run.scene,'Le poste des passeurs');assert.match(run.outcome,/le serment restitué/);
 const solves=a.calls.filter(([n,x])=>x.p_action==='solve').map(([n,x])=>[n,x.p_answer]);
 assert.deepEqual(solves,[['titan_adventure_campaign_action_v1',['fissure']],['titan_adventure_campaign_action_v1',['gravure']]]);
});

test('another device resumes the same board; a late answer is not counted; offline sends nothing',async()=>{
 const a=account('00000000-0000-4000-8000-00000000f001','forge');
 Object.assign(a,{entered:true,route:'soufflet',effort:80,days:4,effortSince:40,daysSince:2,earned:new Set([1,2,3,4,5])});
 const one=await device(a),two=await device(a);
 try{
  const slots=arc('forge').routes[0].slots;
  await setBoard(one.page,['charniere','buse','cuir'],slots);await one.page.locator('[data-rpg-action="solve"]').click();
  await one.page.locator('[data-guardian-feedback="wrong"]').waitFor();
  // The second device opens later: same feedback, the last answer already placed.
  await two.page.locator('[data-rpg-action="sync"]').click();await two.page.locator('[data-guardian-feedback="wrong"]').waitFor();
  assert.equal(await two.page.locator('[data-guardian-feedback]').innerText(),await one.page.locator('[data-guardian-feedback]').innerText());
  assert.deepEqual(await two.page.locator('[data-mech-slot] input:checked').evaluateAll(x=>x.map(i=>i.value)),['charniere','buse','cuir']);
  await setBoard(two.page,['charniere','cuir','buse'],slots);await two.page.locator('[data-rpg-action="solve"]').click();
  await two.page.locator('.av-guardian[data-guardian-state="waiting"]').waitFor();
  // The first device, still on the board, sends a wrong order: the server keeps the solution and does not count it.
  await one.page.locator('[data-rpg-action="solve"]').click();await one.page.locator('.av-guardian[data-guardian-state="waiting"]').waitFor();
  assert.equal(a.g.attempts,2);assert.deepEqual(a.g.lastAnswer,['charniere','cuir','buse']);
  assert.match(await one.page.locator('[data-guardian-resume]').innerText(),/Ordre de montage : la charnière → le cuir → la buse/);
  // Offline: nothing is sent, the last confirmed state stays shown.
  await one.context.setOffline(true);const calls=a.calls.length;
  await one.page.locator('[data-rpg-action="sync"]').click();
  await one.page.locator('[data-rpg-error]',{hasText:'Hors ligne'}).waitFor();assert.equal(a.calls.length,calls);
  assert.equal(await gstate(one.page),'waiting');
  assert.deepEqual([...one.errors,...two.errors],[]);
 }finally{await one.context.close();await two.context.close();}
});

test('old chapters and old servers: a legacy Marées journey keeps its version; without V1.5.3 the v1 journal keeps working',async()=>{
 const legacy=account('00000000-0000-4000-8000-00000000f002','marees',{legacy:true});
 const l=await device(legacy);
 try{
  await l.page.locator('.av-branch[data-branch-state="legacy"]').waitFor();
  assert.match(await l.page.locator('.av-branch').innerText(),/version d’origine et tous ses acquis/);
  assert.equal(await l.page.locator('[data-rpg-action="enter"]').count(),0);
  assert.match(await l.page.locator('.av-rpg-path').first().innerText(),/acquis/);
 }finally{await l.context.close();}
 const old=account('00000000-0000-4000-8000-00000000f003','aurores',{noCampaign:true});
 const o=await device(old);
 try{
  assert.equal(await o.page.locator('.av-branch').count(),0,'no arc shown without the server contract');
  assert.match(await o.page.locator('.av-rpg-scene h3').innerText(),/Deux pistes se dessinent/);
  const names=old.calls.map(([n])=>n);
  assert.equal(names[0],'titan_adventure_campaign_snapshot_v1');assert.equal(names[1],'titan_adventure_guardian_snapshot_v1','silent fallback');
  assert.deepEqual(o.errors,[]);
 }finally{await o.context.close();}
});

test('reduced motion: the guardian takes its pose at once and the caption describes the scene',async()=>{
 const a=account('00000000-0000-4000-8000-00000000f004','aurores');
 Object.assign(a,{entered:true,route:'histoire',effort:100,days:5,effortSince:60,daysSince:3,earned:new Set([1,2,3,4,5]),g:{attempts:1,lastAnswer:['rocher','pin','col'],preparedAt:'2026-11-19T09:00:00Z'}});
 const {context,page,errors}=await device(a,{reducedMotion:'reduce',width:320});
 try{
  await page.locator('.av-guardian[data-guardian-state="ready"]').waitFor();
  assert.ok(parseFloat(await page.locator('.av-guardian-figure').evaluate(el=>getComputedStyle(el).transitionDuration))<0.001,'no transition');
  await page.locator('[data-rpg-action="resolve"]').click();await page.locator('[data-guardian-outcome="recit_transmis"]').waitFor();
  assert.equal(await page.locator('.av-guardian-scene').getAttribute('data-pose'),'resolved');
  assert.match(await page.locator('[data-guardian-caption]').innerText(),/Le récit de la voyageuse est au registre/);
  assert.equal(await page.locator('.av-guardian-stage').getAttribute('aria-hidden'),'true');
  assert.equal(await noScroll(page),true);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
