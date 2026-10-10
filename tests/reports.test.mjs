import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
const context={window:{},Intl,Date};
vm.runInNewContext(readFileSync(new URL('../js/core/reports.js',import.meta.url),'utf8'),context);
const R=context.window.TitanReports;
const owner='00000000-0000-4000-8000-000000000123';
const shift=(date,amount,month=false)=>{const d=new Date(date+'T12:00:00Z');month?d.setUTCMonth(d.getUTCMonth()+amount):d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10);};
function fixture(period='month',offset=0,extras={}) {
  const from=period==='month'?(offset?'2024-02-01':'2024-03-01'):(offset?'2023-01-01':'2024-01-01');
  const to=period==='month'?(offset?'2024-03-01':'2024-04-01'):(offset?'2024-01-01':'2025-01-01');
  const size=period==='month'?(offset?29:15):(offset?12:3);
  return {version:1,owner,available:true,period,offset,timezone:'Europe/Paris',as_of:'2024-03-15T12:00:00Z',from,to,current:offset===0,
    sessions:2,active_days:1,minutes:50,estimated_sessions:1,
    sports:[{sport:'running',sessions:1,active_days:1,minutes:30,estimated_sessions:1},{sport:'yoga',sessions:1,active_days:1,minutes:20,estimated_sessions:0}],
    series:Array.from({length:size},(_,i)=>({from:shift(from,i,period==='year'),to:shift(from,i+1,period==='year'),sessions:i===0?2:0,active_days:i===0?1:0,minutes:i===0?50:0,estimated_sessions:i===0?1:0})),
    sources:[{id:'00000000-0000-4000-8000-000000000999',sport:'yoga',date:from+'T13:00:00Z',minutes:20,estimated:false},{id:'00000000-0000-4000-8000-000000000998',sport:'running',date:from+'T12:00:00Z',minutes:30,estimated:true}],...extras};
}
const options=j=>({p_period:j.period,p_offset:j.offset,p_timezone:j.timezone});
test('reports: four calendar choices, leap February, distinct multisport days',()=>{
  for(const p of ['month','year'])for(const o of [0,1]){const j=fixture(p,o);assert.equal(R.valid(j,options(j),owner),true);}
  assert.equal(fixture('month',1).series.length,29);
});
test('reports: local date at UTC boundary and actual DST day, no unobserved buckets',()=>{
  let j=fixture('month',1,{offset:0,current:true,timezone:'America/Los_Angeles',as_of:'2024-03-01T00:30:00Z'});
  assert.equal(R.valid(j,options(j),owner),true,'local February 29 although UTC March 1');
  j=fixture('month',0,{as_of:'2024-03-31T22:30:00Z',from:'2024-04-01',to:'2024-05-01',sessions:0,active_days:0,minutes:0,estimated_sessions:0,sports:[],sources:[],series:[{from:'2024-04-01',to:'2024-04-02',sessions:0,active_days:0,minutes:0,estimated_sessions:0}]});
  assert.equal(R.valid(j,options(j),owner),true,'Paris summer time has already entered April');
});
test('reports: reject wrong identities, options, invalid dates, impossible sums and sources',()=>{
  const edits=[j=>j.owner='another',j=>j.available=false,j=>j.version=2,j=>j.offset=2,j=>j.timezone='Fake/Zone',j=>j.as_of='bad',j=>j.from='2024-02-30',j=>j.to='2024-05-01',j=>j.current=false,
    j=>j.sessions=3,j=>j.minutes=Infinity,j=>j.active_days=3,j=>j.estimated_sessions=3,j=>j.sports[0].minutes=31,j=>j.sports[0].active_days=0,
    j=>j.sports.push({...j.sports[0]}),j=>j.series.pop(),j=>j.series[1].from=j.series[0].from,j=>j.series[0].active_days=2,j=>j.series[0].estimated_sessions=0,
    j=>j.sources[0].date='2024-04-02T12:00:00Z',j=>j.sources[0].sport='foreign',j=>j.sources[0].id='foreign',j=>j.sources[0].minutes=-1,j=>j.sources.push({...j.sources[0]}),j=>j.sources.reverse(),j=>j.sources.pop()];
  for(const edit of edits){const j=fixture();const opts=options(j);edit(j);assert.equal(R.valid(j,opts,owner),false,edit.toString());}
  const j=fixture();assert.equal(R.valid(j,{...options(j),p_offset:1},owner),false);
});
test('reports: rounding tolerance bounded; large sport list retains complete aggregates',()=>{
  const j=fixture();j.sports[0].minutes=30.1;assert.equal(R.valid(j,options(j),owner),true);j.sports[0].minutes=31;assert.equal(R.valid(j,options(j),owner),false);
  const many=fixture();many.sessions=200;many.minutes=200;many.estimated_sessions=0;
  many.sports=Array.from({length:200},(_,i)=>({sport:'sport_'+i,sessions:1,active_days:1,minutes:1,estimated_sessions:0}));
  Object.assign(many.series[0],{sessions:200,minutes:200,estimated_sessions:0});
  many.sources=Array.from({length:5},(_,i)=>({id:'00000000-0000-4000-8000-'+String(999-i).padStart(12,'0'),sport:'sport_'+i,date:'2024-03-01T12:00:00Z',minutes:1,estimated:false}));
  assert.equal(R.valid(many,options(many),owner),true);
  assert.equal(R.csv(many,id=>id).split('\r\n').filter(s=>s.startsWith('"Sport"')).length,200);
});
test('reports: CSV BOM, CRLF, escaped quotes, formula protection, no detailed sources',()=>{
  const j=fixture();const csv=R.csv(j,id=>id==='running'?'  =HYPERLINK("unsafe")':'Yoga; doux\nsoir');
  assert.ok(csv.startsWith('\uFEFF"Type";'));
  assert.match(csv,/"'  =HYPERLINK\(""unsafe""\)"/);
  assert.match(csv,/"Yoga; doux\nsoir"/);
  assert.match(csv,/"Europe\/Paris";"Provisoire";"2024-03-15T12:00:00Z"/);
  assert.ok(csv.endsWith('\r\n'));
  assert.doesNotMatch(csv,/00000000|PRIVATE|GPS|Séance source/);
  for(const text of ['+SUM(1)','-1+1','@SUM(A1)','\t=1'])assert.ok(R.csv(j,()=>text).includes('"\''+text+'"'));
});
test('reports: a truly empty period remains zero with a complete observed calendar',()=>{
  const j=fixture();Object.assign(j,{sessions:0,active_days:0,minutes:0,estimated_sessions:0,sports:[],sources:[]});
  j.series=j.series.map(s=>({...s,sessions:0,active_days:0,minutes:0,estimated_sessions:0}));
  assert.equal(R.valid(j,options(j),owner),true);
  assert.match(R.csv(j),/"Total";"Tous les sports".*;"0";"0";"0";"0"/);
});
