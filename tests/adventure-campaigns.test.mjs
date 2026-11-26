// V1.5.3 — Quatre mondes, quatre mécaniques. The common campaign configuration is the same JSON on the website, on Android and
// on the server; the Vallée contracts are unchanged; the dead-path control passes and catches every broken path; the four arcs
// ask the same effort for every frozen target and on both routes, and end on distinct resolutions.
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
const R=globalThis.TitanAdventureRpg,B=globalThis.TitanAdventureBranches,G=globalThis.TitanAdventureGuardian;
const C=require('../js/core/adventure-campaigns.js');
const SQL=readFileSync(ROOT+'supabase/migrations/20261130103400_adventure_campaigns_v1.sql','utf8');
const blocks=[...SQL.matchAll(/\$cfg\$(.*?)\$cfg\$/gs)].map(m=>JSON.parse(m[1]));
const clone=o=>JSON.parse(JSON.stringify(o));

test('server contract and shared configuration are the same JSON; the Vallée literals are unchanged; Android ships a byte copy',()=>{
 assert.equal(blocks.length,5,'three campaigns + the two Vallée literals');
 for(const id of ['marees-arc1','forge-arc1','aurores-arc1'])assert.deepEqual(blocks.find(b=>b.id===id),C.contract(id,1),id);
 assert.deepEqual(blocks.find(b=>b.id==='aube-arc1'),B.contract('aube-arc1',1),'V1.5.0 contract kept literally');
 assert.deepEqual(blocks.find(b=>b.id==='veilleur'),G.contract('veilleur',1),'V1.5.1 contract kept literally');
 for(const [w,id] of [['marees','marees-arc1'],['forge','forge-arc1'],['aurores','aurores-arc1']]){
  assert.equal(C.campaignFor(w).id,id);
  assert.match(SQL,new RegExp(`when '${w}' then private\\.titan_adventure_campaign_config\\('${id}', 1\\)`));
 }
 assert.equal(C.campaignFor('aube'),null,'the Vallée keeps its own modules');
 assert.equal(C.forWorld('aube').branches,B);assert.equal(C.forWorld('aube').guardian,G);
 for(const w of ['marees','forge','aurores'])assert.equal(C.forWorld(w).campaign,true);
 assert.equal(readFileSync(ROOT+'mobile/src/core/web/adventure-campaigns.js','utf8'),readFileSync(ROOT+'js/core/adventure-campaigns.js','utf8'));
 assert.match(readFileSync(ROOT+'mobile/scripts/sync-web-core.mjs','utf8'),/"js\/core\/adventure-campaigns\.js"/);
 assert.match(readFileSync(ROOT+'adventure.html','utf8'),/\/js\/core\/adventure-campaigns\.js\?v=\d/);
 // Projections used by the V1.5.0/V1.5.1 server functions (same derivation as titan_adventure_campaign_branch/_guardian).
 const b=C.branchContract(C.contract('forge-arc1',1)),g=C.guardianContract(C.contract('forge-arc1',1));
 assert.deepEqual(Object.keys(b),Object.keys(B.contract('aube-arc1',1)));assert.deepEqual(b.steps,B.contract('aube-arc1',1).steps,'same conditions');
 assert.equal(g.pilot,'forge-arc1');assert.deepEqual(g.signs,[]);assert.deepEqual(g.pilotVersions,[1]);
});

test('dead-path control: four arcs, four mechanics, eight reachable resolutions, no time window and no compulsory discipline',()=>{
 const {problems,resolutions,primitives}=C.auditAll();
 assert.deepEqual(problems,[]);
 assert.deepEqual(primitives,{aube:'pick',marees:'chart',forge:'sequence',aurores:'link'});
 assert.equal(resolutions.length,8);assert.equal(new Set(resolutions).size,8);
 const out=execFileSync('node',[ROOT+'tools/check-campaign-paths.mjs'],{encoding:'utf8'});
 assert.match(out,/8 resolutions reachable, 0 problem\(s\)/);
});

