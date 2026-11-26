// V1.5.5 — Chroniques et aventures rejouables on the website. A Node-side fake of titan_adventure_chronicles_v1 / _action_v1 with
// the same JSON shape and rules as the SQL functions: run 1 is a REAL server answer (tests/fixtures/adventure-chronicles.json,
// written by sql/tests/300_adventure_chronicles.sql), new runs follow the replay rules of js/core/adventure-chronicles.js (one
// active run per arc, a route definitive for the run, steps counted from the run's choice, the mechanic, one outcome). The fake
// is shared by every browser context, so two devices of one account (or the app reinstalled) read one canonical state. The
// player opens the real adventure page; the account is injected after load, as in the V1.5.1 to V1.5.4 journeys.
// Screenshots: TITAN_SHOTS=docs/v155 node --test <this file>.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
globalThis.TitanAdventureBranches=require('../../js/core/adventure-branches.js');
globalThis.TitanAdventureGuardian=require('../../js/core/adventure-guardian.js');
globalThis.TitanAdventureCampaigns=require('../../js/core/adventure-campaigns.js');
const C=require('../../js/core/adventure-chronicles.js');
let browser,server,base;
const ROOT=new URL('../..',import.meta.url).pathname,SHOTS=process.env.TITAN_SHOTS?ROOT+process.env.TITAN_SHOTS:null;
const F=JSON.parse(readFileSync(ROOT+'tests/fixtures/adventure-chronicles.json','utf8'));
if(SHOTS)mkdirSync(SHOTS,{recursive:true});
before(async()=>{
 const port=await new Promise(resolve=>{const probe=createServer();probe.listen(0,()=>{const p=probe.address().port;probe.close(()=>resolve(p));});});
 base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['tools/serve-public.mjs',String(port)],{cwd:ROOT,stdio:'ignore'});
 for(let i=0;i<60;i++){try{if((await fetch(base+'/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();
});
after(async()=>{await browser?.close();server?.kill();});

/* An account of the Vallée whose run 1 is a real server answer (original: ruines, achieved; legacy: v1 journal, achieved). */
const GUARD=globalThis.TitanAdventureGuardian.contract('veilleur',1),RULES=C.rules(1),TARGET=15;
function account(owner,kind,{missing=false}={}){
 const arc=JSON.parse(JSON.stringify((kind==='legacy'?F.legacy:F.original).arcs[0]));
 return {owner,missing,arc,original:arc.runs[0],runs:[],effort:0,days:0,calls:[],reads:[]};
}
const NOW=()=>new Date().toISOString();
const active=a=>a.runs.find(r=>!r.resolvedAt&&!r.abandonedAt)||null;
function runView(a,r){
 const since=r.route&&!r.resolvedAt&&!r.abandonedAt?{effort:a.effort-r.base.effort,days:a.days-r.base.days}:{effort:0,days:0};
 const at={scene:r.sceneAt,clue:r.clueAt,observe:r.observedAt,prepare:r.preparedAt,resolve:r.resolvedAt};
 const steps=RULES.steps.map(s=>({kind:s.kind,at:at[s.kind]||null,effortTarget:s.effortTargets?s.effortTargets*TARGET:null,daysTarget:s.daysTarget??null,
  ready:!s.effortTargets||(since.effort>=s.effortTargets*TARGET&&since.days>=s.daysTarget)}));
 const cur=steps.find(s=>!s.at);
 const state=r.abandonedAt?'abandoned':r.resolvedAt?'resolved':!r.route?'choose':cur.kind;
 const sign=GUARD.routes.find(x=>x.route===r.route)?.sign;
 return {run:r.run,kind:'replay',arc:'aube-arc1',version:1,rules:1,state,ready:['scene','clue','observe','prepare','resolve'].includes(state)?cur.ready:null,
  startedAt:r.startedAt,route:r.route,chosenAt:r.chosenAt,clue:r.route?globalThis.TitanAdventureBranches.contract('aube-arc1',1).routes.find(x=>x.id===r.route).clue:null,
  effortSince:since.effort,daysSince:since.days,steps,
  mechanic:r.route?{primitive:'pick',slots:[{id:'signe',pool:GUARD.signs}],attempts:r.attempts,lastAnswer:r.lastAnswer,
   lastCorrect:r.lastAnswer?r.lastAnswer[0]===sign:null,firstWrong:r.lastAnswer&&r.lastAnswer[0]!==sign?1:null,solved:!!r.preparedAt}:null,
  outcome:r.outcome||null,resolvedAt:r.resolvedAt||null,abandonedAt:r.abandonedAt||null};
}
function payload(a){
 const runs=[a.original,...a.runs.map(r=>runView(a,r))],o=a.original,act=active(a);
 const has=(route,k)=>(o.route===route&&(k==='outcome'?!!o.outcome:o.milestones.some(m=>m.ordinal===(k==='scene'?3:4))))
  ||runs.slice(1).some(r=>r.route===route&&(k==='outcome'?!!r.outcome:!!r.steps.find(s=>s.kind===k)?.at));
 return {contract:1,owner:a.owner,rules:1,arcs:[{...a.arc,activeRun:act?.run??null,runCount:runs.length,reads:a.reads.length,
  replayable:a.arc.completed&&!act,runs,discovered:['corniche','ruines'].map(route=>({route,scene:has(route,'scene'),clue:has(route,'clue'),outcome:has(route,'outcome')}))}]};
}
function serve(a,name,args){
 a.calls.push([name,args]);
 const fail=message=>({data:null,error:{message}});
 if(!name.startsWith('titan_adventure_chronicle')||a.missing)return fail('Could not find the function public.'+name);
 if(name==='titan_adventure_chronicles_v1')return {data:payload(a),error:null};
 const act=args.p_action,r=active(a);
 if(args.p_world!=='aube')return fail('CHRONICLE_UNAVAILABLE');
 if(act==='sync'||act==='read'){if(act==='read')a.reads.push(args.p_run);return {data:payload(a),error:null};}
 if(act==='start'){
  if(!r){if(!a.arc.completed)return fail('ARC_NOT_COMPLETED');a.runs.push({run:a.runs.length+2,startedAt:NOW(),route:null,attempts:0,lastAnswer:null});}
  return {data:payload(a),error:null};
 }
 if(!r){const last=a.runs.at(-1);if((act==='resolve'&&last?.resolvedAt)||(act==='abandon'&&last?.abandonedAt))return {data:payload(a),error:null};return fail('REPLAY_NOT_STARTED');}
 const v=runView(a,r);
 if(act==='abandon'){r.abandonedAt=NOW();return {data:payload(a),error:null};}
 if(act==='choose'){
  if(!['corniche','ruines'].includes(args.p_route))return fail('INVALID_ROUTE');
  if(!r.route){r.route=args.p_route;r.chosenAt=NOW();r.base={effort:a.effort,days:a.days};}
  return {data:payload(a),error:null};
 }
 if(!r.route)return fail('REPLAY_NOT_CHOSEN');
 if(act==='advance'){
  const key={scene:'sceneAt',clue:'clueAt',observe:'observedAt'}[args.p_step];if(!key)return fail('INVALID_STEP');
  if(r[key])return {data:payload(a),error:null};
  if(v.state!==args.p_step)return fail('REPLAY_STEP_ORDER');if(!v.ready)return fail('ENCOUNTER_INCOMPLETE');
  r[key]=NOW();return {data:payload(a),error:null};
 }
 if(act==='solve'){
  if(r.preparedAt)return {data:payload(a),error:null};
  if(v.state!=='prepare')return fail('GUARDIAN_NOT_OBSERVED');
  const ans=args.p_answer;if(!Array.isArray(ans)||ans.length!==1||!GUARD.signs.includes(ans[0]))return fail('INVALID_ANSWER');
  r.attempts++;r.lastAnswer=ans;if(ans[0]===GUARD.routes.find(x=>x.route===r.route).sign)r.preparedAt=NOW();
  return {data:payload(a),error:null};
 }
 if(act==='resolve'){
  if(v.state!=='resolve')return fail('GUARDIAN_NOT_PREPARED');if(!v.ready)return fail('ENCOUNTER_INCOMPLETE');
  r.outcome=GUARD.routes.find(x=>x.route===r.route).outcome;r.resolvedAt=NOW();return {data:payload(a),error:null};
 }
 return fail('INVALID_ACTION');
}
async function device(a,{width=390}={}){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',deviceScaleFactor:SHOTS?2:1});
 await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 await context.addInitScript(()=>localStorage.setItem('titan_first_run_guide_v2','done'));
 await context.exposeFunction('fakeChronicleServer',(name,args)=>serve(a,name,args));
 return {context,errors:[]};
}
async function open(d,a,world,hash=''){
 const page=await d.context.newPage();page.on('pageerror',e=>d.errors.push(e.message));
 await page.goto(`${base}/adventure?world=${world}${hash}`);
 await page.waitForFunction(()=>window.TitanAdventure?.status==='ready'&&document.querySelector('[data-chronicle-host]')&&window.TitanChroniclePanel);
 const snapshot=await page.evaluate(owner=>JSON.stringify({...window.TitanAdventure.snapshot,owner,local:undefined}),a.owner);
 await page.route('**/rest/v1/rpc/titan_adventure_snapshot',r=>r.fulfill({status:200,contentType:'application/json',body:snapshot}));
 await page.evaluate(({owner})=>{
  window.state.user.id=owner;window.state.meta={...window.state.meta,firstRunGuideSeen:true,firstRunGuideVersion:'v2'};window.titanCloseFirstRunGuide?.();
  window.titanClient={auth:{getSession:async()=>({data:{session:{user:{id:window.state.user.id},access_token:`token-${window.state.user.id}`}}})},
   rpc:(name,args)=>{const p=window.fakeChronicleServer(name,args||{});p.setHeader=()=>p;return p;}};
  window.TitanChroniclePanel.reset();window.TitanQuestPanel?.reset();window.TitanAdventure.refresh({force:true});
 },{owner:a.owner});
 await page.waitForFunction(owner=>window.TitanAdventure.status==='ready'&&window.TitanAdventure.snapshot?.owner===owner&&document.querySelector('[data-chronicle-host]')?.dataset.owner===owner,a.owner);
 await page.waitForTimeout(150);
 return page;
}
const writes=a=>a.calls.filter(([n,x])=>n==='titan_adventure_chronicle_action_v1'&&x.p_action!=='read').map(([,x])=>[x.p_action,...[x.p_run,x.p_route,x.p_step].filter(v=>v!=null),...(x.p_answer||[])]);
const host=page=>page.locator('[data-chronicle-host]');
const run=(page,n)=>page.locator(`[data-chronicle-host] [data-chronicle-run="${n}"]`);
const entries=(page,n)=>run(page,n).locator('[data-chronicle-entry] strong').allInnerTexts();
const hide=page=>page.evaluate(()=>document.querySelectorAll('body *').forEach(el=>{if(['fixed','sticky'].includes(getComputedStyle(el).position))el.style.visibility='hidden';}));
const shot=async(page,name,selector='[data-chronicle-host]')=>{if(!SHOTS)return;await hide(page);await page.locator(selector).first().screenshot({path:`${SHOTS}/${name}.png`});};
const noScroll=page=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
async function act(page,a,selector){const n=a.calls.length;await page.locator(selector).first().click();for(let i=0;i<100&&a.calls.length===n;i++)await page.waitForTimeout(20);await page.waitForTimeout(120);}

test('the scenario: the chronicle of the ruins, then a new run on the corniche played to its end, both stories kept',async()=>{
 const a=account('00000000-0000-4000-8000-000000000501','original');
 const d=await device(a);
 try{
  const page=await open(d,a,'aube','#chroniques');
  await page.waitForFunction(()=>document.activeElement?.id==='chroniques-title');
  assert.equal(await page.locator('[data-av-view="carnet"]').isVisible(),true,'#chroniques opens the Carnet view');
  assert.equal(await host(page).isHidden(),false);
  // Why the ruins, the clue used, the passage unlocked: run 1, read from the server facts of the arcs.
  const one=await entries(page,1);
  for(const x of ['Entrée dans l’arc','Décision : les ruines','Le poste des passeurs','Le fragment du serment','Observation : Le Veilleur de pierre','La mécanique résolue','Issue : le serment restitué','Accès découvert : L’archive des passeurs','Indice suivi : Le symbole du cerf'])
   assert.ok(one.includes(x),`${x} in ${one.join(' | ')}`);
  assert.match(await page.locator('[data-chronicle-active]').innerText(),/Issue active dans le monde : le serment restitué \(partie 1\)/);
  assert.equal(await page.locator('[data-chronicle-discovered="corniche"]').getAttribute('data-scene'),'false');
  await shot(page,'01-chronique-partie-1');
  // A new run: explicit start, then an explicit and definitive route for this run.
  await act(page,a,'[data-chronicle-action="start"]');
  assert.equal(await run(page,2).getAttribute('data-chronicle-state'),'active');
  assert.match(await run(page,2).innerText(),/jamais parcourue[\s\S]*Ouvrir la corniche[\s\S]*déjà parcourue[\s\S]*Enquêter dans les ruines/);
  const n=a.calls.length;
  await page.locator('[data-chronicle-action="select"][data-chronicle-route="corniche"]').click();
  assert.equal(a.calls.length,n,'selecting sends nothing');
  assert.match(await run(page,2).locator('.av-branch-confirm').innerText(),/Parcourir la corniche dans cette partie \?[\s\S]*définitif pour cette partie/);
  await shot(page,'02-nouvelle-partie-choix','[data-chronicle-run="2"]');
  await act(page,a,'[data-chronicle-action="choose"]');
  // No session since the choice: the scene waits, nothing older counts.
  assert.equal(await page.locator('[data-chronicle-action="advance"]').isDisabled(),true);
  assert.match(await page.locator('[data-chronicle-progress]').innerText(),/0\/15 points · 0\/1 jours actifs depuis ton choix/);
  await shot(page,'03-attente-seances','[data-chronicle-run="2"]');
  // Four confirmed sessions later, the refresh imports them (the campaign's own sync) and the steps open one by one.
  a.effort=80;a.days=4;
  await act(page,a,'[data-chronicle-action="sync"]');
  for(const step of ['scene','clue','observe'])await act(page,a,`[data-chronicle-action="advance"][data-chronicle-step="${step}"]`);
  assert.equal(await run(page,2).locator('[data-chronicle-step="prepare"]').count(),1);
  // The mechanic: a wrong sign is recorded and corrected without effort.
  await page.locator('[data-chronicle-token="gravure"]').click();
  await act(page,a,'[data-chronicle-action="solve"]');
  assert.match(await page.locator('[data-chronicle-feedback="wrong"]').innerText(),/Ce n’est pas encore ça \(case 1\)/);
  assert.match(await page.locator('[data-chronicle-attempts]').innerText(),/1 essai\(s\) dans cette partie/);
  await shot(page,'04-mecanique-erreur','[data-chronicle-run="2"]');
  await page.locator('[data-chronicle-token="fissure"]').click();
  await act(page,a,'[data-chronicle-action="solve"]');
  await act(page,a,'[data-chronicle-action="resolve"]');
  // Two stories, two routes, the world keeps run 1.
  assert.equal(await run(page,2).getAttribute('data-chronicle-state'),'resolved');
  assert.deepEqual(await entries(page,2),['Nouvelle partie','Décision : la corniche','La corniche effondrée','La prise dans la roche','Observation : Le Veilleur de pierre','La mécanique résolue','Issue : le passage rouvert']);
  assert.match(await page.locator('[data-chronicle-active]').innerText(),/le serment restitué \(partie 1\)/);
  assert.equal(await page.locator('[data-chronicle-discovered="corniche"]').getAttribute('data-outcome'),'true');
  assert.equal(await page.locator('[data-chronicle-action="start"]').count(),1,'an achieved arc can be replayed again');
  assert.match(await host(page).innerText(),/ni XP, ni crédits, ni balise, ni récompense/);
  await shot(page,'05-deux-histoires');
  assert.deepEqual(writes(a),[['start'],['choose','corniche'],['sync'],['advance','scene'],['advance','clue'],['advance','observe'],['solve','gravure'],['solve','fissure'],['resolve']]);
  // Measure: reopening a finished story sends one read, once.
  await page.locator('[data-chronicle-run="1"] summary').click();await page.waitForTimeout(50);
  await page.locator('[data-chronicle-run="1"] summary').click();await page.waitForTimeout(150);
  assert.deepEqual(a.reads,[1],'one read for run 1');
  // Reinstalled (a new browser profile, nothing stored) and at 320 px: the same two distinct stories from the server.
  const fresh=await device(a,{width:320});
  try{
   const p2=await open(fresh,a,'aube','#partie-aube-1');
   assert.equal(await run(p2,1).getAttribute('open'),'','the address of a run opens it');
   assert.deepEqual(await entries(p2,2),await entries(page,2));
   assert.ok((await entries(p2,1)).includes('Issue : le serment restitué'));
   assert.equal(await noScroll(p2),true,'no horizontal scroll at 320 px');
   await shot(p2,'06-reinstallation-320');
   assert.deepEqual(fresh.errors,[]);
  }finally{await fresh.context.close();}
  assert.deepEqual(d.errors,[]);
 }finally{await d.context.close();}
});

test('an old campaign, an abandoned run, then another one; two devices starting at once share one run',async()=>{
 const a=account('00000000-0000-4000-8000-000000000502','legacy');
 const one=await device(a),two=await device(a);
 try{
  const p1=await open(one,a,'aube','#chroniques'),p2=await open(two,a,'aube','#chroniques');
  const legacy=await entries(p1,1);
  assert.deepEqual(legacy.slice(0,3),['Départ','La clairière des lucioles','Choix : Écouter le passeur'],'the v1 journal as it was played');
  assert.match(await run(p1,1).innerText(),/campagne historique · journal v1/);
  assert.match(await p1.locator('[data-chronicle-active]').innerText(),/garde ses acquis tels quels/);
  await shot(p1,'07-campagne-historique');
  // Both devices tap "Rejouer" from the same screen: the server keeps one run, the second device reads it back.
  await act(p1,a,'[data-chronicle-action="start"]');
  await act(p2,a,'[data-chronicle-action="start"]');
  assert.equal(a.runs.length,1,'one run');
  assert.equal(await run(p2,2).getAttribute('data-chronicle-state'),'active');
  // Device one chooses the ruins; device two, still on the choice, chooses the corniche: the run keeps the ruins.
  await p1.locator('[data-chronicle-action="select"][data-chronicle-route="ruines"]').click();
  await act(p1,a,'[data-chronicle-action="choose"]');
  await p2.locator('[data-chronicle-action="select"][data-chronicle-route="corniche"]').click();
  await act(p2,a,'[data-chronicle-action="choose"]');
  assert.match(await p2.locator('[data-chronicle-notice]').innerText(),/Cette partie suivait déjà les ruines, choisie depuis un autre appareil/);
  assert.equal(a.runs[0].route,'ruines');
  await shot(p2,'08-deux-appareils','[data-chronicle-run="2"]');
  // Abandon in two steps: the run stays readable, a new one can start.
  await p1.locator('[data-chronicle-action="ask-abandon"]').click();
  assert.match(await p1.locator('[data-chronicle-run="2"] .av-branch-confirm').innerText(),/Abandonner la partie 2 \?[\s\S]*reste lisible/);
  await act(p1,a,'[data-chronicle-action="abandon"]');
  assert.equal(await run(p1,2).getAttribute('data-chronicle-state'),'abandoned');
  assert.ok((await entries(p1,2)).includes('Partie abandonnée'));
  await act(p1,a,'[data-chronicle-action="start"]');
  assert.equal(await run(p1,3).getAttribute('data-chronicle-state'),'active');
  assert.match(await run(p1,2).innerText(),/abandonnée/);
  await shot(p1,'09-partie-abandonnee');
  assert.deepEqual(writes(a),[['start'],['start'],['choose','ruines'],['choose','corniche'],['abandon',2],['start']]);
  assert.deepEqual([...one.errors,...two.errors],[]);
 }finally{await one.context.close();await two.context.close();}
});

test('offline nothing is sent and the screen keeps the last state; without the V1.5.5 server nothing is shown and nothing breaks',async()=>{
 const a=account('00000000-0000-4000-8000-000000000503','original');
 const d=await device(a);
 try{
  const page=await open(d,a,'aube','#chroniques');
  await d.context.setOffline(true);
  const n=writes(a).length;
  await page.locator('[data-chronicle-action="start"]').click();await page.waitForTimeout(150);
  assert.equal(writes(a).length,n,'offline: nothing is sent');
  assert.match(await page.locator('[data-chronicle-notice]').innerText(),/Hors ligne : la partie n’avance qu’avec le serveur/);
  assert.ok((await entries(page,1)).includes('Issue : le serment restitué'),'the chronicle already read stays readable');
  await shot(page,'10-hors-ligne');
  // Another device started a run meanwhile: back online, the server state is read again, no action is replayed.
  serve(a,'titan_adventure_chronicle_action_v1',{p_world:'aube',p_action:'start'});
  await d.context.setOffline(false);
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.waitForFunction(()=>document.querySelector('[data-chronicle-run="2"]')?.dataset.chronicleState==='active');
  assert.equal(await page.locator('[data-chronicle-notice]').count(),0,'the offline notice is gone');
  assert.equal(a.runs.length,1);
  const m=account('00000000-0000-4000-8000-000000000504','original',{missing:true}),d2=await device(m);
  try{
   const p=await open(d2,m,'aube','#carnet');
   assert.equal(await host(p).isHidden(),true,'no chronicle without the V1.5.5 server');
   assert.equal(await p.locator('.av-carnet').count(),1,'the Carnet view is intact');
   assert.deepEqual(d2.errors,[]);
  }finally{await d2.context.close();}
  assert.deepEqual(d.errors,[]);
 }finally{await d.context.close();}
});
