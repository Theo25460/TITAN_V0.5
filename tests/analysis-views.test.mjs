import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
const context={window:{TitanSports:{all:()=>[{id:'running'},{id:'yoga'}]}},Date};
vm.runInNewContext(readFileSync(new URL('../js/core/analysis-views.js',import.meta.url),'utf8'),context);
const V=context.window.TitanAnalysisViews;
const owner='00000000-0000-4000-8000-000000000123';
const id='00000000-0000-4000-8000-000000000999';
const row=()=>({id,name:'Mon mois',kind:'report',options:{period:'month',offset:0},revision:1,created_at:'2026-10-09T20:00:00+00:00',updated_at:'2026-10-09T20:00:00+00:00'});
const list=()=>({version:1,owner,available:true,limit:10,count:1,views:[row()]});
test('views: strict relative options and known sports only',()=>{
  for(const weeks of [4,12,26])for(const sport of [null,'running'])assert.equal(V.validOptions('comparison',{weeks,sport}),true);
  for(const period of ['month','year'])for(const offset of [0,1])assert.equal(V.validOptions('report',{period,offset}),true);
  for(const value of [null,[],{}, {period:'month',offset:'0'},{period:'year',offset:0.5},{period:'month',offset:0,timezone:'UTC'},{period:'month',offset:2}])assert.equal(V.validOptions('report',value),false);
  for(const value of [{weeks:4,sport:'unknown'},{weeks:4,sport:undefined},{weeks:4},{weeks:'4',sport:null},{weeks:4,sport:null,note:'PRIVATE'}])assert.equal(V.validOptions('comparison',value),false);
});
test('views: names normalized consistently, Unicode length and controls bounded',()=>{
  assert.equal(V.name('  Mon mois  '),'Mon mois'); assert.equal(V.name('é'.repeat(40)),'é'.repeat(40));
  assert.equal(V.name('😀'.repeat(40)),'😀'.repeat(40));
  for(const value of ['', '   ', 'é'.repeat(41),'😀'.repeat(41),'name\n','\tname','name\u007f',null])assert.equal(V.name(value),null);
  assert.equal(V.name('<img src=x onerror=alert(1)>'),'<img src=x onerror=alert(1)>','text is retained, UI must escape');
});
test('views: bounded row identity, version, timestamps and exact fields',()=>{
  assert.equal(V.validView(row()),true);
  for(const edit of [x=>x.id='foreign',x=>x.revision=0,x=>x.revision=1.5,x=>x.created_at='bad',x=>x.updated_at='2025-01-01T00:00:00Z',x=>x.name=' name ',x=>x.name='',x=>x.results={},x=>x.options.offset=2]){
    const x=row();edit(x);assert.equal(V.validView(x),false,edit.toString());
  }
});
test('views: list owner, counts, duplicates, ordering and Free retention',()=>{
  assert.equal(V.validList(list(),owner),true);
  const free={...list(),available:false,reason:'premium_required'}; assert.equal(V.validList(free,owner),true);
  for(const edit of [x=>x.owner='foreign',x=>x.version=2,x=>x.count=11,x=>x.limit=20,x=>x.count=0,x=>x.views.push({...x.views[0]}),x=>x.available='true',x=>x.results=[]]){
    const x=list();edit(x);assert.equal(V.validList(x,owner),false,edit.toString());
  }
  assert.equal(V.validList({...free,reason:'unknown'},owner),false);
  const x=list();x.count=2;x.views.push({...row(),id:'00000000-0000-4000-8000-000000000998',updated_at:'2026-10-09T21:00:00Z'});
  assert.equal(V.validList(x,owner),false,'newest first');x.views.reverse();assert.equal(V.validList(x,owner),true);
  assert.equal(V.validList({...list(),views:[]},owner,id),true,'filtered id may have been deleted elsewhere');
  assert.equal(V.validList({...list(),views:[row()]},owner,'00000000-0000-4000-8000-000000000888'),false);
});
test('views: receipts must match the requested payload, identity and revision',()=>{
  const request={p_action:'save',p_id:id,p_expected_revision:0,p_name:'Mon mois',p_kind:'report',p_options:{period:'month',offset:0}};
  const j={version:1,owner,action:'save',view:row()};assert.equal(V.validReceipt(j,owner,request),true);
  for(const edit of [x=>x.owner='foreign',x=>x.view.name='Other',x=>x.view.revision=2,x=>x.view.options.offset=1,x=>x.view.id='00000000-0000-4000-8000-000000000888']){
    const x=structuredClone(j);edit(x);assert.equal(V.validReceipt(x,owner,request),false);
  }
  const del={p_action:'delete',p_id:id,p_expected_revision:1};
  assert.equal(V.validReceipt({version:1,owner,action:'delete',deleted_id:id},owner,del),true);
  assert.equal(V.validReceipt({version:1,owner,action:'delete',deleted_id:id,view:row()},owner,del),false);
});
test('views: summaries name the relative period and sport without storing results',()=>{
  assert.match(V.describe('report',{period:'year',offset:1}),/Année précédente/);
  assert.match(V.describe('comparison',{weeks:12,sport:'running'},()=> 'Course à pied'),/12 semaines.*Course à pied/);
});
test('views: PostgreSQL microseconds remain ordered inside the same browser millisecond',()=>{
  const x=list();x.count=2;x.views[0].updated_at='2026-10-09T20:00:00.000456+00:00';
  x.views.push({...row(),id:'00000000-0000-4000-8000-000000000998',updated_at:'2026-10-09T20:00:00.000123+00:00'});
  assert.equal(V.validList(x,owner),true,'SQL order must not become a false id tie');
  x.views.reverse();assert.equal(V.validList(x,owner),false);
});
