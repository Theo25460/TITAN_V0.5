// V1.5.4 — Quêtes entre les mondes. The chain contract is the same JSON on the website, on Android and on the server; the
// graph control passes on the real configuration and catches cycles, impossible conditions, unreachable chains, scenes
// without exit and a version that would take an access away; the notebook shows each clue with its origin, state and
// destination; both routes of each chain reach the same steps; nothing in a main campaign depends on a chain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ROOT=new URL('..',import.meta.url).pathname;
globalThis.TitanAdventureRpg=require('../js/core/adventure-rpg.js');
globalThis.TitanAdventureBranches=require('../js/core/adventure-branches.js');
globalThis.TitanAdventureGuardian=require('../js/core/adventure-guardian.js');
globalThis.TitanAdventureCampaigns=require('../js/core/adventure-campaigns.js');
globalThis.TitanAdventureConsequence=require('../js/core/adventure-consequence.js');
const Q=require('../js/core/adventure-quests.js');
const SQL=readFileSync(ROOT+'supabase/migrations/20261130103500_adventure_quest_chains_v1.sql','utf8');
const blocks=[...SQL.matchAll(/\$cfg\$(.*?)\$cfg\$/gs)].map(m=>JSON.parse(m[1]));
const clone=o=>JSON.parse(JSON.stringify(o));

test('server contract and shared configuration are the same JSON; Android ships a byte copy; the page loads the module',()=>{
 assert.equal(blocks.length,2);
 for(const id of Q.CATALOG){
  assert.deepEqual(blocks.find(b=>b.id===id),Q.contract(id,1),id);
  assert.match(SQL,new RegExp(`when '${id}' then private\\.titan_adventure_quest_config\\('${id}', 1\\)`));
 }
 assert.match(SQL,new RegExp(`select array\\[${Q.CATALOG.map(x=>`'${x}'`).join(', ')}\\]`),'same catalog order');
 assert.equal(readFileSync(ROOT+'mobile/src/core/web/adventure-quests.js','utf8'),readFileSync(ROOT+'js/core/adventure-quests.js','utf8'));
 assert.match(readFileSync(ROOT+'mobile/scripts/sync-web-core.mjs','utf8'),/"js\/core\/adventure-quests\.js"/);
 const page=readFileSync(ROOT+'adventure.html','utf8');
 assert.match(page,/\/js\/core\/adventure-quests\.js\?v=\d/);assert.match(page,/\/js\/app\/aventure-indices\.js\?v=\d/);
 // The clue facts the server reads are the existing canonical tables, nothing new is written for a clue.
 assert.match(SQL,/private\.adventure_guardian_encounters g/);assert.match(SQL,/private\.adventure_consequences c/);
 assert.deepEqual([...SQL.matchAll(/create table if not exists ([a-z_.]+)/g)].map(m=>m[1]),['private.adventure_quests'],'no table of clues: a clue is a fact');
 assert.doesNotMatch(SQL,/(insert into|update) (public\.profiles|private\.adventure_encounter_rewards|private\.adventure_effort_ledger|public\.adventure_progress)/,'no economy or campaign write');
});

test('graph control: two chains, four clues, alternative routes, no cycle, every scene reachable and resolved',()=>{
 const r=Q.audit();
 assert.deepEqual(r.problems,[]);
 assert.deepEqual(r.chains,['atelier-oublie','feux-cote']);
 assert.deepEqual(r.clues,['symbole-cerf','cairn-fendu','feu-chenal','couplet-etoile']);
 const out=execFileSync('node',[ROOT+'tools/check-quest-graph.mjs'],{encoding:'utf8'});
 assert.match(out,/2 chains, 4 clues, 0 chain dependencies, 0 problem\(s\)/);
 // Every clue comes from a route that really ends on its outcome (V1.5.3 describe + V1.5.2 contract).
 for(const id of Q.CATALOG)for(const c of Q.contract(id,1).clues){
  const d=globalThis.TitanAdventureCampaigns.describe(c.origin.world);
  assert.equal(d.routes.find(x=>x.id===c.origin.route).outcome,c.origin.outcome,c.id);
 }
});

