/* V1.5.2 — Camp et conséquences. The lasting access that the Veilleur's canonical outcome opened in the Vallée, and the card
   that links to it from the Camp de base (the single return point). Server-owned: titan_adventure_consequences_v1 tells what is
   linked to the account, titan_adventure_consequence_action_v1 records a discovery (once) or a visit. Nothing optimistic, nothing
   stored on the device but the first landmark chosen before the second one sends the alignment. No XP, no credits, no LIVE. */
(function(root){
 'use strict';
 let owner=null,generation=0,api=true,payload=null,pending=null; const selection=new Map(),notice=new Map(),hosts=new Set();
 const esc=s=>root.titanEsc(String(s??''));
 const C=()=>root.TitanAdventureConsequence;
 const currentOwner=()=>root.state?.user?.id;
 const isGuest=id=>!id||String(id).startsWith('guest_');
 const missing=error=>error?.code==='PGRST202'||/Could not find the function/.test(error?.message||'');
 const message=e=>(e?.message==='AUTH_REQUIRED'?'Reconnecte-toi pour retrouver ton aventure.':C()?.errorText(e?.message))||'L’accès est indisponible pour le moment. Ta découverte est conservée.';
 function reset(){owner=null;generation++;payload=null;pending=null;selection.clear();notice.clear();document.querySelectorAll('[data-consequence-host]').forEach(el=>el.replaceChildren());}
 async function rpc(name,params,token){
  let timer;
  try{return await Promise.race([root.titanClient.rpc(name,params).setHeader('Authorization',`Bearer ${token}`),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RPG_TIMEOUT')),15000);})]);}
  finally{clearTimeout(timer);}
 }
 async function call(action=null,world=null,marks=null){
  const id=currentOwner();if(isGuest(id))throw Error('AUTH_REQUIRED');
  if(owner!==id){payload=null;selection.clear();notice.clear();owner=id;generation++;}
  if(action&&root.navigator?.onLine===false)throw Error('RPG_OFFLINE');
  // Server without the V1.5.2 migration: no access is shown, nothing breaks.
  if(!api){if(action)throw Error('CONSEQUENCE_UNAVAILABLE');return (payload={contract:1,owner:id,items:[]});}
  const epoch=generation,session=(await root.titanClient?.auth.getSession())?.data?.session;
  if(session?.user?.id!==id||currentOwner()!==id)throw Error('AUTH_REQUIRED');
  const {data,error}=await rpc(action?'titan_adventure_consequence_action_v1':'titan_adventure_consequences_v1',
   action?{p_world:world,p_action:action,p_marks:marks}:{},session.access_token);
  if(error){if(missing(error)){api=false;if(action)throw Error('CONSEQUENCE_UNAVAILABLE');return (payload={contract:1,owner:id,items:[]});}throw Error(error.message);}
  if(epoch!==generation||currentOwner()!==id||data?.owner!==id||!Array.isArray(data?.items))throw Error('ACCOUNT_CHANGED');
  payload=data;return data;
 }
 /** The account's linked consequences, read once per page and owner (the Camp and the Vallée share it). */
 function load({fresh=false}={}){
  const id=currentOwner();if(isGuest(id))return Promise.resolve({items:[]});
  if(!fresh&&payload&&owner===id)return Promise.resolve(payload);
  if(!pending)pending=call().finally(()=>{pending=null;});
  return pending;
 }
 /* Le Camp de base: one card per linked consequence, linking to the access in the Vallée. Nothing for other accounts. */
 function campHtml(data){
  const entries=C()?C().campEntries(data):[];
  return entries.map(e=>`<div class="live-block live-retour" data-consequence-camp="${esc(e.outcome)}" data-consequence-state="${esc(e.state)}">
   <p class="asc-eyebrow cy">${esc(e.eyebrow)}</p><h2 class="asc-h3">${esc(e.title)}</h2><p class="asc-small">${esc(e.text)}</p>
   <a class="asc-btn asc-btn-primary" href="${esc(e.href)}" data-consequence-link>${esc(e.cta)}</a></div>`).join('');
 }
 function panelHtml(world,v){
  if(!v)return '';
  if(v.state==='unknown')return `<section class="asc-note av-retour" id="retour" data-consequence-state="unknown"><p>${esc(v.text)}</p></section>`;
  const open=v.state==='open',fb=v.feedback;
  const marks=open?'':`<h4>${esc(v.marksTitle)}</h4><p class="asc-small">${esc(v.needText)}</p>${v.selectedText?`<p class="asc-small" data-consequence-selected>${esc(v.selectedText)}</p>`:''}
   <ul class="av-retour-marks" aria-label="${esc(v.marksTitle)}">${v.marks.map(m=>`<li data-mark="${esc(m.id)}"${m.selected?' class="is-chosen"':''}><p><strong>${esc(m.name)}</strong> · ${esc(m.text)}</p>${m.selected?'':
    `<button class="asc-btn asc-btn-secondary" type="button" data-consequence-action="${m.sends?'discover':'select'}" data-consequence-mark="${esc(m.id)}">${esc(m.label)}</button>`}</li>`).join('')}</ul>
   ${v.unselect?`<button class="asc-btn asc-btn-ghost" type="button" data-consequence-action="unselect">${esc(v.unselect)}</button>`:''}`;
  const access=open?`<div class="av-retour-access" data-consequence-access><p class="av-retour-way"><span>${esc(v.access.from)}</span><span aria-hidden="true"> ⇄ </span><span class="sr-only"> relié à </span><span>${esc(v.access.to)}</span></p>
   <button class="asc-btn asc-btn-primary" type="button" data-consequence-action="visit">${esc(v.access.action)}</button>
   ${v.access.vignette?`<p data-consequence-vignette>${esc(v.access.vignette)}</p>`:''}<p class="asc-small asc-muted" data-consequence-visits>${esc(v.access.visitsText)}</p></div>`:'';
  return `<section class="asc-note av-retour" id="retour" tabindex="-1" data-consequence-state="${esc(v.state)}" data-consequence-outcome="${esc(v.outcome)}" data-consequence-kind="${esc(v.kind)}" aria-labelledby="retour-title">
   <p class="asc-eyebrow">${esc(v.camp.eyebrow)} · conséquence de ta victoire</p><h3 id="retour-title">${esc(v.title)}</h3>
   <p>${esc(open?v.access.text:v.intro)}</p>
   <article class="av-retour-item"><p class="asc-eyebrow">${esc(v.item.name)}</p><p>${esc(v.item.text)}</p></article>
   ${fb?`<p class="av-retour-feedback ${fb.correct?'is-right':'is-wrong'}" data-consequence-feedback="${fb.correct?'right':'wrong'}">${esc(fb.text)}</p>`:''}
   ${marks}${access}
   <p class="asc-small asc-muted">${esc(v.rules)}</p><p class="asc-small asc-muted">${esc(v.privacy)}</p>
   ${notice.get(world)?`<p class="av-retour-feedback is-wrong" data-consequence-notice>${esc(notice.get(world))}</p>`:''}<p role="status" class="sr-only" data-consequence-status></p></section>`;
 }
 function paint(host){
  if(!host.isConnected||host.dataset.owner!==currentOwner())return;
  const w=host.dataset.world,item=C()?.itemFor(payload,w);
  host.innerHTML=panelHtml(w,item?C().view(item,'fr',selection.get(w)||null):null);
 }
 async function mount(host,world){
  if(!host||!C())return;
  const id=currentOwner();host.dataset.owner=id||'';host.dataset.world=world;
  if(isGuest(id)){host.replaceChildren();return;}
  hosts.add(host);paint(host);
  if(!host.dataset.bound){host.dataset.bound='true';host.addEventListener('click',async event=>{
   const button=event.target.closest('[data-consequence-action]');if(!button||button.disabled||host.getAttribute('aria-busy')==='true')return;
   const w=host.dataset.world,act=button.dataset.consequenceAction,mark=button.dataset.consequenceMark;
   // The first landmark stays on this device; the second choice sends the alignment.
   if(act==='select'||act==='unselect'){if(act==='select')selection.set(w,mark);else selection.delete(w);notice.delete(w);paint(host);
    host.querySelector('[data-consequence-action="discover"],[data-consequence-action="select"]')?.focus();return;}
   host.setAttribute('aria-busy','true');host.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{
    const first=selection.get(w),marks=act==='discover'?(first&&first!==mark?[first,mark]:[mark]):null;
    await call(act,w,marks);selection.delete(w);notice.delete(w);paint(host);
    const text=host.querySelector(act==='visit'?'[data-consequence-vignette]':'[data-consequence-feedback]')?.textContent||'';
    const status=host.querySelector('[data-consequence-status]');if(status)status.textContent=text;
    host.querySelector(act==='visit'?'[data-consequence-action="visit"]':'#retour-title')?.setAttribute('tabindex','-1');
    host.querySelector(act==='visit'?'[data-consequence-action="visit"]':'#retour-title')?.focus();
   }catch(e){
    selection.delete(w);notice.set(w,message(e));paint(host);
    const status=host.querySelector('[data-consequence-status]');if(status)status.textContent=notice.get(w);
   }finally{host.setAttribute('aria-busy','false');}
  });}
  try{await load();}catch(e){notice.set(world,message(e));}
  paint(host);
  // Arrival from the Camp (/adventure?world=aube#retour): the access is the first thing shown, the interaction is the next tap.
  if(root.location?.hash==='#retour'&&!host.dataset.arrived&&host.querySelector('#retour')){
   host.dataset.arrived='true';const section=host.querySelector('#retour');section.scrollIntoView({block:'start'});section.focus({preventScroll:true});
  }
 }
 // Back online (or another device discovered meanwhile): re-read the canonical server state, never replay an answer.
 async function resume(){
  try{await load({fresh:true});}catch{return;}
  for(const host of [...hosts]){if(!host.isConnected){hosts.delete(host);continue;}const w=host.dataset.world;if(notice.get(w)===message({message:'RPG_OFFLINE'}))notice.delete(w);paint(host);}
 }
 root.TitanConsequencePanel={mount,reset,resume,load,campHtml};
 root.addEventListener('titan:account-changing',reset);root.addEventListener('online',resume);
})(window);
