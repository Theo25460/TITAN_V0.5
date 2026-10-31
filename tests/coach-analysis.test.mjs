import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {analyse}=createRequire(import.meta.url)('../js/core/coach-analysis.js');
const session=(id,sport='running',duration=30,date='2026-10-15T12:00:00Z',more={})=>({id,sport,date,unit:'km',val:5,details:duration===null?{}:{duration},...more});
const task=(id,status='accepted',planned_date='2026-10-14',sport='running')=>({id,status,planned_date,sport});
const run=(rows=[],tasks=[],extra={})=>analyse({from:'2026-10-01',to:'2026-10-30',now:'2026-10-30T10:00:00Z',sessions:{rows,total:rows.length},assignments:{rows:tasks,total:tasks.length},...extra});

test('coach analysis sums only declared time and counts missing durations without mixing units',()=>{
 const r=run([session('a'),session('b','muscu_gym',null),session('c','yoga',null,undefined,{unit:'min',val:20})]);
 assert.equal(r.sessions,3);assert.equal(r.minutes,50);assert.equal(r.measuredSessions,2);assert.equal(r.missingDuration,1);assert.equal(r.activeDays,1);
 assert.equal(r.sports.find(s=>s.sport==='muscu_gym').minutes,null);
});
test('zero duration is measured, but absent or invalid duration is not zero',()=>{
 const r=run([session('a','running',0),session('b','running',-5),session('c','running',null)]);
 assert.equal(r.minutes,0);assert.equal(r.measuredSessions,1);assert.equal(r.missingDuration,2);
 assert.equal(run([session('a','running',null)]).minutes,null);
});
test('direct hour values may become minutes while distances and repetitions never do',()=>{
 assert.equal(run([session('a','yoga',null,undefined,{unit:'h',val:1.5})]).minutes,90);
 assert.equal(run([session('a','muscu_gym',null,undefined,{unit:'reps',val:300})]).minutes,null);
});
test('effective server period respects consent, UTC boundaries and the requested upper limit',()=>{
 const rows=[session('old','running',30,'2026-10-01T12:00:00Z'),session('a','running',20,'2026-10-15T23:30:00-02:00'),session('b','running',40,'2026-10-17T01:00:00Z')];
 const r=run(rows,[],{from:'2026-10-01',to:'2026-10-16',sessions:{rows,total:3,from_date:'2026-10-16',to_date:'2026-10-16'}});
 assert.equal(r.from,'2026-10-16');assert.equal(r.to,'2026-10-16');assert.equal(r.sessions,1);assert.equal(r.minutes,20);
});
test('duplicate, invalid and future session rows cannot inflate the summary',()=>{
 const a=session('a');const r=run([a,a,session('bad','running',20,'bad-date'),session('future','running',20,'2026-10-30T22:00:00Z')]);
 assert.equal(r.sessions,1);assert.equal(r.minutes,30);assert.equal(r.sessionComplete,false);
});
test('programme adherence only counts past due accepted and completed proposals',()=>{
 const r=run([],['accepted','completed','declined','cancelled','proposed'].map((s,i)=>task(String(i),s)).concat([task('today','accepted','2026-10-30'),task('future','accepted','2026-10-31')]));
 assert.equal(r.due,2);assert.equal(r.completed,1);assert.equal(r.adherencePercent,50);
});
test('incomplete proposal pagination never implies an adherence percentage',()=>{
 const r=run([session('a')],[task('t','completed')],{sessions:{rows:[session('a')],total:120},assignments:{rows:[task('t','completed')],total:200}});
 assert.equal(r.sessionComplete,false);assert.equal(r.assignmentComplete,false);assert.equal(r.adherencePercent,null);
 assert.equal(r.due,1);assert.equal(r.completed,1);
});
test('empty periods and no due proposals have no invented adherence or duration',()=>{
 const r=run();assert.equal(r.minutes,null);assert.equal(r.adherencePercent,null);assert.equal(r.sessions,0);assert.equal(r.sessionComplete,true);
});
test('invalid calendar ranges and malformed envelopes yield an unavailable summary',()=>{
 assert.equal(run([],[],{from:'2026-02-30'}).available,false);
 assert.equal(run([],[],{from:'2026-11-01',to:'2026-10-01'}).available,false);
 assert.equal(run([],[],{sessions:null}).available,false);
});

