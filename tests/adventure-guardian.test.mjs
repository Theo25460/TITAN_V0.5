// V1.5.1 — Gardiens. The versioned Veilleur contract is the same on the website, on Android and on the server; both routes
// open the same phases on the same frozen thresholds and end with two distinct resolutions; every scene state has a complete
// text alternative for reduced motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ROOT=new URL('..',import.meta.url).pathname;
const G=require('../js/core/adventure-guardian.js');
const R=require('../js/core/adventure-rpg.js');
const B=require('../js/core/adventure-branches.js');
const SQL=readFileSync(ROOT+'supabase/migrations/20261124090000_adventure_guardian_v1.sql','utf8');

test('server contract and shared configuration are the same JSON, and Android ships a byte copy',()=>{
 const cfg=JSON.parse(SQL.match(/\$cfg\$(.*?)\$cfg\$/s)[1]);
 assert.deepEqual(cfg,G.contract('veilleur',1));
 assert.equal(G.guardianFor('aube').id,'veilleur');
 for(const w of ['marees','forge','aurores'])assert.equal(G.guardianFor(w),null,'the Veilleur is the only guardian of the lot');
 assert.match(SQL,/when p_world = 'aube' then private\.titan_adventure_guardian_config\('veilleur', 1\)/);
 // The guardian belongs to the V1.5.0 pilot: same pilot id and version, the clues are the branch clues.
 assert.equal(cfg.pilot,B.contract('aube-arc1',1).id);assert.deepEqual(cfg.pilotVersions,[1]);
 assert.deepEqual(cfg.routes.map(r=>[r.route,r.clue]),B.contract('aube-arc1',1).routes.map(r=>[r.id,r.clue]));
 // Corniche clue → reopening of the passage; ruins fragment → restitution of the oath.
 assert.deepEqual(cfg.routes.map(r=>r.outcome),['passage_rouvert','serment_restitue']);
 const path=R.path('aube');assert.equal(path[cfg.observeOrdinal-1].arc,1);assert.equal(path[cfg.ordinal-1].kind,'miniboss');
 assert.equal(readFileSync(ROOT+'mobile/src/core/web/adventure-guardian.js','utf8'),readFileSync(ROOT+'js/core/adventure-guardian.js','utf8'));
 assert.match(readFileSync(ROOT+'mobile/scripts/sync-web-core.mjs','utf8'),/"js\/core\/adventure-guardian\.js"/);
 assert.match(readFileSync(ROOT+'adventure.html','utf8'),/\/js\/core\/adventure-guardian\.js\?v=\d/);
});

const ROUTE={corniche:{clue:'prise',sign:'fissure',outcome:'passage_rouvert',choice:0},ruines:{clue:'serment',sign:'gravure',outcome:'serment_restitue',choice:1}};
function snap(route,state,{target=15,effort=80,days=3,chapter=9,lastSign=null,attempts=0,since=0,corrected=0}={}){
 const r=ROUTE[route],ord=['locked','observe'].includes(state)?5:6;
 const th={ordinal:ord,effort,effortTarget:ord*target,days,daysTarget:3,chapter,chapterTarget:3,ready:effort>=ord*target&&days>=3};
 const prepared=['waiting','ready','resolved'].includes(state);
 return {version:1,owner:'u',world:'aube',active:true,chapter,target,days,effort,rewards:[],familyTitles:[],
  milestones:R.path('aube').map(n=>({ordinal:n.ordinal,effortTarget:n.ordinal*target,daysTarget:Math.ceil(n.ordinal/2),earned:n.ordinal<ord,ready:false})),
  branch:{state:'confirmed',pilot:'aube-arc1',version:1,route,clue:{id:r.clue,state:'usable'}},
  guardian:{state,id:'veilleur',version:1,route,clue:r.clue,observeOrdinal:5,ordinal:6,signs:['fissure','gravure','mousse'],
   observedAt:ord===6||state==='prepare'?'2026-11-19T08:00:00Z':null,attempts:prepared?Math.max(1,attempts):attempts,
   lastSign:prepared?r.sign:lastSign,lastCorrect:prepared?true:lastSign?lastSign===r.sign:null,preparedAt:prepared?'2026-11-19T09:00:00Z':null,
   outcome:state==='resolved'?r.outcome:null,resolvedAt:state==='resolved'?'2026-11-20T09:00:00Z':null,threshold:th,
   sincePrepared:{effort:since*20,sessions:since},corrected:{effort:corrected,sessions:corrected?1:0}}};
}