test('graph control catches every broken dependency (mutations)',()=>{
 const base=clone(Q.CHAINS),S=Q.strings.fr;
 const audit=(mut,strings=S)=>{const c=clone(base);mut(c);return Q.audit({chains:c,strings}).problems;};
 const A=c=>c['atelier-oublie'].versions[1],F=c=>c['feux-cote'].versions[1];
 const cases=[
  // Cycles: each chain opened only by the other one's outcome.
  [c=>{A(c).clues=[{id:'x1',origin:{fact:'chain',chain:'feux-cote',outcome:'feu_rallume'},answer:'cerf'},{id:'x2',origin:{fact:'chain',chain:'feux-cote',outcome:'route_consignee'},answer:'cairn'}];
       F(c).clues=[{id:'y1',origin:{fact:'chain',chain:'atelier-oublie',outcome:'cle_forgee'},answer:'phare'},{id:'y2',origin:{fact:'chain',chain:'atelier-oublie',outcome:'motifs_transmis'},answer:'etoile'}];},/cycle: atelier-oublie → feux-cote → atelier-oublie|cycle: feux-cote → atelier-oublie → feux-cote/],
  [c=>{A(c).clues=[{id:'x1',origin:{fact:'chain',chain:'feux-cote',outcome:'feu_rallume'},answer:'cerf'},{id:'x2',origin:{fact:'chain',chain:'feux-cote',outcome:'route_consignee'},answer:'cairn'}];
       F(c).clues=[{id:'y1',origin:{fact:'chain',chain:'atelier-oublie',outcome:'cle_forgee'},answer:'phare'},{id:'y2',origin:{fact:'chain',chain:'atelier-oublie',outcome:'motifs_transmis'},answer:'etoile'}];},/unreachable/],
  [c=>{A(c).clues.push({id:'x3',origin:{fact:'chain',chain:'atelier-oublie',outcome:'cle_forgee'},answer:'roue'});},/cycle: atelier-oublie → atelier-oublie/],
  // Impossible conditions.
  [c=>{A(c).clues[0].origin.route='corniche';},/impossible condition — route corniche ends on passage_rouvert, never on serment_restitue/],
  [c=>{F(c).clues[0].origin.outcome='foyer_ranime';},/impossible condition/],
  [c=>{F(c).clues[1].origin.guardian='veilleur';},/the guardian of marees-arc1 is gardienne/],
  [c=>{A(c).clues[1].origin.arc='aube-arc2';},/aube-arc2 is not the arc of aube/],
  [c=>{A(c).clues[0].origin.consequence='autre-retour';},/no consequence autre-retour/],
  [c=>{F(c).clues[0].origin.fact='consequence';F(c).clues[0].origin.consequence='veilleur-retour';},/no consequence veilleur-retour in marees/],
  [c=>{A(c).clues[0].origin.fact='weekday';},/unknown fact weekday/],
  [c=>{A(c).clues[0].origin={fact:'chain',chain:'feux-cote',outcome:'cle_forgee'};},/feux-cote never ends on cle_forgee/],
  [c=>{A(c).encounter.daysTarget=0;},/impossible condition — the next encounter/],
  [c=>{A(c).encounter.daysTarget=30;},/impossible condition — the next encounter/],
  [c=>{F(c).encounter.window='06:00-08:00';},/time window|next encounter/],
  [c=>{F(c).encounter.sport='rowing';},/compulsory discipline|next encounter/],
  [c=>{A(c).manners[0].xp=50;},/reward in the configuration/],
  // Scenes without exit.
  [c=>{A(c).clues[0].answer='enclume';},/not on the board \(scene without exit\)/],
  [c=>{delete F(c).manners[1].outcome;},/a manner has no outcome \(scene without exit\)/],
  [c=>{F(c).manners[1].outcome=F(c).manners[0].outcome;},/same scene/],
  [c=>{A(c).manners=[A(c).manners[0]];},/no real choice/],
  [c=>{A(c).link.pool=['cerf'];},/no real decision/],
  [c=>{A(c).clues[1].answer='cerf';},/same mark/],
  // Alternative route and unreachable chain.
  [c=>{A(c).clues=[A(c).clues[0]];},/no alternative route/],
  [c=>{F(c).clues[1].origin.route='carte';F(c).clues[1].origin.outcome='chenal_ouvert';},/no alternative route/],
  [c=>{A(c).from='forge';},/two different worlds/],
  [c=>{F(c).clues[0].id='symbole-cerf';},/already opens atelier-oublie/],
  // A new version must never take an engaged access away.
  [c=>{c['feux-cote'].versions[2]={...clone(F(c)),version:2,clues:[F(c).clues[0]]};c['feux-cote'].current=2;},/version 2 removes couplet-etoile/],
 ];
 for(const [mut,re] of cases){const p=audit(mut);assert.ok(p.some(x=>re.test(x)),`${re}: ${JSON.stringify(p)}`);}
 // A version that ADDS a clue is accepted (the access only grows).
 const grow=clone(base);grow['feux-cote'].versions[2]={...clone(grow['feux-cote'].versions[1]),version:2,
  clues:[...grow['feux-cote'].versions[1].clues,{id:'balise-recit',origin:{fact:'outcome',world:'aurores',arc:'aurores-arc1',route:'histoire',outcome:'recit_transmis',guardian:'sentinelle'},answer:'lac'}]};
 grow['feux-cote'].current=2;
 const S2={...S,'feux-cote.clue.balise-recit.name':'n','feux-cote.clue.balise-recit.origin':'o','feux-cote.clue.balise-recit.how':'h','feux-cote.clue.balise-recit.text':'t','feux-cote.clue.balise-recit.wrong':'w','feux-cote.clue.balise-recit.right':'r'};
 assert.deepEqual(Q.audit({chains:grow,strings:S2}).problems,[]);
 // A real chain dependency (a later chain opened by the outcome of another one) is valid when acyclic.
 const dep=clone(base);dep['feux-cote'].versions[1].clues.push({id:'cle-passeurs',origin:{fact:'chain',chain:'atelier-oublie',outcome:'cle_forgee'},answer:'lac'});
 const S3={...S};for(const k of ['name','origin','how','text','wrong','right'])S3[`feux-cote.clue.cle-passeurs.${k}`]=k;
 const r=Q.audit({chains:dep,strings:S3});assert.deepEqual(r.problems,[]);assert.deepEqual(r.edges,[['feux-cote','atelier-oublie']]);
 // Missing texts are scenes without exit.
 const missing={...S};delete missing['atelier-oublie.manner.motifs.encounter.action'];
 assert.ok(audit(()=>{},missing).some(x=>/motifs: missing text encounter.action \(scene without exit\)/.test(x)));
 const noWrong={...S};delete noWrong['feux-cote.clue.feu-chenal.wrong'];
 assert.ok(audit(()=>{},noWrong).some(x=>/feu-chenal: missing text wrong/.test(x)));
 // A main campaign that would name a chain or a clue is a dependency the other way round.
 const C=globalThis.TitanAdventureCampaigns;
 const leaked={...C,CAMPAIGNS:{...C.CAMPAIGNS,x:{after:'feu-chenal'}}};
 assert.ok(Q.audit({campaigns:leaked}).problems.some(x=>/a main campaign depends on this chain/.test(x)));
});

