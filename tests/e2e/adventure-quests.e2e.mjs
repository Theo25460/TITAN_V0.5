// V1.5.4 — Quêtes entre les mondes on the website. A Node-side fake of titan_adventure_quests_v1 / _action_v1 with the same
// JSON shape and rules as the SQL functions (clues read from the account's arc facts, one row per chain, a link stable once
// right, a definitive manner, the next encounter after one confirmed active day), shared by every browser context so that two
// devices of one account read one canonical state. The player opens the real adventure page, the account is injected after load
// (the app itself is not signed in, as in the V1.5.1 to V1.5.3 journeys), and the notebook is reached from the real map of the
// world. Screenshots: TITAN_SHOTS=docs/v154 node --test <this file>.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const Q=require('../../js/core/adventure-quests.js');
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

/* facts: the arc facts the account holds, as 'world:route:outcome' (an outcome) or 'world:route:outcome:access' (V1.5.2). */
function account(owner,facts,{missing=false}={}){return {owner,facts,missing,rows:{},days:0,calls:[]};}
const holds=(a,o)=>a.facts.includes(`${o.world}:${o.route}:${o.outcome}${o.fact==='consequence'?':access':''}`);
function state(a,id){
 const cfg=Q.current(id),q=a.rows[id];
 const clues=cfg.clues.map(c=>({id:c.id,origin:c.origin,foundAt:holds(a,c.origin)?'2026-11-18T10:00:00Z':null}));
 if(!q){const e=clues.find(c=>c.foundAt);return {id,version:1,from:cfg.from,to:cfg.to,state:e?'available':'locked',clue:e?.id||null,clues,attempts:0,daysTarget:1};}
 const c=cfg.clues.find(x=>x.id===q.clue);
 const st=!q.linkedAt?'link':!q.manner?'choose':q.outcome?'resolved':a.days>=1?'ready':'waiting';
 return {id,version:1,from:cfg.from,to:cfg.to,state:st,clue:q.clue,clues,startedAt:q.startedAt,attempts:q.attempts,lastAnswer:q.lastAnswer,
  lastCorrect:q.lastAnswer?q.lastAnswer[0]===c.answer:null,linkedAt:q.linkedAt,manner:q.manner,chosenAt:q.chosenAt,
  days:q.manner?Math.min(a.days,1):0,daysTarget:1,outcome:q.outcome,resolvedAt:q.resolvedAt};
}
function notebook(a){
 const chains=Q.CATALOG.map(id=>state(a,id));
 const clues=chains.flatMap(ch=>ch.clues.filter(c=>c.foundAt).map(c=>({id:c.id,chain:ch.id,version:1,origin:c.origin,foundAt:c.foundAt,destination:ch.to,
  state:ch.clue!==c.id||['locked','available'].includes(ch.state)?'found':ch.state==='resolved'?'used':ch.state==='link'?'followed':'linked'})));
 return {contract:1,owner:a.owner,chains,clues};
}
const NOW=()=>new Date().toISOString();
function serve(a,name,args){
 a.calls.push([name,args]);
 const fail=message=>({data:null,error:{message}});
 if(!name.startsWith('titan_adventure_quest'))return fail('NOT_IN_THIS_TEST');
 if(a.missing)return fail('Could not find the function public.'+name);
 if(name==='titan_adventure_quest_action_v1'){
  const id=args.p_chain,act=args.p_action;
  if(!Q.CATALOG.includes(id))return fail('QUEST_UNAVAILABLE');
  const s=state(a,id),cfg=Q.current(id);
  if(s.state==='locked')return fail('QUEST_LOCKED');
  if(act==='start'){if(s.state==='available')a.rows[id]={clue:s.clue,startedAt:NOW(),attempts:0,lastAnswer:null,linkedAt:null,manner:null,chosenAt:null,outcome:null,resolvedAt:null};}
  else if(s.state==='available')return fail('QUEST_NOT_STARTED');
  else if(act==='link'){
   if(s.state==='link'){
    const ans=args.p_answer;if(!Array.isArray(ans)||ans.length!==1||!cfg.link.pool.includes(ans[0]))return fail('INVALID_ANSWER');
    const q=a.rows[id];q.attempts++;q.lastAnswer=ans;if(ans[0]===cfg.clues.find(c=>c.id===q.clue).answer)q.linkedAt=NOW();
   }
  }else if(s.state==='link')return fail('QUEST_NOT_LINKED');
  else if(act==='choose'){
   const m=cfg.manners.find(x=>x.id===args.p_manner);if(!m)return fail('INVALID_MANNER');
   if(s.state==='choose'){a.rows[id].manner=m.id;a.rows[id].chosenAt=NOW();}
  }else if(act==='resolve'){
   if(s.state==='choose')return fail('QUEST_NOT_CHOSEN');if(s.state==='waiting')return fail('ENCOUNTER_INCOMPLETE');
   if(s.state==='ready'){const q=a.rows[id];q.outcome=cfg.manners.find(m=>m.id===q.manner).outcome;q.resolvedAt=NOW();}
  }else return fail('INVALID_ACTION');
 }
 return {data:notebook(a),error:null};
}
async function device(a,{width=390}={}){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',deviceScaleFactor:SHOTS?2:1});
 await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 await context.addInitScript(()=>localStorage.setItem('titan_first_run_guide_v2','done'));
 await context.exposeFunction('fakeQuestServer',(name,args)=>serve(a,name,args));
 return {context,errors:[]};
}
/* The real adventure page of a world, rendered for the account. Once the page has loaded, its own campaign snapshot is served
   for the account (the adventure server is not part of this lot), the account and the fake client are injected, and the page
   renders again: the notebook in the Carnet view and the button on the map are the page's own hosts. */
