import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
const source=readFileSync(new URL('../js/training-store.js',import.meta.url),'utf8');
const main=readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
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



test('queued cloud submission stays bound to its authenticated owner and requires server acknowledgement',async()=>{
 const calls=[];
 const context={window:{state:{user:{id:'alice'}},TITAN_SUPABASE_URL:'https://example.invalid',TITAN_SUPABASE_ANON_KEY:'public-key'},AbortSignal,fetch:async(url,options)=>{calls.push({url,options});context.window.state.user.id='bob';return {ok:true,json:async()=>[{log_id:'accepted'}]}}};
 vm.runInNewContext(main.slice(main.indexOf('async function submitTrainingSessionToCloud('),main.indexOf('window.flushPendingTrainingLogs =')),context);
 const session={user:{id:'alice'},access_token:'alice-token'};
 assert.equal((await context.submitTrainingSessionToCloud({sport:'running',val:5},session)).data.id,'accepted');
 assert.equal(calls[0].options.headers.Authorization,'Bearer alice-token');
 assert.equal((await context.submitTrainingSessionToCloud({},session)).error.message,'NO_CLOUD_SESSION');
 assert.equal(calls.length,1);
 context.window.state.user.id='alice';context.fetch=async()=>({ok:true,json:async()=>[]});
 assert.equal((await context.submitTrainingSessionToCloud({},session)).error.message,'SERVER_AUTHORITY_REQUIRED');
});

function syncEnvironment() {
 const events=[], storage=new Map();
 const window={state:{user:{id:'alice',xp:0},history:[]},titanAccountTransition:{epoch:1,active:false},
  titanClient:{auth:{getSession:async()=>({data:{session:{user:{id:window.state.user.id},access_token:window.state.user.id}}})}},
  TITAN_SUPABASE_URL:'https://example.invalid',TITAN_SUPABASE_ANON_KEY:'public-key',
  addEventListener(){},dispatchEvent:event=>events.push(event.type)};
 const context={window,CustomEvent,AbortSignal,navigator:{},document:{querySelectorAll:()=>[],addEventListener(){}},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}};
 vm.runInNewContext(main,context);
 const switchTo=id=>{window.state={user:{id,xp:0},history:[]};window.titanAccountTransition.epoch++;};
 return {window,context,events,switchTo};
}

test('Web progression cache and diagnostics are only read by the account that owns them',async()=>{
 const {window,switchTo}=syncEnvironment();
 window.titanClient.rpc=async()=>({data:[{server_user_id:'alice',xp:80,level:3,credits:27}]});
 assert.equal((await window.titanRefreshProgressionSnapshot()).xp,80);
 assert.equal(window.titanGetTrainingSyncDiagnostic().status,'snapshot_synced');
 switchTo('bob');
 assert.equal(window.titanGetProgressionSnapshot(),null);
 assert.equal(window.titanGetTrainingSyncDiagnostic(),null);
 assert.equal(window.titanBuildCloudReadiness().snapshot,null);
});

test('late Web progression responses cannot change the next account or an older sign-in',async()=>{
 for(const nextOwner of ['bob','alice']) {
  const {window,switchTo}=syncEnvironment();
  let resolveResponse, markRequested;
  const requested=new Promise(resolve=>{markRequested=resolve;});
  window.titanClient.rpc=()=>new Promise(resolve=>{resolveResponse=resolve;markRequested();});
  const refresh=window.titanRefreshProgressionSnapshot();
  await requested;
  switchTo('bob');
  if(nextOwner==='alice')switchTo('alice');
  resolveResponse({data:[{server_user_id:'alice',xp:80,level:3,credits:27}]});
  assert.equal(await refresh,null);
  assert.equal(window.state.user.xp,0);
  assert.equal(window.titanGetProgressionSnapshot(),null);
 }
});

