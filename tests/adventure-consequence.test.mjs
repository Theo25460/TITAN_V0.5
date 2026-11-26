// V1.5.2 — Camp et conséquences. The versioned consequence contract is the same on the website, on Android and on the server;
// each canonical outcome of the Veilleur opens one distinct access (shortcut or annex room) with its own interaction, linked
// from one return point only (the Camp de base), and nothing in it touches the sport rules or the LIVE economy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ROOT=new URL('..',import.meta.url).pathname;
const C=require('../js/core/adventure-consequence.js');
const G=require('../js/core/adventure-guardian.js');
const R=require('../js/core/adventure-rpg.js');
const SQL=readFileSync(ROOT+'supabase/migrations/20261130103300_adventure_consequence_v1.sql','utf8');

test('server contract and shared configuration are the same JSON, and Android ships a byte copy',()=>{
 const cfg=JSON.parse(SQL.match(/\$cfg\$(.*?)\$cfg\$/s)[1]);
 assert.deepEqual(cfg,C.contract('veilleur-retour',1));
 assert.equal(C.consequenceFor('aube').id,'veilleur-retour');
 for(const w of ['marees','forge','aurores'])assert.equal(C.consequenceFor(w),null,'one consequence in the lot');
 assert.match(SQL,/when p_world = 'aube' then private\.titan_adventure_consequence_config\('veilleur-retour', 1\)/);
 // One access per canonical outcome of the V1.5.1 guardian, on the same route.
 const g=G.contract('veilleur',1);
 assert.equal(cfg.guardian,g.id);assert.deepEqual(cfg.guardianVersions,[1]);
 assert.deepEqual(cfg.outcomes.map(o=>[o.route,o.outcome]),g.routes.map(r=>[r.route,r.outcome]));
 assert.equal(cfg.returnPoint,'camp');
 for(const o of cfg.outcomes){for(const a of o.answer)assert.ok(o.marks.includes(a));assert.equal(new Set(o.marks).size,o.marks.length);}
 assert.equal(readFileSync(ROOT+'mobile/src/core/web/adventure-consequence.js','utf8'),readFileSync(ROOT+'js/core/adventure-consequence.js','utf8'));
 assert.match(readFileSync(ROOT+'mobile/scripts/sync-web-core.mjs','utf8'),/"js\/core\/adventure-consequence\.js"/);
 for(const page of ['adventure.html','seance-live.html'])assert.match(readFileSync(ROOT+page,'utf8'),/\/js\/core\/adventure-consequence\.js\?v=\d/);
});

const ITEM={passage_rouvert:{route:'corniche',kind:'shortcut'},serment_restitue:{route:'ruines',kind:'annex'}};
const item=(outcome,state,extra={})=>({state,world:'aube',id:'veilleur-retour',version:1,returnPoint:'camp',outcome,...ITEM[outcome],
 resolvedAt:'2026-11-19T09:00:00Z',attempts:0,lastAnswer:null,lastCorrect:null,discoveredAt:state==='open'?'2026-11-19T10:00:00Z':null,visits:0,lastVisitAt:null,...extra});

test('the two outcomes open two distinct accesses: different content and different actions',()=>{
 const a=C.view(item('passage_rouvert','discover')),b=C.view(item('serment_restitue','discover'));
 assert.equal(a.kind,'shortcut');assert.equal(b.kind,'annex');assert.equal(a.need,2);assert.equal(b.need,1);
 assert.notEqual(a.title,b.title);assert.notEqual(a.intro,b.intro);assert.notEqual(a.item.name,b.item.name);
 assert.deepEqual(a.marks.map(m=>m.id),['cairn','pin','tour','cascade']);assert.deepEqual(b.marks.map(m=>m.id),['cerf','soleil','spirale','vague']);
 assert.equal(a.marks.filter(m=>a.marks.some(n=>n.name===m.name)).length,4);
 // Corniche: the first landmark stays local (select), the second sends the alignment. Ruins: one tap sends.
 assert.ok(a.marks.every(m=>!m.sends&&/^Viser /.test(m.label)));
 const a2=C.view(item('passage_rouvert','discover'),'fr','cairn');
 assert.equal(a2.marks.find(m=>m.id==='cairn').selected,true);
 assert.ok(a2.marks.filter(m=>m.id!=='cairn').every(m=>m.sends&&/^Aligner avec /.test(m.label)));
 assert.match(a2.selectedText,/le cairn fendu/);
 assert.ok(b.marks.every(m=>m.sends&&/^Poser le fragment sur /.test(m.label)));
 assert.equal(C.view(item('serment_restitue','discover'),'fr','cerf').selectedText,'','no local selection with one engraving');
 const oa=C.view(item('passage_rouvert','open',{attempts:2,lastAnswer:['cairn','pin'],lastCorrect:true}));
 const ob=C.view(item('serment_restitue','open',{attempts:1,lastAnswer:['cerf'],lastCorrect:true}));
 assert.equal(oa.access.action,'Emprunter le raccourci');assert.equal(ob.access.action,'Entrer dans la salle annexe');
 assert.equal(oa.access.from,'La clairière des lucioles');assert.equal(oa.access.to,'Le passage du Veilleur');
 assert.equal(ob.access.to,'La salle annexe');assert.deepEqual(oa.marks,[]);assert.equal(oa.feedback.correct,true);
 // Both sectors of the shortcut are already open at the end of the arc: the arc's first place and the guardian's passage.
 const path=R.path('aube');assert.equal(path[0].name,'La clairière des lucioles');assert.equal(path[5].kind,'miniboss');
});

