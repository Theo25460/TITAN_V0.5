// V1.5.2 — Camp et conséquences on the website. A Node-side fake of titan_adventure_consequences_v1 / _action_v1 with the same
// JSON shape and rules as the SQL functions (one discovery per account, stable afterwards, visits counted), shared by every
// browser context so that two devices of one account read one canonical state. The player starts in the Camp de base (the
// single return point), follows its link to the Vallée and plays the interaction. The account is injected after load, as in
// the V1.5.1 journeys: the app itself is not signed in. Screenshots: TITAN_SHOTS=docs/v152 node --test <this file>.
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

const OUT={passage_rouvert:{route:'corniche',kind:'shortcut',marks:['cairn','pin','tour','cascade'],answer:['cairn','pin']},
 serment_restitue:{route:'ruines',kind:'annex',marks:['cerf','soleil','spirale','vague'],answer:['cerf']}};
function account(owner,outcome,{missing=false}={}){return {owner,outcome,missing,c:null,calls:[]};}
function items(a){
 if(!a.outcome)return [];
 const c=a.c,o=OUT[a.outcome];
 return [{state:c?.discoveredAt?'open':'discover',world:'aube',id:'veilleur-retour',version:1,returnPoint:'camp',outcome:a.outcome,route:o.route,kind:o.kind,
  resolvedAt:'2026-11-18T09:00:00Z',attempts:c?.attempts||0,lastAnswer:c?.lastAnswer||null,
  lastCorrect:c?.lastAnswer?JSON.stringify(c.lastAnswer)===JSON.stringify([...o.answer].sort()):null,discoveredAt:c?.discoveredAt||null,visits:c?.visits||0,lastVisitAt:c?.lastVisitAt||null}];
}
const WORLD={wallet:{eclats:12,essences:{souffle:0,acier:0,prisme:0,ardeur:0,seve:0}},buildings:{},voies:{},days:0,distinctVoies:0,collection:[]};
function serve(a,name,args){
 a.calls.push([name,args]);
 const fail=message=>({data:null,error:{message}});
 if(name==='titan_live_world_v1')return {data:WORLD,error:null};
 if(name==='titan_live_settle_v1')return {data:{status:'none'},error:null};
 if(!name.startsWith('titan_adventure_consequence'))return fail('NOT_IN_THIS_TEST');
 if(a.missing)return fail('Could not find the function public.'+name);
 if(name==='titan_adventure_consequence_action_v1'){
  const [it]=items(a);if(!it)return fail('CONSEQUENCE_UNAVAILABLE');
  const o=OUT[a.outcome];
  if(args.p_action==='discover'&&it.state==='discover'){
   const marks=[...new Set(args.p_marks||[])].sort();
   if(!args.p_marks||marks.length!==args.p_marks.length||marks.length!==o.answer.length||marks.some(m=>!o.marks.includes(m)))return fail('INVALID_MARKS');
   const right=JSON.stringify(marks)===JSON.stringify([...o.answer].sort());
   a.c={...(a.c||{visits:0}),attempts:(a.c?.attempts||0)+1,lastAnswer:marks,discoveredAt:right?new Date().toISOString():null};
  }
  if(args.p_action==='visit'){if(it.state!=='open')return fail('CONSEQUENCE_NOT_DISCOVERED');a.c.visits++;a.c.lastVisitAt=new Date().toISOString();}
 }
 return {data:{contract:1,owner:a.owner,items:items(a)},error:null};
}
async function device(a,{width=390}={}){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',deviceScaleFactor:SHOTS?2:1});
 await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 await context.addInitScript(()=>localStorage.setItem('titan_first_run_guide_v2','done'));
 await context.exposeFunction('fakeConsequenceServer',(name,args)=>serve(a,name,args));
 return {context,errors:[]};
}
// The account and the fake client, injected once the page has loaded (the app is not signed in).
const inject=(page,owner)=>page.evaluate(owner=>{
 window.state.user.id=owner;window.state.meta={...window.state.meta,firstRunGuideSeen:true,firstRunGuideVersion:'v2'};window.titanCloseFirstRunGuide?.();
 window.titanFlags.enabled=(k,d)=>(k==='screens.live'?true:d);
 window.titanClient={auth:{getSession:async()=>({data:{session:{user:{id:window.state.user.id},access_token:`token-${window.state.user.id}`}}})},
  rpc:(name,args)=>{const p=window.fakeConsequenceServer(name,args||{});p.setHeader=()=>p;return p;}};
 window.TitanConsequencePanel.reset();
},owner);
/* The real page has its host at the top of the Chapitre view (checked above). Swapping the account after load makes the page
   reload its campaign (no server here), so, as in the V1.5.1 journeys, the panel is then mounted alone on the same address. */
