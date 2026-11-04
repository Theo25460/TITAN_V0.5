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
const serverCampaign={...campaign,quests:{version:1,profile:{days:8,daysTarget:2,effortTarget:35,windowDays:28,frozen_at:campaign.started_at},items:[{id:'days',value:1,target:2,complete:false},{id:'effort',value:20,target:35,complete:false},{id:'note',value:1,target:1,complete:true}]}};
test('server quests use frozen profile and progress regardless of local history',()=>{
 const p=api().plan({campaign:serverCampaign,serverVersion:3,history:[]});
 assert.equal(p.authority,'server');assert.equal(p.profile.effortTarget,35);assert.equal(p.quests[2].complete,true);assert.equal(p.completed,1);
 const changed=api().plan({campaign:serverCampaign,serverVersion:3,history:Array.from({length:15},(_,n)=>old(n,10000))});
 assert.equal(JSON.stringify(p),JSON.stringify(changed));assert.match(p.quests[0].reward,/constance/);
});
test('version3 missing or malformed quests never fall back to invented account targets',()=>{
 assert.equal(api().plan({campaign,serverVersion:3}),null);
 assert.equal(api().plan({campaign:{...serverCampaign,quests:{...serverCampaign.quests,items:[]}},serverVersion:3}),null);
 assert.equal(api().plan({campaign:{...serverCampaign,quests:{...serverCampaign.quests,items:serverCampaign.quests.items.map(q=>({...q,target:-1}))}},serverVersion:3}),null);
});
test('server quests cover all campaign regions and clamp displayed progress without mutating inputs',()=>{
 const c=structuredClone(serverCampaign);c.id='forge';c.quests.items[0].value=999;c.quests.items[0].complete=true;const before=JSON.stringify(c);
 const p=api().plan({campaign:c,serverVersion:3});assert.ok(p);assert.equal(p.quests[0].value,2);assert.equal(JSON.stringify(c),before);
});
test('server quests fail closed on null entries, malformed profiles and contradictory completion',()=>{
 const variants=[
  q=>{q.items[0]=null;},q=>{q.profile={};},q=>{q.profile=[];},
  q=>{q.items[1]={id:'effort',target:1,value:0,complete:true};},
  q=>{q.items[0].complete=true;},q=>{q.items[1].target=20;},
  q=>{q.profile.daysTarget=1.5;},q=>{q.profile.frozen_at='invalid';},
  q=>{q.items[2].id='days';},q=>{q.items[1].value=NaN;}
 ];
 for(const corrupt of variants){const c=structuredClone(serverCampaign);corrupt(c.quests);assert.equal(api().plan({campaign:c,serverVersion:3}),null);}
});
