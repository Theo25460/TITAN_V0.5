import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../js/app/analytics.js',import.meta.url),'utf8');
const A='00000000-0000-4000-8000-000000000123',B='00000000-0000-4000-8000-000000000456';
const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r;}),resolve:v=>resolve(v)};};
function fixture({consent='granted',getSession,insert}={}){
  const writes=[],storage=new Map();
  if(consent)storage.set('titan_privacy_v1',JSON.stringify({analytics:consent}));
  const context={window:{state:{user:{id:A}},titanAccountTransition:{epoch:1,active:false},titanClient:{
    auth:{getSession:getSession||(async()=>({data:{session:{user:{id:A},access_token:"token-A"}}}))},
    from:table=>{assert.equal(table,'analytics_events');return {insert:async row=>{writes.push(row);return insert?insert(row):{error:null};}};}
  }},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},navigator:{onLine:true},
    location:{pathname:'/stats',search:'?utm_source=private%20text'},URLSearchParams};
  context.window.supabase={createClient:()=>context.window.titanClient};
  vm.runInNewContext(source,context);
  return {context,writes,storage,analytics:context.window.TitanAnalytics};
}

test('analytics: advanced analysis events retain only closed view kinds',async()=>{
  const {analytics,writes}=fixture();
  const cases=[
    ['analysis_comparison_viewed',{}],['analysis_report_viewed',{}],['analysis_report_exported',{}],
    ['analysis_view_created',{kind:'report'}],['analysis_view_renamed',{kind:'comparison'}],
    ['analysis_view_deleted',{kind:'report'}],['analysis_view_opened',{kind:'comparison'}]
  ];
  for(const [name,expected] of cases){
    assert.equal(await analytics.track(name,{...expected,name:'Ma vue privée',sport:'running',count:450,period:'year',source:'private_text',notes:'private',gps:[1,2]}),true);
    const row=writes.at(-1);
    assert.equal(row.event_name,name);assert.equal(row.user_id,A);assert.equal(row.source,null);assert.equal(row.referrer,null);
    assert.deepEqual(JSON.parse(JSON.stringify(row.metadata)),{...expected,consent:'granted',v:300});
  }
  assert.equal(await analytics.track('analysis_view_created',{kind:'private_health_text'}),true);
  assert.deepEqual(JSON.parse(JSON.stringify(writes.at(-1).metadata)),{consent:'granted',v:300});
});
test('analytics: unanswered consent sends analysis counts without account or URL attribution',async()=>{
  const {analytics,writes}=fixture({consent:null});
  assert.equal(await analytics.track('analysis_report_viewed',{minutes:100}),true);
  assert.equal(writes[0].user_id,null);assert.equal(writes[0].source,null);
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0].metadata)),{consent:'anonymous',v:300});
});
test('analytics: denied consent suppresses both existing and advanced events',async()=>{
  const {analytics,writes}=fixture({consent:'denied'});
  assert.equal(await analytics.track('sport_navigation_searched',{source:'records'}),false);
  assert.equal(await analytics.track('analysis_report_viewed'),false);assert.deepEqual(writes,[]);
});
test('analytics: consent withdrawn while session lookup waits prevents the insert',async()=>{
  const session=deferred(),{analytics,writes}=fixture({getSession:()=>session.promise});
  const sent=analytics.track('sport_navigation_searched',{source:'records'});
  analytics.setConsent(false);session.resolve({data:{session:{user:{id:A},access_token:"token-A"}}});
  assert.equal(await sent,false);assert.deepEqual(writes,[]);
});
test('analytics: changing account during session lookup cannot attribute the prior action to B',async()=>{
  const session=deferred(),{context,analytics,writes}=fixture({getSession:()=>session.promise});
  const sent=analytics.track('sport_navigation_searched',{source:'records'});
  context.window.state.user.id=B;context.window.titanAccountTransition.epoch++;
  session.resolve({data:{session:{user:{id:B},access_token:"token-B"}}});
  assert.equal(await sent,false);assert.deepEqual(writes,[]);
});
test('analytics: withdrawing then restoring consent does not revive an already pending event',async()=>{
  const session=deferred(),{analytics,writes}=fixture({getSession:()=>session.promise});
  const sent=analytics.track('sport_navigation_searched',{source:'records'});
  analytics.setConsent(false);analytics.setConsent(true);session.resolve({data:{session:{user:{id:A},access_token:"token-A"}}});
  assert.equal(await sent,false);assert.deepEqual(writes,[]);
});
test('analytics: A to B to A invalidates a delayed event despite the same final owner',async()=>{
  const session=deferred(),{context,analytics,writes}=fixture({getSession:()=>session.promise});
  const sent=analytics.track('sport_navigation_searched',{source:'records'});
  context.window.state.user.id=B;context.window.titanAccountTransition.epoch++;
  context.window.state.user.id=A;context.window.titanAccountTransition.epoch++;
  session.resolve({data:{session:{user:{id:A},access_token:"token-A"}}});
  assert.equal(await sent,false);assert.deepEqual(writes,[]);
});
test('analytics: replacing the client before insert discards the stale event',async()=>{
  const session=deferred(),{context,analytics,writes}=fixture({getSession:()=>session.promise});
  const sent=analytics.track('sport_navigation_searched',{source:'records'});
  context.window.titanClient={...context.window.titanClient};session.resolve({data:{session:{user:{id:A},access_token:"token-A"}}});
  assert.equal(await sent,false);assert.deepEqual(writes,[]);
});
test('analytics: a session belonging to a different account cannot label this action',async()=>{
  const {analytics,writes}=fixture({getSession:async()=>({data:{session:{user:{id:B},access_token:"token-B"}}})});
  assert.equal(await analytics.track('sport_navigation_searched',{source:'records'}),false);assert.deepEqual(writes,[]);
});
test('analytics: offline attempts do not consume a once-only event',async()=>{
  const {context,analytics,writes}=fixture();context.navigator.onLine=false;
  assert.equal(await analytics.track('first_session'),false);context.navigator.onLine=true;
  assert.equal(await analytics.track('first_session'),true);assert.equal(writes.length,1);
  assert.equal(await analytics.track('first_session'),false);assert.equal(writes.length,1);
});
test('analytics: failed inserts leave a once-only event available for a later explicit attempt',async()=>{
  let fails=true;const {analytics,writes}=fixture({insert:()=>({error:fails?{message:'offline'}:null})});
  assert.equal(await analytics.track('first_session'),false);fails=false;
  assert.equal(await analytics.track('first_session'),true);assert.equal(writes.length,2);
  assert.equal(await analytics.track('first_session'),false);assert.equal(writes.length,2);
});
test('analytics: concurrent once-only calls send one accepted row',async()=>{
  const delivery=deferred(),{analytics,writes}=fixture({insert:()=>delivery.promise});
  const first=analytics.track('first_session'),second=analytics.track('first_session');
  await Promise.resolve();delivery.resolve({error:null});
  assert.deepEqual(await Promise.all([first,second]),[true,false]);assert.equal(writes.length,1);
});
test('analytics: unknown event names remain rejected',async()=>{
  const {analytics,writes}=fixture();assert.equal(await analytics.track('unplanned_private_event',{notes:'private'}),false);assert.deepEqual(writes,[]);
});

