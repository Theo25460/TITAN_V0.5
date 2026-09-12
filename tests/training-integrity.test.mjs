import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
const source=readFileSync(new URL('../js/training-store.js',import.meta.url),'utf8');
const journalSource=readFileSync(new URL('../js/journal-page.js',import.meta.url),'utf8');
function environment(factory=new IDBFactory(),storage=new Map()){
 const window={state:{user:{id:'guest_test'}},indexedDB:factory,dispatchEvent(){}};
 const context={window,indexedDB:factory,CustomEvent,crypto,structuredClone,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{clear(){}}};
 vm.runInNewContext(source,context);return {window,storage,...window};
}
test('duration distinguishes missing values and honors measured minutes/hours',()=>{
 const {TitanTraining:t}=environment();
 assert.equal(t.duration({val:5,unit:'km'}),null);
 assert.equal(t.duration({val:1.5,unit:'h'}),90);
 assert.equal(t.duration({val:5,unit:'km',details:{duration:'',val2:32}}),32);
 assert.equal(t.load({val:5,unit:'km',details:{bio:{rpe:6}}}),null);
 assert.equal(t.load({val:30,unit:'min',details:{bio:{rpe:6}}}),180);
});

test('journal uses corrected distance and duration instead of cached GPX display data',()=>{
 const context={window:environment().window,formatNumber:(v,d)=>Number(v.toFixed(d)).toString()};
 vm.runInNewContext(journalSource.slice(journalSource.indexOf('function activityMetrics('),journalSource.indexOf('function activityReward(')),context);
 const metrics=context.activityMetrics({val:6,unit:'km',details:{val1:5,duration:40,val2:30,gpxStats:{movingMinutes:30,pace:'6:00'}}});
 assert.equal(metrics.find(m=>m.label==='Distance').value,'6 km');
 assert.equal(metrics.find(m=>m.label==='Durée').value,'40 min');
 assert.equal(metrics.find(m=>m.label==='Vitesse').value,'9 km/h');
 assert.ok(!metrics.some(m=>m.label==='Allure'));
});

test('climbing minutes never become kilometers and absent RPE stays unknown',()=>{
 const context={window:environment().window,formatNumber:(v)=>String(v)};
 vm.runInNewContext(journalSource.slice(journalSource.indexOf('function activityMetrics('),journalSource.indexOf('function activityReward(')),context);
 const metrics=context.activityMetrics({sport:'climbing',val:45,unit:'min',details:{val1:45}});
 assert.equal(metrics.filter(m=>m.label==='Durée').length,1);
 assert.equal(metrics[0].value,'45 min');
 assert.ok(!metrics.some(m=>String(m.value).includes('km')));
 assert.equal(context.activityIntensity({}).key,'unknown');
});

