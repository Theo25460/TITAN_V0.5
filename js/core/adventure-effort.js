/* Adventure Effort candidate v2. EXPLAIN/SIMULATE ONLY. Never feeds XP, coins or live encounters.
   Relative effort is a game calibration, not a physiological measurement. No age/sex/MET inference. */
(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
  function candidate(input={}){
    const minutes=clamp(input.activeMinutes,0,90);
    const rpe=Number(input.rpe),hasRpe=input.rpe!=null&&Number.isFinite(rpe)&&rpe>=1&&rpe<=10;
    const baseline=clamp(input.baselineRpe||5,1,10);
    const relativeRpe=hasRpe?clamp(5+rpe-baseline,1,10):5;
    let factor=0.6+0.08*relativeRpe;
    const trusted=input.sensorVerified===true&&Number.isFinite(input.heartRateRelative)&&input.heartRateRelative>=0&&input.heartRateRelative<=1;
    if(trusted)factor=(factor+0.6+0.8*input.heartRateRelative)/2;
    return {version:2,candidate:true,active:false,score:Math.round(Math.min(90,minutes*factor)*10)/10,
      minutes,relativeRpe:hasRpe?relativeRpe:null,provenance:trusted?'verified_sensor':hasRpe?'declared_rpe':'declared_duration'};
  }
  function simulate(entries=[]){
    const seen=new Set(),daily=new Map();
    for(const entry of entries){
      if(!entry.confirmed||seen.has(entry.id)||!entry.id||!entry.day)continue;
      seen.add(entry.id);const score=candidate(entry).score;
      if(score>0)daily.set(entry.day,Math.min(90,(daily.get(entry.day)||0)+score));
    }
    return {version:2,days:daily.size,score:[...daily.values()].reduce((a,b)=>a+b,0),xpDelta:0,coinsDelta:0};
  }
  const api={candidate,simulate,CURVE_ACTIVE:false};root.TitanAdventureEffort=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