test('both routes: same phases and thresholds for every frozen target, distinct scenes, interactions and resolutions',()=>{
 for(let target=15;target<=45;target++)for(const state of ['observe','prepare','waiting','ready','resolved']){
  const a=G.view(snap('corniche',state,{target})),b=G.view(snap('ruines',state,{target}));
  assert.deepEqual(a.phases,b.phases,`phases equal (${state}, ${target})`);
  assert.deepEqual(a.threshold,b.threshold,`same effort asked (${state}, ${target})`);
  assert.equal(a.text,b.text);assert.equal(a.equal,b.equal);
  if(a.threshold)assert.equal(a.threshold.progress.split(' · ')[0].split('/')[1],`${(state==='observe'?5:6)*target} points`);
  if(['waiting','ready','resolved'].includes(state))assert.notEqual(a.scene.caption,b.scene.caption,`scene differs (${state})`);
 }
 const ra=G.view(snap('corniche','ready')),rb=G.view(snap('ruines','ready'));
 assert.equal(ra.action.label,'Rouvrir le passage');assert.equal(rb.action.label,'Restituer le serment');
 assert.equal(ra.action.ready,true);assert.equal(ra.scene.focus,'fissure');assert.equal(rb.scene.focus,'gravure');
 const oa=G.view(snap('corniche','resolved')),ob=G.view(snap('ruines','resolved'));
 assert.equal(oa.outcome.id,'passage_rouvert');assert.equal(ob.outcome.id,'serment_restitue');
 assert.equal(oa.scene.passage,'open');assert.equal(oa.scene.pose,'aside');
 assert.equal(ob.scene.oath,'complete');assert.equal(ob.scene.pose,'bowing');assert.equal(ob.scene.passage,'closed');
 // A tester can say which clue counted and which decision closed the scene.
 assert.match(oa.outcome.decisive,/prise dans la roche.*fissure/);assert.match(oa.outcome.decision,/rouvrir le passage/);
 assert.match(ob.outcome.decisive,/fragment du serment.*gravure/);assert.match(ob.outcome.decision,/restitué le serment/);
 assert.equal(oa.action,null);assert.equal(oa.phases.every(p=>p.state==='done'),true);
});

test('observe, prepare with a concrete correction, wait, resolve: every phase and resume case',()=>{
 const locked=G.view(snap('corniche','locked',{effort:30}));
 assert.equal(locked.action,null);assert.equal(locked.scene.pose,'far');assert.match(locked.resume.next,/indice/);
 const notYet=G.view(snap('corniche','observe',{effort:60,days:2}));
 assert.equal(notYet.action.kind,'claim');assert.equal(notYet.action.ordinal,5);assert.equal(notYet.action.ready,false);
 assert.equal(notYet.threshold.remaining,'Ce qui ouvre la suite : 15 point(s) d’effort et 1 jour(s) actif(s) confirmés.');
 assert.equal(notYet.resume.next,notYet.threshold.remaining);
 assert.match(G.view(snap('corniche','observe',{effort:60,days:2,chapter:2})).threshold.remaining,/chapitre 3/);
 const open=G.view(snap('ruines','observe'));assert.equal(open.action.ready,true);assert.equal(open.resume.next,'Le serveur confirme l’ouverture : observe le Veilleur.');
 assert.deepEqual(open.phases.map(p=>p.state),['active','waiting','waiting']);
 const prepare=G.view(snap('corniche','prepare'));
 assert.deepEqual(prepare.action.signs.map(s=>s.id),['fissure','gravure','mousse']);assert.equal(prepare.feedback,null);
 assert.equal(prepare.scene.signs,true);assert.match(prepare.scene.caption,/fissure.*gravure.*mousse/);
 assert.equal(prepare.threshold,null,'the preparation asks no effort');
 const wrong=G.view(snap('corniche','prepare',{lastSign:'gravure',attempts:1}));
 assert.equal(wrong.feedback.correct,false);assert.match(wrong.feedback.text,/entaille dans la roche/);
 assert.equal(wrong.action.signs.find(s=>s.id==='gravure').chosen,true);
 assert.match(G.view(snap('ruines','prepare',{lastSign:'fissure',attempts:1})).feedback.text,/ligne qui manque/);
 assert.match(G.view(snap('ruines','prepare',{lastSign:'mousse',attempts:2})).feedback.text,/inscription/);
 const waiting=G.view(snap('corniche','waiting'));
 assert.equal(waiting.action.kind,'resolve');assert.equal(waiting.action.ready,false);assert.equal(waiting.feedback.correct,true);
 assert.equal(waiting.resume.next,'Aucune séance validée depuis ta préparation. Ce qui ouvre la suite : 10 point(s) d’effort et 0 jour(s) actif(s) confirmés.');
 assert.deepEqual(waiting.resume.acquired,['Voie suivie : la corniche','Indice : La prise dans la roche','Veilleur observé','Signe associé : la fissure']);
 assert.match(G.view(snap('corniche','waiting',{since:1,effort:85})).resume.next,/^1 séance\(s\) validée\(s\) depuis ta préparation\. .*5 point/);
 assert.match(G.view(snap('corniche','waiting',{corrected:20})).resume.corrected,/20 point\(s\)/);
 assert.equal(G.view(snap('corniche','resolved',{corrected:20})).resume.corrected,'','a corrected session never reopens a closed encounter');
 const ready=G.view(snap('ruines','ready',{effort:100}));assert.equal(ready.resume.next,'Résous la rencontre : le serveur a confirmé le seuil.');
 const done=G.view(snap('ruines','resolved',{effort:100}));
 assert.equal(done.resume.acquired.at(-1),'Issue : le serment restitué');assert.match(done.resume.next,/Vallée/);
 assert.equal(G.view({...snap('corniche','observe'),guardian:{state:'legacy',id:'veilleur',version:1}}).state,'legacy');
 assert.equal(G.view({...snap('corniche','observe'),guardian:{state:'ready',id:'veilleur',version:9,route:'corniche'}}).state,'unknown','unknown version is never guessed');
 assert.equal(G.view({...snap('corniche','observe'),guardian:{state:'none'}}),null);
 assert.equal(G.view({active:true,branch:{state:'confirmed'}}),null,'server without V1.5.1: no guardian block');
});

