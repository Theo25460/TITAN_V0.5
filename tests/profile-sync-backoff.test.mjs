import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/state.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function store(){const m=new Map();return{get length(){return m.size;},key:i=>[...m.keys()][i],getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
function harness({storage=store(),send,status}={}){
 let now=100000,next=0,reads=0;const timers=new Map(),calls=[],events=new Map();
 const w={console:{warn(){},error(){}},Promise,Map,Set,Math,JSON,Date:class extends Date{static now(){return now;}},localStorage:storage,navigator:{onLine:true},document:{getElementById:()=>null},STATE_KEY:'state',CustomEvent:class{constructor(type){this.type=type;}},addEventListener:(name,fn)=>events.set(name,[...(events.get(name)||[]),fn]),dispatchEvent(){},setTimeout:(fn,ms)=>{timers.set(++next,{fn,at:now+ms});return next;},clearTimeout:id=>timers.delete(id),withTitanTimeout:p=>p,titanSetSyncStatus:(...a)=>status?.(w,...a),state:{user:{id:'a',name:'Local',weeklyGoalSessions:3,xp:7,credits:2},meta:{profileVersion:1},history:[]},TitanQueue:{list:()=>[],refresh:async()=>[],migrate:async()=>{},saveHistory:async()=>{}},TitanTraining:{paginate:async()=>({logs:[],total:0})}};
 w.window=w;w.titanClient={auth:{getSession:async()=>({data:{session:{user:{id:w.state.user.id},access_token:`token-${w.state.user.id}`}},error:null})},rpc(name,params){if(name!=='titan_save_profile_state')return Promise.resolve({error:{code:'PGRST202'}});const call={name,params,token:null};calls.push(call);const q={setHeader(k,v){call.token=v;return q;},then(resolve,reject){return Promise.resolve().then(()=>send?send(call,calls.length):{data:{id:params.p_state.user.id,state_version:params.p_state.meta.profileVersion+1,xp:7},error:null}).then(resolve,reject);}};return q;},from(){return{select(){return this;},eq(){return this;},setHeader(){return this;},maybeSingle:async()=>{reads++;return{data:{id:w.state.user.id,username:'Cloud',state_version:5,game_state:{user:{id:w.state.user.id,name:'Cloud',weeklyGoalSessions:4},history:[]}},error:null};}};}};
 vm.createContext(w);vm.runInContext(source,w);w.ensureStateIntegrity=()=>{};w.titanSyncAppearance=async()=>false;
 return{w,calls,storage,fire:name=>(events.get(name)||[]).forEach(fn=>fn()),reads:()=>reads,advance:async ms=>{now+=ms;for(const[id,t]of[...timers])if(t.at<=now){timers.delete(id);t.fn();}await tick();}};
}
test('real sender pins owner token, persists returned revision and skips identical saves',async()=>{const h=harness();await h.w.pushProfileStateToCloud();assert.equal(h.calls[0].token,'Bearer token-a');assert.equal(JSON.parse(h.storage.getItem('state')).meta.profileVersion,2);await h.w.pushProfileStateToCloud();await tick();assert.equal(h.calls.length,1);});
test('synchronous UI callbacks cannot perpetuate successful saves',async()=>{const h=harness({status:w=>w.pushProfileStateToCloud()});await h.w.pushProfileStateToCloud();await tick();assert.equal(h.calls.length,1);});
test('edits during request survive and receive one following save',async()=>{let release;const h=harness({send:(c,n)=>n===1?new Promise(r=>release=r):{data:{id:'a',state_version:3},error:null}});const first=h.w.pushProfileStateToCloud();await tick();h.w.state.user.name='During';h.w.saveState({forceCloud:true});release({data:{id:'a',state_version:2},error:null});await first;await h.advance(2000);assert.equal(h.calls.length,2);assert.equal(h.calls[1].params.p_username,'During');assert.equal(h.w.state.user.name,'During');});
test('conflicts remain blocked across multiple owners and page restarts',async()=>{const storage=store(),h=harness({storage,send:()=>({error:{code:'40001'}})});await h.w.pushProfileStateToCloud();await h.w.pushProfileStateToCloud();h.w.state.user.id='b';await h.w.pushProfileStateToCloud();h.w.state.user.id='a';await h.w.pushProfileStateToCloud();assert.equal(h.calls.length,2);const again=harness({storage});await again.w.pushProfileStateToCloud();assert.equal(again.calls.length,0);});
test('cloud reload preserves edits and explicit refreshes never blindly retry writes',async()=>{const h=harness({send:()=>({error:{code:'40001'}})});await h.w.pushProfileStateToCloud();const first=h.w.syncWithSupabase();await tick();await Promise.all([first,h.w.syncWithSupabase()]);assert.equal(h.reads(),2);assert.equal(h.w.state.user.name,'Cloud');assert(h.w.titanGetProfileRecovery().some(r=>r.preferences.user.name==='Local'));await h.w.pushProfileStateToCloud();assert.equal(h.calls.length,1);});
test('late A response cannot overwrite B or dispatch a queued call as the next owner',async()=>{let release;const h=harness({send:()=>new Promise(r=>release=r)});const first=h.w.pushProfileStateToCloud();await tick();h.w.state={user:{id:'b',name:'B',xp:90},meta:{profileVersion:20},history:[]};release({data:{id:'a',state_version:2,xp:1},error:null});await first;assert.equal(h.w.state.user.xp,90);assert.equal(h.w.state.meta.profileVersion,20);const second=h.w.pushProfileStateToCloud();h.w.state.user.id='c';await tick();assert.equal(h.calls.length,1);await second;});
test('thrown network errors obey automatic bounded backoff',async()=>{const h=harness({send:()=>{throw new TypeError('Failed to fetch');}});await Promise.all([h.w.pushProfileStateToCloud(),h.w.pushProfileStateToCloud()]);await h.w.pushProfileStateToCloud();assert.equal(h.calls.length,1);await h.advance(29999);assert.equal(h.calls.length,1);await h.advance(1);assert.equal(h.calls.length,2);});
test('authorization refusal does not retry automatically',async()=>{const h=harness({send:()=>({error:{code:'42501'}})});await h.w.pushProfileStateToCloud();await h.advance(600000);await h.w.pushProfileStateToCloud();assert.equal(h.calls.length,1);});
test('backup storage failure refuses writes rather than claiming protected data',async()=>{const storage=store();storage.setItem=()=>{throw new Error('quota');};const h=harness({storage});const error=await h.w.pushProfileStateToCloud();assert.equal(h.calls.length,0);assert.equal(error.code,'PROFILE_LOCAL_BACKUP_FAILED');});
test('manual recovery requires consent and cannot expose or restore another owner',async()=>{const h=harness({send:()=>({error:{code:'40001'}})});await h.w.pushProfileStateToCloud();await h.w.syncWithSupabase();const r=h.w.titanGetProfileRecovery()[0];h.w.confirm=()=>false;await h.w.titanRestoreProfileRecovery(r.key);assert.equal(h.calls.length,1);h.w.state.user.id='b';assert.equal(h.w.titanGetProfileRecovery().length,0);await h.w.titanRestoreProfileRecovery(r.key);assert.equal(h.calls.length,1);});

test('automatic retries stop after six failures, even after a long idle period',async()=>{const h=harness({send:()=>({error:{code:'FETCH_FAILED'}})});await h.w.pushProfileStateToCloud();for(let i=0;i<8;i++)await h.advance(600000);assert.equal(h.calls.length,6);await h.w.pushProfileStateToCloud();assert.equal(h.calls.length,6);});
test('a profile receipt never erases unsubmitted new preferences from the local cache',async()=>{let release;const h=harness({send:()=>new Promise(r=>release=r)});const first=h.w.pushProfileStateToCloud();await tick();h.w.state.user.weeklyGoalSessions=6;release({data:{id:'a',state_version:2},error:null});await first;const saved=JSON.parse(h.storage.getItem('state'));assert.equal(saved.user.weeklyGoalSessions,6);assert.equal(saved.meta.profileVersion,2);});

test('three-way preference recovery preserves independent changes from another device',()=>{const h=harness(),base={user:{name:'Old',weeklyGoalSessions:3,schedule:{monday:{sport:'run'},tuesday:{sport:'walk'}}},privacy:{showStats:false}},local={user:{name:'Local',weeklyGoalSessions:3,schedule:{monday:{sport:'swim'},tuesday:{sport:'walk'}}},privacy:{showStats:false}},cloud={user:{name:'Other',weeklyGoalSessions:6,schedule:{monday:{sport:'run'},tuesday:{sport:'bike'}}},privacy:{showStats:true}};const merged=h.w.titanMergeProfilePreferences(base,local,cloud);assert.equal(merged.user.name,'Local');assert.equal(merged.user.weeklyGoalSessions,6);assert.equal(merged.user.schedule.monday.sport,'swim');assert.equal(merged.user.schedule.tuesday.sport,'bike');assert.equal(merged.privacy.showStats,true);});

test('an offline profile is protected and resumes once when connectivity returns',async()=>{const h=harness();h.w.navigator.onLine=false;await h.w.pushProfileStateToCloud();assert.equal(h.calls.length,0);await h.advance(30000);h.w.navigator.onLine=true;h.fire('online');await h.advance(0);assert.equal(h.calls.length,1);});

test('explicit account erasure invalidates late profile writes without affecting another owner',async()=>{let release;const h=harness({send:()=>new Promise(r=>release=r)});const pending=h.w.pushProfileStateToCloud();await tick();h.w.titanInvalidateProfileWrites('a');for(const row of [...h.w.titanProfileCopies('a')])h.storage.removeItem(row.key);h.storage.removeItem('titan_profile_control_v2_a');release({data:{id:'a',state_version:2,xp:99},error:null});await pending;assert.equal(h.w.state.user.xp,7);assert.equal(h.storage.getItem('titan_profile_control_v2_a'),null);await h.w.saveState();assert.equal(h.w.titanProfileCopies('a').length,0);await h.w.pushProfileStateToCloud();await h.w.saveState();assert.equal(h.calls.length,1);assert.equal(h.w.titanProfileCopies('a').length,0);});

test('throttled preference edits have a durable copy before their send timer fires',async()=>{const h=harness();await h.w.pushProfileStateToCloud();h.w.state.user.name='Deferred edit';h.w.saveState();assert.equal(h.calls.length,1);assert(h.w.titanGetProfileRecovery().some(r=>r.preferences.user.name==='Deferred edit'));});

test('reverting a preference during an in-flight write preserves the compensating intent',async()=>{let release;const h=harness({send:(call,n)=>n===2?new Promise(r=>release=r):{data:{id:'a',state_version:2},error:null}});await h.w.pushProfileStateToCloud();h.w.state.user.name='In flight';const pending=h.w.saveState({forceCloud:true});await tick();h.w.state.user.name='Local';h.w.saveState();release({data:{id:'a',state_version:3},error:null});await pending;const copy=h.w.titanGetProfileRecovery().find(r=>r.preferences.user.name==='Local');assert(copy,'compensating edit exists before the next timer');assert.equal(copy.baseline,null,'unconfirmed intermediate write is not treated as a confirmed merge base');assert.equal(h.w.titanMergeProfilePreferences(copy.baseline,copy.preferences,{user:{name:'In flight'}}).user.name,'Local');});

test('online without a pending edit never writes a profile',async()=>{const h=harness();h.fire('online');await h.advance(0);assert.equal(h.calls.length,0);});
test('a missing version requires a cloud read and never bypasses optimistic concurrency',async()=>{const h=harness();h.w.state.meta={};const error=await h.w.pushProfileStateToCloud();assert.equal(h.calls.length,0);assert.equal(error.code,'PROFILE_READ_REQUIRED');assert.equal(h.w.titanGetProfileRecovery().length,1);});

test('an edit during the history phase of a profile read is not falsely acknowledged',async()=>{
 const h=harness();await h.w.syncWithSupabase();let release;
 h.w.TitanTraining.paginate=()=>new Promise(r=>release=r);
 const reading=h.w.syncWithSupabase();await tick();
 h.w.state.user.weeklyGoalSessions=6;h.w.saveState();
 release({logs:[],total:0});await reading;
 const control=JSON.parse(h.storage.getItem('titan_profile_control_v2_a'));
 assert.equal(JSON.parse(control.accepted).user.weeklyGoalSessions,4);
 const copy=h.w.titanGetProfileRecovery().find(r=>r.preferences.user.weeklyGoalSessions===6);
 assert(copy);assert.equal(copy.baseline.user.weeklyGoalSessions,4);
 h.w.TitanTraining.paginate=async()=>({logs:[],total:0});h.w.confirm=()=>true;
 await h.w.titanRestoreProfileRecovery(copy.key);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].params.p_state.user.weeklyGoalSessions,6);
});
test('PT409 blocks repeated saves and preserves the pending edit',async()=>{
 const h=harness({send:()=>({error:{code:'PT409',message:'PROFILE_VERSION_CONFLICT'}})});
 await h.w.pushProfileStateToCloud();for(let i=0;i<100;i++)await h.w.saveState({forceCloud:true});
 await h.advance(600000);assert.equal(h.calls.length,1);assert(h.w.titanGetProfileRecovery().length>0);
});

test('caching a cloud read preserves its timestamp instead of inventing a local edit',()=>{
 const h=harness();h.w.state.meta.updatedAt='2026-11-01T10:00:00.000Z';
 h.w.saveState({localOnly:true});
 assert.equal(JSON.parse(h.storage.getItem('state')).meta.updatedAt,'2026-11-01T10:00:00.000Z');
});
test('a newer cache timestamp alone never announces a progression conflict on repeated reads',async()=>{
 const h=harness(),notices=[];h.w.showNotification=(...notice)=>notices.push(notice);
 h.w.state.meta.updatedAt=new Date().toISOString();
 await h.w.syncWithSupabase();await h.w.syncWithSupabase();
 assert.equal(notices.filter(n=>n[1]==='CACHE EN REVUE').length,0);
 assert.equal(h.calls.length,0);
});
