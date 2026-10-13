/* TITAN — strict private preset contracts; only relative parameters, never results. */
(function (root) {
  'use strict';
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const keys=(v,expected)=>object(v)&&Object.keys(v).sort().join(',')===expected.slice().sort().join(',');
  const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
  const integer=v=>Number.isSafeInteger(v)&&v>=0;
  function name(v) {
    if(typeof v!=='string'||/[\u0000-\u001f\u007f]/.test(v))return null;
    const clean=v.replace(/^ +| +$/g,'');
    return Array.from(clean).length>=1&&Array.from(clean).length<=40?clean:null;
  }
  function validOptions(kind,v) {
    if(kind==='report')return keys(v,['period','offset'])&&['month','year'].includes(v.period)&&[0,1].includes(v.offset);
    if(kind==='comparison')return keys(v,['weeks','sport'])&&[4,12,26].includes(v.weeks)
      &&(v.sport===null||typeof v.sport==='string'&&root.TitanSports.all().some(s=>s.id===v.sport));
    return false;
  }
  function stamp(v) {
    return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v))
      &&new Date(v.slice(0,10)+'T12:00:00Z').toISOString().slice(0,10)===v.slice(0,10);
  }
  // Date.parse truncates PostgreSQL's microseconds; retain them before checking ties.
  const time=v=>BigInt(Date.parse(v))*1000n+BigInt((v.match(/\.(\d+)/)?.[1]||'').padEnd(6,'0').slice(3,6));
  function validView(v) {
    return keys(v,['id','name','kind','options','revision','created_at','updated_at'])&&uuid(v.id)&&name(v.name)===v.name
      &&validOptions(v.kind,v.options)&&integer(v.revision)&&v.revision>=1&&v.revision<=2147483647
      &&stamp(v.created_at)&&stamp(v.updated_at)&&time(v.updated_at)>=time(v.created_at);
  }
  function validList(j,owner,id=null) {
    if(!keys(j,['version','owner','available','limit','count','views',...(j?.available===false?['reason']:[])])||j.version!==1||j.owner!==owner
      ||typeof j.available!=='boolean'||j.available===false&&j.reason!=='premium_required'||j.limit!==10
      ||!integer(j.count)||j.count>10||!Array.isArray(j.views)||j.views.length>10||j.views.length>j.count
      ||(!id&&j.views.length!==j.count)||(id&&j.views.length>1))return false;
    const seen=new Set();let previous=null;
    for(const v of j.views){
      if(!validView(v)||seen.has(v.id)||(id&&v.id!==id))return false;
      if(previous&&(time(previous.updated_at)<time(v.updated_at)
        ||time(previous.updated_at)===time(v.updated_at)&&previous.id>v.id))return false;
      seen.add(v.id);previous=v;
    }
    return true;
  }
  function equalOptions(kind,a,b) {
    return validOptions(kind,a)&&validOptions(kind,b)&&(kind==='report'?a.period===b.period&&a.offset===b.offset:a.weeks===b.weeks&&a.sport===b.sport);
  }
  function validReceipt(j,owner,p) {
    if(!j||j.version!==1||j.owner!==owner||j.action!==p.p_action)return false;
    if(p.p_action==='delete')return keys(j,['version','owner','action','deleted_id'])&&j.deleted_id===p.p_id&&uuid(j.deleted_id);
    return keys(j,['version','owner','action','view'])&&validView(j.view)&&j.view.id===p.p_id&&j.view.name===name(p.p_name)
      &&j.view.kind===p.p_kind&&equalOptions(j.view.kind,j.view.options,p.p_options)&&j.view.revision===p.p_expected_revision+1;
  }
  function describe(kind,v,label=id=>root.TitanSports.label(id)) {
    if(kind==='report')return (v.period==='month'?['Ce mois','Mois précédent']:['Cette année','Année précédente'])[v.offset];
    return `${v.weeks} semaines · ${v.sport===null?'Tous les sports':label(v.sport)}`;
  }
  root.TitanAnalysisViews={name,validOptions,validView,validList,validReceipt,describe};
})(typeof window!=='undefined'?window:globalThis);