test('analytics consent: failed preference writes cannot re-enable tracking after refusal',async()=>{
  const {context,analytics,writes}=fixture();
  context.localStorage.setItem=()=>{throw Error('Synthetic storage denied');};
  analytics.setConsent(false);
  assert.equal(await analytics.track('analysis_report_viewed'),false);
  assert.deepEqual(writes,[]);
});
test('analytics consent: unavailable preference storage suppresses tracking',async()=>{
  const {context,analytics,writes}=fixture();
  context.localStorage.getItem=()=>{throw Error('Synthetic storage unavailable');};
  assert.equal(await analytics.track('analysis_report_viewed'),false);
  assert.deepEqual(writes,[]);
});
test('analytics consent: refusal replaces a malformed preference instead of leaving anonymous tracking active',async()=>{
  const {analytics,writes,storage}=fixture();storage.set('titan_privacy_v1','{invalid');
  analytics.setConsent(false);
  assert.equal(await analytics.track('analysis_report_viewed'),false);
  assert.deepEqual(writes,[]);
});
test('analytics consent: invalid stored preference shapes cannot become anonymous permission',async()=>{
  for(const raw of ['[]','"granted"','7','{"analytics":"unexpected"}']){
    const {analytics,writes,storage}=fixture();storage.set('titan_privacy_v1',raw);
    assert.equal(await analytics.track('analysis_report_viewed'),false);assert.deepEqual(writes,[]);
  }
});

