/* Consent-scoped Coach summaries. Inputs are existing shared RPC pages, never local athlete history.
   UTC matches the sharing contract. No inferred effort, health score, RPE, rewards or persistence. */
/** @typedef {{id?:unknown,date?:unknown,sport?:unknown,unit?:unknown,val?:unknown,details?:{duration?:unknown}}} SharedSession */
/** @typedef {{id?:unknown,planned_date?:unknown,sport?:unknown,status?:unknown}} SharedTask */
(function(root){
  'use strict';
  /** @param {unknown} value @returns {value is number} */
  const numeric=value=>typeof value==='number'&&Number.isFinite(value);
  /** @param {unknown} value */
  function day(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
    const n=Date.parse(value+'T12:00:00Z');
    return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?value:null;
  }
  /** @template {{id?:unknown}} T @param {T[]} rows @returns {T[]} */
  function unique(rows){
    const seen=new Set();
    return rows.filter(r=>{
      if(!r||typeof r!=='object'||typeof r.id!=='string'||!r.id||seen.has(r.id))return false;
      seen.add(r.id);return true;
    });
  }
  /** @param {SharedSession} row */
  function minutesOf(row){
    const declared=row.details?.duration;
    if(declared!==null&&declared!==undefined)return numeric(declared)&&declared>=0&&declared<=525600?declared:null;
    const value=row.unit==='min'?row.val:row.unit==='h'&&numeric(row.val)?row.val*60:null;
    return numeric(value)&&value>=0&&value<=525600?value:null;
  }
  /** @param {unknown} value */
  const sportOf=value=>typeof value==='string'&&value.length>0&&value.length<=80?value:'unknown';
  /** @param {unknown} total @param {number} loaded */
  const complete=(total,loaded)=>numeric(total)&&Number.isInteger(total)&&total>=0&&total===loaded;
  /** @param {{sessions?:{rows?:SharedSession[],total?:number,from_date?:string,to_date?:string}|null,assignments?:{rows?:SharedTask[],total?:number}|null,from:string,to:string,now?:string}} input */
  function analyse(input){
    const {sessions,assignments}=input;
    const requestedFrom=day(input.from),requestedTo=day(input.to);
    const now=Date.parse(input.now||new Date().toISOString());
    const serverFrom=sessions?.from_date===undefined?requestedFrom:day(sessions.from_date);
    const serverTo=sessions?.to_date===undefined?requestedTo:day(sessions.to_date);
    if(!requestedFrom||!requestedTo||!serverFrom||!serverTo||!Number.isFinite(now)||!Array.isArray(sessions?.rows)||!Array.isArray(assignments?.rows))return {available:/** @type {const} */(false)};
    const from=requestedFrom>serverFrom?requestedFrom:serverFrom;
    const to=requestedTo<serverTo?requestedTo:serverTo;
    if(from>to||(Date.parse(to)-Date.parse(from))/86400000>366)return {available:/** @type {const} */(false)};
    const today=new Date(now).toISOString().slice(0,10);
    const loadedSessions=unique(sessions.rows.slice(0,10000));
    const loadedTasks=unique(assignments.rows.slice(0,10000));
    let count=0,measuredSessions=0,minutes=0;
    const days=new Set();
    /** @type {Map<string,{sport:string,sessions:number,minutes:number|null,measuredSessions:number}>} */ const sports=new Map();
    for(const row of loadedSessions){
      if(typeof row.date!=='string'||!day(row.date.slice(0,10))||!/(?:Z|[+-]\d{2}:\d{2})$/.test(row.date))continue;
      const timestamp=Date.parse(row.date);
      if(!Number.isFinite(timestamp)||timestamp>now)continue;
      const date=new Date(timestamp).toISOString().slice(0,10);
      if(date<from||date>to)continue;
      const sport=sportOf(row.sport),duration=minutesOf(row);
      count++;days.add(date);
      if(duration!==null){minutes+=duration;measuredSessions++;}
      const entry=sports.get(sport)||{sport,sessions:0,minutes:null,measuredSessions:0};
      entry.sessions++;
      if(duration!==null){entry.minutes=(entry.minutes??0)+duration;entry.measuredSessions++;}
      sports.set(sport,entry);
    }
    let due=0,completed=0,validTasks=0;
    for(const row of loadedTasks){
      const date=day(row.planned_date);
      if(!date||!['proposed','accepted','completed','declined','cancelled'].includes(String(row.status)))continue;
      validTasks++;
      if(date<from||date>to||date>=today||!['accepted','completed'].includes(String(row.status)))continue;
      due++;if(row.status==='completed')completed++;
    }
    const sessionComplete=complete(sessions.total,count)&&loadedSessions.length===sessions.rows.length;
    const assignmentComplete=complete(assignments.total,validTasks)&&loadedTasks.length===assignments.rows.length;
    return {available:/** @type {const} */(true),from,to,timezone:'UTC',sessions:count,minutes:measuredSessions?Math.round(minutes*100)/100:null,
      measuredSessions,missingDuration:count-measuredSessions,activeDays:days.size,
      sports:[...sports.values()].sort((a,b)=>b.sessions-a.sessions||a.sport.localeCompare(b.sport)),
      sessionLoaded:loadedSessions.length,sessionTotal:numeric(sessions.total)?sessions.total:null,sessionComplete,
      assignmentLoaded:loadedTasks.length,assignmentTotal:numeric(assignments.total)?assignments.total:null,assignmentComplete,
      due,completed,adherencePercent:assignmentComplete&&due>0?Math.round(completed/due*100):null};
  }
  /** Compare only fully covered, adjacent seven-day windows. No additional access or persistence.
   * @param {Parameters<typeof analyse>[0]} input */
  function compare(input){
    if(!day(input.sessions?.from_date)||!day(input.sessions?.to_date))return {available:false,reason:'scope'};
    const all=analyse(input);
    if(!all.available)return {available:false,reason:'scope'};
    if(!all.sessionComplete||!all.assignmentComplete||all.sessionLoaded!==all.sessionTotal||all.assignmentLoaded!==all.assignmentTotal)return {available:false,reason:'incomplete'};
    const now=Date.parse(input.now||new Date().toISOString());
    const yesterday=new Date(Date.parse(new Date(now).toISOString().slice(0,10)+'T00:00:00Z')-86400000).toISOString().slice(0,10);
    const end=all.to<yesterday?all.to:yesterday;
    /** @param {string} date @param {number} offset */
    const shift=(date,offset)=>new Date(Date.parse(date+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
    const start=shift(end,-13);
    if(start<all.from)return {available:false,reason:'short'};
    /** @param {string} from @param {string} to */
    function period(from,to){
      const rows=(input.sessions?.rows||[]).filter(r=>{
        const date=new Date(String(r.date)).toISOString().slice(0,10);
        return date>=from&&date<=to;
      });
      const tasks=(input.assignments?.rows||[]).filter(r=>String(r.planned_date)>=from&&String(r.planned_date)<=to);
      return analyse({...input,from,to,now:new Date(now).toISOString(),sessions:{rows,total:rows.length,from_date:from,to_date:to},assignments:{rows:tasks,total:tasks.length}});
    }
    const previous=period(start,shift(end,-7)),current=period(shift(end,-6),end);
    if(!previous.available||!current.available)return {available:false,reason:'scope'};
    /** @param {{sessions:number,minutes:number|null,measuredSessions:number}} a @param {{sessions:number,minutes:number|null,measuredSessions:number}} b */
    const durationDelta=(a,b)=>a.measuredSessions===a.sessions&&b.measuredSessions===b.sessions?Math.round(((a.minutes??0)-(b.minutes??0))*100)/100:null;
    const empty={sessions:0,minutes:null,measuredSessions:0};
    const sports=[...new Set([...current.sports,...previous.sports].map(s=>s.sport))].sort().map(sport=>{
      const c=current.sports.find(s=>s.sport===sport)||empty,p=previous.sports.find(s=>s.sport===sport)||empty;
      return {sport,current:c,previous:p,delta:{sessions:c.sessions-p.sessions,minutes:durationDelta(c,p)}};
    });
    return {available:true,previous,current,sports,delta:{sessions:current.sessions-previous.sessions,activeDays:current.activeDays-previous.activeDays,
      minutes:durationDelta(current,previous),adherencePoints:current.adherencePercent!==null&&previous.adherencePercent!==null?current.adherencePercent-previous.adherencePercent:null}};
  }
  const api={analyse,compare};
  /** @type {any} */(root).TitanCoachAnalysis=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
