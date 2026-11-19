/* V1.5.4 — Quêtes entre les mondes. The notebook of clues (Carnet view of every world) and its access from the map. Server-owned:
   titan_adventure_quests_v1 lists the chains and the clues the account holds (each with its origin, state and destination),
   titan_adventure_quest_action_v1 starts a chain, links its clue, records the manner once, resolves the next encounter. Nothing
   optimistic, nothing stored on the device but the manner selected before its confirmation. No XP, no credits, no effort. */
(function(root){
 'use strict';
 let owner=null,generation=0,api=true,payload=null,pending=null; const selection=new Map(),notice=new Map(),hosts=new Set(),maps=new Set();
 const esc=s=>root.titanEsc(String(s??''));
 const Q=()=>root.TitanAdventureQuests;
 const currentOwner=()=>root.state?.user?.id;
 const isGuest=id=>!id||String(id).startsWith('guest_');
 const missing=error=>error?.code==='PGRST202'||/Could not find the function/.test(error?.message||'');
 const message=e=>(e?.message==='AUTH_REQUIRED'?'Reconnecte-toi pour retrouver ton carnet.':Q()?.errorText(e?.message))||'Le carnet est indisponible pour le moment. Tes indices sont conservés.';
 const empty=id=>({contract:1,owner:id,chains:[],clues:[]});
 function reset(){owner=null;generation++;payload=null;pending=null;selection.clear();notice.clear();
  document.querySelectorAll('[data-quest-host],[data-quest-map]').forEach(el=>el.replaceChildren());}
 async function rpc(name,params,token){
  let timer;
  try{return await Promise.race([root.titanClient.rpc(name,params).setHeader('Authorization',`Bearer ${token}`),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RPG_TIMEOUT')),15000);})]);}
  finally{clearTimeout(timer);}
 }
 async function call(chain=null,action=null,answer=null,manner=null){
  const id=currentOwner();if(isGuest(id))throw Error('AUTH_REQUIRED');
  if(owner!==id){payload=null;selection.clear();notice.clear();owner=id;generation++;}
  if(action&&root.navigator?.onLine===false)throw Error('RPG_OFFLINE');
  // Server without the V1.5.4 migration: no notebook and no map access, nothing breaks.
  if(!api){if(action)throw Error('QUEST_UNAVAILABLE');return (payload=empty(id));}
  const epoch=generation,session=(await root.titanClient?.auth.getSession())?.data?.session;
  if(session?.user?.id!==id||currentOwner()!==id)throw Error('AUTH_REQUIRED');
  const {data,error}=await rpc(action?'titan_adventure_quest_action_v1':'titan_adventure_quests_v1',
   action?{p_chain:chain,p_action:action,p_answer:answer,p_manner:manner}:{},session.access_token);
  if(error){if(missing(error)){api=false;if(action)throw Error('QUEST_UNAVAILABLE');return (payload=empty(id));}throw Error(error.message);}
  if(epoch!==generation||currentOwner()!==id||data?.owner!==id||!Array.isArray(data?.chains)||!Array.isArray(data?.clues))throw Error('ACCOUNT_CHANGED');
  payload=data;return data;
 }
 /** The notebook, read once per page and owner (the map and the Carnet view share it). */
 function load({fresh=false}={}){
  const id=currentOwner();if(isGuest(id))return Promise.resolve(empty(id));
  if(!fresh&&payload&&owner===id)return Promise.resolve(payload);
  if(!pending)pending=call().finally(()=>{pending=null;});
  return pending;
 }
 const item=id=>payload?.chains?.find(c=>c.id===id)||null;
 function chainHtml(v){
  if(v.state==='unknown')return `<article class="av-quest" id="${esc(`quete-${v.id}`)}" tabindex="-1" data-quest-chain="${esc(v.id)}" data-quest-state="unknown"><h3>${esc(v.title)}</h3><p>${esc(v.text)}</p></article>`;
  const a=v.action,fb=v.feedback;
  let body='';
  if(v.state==='locked')body=`<p class="asc-small"><strong>${esc(v.opensTitle)}</strong></p><ul class="av-quest-opens">${v.opens.map(o=>`<li data-quest-opens="${esc(o.id)}"><strong>${esc(o.name)}</strong> · ${esc(o.how)}<br><small>${esc(o.origin)}</small></li>`).join('')}</ul>`;
  else body=`<article class="av-quest-clue" data-quest-entry="${esc(v.clue?.id)}"><p class="asc-eyebrow">${esc(v.found)}</p><p>${esc(v.clue?.text)}</p></article>`;
  if(fb)body+=`<p class="av-guardian-feedback ${fb.correct?'is-right':'is-wrong'}" data-quest-feedback="${fb.correct?'right':'wrong'}">${esc(fb.text)}</p>`;
  if(a?.kind==='start')body+=`<button class="asc-btn asc-btn-primary" type="button" data-quest-action="start" data-quest-id="${esc(v.id)}">${esc(a.label)}</button><p class="asc-small asc-muted">${esc(a.note)}</p>`;
  if(a?.kind==='link')body+=`<h4>${esc(a.title)}</h4>${v.attemptsText?`<p class="asc-small" data-quest-attempts>${esc(v.attemptsText)}</p>`:''}<ul class="av-quest-marks" aria-label="${esc(a.title)}">${a.marks.map(m=>`<li data-quest-mark="${esc(m.id)}"${m.last?' class="is-chosen"':''}><p><strong>${esc(m.name)}</strong> · ${esc(m.text)}</p><button class="asc-btn asc-btn-secondary" type="button" data-quest-action="link" data-quest-id="${esc(v.id)}" data-quest-answer="${esc(m.id)}">${esc(m.label)}</button></li>`).join('')}</ul><p class="asc-small asc-muted">${esc(a.note)}</p>`;
  if(v.scene)body+=`<article class="av-quest-scene" data-quest-scene><h4>${esc(v.scene.name)}</h4><p>${esc(v.scene.story)}</p></article>`;
  if(a?.kind==='choose'){
   body+=`<h4>${esc(a.title)}</h4><div class="av-branch-routes">${v.manners.map((m,i)=>`<article class="av-branch-route${m.selected?' is-followed':''}" data-quest-manner="${esc(m.id)}"><h4>${esc(m.label)}</h4><p>${esc(m.reveals)}</p>${a.confirm?'':`<button class="asc-btn asc-btn-secondary" type="button" data-quest-action="select" data-quest-id="${esc(v.id)}" data-quest-manner="${esc(m.id)}">${esc(a.select[i].label)}</button>`}</article>`).join('')}</div>`;
   if(a.confirm)body+=`<div class="av-branch-confirm" role="group" aria-labelledby="${esc(`quete-${v.id}-confirm`)}"><h4 id="${esc(`quete-${v.id}-confirm`)}">${esc(a.confirm.title)}</h4><p>${esc(a.confirm.body)}</p>
    <button class="asc-btn asc-btn-primary" type="button" data-quest-action="choose" data-quest-id="${esc(v.id)}" data-quest-manner="${esc(a.confirm.id)}">${esc(a.confirm.label)}</button>
    <button class="asc-btn asc-btn-ghost" type="button" data-quest-action="back" data-quest-id="${esc(v.id)}">${esc(a.confirm.back)}</button></div>`;
  }
  if(v.encounter){
   const e=v.encounter;
   body+=`<p><strong data-quest-chosen>${esc(v.chosen)}</strong></p>${v.closed.map(c=>`<p class="asc-small asc-muted">${esc(c)}</p>`).join('')}
   <article class="av-rpg-scene av-quest-encounter" data-quest-encounter="${esc(v.manner)}"><p class="asc-eyebrow">${esc(e.title)}</p><h4>${esc(e.name)}</h4><p>${esc(e.ready?e.story:e.teaser)}</p>
   ${v.state==='resolved'?'':`<p class="asc-small" data-quest-progress>${esc(e.progress)}${v.readyText?` · ${esc(v.readyText)}`:''}</p>${v.state==='waiting'?`<p class="asc-small">${esc(e.waiting)}</p>`:''}<p class="asc-small asc-muted">${esc(e.pending)}</p>
   <button class="asc-btn asc-btn-primary" type="button" data-quest-action="resolve" data-quest-id="${esc(v.id)}" ${a?.ready?'':'disabled'}>${esc(a?.label)}</button>`}</article>`;
  }
  if(v.outcome)body+=`<article class="av-guardian-outcome" data-quest-outcome="${esc(v.outcome.id)}"><p class="asc-eyebrow">${esc(v.outcome.eyebrow)}</p><strong>${esc(v.outcome.name)}</strong><p>${esc(v.outcome.text)}</p><p class="asc-small">${esc(v.outcome.decision)}</p></article>`;
  const n=notice.get(v.id);
  return `<article class="av-quest" id="${esc(v.anchor)}" tabindex="-1" data-quest-chain="${esc(v.id)}" data-quest-state="${esc(v.state)}" aria-labelledby="${esc(`${v.anchor}-title`)}">
   <p class="asc-eyebrow">${esc(v.eyebrow)} · <span data-quest-state-label>${esc(v.stateLabel)}</span></p><h3 id="${esc(`${v.anchor}-title`)}">${esc(v.title)}</h3><p>${esc(v.intro)}</p>
   ${body}${n?`<p class="av-retour-feedback is-wrong" data-quest-notice>${esc(n)}</p>`:''}</article>`;
 }
 function notebookHtml(){
  const n=Q().notebook(payload,'fr',Object.fromEntries(selection));
  if(!n.chains.length)return '';
  return `<h2 class="asc-h2" id="indices-title" tabindex="-1">${esc(n.title)}</h2><p>${esc(n.intro)}</p><p class="asc-small" data-quest-count>${esc(n.count)}</p>
   ${n.clues.length?`<ul class="av-indices-clues" aria-label="${esc(n.title)}">${n.clues.map(c=>`<li data-quest-clue="${esc(c.id)}" data-clue-state="${esc(c.state)}"><p class="asc-eyebrow">${esc(c.stateLabel)}</p><strong>${esc(c.name)}</strong><p>${esc(c.text)}</p>
    <p class="asc-small">${esc(c.origin)}</p><p class="asc-small">${esc(c.destination)}</p><button class="asc-btn asc-btn-ghost" type="button" data-quest-goto="${esc(`quete-${c.chain}`)}">${esc(c.go)}</button></li>`).join('')}</ul>`:`<p class="asc-small asc-muted" data-quest-empty>${esc(n.empty)}</p>`}
   ${n.chains.map(chainHtml).join('')}<p class="asc-small asc-muted">${esc(n.rules)}</p><p class="asc-small asc-muted">${esc(n.privacy)}</p><p role="status" class="sr-only" data-quest-status></p>`;
 }
 /* The map of a world: one tap opens the notebook, on the chain that leaves or reaches this world when there is one. */
 function mapHtml(world){
  if(!payload?.chains?.length)return '';
  const m=Q().mapEntries(payload,world),here=m.here.find(x=>!['locked','unknown'].includes(x.state))||null;
  const target=here?here.anchor:'indices';
  const label=[m.label,m.count,...m.here.map(x=>`${x.label} (${x.stateLabel})`)].join('. ');
  return `<button type="button" class="av-map-quest" data-av-view-btn="carnet" data-av-goto data-quest-goto="${esc(target)}" aria-label="${esc(label)}"><strong>${esc(m.label)}</strong><small>${esc(m.count)}</small></button>`;
 }
 function paint(){
  for(const host of [...hosts]){if(!host.isConnected){hosts.delete(host);continue;}if(host.dataset.owner===currentOwner())host.innerHTML=payload?notebookHtml():'';}
  for(const host of [...maps]){if(!host.isConnected){maps.delete(host);continue;}if(host.dataset.owner===currentOwner())host.innerHTML=mapHtml(host.dataset.world);}
 }
 function focus(anchor){
  const el=document.getElementById(anchor)||document.getElementById('indices');if(!el)return;
  el.scrollIntoView({block:'start'});(anchor==='indices'?document.getElementById('indices-title'):el)?.focus({preventScroll:true});
 }
 function bindMap(host){
  if(host.dataset.bound)return;host.dataset.bound='true';
  // The map button also carries data-av-view-btn: the page shows the Carnet view, then the chain gets the focus.
  host.addEventListener('click',event=>{const b=event.target.closest('[data-quest-goto]');if(b)root.requestAnimationFrame(()=>focus(b.dataset.questGoto));});
 }
 function bind(host){
  if(host.dataset.bound)return;host.dataset.bound='true';
  host.addEventListener('click',async event=>{
   const goto=event.target.closest('[data-quest-goto]');if(goto){focus(goto.dataset.questGoto);return;}
   const button=event.target.closest('[data-quest-action]');if(!button||button.disabled||host.getAttribute('aria-busy')==='true')return;
   const id=button.dataset.questId,act=button.dataset.questAction,anchor=`quete-${id}`;
   // Choosing a manner is local until the explicit confirmation; nothing is sent.
   if(act==='select'||act==='back'){if(act==='select')selection.set(id,button.dataset.questManner);else selection.delete(id);notice.delete(id);paint();
    document.getElementById(anchor)?.querySelector(act==='select'?'[data-quest-action="choose"]':'[data-quest-action="select"]')?.focus();return;}
   host.setAttribute('aria-busy','true');host.querySelectorAll('button').forEach(b=>b.disabled=true);
   const requested=act==='choose'?button.dataset.questManner:null;
   try{
    const data=await call(id,act,act==='link'?[button.dataset.questAnswer]:null,requested);
    selection.delete(id);notice.set(id,act==='choose'?Q().conflict(requested,data.chains.find(c=>c.id===id)):'');paint();
    const el=document.getElementById(anchor),text=el?.querySelector('[data-quest-feedback],[data-quest-outcome] strong,[data-quest-encounter] h4')?.textContent||'';
    const status=host.querySelector('[data-quest-status]');if(status)status.textContent=[notice.get(id),text].filter(Boolean).join(' ');
    el?.focus({preventScroll:true});
   }catch(e){
    selection.delete(id);notice.set(id,message(e));paint();
    const status=host.querySelector('[data-quest-status]');if(status)status.textContent=notice.get(id);
    document.getElementById(anchor)?.focus({preventScroll:true});
   }finally{host.setAttribute('aria-busy','false');}
  });
 }
 async function mount(host,world,mapHost){
  if(!Q())return;
  const id=currentOwner();
  for(const h of [host,mapHost])if(h){h.dataset.owner=id||'';h.dataset.world=world;}
  if(isGuest(id)){host?.replaceChildren();mapHost?.replaceChildren();return;}
  if(host){hosts.add(host);bind(host);}if(mapHost){maps.add(mapHost);bindMap(mapHost);}
  paint();
  try{await load();}catch(e){if(host)host.innerHTML=`<p role="status">${esc(message(e))}</p>`;return;}
  paint();
  // Arrival on a chain (/adventure?world=forge#quete-atelier-oublie) or on the notebook (#indices): it is the first thing shown.
  const hash=root.location?.hash||'';
  if(host&&/^#(indices|quete-[a-z0-9-]+)$/.test(hash)&&!host.dataset.arrived&&document.getElementById(hash.slice(1))){host.dataset.arrived='true';focus(hash.slice(1));}
 }
 // Back online (or another device moved the chain meanwhile): re-read the canonical server state, never replay an action.
 async function resume(){
  try{await load({fresh:true});}catch{return;}
  for(const [k,v] of notice)if(v===message({message:'RPG_OFFLINE'}))notice.delete(k);
  paint();
 }
 root.TitanQuestPanel={mount,reset,resume,load,item};
 root.addEventListener('titan:account-changing',reset);root.addEventListener('online',resume);
})(window);