test('wrong answers get a concrete, correctable answer; visits rotate three short explorations',()=>{
 const w=C.view(item('passage_rouvert','discover',{attempts:1,lastAnswer:['cairn','tour'],lastCorrect:false}));
 assert.equal(w.feedback.correct,false);assert.match(w.feedback.text,/tour des passeurs.*pas sur ton croquis/);assert.equal(w.marks.length,4);
 assert.match(C.view(item('passage_rouvert','discover',{lastAnswer:['cascade','tour'],lastCorrect:false})).feedback.text,/cascade/);
 for(const m of ['soleil','spirale','vague'])assert.ok(C.view(item('serment_restitue','discover',{lastAnswer:[m],lastCorrect:false})).feedback.text.length>40);
 for(const o of ['passage_rouvert','serment_restitue']){
  assert.equal(C.view(item(o,'open')).access.vignette,'');assert.match(C.view(item(o,'open')).access.visitsText,/Pas encore/);
  const v=[1,2,3,4].map(n=>C.view(item(o,'open',{visits:n})).access.vignette);
  assert.equal(new Set(v.slice(0,3)).size,3);assert.equal(v[3],v[0]);
 }
 for(const k of Object.keys(C.strings.fr))assert.ok(C.strings.fr[k].length>0,k);
});

test('the Camp shows one card per linked access, nothing for an account without a resolved pilot guardian',()=>{
 assert.deepEqual(C.campEntries({items:[]}),[]);assert.deepEqual(C.campEntries(null),[]);
 assert.equal(C.view({state:'none',world:'aube'}),null);
 const [e]=C.campEntries({items:[item('passage_rouvert','discover')]});
 assert.equal(e.href,'/adventure?world=aube#retour');assert.equal(e.cta,'Monter au belvédère');assert.match(e.text,/Le camp retrouve le passage rouvert/);
 const [f]=C.campEntries({items:[item('serment_restitue','open')]});
 assert.equal(f.cta,'Entrer dans la salle annexe');assert.match(f.text,/salle annexe/);
 assert.equal(C.view({state:'unknown',world:'aube',id:'veilleur-retour',version:9}).state,'unknown');
 assert.deepEqual(C.campEntries({items:[{state:'unknown',world:'aube',id:'veilleur-retour',version:9}]}),[]);
 assert.match(C.errorText('RPG_OFFLINE'),/Hors ligne/);assert.match(C.errorText('Failed to fetch'),/Synchronisation impossible/);
 assert.match(C.errorText('CONSEQUENCE_NOT_DISCOVERED'),/Découvre d’abord/);
});

test('one return point: only the Camp links to the access, and the access never touches the economy or LIVE',()=>{
 const live=readFileSync(ROOT+'js/app/live.js','utf8'),panel=readFileSync(ROOT+'js/app/aventure-retour.js','utf8');
 assert.match(live,/TitanConsequencePanel\?\.campHtml\(consequences\)/);
 const linkers=['js/app/qg.js','js/app/journal.js','js/app/carriere.js','js/app/aventure-rpg.js','js/app/communaute.js'].filter(f=>/consequence/i.test(readFileSync(ROOT+f,'utf8')));
 assert.deepEqual(linkers,[],'no second return point on the website');
 assert.doesNotMatch(panel.replace(/\/\*[\s\S]*?\*\//g,''),/titan_live_|wallet|\bxp\b|\bcredits\b/i);
 assert.doesNotMatch(SQL.replace(/--[^\n]*/g,''),/update public\.profiles|titan_live_wallets|titan_live_buildings|adventure_encounter_rewards\s*\(|insert into private\.adventure_encounter_rewards/i);
});
