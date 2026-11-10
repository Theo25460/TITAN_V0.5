import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
const require=createRequire(import.meta.url);
const J=(()=>{try{return require('../js/core/journey.js');}catch{return {};}})();
const at='2026-11-05T12:00:00Z';
const snapshot=(over={})=>({version:1,owner:'a',configVersion:1,totalSteps:15000,goal:30000000,today:{day:'2026-11-05',steps:5000,sources:['health_connect'],updatedAt:at},discoveries:[{id:'a',steps:10000,world:'aube',name:'Trace',story:'Brume levée.',kind:'milestone',earnedAt:at},{id:'b',steps:20000,world:'aube',name:'Passage',story:'Une rivière.',kind:'discovery',earnedAt:null},{id:'c',steps:30000,world:'aube',name:'Refuge',story:'Une halte.',kind:'milestone',earnedAt:null}],career:{level:8,milestones:[{id:'c5',level:5,title:'Souvenir',description:'Premières séances.',earnedAt:at},{id:'c10',level:10,title:'Passage',description:'Prochain titre.',earnedAt:null}]},...over});
test('next small and major discovery, saga and career are distinct',()=>{const m=J.model(snapshot(),'a');assert.equal(m.next.id,'b');assert.equal(m.remaining,5000);assert.equal(m.segmentPercent,50);assert.equal(m.nextGrand.id,'c');assert.equal(m.nextCareer.level,10);assert.equal(m.sagaPercent,.05);assert.equal(m.earned.length,1);});
test('local step counters never grant acquisitions',()=>{const s=snapshot({totalSteps:9999,localSteps:30000000});s.discoveries[0].earnedAt=null;const m=J.model(s,'a');assert.equal(m.readyCount,0);assert.equal(m.remaining,1);assert.equal(m.earned.length,0);});
test('observed steps are an overview and do not cross verified thresholds', () => {
  const s = snapshot({ totalSteps: 0, today: null, observedSteps: 30000000, observedToday: snapshot().today });
  s.discoveries[0].earnedAt = null;
  const m = J.model(s, 'a');
  assert.equal(m.snapshot.observedSteps, 30000000);
  assert.equal(m.hasStepData, false);
  assert.equal(m.readyCount, 0);
  assert.equal(m.sagaPercent, 0);
  assert.equal(J.model({ ...s, observedSteps: -1 }, 'a'), null);
  assert.equal(J.model({ ...s, observedToday: { steps: 5000 } }, 'a'), null);
});
test('correction preserves earned acquisition and clamps partial progress',()=>{const m=J.model(snapshot({totalSteps:1000}),'a');assert.equal(m.earned.length,1);assert.equal(m.next.id,'b');assert.equal(m.segmentPercent,0);});
test('reached threshold remains unearned until explicit server confirmation',()=>{const m=J.model(snapshot({totalSteps:30000}),'a');assert.equal(m.readyCount,2);assert.equal(m.earned.length,1);assert.equal(m.remaining,0);});
test('owner, version, invalid counters, earned dates and duplicate IDs fail closed',()=>{const d=snapshot();d.discoveries.push(d.discoveries[0]);const x=snapshot();x.discoveries[0].earnedAt='invalid';for(const s of [null,snapshot({owner:'b'}),snapshot({version:2}),snapshot({totalSteps:-1}),snapshot({totalSteps:NaN}),snapshot({goal:0}),d,x])assert.equal(J.model(s,'a'),null);});
test('absent data differs from real zero; complete saga has no next step',()=>{assert.equal(J.model(snapshot({totalSteps:0,today:null}),'a').hasStepData,false);const s=snapshot({totalSteps:30000000});s.discoveries.forEach(d=>d.earnedAt=at);s.career.milestones.forEach(d=>d.earnedAt=at);const m=J.model(s,'a');assert.equal(m.next,null);assert.equal(m.nextCareer,null);assert.equal(m.sagaPercent,100);});

test('world changes follow dated receipts and survive changes to campaign progress', () => {
  const s = { owner: 'a', campaigns: [{ chapter: 10 }], rewards: [
    { world: 'aube', chapter: 1, earned_at: at },
    { world: 'marees', chapter: 5, earned_at: at },
    { world: 'aube', chapter: 9, earned_at: 'invalid' },
  ] };
  const story = J.worldStory(s, 'aube', 'a');
  assert.equal(story.version, 1);
  assert.deepEqual(story.scenes.map(scene => scene.earnedAt), [at, null, null]);
  assert.deepEqual(J.worldStory({ ...s, campaigns: [] }, 'aube', 'a'), story);
  assert.equal(J.worldStory(s, 'aube', 'b'), null);
});
