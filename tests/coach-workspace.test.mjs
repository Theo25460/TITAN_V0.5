import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const req=createRequire(import.meta.url);
let W={};try{W=req('../js/core/coach-workspace.js');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const link=(id,name,sport=null,extra={})=>({id,coach_id:'coach',athlete_id:'athlete-'+id,athlete_name:name,sport,since_date:'2026-10-01',revision:1,...extra});
const roster=(links,query='',sport='')=>W.roster?.({links,owner:'coach',query,sport})??[];
test('roster only includes owned active relations, accent-insensitive names and compatible sharing scopes',()=>{
 const links=[link('a','Émilie','running'),link('b','Amélie'),link('c','Malo','yoga'),link('d','Émilie','running',{coach_id:'other'}),link('e','Émilie','running',{revoked_at:'2026-10-01'})];
 assert.deepEqual(roster(links,'EMILIE').map(l=>l.id),['a']);
 assert.deepEqual(roster(links,'','running').map(l=>l.id),['b','a']);
 assert.deepEqual(roster(links,'zz').map(l=>l.id),[]);
});
test('roster ignores malformed or duplicate relationships and preserves source objects',()=>{
 const a=link('a','Athlète');const links=[null,a,a,link('b','Other',null,{athlete_id:null})];const copy=structuredClone(links);
 assert.deepEqual(roster(links).map(l=>l.id),['a']);assert.deepEqual(links,copy);
});
const calendar=(rows=[],extra={})=>W.calendar?.({assignments:{rows,total:rows.length},month:'2026-10',status:'',...extra})??{available:false};
const task=(id,date,status='accepted')=>({id,planned_date:date,status,title:'Séance '+id,sport:'running'});
test('calendar groups real dates within the selected UTC month and keeps declined distinct from due sessions',()=>{
 const r=calendar([task('a','2026-10-03'),task('b','2026-10-03','declined'),task('c','2026-11-01')]);
 assert.equal(r.available,true);assert.equal(r.complete,true);assert.deepEqual(r.days.map(d=>[d.date,d.rows.map(t=>t.id)]),[['2026-10-03',['a','b']]]);
 assert.deepEqual(calendar([task('a','2026-10-03'),task('b','2026-10-03','declined')],{status:'declined'}).days[0].rows.map(t=>t.id),['b']);
});
test('calendar reports partial pages, rejects invalid month/status and never presents invalid dates as a real day',()=>{
 const r=calendar([],{assignments:{rows:[],total:200}});assert.equal(r.complete,false);assert.equal(r.loaded,0);assert.equal(r.total,200);
 assert.equal(calendar([],{month:'2026-13'}).available,false);assert.equal(calendar([],{status:'invented'}).available,false);
 assert.equal(calendar([task('bad','2026-02-30')]).complete,false);
 assert.equal(W.shiftMonth?.('2026-12',1),'2027-01');assert.equal(W.shiftMonth?.('2026-01',-1),'2025-12');
});
const row=(id,details={duration:30},extra={})=>({id,date:'2026-10-15T12:00:00Z',sport:'running',val:5,unit:'km',details,...extra});
const envelope=rows=>({owner:'coach',link_id:'a',revision:1,from_date:'2026-10-01',to_date:'2026-10-30',rows,total:rows.length});
const csv=(rows,extra={})=>W.csv?.({sessions:envelope(rows),owner:'coach',linkId:'a',revision:1,from:'2026-10-01',to:'2026-10-30',now:'2026-10-30T12:00:00Z',...extra})??{available:false};
test('CSV exports allowlisted shared data, explicit scope, missing versus zero time and no private details',()=>{
 const r=csv([row('a',{note:'PRIVATE',bio:{rpe:9},trace:[1,2]}),row('b',{duration:0})]);assert.equal(r.available,true);
 assert.ok(r.text.startsWith('\uFEFF'));assert.ok(r.text.includes('\r\n'));assert.ok(!r.text.includes('PRIVATE'));assert.ok(!r.text.includes('rpe'));
 assert.ok(r.text.includes('"2026-10-15T12:00:00.000Z";"running";"5";"km";""'));
 assert.ok(r.text.includes('"2026-10-15T12:00:00.000Z";"running";"5";"km";"0"'));
 assert.ok(r.text.includes('"2026-10-01";"2026-10-30";"journal partagé"'));
});
test('CSV refuses foreign or incomplete envelopes, inconsistent scope, duplicates and unsupported time/value types',()=>{
 for(const extra of [{owner:'other'},{linkId:'b'},{revision:2},{sessions:{...envelope([row('a')]),total:2}},{sessions:{...envelope([row('a')]),from_date:undefined}},{from:'2026-10-10'},{sessions:envelope([row('a'),row('a')])}])assert.equal(csv([row('a')],extra).available,false);
 assert.equal(csv([row('a',{}, {val:'=1+1'})]).available,false);
 assert.equal(csv([row('a',{duration:'30'})]).available,true); // absent invalid time is blank, never inferred
});
test('CSV neutralizes formulas including leading whitespace and quotes separators without losing cells',()=>{
 const r=csv([row('a',{}, {sport:' =HYPERLINK("x")',unit:'@evil;"\n'})]);assert.equal(r.available,true);
 assert.ok(r.text.includes('"\' =HYPERLINK(""x"")"'));assert.ok(r.text.includes('"\'@evil;""\n"'));
});
