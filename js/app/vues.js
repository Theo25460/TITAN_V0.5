/* TITAN — private saved analysis parameters, server authority and session-bound responses. */
(function () {
  'use strict';
  const D=()=>window.TitanData,V=()=>window.TitanAnalysisViews,esc=v=>window.titanEsc(v);
  let panel,form,status,list,retry,shown=null,draft=null,confirmed=null,sequence=0,pending=null,timer=null,ownerShown=null;
  let offline=!navigator.onLine;
  const message=text=>{status.innerHTML=text?`<p>${esc(text)}</p>`:'';};
  function controls(busy=false) {
    retry.disabled=busy;
    form.querySelector('#views-cancel').disabled=busy;
    form.querySelector('#views-submit').disabled=busy||!shown?.available;
    form.querySelector('#views-name').disabled=busy||!shown?.available;
    list.querySelectorAll('button').forEach(b=>{b.disabled=busy||(['apply','edit'].includes(b.dataset.viewAction)&&!shown?.available);});
    panel.setAttribute('aria-busy',String(busy));
  }
  function discardDraft() {draft=null;form.hidden=true;form.reset();}
  function cancel() {
    sequence++;clearTimeout(timer);timer=null;
    if(pending){clearTimeout(pending.timer);pending.controller.abort();pending=null;}
  }
  function clear(text='',dropDraft=true) {
    cancel();shown=null;confirmed=null;list.innerHTML='';if(dropDraft)discardDraft();controls();message(text);
  }
  function begin(mode) {
    cancel();
    const job={mode,sequence,owner:D().owner(),epoch:window.titanAccountTransition?.epoch,client:window.titanClient,controller:new AbortController(),timer:null};
    pending=job;controls(true);
    job.current=()=>pending===job&&job.sequence===sequence&&job.owner===D().owner()&&!D().isGuest()&&job.client===window.titanClient
      &&job.epoch===window.titanAccountTransition?.epoch&&!window.titanAccountTransition?.active&&panel.open&&!document.hidden&&!offline&&navigator.onLine;
    return job;
  }
  async function rpc(job,name,p) {
    let query=job.client.rpc(name,p);
    if(typeof query?.abortSignal==='function')query=query.abortSignal(job.controller.signal);
    const expiry=new Promise((resolve,reject)=>{
      job.controller.signal.addEventListener('abort',()=>reject(new Error('VIEW_CANCELLED')),{once:true});
      job.timer=setTimeout(()=>{reject(new Error('VIEW_TIMEOUT'));job.controller.abort();},15000);
    });
    try {const {data,error}=await Promise.race([Promise.resolve(query),expiry]);if(error)throw error;return data;}
    finally {clearTimeout(job.timer);}
  }
  function ready() {
    if(window.titanAccountTransition?.active){clear('La session a changé. Attends la synchronisation du compte ou reconnecte-toi.');return false;}
    if(D().isGuest()){clear('Connecte-toi pour retrouver tes vues privées. Tes statistiques, favoris et exports de base restent gratuits.');return false;}
    if(offline||!navigator.onLine){clear('Hors ligne : reconnecte-toi pour retrouver tes vues. Aucune modification n’est envoyée hors ligne.');return false;}
    if(!window.titanClient){clear('La connexion au serveur n’est pas prête. Réessaie dans un instant.');return false;}
    return panel.open&&!document.hidden;
  }
  function errorText(e,mutation=false) {
    const text=String(e?.message||'');
    if(e?.code==='PGRST202'||text.includes('Could not find'))return 'Les vues ouvrent avec la prochaine mise à jour du serveur. Tes favoris et exports de base restent gratuits.';
    if(text.includes('VIEW_TIMEOUT'))return 'Le serveur n’a pas répondu en 15 secondes. Pour une modification, vérifie la liste avant de réessayer.';
    if(text.includes('VIEW_VERSION_CONFLICT'))return 'Cette vue a été modifiée sur un autre appareil. Actualise la liste, puis reprends la vue avant de la modifier.';
    if(text.includes('VIEW_LIMIT'))return 'Tu as déjà dix vues. Supprime une vue pour libérer une place.';
    if(text.includes('VIEW_NAME_TAKEN'))return 'Ce nom existe déjà dans tes vues. Choisis un autre nom.';
    if(text.includes('VIEW_NOT_FOUND'))return 'Cette vue a été supprimée ou n’est plus disponible. Actualise la liste.';
    if(text.includes('PREMIUM_REQUIRED'))return 'Tes vues sont conservées. TITAN+ permet de les ouvrir et de les modifier ; tu peux toujours les supprimer.';
    if(text.includes('PROFILE_UNAVAILABLE'))return 'Le compte n’est pas disponible. Reconnecte-toi pour vérifier ta session.';
    return mutation?'La réponse n’a pas pu être confirmée : vérifie la liste avant de réessayer. Les paramètres de ce brouillon sont conservés.'
      :'La liste n’a pas répondu correctement. Réessaie dans un instant.';
  }
  function render(j) {
    shown=j;
    list.innerHTML=j.views.map(v=>`<article class="analysis-view" data-view="${esc(v.id)}"><h3>${esc(v.name)}</h3><p>${esc(V().describe(v.kind,v.options))}</p><div class="view-actions">
      <button type="button" class="asc-btn asc-btn-secondary" data-view-action="apply">Ouvrir</button><button type="button" class="asc-btn asc-btn-ghost" data-view-action="edit">Renommer</button><button type="button" class="asc-btn asc-btn-ghost" data-view-action="delete">Supprimer</button></div>
      ${confirmed===v.id?`<div class="view-confirm"><p>Supprimer « ${esc(v.name)} » ?</p><button type="button" id="views-confirm-delete" class="asc-btn asc-btn-secondary" data-view-action="confirm">Supprimer cette vue</button><button type="button" class="asc-btn asc-btn-ghost" data-view-action="cancel-delete">Annuler</button></div>`:''}</article>`).join('')||'<p>Aucune vue sauvegardée. Calcule une comparaison ou un bilan, puis choisis « Enregistrer cette vue ».</p>';
    controls(!!pending);
  }
  function schedule() {clearTimeout(timer);timer=setTimeout(()=>refresh(),60000);}
  function finish(job) {if(pending===job){pending=null;controls();schedule();}}
  async function fetchList(job,id=null) {
    const j=await rpc(job,'titan_analysis_views',{p_id:id});
    if(!job.current())return null;
    if(!V().validList(j,job.owner,id))throw new Error('INVALID_VIEW_RESPONSE');
    return j;
  }
  async function load() {
    if(!ready())return;
    if(ownerShown!==D().owner()){discardDraft();ownerShown=D().owner();}
    clear('',false);const job=begin('read');message('Actualisation des vues…');
    try {const j=await fetchList(job);if(!j)return;render(j);message(j.available?`${j.count} vue(s) sur 10. Les analyses sont recalculées à l’ouverture.`:errorText({message:'PREMIUM_REQUIRED'}));}
    catch(e){if(job.current()){shown=null;list.innerHTML='';message(errorText(e));}}
    finally {finish(job);}
  }
  function edit(v) {
    if(confirmed){confirmed=null;render(shown);}
    draft={id:v.id,revision:v.revision,kind:v.kind,options:structuredClone(v.options)};
    form.hidden=false;form.querySelector('#views-name').value=v.name;
    form.querySelector('#views-draft-summary').textContent=V().describe(v.kind,v.options);
    form.querySelector('#views-submit').textContent=v.revision?'Enregistrer le nom':'Enregistrer la vue';
    controls(!!pending);form.querySelector('#views-name').focus();
  }
  async function save() {
    if(pending||!draft||!ready())return;
    const name=V().name(form.querySelector('#views-name').value);
    if(!name){message('Choisis un nom de 1 à 40 caractères, sans retour à la ligne.');return;}
    const p={p_action:'save',p_id:draft.id,p_expected_revision:draft.revision,p_name:name,p_kind:draft.kind,p_options:structuredClone(draft.options)};
    await mutate(p);
  }
  async function mutate(p) {
    if(pending||!ready())return;
    const job=begin('mutation');let acknowledged=false;message(p.p_action==='delete'?'Suppression…':'Enregistrement…');
    try {
      const receipt=await rpc(job,'titan_mutate_analysis_view',p);if(!job.current())return;
      if(!V().validReceipt(receipt,job.owner,p))throw new Error('INVALID_VIEW_RECEIPT');
      window.TitanAnalytics?.track(p.p_action==='delete'?'analysis_view_deleted':p.p_expected_revision===0?'analysis_view_created':'analysis_view_renamed',
        {kind:p.p_action==='delete'?shown?.views.find(v=>v.id===p.p_id)?.kind:p.p_kind});
      acknowledged=true;discardDraft();confirmed=null;shown=null;list.innerHTML='';
      const j=await fetchList(job);if(!j)return;render(j);
      message(p.p_action==='delete'?'Vue supprimée.':'Vue enregistrée. Ses données seront recalculées à l’ouverture.');
    }catch(e){if(job.current()){
      if(String(e?.message||'').includes('PREMIUM_REQUIRED')&&shown)shown={...shown,available:false,reason:'premium_required'};
      message(acknowledged?`${p.p_action==='delete'?'Vue supprimée':'Vue enregistrée'}, mais la liste n’a pas pu être actualisée. Choisis Actualiser pour la retrouver.`:errorText(e,true));
    }}
    finally {finish(job);}
  }
  async function apply(id) {
    if(pending||!ready())return;
    const job=begin('apply');message('Vérification de la vue avant calcul…');
    try {
      const j=await fetchList(job,id);if(!j)return;
      if(!j.available){if(shown)shown={...shown,available:false,reason:'premium_required'};message(errorText({message:'PREMIUM_REQUIRED'}));return;}
      if(j.views.length!==1){message(errorText({message:'VIEW_NOT_FOUND'}));return;}
      window.TitanAnalytics?.track('analysis_view_opened',{kind:j.views[0].kind});
      window.dispatchEvent(new CustomEvent('titan:analysis-view-selected',{detail:{owner:job.owner,epoch:job.epoch,view:j.views[0]}}));
      message('Filtres restaurés. Le panneau d’analyse vérifie ton accès et recalcule les données.');
    }catch(e){if(job.current())message(errorText(e));}
    finally {finish(job);}
  }
  function refresh() {if(pending?.mode==='mutation'||pending?.mode==='apply')return;if(panel.open&&!document.hidden)load();else clear();}
  function start() {
    const root=document.getElementById('vues');if(!root)return;
    root.innerHTML=`<details id="views-panel" class="compare-panel"><summary>Mes vues d’analyse <span class="asc-pill">TITAN+</span></summary><div class="compare-body"><p>Retrouve jusqu’à dix comparaisons ou bilans sans ressaisir leurs filtres. Seuls le nom et les paramètres sont sauvegardés, privés dans ton compte.</p>
      <button type="button" class="asc-btn asc-btn-secondary" id="views-retry">Actualiser</button><div id="views-status" role="status" aria-live="polite"></div>
      <form id="views-draft-form" hidden><p id="views-draft-summary"></p><label for="views-name">Nom de la vue · 40 caractères maximum</label><input type="text" class="asc-input" id="views-name" maxlength="80" autocomplete="off" required><div class="view-actions"><button type="submit" class="asc-btn asc-btn-primary" id="views-submit">Enregistrer la vue</button><button type="button" class="asc-btn asc-btn-ghost" id="views-cancel">Annuler</button></div></form>
      <div id="views-list"></div><p class="asc-small asc-muted">À la fin de TITAN+, tes vues sont conservées et supprimables. Tes favoris, ton historique et tes exports de base restent gratuits.</p></div></details>`;
    panel=root.querySelector('details');form=root.querySelector('form');status=root.querySelector('#views-status');list=root.querySelector('#views-list');retry=root.querySelector('#views-retry');
    panel.addEventListener('toggle',()=>panel.open?load():clear());retry.addEventListener('click',load);
    form.addEventListener('submit',e=>{e.preventDefault();save();});form.querySelector('#views-cancel').addEventListener('click',()=>{if(pending)return;discardDraft();refresh();});
    list.addEventListener('click',e=>{
      const button=e.target.closest('[data-view-action]');if(!button||pending)return;
      const v=shown?.views.find(v=>v.id===button.closest('[data-view]')?.dataset.view);if(!v)return;
      const action=button.dataset.viewAction;
      if(action==='apply')apply(v.id);
      if(action==='edit'&&shown.available)edit(v);
      if(action==='delete'){confirmed=v.id;render(shown);list.querySelector('#views-confirm-delete')?.focus();}
      if(action==='cancel-delete'){confirmed=null;render(shown);list.querySelector(`[data-view="${v.id}"] [data-view-action="delete"]`)?.focus();}
      if(action==='confirm'&&confirmed===v.id)mutate({p_action:'delete',p_id:v.id,p_expected_revision:v.revision});
    });
    window.addEventListener('titan:analysis-view-save',e=>{
      const d=e.detail;
      if(!d||d.owner!==D().owner()||d.epoch!==window.titanAccountTransition?.epoch||window.titanAccountTransition?.active||D().isGuest()
        ||document.hidden||offline||!navigator.onLine||!V().validOptions(d.kind,d.options)||pending?.mode==='mutation')return;
      ownerShown=d.owner;edit({id:crypto.randomUUID(),revision:0,name:'',kind:d.kind,options:d.options});
      if(panel.open)load();else panel.open=true;
      panel.scrollIntoView({block:'nearest'});
    });
    ['focus','pageshow','titan:adventure-updated','titan:account-changed'].forEach(ev=>window.addEventListener(ev,refresh));
    window.addEventListener('titan:account-changing',()=>{ownerShown=null;clear('La session a changé. Attends la synchronisation du compte ou reconnecte-toi.');});
    window.addEventListener('offline',()=>{offline=true;clear('Hors ligne : reconnecte-toi pour retrouver tes vues.');});
    window.addEventListener('online',()=>{offline=false;refresh();});
    document.addEventListener('visibilitychange',()=>document.hidden?clear():refresh());
    controls();if(location.hash==='#vues')panel.open=true;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