test('Web training flushes stay separate across accounts and publish only current-account UI events',async()=>{
 const {window,context,events,switchTo}=syncEnvironment();
 const items=new Map(['alice','bob'].map(ownerId=>[ownerId,{key:ownerId,ownerId,payload:{details:{client_event_id:ownerId}}}]));
 window.TitanQueue={migrate:async()=>{},refresh:async()=>[...items.values()],
  list:()=>[...items.values()].filter(item=>item.ownerId===window.state.user.id),
  remove:async key=>{items.delete(key);},saveHistory:async()=>{}};
 const pending=new Map();
 context.fetch=async(_url,{headers})=>new Promise(resolve=>{pending.set(headers.Authorization,resolve);});
 const alice=window.flushPendingTrainingLogs();
 await new Promise(setImmediate);
 assert.ok(pending.has('Bearer alice'));
 switchTo('bob');
 window.titanClient.rpc=async()=>({data:[{server_user_id:'bob',xp:2,level:1,credits:0}]});
 const bob=window.flushPendingTrainingLogs();
 await new Promise(setImmediate);
 assert.ok(pending.has('Bearer bob'),'Bob can send without waiting for Alice');
 const reply=(owner,xp)=>pending.get('Bearer '+owner)({ok:true,json:async()=>[{log_id:owner,xp_after:xp}]});
 reply('alice',50);
 assert.equal((await alice).sent,0,'a stale receipt leaves the durable operation for owner-scoped reconciliation');
 assert.ok(items.has('alice'));
 assert.equal(window.state.user.xp,0);
 assert.deepEqual(events,[]);
 reply('bob',2);
 assert.equal((await bob).sent,1);
 await new Promise(setImmediate);
 assert.equal(window.state.user.xp,2);
 assert.deepEqual(events,['titan:history-updated']);
});

test('a replayed session receipt keeps its own reward and cannot restore older profile balances',async()=>{
 const {window,context}=syncEnvironment();
 window.state.user.xp=60;
 window.state.history=[{id:'event',client_event_id:'event',details:{}}];
 const item={key:'event',ownerId:'alice',payload:{details:{client_event_id:'event'}}};
 window.TitanQueue={migrate:async()=>{},refresh:async()=>[item],list:()=>[],remove:async()=>{},saveHistory:async()=>{}};
 window.titanClient.rpc=async()=>({data:[{server_user_id:'alice',xp:65,credits:31,level:2}]});
 context.fetch=async()=>({ok:true,json:async()=>[{log_id:'confirmed',xp:10,xp_after:15,credits_after:4,level_after:1}]});
 assert.equal((await window.flushPendingTrainingLogs()).sent,1);
 await new Promise(setImmediate);
 assert.equal(window.state.history[0].xp,10);
 assert.equal(window.state.user.xp,65);
 assert.equal(window.state.user.credits,31);
 assert.equal(window.state.user.level,2);
});

test('a stalled profile refresh does not keep the next confirmed Web session in the queue',async()=>{
 const {window,context}=syncEnvironment();
 const event=id=>({key:id,ownerId:'alice',payload:{details:{client_event_id:id}}});
 const items=new Map([['one',event('one')]]);
 window.TitanQueue={migrate:async()=>{},refresh:async()=>[...items.values()],list:()=>[...items.values()],
  remove:async key=>{items.delete(key);},saveHistory:async()=>{}};
 let enteredSnapshot;
 const finishSnapshots=[];
 const entered=new Promise(resolve=>{enteredSnapshot=resolve;});
 window.titanClient.rpc=()=>new Promise(resolve=>{finishSnapshots.push(resolve);enteredSnapshot();});
 const requests=[];
 context.fetch=async(_url,{body})=>{
  const id=JSON.parse(body).p_details.client_event_id;
  requests.push(id);
  return {ok:true,json:async()=>[{log_id:id}]};
 };
 const first=window.flushPendingTrainingLogs();
 await entered;
 items.set('two',event('two'));
 const second=window.flushPendingTrainingLogs({newEntry:true});
 await new Promise(setImmediate);
 assert.deepEqual(requests,['one','two']);
 for(const finish of finishSnapshots)finish({data:[{server_user_id:'alice',xp:20}]});
 assert.equal((await first).sent,1);
 assert.equal((await second).sent,1);
});

