// Business contracts of the real discovery engine. No alternate reward implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const kinds={swimming:{unit:'m',val:2000},running:{unit:'km',val:8},muscu_gym:{unit:'kg',val:4000}};
const practices=['swimming','running','muscu_gym','mixed'];
function environment(){
 let clock=Date.parse('2026-01-01T12:00:00Z');
 class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const storage=new Map(),window={state:{user:{id:'guest_multisport'},history:[]},addEventListener(){},dispatchEvent(){}};
 const context={window,document:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},Date:Clock,Intl,console,structuredClone,CustomEvent:class{constructor(type){this.type=type;}},setTimeout(){},clearTimeout(){}};
 vm.createContext(context);
 for(const file of ['core/sports-catalog','core/sports','training-store','sport-insights','core/format','core/effort','core/progress','core/campaign-quests','renaissance-catalog','renaissance-engine'])vm.runInContext(readFileSync(new URL(`../js/${file}.js`,import.meta.url),'utf8'),context);
 window.TitanSports.ensure();
 return {window,storage,advance:(ms=86400000)=>{clock+=ms;},stamp:()=>new Clock().toISOString()};
}
function session(env,sport,id,duration=50){const {unit,val}=kinds[sport];return {id,sport,unit,val,date:env.stamp(),created_at:env.stamp(),details:{duration,bio:{rpe:5},note:'Une trace de ma pratique'}};}
const outcome=s=>JSON.parse(JSON.stringify({level:s.level,xp:s.xp,credits:s.credits,campaigns:s.campaigns.map(c=>({id:c.id,chapter:c.chapter,target:c.target,effort_target:c.effort_target,days:c.evidence.days,effort:c.evidence.effort})),badges:s.rewards.map(r=>({world:r.world,chapter:r.chapter}))}));

test('every catalog sport gives the same declared effort at equal duration and intensity',()=>{
 const {window:w}=environment();const sports=w.TitanSports.all();assert.equal(sports.length,260);
 for(const {id} of sports){const effort=w.TitanProgress.effortOf({sport:id,unit:w.TitanSports.unitOf(id),val:1,details:{duration:50,bio:{rpe:5}}});assert.equal(effort.effortMinutes,50,id);assert.equal(effort.xp,500,id);}
});

test('one sport or optional variety completes all36discovery chapters on both routes with identical progress',async()=>{
 for(const route of ['rhythm','journal']){
  let reference;
  for(const practice of practices){
   const env=environment(),w=env.window,a=w.TitanAdventure;await a.refresh();
   const trace=[];let serial=0;
   for(const world of ['aube','marees','forge','aurores']){
    env.advance(1000);await a.action('start',{world,route});
    for(let chapter=1;chapter<=9;chapter++){
     assert.equal(a.snapshot.campaigns.find(c=>c.id===world).chapter,chapter);
     for(let day=0;day<3;day++){env.advance();const sport=practice==='mixed'?Object.keys(kinds)[day]:practice;w.state.history.push(session(env,sport,`${world}-${chapter}-${serial++}`));}
     await a.refresh();const c=a.snapshot.campaigns.find(c=>c.id===world);
     assert.equal(c.evidence.days,3,`${practice}/${route}/${world}/${chapter}`);assert.equal(c.evidence.effort,150);
     assert.equal(w.TitanProgress.campaignProgress(c).ready,true);
     if(world==='aube'){const q=w.TitanCampaignQuests.plan({campaign:c,history:w.state.history,guest:true,effortOf:l=>w.TitanProgress.effortOf(l).effortMinutes});assert.equal(q.completed,3);}
     env.advance(1000);await a.action('claim',{world,chapter});trace.push(outcome(a.snapshot));
    }
    assert.equal(a.snapshot.campaigns.find(c=>c.id===world).chapter,10);
   }
   assert.equal(a.snapshot.rewards.length,36);const persisted=JSON.parse(env.storage.get('titan_adventure_v1:guest_multisport'));assert.equal(persisted.rewards.length,36);
   assert.equal(new Set(persisted.rewards.map(r=>r.world+':'+r.chapter)).size,36);
   if(reference)assert.deepEqual(trace,reference,`${practice} has no sport/variety advantage on ${route}`);else reference=trace;
  }
 }
});

test('large single-day volume cannot replace the guardian regularity condition in any practice',async()=>{
 for(const practice of Object.keys(kinds)){
  const env=environment(),w=env.window,a=w.TitanAdventure;const id=w.state.user.id;
  env.storage.set('titan_adventure_v1:'+id,JSON.stringify({owner:id,revision:1,selected_world:'aube',campaigns:[{id:'aube',chapter:9,route:'rhythm',started_at:env.stamp()}],rewards:[]}));
  env.advance();w.state.history=[session(env,practice,'long',120)];await a.refresh();
  const c=a.snapshot.campaigns.find(c=>c.id==='aube');assert.equal(c.evidence.days,1);assert.equal(c.evidence.effort,90);assert.equal(w.TitanProgress.campaignProgress(c).ready,false);
  await assert.rejects(()=>a.action('claim',{world:'aube',chapter:9}),/QUEST_INCOMPLETE/);assert.equal(a.snapshot.rewards.length,0);
 }
});

test('weekly preparations use multisport measures and never require variety',()=>{
 let reference;
 for(const practice of practices){const env=environment(),w=env.window;const history=[];
  for(let day=0;day<3;day++){env.advance();history.push(session(env,practice==='mixed'?Object.keys(kinds)[day]:practice,'week'+day));}
  const quests=JSON.parse(JSON.stringify(w.TitanAdventure.weeklyQuests(history,3,new Date(env.stamp()))));
  const measures=quests.map(({id,value,target,unit,text})=>({id,value,target,unit,text}));
  if(reference)assert.deepEqual(measures,reference);else reference=measures;
  assert.deepEqual(quests.map(q=>q.id),['rhythm','perspective','context','return']);
 }
});