async function open(d,a,world,hash=''){
 const page=await d.context.newPage();page.on('pageerror',e=>d.errors.push(e.message));
 await page.goto(`${base}/adventure?world=${world}${hash}`);
 await page.waitForFunction(()=>window.TitanAdventure?.status==='ready'&&document.querySelector('[data-quest-map]')&&window.TitanQuestPanel);
 const snapshot=await page.evaluate(owner=>JSON.stringify({...window.TitanAdventure.snapshot,owner,local:undefined}),a.owner);
 await page.route('**/rest/v1/rpc/titan_adventure_snapshot',r=>r.fulfill({status:200,contentType:'application/json',body:snapshot}));
 await page.evaluate(({owner})=>{
  window.state.user.id=owner;window.state.meta={...window.state.meta,firstRunGuideSeen:true,firstRunGuideVersion:'v2'};window.titanCloseFirstRunGuide?.();
  window.titanClient={auth:{getSession:async()=>({data:{session:{user:{id:window.state.user.id},access_token:`token-${window.state.user.id}`}}})},
   rpc:(name,args)=>{const p=window.fakeQuestServer(name,args||{});p.setHeader=()=>p;return p;}};
  window.TitanQuestPanel.reset();window.TitanAdventure.refresh({force:true});
 },{owner:a.owner});
 await page.waitForFunction(owner=>window.TitanAdventure.status==='ready'&&window.TitanAdventure.snapshot?.owner===owner&&document.querySelector('[data-quest-host]')?.dataset.owner===owner,a.owner);
 await page.waitForTimeout(150);
 return page;
}
const writes=a=>a.calls.filter(([n])=>n==='titan_adventure_quest_action_v1').map(([,x])=>[x.p_chain,x.p_action,...(x.p_answer||[]),...(x.p_manner?[x.p_manner]:[])]);
const chain=(page,id)=>page.locator(`#quete-${id}`);
const stateOf=(page,id)=>chain(page,id).getAttribute('data-quest-state');
const hide=page=>page.evaluate(()=>document.querySelectorAll('body *').forEach(el=>{if(['fixed','sticky'].includes(getComputedStyle(el).position))el.style.visibility='hidden';}));
const shot=async(page,name,selector)=>{if(!SHOTS)return;await hide(page);await page.locator(selector).first().screenshot({path:`${SHOTS}/${name}.png`});};
const noScroll=page=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
async function act(page,a,selector){const n=writes(a).length;await page.locator(selector).click();for(let i=0;i<100&&writes(a).length===n;i++)await page.waitForTimeout(20);await page.waitForTimeout(80);}

