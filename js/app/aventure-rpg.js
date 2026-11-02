/* Optional server-owned encounter journal. No optimistic victory, no local rewards, no guest mutation. */
(function(root){
 'use strict';
 let owner=null,generation=0; const cache=new Map(),pending=new Map();
 const esc=s=>root.titanEsc(String(s??''));
 const currentOwner=()=>root.state?.user?.id;
 const message=e=>({CAMPAIGN_NOT_STARTED:'Commence d’abord la campagne de ce monde.',ENCOUNTER_INCOMPLETE:'Les preuves confirmées ne suffisent pas encore. Reviens à ton rythme.',AUTH_REQUIRED:'Reconnecte-toi pour retrouver ton aventure.',ACCOUNT_CHANGED:'Le compte a changé.'}[e?.message]||'La rencontre est indisponible. Tes acquis sont conservés.');
 function reset(){owner=null;generation++;cache.clear();pending.clear();document.querySelectorAll('[data-rpg-host]').forEach(el=>el.replaceChildren());}
 async function call(world,action,ordinal=null,choice=null){
  const id=currentOwner();if(!id||String(id).startsWith('guest_'))throw Error('AUTH_REQUIRED');
  if(owner!==id){cache.clear();pending.clear();owner=id;generation++;}
  const epoch=generation; const session=(await root.titanClient?.auth.getSession())?.data?.session;
  if(session?.user?.id!==id||currentOwner()!==id)throw Error('AUTH_REQUIRED');
  const params=action?{p_world:world,p_action:action,p_ordinal:ordinal,p_choice:choice}:{p_world:world};
  let timer; let result;
  try{result=await Promise.race([root.titanClient.rpc(action?'titan_adventure_rpg_action_v1':'titan_adventure_rpg_snapshot_v1',params).setHeader('Authorization',`Bearer ${session.access_token}`),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RPG_TIMEOUT')),15000);})]);}finally{clearTimeout(timer);}
  const {data,error}=result;
  if(error)throw Error(error.message);
  if(epoch!==generation||currentOwner()!==id||data?.owner!==id||data?.world!==world)throw Error('ACCOUNT_CHANGED');
  cache.set(world,data);return data;
 }
 function html(world,s){
  const nodes=root.TitanAdventureRpg.path(world),worldInfo=root.TitanAdventureRpg.worlds.find(w=>w.id===world);
  if(!s)return '<p role="status">Le journal des rencontres se prépare…</p>';
  if(!s.active)return `<h2 class="asc-h2">Les chemins de ${esc(worldInfo.name)}</h2><p>Trois arcs, six jalons chacun : lieux, récits, rencontres et trésors cosmétiques. Facultatif, gratuit, sans échéance ni pénalité.</p><p class="asc-small asc-muted">Les prochaines séances confirmées seront attribuées une seule fois à ce monde pour les rencontres. Tes XP et coins suivent leurs règles habituelles. Aucun capteur requis.</p><button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="start">Ouvrir ce chemin</button>`;
  const first=s.milestones.find(n=>!n.earned),model=first&&nodes.find(n=>n.ordinal===first.ordinal),rewards=s.rewards||[];
  const bestiary=rewards.map(r=>nodes.find(n=>n.ordinal===r.ordinal)).filter(n=>['monster','miniboss'].includes(n?.kind));
  let scene='';
  if(model){
   const previous=(first.ordinal-1)*s.target,remaining=Math.max(0,first.effortTarget-s.effort),damage=Math.min(s.target,Math.max(0,s.effort-previous));
   const combat=['monster','miniboss'].includes(model.kind);
   scene=`<article class="asc-note av-rpg-scene"><p class="asc-eyebrow">Arc ${model.arc} · chapitre ${model.chapter} · ${esc(model.kind==='miniboss'?'mini-boss facultatif':model.kind==='monster'?'rencontre':'jalon')}</p><h3>${esc(model.name)}</h3><p>${esc(model.story)}</p>
   ${combat?`<div role="progressbar" aria-label="Passage dégagé par l’effort confirmé" aria-valuemin="0" aria-valuemax="${s.target}" aria-valuenow="${damage}" class="av-rpg-health"><span style="width:${Math.round(damage/s.target*100)}%"></span></div><p class="asc-small">${damage}/${s.target} points d’effort confirmés pour cette rencontre.</p>`:''}
   <p class="asc-small">${first.ready?'Le serveur confirme les préparatifs.':`${remaining} point(s) d’effort restant(s) · ${Math.min(s.days,first.daysTarget)}/${first.daysTarget} jours distincts · chapitre ${model.chapter} à atteindre.`}</p>
   ${model.kind==='choice'?model.choices.map((c,i)=>`<button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="claim" data-rpg-ordinal="${model.ordinal}" data-rpg-choice="${i}" ${first.ready?'':'disabled'}>${esc(c)}</button>`).join(''):`<button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="claim" data-rpg-ordinal="${model.ordinal}" ${first.ready?'':'disabled'}>${combat?'Dégager le passage':model.kind==='treasure'?'Recueillir le souvenir':'Poursuivre le récit'}</button>`}</article>`;
  }else scene='<p class="asc-note">Les dix-huit jalons de ce monde rejoignent ton carnet. Tes souvenirs restent acquis.</p>';
  return `<h2 class="asc-h2">Le chemin des rencontres</h2><p class="asc-small asc-muted">Facultatif. L’effort habituel de tes séances confirmées prépare le passage, 90 points au plus par jour sur l’ensemble des mondes. Une séance est attribuée une seule fois. Le repos ne retire rien.</p>
  <div class="av-rpg-arcs" aria-label="Trois arcs de six jalons">${[1,2,3].map(arc=>`<section><h3>Arc ${arc} · ${esc(nodes[(arc-1)*6].arcName)}</h3><ol class="av-rpg-path">${nodes.filter(n=>n.arc===arc).map(n=>{
    const proof=s.milestones.find(p=>p.ordinal===n.ordinal),reward=rewards.find(r=>r.ordinal===n.ordinal);
    return `<li class="${proof.earned?'is-earned':first?.ordinal===n.ordinal?'is-current':''}" ${first?.ordinal===n.ordinal?'aria-current="step"':''}><span class="av-rpg-dot" aria-hidden="true">${proof.earned?'✓':n.ordinal}</span><span><strong>${esc(n.name)}</strong><small>Chapitre ${n.chapter} · ${proof.earned?'acquis':first?.ordinal===n.ordinal?'en cours':'à découvrir'}</small>${reward?.choice!=null?`<small>${esc(n.endings[reward.choice])}</small>`:''}</span></li>`;
   }).join('')}</ol></section>`).join('')}</div>
  <p class="asc-small">${s.days} jours admissibles · ${s.effort} points confirmés · ${rewards.length}/18 souvenirs. Cible figée : ${s.target} points par jalon, d’après les 28 jours précédant le départ.</p>
  <button class="asc-btn asc-btn-ghost" type="button" data-rpg-action="sync">Actualiser les preuves de ce monde</button>${scene}
  <details class="av-rules"><summary>Bestiaire · ${bestiary.length}/6 rencontres</summary>${bestiary.length?bestiary.map(n=>`<article class="asc-note"><strong>${esc(n.name)} · arc ${n.arc}</strong><p>${esc(n.story)}</p><small>Rencontre confirmée · souvenir cosmétique</small></article>`).join(''):'<p>Les rencontres confirmées apparaîtront ici.</p>'}</details>
  <details class="av-rules"><summary>Exploits par familles · ${(s.familyTitles||[]).length} titre(s)</summary><p class="asc-small">Trois jours distincts dans une famille débloquent un titre cosmétique. Aucun sport précis ni abonnement requis.</p>${(s.familyTitles||[]).map(f=>`<p>${esc(root.TitanAdventureRpg.familyTitle(f.family))}</p>`).join('')}</details>`;
 }
 function paint(host,world){if(host.isConnected&&host.dataset.owner===currentOwner())host.innerHTML=html(world,cache.get(world))+'<p role="status" data-rpg-error></p>';}
 async function mount(host,world){
  if(!host||!root.TitanAdventureRpg)return;
  const id=currentOwner();host.dataset.owner=id||'';
  if(!id||String(id).startsWith('guest_')){host.innerHTML='<p class="asc-small">Les rencontres, le bestiaire et les choix sont confirmés avec un compte. La campagne découverte reste disponible.</p>';return;}
  if(owner!==id){owner=id;generation++;cache.clear();pending.clear();}
  host.dataset.world=world;paint(host,world);
  if(!host.dataset.bound){host.dataset.bound='true';host.addEventListener('click',async event=>{
   const button=event.target.closest('[data-rpg-action]');if(!button||button.disabled||host.getAttribute('aria-busy')==='true')return;
   host.setAttribute('aria-busy','true');host.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{await call(host.dataset.world,button.dataset.rpgAction==='refresh'?null:button.dataset.rpgAction,button.dataset.rpgOrdinal?Number(button.dataset.rpgOrdinal):null,button.dataset.rpgChoice!=null?Number(button.dataset.rpgChoice):null);paint(host,host.dataset.world);}
   catch(e){const target=host.querySelector('[data-rpg-error]');if(target)target.textContent=message(e);paintButtons(host,host.dataset.world);}
   finally{host.setAttribute('aria-busy','false');}
  });}
  if(!cache.has(world)){
   if(!pending.has(world))pending.set(world,call(world).finally(()=>pending.delete(world)));
   try{await pending.get(world);paint(host,world);}catch(e){host.innerHTML=`<p role="status">${esc(message(e))}</p><button class="asc-btn asc-btn-ghost" type="button" data-rpg-action="refresh">Réessayer</button>`;}
  }
 }
 function paintButtons(host,world){const msg=host.querySelector('[data-rpg-error]')?.textContent;paint(host,world);const target=host.querySelector('[data-rpg-error]');if(target)target.textContent=msg;}
 root.TitanRpgPanel={mount,reset};root.addEventListener('titan:account-changing',reset);
})(window);