test('scene states for motion have a complete text alternative, and the map names the guardian',()=>{
 const captions=new Set();
 for(const route of ['corniche','ruines'])for(const state of ['locked','observe','prepare','waiting','ready','resolved']){
  const v=G.view(snap(route,state));assert.ok(v.scene.caption.length>30,`${route} ${state} caption`);captions.add(`${state}:${v.scene.caption}`);
  assert.ok(['far','blocking','watching','aside','bowing'].includes(v.scene.pose));
 }
 assert.ok(captions.size>=8);
 const nodes=G.nodes(B.nodes(R.path('aube'),snap('corniche','prepare')),snap('corniche','prepare'));
 assert.deepEqual(nodes.slice(1,6).map(n=>n.name),['Le passage condamné','La corniche effondrée','La prise dans la roche','Face au Veilleur','Le Veilleur de pierre']);
 assert.equal(nodes[5].kind,'miniboss','the Veilleur stays the arc guardian in the bestiary');
 assert.deepEqual(nodes.slice(6).map(n=>n.name),R.path('aube').slice(6).map(n=>n.name),'only the pilot ordinals change');
 const legacy={...snap('corniche','observe'),guardian:{state:'legacy',id:'veilleur',version:1}};
 const path=R.path('aube');assert.equal(G.nodes(path,legacy),path,'legacy keeps its narrative');
});

test('texts are short, keyed and translatable; errors map to a clear message',()=>{
 for(const [key,text] of Object.entries(G.strings.fr)){assert.ok(text.length<=180,`${key} stays short`);assert.doesNotMatch(text,/\{(?!\w+\})/,key);}
 for(const route of ['corniche','ruines'])for(const part of ['clue','right','watching','action','outcome.name','outcome.text','decisive','decision'])assert.ok(G.strings.fr[`route.${route}.${part}`],`${route}.${part}`);
 for(const [route,{sign}] of Object.entries(ROUTE))for(const other of ['fissure','gravure','mousse'].filter(s=>s!==sign))assert.ok(G.strings.fr[`route.${route}.wrong.${other}`],`${route} wrong ${other}`);
 assert.equal(G.t('phase.observe',{},'en'),'Observer','missing locale falls back to French');
 assert.doesNotMatch(Object.values(G.strings.fr).join(' '),/\+\s*\d+\s*XP|crédits gagnés/);
 assert.match(G.errorText('RPG_TIMEOUT'),/Synchronisation impossible/);assert.match(G.errorText('TypeError: Failed to fetch'),/Synchronisation impossible/);
 assert.match(G.errorText('RPG_OFFLINE'),/Hors ligne/);assert.match(G.errorText('GUARDIAN_NOT_PREPARED'),/Associe/);assert.equal(G.errorText('SOMETHING'),'');
});