test('a newly queued Web session is picked up when a successful flush already read the queue',async()=>{
 const {window,context}=syncEnvironment();
 const event=id=>({key:id,ownerId:'alice',payload:{details:{client_event_id:id}}});
 const items=new Map([['one',event('one')]]);
 window.TitanQueue={migrate:async()=>{},refresh:async()=>[...items.values()],list:()=>[...items.values()],
  remove:async key=>{items.delete(key);},saveHistory:async()=>{}};
 let resolveFirst;
 const requests=[];
 context.fetch=async(_url,{body})=>{
  const id=JSON.parse(body).p_details.client_event_id;
  requests.push(id);
  if(id==='one')await new Promise(resolve=>{resolveFirst=resolve;});
  return {ok:true,json:async()=>[{log_id:id,xp_after:10}]};
 };
 const first=window.flushPendingTrainingLogs();
 await new Promise(setImmediate);
 assert.deepEqual(requests,['one']);
 items.set('two',event('two'));
 const second=window.flushPendingTrainingLogs({newEntry:true});
 resolveFirst();
 assert.equal((await first).sent,2);
 assert.equal((await second).remaining,0);
 assert.deepEqual(requests,['one','two']);
});

test('an explicit retry arriving during a Web flush includes previously refused items',async()=>{
 const {window,context}=syncEnvironment();
 const event=(id,status)=>({key:id,ownerId:'alice',status,payload:{details:{client_event_id:id}}});
 const items=new Map([['first',event('first','pending')],['retry',event('retry','error')]]);
 window.TitanQueue={migrate:async()=>{},refresh:async()=>[...items.values()],list:()=>[...items.values()],
  remove:async key=>{items.delete(key);},saveHistory:async()=>{}};
 let resolveFirst;
 const requests=[];
 context.fetch=async(_url,{body})=>{
  const id=JSON.parse(body).p_details.client_event_id;
  requests.push(id);
  if(id==='first')await new Promise(resolve=>{resolveFirst=resolve;});
  return {ok:true,json:async()=>[{log_id:id,xp_after:10}]};
 };
 const first=window.flushPendingTrainingLogs();
 await new Promise(setImmediate);
 const retried=window.flushPendingTrainingLogs({retry:true});
 resolveFirst();
 await first;
 assert.equal((await retried).remaining,0);
 assert.deepEqual(requests,['first','retry']);
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
test('deleting an owner erases its queue, history, draft and timer only',async()=>{
 const db=new IDBFactory(),e=environment(db);
 for(const owner of ['alice','bob']){
  await e.TitanQueue.put({key:owner+':event',ownerId:owner,status:'pending',payload:{details:{client_event_id:owner}}});
  await e.TitanQueue.saveHistory(owner,[{id:owner}]);
  for(const key of ['titan_training_draft_'+owner,'titan_seance_draft_v3:'+owner,'titan_seance_timer_v3:'+owner,'titan_onboarding_draft_v1:'+owner]) e.storage.set(key,'{"note":"private"}');
 }
 await e.TitanQueue.deleteOwner('alice');
 const reopened=environment(db);await reopened.TitanQueue.refresh();
 assert.equal((await reopened.TitanQueue.readHistory('alice')).length,0);assert.equal((await reopened.TitanQueue.readHistory('bob')).length,1);
 e.window.state.user.id='alice';assert.equal(e.TitanQueue.list().length,0);e.window.state.user.id='bob';assert.equal(e.TitanQueue.list().length,1);
 assert.deepEqual([...e.storage.keys()].sort(),['titan_onboarding_draft_v1:bob','titan_seance_draft_v3:bob','titan_seance_timer_v3:bob','titan_training_draft_bob']);
});

test('another Web tab or a late migration cannot recreate a deleted owner’s sessions',async()=>{
 const db=new IDBFactory(), active=environment(db), deleting=environment(db);
 const item=(ownerId,id)=>({key:`${ownerId}:${id}`,ownerId,payload:{details:{client_event_id:id}}});
 active.window.state.user.id='alice';
 deleting.window.state.user.id='bob';
 await active.TitanQueue.put(item('alice','before'));
 await deleting.TitanQueue.deleteOwner('alice');
 await assert.rejects(active.TitanQueue.put(item('alice','late')), {code:'TRAINING_OWNER_ERASED'});
 await assert.rejects(active.TitanQueue.saveHistory('alice',[{id:'private'}]), {code:'TRAINING_OWNER_ERASED'});
 active.storage.set('titan_pending_training_logs_v1',JSON.stringify([item('alice','old-a'),item('bob','old-b')]));
 await active.TitanQueue.migrate();
 assert.equal(active.TitanQueue.list().length,0);
 assert.equal((await active.TitanQueue.readHistory('alice')).length,0);
 assert.equal((await deleting.TitanQueue.refresh()).length,1);
});
test('owner drafts are erased even when durable storage fails or is missing',async()=>{
 const drafts=e=>{for(const owner of ['alice','bob'])for(const prefix of ['titan_seance_draft_v3:','titan_onboarding_draft_v1:'])e.storage.set(prefix+owner,'{"note":"private"}');return e;};
 const failing=drafts(environment({open(){throw new Error('storage denied')}}));
 await assert.rejects(failing.TitanQueue.deleteOwner('alice'),/storage denied/);
 assert.deepEqual([...failing.storage.keys()],['titan_seance_draft_v3:bob','titan_onboarding_draft_v1:bob']);
 const missing=drafts(environment(null));
 assert.equal(missing.TitanQueue,undefined);missing.titanForgetOwnerDrafts('alice');
 assert.deepEqual([...missing.storage.keys()],['titan_seance_draft_v3:bob','titan_onboarding_draft_v1:bob']);
});
test('blocked localStorage cannot stop the queue and history purge',async()=>{
 const db=new IDBFactory(),e=environment(db);
 await e.TitanQueue.put({key:'alice:event',ownerId:'alice',status:'pending',payload:{details:{client_event_id:'a'}}});
 await e.TitanQueue.saveHistory('alice',[{id:'a'}]);
 const blocked=environment(db);blocked.storage.set('titan_seance_draft_v3:alice','x');
 blocked.storage.delete=()=>{throw new Error('storage blocked')};
 await blocked.TitanQueue.deleteOwner('alice');
 const reopened=environment(db);reopened.window.state.user.id='alice';
 assert.equal((await reopened.TitanQueue.refresh()).length,0,'the pending queue is purged');
 assert.equal((await reopened.TitanQueue.readHistory('alice')).length,0,'the history is purged');
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
test('the legacy pending-session blob loses the deleted owner entries only, and an unreadable blob is left alone',async()=>{
 const LEGACY='titan_pending_training_logs_v1';
 const e=environment(new IDBFactory());
 e.storage.set(LEGACY,JSON.stringify([{ownerId:'alice',key:'a1',payload:{val:1}},{ownerId:'bob',key:'b1',payload:{val:2}},{key:'orphan',payload:{val:3}},null]));
 e.titanForgetOwnerDrafts('alice');
 const kept=JSON.parse(e.storage.get(LEGACY));
 assert.deepEqual(kept.map(i=>i.key),['b1','orphan'],'only the deleted owner entries (and empty junk) are removed');
 e.titanForgetOwnerDrafts('bob');e.titanForgetOwnerDrafts('unassigned');
 assert.equal(e.storage.has(LEGACY),false,'an emptied blob is removed');
 e.storage.set(LEGACY,'{not json');e.titanForgetOwnerDrafts('alice');
 assert.equal(e.storage.get(LEGACY),'{not json','an unreadable blob is not rewritten');
});