// These catch false trends from partial data, UTC boundaries and invented durations.
const compareInput=(rows=[],tasks=[],extra={})=>({from:'2026-10-01',to:'2026-10-30',now:'2026-10-30T10:00:00Z',sessions:{rows,total:rows.length,from_date:'2026-10-01',to_date:'2026-10-30'},assignments:{rows:tasks,total:tasks.length},...extra});
const comparison=input=>createRequire(import.meta.url)('../js/core/coach-analysis.js').compare?.(input) ?? {available:false,reason:'not-implemented'};
test('Coach comparison uses adjacent complete UTC weeks and derives per-sport changes',()=>{
 const rows=[session('old','running',20,'2026-10-16T00:00:00Z'),session('prev','running',30,'2026-10-22T23:59:59Z'),session('cur','running',60,'2026-10-23T00:00:00Z'),session('yoga','yoga',10,'2026-10-29T23:59:59Z'),session('today','running',99,'2026-10-30T09:00:00Z')];
 const r=comparison(compareInput(rows,[task('p','accepted','2026-10-16'),task('c','completed','2026-10-23')]));
 assert.equal(r.available,true);
 assert.equal(r.previous.from,'2026-10-16');assert.equal(r.previous.to,'2026-10-22');
 assert.equal(r.current.from,'2026-10-23');assert.equal(r.current.to,'2026-10-29');
 assert.equal(r.previous.sessions,2);assert.equal(r.current.sessions,2);
 assert.deepEqual(r.delta,{sessions:0,activeDays:0,minutes:20,adherencePoints:100});
 assert.equal(r.sports.find(s=>s.sport==='running').delta.minutes,10);
 assert.equal(r.sports.find(s=>s.sport==='yoga').previous.sessions,0);
 assert.equal(r.sports.find(s=>s.sport==='yoga').delta.minutes,10);
});
test('Coach comparison refuses incomplete or malformed envelopes instead of treating missing pages as zero',()=>{
 const a=session('a');
 for(const extra of [{sessions:{rows:[a],total:2}},{assignments:{rows:[],total:1}},{sessions:{rows:[a,a],total:2}},{sessions:{rows:[session('bad','running',20,'bad')],total:1}},{assignments:{rows:[task('bad','unsupported')],total:1}}]){
  const input=compareInput([],[],extra);input.sessions={from_date:'2026-10-01',to_date:'2026-10-30',...input.sessions};
  const r=comparison(input);assert.equal(r.available,false);assert.equal(r.reason,'incomplete');
 }
});
test('Coach comparison needs fourteen consented complete days and explicit server bounds',()=>{
 for(const extra of [{sessions:{rows:[],total:0,from_date:'2026-10-17',to_date:'2026-10-30'}},{from:'2026-10-17'}, {sessions:{rows:[],total:0}}]){
  const r=comparison(compareInput([],[],extra));assert.equal(r.available,false);
 }
 const r=comparison(compareInput([],[],{to:'2026-10-28'}));assert.equal(r.available,true);assert.equal(r.current.to,'2026-10-28');assert.equal(r.previous.from,'2026-10-15');
});
test('Coach comparison distinguishes missing time, empty weeks and zero while suppressing invented rates',()=>{
 const r=comparison(compareInput([session('a','running',null,'2026-10-28T12:00:00Z')]));
 assert.equal(r.available,true);assert.equal(r.previous.minutes,null);assert.equal(r.delta.minutes,null);assert.equal(r.delta.adherencePoints,null);assert.equal(r.delta.sessions,1);
 assert.equal(r.sports[0].delta.minutes,null);
 const zero=comparison(compareInput([session('zero','running',0,'2026-10-28T12:00:00Z')]));
 assert.equal(zero.current.minutes,0);assert.equal(zero.delta.minutes,0);
 const empty=comparison(compareInput());assert.equal(empty.delta.sessions,0);assert.equal(empty.delta.minutes,0);
});
test('Coach comparison crosses the year boundary, ignores partial today and uses offset timestamps in UTC',()=>{
 const rows=[session('p','running',10,'2025-12-25T00:30:00+02:00'),session('c','running',30,'2025-12-31T23:30:00-02:00')];
 const r=comparison(compareInput(rows,[],{from:'2025-12-01',to:'2026-01-07',now:'2026-01-07T00:01:00Z',sessions:{rows,total:2,from_date:'2025-12-01',to_date:'2026-01-07'}}));
 assert.equal(r.available,true);assert.equal(r.previous.from,'2025-12-24');assert.equal(r.current.from,'2025-12-31');assert.equal(r.current.to,'2026-01-06');assert.equal(r.delta.minutes,20);
});
test('Coach comparison preserves disappearing sports and does not change the input envelope',()=>{
 const input=compareInput([session('p','running',30,'2026-10-20T12:00:00Z')]);const before=structuredClone(input);
 const r=comparison(input);assert.equal(r.available,true);assert.equal(r.sports[0].current.sessions,0);assert.equal(r.sports[0].delta.minutes,-30);assert.deepEqual(input,before);
});
test('Coach comparison rejects inconsistent zero totals before parsing malformed rows',()=>{
 const scope={from_date:'2026-10-01',to_date:'2026-10-30'};
 for(const extra of [
  {sessions:{...scope,rows:[{id:'bad',date:'bad-date'}],total:0}},
  {sessions:{...scope,rows:[session('outside','running',20,'2026-09-20T12:00:00Z')],total:0}},
  {assignments:{rows:[task('bad','unsupported')],total:0}},
 ]){
  const r=comparison(compareInput([],[],extra));assert.equal(r.available,false);assert.equal(r.reason,'incomplete');
 }
});