const mountHere=(page,owner)=>inject(page,owner).then(()=>page.evaluate(()=>{
 const host=document.createElement('div');host.dataset.consequenceHost='';document.body.replaceChildren(host);
 window.TitanConsequencePanel.mount(host,'aube');
}));
/** Opens the Camp de base: the return point. */
async function camp(d,a){
 const page=await d.context.newPage();page.on('pageerror',e=>d.errors.push(e.message));
 await page.goto(base+'/seance-live');
 await page.waitForFunction(()=>window.state?.user&&window.titanFlags&&window.TitanConsequencePanel&&document.querySelector('#live h1'));
 await inject(page,a.owner);
 await page.evaluate(()=>window.dispatchEvent(new Event('titan:flags-updated')));
 const reads=()=>a.calls.filter(([n])=>n==='titan_adventure_consequences_v1').length,n=reads();
 await page.locator('[data-act="tab"][data-v="camp"]').click();
 await page.locator('.live-campv .live-res').waitFor();
 // The consequence read is separate from the LIVE world: wait for it to have answered before reading the Camp.
 for(let i=0;i<100&&reads()===n;i++)await new Promise(r=>setTimeout(r,50));
 await page.waitForTimeout(150);
 return page;
}
/** One user action from the Camp: follow its link. The Vallée page then shows the access first. */
async function follow(d,a,page){
 const link=page.locator('[data-consequence-link]');
 const href=await link.getAttribute('href');
 await link.click();
 await page.waitForURL(u=>u.pathname==='/adventure'&&u.hash==='#retour');
 await page.waitForFunction(()=>window.TitanAdventure?.status==='ready'&&document.querySelector('.av-view-chapitre [data-consequence-host]'));
 await mountHere(page,a.owner);
 await page.locator('#retour').waitFor();
 return href;
}
const writes=a=>a.calls.filter(([n])=>n==='titan_adventure_consequence_action_v1').map(([,x])=>[x.p_action,...(x.p_marks||[])]);
const shot=async(page,name,selector='#retour')=>{if(!SHOTS)return;await page.evaluate(()=>document.querySelectorAll('body *').forEach(el=>{if(['fixed','sticky'].includes(getComputedStyle(el).position))el.style.visibility='hidden';}));
 await page.locator(selector).first().screenshot({path:`${SHOTS}/${name}.png`});};
const st=page=>page.locator('#retour').getAttribute('data-consequence-state');
const inView=page=>page.locator('#retour').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=-1&&r.top<innerHeight;});