test('l’atelier oublié by the ruins: from the map of the Vallée to the notebook, a wrong mark corrected, a manner, the next encounter',async()=>{
 const a=account('00000000-0000-4000-8000-000000000401',['aube:ruines:serment_restitue','aube:ruines:serment_restitue:access']);
 const d=await device(a);
 try{
  const page=await open(d,a,'aube');
  // The map of the world: one button, on the chain that leaves this world.
  const map=page.locator('.av-map [data-quest-map] .av-map-quest');
  await map.waitFor();
  assert.match(await map.innerText(),/Carnet d’indices\s+1 indice\(s\) · 1 piste\(s\)/);
  assert.match(await map.getAttribute('aria-label'),/Piste vers la Forge des Titans : L’atelier oublié \(indice trouvé\)/);
  assert.equal(await map.getAttribute('data-quest-goto'),'quete-atelier-oublie','the button leads to the chain of this world');
  await shot(page,'01-carte-vallee','.av-map');
  assert.equal(await page.locator('[data-av-view="carnet"]').isHidden(),true,'the notebook starts hidden under the Chapitre view');
  await map.click();
  await page.waitForFunction(()=>document.activeElement?.id==='quete-atelier-oublie');
  assert.equal(await page.locator('[data-av-view="carnet"]').isVisible(),true,'the map opened the Carnet view');
  assert.equal(new URL(page.url()).hash,'#carnet');
  // The clue: origin, state, destination.
  const clue=page.locator('[data-quest-clue="symbole-cerf"]');
  assert.equal(await clue.getAttribute('data-clue-state'),'found');
  const text=await clue.innerText();
  assert.match(text,/Le symbole du cerf/);assert.match(text,/Origine : la Vallée de l’Aube · voie des ruines · salle annexe de l’archive/);
  assert.match(text,/Destination : la Forge des Titans · L’atelier oublié/);
  assert.equal(await stateOf(page,'atelier-oublie'),'available');assert.equal(await stateOf(page,'feux-cote'),'locked');
  assert.match(await chain(page,'feux-cote').innerText(),/Le feu du chenal · franchis le chenal[\s\S]*Le couplet de l’étoile · prends le large/,'a locked chain says which clues open it');
  await shot(page,'02-carnet-indice','#indices');
  await act(page,a,'[data-quest-action="start"][data-quest-id="atelier-oublie"]');
  assert.equal(await stateOf(page,'atelier-oublie'),'link');assert.equal(await clue.getAttribute('data-clue-state'),'followed');
  // A wrong engraving: concrete feedback tied to the clue, correctable.
  await act(page,a,'#quete-atelier-oublie [data-quest-answer="roue"]');
  assert.equal(await stateOf(page,'atelier-oublie'),'link');
  assert.match(await page.locator('#quete-atelier-oublie [data-quest-feedback="wrong"]').innerText(),/Cherche les bois qui entourent l’enclume/);
  assert.equal(await page.locator('#quete-atelier-oublie [data-quest-mark="roue"]').getAttribute('class'),'is-chosen');
  await shot(page,'03-lien-erreur','#quete-atelier-oublie');
  await act(page,a,'#quete-atelier-oublie [data-quest-answer="cerf"]');
  assert.equal(await stateOf(page,'atelier-oublie'),'choose');assert.equal(await clue.getAttribute('data-clue-state'),'linked');
  assert.match(await page.locator('#quete-atelier-oublie [data-quest-scene]').innerText(),/Les passeurs de la Vallée y forgeaient leurs repères/);
  // The manner: local until the explicit confirmation.
  const n=writes(a).length;
  await page.locator('#quete-atelier-oublie [data-quest-action="select"][data-quest-manner="cle"]').click();
  assert.equal(writes(a).length,n,'selecting sends nothing');
  assert.match(await page.locator('#quete-atelier-oublie .av-branch-confirm').innerText(),/définitif/);
  await shot(page,'04-atelier-choix','#quete-atelier-oublie');
  await act(page,a,'#quete-atelier-oublie [data-quest-action="choose"]');
  assert.equal(await stateOf(page,'atelier-oublie'),'waiting');
  assert.equal(await page.locator('#quete-atelier-oublie [data-quest-action="resolve"]').isDisabled(),true);
  const wait=await page.locator('#quete-atelier-oublie [data-quest-encounter]').innerText();
  assert.match(wait,/À la rencontre suivante, ta clé cherchera sa serrure/);assert.match(wait,/0\/1 jour actif confirmé depuis ton choix/);
  assert.match(wait,/n’importe quel sport, à l’heure qui te convient/);
  await shot(page,'05-attente','#quete-atelier-oublie');
  // A session is confirmed later: the app reopened on the Forge (the chain's destination) finds the scene ready.
  a.days=1;await page.close();
  const forge=await open(d,a,'forge','#quete-atelier-oublie');
  await forge.waitForFunction(()=>document.activeElement?.id==='quete-atelier-oublie');
  assert.equal(await forge.locator('[data-av-view="carnet"]').isVisible(),true,'the address of the chain opens the Carnet view');
  assert.match(await forge.locator('.av-map-quest').getAttribute('aria-label'),/Piste depuis la Vallée de l’Aube : L’atelier oublié/);
  assert.equal(await stateOf(forge,'atelier-oublie'),'ready');
  await act(forge,a,'#quete-atelier-oublie [data-quest-action="resolve"]');
  assert.equal(await stateOf(forge,'atelier-oublie'),'resolved');
  const out=await forge.locator('#quete-atelier-oublie [data-quest-outcome="cle_forgee"]').innerText();
  assert.match(out,/La porte s’ouvre/);assert.match(out,/Indice : Le symbole du cerf · manière : Forger la clé des passeurs/);
  assert.equal(await forge.locator('[data-quest-clue="symbole-cerf"]').getAttribute('data-clue-state'),'used');
  await shot(forge,'06-scene-resolue','#quete-atelier-oublie');
  assert.deepEqual(writes(a),[['atelier-oublie','start'],['atelier-oublie','link','roue'],['atelier-oublie','link','cerf'],['atelier-oublie','choose','cle'],['atelier-oublie','resolve']]);
  assert.deepEqual(d.errors,[]);
 }finally{await d.context.close();}
});

