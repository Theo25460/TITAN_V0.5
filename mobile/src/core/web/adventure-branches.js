/* V1.5.0 — Bifurcations. Versioned configuration of the single pilot arc (Vallée de l'Aube, arc 1), shared unchanged by
   the website and the Android app (mobile/src/core/web/adventure-branches.js is a byte copy, checked by hash).
   The server stays the authority: entry, decision, readiness and clues come from titan_adventure_branch_snapshot_v1.
   This module only describes the transitions (the server holds the same contract, checked by tests/adventure-branches.test.mjs)
   and turns a server snapshot into what both clients show. It never grants, never stores and never guesses a route. */
(function(root){
  'use strict';
  // Every visible string has a key so that the January translation adds a locale without touching the structure.
  const strings={fr:{
    'pilot.title':'Le passage condamné',
    'pilot.intro':'Le passage de la Vallée est condamné. Deux voies mènent au Veilleur de pierre : choisis ce que tu veux découvrir.',
    'pilot.enter':'Découvrir les deux voies',
    'pilot.enterNote':'Entrée facultative dans l’arc pilote. Tes XP, crédits, jours actifs et objectifs de campagne ne changent pas.',
    'pilot.equal':'Même effort pour les deux voies : {effort} points d’effort confirmés et {days} jours actifs après ta décision.',
    'pilot.choose':'Choisir {route}',
    'pilot.confirmTitle':'Confirmer {route} ?',
    'pilot.confirmBody':'Ta voie devient définitive pour ce compte, sur le Web comme sur Android. L’autre voie reste visible sur la carte, sans pénalité.',
    'pilot.confirm':'Confirmer {route}',
    'pilot.back':'Revoir les deux voies',
    'pilot.notReady':'La décision s’ouvre quand le jalon est prêt : {effort} point(s) d’effort et {days} jour(s) actif(s) restant(s).',
    'pilot.followed':'Voie suivie : {route}',
    'pilot.closed':'Voie non empruntée : {route}',
    'pilot.progress':'{effort}/{effortTarget} points · {days}/{daysTarget} jours actifs depuis ta décision',
    'pilot.ready':'Le serveur confirme l’étape.',
    'pilot.pendingNote':'Seules les séances confirmées après ta décision comptent. Une séance en attente compte dès sa validation, après actualisation.',
    'pilot.conflict':'Ta voie était déjà confirmée depuis un autre appareil : {route}. Elle reste ta voie.',
    'pilot.legacy':'Ta campagne avait déjà passé cet embranchement : elle garde sa version d’origine.',
    'pilot.offline':'Hors ligne : ta décision n’est pas envoyée. Reconnecte-toi pour la confirmer.',
    'pilot.unknown':'Cette version de l’arc n’est pas connue de l’application. Mets-la à jour pour continuer, ta progression est conservée.',
    'pilot.cluesTitle':'Indice',
    'pilot.clueFound':'Indice trouvé',
    'pilot.clueUsable':'Indice utilisable face au Veilleur de pierre',
    'map.choice':'Le passage condamné',
    'map.scene':'Corniche ou ruines',
    'map.clue':'Un indice à découvrir',
    'route.corniche.name':'la corniche',
    'route.corniche.label':'Ouvrir la corniche',
    'route.corniche.reveals':'Tu découvriras où prendre appui pour dégager le passage.',
    'route.corniche.scene.name':'La corniche effondrée',
    'route.corniche.scene.story':'Le sentier longe la falaise jusqu’aux éboulis. Sous la poussière, la roche garde des marques de passage.',
    'route.corniche.scene.action':'Dégager les éboulis',
    'route.corniche.scene.done':'Les éboulis dégagés laissent voir une entaille dans la roche.',
    'route.corniche.clue.name':'La prise dans la roche',
    'route.corniche.clue.story':'Une entaille ancienne tient le poids d’un voyageur. Elle montre où appuyer pour rouvrir le passage.',
    'route.corniche.clue.action':'Éprouver la prise',
    'route.corniche.clue.done':'La prise tient. Tu sais où prendre appui face au Veilleur.',
    'route.ruines.name':'les ruines',
    'route.ruines.label':'Enquêter dans les ruines',
    'route.ruines.reveals':'Tu découvriras pourquoi le Veilleur a fermé le passage.',
    'route.ruines.scene.name':'Le poste des passeurs',
    'route.ruines.scene.story':'Les murs du vieux poste tiennent encore. Une salle scellée garde les registres des passeurs.',
    'route.ruines.scene.action':'Fouiller la salle scellée',
    'route.ruines.scene.done':'Sous les registres, un fragment gravé attendait.',
    'route.ruines.clue.name':'Le fragment du serment',
    'route.ruines.clue.story':'Le serment du Veilleur est gravé là : il a fermé le passage pour protéger la vallée d’un éboulement.',
    'route.ruines.clue.action':'Déchiffrer le serment',
    'route.ruines.clue.done':'Tu comprends pourquoi le passage est fermé. Le Veilleur pourra l’entendre.'
  }};
  function t(key,vars={},locale='fr'){
    const table=strings[locale]||strings.fr,raw=table[key]??strings.fr[key]??key;
    return raw.replace(/\{(\w+)\}/g,(_,k)=>vars[k]!=null?String(vars[k]):'');
  }
  /* The server contract. Transition conditions are counted from the confirmed decision, on the existing effort ledger
     (same eligibility, same 90-point daily cap) and on top of the shared milestone conditions of the encounter engine.
     effortTargets is a multiple of the journey's frozen target, so both routes ask exactly the same effort. */
  const PILOTS={'aube-arc1':{current:1,versions:{1:{
    id:'aube-arc1',version:1,world:'aube',arc:1,choiceOrdinal:2,
    steps:[{ordinal:3,kind:'scene',effortTargets:1,daysTarget:1},{ordinal:4,kind:'clue',effortTargets:2,daysTarget:2}],
    routes:[{id:'corniche',choice:0,clue:'prise'},{id:'ruines',choice:1,clue:'serment'}]
  }}}};
  const contract=(pilot,version)=>PILOTS[pilot]?.versions?.[version]||null;
  const pilotFor=world=>Object.values(PILOTS).map(p=>p.versions[p.current]).find(c=>c.world===world)||null;
  const routeOf=(cfg,id)=>cfg?.routes.find(r=>r.id===id)||null;
  const routeText=(id,locale)=>({id,name:t(`route.${id}.name`,{},locale),label:t(`route.${id}.label`,{},locale),reveals:t(`route.${id}.reveals`,{},locale)});

  /* Server snapshot → view model, identical on both clients. Returns null outside the pilot. */
  function view(snapshot,locale='fr'){
    const b=snapshot?.branch;
    if(!snapshot?.active||!b||b.state==='none')return null;
    if(b.state==='legacy')return {state:'legacy',title:t('pilot.title',{},locale),text:t('pilot.legacy',{},locale)};
    const cfg=contract(b.pilot,b.version);
    if(!cfg)return {state:'unknown',title:t('pilot.title',{},locale),text:t('pilot.unknown',{},locale)};
    const target=Number(snapshot.target)||0,choice=snapshot.milestones?.find(m=>m.ordinal===cfg.choiceOrdinal);
    const last=cfg.steps[cfg.steps.length-1];
    const equal=t('pilot.equal',{effort:last.effortTargets*target,days:last.daysTarget},locale);
    const routes=cfg.routes.map(r=>({...routeText(r.id,locale),choice:r.choice,followed:b.route===r.id,closed:!!b.route&&b.route!==r.id}));
    const base={pilot:cfg.id,version:cfg.version,state:b.state,title:t('pilot.title',{},locale),intro:t('pilot.intro',{},locale),equal,routes,route:b.route||null,
      pendingNote:t('pilot.pendingNote',{},locale)};
    if(b.state==='available')return {...base,enter:t('pilot.enter',{},locale),enterNote:t('pilot.enterNote',{},locale)};
    if(b.state==='entered'){
      const remainingEffort=Math.max(0,(choice?.effortTarget||0)-(Number(snapshot.effort)||0)),remainingDays=Math.max(0,(choice?.daysTarget||0)-(Number(snapshot.days)||0));
      return {...base,choiceOrdinal:cfg.choiceOrdinal,ready:choice?.ready===true,
        notReady:choice?.ready?'':t('pilot.notReady',{effort:remainingEffort,days:remainingDays},locale)};
    }
    // Confirmed: the route is the canonical server decision (encounter reward of the choice ordinal).
    const route=routeOf(cfg,b.route);if(!route)return {state:'unknown',title:t('pilot.title',{},locale),text:t('pilot.unknown',{},locale)};
    const steps=cfg.steps.map(step=>{
      const server=(b.steps||[]).find(s=>s.ordinal===step.ordinal)||{},milestone=snapshot.milestones?.find(m=>m.ordinal===step.ordinal)||{};
      const effortTarget=step.effortTargets*target,daysTarget=step.daysTarget,key=`route.${route.id}.${step.kind}`;
      const effort=Math.min(effortTarget,Number(b.effortSince)||0),days=Math.min(daysTarget,Number(b.daysSince)||0);
      return {ordinal:step.ordinal,kind:step.kind,name:t(`${key}.name`,{},locale),story:t(`${key}.story`,{},locale),action:t(`${key}.action`,{},locale),done:t(`${key}.done`,{},locale),
        earned:milestone.earned===true||server.earned===true,ready:milestone.ready===true,effort,days,effortTarget,daysTarget,
        progress:t('pilot.progress',{effort,effortTarget,days,daysTarget},locale)};
    });
    const current=steps.find(s=>!s.earned)||null;
    const clue=b.clue?{id:b.clue.id,state:b.clue.state,name:t(`route.${route.id}.clue.name`,{},locale),
      label:t(b.clue.state==='usable'?'pilot.clueUsable':'pilot.clueFound',{},locale),
      text:t(b.clue.state==='usable'?`route.${route.id}.clue.done`:`route.${route.id}.scene.done`,{},locale)}:null;
    return {...base,route:route.id,followed:t('pilot.followed',{route:routeText(route.id,locale).name},locale),
      closed:routes.filter(r=>r.closed).map(r=>t('pilot.closed',{route:r.name},locale)),steps,current,clue,readyText:t('pilot.ready',{},locale)};
  }
  /* Map nodes of the pilot arc: the shared 18-milestone path, with the branch ordinals renamed for the route followed. */
  function nodes(path,snapshot,locale='fr'){
    const v=view(snapshot,locale);
    if(!v||v.state==='legacy'||v.state==='unknown')return path;
    const cfg=contract(v.pilot,v.version);
    return path.map(n=>{
      if(n.ordinal===cfg.choiceOrdinal)return {...n,name:t('map.choice',{},locale),story:v.intro,choices:v.routes.map(r=>r.label),
        endings:v.routes.map(r=>t('pilot.followed',{route:r.name},locale))};
      const step=cfg.steps.find(s=>s.ordinal===n.ordinal);if(!step)return n;
      if(!v.route)return {...n,kind:step.kind,name:t(step.kind==='scene'?'map.scene':'map.clue',{},locale),story:v.intro,choices:[],endings:[]};
      const s=v.steps.find(x=>x.ordinal===n.ordinal);
      return {...n,kind:step.kind,name:s.name,story:s.story,choices:[],endings:[]};
    });
  }
  /* What to say when a confirmation comes back with another canonical route (second device, simultaneous tap). */
  function conflict(requested,snapshot,locale='fr'){
    const route=snapshot?.branch?.route;
    return route&&requested&&route!==requested?t('pilot.conflict',{route:routeText(route,locale).name},locale):'';
  }
  const api={PILOTS,strings,t,contract,pilotFor,view,nodes,conflict,offlineText:locale=>t('pilot.offline',{},locale)};
  root.TitanAdventureBranches=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
