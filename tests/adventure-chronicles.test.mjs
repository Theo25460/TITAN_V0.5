// V1.5.5 — Chroniques et aventures rejouables. The replay rules are the same JSON on the website, on Android and on the server;
// the control passes on the real configuration and catches broken rules; the chronicle is checked against REAL server answers
// (tests/fixtures/adventure-chronicles.json, written by sql/tests/300_adventure_chronicles.sql with -v chronicle_fixture=…):
// two runs of the same arc give two distinct stories from the two routes, the outcome active in the world stays run 1's, an old
// campaign is read as it was played, an abandoned run stays readable, the active run shows only its next step, and nothing in
// a chronicle speaks of XP, credits or a reward to earn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ROOT=new URL('..',import.meta.url).pathname;
globalThis.TitanAdventureRpg=require('../js/core/adventure-rpg.js');
globalThis.TitanAdventureBranches=require('../js/core/adventure-branches.js');
globalThis.TitanAdventureGuardian=require('../js/core/adventure-guardian.js');
globalThis.TitanAdventureCampaigns=require('../js/core/adventure-campaigns.js');
globalThis.TitanAdventureConsequence=require('../js/core/adventure-consequence.js');
globalThis.TitanAdventureQuests=require('../js/core/adventure-quests.js');
const C=require('../js/core/adventure-chronicles.js');
const F=JSON.parse(readFileSync(ROOT+'tests/fixtures/adventure-chronicles.json','utf8'));
const SQL=readFileSync(ROOT+'supabase/migrations/20261128090000_adventure_chronicles_v1.sql','utf8');
const TEST=readFileSync(ROOT+'sql/tests/300_adventure_chronicles.sql','utf8');
const clone=o=>JSON.parse(JSON.stringify(o));
const titles=run=>run.entries.map(e=>e.title);

test('server rules and shared rules are the same JSON; Android ships byte copies; the page loads the modules',()=>{
 const blocks=[...SQL.matchAll(/\$cfg\$(.*?)\$cfg\$/gs)].map(m=>JSON.parse(m[1]));
 assert.equal(blocks.length,1);
 assert.deepEqual(blocks[0],C.rules(1));
 assert.equal(C.RULES.current,1);
 assert.match(SQL,/private\.titan_adventure_chronicle_current\(\)\s+returns integer language sql immutable security invoker set search_path = '' as \$\$ select 1; \$\$;/);
 assert.equal(readFileSync(ROOT+'mobile/src/core/web/adventure-chronicles.js','utf8'),readFileSync(ROOT+'js/core/adventure-chronicles.js','utf8'));
 assert.match(readFileSync(ROOT+'mobile/scripts/sync-web-core.mjs','utf8'),/"js\/core\/adventure-chronicles\.js"/);
 assert.equal(readFileSync(ROOT+'mobile/test-fixtures/adventure-chronicles.json','utf8'),readFileSync(ROOT+'tests/fixtures/adventure-chronicles.json','utf8'));
 const page=readFileSync(ROOT+'adventure.html','utf8');
 assert.match(page,/\/js\/core\/adventure-chronicles\.js\?v=\d/);assert.match(page,/\/js\/app\/aventure-chroniques\.js\?v=\d/);
 assert.ok(page.indexOf('/js/core/adventure-chronicles.js')>page.indexOf('/js/core/adventure-quests.js'),'loaded after the modules it reads');
});

test('run 1 is read, never copied; a run writes only its own tables; the fixture comes from the SQL test',()=>{
 assert.deepEqual([...SQL.matchAll(/create table if not exists ([a-z_.]+)/g)].map(m=>m[1]),['private.adventure_arc_runs','private.adventure_chronicle_events']);
 assert.doesNotMatch(SQL,/(insert into|update|delete from)\s+(public\.(profiles|training_logs|adventure_progress)|private\.(adventure_encounter_rewards|adventure_family_rewards|adventure_effort_ledger|adventure_guardian_encounters|adventure_consequences|adventure_quests|adventure_branch_entries))/,
  'no reward, profile, ledger or canonical fact is written by the chronicles');
 assert.doesNotMatch(SQL,/create trigger/,'no trigger: nothing waits for a run');
 assert.match(SQL,/create unique index if not exists adventure_arc_runs_one_active on private\.adventure_arc_runs\(user_id, world_id, arc\)\s+where resolved_at is null and abandoned_at is null/);
 assert.match(TEST,/\\o :chronicle_fixture/);
 assert.deepEqual(Object.keys(F).sort(),['abandoned','choose','empty','legacy','original','playing','prepare-wrong','resolve-ready','resolved','resolved-marees','scene-ready','scene-waiting']);
});