test('queued cloud submission stays bound to its authenticated owner and requires server acknowledgement',async()=>{
 const main=readFileSync(new URL('../js/main.js',import.meta.url),'utf8'), calls=[];
 const context={window:{state:{user:{id:'alice'}},TITAN_SUPABASE_URL:'https://example.invalid',TITAN_SUPABASE_ANON_KEY:'public-key'},AbortSignal,fetch:async(url,options)=>{calls.push({url,options});context.window.state.user.id='bob';return {ok:true,json:async()=>[{log_id:'accepted'}]}}};
 vm.runInNewContext(main.slice(main.indexOf('async function submitTrainingSessionToCloud('),main.indexOf('let trainingFlush;')),context);
 const session={user:{id:'alice'},access_token:'alice-token'};
 assert.equal((await context.submitTrainingSessionToCloud({sport:'running',val:5},session)).data.id,'accepted');
 assert.equal(calls[0].options.headers.Authorization,'Bearer alice-token');
 assert.equal((await context.submitTrainingSessionToCloud({},session)).error.message,'NO_CLOUD_SESSION');
 assert.equal(calls.length,1);
 context.window.state.user.id='alice';context.fetch=async()=>({ok:true,json:async()=>[]});
 assert.equal((await context.submitTrainingSessionToCloud({},session)).error.message,'SERVER_AUTHORITY_REQUIRED');
});
test('summaries exclude archived/future sessions and report actual measurement coverage',()=>{
 const {TitanTraining:t}=environment(),now=new Date('2026-09-11T18:00:00Z');
 const logs=[{sport:'running',date:'2026-09-11T12:00:00Z',val:5,unit:'km'},
 {sport:'yoga',date:'2026-09-10T12:00:00Z',val:30,unit:'min'},
 {sport:'running',date:'2026-09-10T12:00:00Z',val:100,unit:'km',archived_at:'2026-09-11'},
 {sport:'running',date:'2027-01-01',val:100,unit:'km'}];
 const s=t.summarize(logs,7,'all',now);
 assert.equal(s.sessions,2);assert.equal(s.minutes,30);assert.equal(s.measured,1);assert.equal(s.distanceMeasured,1);assert.equal(s.distance,5);
 assert.equal(t.summarize(logs,7,'yoga',now).sessions,1);
});
test('year charts remain bounded without losing measurements',()=>{
 const {TitanTraining:t}=environment(),b=Array.from({length:365},(_,i)=>({date:String(i),minutes:i,sessions:1}));
 const bars=t.chartBuckets(b);
 assert.ok(bars.length<=31);assert.equal(bars.reduce((n,x)=>n+x.sessions,0),365);assert.equal(bars.reduce((n,x)=>n+x.minutes,0),365*364/2);
});
test('history pagination follows server totals even if response pages are capped',async()=>{
 const {TitanTraining:t}=environment(),rows=Array.from({length:7},(_,id)=>({id})),offsets=[];
 const query={select(){return this},eq(){return this},order(){return this},range(start){offsets.push(start);return Promise.resolve({data:rows.slice(start,start+2),count:7})}};
 const r=await t.paginate({from:()=>query},'owner',500);
 assert.equal(r.logs.length,7);assert.deepEqual(offsets,[0,2,4,6]);
});
test('incomplete or failed history is never presented as a complete snapshot',async()=>{
 const {TitanTraining:t}=environment();
 const query={select(){return this},eq(){return this},order(){return this},range(){return {data:[],count:10}}};
 await assert.rejects(t.paginate({from:()=>query},'owner'),/incomplet/);
 query.range=()=>({error:new Error('network')});await assert.rejects(t.paginate({from:()=>query},'owner'),/network/);
});
test('queue retains separate owners and immutable event payload across reloads',async()=>{
 const db=new IDBFactory(),e=environment(db);
 const item={key:'guest_test:event',ownerId:'guest_test',status:'pending',payload:{details:{client_event_id:'event'},val:5}};
 await e.TitanQueue.put(item);item.payload.val=900;
 await e.TitanQueue.put({key:'someone_else:event',ownerId:'someone_else',payload:{val:99}});
 const reopened=environment(db);await reopened.TitanQueue.refresh();
 assert.equal(reopened.TitanQueue.list().length,1);assert.equal(reopened.TitanQueue.list()[0].payload.val,5);
});
test('guest corrections and archives survive reload and cannot target another owner',async()=>{
 const db=new IDBFactory(),e=environment(db),log={id:'one',client_event_id:'one',val:5,syncStatus:'local'};
 await e.TitanQueue.put({key:'guest_test:one',ownerId:'guest_test',payload:{details:{client_event_id:'one'}}});
 await e.TitanQueue.saveGuestSession('guest_test',log);
 await e.TitanQueue.saveGuestSession('guest_test',{...log,val:6,archived_at:'2026-09-11'});
 const reopened=environment(db);await reopened.TitanQueue.refresh();const logs=await reopened.TitanQueue.readHistory('guest_test');
 assert.equal(logs.length,1);assert.equal(logs[0].val,6);assert.equal(logs[0].archived_at,'2026-09-11');assert.equal(reopened.TitanQueue.list().length,0);
 await assert.rejects(e.TitanQueue.saveGuestSession('guest_other',log),/autorisée/);
});
test('legacy migration is repeatable and preserves its event id',async()=>{
 const e=environment(),legacy=[{key:'old',ownerId:'guest_test',payload:{details:{client_event_id:'stable'},val:4}}];
 e.storage.set('titan_pending_training_logs_v1',JSON.stringify(legacy));await e.TitanQueue.migrate();
 e.storage.set('titan_pending_training_logs_v1',JSON.stringify(legacy));await e.TitanQueue.migrate();
 assert.equal(e.TitanQueue.list().length,1);assert.equal(e.TitanQueue.list()[0].payload.details.client_event_id,'stable');assert.equal(e.storage.has('titan_pending_training_logs_v1'),false);
});
test('failed durable storage rejects the save and keeps the legacy backup',async()=>{
 const e=environment({open(){throw new Error('storage denied')}});e.storage.set('titan_pending_training_logs_v1','[{"payload":{"details":{"client_event_id":"keep"}}}]');
 await assert.rejects(e.TitanQueue.migrate(),/storage denied/);assert.ok(e.storage.has('titan_pending_training_logs_v1'));
});
test('CSV neutralizes spreadsheet formulas and preserves quotes, accents and multiline notes',()=>{
 const e=environment(),module={exports:{}};
 vm.runInNewContext(readFileSync(new URL('../js/session-export.js',import.meta.url),'utf8'),{window:e.window,module,document:{getElementById(){return null}}});
 const {csv,escapeCell}=module.exports;
 assert.equal(escapeCell('=1+1'),'"\'=1+1"');assert.equal(escapeCell('  =1+1'),'"\'  =1+1"');
 const result=csv([{date:'2026-09-11',sport:'running',val:5,unit:'km',details:{note:'Ligne "une"\nDeuxième'}}]);
 assert.ok(result.startsWith('\ufeff'));assert.ok(result.includes('"Ligne ""une""\nDeuxième"'));assert.ok(result.includes('Sur cet appareil'));
});