/* A server notebook for one account, as titan_adventure_quests_v1 returns it. */
function payload(chain,clue,state,{manner=null,attempts=0,lastAnswer=null,lastCorrect=null,days=0}={}){
 const cfg=Q.contract(chain,1),other=Q.CATALOG.find(x=>x!==chain);
 const clues=cfg.clues.map(c=>({id:c.id,origin:c.origin,foundAt:c.id===clue?'2026-11-18T10:00:00Z':null}));
 const item={id:chain,version:1,from:cfg.from,to:cfg.to,state,clue,clues,attempts,lastAnswer,lastCorrect,
  linkedAt:['choose','waiting','ready','resolved'].includes(state)?'2026-11-19T08:00:00Z':null,manner,
  chosenAt:manner?'2026-11-19T09:00:00Z':null,days,daysTarget:1,
  outcome:state==='resolved'?cfg.manners.find(m=>m.id===manner).outcome:null,resolvedAt:state==='resolved'?'2026-11-20T09:00:00Z':null};
 const o=Q.contract(other,1);
 const lockedOther={id:other,version:1,from:o.from,to:o.to,state:'locked',clue:null,clues:o.clues.map(c=>({id:c.id,origin:c.origin,foundAt:null})),attempts:0,daysTarget:1};
 const st={available:'found',link:'followed',choose:'linked',waiting:'linked',ready:'linked',resolved:'used'}[state];
 return {contract:1,owner:'u',chains:chain==='atelier-oublie'?[item,lockedOther]:[lockedOther,item],
  clues:clue?[{id:clue,chain,version:1,origin:cfg.clues.find(c=>c.id===clue).origin,foundAt:'2026-11-18T10:00:00Z',destination:cfg.to,state:st}]:[]};
}