test('control passes on the real rules and texts, and catches broken rules (mutations)',()=>{
 assert.deepEqual(C.audit(),[]);
 const base=C.rules(1),audit=mut=>{const r=clone(base);mut(r);return C.audit({},r);};
 const cases=[
  [r=>{r.steps.reverse();},/steps must be/],
  [r=>{r.steps.splice(3,1);},/steps must be/],
  [r=>{r.steps[3].effortTargets=1;},/the mechanic asks no effort/],
  [r=>{r.steps[1].effortTargets=0;},/clue threshold out of bounds/],
  [r=>{r.steps[2].daysTarget=7;},/observe threshold out of bounds/],
  [r=>{r.steps[2].effortTargets=1;},/observe threshold goes back/],
  [r=>{r.steps[4].effortTargets=6;},/the effort of the original arc after its decision \(4 x target\)/],
  [r=>{r.steps[4].effortTargets=3;r.steps[2].effortTargets=3;},/4 x target/],
  [r=>{r.steps[0].hour=7;},/forbidden condition key hour/],
  [r=>{r.steps[0].sport='running';},/forbidden condition key sport/],
  [r=>{r.reward={xp:10};},/forbidden condition key reward/],
  [r=>{r.arcs.push('atlantide-arc1');},/atlantide-arc1: unknown arc/],
  [r=>{r.maxRuns=1;},/maxRuns out of bounds/],
 ];
 for(const [mut,re] of cases){const p=audit(mut);assert.ok(p.some(x=>re.test(x)),`${re} not detected: ${p.join(' | ')}`);}
 // Missing texts are caught too: a route without its outcome text would leave a hole in a chronicle.
 const G=globalThis.TitanAdventureGuardian,saved=G.strings.fr['route.ruines.outcome.text'];
 delete G.strings.fr['route.ruines.outcome.text'];
 try{assert.ok(C.audit().some(x=>/aube-arc1\/ruines: a text of the chronicle is missing/.test(x)));}finally{G.strings.fr['route.ruines.outcome.text']=saved;}
});

test('the scenario: two runs of the same arc are two distinct stories from the two routes, the world keeps run 1',()=>{
 const v=C.view(F.resolved,'aube');
 assert.equal(v.state,'ready');assert.equal(v.arcTitle,'Le passage condamné');
 assert.equal(v.runs.length,2);
 const [one,two]=v.runs;
 assert.equal(one.label,'première traversée');assert.equal(two.label,'nouvelle partie');
 assert.deepEqual([one.route,one.outcome,two.route,two.outcome],['ruines','serment_restitue','corniche','passage_rouvert']);
 // Why the ledge, the clue used, the passage unlocked: everything of the scenario is in the chronology.
 assert.ok(titles(one).includes('Décision : les ruines')&&titles(one).includes('Le fragment du serment')&&titles(one).includes('Issue : le serment restitué'),titles(one).join(' | '));
 assert.ok(titles(one).includes('Accès découvert : L’archive des passeurs')&&titles(one).includes('Indice suivi : Le symbole du cerf'),titles(one).join(' | '));
 assert.deepEqual(titles(two),['Nouvelle partie','Décision : la corniche','La corniche effondrée','La prise dans la roche','Observation : Le Veilleur de pierre','La mécanique résolue','Issue : le passage rouvert']);
 assert.match(two.entries.find(e=>e.kind==='clue').text,/où prendre appui/);
 assert.ok(!titles(two).some(x=>/ruines|serment/.test(x)),'the second story never borrows the first one');
 assert.ok(one.entries.every((e,i,a)=>!i||a[i-1].at<=e.at),'chronological');
 assert.match(v.active,/^Issue active dans le monde : le serment restitué \(partie 1\)\./);
 assert.deepEqual(v.discovered.map(d=>[d.route,d.scene,d.clue,d.outcome]),[['corniche',true,true,true],['ruines',true,true,true]]);
 assert.ok(v.start&&/^Rejouer « Le passage condamné »$/.test(v.start.label),'a finished arc can be replayed again');
 assert.equal(one.action,null);assert.equal(two.action,null);
 // The other world, other mechanic: the same reading on the Marées.
 const m=C.view(F['resolved-marees'],'marees');
 assert.deepEqual(m.runs.map(r=>r.entries.filter(e=>['decision','resolve'].includes(e.kind)).map(e=>e.title)),
  [['Décision : la carte des marées','Issue : le chenal ouvert'],['Décision : la Gardienne','Issue : le large franchi']]);
 assert.match(m.active,/le chenal ouvert \(partie 1\)/);
});

