/* Optional server-owned encounter journal. No optimistic victory, no local rewards, no guest mutation.
   V1.5.0: the pilot arc (TitanAdventureBranches) is rendered from the server snapshot; a route is chosen explicitly,
   confirmed once, and read back from the server on every device. */
(function(root){
 'use strict';
 let owner=null,generation=0,branchApi=true; const cache=new Map(),pending=new Map(),selection=new Map(),notice=new Map(),hosts=new Set();
 const esc=s=>root.titanEsc(String(s??''));
 const B=()=>root.TitanAdventureBranches;
 const currentOwner=()=>root.state?.user?.id;
 const message=e=>({CAMPAIGN_NOT_STARTED:'Commence d’abord la campagne de ce monde.',ENCOUNTER_INCOMPLETE:'Les preuves confirmées ne suffisent pas encore. Reviens à ton rythme.',AUTH_REQUIRED:'Reconnecte-toi pour retrouver ton aventure.',ACCOUNT_CHANGED:'Le compte a changé.',
  BRANCH_INCOMPATIBLE:'Ta campagne avait déjà passé cet embranchement : elle garde sa version d’origine.',RPG_OFFLINE:B()?.offlineText()||'Hors ligne.'}[e?.message]||'La rencontre est indisponible. Tes acquis sont conservés.');
 const missing=error=>error?.code==='PGRST202'||/Could not find the function/.test(error?.message||'');
 function reset(){owner=null;generation++;cache.clear();pending.clear();selection.clear();notice.clear();document.querySelectorAll('[data-rpg-host]').forEach(el=>el.replaceChildren());}
 async function rpc(name,params,token){
  let timer;
  try{return await Promise.race([root.titanClient.rpc(name,params).setHeader('Authorization',`Bearer ${token}`),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RPG_TIMEOUT')),15000);})]);}
  finally{clearTimeout(timer);}
 }
 async function call(world,action,ordinal=null,choice=null,route=null){
  const id=currentOwner();if(!id||String(id).startsWith('guest_'))throw Error('AUTH_REQUIRED');
  if(owner!==id){cache.clear();pending.clear();selection.clear();notice.clear();owner=id;generation++;}
  if(action&&root.navigator?.onLine===false)throw Error('RPG_OFFLINE');
  const epoch=generation; const session=(await root.titanClient?.auth.getSession())?.data?.session;
  if(session?.user?.id!==id||currentOwner()!==id)throw Error('AUTH_REQUIRED');
  let result;
  if(branchApi){
   const params=action?{p_world:world,p_action:action,p_ordinal:ordinal,p_choice:choice,p_route:route}:{p_world:world};
   result=await rpc(action?'titan_adventure_branch_action_v1':'titan_adventure_branch_snapshot_v1',params,session.access_token);
   // Server without the V1.5.0 migration: the journal keeps working on the v1 contract, the pilot stays hidden.
   if(result?.error&&missing(result.error)&&!['enter','confirm'].includes(action))branchApi=false;
  }
  if(!branchApi)result=await rpc(action?'titan_adventure_rpg_action_v1':'titan_adventure_rpg_snapshot_v1',action?{p_world:world,p_action:action,p_ordinal:ordinal,p_choice:choice}:{p_world:world},session.access_token);
  const {data,error}=result;
  if(error)throw Error(error.message);
  if(epoch!==generation||currentOwner()!==id||data?.owner!==id||data?.world!==world)throw Error('ACCOUNT_CHANGED');
  cache.set(world,data);return data;
 }
 function branchHtml(world,v,first){
  if(!v)return '';
  if(v.state==='legacy'||v.state==='unknown')return `<section class="asc-note av-branch" data-branch-state="${esc(v.state)}"><h3>${esc(v.title)}</h3><p>${esc(v.text)}</p></section>`;
  const cfg=B().contract(v.pilot,v.version),atChoice=first?.ordinal===cfg.choiceOrdinal;
  const route=r=>`<article class="av-branch-route${r.followed?' is-followed':''}${r.closed?' is-closed':''}" data-branch-route="${esc(r.id)}"><h4>${esc(r.label)}</h4><p>${esc(r.reveals)}</p>${
   v.state==='entered'&&!selection.get(world)?`<button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="select" data-branch-route="${esc(r.id)}">${esc(B().t('pilot.choose',{route:r.name}))}</button>`:''}</article>`;
  const head=`<p class="asc-eyebrow">Arc pilote · ${esc(v.pilot)} · version ${v.version}</p><h3>${esc(v.title)}</h3>`;
  if(v.state==='available'){
   if(!atChoice)return '';
   return `<section class="asc-note av-branch" data-branch-state="available">${head}<p>${esc(v.intro)}</p><div class="av-branch-routes">${v.routes.map(route).join('')}</div><p class="asc-small">${esc(v.equal)}</p><p class="asc-small asc-muted">${esc(v.enterNote)}</p><button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="enter">${esc(v.enter)}</button></section>`;
  }
  if(v.state==='entered'){
   const chosen=v.routes.find(r=>r.id===selection.get(world));
   const confirm=chosen?`<div class="av-branch-confirm" role="group" aria-labelledby="branch-confirm-title"><h4 id="branch-confirm-title">${esc(B().t('pilot.confirmTitle',{route:chosen.name}))}</h4><p>${esc(B().t('pilot.confirmBody'))}</p>${v.ready?'':`<p class="asc-small">${esc(v.notReady)}</p>`}
    <button class="asc-btn asc-btn-primary" type="button" data-rpg-action="confirm" data-branch-route="${esc(chosen.id)}" ${v.ready?'':'disabled'}>${esc(B().t('pilot.confirm',{route:chosen.name}))}</button>
    <button class="asc-btn asc-btn-ghost" type="button" data-rpg-action="back">${esc(B().t('pilot.back'))}</button></div>`:(v.ready?'':`<p class="asc-small">${esc(v.notReady)}</p>`);
   return `<section class="asc-note av-branch" data-branch-state="entered">${head}<p>${esc(v.intro)}</p><div class="av-branch-routes">${v.routes.map(route).join('')}</div><p class="asc-small">${esc(v.equal)}</p>${confirm}</section>`;
  }
  // confirmed
  const step=v.current&&first?.ordinal===v.current.ordinal?v.current:null;
  const clue=v.clue?`<article class="av-branch-clue" data-branch-clue="${esc(v.clue.id)}" data-clue-state="${esc(v.clue.state)}"><p class="asc-eyebrow">${esc(v.clue.label)}</p><strong>${esc(v.clue.name)}</strong><p>${esc(v.clue.text)}</p></article>`:'';
  return `<section class="asc-note av-branch" data-branch-state="confirmed" data-branch-followed="${esc(v.route)}">${head}<p><strong>${esc(v.followed)}</strong></p>${v.closed.map(c=>`<p class="asc-small asc-muted">${esc(c)}</p>`).join('')}
   ${step?`<article class="av-rpg-scene" data-branch-step="${step.ordinal}"><h4>${esc(step.name)}</h4><p>${esc(step.story)}</p><p class="asc-small">${esc(step.progress)}${step.ready?` · ${esc(v.readyText)}`:''}</p><p class="asc-small asc-muted">${esc(v.pendingNote)}</p>
   <button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="claim" data-rpg-ordinal="${step.ordinal}" ${step.ready?'':'disabled'}>${esc(step.action)}</button></article>`:''}${clue}</section>`;
 }
 function content(world,s){
  const worldInfo=root.TitanAdventureRpg.worlds.find(w=>w.id===world);
  if(!s)return '<p role="status">Le journal des rencontres se prépare…</p>';
  if(!s.active)return `<h2 class="asc-h2">Les chemins de ${esc(worldInfo.name)}</h2><p>Trois arcs, six jalons chacun : lieux, récits, rencontres et trésors cosmétiques. Facultatif, gratuit, sans échéance ni pénalité.</p><p class="asc-small asc-muted">Les prochaines séances confirmées seront attribuées une seule fois à ce monde pour les rencontres. Tes XP et crédits suivent leurs règles habituelles. Aucun capteur requis.</p><button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="start">Ouvrir ce chemin</button>`;
  const base=root.TitanAdventureRpg.path(world),v=B()?.view(s)||null,nodes=B()?B().nodes(base,s):base;
  const first=s.milestones.find(n=>!n.earned),model=first&&nodes.find(n=>n.ordinal===first.ordinal),rewards=s.rewards||[];
  const cfg=v&&v.pilot?B().contract(v.pilot,v.version):null,branchOrdinals=cfg?[cfg.choiceOrdinal,...cfg.steps.map(x=>x.ordinal)]:[];
  const inBranch=!!(v&&['available','entered','confirmed'].includes(v.state)&&first&&branchOrdinals.includes(first.ordinal));
  const bestiary=rewards.map(r=>nodes.find(n=>n.ordinal===r.ordinal)).filter(n=>['monster','miniboss'].includes(n?.kind));
  const beasts=nodes.filter(n=>['monster','miniboss'].includes(n.kind)).length;
  let scene='';
  if(model&&!inBranch){
   const previous=(first.ordinal-1)*s.target,remaining=Math.max(0,first.effortTarget-s.effort),damage=Math.min(s.target,Math.max(0,s.effort-previous));
   const combat=['monster','miniboss'].includes(model.kind);
   scene=`<article class="asc-note av-rpg-scene"><p class="asc-eyebrow">Arc ${model.arc} · chapitre ${model.chapter} · ${esc(model.kind==='miniboss'?'mini-boss facultatif':model.kind==='monster'?'rencontre':'jalon')}</p><h3>${esc(model.name)}</h3><p>${esc(model.story)}</p>
   ${combat?`<div role="progressbar" aria-label="Passage dégagé par l’effort confirmé" aria-valuemin="0" aria-valuemax="${s.target}" aria-valuenow="${damage}" class="av-rpg-health"><span style="width:${Math.round(damage/s.target*100)}%"></span></div><p class="asc-small">${damage}/${s.target} points d’effort confirmés pour cette rencontre.</p>`:''}
   <p class="asc-small">${first.ready?'Le serveur confirme les préparatifs.':`${remaining} point(s) d’effort restant(s) · ${Math.min(s.days,first.daysTarget)}/${first.daysTarget} jours distincts · chapitre ${model.chapter} à atteindre.`}</p>
   ${model.kind==='choice'?model.choices.map((c,i)=>`<button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="claim" data-rpg-ordinal="${model.ordinal}" data-rpg-choice="${i}" ${first.ready?'':'disabled'}>${esc(c)}</button>`).join(''):`<button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="claim" data-rpg-ordinal="${model.ordinal}" ${first.ready?'':'disabled'}>${combat?'Dégager le passage':model.kind==='treasure'?'Recueillir le souvenir':'Poursuivre le récit'}</button>`}</article>`;
  }else if(!model)scene='<p class="asc-note">Les dix-huit jalons de ce monde rejoignent ton carnet. Tes souvenirs restent acquis.</p>';
  const branch=v&&(inBranch||['confirmed','legacy','unknown'].includes(v.state))?branchHtml(world,v,first):'';
  return `<h2 class="asc-h2">Les rencontres de ce monde</h2><p class="asc-small asc-muted">Facultatif. L’effort habituel de tes séances confirmées prépare le passage, 90 points au plus par jour sur l’ensemble des mondes. Une séance est attribuée une seule fois. Le repos ne retire rien.</p>
  <div class="av-rpg-arcs" aria-label="Trois arcs de six jalons">${[1,2,3].map(arc=>`<section><h3>Arc ${arc} · ${esc(nodes[(arc-1)*6].arcName)}</h3><ol class="av-rpg-path">${nodes.filter(n=>n.arc===arc).map(n=>{
    const proof=s.milestones.find(p=>p.ordinal===n.ordinal),reward=rewards.find(r=>r.ordinal===n.ordinal);
    return `<li class="${proof?.earned?'is-earned':first?.ordinal===n.ordinal?'is-current':''}" ${first?.ordinal===n.ordinal?'aria-current="step"':''}><span class="av-rpg-dot" aria-hidden="true">${proof?.earned?'✓':n.ordinal}</span><span><strong>${esc(n.name)}</strong><small>Chapitre ${n.chapter} · ${proof?.earned?'acquis':first?.ordinal===n.ordinal?'en cours':'à découvrir'}</small>${reward?.choice!=null&&n.endings[reward.choice]?`<small>${esc(n.endings[reward.choice])}</small>`:''}</span></li>`;
   }).join('')}</ol></section>`).join('')}</div>
  <p class="asc-small">${s.days} jours admissibles · ${s.effort} points confirmés · ${rewards.length}/18 souvenirs. Cible figée : ${s.target} points par jalon, d’après les 28 jours précédant le départ.</p>
  <button class="asc-btn asc-btn-ghost" type="button" data-rpg-action="sync">Actualiser les preuves de ce monde</button>${branch}${scene}
  <details class="av-rules"><summary>Bestiaire · ${bestiary.length}/${beasts} rencontres</summary>${bestiary.length?bestiary.map(n=>`<article class="asc-note"><strong>${esc(n.name)} · arc ${n.arc}</strong><p>${esc(n.story)}</p><small>Rencontre confirmée · souvenir cosmétique</small></article>`).join(''):'<p>Les rencontres confirmées apparaîtront ici.</p>'}</details>
  <details class="av-rules"><summary>Exploits par familles · ${(s.familyTitles||[]).length} titre(s)</summary><p class="asc-small">Trois jours distincts dans une famille débloquent un titre cosmétique. Aucun sport précis ni abonnement requis.</p>${(s.familyTitles||[]).map(f=>`<p>${esc(root.TitanAdventureRpg.familyTitle(f.family))}</p>`).join('')}</details>`;
 }
 function html(world,s,expanded=false){
  return `<details data-rpg-secondary ${expanded?'open':''}><summary>Rencontres secondaires · 18 souvenirs facultatifs${s?.active?` · ${s.rewards.length}/18 acquis`:''}</summary><p class="asc-small asc-muted">Ces rencontres enrichissent les neuf chapitres du monde. Le parcours principal reste celui des neuf balises.</p>${content(world,s)}</details>`;
 }
 function paint(host,world){
  if(host.isConnected&&host.dataset.owner===currentOwner()){
   const expanded=host.querySelector('[data-rpg-secondary]')?.open===true;
   if(cache.get(world)?.branch?.state==='confirmed')selection.delete(world);
   host.innerHTML=html(world,cache.get(world),expanded)+`<p role="status" data-rpg-error>${esc(notice.get(world)||'')}</p>`;
  }
 }
 async function mount(host,world){
  if(!host||!root.TitanAdventureRpg)return;
  const id=currentOwner();host.dataset.owner=id||'';
  if(!id||String(id).startsWith('guest_')){host.innerHTML='<p class="asc-small">Les rencontres, le bestiaire et les choix sont confirmés avec un compte. La campagne découverte reste disponible.</p>';return;}
  if(owner!==id){owner=id;generation++;cache.clear();pending.clear();selection.clear();notice.clear();}
  host.dataset.world=world;hosts.add(host);paint(host,world);
  if(!host.dataset.bound){host.dataset.bound='true';host.addEventListener('click',async event=>{
   const button=event.target.closest('[data-rpg-action]');if(!button||button.disabled||host.getAttribute('aria-busy')==='true')return;
   const w=host.dataset.world,act=button.dataset.rpgAction;
   // Choosing a route is local until the explicit confirmation; nothing is sent.
   if(act==='select'||act==='back'){if(act==='select')selection.set(w,button.dataset.branchRoute);else selection.delete(w);notice.delete(w);paint(host,w);host.querySelector(act==='select'?'[data-rpg-action="confirm"],[data-rpg-action="back"]':'[data-rpg-action="select"]')?.focus();return;}
   host.setAttribute('aria-busy','true');host.querySelectorAll('button').forEach(b=>b.disabled=true);
   const route=act==='confirm'?button.dataset.branchRoute:null;
   try{
    const data=await call(w,act==='refresh'?null:act,button.dataset.rpgOrdinal?Number(button.dataset.rpgOrdinal):null,button.dataset.rpgChoice!=null?Number(button.dataset.rpgChoice):null,route);
    notice.set(w,act==='confirm'?B()?.conflict(route,data)||'':'');paint(host,w);
   }
   catch(e){notice.set(w,message(e));paint(host,w);}
   finally{host.setAttribute('aria-busy','false');}
  });}
  if(!cache.has(world)){
   if(!pending.has(world))pending.set(world,call(world).finally(()=>pending.delete(world)));
   try{await pending.get(world);paint(host,world);}catch(e){host.innerHTML=`<p role="status">${esc(message(e))}</p><button class="asc-btn asc-btn-ghost" type="button" data-rpg-action="refresh">Réessayer</button>`;}
  }
 }
 // Back online (or another device decided meanwhile): re-read the canonical server state, never replay a decision.
 async function resume(){
  for(const host of [...hosts]){
   if(!host.isConnected){hosts.delete(host);continue;}
   const w=host.dataset.world;if(!w||host.dataset.owner!==currentOwner())continue;
   try{await call(w);if(notice.get(w)===message({message:'RPG_OFFLINE'}))notice.delete(w);paint(host,w);}catch{}
  }
 }
 root.TitanRpgPanel={mount,reset,resume};root.addEventListener('titan:account-changing',reset);root.addEventListener('online',resume);
})(window);
