/* Optional server-owned encounter journal. No optimistic victory, no local rewards, no guest mutation.
   V1.5.0: the pilot arc (TitanAdventureBranches) is rendered from the server snapshot; a route is chosen explicitly,
   confirmed once, and read back from the server on every device.
   V1.5.1: the Veilleur de pierre (TitanAdventureGuardian) is observed, prepared and resolved; the server confirms one outcome.
   V1.5.3: the Marées, the Forge and the Aurores play their first arc on the same engine (TitanAdventureCampaigns): same branch
   and guardian renderers, plus the world's mechanic (map of currents, order of pieces, beacons to link), answered once and
   checked by the server. */
(function(root){
 'use strict';
 let owner=null,generation=0,branchApi=true,guardianApi=true,campaignApi=true; const cache=new Map(),pending=new Map(),selection=new Map(),notice=new Map(),hosts=new Set(),poses=new Map(),answers=new Map();
 const esc=s=>root.titanEsc(String(s??''));
 // The Vallée keeps its V1.5.0/V1.5.1 modules; the other worlds get the same API from the common campaign configuration.
 const B=w=>root.TitanAdventureCampaigns?.forWorld(w).branches||root.TitanAdventureBranches;
 const G=w=>root.TitanAdventureCampaigns?.forWorld(w).guardian||root.TitanAdventureGuardian;
 const currentOwner=()=>root.state?.user?.id;
 const message=(e,w)=>({CAMPAIGN_NOT_STARTED:'Commence d’abord la campagne de ce monde.',ENCOUNTER_INCOMPLETE:'Les preuves confirmées ne suffisent pas encore. Reviens à ton rythme.',AUTH_REQUIRED:'Reconnecte-toi pour retrouver ton aventure.',ACCOUNT_CHANGED:'Le compte a changé.',
  BRANCH_INCOMPATIBLE:'Ta campagne avait déjà passé cet embranchement : elle garde sa version d’origine.',RPG_OFFLINE:B(w)?.offlineText()||'Hors ligne.'}[e?.message]||G(w)?.errorText(e?.message)||root.TitanAdventureCampaigns?.errorText(e?.message)||'La rencontre est indisponible. Tes acquis sont conservés.');
 const missing=error=>error?.code==='PGRST202'||/Could not find the function/.test(error?.message||'');
 function reset(){owner=null;generation++;cache.clear();pending.clear();selection.clear();notice.clear();poses.clear();answers.clear();document.querySelectorAll('[data-rpg-host]').forEach(el=>el.replaceChildren());}
 async function rpc(name,params,token){
  let timer;
  try{return await Promise.race([root.titanClient.rpc(name,params).setHeader('Authorization',`Bearer ${token}`),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RPG_TIMEOUT')),15000);})]);}
  finally{clearTimeout(timer);}
 }
 async function call(world,action,ordinal=null,choice=null,route=null,sign=null,answer=null){
  const id=currentOwner();if(!id||String(id).startsWith('guest_'))throw Error('AUTH_REQUIRED');
  if(owner!==id){cache.clear();pending.clear();selection.clear();notice.clear();answers.clear();owner=id;generation++;}
  if(action&&root.navigator?.onLine===false)throw Error('RPG_OFFLINE');
  const epoch=generation; const session=(await root.titanClient?.auth.getSession())?.data?.session;
  if(session?.user?.id!==id||currentOwner()!==id)throw Error('AUTH_REQUIRED');
  let result,done=false;
  if(campaignApi&&guardianApi&&branchApi){
   // V1.5.3 common API: in the Vallée, the sign is the one-slot answer of the same "solve" action.
   const act=action==='prepare'?'solve':action,ans=action==='prepare'?[sign]:answer;
   const params=act?{p_world:world,p_action:act,p_ordinal:ordinal,p_choice:choice,p_route:route,p_answer:ans}:{p_world:world};
   result=await rpc(act?'titan_adventure_campaign_action_v1':'titan_adventure_campaign_snapshot_v1',params,session.access_token);
   // Server without the V1.5.3 migration: the Vallée keeps its V1.5.1 contract, the other worlds their v1 journal.
   if(result?.error&&missing(result.error)&&action!=='solve')campaignApi=false;else done=true;
  }
  if(!done&&action==='solve')throw Error('GUARDIAN_UNAVAILABLE');
  if(!done&&guardianApi&&branchApi){
   const params=action?{p_world:world,p_action:action,p_ordinal:ordinal,p_choice:choice,p_route:route,p_sign:sign}:{p_world:world};
   result=await rpc(action?'titan_adventure_guardian_action_v1':'titan_adventure_guardian_snapshot_v1',params,session.access_token);
   // Server without the V1.5.1 migration: the branch contract (or v1) keeps working, the guardian phases stay hidden.
   if(result?.error&&missing(result.error)&&!['prepare','resolve'].includes(action))guardianApi=false;
  }
  if(!done&&!guardianApi&&['prepare','resolve'].includes(action))throw Error('GUARDIAN_UNAVAILABLE');
  if(!done&&!guardianApi&&branchApi){
   const params=action?{p_world:world,p_action:action,p_ordinal:ordinal,p_choice:choice,p_route:route}:{p_world:world};
   result=await rpc(action?'titan_adventure_branch_action_v1':'titan_adventure_branch_snapshot_v1',params,session.access_token);
   // Server without the V1.5.0 migration: the journal keeps working on the v1 contract, the pilot stays hidden.
   if(result?.error&&missing(result.error)&&!['enter','confirm'].includes(action))branchApi=false;
  }
  if(!done&&!branchApi)result=await rpc(action?'titan_adventure_rpg_action_v1':'titan_adventure_rpg_snapshot_v1',action?{p_world:world,p_action:action,p_ordinal:ordinal,p_choice:choice}:{p_world:world},session.access_token);
  const {data,error}=result;
  if(error)throw Error(error.message);
  if(epoch!==generation||currentOwner()!==id||data?.owner!==id||data?.world!==world)throw Error('ACCOUNT_CHANGED');
  cache.set(world,data);return data;
 }
 function branchHtml(world,v,first){
  if(!v)return '';
  if(v.state==='legacy'||v.state==='unknown')return `<section class="asc-note av-branch" data-branch-state="${esc(v.state)}"><h3>${esc(v.title)}</h3><p>${esc(v.text)}</p></section>`;
  const Bw=B(world),cfg=Bw.contract(v.pilot,v.version),atChoice=first?.ordinal===cfg.choiceOrdinal;
  const route=r=>`<article class="av-branch-route${r.followed?' is-followed':''}${r.closed?' is-closed':''}" data-branch-route="${esc(r.id)}"><h4>${esc(r.label)}</h4><p>${esc(r.reveals)}</p>${
   v.state==='entered'&&!selection.get(world)?`<button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="select" data-branch-route="${esc(r.id)}">${esc(Bw.t('pilot.choose',{route:r.name}))}</button>`:''}</article>`;
  const head=`<p class="asc-eyebrow">${world==='aube'?'Arc pilote':'Premier arc'} · ${esc(v.pilot)} · version ${v.version}</p><h3>${esc(v.title)}</h3>`;
  if(v.state==='available'){
   if(!atChoice)return '';
   return `<section class="asc-note av-branch" data-branch-state="available">${head}<p>${esc(v.intro)}</p><div class="av-branch-routes">${v.routes.map(route).join('')}</div><p class="asc-small">${esc(v.equal)}</p><p class="asc-small asc-muted">${esc(v.enterNote)}</p><button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="enter">${esc(v.enter)}</button></section>`;
  }
  if(v.state==='entered'){
   const chosen=v.routes.find(r=>r.id===selection.get(world));
   const confirm=chosen?`<div class="av-branch-confirm" role="group" aria-labelledby="branch-confirm-title"><h4 id="branch-confirm-title">${esc(Bw.t('pilot.confirmTitle',{route:chosen.name}))}</h4><p>${esc(Bw.t('pilot.confirmBody'))}</p>${v.ready?'':`<p class="asc-small">${esc(v.notReady)}</p>`}
    <button class="asc-btn asc-btn-primary" type="button" data-rpg-action="confirm" data-branch-route="${esc(chosen.id)}" ${v.ready?'':'disabled'}>${esc(Bw.t('pilot.confirm',{route:chosen.name}))}</button>
    <button class="asc-btn asc-btn-ghost" type="button" data-rpg-action="back">${esc(Bw.t('pilot.back'))}</button></div>`:(v.ready?'':`<p class="asc-small">${esc(v.notReady)}</p>`);
   return `<section class="asc-note av-branch" data-branch-state="entered">${head}<p>${esc(v.intro)}</p><div class="av-branch-routes">${v.routes.map(route).join('')}</div><p class="asc-small">${esc(v.equal)}</p>${confirm}</section>`;
  }
  // confirmed
  const step=v.current&&first?.ordinal===v.current.ordinal?v.current:null;
  const clue=v.clue?`<article class="av-branch-clue" data-branch-clue="${esc(v.clue.id)}" data-clue-state="${esc(v.clue.state)}"><p class="asc-eyebrow">${esc(v.clue.label)}</p><strong>${esc(v.clue.name)}</strong><p>${esc(v.clue.text)}</p></article>`:'';
  return `<section class="asc-note av-branch" data-branch-state="confirmed" data-branch-followed="${esc(v.route)}">${head}<p><strong>${esc(v.followed)}</strong></p>${v.closed.map(c=>`<p class="asc-small asc-muted">${esc(c)}</p>`).join('')}
   ${step?`<article class="av-rpg-scene" data-branch-step="${step.ordinal}"><h4>${esc(step.name)}</h4><p>${esc(step.story)}</p><p class="asc-small">${esc(step.progress)}${step.ready?` · ${esc(v.readyText)}`:''}</p><p class="asc-small asc-muted">${esc(v.pendingNote)}</p>
   <button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="claim" data-rpg-ordinal="${step.ordinal}" ${step.ready?'':'disabled'}>${esc(step.action)}</button></article>`:''}${clue}</section>`;
 }
 /* V1.5.1: the guardian scene. The stage is decorative (aria-hidden); its caption is the complete description, so the scene
    reads the same with reduced motion, where the pose simply changes without transition. */
 function guardianHtml(gv){
  if(!gv)return '';
  if(gv.state==='legacy'||gv.state==='unknown')return `<section class="asc-note av-guardian" data-guardian-state="${esc(gv.state)}"><h3>${esc(gv.title)}</h3><p>${esc(gv.text)}</p></section>`;
  const sc=gv.scene,a=gv.action,th=gv.threshold;
  const signs=['fissure','gravure','mousse'].map(id=>`<span class="av-guardian-mark" data-mark="${id}"></span>`).join('');
  const stage=`<figure class="av-guardian-scene" data-pose="${esc(sc.pose)}" data-passage="${esc(sc.passage)}" data-oath="${esc(sc.oath)}" data-signs="${sc.signs}" data-focus="${esc(sc.focus||'')}">
   <div class="av-guardian-stage" aria-hidden="true"><span class="av-guardian-wall"></span><span class="av-guardian-passage"></span><span class="av-guardian-figure"><img src="/assets/renaissance/guardian-aube-s.webp" alt="" width="256" height="256" decoding="async">${signs}<span class="av-guardian-oath"></span></span></div>
   <figcaption data-guardian-caption>${esc(sc.caption)}</figcaption></figure>`;
  let act='';
  if(a?.kind==='claim')act=`<button class="asc-btn asc-btn-primary" type="button" data-rpg-action="claim" data-rpg-ordinal="${a.ordinal}" ${a.ready?'':'disabled'}>${esc(a.label)}</button>`;
  if(a?.kind==='prepare')act=`<ul class="av-guardian-signs" aria-label="Signes visibles sur le Veilleur">${a.signs.map(x=>`<li data-sign="${esc(x.id)}"${x.chosen?' class="is-chosen"':''}><p><strong>${esc(x.name)}</strong> · ${esc(x.text)}</p><button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="prepare" data-guardian-sign="${esc(x.id)}">${esc(x.label)}</button></li>`).join('')}</ul><p class="asc-small asc-muted">${esc(a.note)}</p>`;
  if(a?.kind==='resolve')act=`<button class="asc-btn asc-btn-primary" type="button" data-rpg-action="resolve" ${a.ready?'':'disabled'}>${esc(a.label)}</button>`;
  const fb=gv.feedback?`<p class="av-guardian-feedback ${gv.feedback.correct?'is-right':'is-wrong'}" data-guardian-feedback="${gv.feedback.correct?'right':'wrong'}">${esc(gv.feedback.text)}</p>`:'';
  const out=gv.outcome?`<article class="av-guardian-outcome" data-guardian-outcome="${esc(gv.outcome.id)}"><p class="asc-eyebrow">Issue confirmée par le serveur</p><strong>${esc(gv.outcome.name)}</strong><p>${esc(gv.outcome.text)}</p><p>${esc(gv.outcome.decisive)}</p><p>${esc(gv.outcome.decision)}</p></article>`:'';
  const r=gv.resume;
  return `<section class="asc-note av-guardian" data-guardian-state="${esc(gv.state)}" data-guardian-route="${esc(gv.route)}" aria-labelledby="guardian-title">
   <p class="asc-eyebrow">Gardien de l’arc pilote · version ${gv.version}</p><h3 id="guardian-title">${esc(gv.title)}</h3><p>${esc(gv.intro)}</p>
   <ol class="av-guardian-phases" aria-label="Phases de la rencontre">${gv.phases.map(p=>`<li class="is-${p.state}"${p.state==='active'?' aria-current="step"':''}>${esc(p.label)}</li>`).join('')}</ol>
   ${stage}<p>${esc(gv.text)}</p>
   ${th?`<p class="asc-small" data-guardian-threshold>${esc(th.progress)}</p><p class="asc-small">${esc(th.remaining)}</p><p class="asc-small asc-muted">${esc(th.note)}</p>`:''}
   ${fb}<div data-guardian-feedback-live role="status" class="sr-only"></div>${act}${out}
   <div class="av-guardian-resume" data-guardian-resume><h4>${esc(r.title)}</h4><p><strong>${esc(r.acquiredTitle)}</strong></p><ul>${r.acquired.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
   <p><strong>${esc(r.nextTitle)}</strong> · <span data-guardian-next>${esc(r.next)}</span></p>${r.corrected?`<p class="asc-small" data-guardian-corrected>${esc(r.corrected)}</p>`:''}</div>
   <p class="asc-small asc-muted">${esc(gv.equal)}</p></section>`;
 }
 /* V1.5.3: the guardian of the Marées, the Forge or the Aurores, with the world's mechanic. Same structure as the Veilleur:
    a decorative stage (the world's approved guardian illustration, aria-hidden) and a caption that describes everything. */
 const MECH_LABEL={chart:'Carte des courants',sequence:'Ordre de montage',link:'Balises reliées'};
 function boardAnswer(host,w){
  return [...host.querySelectorAll('[data-mech-slot]')].map(fs=>fs.querySelector('input:checked')?.value||null);
 }
 function boardText(a,list){
  const name=(slot,id)=>slot.options.find(o=>o.id===id)?.label||'—';
  if(a.primitive==='chart')return a.slots.map((slot,i)=>`${slot.label} : ${name(slot,list[i])}`).join(' · ');
  return a.slots.map((slot,i)=>a.primitive==='sequence'?`${i+1}. ${name(slot,list[i])}`:name(slot,list[i])).join(a.primitive==='link'?' — ':' → ');
 }
 function updateBoard(host,w){
  const gv=G(w)?.view(cache.get(w)),a=gv?.action;if(a?.kind!=='solve')return;
  const list=answers.get(w)||a.slots.map(x=>x.last),board=host.querySelector('[data-mech-board]');
  if(board){board.querySelector('span').textContent=boardText(a,list);board.dataset.complete=String(list.every(Boolean));}
  // Ordered pieces and beacons are used once: a token placed in another slot is shown as such (the server refuses duplicates).
  if(a.distinct)host.querySelectorAll('[data-mech-slot]').forEach((fs,i)=>fs.querySelectorAll('input').forEach(input=>{
   const used=list.some((x,k)=>k!==i&&x===input.value);input.closest('label').classList.toggle('is-used',used);
   input.closest('label').querySelector('[data-used]').textContent=used?` (${a.usedLabel})`:'';
  }));
 }
 function campaignGuardianHtml(world,gv){
  if(!gv)return '';
  if(gv.state==='legacy'||gv.state==='unknown')return `<section class="asc-note av-guardian" data-guardian-state="${esc(gv.state)}"><h3>${esc(gv.title)}</h3><p>${esc(gv.text)}</p></section>`;
  const sc=gv.scene,a=gv.action,th=gv.threshold;
  const stage=`<figure class="av-guardian-scene av-campaign-scene" data-world="${esc(world)}" data-pose="${esc(sc.pose)}" data-primitive="${esc(sc.primitive)}">
   <div class="av-guardian-stage" aria-hidden="true"><span class="av-campaign-horizon"></span><span class="av-guardian-figure"><img src="/assets/renaissance/guardian-${esc(world)}-s.webp" alt="" width="256" height="256" decoding="async"></span>
   ${sc.answer?`<span class="av-campaign-trace">${sc.answer.map(x=>`<i>${esc(x)}</i>`).join('')}</span>`:''}</div>
   <figcaption data-guardian-caption>${esc(sc.caption)}</figcaption></figure>`;
  let act='';
  if(a?.kind==='claim')act=`<button class="asc-btn asc-btn-primary" type="button" data-rpg-action="claim" data-rpg-ordinal="${a.ordinal}" ${a.ready?'':'disabled'}>${esc(a.label)}</button>`;
  if(a?.kind==='solve'){
   const list=answers.get(world)||a.slots.map(x=>x.last);
   act=`<div class="av-mech" data-mech="${esc(a.primitive)}">${a.slots.map((slot,i)=>`<fieldset data-mech-slot="${esc(slot.id)}"><legend>${a.primitive==='chart'?'':`${slot.index}. `}${esc(slot.label)}</legend>
    <div class="av-mech-options">${slot.options.map(o=>`<label><input type="radio" name="mech-${esc(world)}-${esc(slot.id)}" value="${esc(o.id)}"${list[i]===o.id?' checked':''}> <span>${esc(o.label)}</span><small data-used></small></label>`).join('')}</div></fieldset>`).join('')}
    <p class="av-mech-board" data-mech-board aria-live="polite"><strong>${esc(MECH_LABEL[a.primitive]||'')}</strong> · <span>${esc(boardText(a,list))}</span></p>
    <button class="asc-btn asc-btn-primary" type="button" data-rpg-action="solve">${esc(a.submit)}</button><p class="asc-small asc-muted">${esc(a.note)}</p></div>`;
  }
  if(a?.kind==='resolve')act=`<button class="asc-btn asc-btn-primary" type="button" data-rpg-action="resolve" ${a.ready?'':'disabled'}>${esc(a.label)}</button>`;
  const fb=gv.feedback?`<p class="av-guardian-feedback ${gv.feedback.correct?'is-right':'is-wrong'}" data-guardian-feedback="${gv.feedback.correct?'right':'wrong'}"${gv.feedback.slot?` data-feedback-slot="${esc(gv.feedback.slot)}"`:''}>${esc(gv.feedback.text)}</p>`:'';
  const out=gv.outcome?`<article class="av-guardian-outcome" data-guardian-outcome="${esc(gv.outcome.id)}"><p class="asc-eyebrow">Issue confirmée par le serveur</p><strong>${esc(gv.outcome.name)}</strong><p>${esc(gv.outcome.text)}</p><p>${esc(gv.outcome.decisive)}</p><p>${esc(gv.outcome.decision)}</p></article>`:'';
  const r=gv.resume;
  return `<section class="asc-note av-guardian av-campaign" data-guardian-state="${esc(gv.state)}" data-guardian-route="${esc(gv.route)}" data-mechanic="${esc(gv.primitive)}" aria-labelledby="guardian-title">
   <p class="asc-eyebrow">Gardien du premier arc · version ${gv.version}</p><h3 id="guardian-title">${esc(gv.title)}</h3><p>${esc(gv.intro)}</p>
   <ol class="av-guardian-phases" aria-label="Phases de la rencontre">${gv.phases.map(p=>`<li class="is-${p.state}"${p.state==='active'?' aria-current="step"':''}>${esc(p.label)}</li>`).join('')}</ol>
   ${stage}<p>${esc(gv.text)}</p>
   ${th?`<p class="asc-small" data-guardian-threshold>${esc(th.progress)}</p><p class="asc-small">${esc(th.remaining)}</p><p class="asc-small asc-muted">${esc(th.note)}</p>`:''}
   ${fb}<div data-guardian-feedback-live role="status" class="sr-only"></div>${act}${out}
   <div class="av-guardian-resume" data-guardian-resume><h4>${esc(r.title)}</h4><p><strong>${esc(r.acquiredTitle)}</strong></p><ul>${r.acquired.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
   <p><strong>${esc(r.nextTitle)}</strong> · <span data-guardian-next>${esc(r.next)}</span></p>${r.corrected?`<p class="asc-small" data-guardian-corrected>${esc(r.corrected)}</p>`:''}</div>
   <p class="asc-small asc-muted">${esc(gv.equal)}</p></section>`;
 }
 function content(world,s){
  const worldInfo=root.TitanAdventureRpg.worlds.find(w=>w.id===world);
  if(!s)return '<p role="status">Le journal des rencontres se prépare…</p>';
  if(!s.active)return `<h2 class="asc-h2">Les chemins de ${esc(worldInfo.name)}</h2><p>Trois arcs, six jalons chacun : lieux, récits, rencontres et trésors cosmétiques. Facultatif, gratuit, sans échéance ni pénalité.</p><p class="asc-small asc-muted">Les prochaines séances confirmées seront attribuées une seule fois à ce monde pour les rencontres. Tes XP et crédits suivent leurs règles habituelles. Aucun capteur requis.</p><button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="start">Ouvrir ce chemin</button>`;
  const Bw=B(world),Gw=G(world),base=root.TitanAdventureRpg.path(world),v=Bw?.view(s)||null,gv=Gw?.view(s)||null;
  const nodes=Gw?Gw.nodes(Bw?Bw.nodes(base,s):base,s):Bw?Bw.nodes(base,s):base;
  const first=s.milestones.find(n=>!n.earned),model=first&&nodes.find(n=>n.ordinal===first.ordinal),rewards=s.rewards||[];
  const cfg=v&&v.pilot?Bw.contract(v.pilot,v.version):null,branchOrdinals=cfg?[cfg.choiceOrdinal,...cfg.steps.map(x=>x.ordinal)]:[];
  const inBranch=!!(v&&['available','entered','confirmed'].includes(v.state)&&first&&branchOrdinals.includes(first.ordinal));
  const inGuardian=!!(gv&&gv.ordinal&&first&&[gv.observeOrdinal,gv.ordinal].includes(first.ordinal)&&['observe','prepare','waiting','ready'].includes(gv.state));
  const bestiary=rewards.map(r=>nodes.find(n=>n.ordinal===r.ordinal)).filter(n=>['monster','miniboss'].includes(n?.kind));
  const beasts=nodes.filter(n=>['monster','miniboss'].includes(n.kind)).length;
  let scene='';
  if(model&&!inBranch&&!inGuardian){
   const previous=(first.ordinal-1)*s.target,remaining=Math.max(0,first.effortTarget-s.effort),damage=Math.min(s.target,Math.max(0,s.effort-previous));
   const combat=['monster','miniboss'].includes(model.kind);
   scene=`<article class="asc-note av-rpg-scene"><p class="asc-eyebrow">Arc ${model.arc} · chapitre ${model.chapter} · ${esc(model.kind==='miniboss'?'mini-boss facultatif':model.kind==='monster'?'rencontre':'jalon')}</p><h3>${esc(model.name)}</h3><p>${esc(model.story)}</p>
   ${combat?`<div role="progressbar" aria-label="Passage dégagé par l’effort confirmé" aria-valuemin="0" aria-valuemax="${s.target}" aria-valuenow="${damage}" class="av-rpg-health"><span style="width:${Math.round(damage/s.target*100)}%"></span></div><p class="asc-small">${damage}/${s.target} points d’effort confirmés pour cette rencontre.</p>`:''}
   <p class="asc-small">${first.ready?'Le serveur confirme les préparatifs.':`${remaining} point(s) d’effort restant(s) · ${Math.min(s.days,first.daysTarget)}/${first.daysTarget} jours distincts · chapitre ${model.chapter} à atteindre.`}</p>
   ${model.kind==='choice'?model.choices.map((c,i)=>`<button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="claim" data-rpg-ordinal="${model.ordinal}" data-rpg-choice="${i}" ${first.ready?'':'disabled'}>${esc(c)}</button>`).join(''):`<button class="asc-btn asc-btn-secondary" type="button" data-rpg-action="claim" data-rpg-ordinal="${model.ordinal}" ${first.ready?'':'disabled'}>${combat?'Dégager le passage':model.kind==='treasure'?'Recueillir le souvenir':'Poursuivre le récit'}</button>`}</article>`;
  }else if(!model)scene='<p class="asc-note">Les dix-huit jalons de ce monde rejoignent ton carnet. Tes souvenirs restent acquis.</p>';
  const branch=v&&(inBranch||['confirmed','legacy','unknown'].includes(v.state))?branchHtml(world,v,first):'';
  const guardian=gv&&(inGuardian||['resolved','legacy','unknown'].includes(gv.state))?(world==='aube'?guardianHtml(gv):campaignGuardianHtml(world,gv)):'';
  return `<h2 class="asc-h2">Les rencontres de ce monde</h2><p class="asc-small asc-muted">Facultatif. L’effort habituel de tes séances confirmées prépare le passage, 90 points au plus par jour sur l’ensemble des mondes. Une séance est attribuée une seule fois. Le repos ne retire rien.</p>
  <div class="av-rpg-arcs" aria-label="Trois arcs de six jalons">${[1,2,3].map(arc=>`<section><h3>Arc ${arc} · ${esc(nodes[(arc-1)*6].arcName)}</h3><ol class="av-rpg-path">${nodes.filter(n=>n.arc===arc).map(n=>{
    const proof=s.milestones.find(p=>p.ordinal===n.ordinal),reward=rewards.find(r=>r.ordinal===n.ordinal);
    return `<li class="${proof?.earned?'is-earned':first?.ordinal===n.ordinal?'is-current':''}" ${first?.ordinal===n.ordinal?'aria-current="step"':''}><span class="av-rpg-dot" aria-hidden="true">${proof?.earned?'✓':n.ordinal}</span><span><strong>${esc(n.name)}</strong><small>Chapitre ${n.chapter} · ${proof?.earned?'acquis':first?.ordinal===n.ordinal?'en cours':'à découvrir'}</small>${reward?.choice!=null&&n.endings[reward.choice]?`<small>${esc(n.endings[reward.choice])}</small>`:''}</span></li>`;
   }).join('')}</ol></section>`).join('')}</div>
  <p class="asc-small">${s.days} jours admissibles · ${s.effort} points confirmés · ${rewards.length}/18 souvenirs. Cible figée : ${s.target} points par jalon, d’après les 28 jours précédant le départ.</p>
  <button class="asc-btn asc-btn-ghost" type="button" data-rpg-action="sync">Actualiser les preuves de ce monde</button>${branch}${guardian}${scene}
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
   // The Veilleur moves at the precise moment the server confirms a phase: the new pose starts from the previous one.
   const fig=host.querySelector('.av-guardian-scene'),pose=fig?.dataset.pose,was=poses.get(world);
   const still=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.motion==='reduced';
   if(fig&&was&&was!==pose&&!still){fig.dataset.pose=was;void fig.offsetWidth;root.requestAnimationFrame(()=>{if(fig.isConnected)fig.dataset.pose=pose;});}
   if(pose)poses.set(world,pose);
   updateBoard(host,world);
  }
 }
 async function mount(host,world){
  if(!host||!root.TitanAdventureRpg)return;
  const id=currentOwner();host.dataset.owner=id||'';
  if(!id||String(id).startsWith('guest_')){host.innerHTML='<p class="asc-small">Les rencontres, le bestiaire et les choix sont confirmés avec un compte. La campagne découverte reste disponible.</p>';return;}
  if(owner!==id){owner=id;generation++;cache.clear();pending.clear();selection.clear();notice.clear();}
  host.dataset.world=world;hosts.add(host);paint(host,world);
  if(!host.dataset.bound){host.dataset.bound='true';
   host.addEventListener('change',event=>{
    const input=event.target.closest('[data-mech-slot] input');if(!input)return;
    const w=host.dataset.world,list=boardAnswer(host,w);answers.set(w,list);updateBoard(host,w);
   });
   host.addEventListener('click',async event=>{
   const button=event.target.closest('[data-rpg-action]');if(!button||button.disabled||host.getAttribute('aria-busy')==='true')return;
   const w=host.dataset.world,act=button.dataset.rpgAction;
   // Choosing a route is local until the explicit confirmation; nothing is sent.
   if(act==='select'||act==='back'){if(act==='select')selection.set(w,button.dataset.branchRoute);else selection.delete(w);notice.delete(w);paint(host,w);host.querySelector(act==='select'?'[data-rpg-action="confirm"],[data-rpg-action="back"]':'[data-rpg-action="select"]')?.focus();return;}
   host.setAttribute('aria-busy','true');host.querySelectorAll('button').forEach(b=>b.disabled=true);
   const route=act==='confirm'?button.dataset.branchRoute:null,sign=act==='prepare'?button.dataset.guardianSign:null;
   // The mechanic's answer stays local until it is sent; an incomplete board is not sent.
   const answer=act==='solve'?boardAnswer(host,w):null;
   if(act==='solve'&&answer.some(x=>!x)){host.setAttribute('aria-busy','false');notice.set(w,root.TitanAdventureCampaigns.t('solve.incomplete'));paint(host,w);host.querySelector('[data-mech-slot] input')?.focus();return;}
   try{
    const data=await call(w,act==='refresh'?null:act,button.dataset.rpgOrdinal?Number(button.dataset.rpgOrdinal):null,button.dataset.rpgChoice!=null?Number(button.dataset.rpgChoice):null,route,sign,answer);
    if(act==='solve')answers.delete(w);
    notice.set(w,act==='confirm'?B(w)?.conflict(route,data)||'':'');paint(host,w);
    // Announce the result of an interpretation or of the resolution, then keep focus on the encounter.
    if(act==='prepare'||act==='solve'||act==='resolve'||(act==='claim'&&host.querySelector('.av-guardian'))){
     const live=host.querySelector('[data-guardian-feedback-live]'),text=host.querySelector('[data-guardian-feedback]')?.textContent||host.querySelector('.av-guardian-outcome strong')?.textContent||host.querySelector('[data-guardian-caption]')?.textContent||'';
     if(live)live.textContent=text;host.querySelector('#guardian-title')?.setAttribute('tabindex','-1');host.querySelector('#guardian-title')?.focus();
    }
   }
   catch(e){notice.set(w,message(e,w));paint(host,w);}
   finally{host.setAttribute('aria-busy','false');}
  });}
  if(!cache.has(world)){
   if(!pending.has(world))pending.set(world,call(world).finally(()=>pending.delete(world)));
   try{await pending.get(world);paint(host,world);}catch(e){host.innerHTML=`<p role="status">${esc(message(e,world))}</p><button class="asc-btn asc-btn-ghost" type="button" data-rpg-action="refresh">Réessayer</button>`;}
  }
 }
 // Back online (or another device decided meanwhile): re-read the canonical server state, never replay a decision.
 async function resume(){
  for(const host of [...hosts]){
   if(!host.isConnected){hosts.delete(host);continue;}
   const w=host.dataset.world;if(!w||host.dataset.owner!==currentOwner())continue;
   try{await call(w);if(notice.get(w)===message({message:'RPG_OFFLINE'},w))notice.delete(w);paint(host,w);}catch{}
  }
 }
 root.TitanRpgPanel={mount,reset,resume};root.addEventListener('titan:account-changing',reset);root.addEventListener('online',resume);
})(window);