test('the active run shows only its next step; the route is chosen explicitly; the expected answer is never sent',()=>{
 const ch=C.view(F.choose,'aube',{} ,{},{});
 const a=ch.runs[1].action;
 assert.equal(a.kind,'choose');assert.equal(a.confirm,null);
 assert.deepEqual(a.routes.map(r=>[r.id,r.tag]),[['corniche','jamais parcourue'],['ruines','déjà parcourue']]);
 const sel=C.view(F.choose,'aube','fr',{},{route:'corniche'}).runs[1].action;
 assert.equal(sel.confirm.label,'Confirmer la corniche');assert.match(sel.confirm.body,/définitif pour cette partie/);
 const w=C.view(F['scene-waiting'],'aube').runs[1].action;
 assert.deepEqual([w.kind,w.step,w.ready,w.progress],['advance','scene',false,'0/15 points · 0/1 jours actifs depuis ton choix']);
 const r=C.view(F['scene-ready'],'aube').runs[1].action;
 assert.deepEqual([r.ready,r.progress],[true,'15/15 points · 1/1 jours actifs depuis ton choix']);
 const p=C.view(F['prepare-wrong'],'aube').runs[1].action;
 assert.equal(p.kind,'solve');assert.equal(p.primitive,'pick');
 assert.deepEqual(p.slots[0].tokens.map(x=>[x.name,x.last]),[['la fissure',false],['la gravure',true],['la mousse',false]]);
 assert.match(p.feedback.text,/case 1/);assert.equal(p.attempts,'1 essai(s) dans cette partie.');
 for(const k of Object.keys(F))assert.doesNotMatch(JSON.stringify(F[k]),/"answer"/,`${k}: no expected answer from the server`);
 const z=C.view(F['resolve-ready'],'aube').runs[1].action;
 assert.deepEqual([z.kind,z.ready,z.progress],['resolve',true,'60/60 points · 3/3 jours actifs depuis ton choix']);
 assert.ok(C.view(F['resolve-ready'],'aube').runs[1].abandon,'an active run can be abandoned');
 assert.equal(C.view(F['resolve-ready'],'aube').start,null,'one active run per arc: no second start');
});

test('old campaign, arc not achieved, abandoned run, no journey, unknown version',()=>{
 const l=C.view(F.legacy,'aube');
 assert.equal(l.runs[0].label,'campagne historique · journal v1');
 assert.deepEqual(titles(l.runs[0]).slice(0,3),['Départ','La clairière des lucioles','Choix : Écouter le passeur']);
 assert.match(l.active,/garde ses acquis tels quels/);assert.ok(l.start,'an old campaign can discover the versioned arc');
 const pl=C.view(F.playing,'aube');
 assert.equal(pl.start,null);assert.equal(pl.locked,'Termine d’abord le premier arc de ce monde pour le rejouer.');
 assert.equal(pl.runs[0].stateLabel,'en cours');
 const ab=C.view(F.abandoned,'aube');
 assert.deepEqual(ab.runs.map(r=>[r.heading,r.stateLabel,r.route]),[['Partie 1','terminée','corniche'],['Partie 2','abandonnée','ruines'],['Partie 3','en cours',null]]);
 assert.ok(titles(ab.runs[1]).includes('Partie abandonnée'));assert.equal(ab.runs[2].action.kind,'choose');
 assert.deepEqual(C.view(F.empty,'aube'),{state:'empty',title:'Chroniques',intro:C.t('intro'),empty:C.t('empty')});
 const u=clone(F['scene-waiting']);u.arcs[0].runs[1].version=9;
 const uv=C.view(u,'aube').runs[1];
 assert.ok(uv.unknown);assert.equal(uv.action,null);assert.match(uv.unknownText,/Mets-la à jour/);assert.equal(uv.stateLabel,'version inconnue');
});

test('every refusal of the server has a text; no chronicle text promises XP, credits or a reward',()=>{
 const codes=new Set([...SQL.matchAll(/raise exception '([A-Z_]+)'/g)].map(m=>m[1]));
 const panel=['AUTH_REQUIRED','ACCOUNT_UNAVAILABLE','INVALID_ACTION','INVALID_WORLD'];
 for(const code of codes)assert.ok(C.errorText(code)||panel.includes(code),`no text for ${code}`);
 assert.ok(C.errorText('RPG_OFFLINE'));
 const all=Object.values(C.strings.fr).join(' ');
 assert.doesNotMatch(all,/(gagne|gagner|remporte)[^.]*\b(XP|crédits?)/i);
 assert.match(C.t('rules'),/ni XP, ni crédits, ni balise, ni récompense/);
 assert.equal(C.conflict('ruines',F['scene-waiting'],'aube'),'Cette partie suivait déjà la corniche, choisie depuis un autre appareil. Elle reste sa voie.');
 assert.equal(C.conflict('corniche',F['scene-waiting'],'aube'),'');
});
