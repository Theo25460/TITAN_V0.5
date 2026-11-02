import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const E=require('../js/core/adventure-effort.js');
const R=require('../js/core/adventure-rpg.js');
test('four worlds keep nine chapters and six milestones in each of three arcs',()=>{
  assert.equal(R.worlds.length,4);
  for(const world of R.worlds){
    const path=R.path(world.id); assert.equal(path.length,18);
    assert.equal(new Set(path.map(n=>n.chapter)).size,9);
    for(let arc=1;arc<=3;arc++)assert.equal(path.filter(n=>n.arc===arc).length,6);
    assert.equal(path.filter(n=>n.kind==='monster').length,3);
    assert.equal(path.filter(n=>n.kind==='miniboss').length,3);
    assert(path.every(n=>n.name&&n.story));
  }
});
test('candidate is separate, bounded, equal across sports and requires trusted sensor evidence',()=>{
  const base={activeMinutes:30,rpe:5,baselineRpe:5};
  for(const sport of ['walking','running','cycling','musculation','climbing','swimming','adaptive'])
    assert.equal(E.candidate({...base,sport}).score,30);
  assert.equal(E.candidate({...base,heartRateRelative:1,sensorVerified:false}).score,30);
  assert.equal(E.candidate({...base,activeMinutes:99999}).score,90);
  assert.equal(E.candidate({...base,rpe:10,baselineRpe:10}).score,30);
  assert.equal(E.candidate({...base,rpe:null}).provenance,'declared_duration');
  assert.equal(E.CURVE_ACTIVE,false);
});
test('28-day low/high/no-sensor simulations, rest and duplicate receipts',()=>{
  for(const minutes of [15,30,180]){
    const totals=[];
    for(const sport of ['walking','running','cycling','musculation','climbing','swimming','adaptive']){
      const entries=Array.from({length:28},(_,i)=>({id:`day-${i}`,day:`2026-10-${String(i+1).padStart(2,'0')}`,sport,activeMinutes:i%7===6?0:minutes,rpe:5,baselineRpe:5,confirmed:true}));
      const result=E.simulate([...entries,...entries]);
      assert.equal(result.days,24); assert.equal(result.score,24*Math.min(90,minutes));
      assert.equal(result.xpDelta,0);assert.equal(result.coinsDelta,0);totals.push(result.score);
    }
    assert.equal(new Set(totals).size,1);
  }
  assert.equal(E.simulate([{id:'pending',day:'2026-10-01',activeMinutes:90,confirmed:false}]).score,0);
});