test('notebook: each clue with its origin, state and destination; the locked chain explains which clues open it',()=>{
 const n=Q.notebook(payload('atelier-oublie','symbole-cerf','available'));
 assert.equal(n.clues.length,1);
 const c=n.clues[0];
 assert.equal(c.name,'Le symbole du cerf');assert.equal(c.stateLabel,'trouvé');
 assert.match(c.origin,/Vallée de l’Aube · voie des ruines/);assert.match(c.destination,/la Forge des Titans · L’atelier oublié/);
 assert.equal(c.href,'/adventure?world=forge#quete-atelier-oublie');
 const locked=n.chains.find(x=>x.id==='feux-cote');
 assert.equal(locked.state,'locked');assert.equal(locked.opens.length,2);
 assert.deepEqual(locked.opens.map(x=>x.route),['carte','gardienne'],'both routes of the Marées open it');
 assert.ok(locked.opens.every(x=>x.how&&x.origin&&!x.held));
 assert.equal(Q.notebook({chains:[],clues:[]}).empty.length>0,true);
 for(const [state,label] of [['link','suivi'],['choose','relié'],['resolved','utilisé']]){
  const p=payload('feux-cote','feu-chenal',state,{manner:state==='link'?null:'lanterne'});
  assert.equal(Q.notebook(p).clues[0].stateLabel,label,state);
 }
});

test('both routes of each chain reach the same steps with their own clue, marks feedback and scenes',()=>{
 for(const id of Q.CATALOG){
  const cfg=Q.contract(id,1),[a,b]=cfg.clues.map(c=>c.id),[m0,m1]=cfg.manners.map(m=>m.id);
  for(const state of ['available','link','choose','waiting','ready','resolved']){
   const manner=['waiting','ready','resolved'].includes(state)?m0:null;
   const va=Q.chainView(payload(id,a,state,{manner,days:state==='waiting'?0:1}).chains.find(x=>x.id===id));
   const vb=Q.chainView(payload(id,b,state,{manner,days:state==='waiting'?0:1}).chains.find(x=>x.id===id));
   assert.equal(va.state,vb.state);assert.equal(va.action?.kind,vb.action?.kind,`${id} ${state}`);
   assert.notEqual(va.clue.name,vb.clue.name,'a different clue');
   if(state==='link'){assert.deepEqual(va.action.marks.map(m=>m.id),cfg.link.pool);assert.deepEqual(va.action.marks.map(m=>m.id),vb.action.marks.map(m=>m.id),'same board');}
   if(['choose','waiting'].includes(state))assert.notEqual(va.feedback.text,vb.feedback.text,'the link speaks of the clue found');
  }
  // The manner changes the scene of the next encounter and the page of the notebook.
  const x=Q.chainView(payload(id,a,'resolved',{manner:m0,days:1}).chains.find(c=>c.id===id));
  const y=Q.chainView(payload(id,a,'resolved',{manner:m1,days:1}).chains.find(c=>c.id===id));
  assert.notEqual(x.encounter.story,y.encounter.story);assert.notEqual(x.outcome.text,y.outcome.text);
  assert.match(x.outcome.decision,/Indice : .* · manière : /);
  const w=Q.chainView(payload(id,a,'waiting',{manner:m0}).chains.find(c=>c.id===id));
  assert.equal(w.action.kind,'wait');assert.equal(w.encounter.progress,'0/1 jour actif confirmé depuis ton choix');
  assert.match(w.encounter.waiting,/n’importe quel sport, à l’heure qui te convient/);
  assert.equal(w.closed.length,1,'the other manner stays readable');
 }
});