test('dead-path control catches every broken path (mutations)',()=>{
 const base=C.contract('marees-arc1',1),S=C.strings.fr;
 const audit=(mut,strings=S)=>{const c=clone(base);mut(c);return C.audit('marees',{config:c,strings});};
 const cases=[
  [c=>{c.routes[1].choice=0;},/dead choice/],
  [c=>{delete c.routes[1].outcome;},/no resolution/],
  [c=>{c.routes[1].outcome=c.routes[0].outcome;},/same resolution/],
  [c=>{c.routes[0].answer=['est','ouest','nulle'];},/not accepted by the primitive/],
  [c=>{c.routes[0].answer=['est','calme','chenal'];},/never observed/],
  [c=>{c.steps[1].window='06:00-08:00';},/condition other than effort|time window/],
  [c=>{c.steps[0].sport='running';},/condition other than effort|compulsory discipline/],
  [c=>{c.steps[1].effortTargets=1;},/not increasing/],
  [c=>{c.steps[1].effortTargets=9;},/frozen resolution threshold/],
  [c=>{c.guardian.observeOrdinal=7;c.guardian.ordinal=8;},/skipped|mini-boss|leaves the arc/],
  [c=>{c.routes[0].slots[2].pool=['chenal'];},/no real decision/],
 ];
 for(const [mut,re] of cases){const p=audit(mut);assert.ok(p.some(x=>re.test(x)),`${re}: ${JSON.stringify(p)}`);}
 const missing={...S};delete missing['marees-arc1.route.carte.wrong.sud'];
 assert.ok(audit(()=>{},missing).some(x=>/no feedback for a wrong sud/.test(x)));
 const silent={...S};silent['marees-arc1.route.gardienne.clue.done']='Le chant ne dit plus rien.';
 assert.ok(audit(()=>{},silent).some(x=>/never observed/.test(x)),'a clue that stops naming what is expected is a dead end');
 const sequence=clone(C.contract('forge-arc1',1));sequence.routes[0].answer=['cuir','cuir','buse'];
 assert.ok(C.audit('forge',{config:sequence}).some(x=>/not accepted/.test(x)),'a piece cannot be used twice');
});

test('the common primitive behaves like the server: one token per slot, distinct pieces and beacons, first wrong slot',()=>{
 const m=C.contract('marees-arc1',1).routes[0],f=C.contract('forge-arc1',1).routes[0],a=C.contract('aurores-arc1',1).routes[1];
 assert.deepEqual(C.check('chart',m,['est','ouest','chenal']),{valid:true,correct:true,firstWrong:null});
 assert.deepEqual(C.check('chart',m,['est','est','chenal']),{valid:true,correct:false,firstWrong:2},'a chart may repeat a current');
 assert.equal(C.check('chart',m,['est','ouest']).valid,false);assert.equal(C.check('chart',m,['nord','ouest','chenal']).valid,false);
 assert.deepEqual(C.check('sequence',f,['charniere','buse','cuir']),{valid:true,correct:false,firstWrong:2});
 assert.equal(C.check('sequence',f,['charniere','charniere','buse']).valid,false);
 assert.deepEqual(C.check('link',a,['rocher','pin','cairn']),{valid:true,correct:false,firstWrong:3});
 assert.equal(C.check('link',a,['rocher','pin','pin']).valid,false);
});

const ARC={marees:{id:'marees-arc1',guardian:'gardienne'},forge:{id:'forge-arc1',guardian:'artisan'},aurores:{id:'aurores-arc1',guardian:'sentinelle'}};
function snap(world,route,state,{target=15,effort=80,days=3,chapter=9,branch='confirmed',lastAnswer=null,lastCorrect=null,firstWrong=null,attempts=0}={}){
 const c=C.contract(ARC[world].id,1),r=c.routes.find(x=>x.id===route),ord=['locked','observe'].includes(state)?5:6;
 return {version:1,owner:'u',world,active:true,chapter,target,days,effort,rewards:[],familyTitles:[],
  milestones:R.path(world).map(n=>({ordinal:n.ordinal,effortTarget:n.ordinal*target,daysTarget:Math.ceil(n.ordinal/2),earned:n.ordinal<ord,ready:n.ordinal===2})),
  branch:branch==='confirmed'?{state:'confirmed',pilot:c.id,version:1,route,effortSince:30,daysSince:2,
    steps:c.steps.map(s=>({ordinal:s.ordinal,kind:s.kind,effortTarget:s.effortTargets*target,daysTarget:s.daysTarget,branchReady:true,earned:true})),clue:{id:r.clue,state:'usable'}}:{state:branch,pilot:c.id,version:1},
  guardian:state==='none'?{state:'none'}:{state,id:ARC[world].guardian,version:1,route,clue:r.clue,observeOrdinal:5,ordinal:6,signs:[],observedAt:ord===6||state==='prepare'?'2026-11-19T08:00:00Z':null,
   attempts,lastSign:null,lastCorrect:null,preparedAt:['waiting','ready','resolved'].includes(state)?'2026-11-19T09:00:00Z':null,
   outcome:state==='resolved'?r.outcome:null,resolvedAt:state==='resolved'?'2026-11-20T09:00:00Z':null,
   threshold:{ordinal:ord,effort,effortTarget:ord*target,days,daysTarget:3,chapter,chapterTarget:3,ready:effort>=ord*target&&days>=3},
   sincePrepared:{effort:0,sessions:0},corrected:{effort:0,sessions:0}},
  mechanic:state==='none'?{state:'none'}:{state,primitive:c.guardian.primitive,route,slots:r.slots,attempts,lastAnswer,lastCorrect,firstWrong,solved:['waiting','ready','resolved'].includes(state)}};
}

