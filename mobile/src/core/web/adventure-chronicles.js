/* V1.5.5 — Chroniques et aventures rejouables. Shared unchanged by the website and the Android app
   (mobile/src/core/web/adventure-chronicles.js is a byte copy, checked by hash).
   The server holds the same replay rules (supabase/migrations/20261128090000_adventure_chronicles_v1.sql, checked by
   tests/adventure-chronicles.test.mjs) and stays the authority: run 1 is read from the facts the arcs already wrote, a new run
   is started, chosen, advanced, solved and resolved by titan_adventure_chronicle_action_v1, one active run per arc.
   This module only turns the server payload into what both clients show: the chronology of decisions, clues and outcomes of
   each run, written with the texts of the arc version that run was played in; the scenes discovered on each route; the outcome
   active in the world (run 1's, which the access of the Camp, the notebook and the campaign keep following); the next step of
   the active run. It never grants, never stores and never guesses a step. A run earns nothing: its reward is its story. */
(function(root){
  'use strict';
  /* The versioned replay rules. A new version is ADDED (never edited): a running run keeps the rules it started with.
     Thresholds are multiples of the journey's frozen target and distinct active days, counted on the world's ledger from the
     run's choice: the same effort as the original arc after its decision (4 x target to the resolution). */
  const RULES={current:1,versions:{1:{id:'chroniques',version:1,arcs:['aube-arc1','marees-arc1','forge-arc1','aurores-arc1'],maxRuns:100,
    steps:[{kind:'scene',effortTargets:1,daysTarget:1},{kind:'clue',effortTargets:2,daysTarget:2},{kind:'observe',effortTargets:3,daysTarget:3},
      {kind:'prepare'},{kind:'resolve',effortTargets:4,daysTarget:3}]}}};
  const KINDS=['scene','clue','observe','prepare','resolve'];
  const WORLDS={aube:'La Vallée de l’Aube',marees:'Les Îles des Marées',forge:'La Forge des Titans',aurores:'Les Hauts des Aurores'};
  const MONTHS=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

  // Every visible string has a key so that the January translation adds a locale without touching the structure.
  const strings={fr:{
    'title':'Chroniques',
    'intro':'Relis tes décisions, tes indices et tes issues. Quand un premier arc est achevé, rejoue-le : une nouvelle partie s’ajoute à la première sans l’effacer.',
    'arc.eyebrow':'{world} · premier arc · version {version}',
    'active':'Issue active dans le monde : {outcome} (partie {run}). Le camp, ton carnet d’indices et la campagne suivent cette issue.',
    'active.none':'Aucune issue n’est encore inscrite dans ce monde pour cet arc.',
    'active.legacy':'Ta campagne historique garde ses acquis tels quels : aucune issue n’est inventée.',
    'discovered.title':'Scènes découvertes',
    'discovered.route':'{route} : {items}',
    'discovered.none':'rien encore',
    'discovered.scene':'la scène','discovered.clue':'l’indice','discovered.outcome':'l’issue',
    'run.heading':'Partie {run}',
    'run.original':'première traversée','run.legacy':'campagne historique · journal v1','run.journal':'journal v1','run.replay':'nouvelle partie',
    'run.version':'version {version} de l’arc',
    'run.state.playing':'en cours','run.state.completed':'terminée','run.state.resolved':'terminée','run.state.abandoned':'abandonnée',
    'run.state.active':'en cours','run.state.unknown':'version inconnue',
    'run.unknown':'Cette version de l’arc n’est pas connue de l’application. Mets-la à jour pour relire cette partie : elle est conservée.',
    'run.read':'Relire cette partie','run.hide':'Refermer cette partie',
    'run.empty':'Rien n’est encore inscrit dans cette partie.',
    'entry.start':'Départ',
    'entry.start.text':'Ton voyage commence dans {world}.',
    'entry.enter':'Entrée dans l’arc',
    'entry.enter.text':'Tu entres dans « {arc} », version {version}.',
    'entry.decision':'Décision : {route}',
    'entry.choice':'Choix : {choice}',
    'entry.observe':'Observation : {guardian}',
    'entry.prepare':'La mécanique résolue',
    'entry.prepare.text':'{attempts} essai(s) pour trouver la bonne réponse.',
    'entry.resolve':'Issue : {outcome}',
    'entry.resolveLegacy':'{guardian} franchi',
    'entry.resolveLegacy.text':'Victoire obtenue avant que les issues soient inscrites : elle est conservée telle quelle.',
    'entry.consequence':'Accès découvert : {name}',
    'entry.quest':'Indice suivi : {clue}',
    'entry.quest.text':'Il ouvre la piste « {chain} ».',
    'entry.questDone':'Piste résolue : {chain}',
    'entry.replayStart':'Nouvelle partie',
    'entry.replayStart.text':'Tu reprends « {arc} » depuis l’embranchement, version {version}. La première partie reste intacte.',
    'entry.abandon':'Partie abandonnée',
    'entry.abandon.text':'Elle reste dans tes chroniques. Une autre partie peut commencer.',
    'start.label':'Rejouer « {arc} »',
    'start.note':'Une nouvelle partie commence à l’embranchement. Tu choisis la voie que tu veux voir. Seules tes séances confirmées après ce choix, dans ce monde, la font avancer. Elle ne donne ni XP, ni crédits, ni récompense : l’issue active dans le monde reste celle de ta première partie.',
    'start.locked':'Termine d’abord le premier arc de ce monde pour le rejouer.',
    'choose.title':'Quelle voie veux-tu parcourir ?',
    'choose.played':'déjà parcourue',
    'choose.new':'jamais parcourue',
    'choose.select':'Choisir {route}',
    'choose.confirmTitle':'Parcourir {route} dans cette partie ?',
    'choose.confirmBody':'Ce choix est définitif pour cette partie. Tes autres parties ne changent pas.',
    'choose.confirm':'Confirmer {route}',
    'choose.back':'Revoir les deux voies',
    'choose.conflict':'Cette partie suivait déjà {route}, choisie depuis un autre appareil. Elle reste sa voie.',
    'step.scene':'La scène','step.clue':'L’indice','step.observe':'Le gardien','step.prepare':'La mécanique','step.resolve':'La résolution',
    'step.action':'Découvrir {name}',
    'step.waiting':'Tes prochaines séances ouvrent la suite, à ton rythme.',
    'step.ready':'Le serveur confirme l’étape.',
    'progress':'{effort}/{effortTarget} points · {days}/{daysTarget} jours actifs depuis ton choix',
    'pending':'Seules les séances confirmées après ton choix, dans ce monde, comptent. Une séance en attente compte dès sa validation, après actualisation.',
    'slot.sign':'Le signe que ton indice explique',
    'solve.attempts':'{attempts} essai(s) dans cette partie.',
    'solve.submit':'Valider cette réponse',
    'solve.free':'Aucun effort n’est demandé pour cette étape. Une erreur se corrige autant de fois que nécessaire.',
    'solve.right':'Bonne réponse : la rencontre peut se résoudre.',
    'solve.wrong':'Ce n’est pas encore ça (case {slot}). Reprends ton indice et réessaie.',
    'solve.incomplete':'Choisis une réponse pour chaque case avant de valider.',
    'resolve.action':'Résoudre la rencontre',
    'abandon.label':'Abandonner cette partie',
    'abandon.confirmTitle':'Abandonner la partie {run} ?',
    'abandon.confirmBody':'Elle reste lisible dans tes chroniques. Tu pourras en commencer une autre.',
    'abandon.confirm':'Abandonner',
    'abandon.back':'Continuer la partie',
    'refresh':'Actualiser mes séances',
    'rules':'Rejouer ne crée aucun gain : ni XP, ni crédits, ni balise, ni récompense. Chaque récompense de la campagne reste attribuée une seule fois, à la première partie.',
    'privacy':'Tes chroniques sont privées. Elles figurent dans l’export de ton compte.',
    'empty':'Tes chroniques commencent avec ta première rencontre dans ce monde.',
    'error.ARC_NOT_COMPLETED':'Termine d’abord le premier arc de ce monde pour le rejouer.',
    'error.REPLAY_UNAVAILABLE':'Cet arc ne peut pas être rejoué dans cette version.',
    'error.REPLAY_NOT_STARTED':'Aucune partie n’est en cours. Commence-en une nouvelle.',
    'error.REPLAY_NOT_ACTIVE':'Cette partie est terminée : elle se relit, elle ne se rejoue plus.',
    'error.REPLAY_NOT_CHOSEN':'Choisis d’abord la voie de cette partie.',
    'error.REPLAY_STEP_ORDER':'Cette étape vient plus tard dans la partie.',
    'error.REPLAY_INCOMPATIBLE':'Cette partie garde sa version d’origine. Mets l’application à jour pour la poursuivre.',
    'error.CHRONICLE_UNAVAILABLE':'Tes chroniques commencent avec ta première rencontre dans ce monde.',
    'error.INVALID_ROUTE':'Cette voie n’existe pas dans cet arc.',
    'error.INVALID_STEP':'Cette étape n’existe pas.',
    'error.INVALID_RUN':'Cette partie n’existe pas.',
    'error.INVALID_ANSWER':'Cette réponse ne correspond pas aux cases de la rencontre. Choisis une réponse par case.',
    'error.ENCOUNTER_INCOMPLETE':'Le seuil n’est pas encore atteint. Reviens à ton rythme, rien n’est perdu.',
    'error.GUARDIAN_NOT_OBSERVED':'Observe d’abord le gardien.',
    'error.GUARDIAN_NOT_PREPARED':'Résous d’abord la mécanique de la rencontre.',
    'error.offline':'Hors ligne : la partie n’avance qu’avec le serveur. Tes chroniques sont conservées.',
    'error.sync':'Synchronisation impossible. Rien n’est perdu : l’écran garde le dernier état confirmé par le serveur. Réessaie.'
  }};
  function t(key,vars={},locale='fr'){
    const table=strings[locale]||strings.fr,raw=table[key]??strings.fr[key]??key;
    return raw.replace(/\{(\w+)\}/g,(_,k)=>vars[k]!=null?String(vars[k]):'');
  }
  const rules=version=>RULES.versions[version]||null;
  const date=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'':`${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;};

  /* The texts of one arc version, read from the modules that own them (V1.5.0 to V1.5.4). null: version unknown here. */
  function content(arc,version,modules={}){
    const B=modules.branches||root.TitanAdventureBranches,G=modules.guardian||root.TitanAdventureGuardian,C=modules.campaigns||root.TitanAdventureCampaigns;
    if(arc==='aube-arc1'){
      const cfg=B?.contract(arc,version),g=G?.contract?.('veilleur',version);
      if(!cfg||!g)return null;
      return {arc,version,world:'aube',title:B.t('pilot.title'),routes:cfg.routes.map(r=>r.id),
        guardian:G.t('guardian.title'),primitive:'pick',
        route:(r,k)=>B.t(`route.${r}.${k}`),step:(r,kind,k)=>B.t(`route.${r}.${kind}.${k}`),
        outcome:(r,k)=>G.t(`route.${r}.outcome.${k}`),observe:()=>G.t('observe.text'),prepare:()=>G.t('prepare.text'),
        slot:()=>t('slot.sign'),token:(slot,id)=>G.t(`sign.${id}.name`)};
    }
    const c=C?.contract(arc,version);if(!c)return null;
    const p=`${c.id}`;
    return {arc,version,world:c.world,title:C.t(`${p}.title`),routes:c.routes.map(r=>r.id),guardian:C.t(`${p}.guardian.name`),primitive:c.guardian.primitive,
      route:(r,k)=>C.t(`${p}.route.${r}.${k}`),step:(r,kind,k)=>C.t(`${p}.route.${r}.${kind}.${k}`),
      outcome:(r,k)=>C.t(`${p}.route.${r}.outcome.${k}`),observe:()=>C.t(`${p}.observe.text`),prepare:()=>C.t(`${p}.prepare.text`),
      slot:id=>C.t(`${p}.slot.${id}`),token:(slot,id)=>C.t(`${p}.token.${id}`)};
  }
  const current=(world,modules={})=>{
    const B=modules.branches||root.TitanAdventureBranches,C=modules.campaigns||root.TitanAdventureCampaigns;
    const cfg=world==='aube'?B?.pilotFor('aube'):C?.campaignFor(world);
    return cfg?content(cfg.id,cfg.version,modules):null;
  };

  /* The chronology of one run, oldest first: what was decided, found and resolved, with the texts of the run's version. */
  function timeline(arc,run,locale='fr',modules={}){
    const R=modules.rpg||root.TitanAdventureRpg,K=modules.consequence||root.TitanAdventureConsequence,Q=modules.quests||root.TitanAdventureQuests;
    const world=arc.world,wn=WORLDS[world]||world,out=[];
    const push=(kind,at,title,text='')=>{if(at)out.push({kind,at,date:date(at),title,text});};
    if(run.kind==='replay'){
      const x=run.state==='unknown'?null:content(run.arc,run.version,modules);
      push('start',run.startedAt,t('entry.replayStart',{},locale),x?t('entry.replayStart.text',{arc:x.title,version:run.version},locale):t('run.unknown',{},locale));
      if(x&&run.route){
        push('decision',run.chosenAt,t('entry.decision',{route:x.route(run.route,'name')},locale),x.route(run.route,'reveals'));
        for(const s of run.steps||[]){
          if(!s.at)continue;
          if(s.kind==='scene'||s.kind==='clue')push(s.kind,s.at,x.step(run.route,s.kind,'name'),x.step(run.route,s.kind,'done'));
          if(s.kind==='observe')push('observe',s.at,t('entry.observe',{guardian:x.guardian},locale),x.observe());
          if(s.kind==='prepare')push('prepare',s.at,t('entry.prepare',{},locale),t('entry.prepare.text',{attempts:run.mechanic?.attempts||1},locale));
          if(s.kind==='resolve')push('resolve',s.at,t('entry.resolve',{outcome:x.outcome(run.route,'name')},locale),x.outcome(run.route,'text'));
        }
      }
      push('abandon',run.abandonedAt,t('entry.abandon',{},locale),t('entry.abandon.text',{},locale));
      return out;
    }
    // Run 1, read from the facts of the arcs. A versioned arc (pilot) speaks with its version's texts; a v1 journal with the
    // narrative catalog it was played with.
    push('start',run.startedAt,t('entry.start',{},locale),t('entry.start.text',{world:wn},locale));
    const x=run.kind==='pilot'?content(run.arc,run.version,modules):null,path=R?.path(world)||[];
    if(run.kind==='pilot'&&x)push('enter',run.enteredAt,t('entry.enter',{},locale),t('entry.enter.text',{arc:x.title,version:run.version},locale));
    for(const m of run.milestones||[]){
      const n=path.find(p=>p.ordinal===m.ordinal)||{};
      if(m.ordinal===2&&x&&run.route)push('decision',m.at,t('entry.decision',{route:x.route(run.route,'name')},locale),x.route(run.route,'reveals'));
      else if(m.ordinal===2&&Number.isInteger(m.choice))push('decision',m.at,t('entry.choice',{choice:n.choices?.[m.choice]||''},locale),n.endings?.[m.choice]||'');
      else if((m.ordinal===3||m.ordinal===4)&&x&&run.route){const kind=m.ordinal===3?'scene':'clue';push(kind,m.at,x.step(run.route,kind,'name'),x.step(run.route,kind,'done'));}
      else if(m.ordinal===5&&x)push('observe',m.at,t('entry.observe',{guardian:x.guardian},locale),x.observe());
      else if(m.ordinal===6&&x&&run.outcome)continue; // told by the resolution below, with its outcome
      else if(m.ordinal===6&&x)push('resolve',m.at,t('entry.resolveLegacy',{guardian:x.guardian},locale),t('entry.resolveLegacy.text',{},locale));
      else push(n.kind||'milestone',m.at,n.name||'',n.story||'');
    }
    if(x&&run.guardian?.preparedAt)push('prepare',run.guardian.preparedAt,t('entry.prepare',{},locale),t('entry.prepare.text',{attempts:run.guardian.attempts||1},locale));
    if(x&&run.outcome)push('resolve',run.resolvedAt,t('entry.resolve',{outcome:x.outcome(run.route,'name')},locale),x.outcome(run.route,'text'));
    if(run.consequence?.discoveredAt){
      const o=run.consequence.outcome,name=K?K.t(`${o}.title`):o;
      push('consequence',run.consequence.discoveredAt,t('entry.consequence',{name},locale),K?K.t(`${o}.camp.open`):'');
    }
    for(const q of run.quests||[]){
      const chain=Q?Q.t(`${q.chain}.title`):q.chain,clue=Q?Q.t(`${q.chain}.clue.${q.clue}.name`):q.clue;
      push('quest',q.startedAt,t('entry.quest',{clue},locale),t('entry.quest.text',{chain},locale));
      push('quest',q.resolvedAt,t('entry.questDone',{chain},locale),Q&&q.manner?Q.t(`${q.chain}.manner.${q.manner}.outcome.text`):'');
    }
    return out.sort((a,b)=>String(a.at).localeCompare(String(b.at)));
  }

  /* The active run's next step, as both clients render it. selection: a route chosen locally, not yet confirmed. */
  function actionOf(arc,run,x,locale,selection={}){
    const target=k=>run.steps?.find(s=>s.kind===k)||{};
    const progress=s=>t('progress',{effort:Math.min(Number(run.effortSince)||0,s.effortTarget||0),effortTarget:s.effortTarget||0,
      days:Math.min(Number(run.daysSince)||0,s.daysTarget||0),daysTarget:s.daysTarget||0},locale);
    const played=new Set((arc.discovered||[]).filter(d=>d.scene||d.clue||d.outcome).map(d=>d.route));
    if(run.state==='choose'){
      const routes=x.routes.map(id=>({id,name:x.route(id,'name'),label:x.route(id,'label'),reveals:x.route(id,'reveals'),
        played:played.has(id),tag:t(played.has(id)?'choose.played':'choose.new',{},locale),selected:selection.route===id,
        select:t('choose.select',{route:x.route(id,'name')},locale)}));
      const chosen=routes.find(r=>r.selected);
      return {kind:'choose',title:t('choose.title',{},locale),routes,confirm:chosen?{id:chosen.id,title:t('choose.confirmTitle',{route:chosen.name},locale),
        body:t('choose.confirmBody',{},locale),label:t('choose.confirm',{route:chosen.name},locale),back:t('choose.back',{},locale)}:null};
    }
    if(['scene','clue','observe'].includes(run.state)){
      const s=target(run.state),name=run.state==='observe'?x.guardian:x.step(run.route,run.state,'name');
      return {kind:'advance',step:run.state,title:t(`step.${run.state}`,{},locale),name,
        teaser:run.state==='observe'?x.observe():x.step(run.route,run.state,'story'),ready:run.ready===true,
        progress:progress(s),readyText:run.ready?t('step.ready',{},locale):t('step.waiting',{},locale),
        label:t('step.action',{name},locale),pending:t('pending',{},locale)};
    }
    if(run.state==='prepare'){
      const m=run.mechanic||{},last=Array.isArray(m.lastAnswer)?m.lastAnswer:[];
      return {kind:'solve',title:t('step.prepare',{},locale),text:x.prepare(),primitive:m.primitive||x.primitive,
        slots:(m.slots||[]).map((sl,i)=>({id:sl.id,label:x.slot(sl.id),tokens:sl.pool.map(id=>({id,name:x.token(sl.id,id),last:last[i]===id,
          selected:(selection.answer||[])[i]===id}))})),
        attempts:m.attempts?t('solve.attempts',{attempts:m.attempts},locale):'',
        feedback:m.lastCorrect===false?{correct:false,text:t('solve.wrong',{slot:m.firstWrong||1},locale)}:null,
        submit:t('solve.submit',{},locale),free:t('solve.free',{},locale),incomplete:t('solve.incomplete',{},locale)};
    }
    if(run.state==='resolve'){
      const s=target('resolve');
      return {kind:'resolve',title:t('step.resolve',{},locale),name:x.guardian,ready:run.ready===true,progress:progress(s),
        feedback:{correct:true,text:t('solve.right',{},locale)},
        readyText:run.ready?t('step.ready',{},locale):t('step.waiting',{},locale),label:t('resolve.action',{},locale),pending:t('pending',{},locale)};
    }
    return null;
  }

  /* Server payload (titan_adventure_chronicles_v1) → the chronicle of one world. null when the world has no journey yet. */
  function view(payload,world,locale='fr',modules={},selection={}){
    const arc=payload?.arcs?.find(a=>a.world===world);
    if(!arc)return {state:'empty',title:t('title',{},locale),intro:t('intro',{},locale),empty:t('empty',{},locale)};
    const cur=content(arc.arc,arc.version,modules)||current(world,modules);
    const original=arc.runs?.[0];
    const runs=(arc.runs||[]).map(run=>{
      const x=run.kind==='replay'?content(run.arc,run.version,modules):run.kind==='pilot'?content(run.arc,run.version,modules):null;
      const unknown=run.state==='unknown'||((run.kind==='replay'||run.kind==='pilot')&&!x);
      const label=run.kind==='replay'?t('run.replay',{},locale):run.kind==='pilot'?t('run.original',{},locale):t(`run.${run.kind}`,{},locale);
      const active=run.kind==='replay'&&run.run===arc.activeRun;
      const stateKey=unknown?'unknown':active?'active':run.state;
      const entries=timeline(arc,run,locale,modules);
      return {run:run.run,kind:run.kind,active,unknown,route:run.route||null,outcome:run.outcome||null,
        heading:t('run.heading',{run:run.run},locale),label,version:run.version?t('run.version',{version:run.version},locale):'',
        state:run.state,stateLabel:t(`run.state.${stateKey}`,{},locale),entries,empty:entries.length?'':t('run.empty',{},locale),
        unknownText:unknown?t('run.unknown',{},locale):'',read:t('run.read',{},locale),hide:t('run.hide',{},locale),
        action:active&&!unknown?actionOf(arc,run,x,locale,selection):null,
        abandon:active&&!unknown?{label:t('abandon.label',{},locale),title:t('abandon.confirmTitle',{run:run.run},locale),
          body:t('abandon.confirmBody',{},locale),confirm:t('abandon.confirm',{},locale),back:t('abandon.back',{},locale)}:null};
    });
    const ao=arc.activeOutcome;
    const active=ao&&cur?t('active',{outcome:cur.outcome(ao.route,'name'),run:ao.run},locale)
      :original?.kind==='legacy'?t('active.legacy',{},locale):t('active.none',{},locale);
    const discovered=cur?(arc.discovered||[]).map(d=>{
      const items=['scene','clue','outcome'].filter(k=>d[k]).map(k=>t(`discovered.${k}`,{},locale));
      return {route:d.route,name:cur.route(d.route,'name'),scene:!!d.scene,clue:!!d.clue,outcome:!!d.outcome,
        text:t('discovered.route',{route:cur.route(d.route,'name'),items:items.length?items.join(', '):t('discovered.none',{},locale)},locale)};
    }):[];
    const start=arc.replayable&&cur?{label:t('start.label',{arc:cur.title},locale),note:t('start.note',{},locale)}:null;
    return {state:'ready',world,arc:arc.arc,title:t('title',{},locale),intro:t('intro',{},locale),
      eyebrow:t('arc.eyebrow',{world:WORLDS[world]||world,version:arc.version},locale),arcTitle:cur?.title||arc.arc,
      active,discoveredTitle:t('discovered.title',{},locale),discovered,runs,activeRun:arc.activeRun||null,
      start,locked:!arc.completed?t('start.locked',{},locale):'',refresh:t('refresh',{},locale),
      rules:t('rules',{},locale),privacy:t('privacy',{},locale)};
  }
  /* What to say when a choice comes back with another route (second device, simultaneous tap). */
  function conflict(requested,payload,world){
    const arc=payload?.arcs?.find(a=>a.world===world),run=arc?.runs?.find(r=>r.run===arc.activeRun)||arc?.runs?.[arc.runs.length-1];
    const x=run&&content(run.arc,run.version);
    return run?.route&&requested&&run.route!==requested&&x?t('choose.conflict',{route:x.route(run.route,'name')}):'';
  }
  function errorText(code,locale='fr'){
    if(code==='RPG_OFFLINE')return t('error.offline',{},locale);
    const k=`error.${code}`;return (strings[locale]||strings.fr)[k]?t(k,{},locale):'';
  }

  /* Automatic control of the rules and of the texts a chronicle needs: every arc of the rules is known with its two routes,
     every route has its scene, clue and outcome; the steps keep their order and the effort of the original arc after its
     decision; no sport, hour or reward in a condition. Returns the list of problems (empty: ok). */
  const FORBIDDEN=/sport|discipline|family|hour|window|time|weekday|minute|duration|pace|speed|distance|xp|credit|reward|beacon/i;
  function keysDeep(o,out=[]){if(o&&typeof o==='object'){for(const [k,v] of Object.entries(o)){out.push(k);keysDeep(v,out);}}return out;}
  function audit(modules={},rulesIn){
    const problems=[],B=modules.branches||root.TitanAdventureBranches,G=modules.guardian||root.TitanAdventureGuardian,C=modules.campaigns||root.TitanAdventureCampaigns;
    for(const r of rulesIn?[rulesIn]:Object.values(RULES.versions)){
      const kinds=(r.steps||[]).map(s=>s.kind);
      if(kinds.join(',')!==KINDS.join(','))problems.push(`rules v${r.version}: steps must be ${KINDS.join(' > ')}`);
      let effort=0,days=0;
      for(const s of r.steps||[]){
        if(s.kind==='prepare'){if('effortTargets' in s||'daysTarget' in s)problems.push(`rules v${r.version}: the mechanic asks no effort`);continue;}
        if(!(s.effortTargets>=1)||!(s.daysTarget>=1&&s.daysTarget<=3))problems.push(`rules v${r.version}: ${s.kind} threshold out of bounds`);
        if(s.effortTargets<effort||s.daysTarget<days)problems.push(`rules v${r.version}: ${s.kind} threshold goes back`);
        effort=s.effortTargets;days=s.daysTarget;
      }
      for(const k of keysDeep(r))if(FORBIDDEN.test(k))problems.push(`rules v${r.version}: forbidden condition key ${k}`);
      if(!(r.maxRuns>=2&&r.maxRuns<=100))problems.push(`rules v${r.version}: maxRuns out of bounds`);
      for(const arc of r.arcs||[]){
        const cfg=arc==='aube-arc1'?B?.contract(arc,1):C?.contract(arc,1);
        if(!cfg){problems.push(`${arc}: unknown arc`);continue;}
        const g=arc==='aube-arc1'?G?.contract?.('veilleur',1):cfg.guardian;
        const resolveOrdinal=arc==='aube-arc1'?g?.ordinal:g?.ordinal,last=(r.steps||[]).find(s=>s.kind==='resolve');
        if(!resolveOrdinal||last?.effortTargets!==resolveOrdinal-cfg.choiceOrdinal)
          problems.push(`${arc}: a run must ask the effort of the original arc after its decision (${resolveOrdinal-cfg.choiceOrdinal} x target)`);
        if(cfg.routes.length!==2)problems.push(`${arc}: two routes expected`);
        const x=content(arc,1,modules);
        for(const route of cfg.routes.map(rt=>rt.id)){
          const texts=[x.route(route,'name'),x.route(route,'reveals'),x.step(route,'scene','name'),x.step(route,'scene','done'),
            x.step(route,'clue','name'),x.step(route,'clue','done'),x.outcome(route,'name'),x.outcome(route,'text')];
          if(texts.some(s=>!s||/^[a-z0-9_.-]+$/.test(s)))problems.push(`${arc}/${route}: a text of the chronicle is missing`);
        }
        if(!x.guardian||/^[a-z0-9_.-]+$/.test(x.guardian))problems.push(`${arc}: guardian name missing`);
      }
    }
    return problems;
  }
  const api={RULES,KINDS,WORLDS,strings,t,rules,content,current,timeline,view,conflict,errorText,audit};
  root.TitanAdventureChronicles=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
