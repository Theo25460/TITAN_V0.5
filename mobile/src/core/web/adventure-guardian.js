/* V1.5.1 — Gardiens. The Veilleur de pierre as an encounter in three phases (observe, prepare, resolve), at the end of the
   V1.5.0 pilot arc. Shared unchanged by the website and the Android app (mobile/src/core/web/adventure-guardian.js is a byte
   copy, checked by hash). The server stays the authority: phase, thresholds, preparation and outcome come from
   titan_adventure_guardian_snapshot_v1. This module only describes the contract (the server holds the same JSON, checked by
   tests/adventure-guardian.test.mjs) and turns a server snapshot into what both clients show, including the scene state that
   the animation follows and its complete text alternative. It never grants, never stores and never guesses an outcome. */
(function(root){
  'use strict';
  // Every visible string has a key so that the January translation adds a locale without touching the structure.
  const strings={fr:{
    'guardian.title':'Le Veilleur de pierre',
    'guardian.intro':'Le Veilleur garde le passage condamné. Observe-le, prépare ton indice, puis résous la rencontre.',
    'guardian.equal':'Même effort sur les deux voies : les seuils figés de la campagne ouvrent chaque phase.',
    'phase.observe':'Observer','phase.prepare':'Préparer','phase.resolve':'Résoudre',
    'phase.state.done':'terminé','phase.state.active':'en cours','phase.state.waiting':'à venir',
    'locked.text':'Le Veilleur attend plus loin. Rends ton indice utilisable pour l’atteindre.',
    'observe.text':'Le Veilleur se dresse au milieu du passage et le bloque. Approche pour voir ce qu’il garde.',
    'observe.action':'Observer le Veilleur',
    'prepare.text':'Le Veilleur ne bouge pas. Trois signes sont visibles sur lui. Lequel ton indice explique-t-il ?',
    'prepare.choose':'Associer « {clue} » à {sign}',
    'prepare.free':'Aucun effort n’est demandé pour cette étape. Une erreur se corrige autant de fois que nécessaire.',
    'waiting.text':'Ton indice et le signe sont associés. Le Veilleur attend une preuve de ta régularité.',
    'ready.text':'Le serveur confirme l’ouverture. Tu peux résoudre la rencontre.',
    'resolved.text':'La rencontre est close. Sa conséquence t’attendra lors de ton retour dans la Vallée.',
    'legacy.text':'Tu avais déjà franchi le Veilleur avant cette version : ta victoire est conservée telle quelle.',
    'unknown.text':'Cette version de la rencontre n’est pas connue de l’application. Mets-la à jour pour continuer, ta progression est conservée.',
    'threshold':'{effort}/{effortTarget} points · {days}/{daysTarget} jours actifs · chapitre {chapter}/{chapterTarget}',
    'threshold.ready':'Le serveur confirme le seuil.',
    'threshold.remaining':'Ce qui ouvre la suite : {effort} point(s) d’effort et {days} jour(s) actif(s) confirmés{chapter}.',
    'threshold.chapter':', puis le chapitre {chapter} de la campagne',
    'threshold.note':'Ta séance sportive ne demande aucune action dans le jeu. Une séance en attente compte dès sa validation, après actualisation.',
    'resume.title':'Au retour',
    'resume.acquired':'Déjà acquis',
    'resume.next':'Ce qui ouvre la suite',
    'resume.route':'Voie suivie : {route}',
    'resume.clue':'Indice : {clue}',
    'resume.observed':'Veilleur observé',
    'resume.sign':'Signe associé : {sign}',
    'resume.outcome':'Issue : {outcome}',
    'resume.none':'Rien encore : le Veilleur t’attend.',
    'next.locked':'Termine l’étape de l’indice pour atteindre le Veilleur.',
    'next.observe':'Le serveur confirme l’ouverture : observe le Veilleur.',
    'next.prepare':'Associe ton indice à l’un des trois signes. Aucun effort n’est demandé.',
    'next.noContribution':'Aucune séance validée depuis ta préparation.',
    'next.contributions':'{sessions} séance(s) validée(s) depuis ta préparation.',
    'next.ready':'Résous la rencontre : le serveur a confirmé le seuil.',
    'next.resolved':'Rien à faire ici : ta conséquence t’attend dans la Vallée.',
    'corrected':'Une séance corrigée ou en attente ne compte plus : {effort} point(s) retiré(s) de ce monde.',
    'error.GUARDIAN_NOT_OBSERVED':'Observe d’abord le Veilleur.',
    'error.GUARDIAN_NOT_PREPARED':'Associe d’abord ton indice à un signe.',
    'error.INVALID_SIGN':'Ce signe n’existe pas sur le Veilleur.',
    'error.GUARDIAN_INCOMPATIBLE':'Ta campagne garde sa version d’origine pour ce gardien.',
    'error.GUARDIAN_UNAVAILABLE':'Le Veilleur n’est pas disponible dans ce monde.',
    'error.GUARDIAN_CLUE_MISSING':'Le serveur ne trouve pas ton indice utilisable. Actualise tes preuves.',
    'error.ENCOUNTER_INCOMPLETE':'Le seuil n’est pas encore atteint. Reviens à ton rythme, rien n’est perdu.',
    'error.sync':'Synchronisation impossible. Rien n’est perdu : l’écran garde le dernier état confirmé par le serveur. Réessaie.',
    'error.offline':'Hors ligne : la rencontre n’avance qu’avec le serveur. Tes acquis sont conservés.',
    'sign.fissure.name':'la fissure',
    'sign.fissure.text':'Une fissure court sous son sabot avant, là où la paroi a cédé.',
    'sign.gravure.name':'la gravure',
    'sign.gravure.text':'Une gravure couvre son poitrail. Sa dernière ligne manque.',
    'sign.mousse.name':'la mousse',
    'sign.mousse.text':'Une mousse claire couvre ses bois, comme partout dans la vallée.',
    'route.corniche.clue':'La prise dans la roche',
    'route.corniche.right':'La prise s’ajuste à la fissure : c’est là que la paroi peut tenir à nouveau.',
    'route.corniche.wrong.gravure':'La gravure parle d’un serment. Ta prise est une entaille dans la roche : cherche où la paroi a cédé.',
    'route.corniche.wrong.mousse':'La mousse couvre toute la vallée et ne dit rien du passage. Ta prise répond à une fracture de la roche.',
    'route.corniche.watching':'Le Veilleur baisse les yeux vers la fissure que tu as reconnue. Il attend la preuve que la paroi peut tenir.',
    'route.corniche.action':'Rouvrir le passage',
    'route.corniche.outcome.name':'le passage rouvert',
    'route.corniche.outcome.text':'Tu cales la prise dans la fissure et la paroi tient. Le Veilleur s’écarte : le passage est rouvert pour ceux qui viendront.',
    'route.corniche.decisive':'Indice décisif : la prise dans la roche, associée à la fissure.',
    'route.corniche.decision':'Décision : tu as sécurisé la paroi et convaincu le Veilleur de rouvrir le passage.',
    'route.ruines.clue':'Le fragment du serment',
    'route.ruines.right':'Le fragment complète la gravure : c’est la ligne qui manque au serment du Veilleur.',
    'route.ruines.wrong.fissure':'La fissure montre où la paroi a cédé. Ton fragment est un texte gravé : cherche la ligne qui manque.',
    'route.ruines.wrong.mousse':'La mousse couvre toute la vallée et ne dit rien du serment. Ton fragment complète une inscription.',
    'route.ruines.watching':'Le Veilleur baisse les yeux vers la gravure que tu as reconnue. Il attend la ligne manquante de son serment.',
    'route.ruines.action':'Restituer le serment',
    'route.ruines.outcome.name':'le serment restitué',
    'route.ruines.outcome.text':'Tu poses le fragment sur la gravure et lis la ligne manquante. Le Veilleur incline la tête : son serment est complet. Il te confie l’archive des passeurs.',
    'route.ruines.decisive':'Indice décisif : le fragment du serment, associé à la gravure.',
    'route.ruines.decision':'Décision : tu as restitué le serment et le Veilleur t’a confié l’archive des passeurs.',
    'scene.far':'Au loin, le Veilleur de pierre se tient devant le passage condamné.',
    'scene.blocking':'Le Veilleur se tient au milieu du passage et le bloque entièrement.',
    'scene.signs':'Le Veilleur bloque le passage. On voit une fissure sous son sabot, une gravure inachevée sur son poitrail et de la mousse sur ses bois.',
    'scene.aside':'Le Veilleur s’est écarté sur le côté. La paroi tient : le passage est ouvert.',
    'scene.bowing':'Le Veilleur incline la tête. La gravure de son poitrail est complète ; le passage reste sous sa garde.',
    'map.observe':'Face au Veilleur',
    'map.guardian':'Le Veilleur de pierre'
  }};
  function t(key,vars={},locale='fr'){
    const table=strings[locale]||strings.fr,raw=table[key]??strings.fr[key]??key;
    return raw.replace(/\{(\w+)\}/g,(_,k)=>vars[k]!=null?String(vars[k]):'');
  }
  /* The server contract. observeOrdinal and ordinal are encounter-engine milestones of arc 1: their frozen v1 thresholds
     (k x the journey's frozen target, distinct active days, campaign chapter) open the phases, identically on both routes. */
  const GUARDIANS={veilleur:{current:1,versions:{1:{
    id:'veilleur',version:1,pilot:'aube-arc1',pilotVersions:[1],world:'aube',observeOrdinal:5,ordinal:6,
    signs:['fissure','gravure','mousse'],
    routes:[{route:'corniche',clue:'prise',sign:'fissure',outcome:'passage_rouvert'},{route:'ruines',clue:'serment',sign:'gravure',outcome:'serment_restitue'}]
  }}}};
  const contract=(id,version)=>GUARDIANS[id]?.versions?.[version]||null;
  const guardianFor=world=>Object.values(GUARDIANS).map(g=>g.versions[g.current]).find(c=>c.world===world)||null;
  const PHASES=['observe','prepare','resolve'];
  const phaseIndex={locked:0,observe:0,prepare:1,waiting:2,ready:2,resolved:3};

  function thresholdView(th,locale){
    if(!th)return null;
    const effort=Math.max(0,Number(th.effortTarget)-Number(th.effort)),days=Math.max(0,Number(th.daysTarget)-Number(th.days));
    const chapter=Number(th.chapter)<Number(th.chapterTarget)?t('threshold.chapter',{chapter:th.chapterTarget},locale):'';
    return {ordinal:th.ordinal,ready:th.ready===true,
      progress:t('threshold',{effort:Math.min(Number(th.effort),Number(th.effortTarget)),effortTarget:th.effortTarget,days:Math.min(Number(th.days),Number(th.daysTarget)),daysTarget:th.daysTarget,chapter:Math.min(Number(th.chapter),Number(th.chapterTarget)),chapterTarget:th.chapterTarget},locale),
      remaining:th.ready===true?t('threshold.ready',{},locale):t('threshold.remaining',{effort,days,chapter},locale),
      note:t('threshold.note',{},locale)};
  }
  /* Scene state, followed by the animation and fully described by its caption (the alternative without motion). */
  function sceneOf(state,route,locale){
    const s=(pose,extra={})=>({pose,passage:'closed',oath:'incomplete',signs:false,focus:null,...extra});
    let scene;
    if(state==='locked')scene=s('far');
    else if(state==='observe')scene=s('blocking');
    else if(state==='prepare')scene=s('blocking',{signs:true});
    else if(state==='waiting'||state==='ready')scene=s('watching',{signs:true,focus:route==='ruines'?'gravure':'fissure'});
    else if(state==='resolved'&&route==='corniche')scene=s('aside',{passage:'open'});
    else if(state==='resolved')scene=s('bowing',{oath:'complete'});
    else return null;
    const caption=scene.pose==='watching'?t(`route.${route}.watching`,{},locale):t(`scene.${scene.signs&&scene.pose==='blocking'?'signs':scene.pose}`,{},locale);
    return {...scene,caption};
  }

  /* Server snapshot → view model, identical on both clients. Returns null outside the pilot guardian. */
  function view(snapshot,locale='fr'){
    const g=snapshot?.guardian;
    if(!snapshot?.active||!g||g.state==='none')return null;
    const title=t('guardian.title',{},locale);
    if(g.state==='legacy')return {state:'legacy',title,text:t('legacy.text',{},locale)};
    const cfg=contract(g.id,g.version);
    if(!cfg||g.state==='unknown')return {state:'unknown',title,text:t('unknown.text',{},locale)};
    const route=cfg.routes.find(r=>r.route===g.route);
    if(!route)return {state:'unknown',title,text:t('unknown.text',{},locale)};
    const at=phaseIndex[g.state]??0;
    const phases=PHASES.map((id,i)=>({id,name:t(`phase.${id}`,{},locale),state:i<at?'done':i===at?'active':'waiting',
      label:`${t(`phase.${id}`,{},locale)} · ${t(`phase.state.${i<at?'done':i===at?'active':'waiting'}`,{},locale)}`}));
    const clue=t(`route.${route.route}.clue`,{},locale),signName=id=>t(`sign.${id}.name`,{},locale);
    const threshold=['locked','observe','waiting','ready'].includes(g.state)?thresholdView(g.threshold,locale):null;
    const textKey={locked:'locked.text',observe:'observe.text',prepare:'prepare.text',waiting:'waiting.text',ready:'ready.text',resolved:'resolved.text'}[g.state];
    let action=null;
    if(g.state==='observe')action={kind:'claim',ordinal:cfg.observeOrdinal,label:t('observe.action',{},locale),ready:threshold?.ready===true};
    if(g.state==='prepare')action={kind:'prepare',signs:cfg.signs.map(id=>({id,name:signName(id),text:t(`sign.${id}.text`,{},locale),label:t('prepare.choose',{clue,sign:signName(id)},locale),
      chosen:g.lastSign===id})),note:t('prepare.free',{},locale)};
    if(g.state==='waiting'||g.state==='ready')action={kind:'resolve',label:t(`route.${route.route}.action`,{},locale),ready:g.state==='ready'};
    // Feedback on the last interpretation: concrete, tied to the clue, and correctable while preparing.
    let feedback=null;
    if(g.lastSign&&g.lastCorrect===false&&g.state==='prepare')feedback={correct:false,attempts:g.attempts,text:t(`route.${route.route}.wrong.${g.lastSign}`,{},locale)};
    if(g.lastCorrect===true&&g.state!=='resolved')feedback={correct:true,attempts:g.attempts,text:t(`route.${route.route}.right`,{},locale)};
    const outcome=g.state==='resolved'?{id:g.outcome,name:t(`route.${route.route}.outcome.name`,{},locale),text:t(`route.${route.route}.outcome.text`,{},locale),
      decisive:t(`route.${route.route}.decisive`,{},locale),decision:t(`route.${route.route}.decision`,{},locale),resolvedAt:g.resolvedAt}:null;
    // Resume: what is already acquired and what opens the next step, from server facts only.
    const acquired=[t('resume.route',{route:t(`route.${route.route}.name`,{},locale)},locale)];
    if(g.state!=='locked')acquired.push(t('resume.clue',{clue},locale));
    if(g.observedAt)acquired.push(t('resume.observed',{},locale));
    if(g.preparedAt)acquired.push(t('resume.sign',{sign:signName(route.sign)},locale));
    if(outcome)acquired.push(t('resume.outcome',{outcome:outcome.name},locale));
    let next;
    if(g.state==='locked')next=t('next.locked',{},locale);
    else if(g.state==='observe')next=threshold.ready?t('next.observe',{},locale):threshold.remaining;
    else if(g.state==='prepare')next=t('next.prepare',{},locale);
    else if(g.state==='waiting')next=`${Number(g.sincePrepared?.sessions)>0?t('next.contributions',{sessions:g.sincePrepared.sessions},locale):t('next.noContribution',{},locale)} ${threshold.remaining}`;
    else if(g.state==='ready')next=t('next.ready',{},locale);
    else next=t('next.resolved',{},locale);
    const corrected=Number(g.corrected?.effort)>0&&!outcome?t('corrected',{effort:g.corrected.effort},locale):'';
    return {id:cfg.id,version:cfg.version,state:g.state,route:route.route,title,intro:t('guardian.intro',{},locale),equal:t('guardian.equal',{},locale),
      text:t(textKey,{},locale),phases,scene:sceneOf(g.state,route.route,locale),threshold,action,feedback,outcome,clue,
      resume:{title:t('resume.title',{},locale),acquiredTitle:t('resume.acquired',{},locale),nextTitle:t('resume.next',{},locale),acquired,next,corrected},
      observeOrdinal:cfg.observeOrdinal,ordinal:cfg.ordinal};
  }
  // Route names reuse the V1.5.0 keys so that both modules say the same thing.
  strings.fr['route.corniche.name']='la corniche';strings.fr['route.ruines.name']='les ruines';
  /* Map nodes: the guardian ordinals are renamed once a route is confirmed; everything else is left as V1.5.0 made it. */
  function nodes(path,snapshot,locale='fr'){
    const v=view(snapshot,locale);
    if(!v||v.state==='legacy'||v.state==='unknown')return path;
    return path.map(n=>n.ordinal===v.observeOrdinal?{...n,name:t('map.observe',{},locale),story:t('observe.text',{},locale),choices:[],endings:[]}
      :n.ordinal===v.ordinal?{...n,name:t('map.guardian',{},locale),story:v.outcome?v.outcome.text:t('guardian.intro',{},locale),choices:[],endings:[]}:n);
  }
  /* Error code → text. A network failure (or a timeout) is a synchronisation failure: the last server state stays shown. */
  function errorText(code,locale='fr'){
    if(code==='RPG_OFFLINE')return t('error.offline',{},locale);
    if(strings.fr[`error.${code}`])return t(`error.${code}`,{},locale);
    if(code==='RPG_TIMEOUT'||/fetch|network|timeout/i.test(String(code||'')))return t('error.sync',{},locale);
    return '';
  }
  const api={GUARDIANS,strings,t,contract,guardianFor,view,nodes,errorText};
  root.TitanAdventureGuardian=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