test('link and choice: concrete feedback, the last mark on the board, a local choice confirmed once, conflicts explained',()=>{
 const wrong=Q.chainView(payload('atelier-oublie','cairn-fendu','link',{attempts:1,lastAnswer:['cerf'],lastCorrect:false}).chains[0]);
 assert.equal(wrong.feedback.correct,false);assert.match(wrong.feedback.text,/marteau posé sur une pierre/);
 assert.equal(wrong.action.marks.find(m=>m.last).id,'cerf');assert.equal(wrong.attemptsText,'1 essai(s)');
 const choose=Q.chainView(payload('atelier-oublie','cairn-fendu','choose',{attempts:2}).chains[0],'fr','motifs');
 assert.equal(choose.action.confirm.id,'motifs');assert.match(choose.action.confirm.body,/définitif/);
 assert.equal(Q.chainView(payload('atelier-oublie','cairn-fendu','choose').chains[0]).action.confirm,null,'nothing chosen until a tap');
 const item=payload('feux-cote','feu-chenal','waiting',{manner:'lanterne'}).chains[1];
 assert.match(Q.conflict('livre',item),/déjà choisie depuis un autre appareil : Rallumer la lanterne/);
 assert.equal(Q.conflict('lanterne',item),'');
 // The expected mark never comes from the server and is never shown before the right answer.
 assert.ok(!JSON.stringify(payload('feux-cote','feu-chenal','link')).includes('"answer"'));
 assert.equal(Q.chainView({id:'feux-cote',version:9,state:'link'}).state,'unknown');
 assert.equal(Q.chainView({id:'feux-cote',state:'unknown',version:2}).text,Q.t('chain.unknown'));
 assert.equal(Q.chainView({id:'nulle',state:'none'}),null);
 assert.match(Q.errorText('ENCOUNTER_INCOMPLETE'),/séance confirmée/);assert.match(Q.errorText('RPG_TIMEOUT'),/Synchronisation impossible/);
});

test('map: the notebook is one tap away on every world; a chain shows on its two worlds only',()=>{
 const p=payload('atelier-oublie','symbole-cerf','choose');
 const aube=Q.mapEntries(p,'aube'),forge=Q.mapEntries(p,'forge'),marees=Q.mapEntries(p,'marees');
 assert.equal(aube.label,'Carnet d’indices');assert.equal(aube.count,'1 indice(s) · 1 piste(s)');
 assert.deepEqual(aube.here.map(x=>[x.id,x.direction]),[['atelier-oublie','from']]);
 assert.deepEqual(forge.here.map(x=>[x.id,x.direction]),[['atelier-oublie','to']]);
 assert.match(aube.here[0].label,/Piste vers la Forge des Titans : L’atelier oublié/);
 assert.deepEqual(marees.here.map(x=>[x.id,x.state]),[['feux-cote','locked']]);
 assert.equal(Q.mapEntries({chains:[],clues:[]},'aube').here.length,0);
});