// Actual vendored SDK, including its asynchronous token preparation. Only native HTTP/auth boundaries are faked.
function sdkFixture({login=false,delayed=true}={}){
  const storage=new Map([['titan_privacy_v1',JSON.stringify({analytics:'granted'})]]),requests=[],listeners=new Map();
  const token=deferred(),prepared=deferred();let calls=0,authCallback;
  const session=id=>({data:{session:{user:{id},access_token:`token-${id}`}}});
  const context=vm.createContext({URL,URLSearchParams,Headers,Response,Request,AbortController,WebSocket,setTimeout,clearTimeout,setInterval,clearInterval,console,
    navigator:{onLine:true},location:{pathname:login?'/login':'/stats',search:''},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    fetch:async(url,init)=>{requests.push({row:JSON.parse(init.body),authorization:new Headers(init.headers).get('Authorization')});return new Response(null,{status:201});},
    window:{...(login?{}:{state:{user:{id:A}},titanAccountTransition:{epoch:1,active:false}}),
      TITAN_SUPABASE_URL:'https://test.supabase.co',TITAN_SUPABASE_ANON_KEY:'fake-anon-key',
      addEventListener:(type,fn)=>listeners.set(type,[...(listeners.get(type)||[]),fn])}});
  vm.runInContext(readFileSync(new URL('../js/vendor/supabase-2.111.0.js',import.meta.url),'utf8'),context);
  const create=context.supabase.createClient;
  const client=create(context.window.TITAN_SUPABASE_URL,'fake-anon-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,skipAutoInitialize:true},global:{fetch:context.fetch}});
  client.auth.getSession=async()=>{if(++calls===1||!delayed)return session(A);prepared.resolve();return token.promise;};
  client.auth.onAuthStateChange=fn=>{authCallback=fn;return {data:{subscription:{unsubscribe(){}}}};};
  context.window.titanClient=client;
  context.window.supabase={...context.supabase,createClient:(url,key,options)=>create(url,key,{...options,
    accessToken:async()=>{if(delayed){prepared.resolve();await token.promise;}return options.accessToken();}})};
  vm.runInContext(source,context);
  return {context,requests,storage,session,prepared,token,client,analytics:context.window.TitanAnalytics,
    emit:(type,event={})=>listeners.get(type)?.forEach(fn=>fn(event)),authChange:(event,id)=>authCallback?.(event,id?{user:{id}}:null)};
}
for(const change of ['consent','account round trip','client replacement','cross-tab consent']){
  test(`analytics actual SDK: ${change} during token preparation prevents native dispatch`,async()=>{
    const f=sdkFixture(),sent=f.analytics.track('analysis_report_viewed');await f.prepared.promise;
    assert.equal(f.requests.length,0,'the request has not left the browser');
    if(change==='consent'){f.analytics.setConsent(false);f.analytics.setConsent(true);}
    if(change==='account round trip'){f.context.window.state.user.id=B;f.context.window.titanAccountTransition.epoch++;f.context.window.state.user.id=A;f.context.window.titanAccountTransition.epoch++;}
    if(change==='client replacement')f.context.window.titanClient={...f.client};
    if(change==='cross-tab consent'){f.storage.set('titan_privacy_v1',JSON.stringify({analytics:'denied'}));f.emit('storage',{key:'titan_privacy_v1'});f.storage.set('titan_privacy_v1',JSON.stringify({analytics:'granted'}));f.emit('storage',{key:'titan_privacy_v1'});}
    f.token.resolve(f.session(A));assert.equal(await sent,false);assert.deepEqual(f.requests,[]);
  });
}
test('analytics actual SDK: current events use only the captured session token and minimal row',async()=>{
  const f=sdkFixture({delayed:false});assert.equal(await f.analytics.track('analysis_view_created',{kind:'report',name:'private'}),true);
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].authorization,`Bearer token-${A}`);
  assert.equal(f.requests[0].row.user_id,A);assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0].row.metadata)),{kind:'report',consent:'granted',v:300});
});
test('analytics consent: the SDK rejects a changed persisted preference before its storage event arrives',async()=>{
  const f=sdkFixture(),sent=f.analytics.track('analysis_report_viewed');await f.prepared.promise;
  f.storage.set('titan_privacy_v1',JSON.stringify({analytics:'denied',revision:'refusal'}));
  f.storage.set('titan_privacy_v1',JSON.stringify({analytics:'granted',revision:'new-agreement'}));
  // Real cross-tab events are asynchronous; no event has reached this document yet.
  f.token.resolve(f.session(A));assert.equal(await sent,false);assert.deepEqual(f.requests,[]);
});
test('analytics consent: an unsaved agreement cannot mask a later persisted refusal',async()=>{
  const f=sdkFixture({delayed:false});
  const save=f.context.localStorage.setItem;
  f.context.localStorage.setItem=(key,value)=>{if(key==='titan_privacy_v1')throw Error('Synthetic write failure');save(key,value);};
  f.analytics.setConsent(true);
  assert.equal(await f.analytics.track('analysis_report_viewed'),true,'the explicit live-page agreement initially applies');
  f.storage.set('titan_privacy_v1',JSON.stringify({analytics:'denied',revision:'other-tab-refusal'}));
  assert.equal(f.analytics.consent(),'denied','the persisted change wins before delivery of storage');
  f.emit('storage',{key:'titan_privacy_v1'});
  assert.equal(await f.analytics.track('analysis_report_viewed'),false);assert.equal(f.requests.length,1);
});
test('analytics consent: an unsaved agreement cannot bypass unavailable preference reads',async()=>{
  const f=sdkFixture({delayed:false});
  f.context.localStorage.setItem=()=>{throw Error('Synthetic write failure');};f.analytics.setConsent(true);
  f.context.localStorage.getItem=()=>{throw Error('Synthetic read failure');};
  assert.equal(await f.analytics.track('analysis_report_viewed'),false);assert.deepEqual(f.requests,[]);
});
test('analytics login: signup cannot be attributed to a different session owner',async()=>{
  const f=sdkFixture({login:true,delayed:false});f.client.auth.getSession=async()=>f.session(B);
  assert.equal(await f.analytics.track('signup',{}, {owner:A}),false);assert.deepEqual(f.requests,[]);
});
test('analytics login: auth changes invalidate a session wait without application state',async()=>{
  const f=sdkFixture({login:true,delayed:false}),session=deferred();f.client.auth.getSession=()=>session.promise;
  const sent=f.analytics.track('signup',{}, {owner:A});f.authChange('SIGNED_IN',B);f.authChange('SIGNED_IN',A);
  session.resolve(f.session(A));assert.equal(await sent,false);assert.deepEqual(f.requests,[]);
});
test('analytics login: two authenticated signup owners have separate once keys',async()=>{
  const f=sdkFixture({login:true,delayed:false});
  assert.equal(await f.analytics.track('signup',{}, {owner:A}),true);
  f.authChange('SIGNED_IN',B);f.client.auth.getSession=async()=>f.session(B);
  assert.equal(await f.analytics.track('signup',{}, {owner:B}),true);
  assert.equal(await f.analytics.track('signup',{}, {owner:B}),false);
  assert.deepEqual(f.requests.map(r=>r.row.user_id),[A,B]);
});
test('analytics login: confirmation-only signup stays unlinked and deduplicates by its receipt owner',async()=>{
  const f=sdkFixture({login:true,delayed:false});f.client.auth.getSession=async()=>({data:{session:null}});
  assert.equal(await f.analytics.track('signup',{}, {owner:A}),true);assert.equal(await f.analytics.track('signup',{}, {owner:B}),true);
  assert.equal(await f.analytics.track('signup',{}, {owner:A}),false);
  assert.deepEqual(f.requests.map(r=>r.row.user_id),[null,null]);assert.ok(f.requests.every(r=>r.authorization==='Bearer fake-anon-key'));
});