test('la corniche: from the Camp, the sketch and two landmarks open a shortcut, taken again in two actions',async()=>{
 const a=account('00000000-0000-4000-8000-000000000201','passage_rouvert');
 const d=await device(a,{width:320});
 try{
  let page=await camp(d,a);
  assert.equal(await page.locator('.live-retour').count(),1,'one card in the Camp');
  assert.match(await page.locator('.live-retour').innerText(),/Le camp retrouve le passage rouvert/);
  assert.equal(await page.locator('[data-consequence-link]').innerText(),'Monter au belvédère');
  await shot(page,'01-camp-corniche','.live-retour');
  // Action 1: the link. The page opens on the access, focused, the landmarks being the next tap.
  assert.equal(await follow(d,a,page),'/adventure?world=aube#retour');
  assert.equal(await st(page),'discover');assert.equal(await page.locator('#retour').getAttribute('data-consequence-kind'),'shortcut');
  assert.equal(await inView(page),true,'the access is in view on arrival');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'retour');
  assert.equal(await page.locator('[data-consequence-action="select"]').count(),4);
  // Action 2 starts the interaction. A wrong alignment gets a concrete answer, nothing is opened.
  await page.locator('[data-consequence-mark="tour"]').click();
  assert.match(await page.locator('[data-consequence-selected]').innerText(),/la tour des passeurs/);
  assert.deepEqual(writes(a),[],'the first landmark stays on the device');
  await page.locator('[data-consequence-action="discover"][data-consequence-mark="cairn"]').click();
  await page.locator('[data-consequence-feedback="wrong"]').waitFor();
  assert.match(await page.locator('[data-consequence-feedback]').innerText(),/pas sur ton croquis/);
  assert.equal(await st(page),'discover');
  await shot(page,'02-belvedere-erreur');
  await page.locator('[data-consequence-mark="pin"]').click();
  await page.locator('[data-consequence-action="discover"][data-consequence-mark="cairn"]').click();
  await page.locator('#retour[data-consequence-state="open"]').waitFor();
  assert.match(await page.locator('[data-consequence-feedback="right"]').innerText(),/Le raccourci est ouvert/);
  assert.match(await page.locator('.av-retour-way').innerText(),/La clairière des lucioles[\s\S]*Le passage du Veilleur/);
  assert.match(await page.locator('[data-consequence-status]').textContent(),/raccourci est ouvert/,'the discovery is announced');
  assert.equal(await page.locator('[data-consequence-notice]').count(),0);
  await shot(page,'03-raccourci-ouvert');
  assert.deepEqual(writes(a),[['discover','tour','cairn'],['discover','pin','cairn']]);
  // Next visit: back to the Camp, then two actions — the link, then the shortcut.
  page=await camp(d,a);
  assert.equal(await page.locator('[data-consequence-link]').innerText(),'Emprunter le raccourci');
  await follow(d,a,page);
  await page.locator('[data-consequence-action="visit"]').click();
  await page.locator('[data-consequence-vignette]').waitFor();
  assert.match(await page.locator('[data-consequence-vignette]').innerText(),/Tu descends la sente entre le cairn et le pin/);
  assert.match(await page.locator('[data-consequence-visits]').innerText(),/1 passage/);
  await shot(page,'04-raccourci-emprunte');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll at 320 px: '+await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+0.5).map(e=>e.tagName+'.'+e.className+':'+Math.round(e.getBoundingClientRect().left)+'-'+Math.round(e.getBoundingClientRect().right)+':'+e.outerHTML.slice(0,90)+'@'+e.parentElement.className).slice(0,8).join(' ')));
  assert.deepEqual(writes(a).at(-1),['visit']);
  assert.ok(a.calls.every(([n])=>!/titan_live_build|titan_adventure_rpg|guardian/.test(n)),'no LIVE build, no reward, no guardian call');
  assert.deepEqual(d.errors,[]);
 }finally{await d.context.close();}
});

test('les ruines: the fragment and the engravings reveal the annex room; a different content and a different action',async()=>{
 const a=account('00000000-0000-4000-8000-000000000202','serment_restitue');
 const d=await device(a);
 try{
  let page=await camp(d,a);
  assert.match(await page.locator('.live-retour').innerText(),/Le camp retrouve le serment restauré/);
  assert.equal(await page.locator('[data-consequence-link]').innerText(),'Ouvrir l’archive');
  await follow(d,a,page);
  assert.equal(await page.locator('#retour').getAttribute('data-consequence-kind'),'annex');
  assert.match(await page.locator('#retour h3').innerText(),/L’archive des passeurs/);
  assert.equal(await page.locator('[data-consequence-action="select"]').count(),0,'one engraving: each tap sends');
  assert.equal(await page.locator('[data-consequence-action="discover"]').count(),4);
  await shot(page,'05-archive');
  await page.locator('[data-consequence-mark="soleil"]').click();
  await page.locator('[data-consequence-feedback="wrong"]').waitFor();
  assert.match(await page.locator('[data-consequence-feedback]').innerText(),/ce qui la porte/);
  await page.locator('[data-consequence-mark="cerf"]').click();
  await page.locator('#retour[data-consequence-state="open"]').waitFor();
  assert.match(await page.locator('[data-consequence-feedback="right"]').innerText(),/la salle annexe/);
  page=await camp(d,a);
  assert.equal(await page.locator('[data-consequence-link]').innerText(),'Entrer dans la salle annexe');
  await follow(d,a,page);
  await page.locator('[data-consequence-action="visit"]').click();
  await page.locator('[data-consequence-vignette]').waitFor();
  assert.match(await page.locator('[data-consequence-vignette]').innerText(),/registres des passeurs/);
  await shot(page,'06-salle-annexe');
  assert.deepEqual(writes(a),[['discover','soleil'],['discover','cerf'],['visit']]);
  assert.deepEqual(d.errors,[]);
 }finally{await d.context.close();}
});