test('the alternative route at 320 px: the corniche player reaches the same workshop by the cairn, another manner, another scene',async()=>{
 const a=account('00000000-0000-4000-8000-000000000402',['aube:corniche:passage_rouvert','aube:corniche:passage_rouvert:access']);
 const d=await device(a,{width:320});
 try{
  const page=await open(d,a,'aube','#indices');
  await page.waitForFunction(()=>document.activeElement?.id==='indices-title');
  assert.match(await page.locator('[data-quest-clue="cairn-fendu"]').innerText(),/voie de la corniche · raccourci du belvédère/);
  await act(page,a,'[data-quest-action="start"][data-quest-id="atelier-oublie"]');
  assert.deepEqual(await page.locator('#quete-atelier-oublie [data-quest-mark]').evaluateAll(l=>l.map(x=>x.dataset.questMark)),['cerf','cairn','roue','vague'],'the same board');
  await act(page,a,'#quete-atelier-oublie [data-quest-answer="cerf"]');
  assert.match(await page.locator('#quete-atelier-oublie [data-quest-feedback="wrong"]').innerText(),/marteau posé sur une pierre/);
  await act(page,a,'#quete-atelier-oublie [data-quest-answer="cairn"]');
  assert.match(await page.locator('#quete-atelier-oublie [data-quest-feedback="right"]').innerText(),/La pierre au marteau reprend la marque de ton cairn/);
  await page.locator('#quete-atelier-oublie [data-quest-action="select"][data-quest-manner="motifs"]').click();
  await act(page,a,'#quete-atelier-oublie [data-quest-action="choose"]');
  assert.equal(await page.locator('#quete-atelier-oublie [data-quest-action="resolve"]').isDisabled(),true,'no scene before a confirmed session');
  // A session is confirmed meanwhile: the server state is read again when the device comes back online, nothing is replayed.
  a.days=1;
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.waitForFunction(()=>document.querySelector('#quete-atelier-oublie')?.dataset.questState==='ready');
  await act(page,a,'#quete-atelier-oublie [data-quest-action="resolve"]');
  const out=await page.locator('#quete-atelier-oublie [data-quest-outcome="motifs_transmis"]').innerText();
  assert.match(out,/La Forge lit désormais la langue des passeurs/);
  assert.match(await page.locator('#quete-atelier-oublie [data-quest-encounter]').innerText(),/Un forgeron déchiffre les motifs recopiés/);
  assert.equal(await noScroll(page),true,'no horizontal scroll at 320 px');
  await shot(page,'07-corniche-320-resolue','#quete-atelier-oublie');
  assert.deepEqual(writes(a).map(w=>w.slice(1).join(' ')),['start','link cerf','link cairn','choose motifs','resolve']);
  assert.deepEqual(d.errors,[]);
 }finally{await d.context.close();}
});

