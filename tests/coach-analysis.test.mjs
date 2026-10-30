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
