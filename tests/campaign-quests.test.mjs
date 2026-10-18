import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
const ctx={};vm.createContext(ctx);const file=new URL('../js/core/campaign-quests.js',import.meta.url);
if(existsSync(file))vm.runInContext(readFileSync(file,'utf8'),ctx);
const campaign={id:'aube',chapter:2,started_at:'2026-10-01T12:00:00Z',evidence:{days:1,effort:20,source_ids:['current']}};
const old=(n,minutes=60)=>({id:'old'+n,date:`2026-09-${String(10+n).padStart(2,'0')}T10:00:00Z`,created_at:'2026-09-30T10:00:00Z',details:{serverReward:true,effort:{effort_minutes:minutes}}});
const api=()=>{assert.equal(typeof ctx.TitanCampaignQuests?.plan,'function','quest rules are available');return ctx.TitanCampaignQuests;};
test('valley quests use real campaign evidence and have no reward mutation',()=>{
 const p=api().plan({campaign,history:[]});assert.equal(p.quests[0].value,1);assert.equal(p.quests[1].value,15);assert.equal(p.quests[1].target,15);assert.equal(p.quests[2].value,0);assert.equal(p.profile.daysTarget,1);
});
test('adaptation uses distinct prior days and bounded daily effort, not raw volume',()=>{
 const a=api();const p=a.plan({campaign,history:Array.from({length:15},(_,n)=>old(n,10000))});assert.equal(p.profile.daysTarget,3);assert.equal(p.profile.effortTarget,45);
 const sameDay=Array.from({length:100},(_,n)=>({...old(1,10000),id:'same'+n}));assert.equal(a.plan({campaign,history:sameDay}).profile.daysTarget,1);
});
test('current and late-imported sessions cannot move targets during a chapter',()=>{
 const a=api();const base=a.plan({campaign,history:[old(1,30)]});const next=a.plan({campaign,history:[old(1,30),{...old(2,90),created_at:'2026-10-02T00:00:00Z'},{...old(3,90),date:'2026-10-02T00:00:00Z'}]});assert.equal(next.profile.daysTarget,base.profile.daysTarget);assert.equal(next.profile.effortTarget,base.profile.effortTarget);
});
test('rejected archived historical and unconfirmed account history do not increase difficulty',()=>{
 const bad=[{...old(1),archived_at:'x'},{...old(2),is_suspicious:true},{...old(3),status:'pending_review'},{...old(4),details:{serverReward:true,historical:true}},{...old(5),details:{}}];assert.equal(api().plan({campaign,history:bad}).profile.days,0);
});
test('annotation quest is backed by a current source log only',()=>{
 const a=api();const log={id:'current',date:'2026-10-02T10:00:00Z',details:{note:'Une trace personnelle'}};assert.equal(a.plan({campaign,history:[log]}).quests[2].value,1);assert.equal(a.plan({campaign,history:[{...log,id:'foreign'}]}).quests[2].value,0);assert.equal(a.plan({campaign,history:[{...log,archived_at:'x'}]}).quests[2].value,0);
});
test('legacy effort absence is unavailable rather than invented and other worlds stay untouched',()=>{
 const a=api();const p=a.plan({campaign:{...campaign,evidence:{days:1}},history:[]});assert.equal(p.quests.find(q=>q.id==='effort').available,false);assert.equal(a.plan({campaign:{...campaign,id:'marees'},history:[]}),null);assert.equal(a.plan({campaign:{...campaign,chapter:0},history:[]}),null);assert.equal(a.plan({campaign:{...campaign,chapter:10},history:[]}),null);
});
test('discovery can adapt to local history but does not treat it as account confirmation',()=>{
 const history=Array.from({length:6},(_,n)=>({...old(n),details:{effort:{effort_minutes:30}}}));const a=api();assert.equal(a.plan({campaign,history,guest:true}).profile.daysTarget,2);assert.equal(a.plan({campaign,history,guest:false}).profile.daysTarget,1);
});
test('confirmed submit receipts contribute to adaptation while provisional rows do not',()=>{
 const a=api();const history=Array.from({length:6},(_,n)=>({...old(n),syncStatus:'confirmed',details:{serverReward:{xp:300},effort:{effort_minutes:30}}}));
 assert.equal(a.plan({campaign,history}).profile.daysTarget,2);
 assert.equal(a.plan({campaign,history:history.map(l=>({...l,syncStatus:'pending'}))}).profile.daysTarget,1);
});