test('app closed then reopened, and a second device: the same access, nothing to replay; a late answer changes nothing',async()=>{
 const a=account('00000000-0000-4000-8000-000000000203','passage_rouvert');
 const laptop=await device(a);
 let lp=await camp(laptop,a);await follow(laptop,a,lp);
 assert.equal(await st(lp),'discover');
 // The phone discovers meanwhile, then the app is closed (context gone: no memory, no storage left).
 const phone=await device(a);
 let pp=await camp(phone,a);await follow(phone,a,pp);
 await pp.locator('[data-consequence-mark="cairn"]').click();
 await pp.locator('[data-consequence-action="discover"][data-consequence-mark="pin"]').click();
 await pp.locator('#retour[data-consequence-state="open"]').waitFor();
 await pp.locator('[data-consequence-action="visit"]').click();
 await pp.locator('[data-consequence-vignette]').waitFor();
 await phone.context.close();
 const discoveredAt=a.c.discoveredAt;
 try{
  // The laptop still shows the landmarks and sends a wrong alignment: the server keeps the discovery and the laptop shows it.
  await lp.locator('[data-consequence-mark="tour"]').click();
  await lp.locator('[data-consequence-action="discover"][data-consequence-mark="cascade"]').click();
  await lp.locator('#retour[data-consequence-state="open"]').waitFor();
  assert.equal(a.c.discoveredAt,discoveredAt);assert.equal(a.c.attempts,1,'the late answer is not counted');
  assert.match(await lp.locator('[data-consequence-visits]').innerText(),/1 passage/);
  // Reopened on a fresh install: the Camp offers the shortcut directly and the Vallée shows the same state.
  const again=await device(a);
  try{
   const page=await camp(again,a);
   assert.equal(await page.locator('[data-consequence-link]').innerText(),'Emprunter le raccourci');
   await follow(again,a,page);
   assert.equal(await st(page),'open');
   assert.equal(await page.locator('[data-consequence-action="discover"],[data-consequence-action="select"]').count(),0);
   assert.match(await page.locator('[data-consequence-visits]').innerText(),/1 passage/);
   assert.deepEqual(again.errors,[]);
  }finally{await again.context.close();}
  assert.deepEqual(laptop.errors,[]);assert.deepEqual(phone.errors,[]);
 }finally{await laptop.context.close();}
});

test('an account without the pilot arc, and a server without V1.5.2: the Camp and the Vallée show no access, no error',async()=>{
 for(const a of [account('00000000-0000-4000-8000-000000000204',null),account('00000000-0000-4000-8000-000000000205','passage_rouvert',{missing:true})]){
  const d=await device(a);
  try{
   const page=await camp(d,a);
   assert.equal(await page.locator('.live-retour').count(),0);
   assert.equal(await page.locator('.live-building').count(),6,'the Camp itself is unchanged');
   await page.goto(base+'/adventure?world=aube#retour');
   await page.waitForFunction(()=>window.TitanAdventure?.status==='ready'&&document.querySelector('[data-consequence-host]'));
   await mountHere(page,a.owner);
   await page.waitForTimeout(200);
   assert.equal(await page.locator('#retour').count(),0);
   assert.equal(writes(a).length,0);
   assert.deepEqual(d.errors,[]);
  }finally{await d.context.close();}
 }
});

test('offline: nothing is sent; back online the access reads the server state again',async()=>{
 const a=account('00000000-0000-4000-8000-000000000206','serment_restitue');
 const d=await device(a);
 try{
  const page=await camp(d,a);await follow(d,a,page);
  await d.context.setOffline(true);
  await page.locator('[data-consequence-mark="cerf"]').click();
  await page.locator('[data-consequence-notice]:has-text("Hors ligne")').waitFor();
  assert.match(await page.locator('[data-consequence-status]').textContent(),/Hors ligne/,'the failure is announced');
  assert.equal(writes(a).length,0,'nothing queued');
  assert.equal(await st(page),'discover');
  await d.context.setOffline(false);
  await page.locator('[data-consequence-mark="cerf"]').click();
  await page.locator('#retour[data-consequence-state="open"]').waitFor();
  assert.equal(writes(a).length,1);
  assert.deepEqual(d.errors,[]);
 }finally{await d.context.close();}
});
