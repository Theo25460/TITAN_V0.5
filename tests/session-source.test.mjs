import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const ID='00000000-0000-4000-8000-000000000999', OWNER='00000000-0000-4000-8000-000000000123';
function load(remote) {
  const window={state:{user:{id:OWNER},history:[],archivedHistory:[]},dispatchEvent(){}};
  const filters=[];
  const query={select(){return this;},eq(k,v){filters.push([k,v]);return this;},maybeSingle:remote};
  window.titanClient={from(t){assert.equal(t,'training_logs');return query;}};
  vm.runInNewContext(readFileSync(new URL('../js/app/sessions.js',import.meta.url),'utf8'),{window,navigator:{onLine:true},CustomEvent:class {},console});
  return {window,filters};
}
test('journal source resolves an old own session outside the local cache without persisting it', async()=>{
  const row={id:ID,user_id:OWNER,sport:'running',date:'2026-01-01T12:00:00Z',details:{val2:30},revision:2};
  const {window,filters}=load(async()=>({data:row}));
  assert.equal(typeof window.TitanSessions.resolve,'function');
  const found=await window.TitanSessions.resolve(ID);
  assert.equal(found.id,ID);
  assert.equal(found.syncStatus,'confirmed');
  assert.deepEqual(filters,[['id',ID],['user_id',OWNER]]);
  assert.equal(window.state.history.length,0,'dialog retrieval is not a history/cache mutation');
});
test('journal source rejects a late response after account change',async()=>{
  let finish;
  const {window}=load(()=>new Promise(r=>{finish=r;}));
  assert.equal(typeof window.TitanSessions.resolve,'function');
  const pending=window.TitanSessions.resolve(ID);
  window.state.user.id='guest_other';
  finish({data:{id:ID,user_id:OWNER}});
  assert.equal(await pending,null);
});
test('journal source rejects a wrong owner and does not query a guest or invalid id',async()=>{
  let calls=0;
  const {window}=load(async()=>{calls++;return{data:{id:ID,user_id:'someone_else'}};});
  assert.equal(typeof window.TitanSessions.resolve,'function');
  assert.equal(await window.TitanSessions.resolve(ID),null);
  assert.equal(await window.TitanSessions.resolve('invalid'),null);
  window.state.user.id='guest_local';
  assert.equal(await window.TitanSessions.resolve(ID),null);
  assert.equal(calls,1);
});
test('a foreign source cannot be saved into a new guest history',async()=>{
  const {window}=load(async()=>({data:null}));
  window.state.user.id='guest_other';
  let writes=0;
  window.TitanQueue={saveGuestSession:async()=>{writes++;}};
  await assert.rejects(window.TitanSessions.update({id:ID,user_id:OWNER,details:{}},{note:'private'}),/compte/i);
  assert.equal(writes,0);
});
