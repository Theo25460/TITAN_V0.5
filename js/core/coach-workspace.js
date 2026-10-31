/* Coach workspace: consent-scoped presentation and allowlisted CSV. No network or persistence. */
(function(root){
  'use strict';
  /** @typedef {{id:string,coach_id:string,athlete_id:string,athlete_name?:string,sport?:string|null,since_date?:string,revision?:number,revoked_at?:string|null}} Link */
  /** @typedef {{id:string,planned_date:string,status:string,title?:string,sport?:string}} Task */
  /** @typedef {{id:string,date:string,sport:string,val:number,unit:string,details?:{duration?:unknown}}} Session */
  const statuses=['proposed','accepted','completed','declined','cancelled'];
  /** @param {unknown} value */
  function day(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
    const n=Date.parse(value+'T12:00:00Z');
    return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?value:null;
  }
  /** @param {unknown} value */
  const normalize=value=>typeof value==='string'?value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim():'';
  /** @param {{links:Link[],owner:string,query?:string,sport?:string}} input */
  function roster({links,owner,query='',sport=''}){
    const seen=new Set(),q=normalize(query);
    return (Array.isArray(links)?links:[]).filter(l=>{
      if(!l||typeof l.id!=='string'||!l.id||l.coach_id!==owner||typeof l.athlete_id!=='string'||!l.athlete_id||l.revoked_at||seen.has(l.id))return false;
      seen.add(l.id);
      return (!q||normalize(l.athlete_name).includes(q))&&(!sport||!l.sport||l.sport===sport);
    }).sort((a,b)=>String(a.athlete_name||'Compte TITAN').localeCompare(String(b.athlete_name||'Compte TITAN'),'fr')||a.id.localeCompare(b.id));
  }
  /** @param {unknown} value */
  function monthValue(value){return typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&Number(value.slice(0,4))>=2000?value:null;}
  /** @param {string} month @param {number} offset */
  function shiftMonth(month,offset){
    if(!monthValue(month)||!Number.isInteger(offset)||Math.abs(offset)>12)return null;
    const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+offset);
    return monthValue(d.toISOString().slice(0,7));
  }
  /** @param {{assignments:{rows:Task[],total:number}|null,month:string,status?:string}} input */
  function calendar({assignments,month,status=''}){
    if(!monthValue(month)||status&&!statuses.includes(status)||!Array.isArray(assignments?.rows))return {available:/** @type {const} */(false)};
    const seen=new Set();
    const valid=assignments.rows.slice(0,10000).filter(t=>{
      if(!t||typeof t.id!=='string'||!t.id||seen.has(t.id)||!day(t.planned_date)||!statuses.includes(t.status))return false;
      seen.add(t.id);return true;
    });
    /** @type {Map<string,Task[]>} */ const groups=new Map();
    for(const t of valid.filter(t=>t.planned_date.startsWith(month+'-')&&(!status||t.status===status)).sort((a,b)=>a.planned_date.localeCompare(b.planned_date)||a.id.localeCompare(b.id))){
      const list=groups.get(t.planned_date)||[];list.push(t);groups.set(t.planned_date,list);
    }
    const total=Number.isSafeInteger(assignments.total)&&assignments.total>=0?assignments.total:null;
    return {available:/** @type {const} */(true),month,loaded:assignments.rows.length,total,complete:valid.length===assignments.rows.length&&valid.length===total,
      days:[...groups].map(([date,rows])=>({date,rows}))};
  }
  /** @param {string|number} value */
  function cell(value){
    let s=String(value).replace(/\u0000/g,'');
    if(typeof value==='string'&&(/^[\s\u0000-\u001f]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s)))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }
  /** @param {{sessions:{owner?:string,link_id?:string,revision?:number,from_date?:string,to_date?:string,rows:Session[],total:number}|null,owner:string,linkId:string,revision:number,from:string,to:string,now?:string}} input */
  function csv({sessions,owner,linkId,revision,from,to,now=new Date().toISOString()}){
    const start=day(sessions?.from_date),end=day(sessions?.to_date),stamp=Date.parse(now);
    if(!owner||!linkId||!Number.isSafeInteger(revision)||sessions?.owner!==owner||sessions.link_id!==linkId||sessions.revision!==revision||!start||!end||!day(from)||!day(to)||start<from||end>to||start>end||!Number.isFinite(stamp)||(Date.parse(end)-Date.parse(start))/86400000>366||!Array.isArray(sessions.rows)||sessions.rows.length>10000||sessions.total!==sessions.rows.length)return {available:/** @type {const} */(false)};
    const seen=new Set();
    /** @type {(string|number)[][]} */ const rows=[];
    for(const r of sessions.rows){
      if(!r||typeof r.id!=='string'||!r.id||seen.has(r.id)||typeof r.date!=='string'||!day(r.date.slice(0,10))||!/(?:Z|[+-]\d{2}:\d{2})$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||Date.parse(r.date)>stamp||typeof r.val!=='number'||!Number.isFinite(r.val)||r.val<0||typeof r.sport!=='string'||r.sport.length>80||typeof r.unit!=='string'||r.unit.length>80)return {available:/** @type {const} */(false)};
      seen.add(r.id);
      const date=new Date(r.date).toISOString(),d=date.slice(0,10);
      if(d<start||d>end)return {available:/** @type {const} */(false)};
      const explicit=r.details?.duration;
      const minutes=explicit!==null&&explicit!==undefined?explicit:r.unit==='min'?r.val:r.unit==='h'?r.val*60:null;
      const duration=typeof minutes==='number'&&Number.isFinite(minutes)&&minutes>=0&&minutes<=525600?minutes:'';
      rows.push([date,r.sport,r.val,r.unit,duration,start,end,'journal partagé']);
    }
    rows.sort((a,b)=>String(a[0]).localeCompare(String(b[0]))||String(a[1]).localeCompare(String(b[1])));
    const header=['date_utc','sport','valeur','unite','duree_minutes','periode_debut_utc','periode_fin_utc','source'];
    return {available:/** @type {const} */(true),from:start,to:end,count:rows.length,text:'\uFEFF'+[header,...rows].map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n'};
  }
  const api={roster,calendar,shiftMonth,csv};
  /** @type {any} */(root).TitanCoachWorkspace=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