test('les feux de la côte, both routes of the Marées; two devices of one account: one manner, the conflict explained',async()=>{
 for(const [owner,fact,clue,mark,manner,outcome] of [
  ['00000000-0000-4000-8000-000000000403','marees:carte:chenal_ouvert','feu-chenal','phare','lanterne','feu_rallume'],
  ['00000000-0000-4000-8000-000000000404','marees:gardienne:large_franchi','couplet-etoile','etoile','livre','route_consignee']]){
  const a=account(owner,[fact]);
  const laptop=await device(a,{width:1280}),phone=await device(a,{width:390});
  try{
   const page=await open(laptop,a,'marees');
   assert.match(await page.locator('.av-map-quest').getAttribute('aria-label'),/Piste vers les Hauts des Aurores : Les feux de la côte/);
   await page.locator('.av-map-quest').click();
   await page.waitForFunction(()=>document.activeElement?.id==='quete-feux-cote');
   assert.equal(await page.locator(`[data-quest-clue="${clue}"]`).count(),1);
   assert.equal(await stateOf(page,'atelier-oublie'),'locked');
   await act(page,a,'[data-quest-action="start"][data-quest-id="feux-cote"]');
   await act(page,a,`#quete-feux-cote [data-quest-answer="${mark}"]`);
   assert.equal(await stateOf(page,'feux-cote'),'choose');
   // The phone resumes on the same step, from the Aurores (the destination).
   const other=await open(phone,a,'aurores');
   assert.match(await other.locator('.av-map-quest').getAttribute('aria-label'),/Piste depuis les Îles des Marées : Les feux de la côte/);
   await other.locator('.av-map-quest').click();
   await other.waitForFunction(()=>document.activeElement?.id==='quete-feux-cote');
   assert.equal(await stateOf(other,'feux-cote'),'choose');
   const otherManner=manner==='lanterne'?'livre':'lanterne';
   await other.locator(`#quete-feux-cote [data-quest-action="select"][data-quest-manner="${otherManner}"]`).click();
   // Meanwhile the laptop confirms first.
   await page.locator(`#quete-feux-cote [data-quest-action="select"][data-quest-manner="${manner}"]`).click();
   await act(page,a,'#quete-feux-cote [data-quest-action="choose"]');
   await act(other,a,'#quete-feux-cote [data-quest-action="choose"]');
   assert.match(await other.locator('#quete-feux-cote [data-quest-notice]').innerText(),/déjà choisie depuis un autre appareil/);
   assert.match(await other.locator('#quete-feux-cote [data-quest-chosen]').innerText(),new RegExp(Q.t(`feux-cote.manner.${manner}.label`)));
   if(manner==='lanterne')await shot(other,'08-conflit-deux-appareils','#quete-feux-cote');
   a.days=1;await other.evaluate(()=>window.dispatchEvent(new Event('online')));
   await other.waitForFunction(()=>document.querySelector('#quete-feux-cote')?.dataset.questState==='ready');
   await act(other,a,'#quete-feux-cote [data-quest-action="resolve"]');
   assert.equal(await other.locator(`#quete-feux-cote [data-quest-outcome="${outcome}"]`).count(),1);
   assert.equal(a.rows['feux-cote'].manner,manner,'one manner on the server');
   assert.deepEqual(laptop.errors,[]);assert.deepEqual(phone.errors,[]);
  }finally{await laptop.context.close();await phone.context.close();}
 }
});

