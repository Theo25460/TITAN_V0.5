/* V1.5.5 — Chroniques et aventures rejouables. The chronicle of a world's first arc (Carnet view, #chroniques) and the new run of
   an arc already achieved. Server-owned: titan_adventure_chronicles_v1 returns every run (run 1 read from the facts of the arcs,
   the new runs from their own table), titan_adventure_chronicle_action_v1 starts, chooses, advances, solves, resolves or abandons
   the single active run. Nothing optimistic, nothing stored on the device but the route or answer selected before its explicit
   confirmation. No XP, no credits, no reward. Offline: nothing is sent; back online, the server state is read again. */
(function(root){
 'use strict';
 let owner=null,generation=0,api=true,payload=null,pending=null;
 const selection=new Map(),notice=new Map(),opened=new Set(),readSent=new Set(),abandoning=new Set(),hosts=new Set();
 const esc=s=>root.titanEsc(String(s??''));
 const C=()=>root.TitanAdventureChronicles;
 const currentOwner=()=>root.state?.user?.id;
 const isGuest=id=>!id||String(id).startsWith('guest_');
 const missing=error=>error?.code==='PGRST202'||/Could not find the function/.test(error?.message||'');
 const message=e=>(e?.message==='AUTH_REQUIRED'?'Reconnecte-toi pour retrouver tes chroniques.':C()?.errorText(e?.message))||'Les chroniques sont indisponibles pour le moment. Tes parties sont conservées.';
 const empty=id=>({contract:1,owner:id,rules:1,arcs:[]});
 function reset(){owner=null;generation++;payload=null;pending=null;selection.clear();notice.clear();opened.clear();readSent.clear();abandoning.clear();
  document.querySelectorAll('[data-chronicle-host]').forEach(el=>el.replaceChildren());}
 async function rpc(name,params,token){
  let timer;
  try{return await Promise.race([root.titanClient.rpc(name,params).setHeader('Authorization',`Bearer ${token}`),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RPG_TIMEOUT')),15000);})]);}
  finally{clearTimeout(timer);}
 }
 async function call(world=null,action=null,params={}){
  const id=currentOwner();if(isGuest(id))throw Error('AUTH_REQUIRED');
  if(owner!==id){payload=null;selection.clear();notice.clear();opened.clear();readSent.clear();abandoning.clear();owner=id;generation++;}
  if(action&&root.navigator?.onLine===false)throw Error('RPG_OFFLINE');
  // Server without the V1.5.5 migration: no chronicle and no replay, nothing breaks.
  if(!api){if(action)throw Error('CHRONICLE_UNAVAILABLE');return (payload=empty(id));}
  const epoch=generation,session=(await root.titanClient?.auth.getSession())?.data?.session;
  if(session?.user?.id!==id||currentOwner()!==id)throw Error('AUTH_REQUIRED');
  const {data,error}=await rpc(action?'titan_adventure_chronicle_action_v1':'titan_adventure_chronicles_v1',
   action?{p_world:world,p_action:action,p_run:params.run??null,p_route:params.route??null,p_step:params.step??null,p_answer:params.answer??null}:{},session.access_token);
  if(error){if(missing(error)){api=false;if(action)throw Error('CHRONICLE_UNAVAILABLE');return (payload=empty(id));}throw Error(error.message);}
  if(epoch!==generation||currentOwner()!==id||data?.owner!==id||!Array.isArray(data?.arcs))throw Error('ACCOUNT_CHANGED');
  payload=data;return data;
 }
 /** The chronicle, read once per page and owner. */
 function load({fresh=false}={}){
  const id=currentOwner();if(isGuest(id))return Promise.resolve(empty(id));
  if(!fresh&&payload&&owner===id)return Promise.resolve(payload);
  if(!pending)pending=call().finally(()=>{pending=null;});
  return pending;
 }
 const sel=world=>selection.get(world)||{};
 function actionHtml(world,r){
  const a=r.action;if(!a)return '';
  if(a.kind==='choose'){
   let h=`<h4>${esc(a.title)}</h4><div class="av-branch-routes">${a.routes.map(x=>`<article class="av-branch-route${x.selected?' is-followed':''}" data-chronicle-route="${esc(x.id)}"><p class="asc-eyebrow">${esc(x.tag)}</p><h4>${esc(x.label)}</h4><p>${esc(x.reveals)}</p>${a.confirm?'':`<button class="asc-btn asc-btn-secondary" type="button" data-chronicle-action="select" data-chronicle-route="${esc(x.id)}">${esc(x.select)}</button>`}</article>`).join('')}</div>`;
   if(a.confirm)h+=`<div class="av-branch-confirm" role="group" aria-labelledby="chronique-confirm-${esc(world)}"><h4 id="chronique-confirm-${esc(world)}">${esc(a.confirm.title)}</h4><p>${esc(a.confirm.body)}</p>
    <button class="asc-btn asc-btn-primary" type="button" data-chronicle-action="choose" data-chronicle-route="${esc(a.confirm.id)}">${esc(a.confirm.label)}</button>
    <button class="asc-btn asc-btn-ghost" type="button" data-chronicle-action="back">${esc(a.confirm.back)}</button></div>`;
   return h;
  }
  const progress=(x,act,attrs)=>`<p class="asc-small" data-chronicle-progress>${esc(x.progress)} · ${esc(x.readyText)}</p><p class="asc-small asc-muted">${esc(x.pending)}</p>
   <div class="asc-row-flex"><button class="asc-btn asc-btn-primary" type="button" data-chronicle-action="${act}" ${attrs} ${x.ready?'':'disabled'}>${esc(x.label)}</button>${x.ready?'':`<button class="asc-btn asc-btn-ghost" type="button" data-chronicle-action="sync">${esc(C().t('refresh'))}</button>`}</div>`;
  if(a.kind==='advance')return `<article class="av-rpg-scene av-chronique-step" data-chronicle-step="${esc(a.step)}"><p class="asc-eyebrow">${esc(a.title)}</p><h4>${esc(a.name)}</h4><p>${esc(a.teaser)}</p>${progress(a,'advance',`data-chronicle-step="${esc(a.step)}"`)}</article>`;
  if(a.kind==='resolve')return `<article class="av-rpg-scene av-chronique-step" data-chronicle-step="resolve"><p class="asc-eyebrow">${esc(a.title)}</p><h4>${esc(a.name)}</h4>
   <p class="av-guardian-feedback is-right" data-chronicle-feedback="right">${esc(a.feedback.text)}</p>${progress(a,'resolve','')}</article>`;
  if(a.kind==='solve'){
   const chosen=sel(world).answer||[];
   return `<article class="av-rpg-scene av-chronique-step" data-chronicle-step="prepare"><p class="asc-eyebrow">${esc(a.title)}</p><p>${esc(a.text)}</p>${a.attempts?`<p class="asc-small" data-chronicle-attempts>${esc(a.attempts)}</p>`:''}
    ${a.feedback?`<p class="av-guardian-feedback is-wrong" data-chronicle-feedback="wrong">${esc(a.feedback.text)}</p>`:''}
    ${a.slots.map((sl,i)=>`<fieldset class="av-chronique-slot" data-chronicle-slot="${esc(sl.id)}"><legend>${esc(sl.label)}</legend><div class="asc-row-flex">${sl.tokens.map(tk=>`<button class="asc-btn ${chosen[i]===tk.id?'asc-btn-primary':'asc-btn-secondary'}" type="button" aria-pressed="${chosen[i]===tk.id}" data-chronicle-action="pick" data-chronicle-slot-index="${i}" data-chronicle-token="${esc(tk.id)}">${esc(tk.name)}</button>`).join('')}</div></fieldset>`).join('')}
    <button class="asc-btn asc-btn-primary" type="button" data-chronicle-action="solve" ${a.slots.every((_,i)=>chosen[i])?'':'disabled'}>${esc(a.submit)}</button>
    <p class="asc-small asc-muted">${esc(a.slots.every((_,i)=>chosen[i])?a.free:a.incomplete)}</p></article>`;
  }
  return '';
 }
 function runHtml(world,r,last){
  const open=r.active||opened.has(`${world}:${r.run}`)||(last&&!opened.has(`${world}:closed:${r.run}`));
  const entries=r.entries.length?`<ol class="av-chronique-entries">${r.entries.map(e=>`<li data-chronicle-entry="${esc(e.kind)}"><time datetime="${esc(e.at)}">${esc(e.date)}</time><strong>${esc(e.title)}</strong>${e.text?`<p>${esc(e.text)}</p>`:''}</li>`).join('')}</ol>`:`<p class="asc-small asc-muted">${esc(r.empty)}</p>`;
  const abandon=r.abandon?(abandoning.has(world)?`<div class="av-branch-confirm" role="group" aria-labelledby="chronique-abandon-${esc(world)}"><h4 id="chronique-abandon-${esc(world)}">${esc(r.abandon.title)}</h4><p>${esc(r.abandon.body)}</p>
    <button class="asc-btn asc-btn-secondary" type="button" data-chronicle-action="abandon" data-chronicle-run="${r.run}">${esc(r.abandon.confirm)}</button>
    <button class="asc-btn asc-btn-ghost" type="button" data-chronicle-action="keep">${esc(r.abandon.back)}</button></div>`
    :`<button class="asc-btn asc-btn-ghost" type="button" data-chronicle-action="ask-abandon">${esc(r.abandon.label)}</button>`):'';
  return `<details class="av-chronique-run" id="${esc(`partie-${world}-${r.run}`)}" data-chronicle-run="${r.run}" data-chronicle-kind="${esc(r.kind)}" data-chronicle-state="${esc(r.active?'active':r.state)}"${open?' open':''}>
   <summary><strong>${esc(r.heading)}</strong> · ${esc(r.label)}${r.version?` · ${esc(r.version)}`:''} · <span data-chronicle-state-label>${esc(r.stateLabel)}</span></summary>
   ${r.unknown?`<p class="asc-small">${esc(r.unknownText)}</p>`:''}${entries}${actionHtml(world,r)}${abandon}</details>`;
 }
 function chronicleHtml(world){
  const v=C().view(payload,world,'fr',{},sel(world));
  const n=notice.get(world);
  if(v.state==='empty')return `<h2 class="asc-h2" id="chroniques-title" tabindex="-1">${esc(v.title)}</h2><p class="asc-small asc-muted" data-chronicle-empty>${esc(v.empty)}</p>`;
  return `<h2 class="asc-h2" id="chroniques-title" tabindex="-1">${esc(v.title)}</h2><p>${esc(v.intro)}</p>
   <p class="asc-eyebrow">${esc(v.eyebrow)}</p><h3>${esc(v.arcTitle)}</h3>
   <p class="av-chronique-active" data-chronicle-active>${esc(v.active)}</p>
   <h4>${esc(v.discoveredTitle)}</h4><ul class="av-chronique-discovered">${v.discovered.map(d=>`<li data-chronicle-discovered="${esc(d.route)}" data-scene="${d.scene}" data-outcome="${d.outcome}">${esc(d.text)}</li>`).join('')}</ul>
   <div class="av-chronique-runs">${v.runs.map((r,i)=>runHtml(world,r,i===v.runs.length-1)).join('')}</div>
   ${v.start?`<div class="av-chronique-start"><button class="asc-btn asc-btn-primary" type="button" data-chronicle-action="start">${esc(v.start.label)}</button><p class="asc-small asc-muted">${esc(v.start.note)}</p></div>`:v.locked?`<p class="asc-small asc-muted" data-chronicle-locked>${esc(v.locked)}</p>`:''}
   ${n?`<p class="av-retour-feedback is-wrong" data-chronicle-notice>${esc(n)}</p>`:''}
   <p class="asc-small asc-muted">${esc(v.rules)}</p><p class="asc-small asc-muted">${esc(v.privacy)}</p><p role="status" class="sr-only" data-chronicle-status></p>`;
 }
 function paint(){
  for(const host of [...hosts]){
   if(!host.isConnected){hosts.delete(host);continue;}
   if(host.dataset.owner!==currentOwner())continue;
   // Nothing at all without a journey in this world or without the V1.5.5 server.
   const has=payload?.arcs?.some(a=>a.world===host.dataset.world);
   host.hidden=!has;host.innerHTML=has?chronicleHtml(host.dataset.world):'';
  }
 }
 function focus(id){
  const el=document.getElementById(id)||document.getElementById('chroniques');if(!el)return;
  el.scrollIntoView({block:'start'});
  (el.id==='chroniques'?document.getElementById('chroniques-title'):el.querySelector('summary')||el)?.focus({preventScroll:true});
 }
 // Measurement only: a story reopened. Never blocks, never retried, nothing changes in the game.
 function read(world,run){
  const k=`${world}:${run}`;if(readSent.has(k)||root.navigator?.onLine===false)return;readSent.add(k);
  call(world,'read',{run}).then(()=>{}).catch(()=>{});
 }
 function bind(host){
  if(host.dataset.bound)return;host.dataset.bound='true';
  // A story reopened by the player (a tap on its heading, not a render): remembered for this page, and measured once.
  host.addEventListener('click',event=>{
   const summary=event.target.closest('summary');const d=summary?.parentElement;if(!d?.dataset.chronicleRun)return;
   const world=host.dataset.world,run=Number(d.dataset.chronicleRun);
   root.setTimeout(()=>{
    if(d.open){opened.add(`${world}:${run}`);opened.delete(`${world}:closed:${run}`);if(d.dataset.chronicleState!=='active')read(world,run);}
    else{opened.delete(`${world}:${run}`);opened.add(`${world}:closed:${run}`);}
   },0);
  });
  host.addEventListener('click',async event=>{
   const button=event.target.closest('[data-chronicle-action]');if(!button||button.disabled||host.getAttribute('aria-busy')==='true')return;
   const world=host.dataset.world,act=button.dataset.chronicleAction,s={...sel(world)};
   // Local until the explicit confirmation: nothing is sent.
   if(['select','back','pick','ask-abandon','keep'].includes(act)){
    if(act==='select')s.route=button.dataset.chronicleRoute;
    if(act==='back')delete s.route;
    if(act==='pick'){const a=[...(s.answer||[])];a[Number(button.dataset.chronicleSlotIndex)]=button.dataset.chronicleToken;s.answer=a;}
    if(act==='ask-abandon')abandoning.add(world);if(act==='keep')abandoning.delete(world);
    selection.set(world,s);notice.delete(world);paint();
    const next={select:'[data-chronicle-action="choose"]',back:'[data-chronicle-action="select"]',pick:`[data-chronicle-token="${button.dataset.chronicleToken}"][data-chronicle-slot-index="${button.dataset.chronicleSlotIndex}"]`,
     'ask-abandon':'[data-chronicle-action="abandon"]',keep:'[data-chronicle-action="ask-abandon"]'}[act];
    host.querySelector(next)?.focus();return;
   }
   host.setAttribute('aria-busy','true');host.querySelectorAll('button').forEach(b=>b.disabled=true);
   const params={run:button.dataset.chronicleRun?Number(button.dataset.chronicleRun):null,route:act==='choose'?button.dataset.chronicleRoute:null,
    step:act==='advance'?button.dataset.chronicleStep:null,answer:act==='solve'?s.answer:null};
   try{
    const data=await call(world,act,params);
    selection.delete(world);abandoning.delete(world);
    notice.set(world,act==='choose'?C().conflict(params.route,data,world):'');paint();
    const status=host.querySelector('[data-chronicle-status]'),active=host.querySelector('[data-chronicle-state="active"]')||host.querySelector('.av-chronique-run:last-of-type');
    const text=active?.querySelector('[data-chronicle-feedback],.av-chronique-step h4,li:last-child strong')?.textContent||'';
    if(status)status.textContent=[notice.get(world),text].filter(Boolean).join(' ');
    (active?.querySelector('summary')||host.querySelector('#chroniques-title'))?.focus({preventScroll:true});
   }catch(e){
    if(act==='solve'||act==='choose')selection.delete(world);abandoning.delete(world);
    notice.set(world,message(e));paint();
    const status=host.querySelector('[data-chronicle-status]');if(status)status.textContent=notice.get(world);
    host.querySelector('#chroniques-title')?.focus({preventScroll:true});
   }finally{host.setAttribute('aria-busy','false');}
  });
 }
 async function mount(host,world){
  if(!C()||!host)return;
  const id=currentOwner();
  host.dataset.owner=id||'';host.dataset.world=world;
  if(isGuest(id)){host.replaceChildren();host.hidden=true;return;}
  hosts.add(host);bind(host);paint();
  try{await load();}catch(e){host.hidden=false;host.innerHTML=`<p role="status">${esc(message(e))}</p>`;return;}
  paint();
  // Arrival on the chronicle (/adventure?world=aube#chroniques) or on one run (#partie-aube-2): it is the first thing shown.
  const hash=root.location?.hash||'';
  if(/^#(chroniques|partie-[a-z]+-\d+)$/.test(hash)&&!host.dataset.arrived&&!host.hidden){
   host.dataset.arrived='true';const el=document.getElementById(hash.slice(1));if(el?.tagName==='DETAILS')el.open=true;focus(hash.slice(1));
  }
 }
 // Back online (or another device moved the run meanwhile): re-read the canonical server state, never replay an action.
 async function resume(){
  try{await load({fresh:true});}catch{return;}
  for(const [k,v] of notice)if(v===message({message:'RPG_OFFLINE'}))notice.delete(k);
  paint();
 }
 root.TitanChroniclePanel={mount,reset,resume,load};
 root.addEventListener('titan:account-changing',reset);root.addEventListener('online',resume);
})(window);