test('three worlds, two routes each: same phases and thresholds for every frozen target, distinct scenes, mechanics and resolutions',()=>{
 for(const world of ['marees','forge','aurores']){
  const [r0,r1]=C.contract(ARC[world].id,1).routes.map(r=>r.id);
  for(let target=15;target<=45;target++)for(const state of ['observe','prepare','waiting','ready','resolved']){
   const a=C.guardianView(snap(world,r0,state,{target})),b=C.guardianView(snap(world,r1,state,{target}));
   assert.deepEqual(a.phases,b.phases,`${world} phases (${state})`);assert.deepEqual(a.threshold,b.threshold,`${world} same effort (${state}, ${target})`);
   if(['waiting','ready','resolved'].includes(state))assert.notEqual(a.scene.caption,b.scene.caption,`${world} scene differs (${state})`);
   const ba=C.branchView(snap(world,r0,state,{target})),bb=C.branchView(snap(world,r1,state,{target}));
   assert.equal(ba.equal,bb.equal);assert.deepEqual(ba.steps.map(s=>[s.effortTarget,s.daysTarget]),bb.steps.map(s=>[s.effortTarget,s.daysTarget]));
   assert.notEqual(ba.steps[0].name,bb.steps[0].name,'the choice changes the scene');
  }
  const pa=C.guardianView(snap(world,r0,'prepare')),pb=C.guardianView(snap(world,r1,'prepare'));
  assert.equal(pa.action.kind,'solve');assert.equal(pa.action.slots.length,3);assert.equal(pa.action.primitive,C.contract(ARC[world].id,1).guardian.primitive);
  assert.ok(pa.action.slots.every(s=>s.options.length>=3),'a real decision in every slot');
  const oa=C.guardianView(snap(world,r0,'resolved')),ob=C.guardianView(snap(world,r1,'resolved'));
  assert.notEqual(oa.outcome.id,ob.outcome.id);assert.notEqual(oa.outcome.text,ob.outcome.text);
  assert.ok(oa.resume.acquired.some(x=>x.includes(':')),'the answer is part of what is acquired');
  // The three worlds share the conditions of the Vallée pilot (same multiples of the frozen target, same days).
  assert.deepEqual(C.contract(ARC[world].id,1).steps,B.contract('aube-arc1',1).steps);
 }
 const phrases=['marees','forge','aurores'].map(w=>C.guardianView(snap(w,C.contract(ARC[w].id,1).routes[0].id,'prepare')).phases[1].name);
 assert.deepEqual(phrases,['Tracer la carte','Assembler','Relier les balises'],'each world names its own mechanic');
});

test('wrong answer: concrete feedback on the first wrong slot, correctable; read back the same on another device',()=>{
 const wrong=C.guardianView(snap('marees','carte','prepare',{lastAnswer:['est','est','chenal'],lastCorrect:false,firstWrong:2,attempts:1}));
 assert.equal(wrong.feedback.correct,false);assert.equal(wrong.feedback.slot,'sud');assert.match(wrong.feedback.text,/bouées du sud/);
 assert.deepEqual(wrong.action.slots.map(s=>s.last),['est','est','chenal'],'the last answer stays on the board');
 const forge=C.guardianView(snap('forge','artisans','prepare',{lastAnswer:['ressort','axe','tete'],lastCorrect:false,firstWrong:1,attempts:1}));
 assert.match(forge.feedback.text,/tout commence/);assert.equal(forge.action.distinct,true);
 const right=C.guardianView(snap('aurores','histoire','waiting',{lastAnswer:['rocher','pin','col'],lastCorrect:true,attempts:2}));
 assert.equal(right.feedback.correct,true);assert.match(right.resume.acquired.join(' '),/la balise du rocher → la balise du pin → la balise du col/);
 assert.equal(C.errorText('INVALID_ANSWER').length>0,true);assert.match(C.errorText('RPG_TIMEOUT'),/Synchronisation impossible/);
});

test('old chapters and unknown versions: the arc keeps its version, nothing is invented',()=>{
 const legacy=C.branchView(snap('marees','carte','none',{branch:'legacy'}));
 assert.equal(legacy.state,'legacy');assert.match(legacy.text,/version d’origine et tous ses acquis/);
 const unknown=snap('forge','soufflet','none',{branch:'entered'});unknown.branch.version=2;
 assert.equal(C.branchView(unknown).state,'unknown');
 const g=snap('aurores','histoire','prepare');g.guardian.version=2;assert.equal(C.guardianView(g).state,'unknown');
 assert.equal(C.guardianView(snap('marees','carte','none')),null);
 // Map nodes: the arc's ordinals are renamed for the route followed, the 12 other milestones are untouched.
 const path=R.path('forge'),nodes=C.nodes(path,snap('forge','soufflet','resolved'));
 assert.equal(nodes[2].name,'Le soufflet crevé');assert.equal(nodes[5].name,'L’Artisan de braise');
 assert.deepEqual(nodes.slice(6),path.slice(6));
 assert.equal(C.conflict('carte',{branch:{route:'gardienne',pilot:'marees-arc1',version:1}}),'Ta voie était déjà confirmée depuis un autre appareil : la Gardienne. Elle reste ta voie.');
});