test('prerequisites and fallbacks: no clue, offline, a server without the migration, a guest',async()=>{
 const a=account('00000000-0000-4000-8000-000000000405',['aube:ruines:serment_restitue']);
 const d=await device(a);
 try{
  // The Veilleur resolved but the annex room never discovered: no clue, both chains explain what opens them.
  const page=await open(d,a,'aube','#indices');
  await page.waitForFunction(()=>document.activeElement?.id==='indices-title');
  assert.match(await page.locator('[data-quest-empty]').innerText(),/Aucun indice pour l’instant/);
  assert.equal(await stateOf(page,'atelier-oublie'),'locked');assert.equal(await stateOf(page,'feux-cote'),'locked');
  assert.equal(await page.locator('[data-quest-action]').count(),0,'nothing to press without a clue');
  assert.match(await page.locator('.av-map-quest small').innerText(),/0 indice\(s\) · 0 piste\(s\)/);
  await shot(page,'09-sans-indice','#indices');
  // Offline: nothing is sent; back online the server state is read again.
  a.facts.push('aube:ruines:serment_restitue:access');
  await d.context.setOffline(true);
  await page.evaluate(()=>window.TitanQuestPanel.load({fresh:true}).catch(()=>{}));
  await d.context.setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.waitForFunction(()=>document.querySelector('#quete-atelier-oublie')?.dataset.questState==='available');
  await d.context.setOffline(true);
  await page.locator('[data-quest-action="start"]').click();
  await page.locator('#quete-atelier-oublie [data-quest-notice]').waitFor();
  assert.match(await page.locator('#quete-atelier-oublie [data-quest-notice]').innerText(),/Hors ligne/);
  assert.deepEqual(writes(a),[],'nothing sent offline');
  await d.context.setOffline(false);
  assert.deepEqual(d.errors,[]);
 }finally{await d.context.close();}
 const old=account('00000000-0000-4000-8000-000000000406',['aube:ruines:serment_restitue','aube:ruines:serment_restitue:access'],{missing:true});
 const o=await device(old);
 try{
  const page=await open(o,old,'aube');
  assert.equal(await page.locator('[data-quest-map]').innerHTML(),'','no map access without the migration');
  assert.equal(await page.locator('[data-quest-host]').innerHTML(),'','no notebook without the migration');
  assert.deepEqual(o.errors,[]);
 }finally{await o.context.close();}
 const guest=account('guest_local',['aube:ruines:serment_restitue','aube:ruines:serment_restitue:access']);
 const g=await device(guest);
 try{
  const page=await open(g,guest,'aube');
  assert.equal(await page.locator('[data-quest-map]').innerHTML(),'');assert.equal(guest.calls.length,0,'a guest calls nothing');
 }finally{await g.context.close();}
});
