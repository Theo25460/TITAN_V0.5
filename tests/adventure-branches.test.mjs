// V1.5.0 — Bifurcations. The versioned pilot configuration is the same on the website, on Android and on the server, and
// both routes ask exactly the same effort while opening different scenes, interactions and clues.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ROOT=new URL('..',import.meta.url).pathname;
const B=require('../js/core/adventure-branches.js');
const R=require('../js/core/adventure-rpg.js');
const SQL=readFileSync(ROOT+'supabase/migrations/20261123090000_adventure_branches_v1.sql','utf8');

test('server contract and shared configuration are the same JSON, and Android ships a byte copy',()=>{
 const cfg=JSON.parse(SQL.match(/\$cfg\$(.*?)\$cfg\$/s)[1]);
 assert.deepEqual(cfg,B.contract('aube-arc1',1));
 assert.equal(B.pilotFor('aube').id,'aube-arc1');
 for(const w of ['marees','forge','aurores'])assert.equal(B.pilotFor(w),null,'one pilot arc only');
 assert.match(SQL,/when p_world = 'aube' then private\.titan_adventure_branch_config\('aube-arc1', 1\)/);
 assert.equal(readFileSync(ROOT+'mobile/src/core/web/adventure-branches.js','utf8'),readFileSync(ROOT+'js/core/adventure-branches.js','utf8'));
 assert.match(readFileSync(ROOT+'mobile/scripts/sync-web-core.mjs','utf8'),/"js\/core\/adventure-branches\.js"/);
 assert.match(readFileSync(ROOT+'adventure.html','utf8'),/\/js\/core\/adventure-branches\.js\?v=\d/);
});

const snap=(branch,{target=15,earned=[1,2],ready=[3]}={})=>({version:1,owner:'u',world:'aube',active:true,chapter:9,target,days:6,effort:120,
 rewards:earned.map(o=>({ordinal:o,choice:o===2?(branch.route==='ruines'?1:0):null})),familyTitles:[],
 milestones:R.path('aube').map(n=>({ordinal:n.ordinal,effortTarget:n.ordinal*target,daysTarget:Math.ceil(n.ordinal/2),earned:earned.includes(n.ordinal),ready:ready.includes(n.ordinal)})),
 branch:{pilot:'aube-arc1',version:1,...branch}});
const confirmed=(route,extra={})=>({state:'confirmed',route,effortSince:20,daysSince:1,steps:[{ordinal:3,branchReady:true,earned:false},{ordinal:4,branchReady:false,earned:false}],clue:null,...extra});

test('same sessions, two routes: different scenes, interactions and clues, identical effort for every frozen target',()=>{
 for(let target=15;target<=45;target++){
  const a=B.view(snap(confirmed('corniche'),{target})),b=B.view(snap(confirmed('ruines'),{target}));
  assert.equal(a.steps.length,2);assert.equal(b.steps.length,2);
  for(let i=0;i<2;i++){
   for(const k of ['effortTarget','daysTarget','effort','days','ready','ordinal','progress'])assert.equal(a.steps[i][k],b.steps[i][k],`${k} equal at target ${target}`);
   for(const k of ['name','story','action','done'])assert.notEqual(a.steps[i][k],b.steps[i][k],`${k} differs`);
  }
  assert.equal(a.steps[1].effortTarget,2*target);assert.equal(a.steps[1].daysTarget,2);
  assert.equal(a.equal,b.equal);
 }
 const clue=(route,id)=>B.view(snap(confirmed(route,{clue:{id,state:'usable'}}),{earned:[1,2,3,4],ready:[]})).clue;
 const p=clue('corniche','prise'),s=clue('ruines','serment');
 assert.equal(p.name,'La prise dans la roche');assert.equal(s.name,'Le fragment du serment');
 assert.equal(p.label,'Indice utilisable face au Veilleur de pierre');assert.equal(p.label,s.label);assert.notEqual(p.text,s.text);
 assert.match(B.view(snap(confirmed('corniche'))).routes[0].reveals,/où prendre appui/);
 assert.match(B.view(snap(confirmed('corniche'))).routes[1].reveals,/pourquoi le Veilleur a fermé le passage/);
});

test('states: compatible entry, explicit decision, stable route, legacy and unknown versions',()=>{
 const available=B.view(snap({state:'available'},{earned:[1],ready:[2]}));
 assert.equal(available.state,'available');assert.equal(available.enter,'Découvrir les deux voies');
 const entered=B.view(snap({state:'entered'},{earned:[1],ready:[]}));
 assert.equal(entered.ready,false);assert.match(entered.notReady,/point\(s\) d’effort/);
 assert.equal(B.view(snap({state:'entered'},{earned:[1],ready:[2]})).ready,true);
 const followed=B.view(snap(confirmed('ruines')));
 assert.equal(followed.followed,'Voie suivie : les ruines');assert.deepEqual(followed.closed,['Voie non empruntée : la corniche']);
 assert.equal(B.conflict('ruines',snap(confirmed('corniche'))),'Ta voie était déjà confirmée depuis un autre appareil : la corniche. Elle reste ta voie.');
 assert.equal(B.conflict('corniche',snap(confirmed('corniche'))),'');
 const path=R.path('aube');
 assert.equal(B.nodes(path,snap({state:'legacy'})),path,'legacy keeps its original narrative');
 assert.equal(B.view(snap({state:'legacy'})).state,'legacy');
 assert.equal(B.view(snap({state:'confirmed',route:'corniche',version:99})).state,'unknown','unknown version is never guessed');
 assert.equal(B.view({...snap({state:'none'})}),null);assert.equal(B.view({active:true,branch:undefined}),null,'v1 server: no pilot');
 const nodes=B.nodes(path,snap(confirmed('corniche')));
 assert.deepEqual(nodes.slice(1,4).map(n=>n.name),['Le passage condamné','La corniche effondrée','La prise dans la roche']);
 assert.deepEqual(nodes.slice(4).map(n=>n.name),path.slice(4).map(n=>n.name),'only the pilot ordinals change');
 assert.deepEqual(B.nodes(path,snap({state:'entered'},{earned:[1]})).slice(2,4).map(n=>n.name),['Corniche ou ruines','Un indice à découvrir']);
});

test('scenes are short, keyed and translatable',()=>{
 const fr=B.strings.fr;
 for(const [key,text] of Object.entries(fr)){
  assert.ok(text.length<=180,`${key} stays short`);assert.doesNotMatch(text,/\{(?!\w+\})/,key);
 }
 for(const route of ['corniche','ruines'])for(const part of ['name','label','reveals','scene.name','scene.story','scene.action','scene.done','clue.name','clue.story','clue.action','clue.done'])
  assert.ok(fr[`route.${route}.${part}`],`${route}.${part}`);
 assert.equal(B.t('pilot.choose',{route:'x'},'en'),'Choisir x','missing locale falls back to French');
 // No economy wording that would promise XP or credits for a route.
 assert.doesNotMatch(Object.values(fr).join(' '),/\+\s*\d+\s*XP|crédits gagnés/);
});