// Run the historical public entry point against the actual collector and vendored transport.
function publicEntry(f){
  f.context.location.pathname='/dynamic-page';f.context.location.search='?slug=private-fixture&utm_source=private-source';
  f.context.document={referrer:'https://example.test/private?notes=private-fixture'};
  vm.runInContext(readFileSync(new URL('../js/content.js',import.meta.url),'utf8'),f.context);
  return f.context.window.titanTrackEvent;
}
test('public analytics: the historical entry respects an explicit refusal',async()=>{
  const f=sdkFixture({login:true,delayed:false}),track=publicEntry(f);f.analytics.setConsent(false);
  assert.equal(await track('dynamic_page_opened',{slug:'private-fixture'}),false);assert.deepEqual(f.requests,[]);
});
test('public analytics: unanswered preference counts without account token or URL details',async()=>{
  const f=sdkFixture({login:true,delayed:false}),track=publicEntry(f);f.storage.delete('titan_privacy_v1');
  assert.equal(await track('dynamic_page_opened',{slug:'private-fixture',notes:'private',gps:[1,2]}),true);
  assert.equal(f.requests[0].authorization,'Bearer fake-anon-key');
  assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0].row)),{event_name:'dynamic_page_opened',user_id:null,page:'/dynamic-page',source:null,referrer:null,metadata:{consent:'anonymous',v:300}});
});
test('public analytics: an agreed opening retains its historical unit with minimal properties',async()=>{
  const f=sdkFixture({login:true,delayed:false}),track=publicEntry(f);
  assert.equal(await track('dynamic_page_opened',{slug:'private-fixture',family:'private',sport:'running',source:'private',notes:'private'}),true);
  assert.equal(await track('dynamic_page_opened'),true,'two genuine page openings remain two counts');
  assert.equal(f.requests.length,2);assert.equal(f.requests[0].authorization,`Bearer token-${A}`);
  assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0].row)),{event_name:'dynamic_page_opened',user_id:A,page:'/dynamic-page',source:null,referrer:null,metadata:{consent:'granted',v:300}});
});
test('public analytics: missing shared collector never falls back to an unguarded write',async()=>{
  const f=sdkFixture({login:true,delayed:false});delete f.context.window.TitanAnalytics;
  assert.equal(await publicEntry(f)('dynamic_page_opened'),false);assert.deepEqual(f.requests,[]);
});
test('public analytics: withdrawal and restoration during native token preparation invalidates an opening',async()=>{
  const f=sdkFixture({login:true}),sent=publicEntry(f)('dynamic_page_opened');await f.prepared.promise;
  f.analytics.setConsent(false);f.analytics.setConsent(true);f.token.resolve(f.session(A));
  assert.equal(await sent,false);assert.deepEqual(f.requests,[]);
});
test('public analytics: legacy callers cannot introduce unregistered event names',async()=>{
  const f=sdkFixture({login:true,delayed:false});
  assert.equal(await publicEntry(f)('private_health_event',{notes:'private'}),false);assert.deepEqual(f.requests,[]);
});
