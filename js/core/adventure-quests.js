/* V1.5.4 — Quêtes entre les mondes. Two optional chains of quests: a clue acquired in one world opens a route in another
   one. Shared unchanged by the website and the Android app (mobile/src/core/web/adventure-quests.js is a byte copy, checked
   by hash). The server holds the same JSON (supabase/migrations/20261127090000_adventure_quest_chains_v1.sql, checked by
   tests/adventure-quests.test.mjs) and stays the authority: a clue is a fact the server already holds in the canonical state
   of an existing arc (a guardian outcome, a V1.5.2 access discovered), never a value stored or guessed by a client.
     - dependencies  each chain names the clues that open it, each clue the arc, route and fact that produced it. One clue
                     per route, so a player whose first choice was different finds the same chain by another clue.
     - steps         start (explicit) · link the clue to one mark of the destination (the V1.5.3 primitive "pick") · choose a
                     manner of using what was learnt (definitive) · the next encounter: its scene depends on the manner and
                     opens after one active day confirmed after the choice (any sport, any hour) · resolve.
     - reward        the discovery and the story: a page of the notebook and a scene. No XP, no credits, no beacon.
     - texts         every visible string has a key; the January translation adds a locale without touching the structure.
   audit() is the graph control: cycles, impossible conditions, unreachable chains, scenes without exit, a version that would
   take an engaged access away, and any dependency of a main campaign on a chain. tools/check-quest-graph.mjs runs it. */
(function(root){
  'use strict';
  /* The versioned contracts. A new version is ADDED (never edited): a started chain keeps the version it started with. */
  const CHAINS={
    'atelier-oublie':{current:1,versions:{1:{id:'atelier-oublie',version:1,from:'aube',to:'forge',place:'atelier',
      clues:[
        {id:'symbole-cerf',origin:{fact:'consequence',world:'aube',arc:'aube-arc1',route:'ruines',outcome:'serment_restitue',consequence:'veilleur-retour'},answer:'cerf'},
        {id:'cairn-fendu',origin:{fact:'consequence',world:'aube',arc:'aube-arc1',route:'corniche',outcome:'passage_rouvert',consequence:'veilleur-retour'},answer:'cairn'}],
      link:{primitive:'pick',slot:'gravure',pool:['cerf','cairn','roue','vague']},
      manners:[{id:'cle',outcome:'cle_forgee'},{id:'motifs',outcome:'motifs_transmis'}],
      encounter:{daysTarget:1}}}},
    'feux-cote':{current:1,versions:{1:{id:'feux-cote',version:1,from:'marees',to:'aurores',place:'balise',
      clues:[
        {id:'feu-chenal',origin:{fact:'outcome',world:'marees',arc:'marees-arc1',route:'carte',outcome:'chenal_ouvert',guardian:'gardienne'},answer:'phare'},
        {id:'couplet-etoile',origin:{fact:'outcome',world:'marees',arc:'marees-arc1',route:'gardienne',outcome:'large_franchi',guardian:'gardienne'},answer:'etoile'}],
      link:{primitive:'pick',slot:'balise',pool:['phare','etoile','lac','cairn']},
      manners:[{id:'lanterne',outcome:'feu_rallume'},{id:'livre',outcome:'route_consignee'}],
      encounter:{daysTarget:1}}}}
  };
  const CATALOG=['atelier-oublie','feux-cote'];
  const FACTS=['outcome','consequence','chain'];
  const STATES=['locked','available','link','choose','waiting','ready','resolved'];

  const S={
    'world.aube':'la Vallée de l’Aube','world.marees':'les Îles des Marées','world.forge':'la Forge des Titans','world.aurores':'les Hauts des Aurores',
    'notebook.title':'Carnet d’indices',
    'notebook.intro':'Un indice trouvé dans un monde peut ouvrir une piste facultative dans un autre. Chaque indice garde son origine, son état et sa destination.',
    'notebook.empty':'Aucun indice pour l’instant. Ils viennent des arcs que tu as déjà joués : une victoire, un accès découvert.',
    'notebook.count':'{count} indice(s) trouvé(s)',
    'notebook.rules':'Facultatif. Tes campagnes principales se terminent sans ces pistes. Aucune XP ni aucun crédit : une piste se récompense par sa découverte et par son récit.',
    'notebook.privacy':'Ce carnet reste privé : il n’apparaît ni sur ta carte publique, ni chez tes amis, ni chez ton coach.',
    'map.open':'Carnet d’indices',
    'map.count':'{count} indice(s) · {chains} piste(s)',
    'map.from':'Piste vers {world} : {title}',
    'map.to':'Piste depuis {world} : {title}',
    'clue.state.found':'trouvé','clue.state.followed':'suivi','clue.state.linked':'relié','clue.state.used':'utilisé',
    'clue.origin':'Origine : {origin}',
    'clue.destination':'Destination : {world} · {title}',
    'clue.go':'Voir la piste',
    'chain.eyebrow':'Piste entre les mondes · {from} → {to} · version {version}',
    'chain.state.locked':'à découvrir','chain.state.available':'indice trouvé','chain.state.link':'en cours','chain.state.choose':'en cours',
    'chain.state.waiting':'en cours','chain.state.ready':'scène prête','chain.state.resolved':'terminée',
    'chain.opens':'S’ouvre avec l’un de ces indices :',
    'chain.howTo':'{clue} · {how}',
    'chain.found':'Ton indice : {clue}',
    'chain.start':'Suivre la piste',
    'chain.startNote':'Facultatif et sans échéance. Rien de tes campagnes ne change.',
    'chain.link.title':'Relier ton indice à {place}',
    'chain.link.action':'Choisir {mark}',
    'chain.link.note':'Aucun effort n’est demandé pour cette étape. Une erreur se corrige autant de fois que nécessaire.',
    'chain.attempts':'{attempts} essai(s)',
    'chain.choose.title':'Choisis une manière d’utiliser ce que tu as appris',
    'chain.choose.select':'Choisir : {manner}',
    'chain.choose.confirmTitle':'Confirmer « {manner} » ?',
    'chain.choose.confirmBody':'Ce choix devient définitif pour ce compte, sur le Web comme sur Android. L’autre manière reste lisible dans ton carnet.',
    'chain.choose.confirm':'Confirmer ce choix',
    'chain.choose.back':'Revoir les deux manières',
    'chain.choose.conflict':'Ta manière était déjà choisie depuis un autre appareil : {manner}. Elle reste ton choix.',
    'chain.chosen':'Manière choisie : {manner}',
    'chain.notChosen':'Manière non choisie : {manner}',
    'chain.encounter.title':'La rencontre suivante',
    'chain.encounter.waiting':'La scène s’ouvre à ta prochaine séance confirmée : n’importe quel sport, à l’heure qui te convient.',
    'chain.encounter.progress':'{days}/{daysTarget} jour actif confirmé depuis ton choix',
    'chain.encounter.pending':'Une séance en attente compte dès sa validation, après actualisation. Elle n’est attribuée à aucun monde par cette piste.',
    'chain.encounter.ready':'Le serveur confirme la rencontre.',
    'chain.outcome.eyebrow':'Page ajoutée à ton carnet',
    'chain.decision':'Indice : {clue} · manière : {manner}.',
    'chain.unknown':'Cette version de la piste n’est pas connue de l’application. Mets-la à jour pour continuer, ta progression est conservée.',
    'error.QUEST_UNAVAILABLE':'Cette piste n’existe pas dans cette version.',
    'error.QUEST_LOCKED':'Il te manque l’indice qui ouvre cette piste.',
    'error.QUEST_NOT_STARTED':'Suis d’abord la piste.',
    'error.QUEST_NOT_LINKED':'Relie d’abord ton indice.',
    'error.QUEST_NOT_CHOSEN':'Choisis d’abord une manière.',
    'error.QUEST_INCOMPATIBLE':'Ta piste garde sa version d’origine. Mets l’application à jour pour la voir.',
    'error.INVALID_ANSWER':'Choisis une seule marque parmi celles proposées.',
    'error.INVALID_MANNER':'Cette manière n’existe pas pour cette piste.',
    'error.ENCOUNTER_INCOMPLETE':'La rencontre s’ouvre après une séance confirmée depuis ton choix. Rien ne presse.',
    'error.offline':'Hors ligne : la piste avance avec le serveur. Ton carnet est conservé.',
    'error.sync':'Synchronisation impossible. Rien n’est perdu : l’écran garde le dernier état confirmé par le serveur. Réessaie.'
  };
  /* Per-chain texts, flattened below into '<chain id>.<key>'. */
  const TEXT={
    'atelier-oublie':{
      title:'L’atelier oublié',
      intro:'Une gravure de la Forge répond à un signe rapporté de la Vallée de l’Aube. Relie-les dans ton carnet pour retrouver l’atelier des passeurs.',
      'place':'une gravure de la Forge',
      'clue.symbole-cerf.name':'Le symbole du cerf',
      'clue.symbole-cerf.origin':'la Vallée de l’Aube · voie des ruines · salle annexe de l’archive',
      'clue.symbole-cerf.how':'ouvre la salle annexe de l’archive après ta victoire sur le Veilleur, par les ruines.',
      'clue.symbole-cerf.text':'Sur la gravure qui ouvrait la salle annexe, les bois d’un cerf entourent une enclume.',
      'clue.symbole-cerf.wrong':'Cette gravure ne reprend pas le signe de ta salle annexe. Cherche les bois qui entourent l’enclume.',
      'clue.symbole-cerf.right':'Les bois du cerf gravés dans la Forge reprennent le signe de ta salle annexe. Derrière la porte murée, un atelier attend.',
      'clue.cairn-fendu.name':'Le cairn fendu',
      'clue.cairn-fendu.origin':'la Vallée de l’Aube · voie de la corniche · raccourci du belvédère',
      'clue.cairn-fendu.how':'trouve le raccourci du belvédère après ta victoire sur le Veilleur, par la corniche.',
      'clue.cairn-fendu.text':'Sur ton croquis du belvédère, le cairn fendu porte une marque taillée : un marteau posé sur une pierre.',
      'clue.cairn-fendu.wrong':'Ton croquis montre un marteau posé sur une pierre : cette gravure n’en garde aucune trace.',
      'clue.cairn-fendu.right':'La pierre au marteau reprend la marque de ton cairn. Le mur de la Forge s’entrouvre sur un atelier.',
      'mark.cerf.name':'les bois du cerf','mark.cerf.text':'gravés au-dessus d’une porte murée',
      'mark.cairn.name':'la pierre au marteau','mark.cairn.text':'taillée dans un linteau noirci',
      'mark.roue.name':'la roue dentée','mark.roue.text':'au fronton du grand atelier',
      'mark.vague.name':'la vague','mark.vague.text':'sur la margelle du bac à tremper',
      'scene.name':'L’atelier oublié',
      'scene.story':'Les passeurs de la Vallée y forgeaient leurs repères. Sur l’établi, un moule de clé et un carnet de motifs attendent sous la poussière.',
      'manner.cle.name':'forger la clé des passeurs','manner.cle.label':'Forger la clé des passeurs',
      'manner.cle.reveals':'Tu fondras le métal dans le moule : la clé ouvrira un passage, pas un trésor.',
      'manner.cle.encounter.name':'La porte des passeurs',
      'manner.cle.encounter.teaser':'À la rencontre suivante, ta clé cherchera sa serrure dans la Forge.',
      'manner.cle.encounter.story':'La clé tourne dans la porte murée de la Forge. Derrière, un couloir taillé relie l’atelier à la Vallée de l’Aube.',
      'manner.cle.encounter.action':'Ouvrir la porte des passeurs',
      'manner.cle.outcome.name':'la clé des passeurs',
      'manner.cle.outcome.text':'La porte s’ouvre. Les passeurs pourront de nouveau traverser de la Vallée à la Forge.',
      'manner.motifs.name':'recopier le carnet des motifs','manner.motifs.label':'Recopier le carnet des motifs',
      'manner.motifs.reveals':'Tu recopieras les motifs : ils apprendront aux forgerons à lire les signes de la Vallée.',
      'manner.motifs.encounter.name':'Le forgeron qui lit les signes',
      'manner.motifs.encounter.teaser':'À la rencontre suivante, un forgeron regardera tes motifs.',
      'manner.motifs.encounter.story':'Un forgeron déchiffre les motifs recopiés et grave le signe de la Vallée sur sa nouvelle lame.',
      'manner.motifs.encounter.action':'Montrer les motifs au forgeron',
      'manner.motifs.outcome.name':'les motifs transmis',
      'manner.motifs.outcome.text':'Le forgeron reconnaît les signes. La Forge lit désormais la langue des passeurs.'
    },
    'feux-cote':{
      title:'Les feux de la côte',
      intro:'Une lumière aperçue depuis la mer répond à une balise des Hauts des Aurores. Relie-les dans ton carnet pour rallumer le chemin entre la côte et les sommets.',
      'place':'une balise des Hauts',
      'clue.feu-chenal.name':'Le feu du chenal',
      'clue.feu-chenal.origin':'les Îles des Marées · voie de la carte · le chenal ouvert',
      'clue.feu-chenal.how':'franchis le chenal avec la Gardienne des courants, par la carte des marées.',
      'clue.feu-chenal.text':'Depuis le chenal rouvert, tu as vu un feu briller au sommet d’une falaise, au nord.',
      'clue.feu-chenal.wrong':'Le feu que tu as vu brillait au sommet d’une falaise, face à la mer. Cherche la balise qui la domine.',
      'clue.feu-chenal.right':'La balise du phare domine la falaise que tu as vue depuis le chenal. Une route relie la côte aux Hauts.',
      'clue.couplet-etoile.name':'Le couplet de l’étoile',
      'clue.couplet-etoile.origin':'les Îles des Marées · voie de la Gardienne · le large franchi',
      'clue.couplet-etoile.how':'prends le large avec la Gardienne des courants, en la questionnant.',
      'clue.couplet-etoile.text':'Le chant des courants finit par un couplet : « au large, suis l’étoile qui ne bouge pas ».',
      'clue.couplet-etoile.wrong':'Le couplet parle d’une étoile qui ne bouge pas. Cette balise n’en garde pas la trace.',
      'clue.couplet-etoile.right':'La balise de l’étoile fixe répond au couplet. Une route relie le large aux Hauts.',
      'mark.phare.name':'la balise du phare','mark.phare.text':'au bord de la falaise, face à la mer',
      'mark.etoile.name':'la balise de l’étoile fixe','mark.etoile.text':'orientée vers le nord, où le ciel ne tourne pas',
      'mark.lac.name':'la balise du lac','mark.lac.text':'au milieu des eaux gelées',
      'mark.cairn.name':'la balise du cairn','mark.cairn.text':'au sommet du col',
      'scene.name':'La balise éteinte',
      'scene.story':'Au bout de la route, une balise des Hauts est éteinte. Sa lanterne est intacte et le livre des veilleurs est resté ouvert.',
      'manner.lanterne.name':'rallumer la lanterne','manner.lanterne.label':'Rallumer la lanterne',
      'manner.lanterne.reveals':'Tu rallumeras la lanterne : sa lumière portera jusqu’à la côte.',
      'manner.lanterne.encounter.name':'Le feu de veille',
      'manner.lanterne.encounter.teaser':'À la rencontre suivante, ta lanterne guidera quelqu’un.',
      'manner.lanterne.encounter.story':'La lanterne rallumée guide une barque des Marées jusqu’au pied des Hauts.',
      'manner.lanterne.encounter.action':'Guider la barque',
      'manner.lanterne.outcome.name':'le feu rallumé',
      'manner.lanterne.outcome.text':'La barque accoste. La côte et les sommets se répondent de nouveau, chaque nuit.',
      'manner.livre.name':'écrire la route dans le livre des veilleurs','manner.livre.label':'Écrire la route dans le livre',
      'manner.livre.reveals':'Tu écriras la route dans le livre : les veilleurs sauront la retrouver.',
      'manner.livre.encounter.name':'Le livre des veilleurs',
      'manner.livre.encounter.teaser':'À la rencontre suivante, une veilleuse lira ton livre.',
      'manner.livre.encounter.story':'Une veilleuse lit la route que tu as écrite et la recopie pour les autres balises.',
      'manner.livre.encounter.action':'Confier le livre à la veilleuse',
      'manner.livre.outcome.name':'la route consignée',
      'manner.livre.outcome.text':'La route est consignée. Les veilleurs des Hauts connaissent désormais le chemin de la mer.'
    }
  };
  for(const [id,o] of Object.entries(TEXT))for(const [k,v] of Object.entries(o))S[`${id}.${k}`]=v;
  const strings={fr:S};
  const t=(key,vars={},locale='fr')=>String((strings[locale]||strings.fr)[key]??strings.fr[key]??key).replace(/\{(\w+)\}/g,(_,k)=>vars[k]??'');

  const contract=(id,version)=>{const c=CHAINS[id];return c?.versions[version]?JSON.parse(JSON.stringify(c.versions[version])):null;};
  const current=id=>CHAINS[id]?contract(id,CHAINS[id].current):null;
  const world=(w,locale)=>t(`world.${w}`,{},locale);
  const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;

  /* ---- Views. The payload is the server notebook (titan_adventure_quests_v1); nothing here grants or stores anything. ---- */
  function clueView(item,locale='fr'){
    const p=item.chain,cfg=contract(p,item.version);if(!cfg)return null;
    return {id:item.id,chain:p,state:item.state,stateLabel:t(`clue.state.${item.state}`,{},locale),
      name:t(`${p}.clue.${item.id}.name`,{},locale),text:t(`${p}.clue.${item.id}.text`,{},locale),
      origin:t('clue.origin',{origin:t(`${p}.clue.${item.id}.origin`,{},locale)},locale),originWorld:item.origin?.world,
      destination:t('clue.destination',{world:world(cfg.to,locale),title:t(`${p}.title`,{},locale)},locale),destinationWorld:cfg.to,
      foundAt:item.foundAt||null,href:`/adventure?world=${cfg.to}#quete-${p}`,go:t('clue.go',{},locale)};
  }
  function chainView(item,locale='fr',selected=null){
    if(!item||item.state==='none')return null;
    const p=item.id,title=t(`${p}.title`,{},locale);
    if(item.state==='unknown'||!CHAINS[p])return {id:p,state:'unknown',title,text:t('chain.unknown',{},locale)};
    const cfg=contract(p,item.version);
    if(!cfg)return {id:p,state:'unknown',title,text:t('chain.unknown',{},locale)};
    const base={id:p,version:cfg.version,state:item.state,from:cfg.from,to:cfg.to,title,intro:t(`${p}.intro`,{},locale),
      eyebrow:t('chain.eyebrow',{from:cap(world(cfg.from,locale)),to:world(cfg.to,locale),version:cfg.version},locale),
      stateLabel:t(`chain.state.${item.state}`,{},locale),anchor:`quete-${p}`,rules:t('notebook.rules',{},locale)};
    // What opens the chain, always shown: the dependencies are part of the story.
    const opens=cfg.clues.map(c=>({id:c.id,world:c.origin.world,route:c.origin.route,name:t(`${p}.clue.${c.id}.name`,{},locale),
      how:t(`${p}.clue.${c.id}.how`,{},locale),origin:t(`${p}.clue.${c.id}.origin`,{},locale),
      held:(item.clues||[]).some(x=>x.id===c.id&&x.foundAt)}));
    const clue=item.clue?{id:item.clue,name:t(`${p}.clue.${item.clue}.name`,{},locale),text:t(`${p}.clue.${item.clue}.text`,{},locale)}:null;
    const v={...base,opens,opensTitle:t('chain.opens',{},locale),clue,found:clue?t('chain.found',{clue:clue.name},locale):''};
    if(item.state==='locked')return v;
    if(item.state==='available')return {...v,action:{kind:'start',label:t('chain.start',{},locale),note:t('chain.startNote',{},locale)}};
    const place=t(`${p}.place`,{},locale);
    let feedback=null;
    if(item.lastCorrect===false&&item.state==='link')feedback={correct:false,attempts:item.attempts,text:t(`${p}.clue.${item.clue}.wrong`,{},locale)};
    if(item.lastCorrect===true||['choose','waiting','ready','resolved'].includes(item.state))feedback={correct:true,attempts:item.attempts,text:t(`${p}.clue.${item.clue}.right`,{},locale)};
    if(item.state==='link'){
      const last=Array.isArray(item.lastAnswer)?item.lastAnswer[0]:null;
      return {...v,feedback,attemptsText:item.attempts?t('chain.attempts',{attempts:item.attempts},locale):'',
        action:{kind:'link',title:t('chain.link.title',{place},locale),note:t('chain.link.note',{},locale),
          marks:cfg.link.pool.map(m=>({id:m,name:t(`${p}.mark.${m}.name`,{},locale),text:t(`${p}.mark.${m}.text`,{},locale),
            label:t('chain.link.action',{mark:t(`${p}.mark.${m}.name`,{},locale)},locale),last:m===last}))}};
    }
    const scene={name:t(`${p}.scene.name`,{},locale),story:t(`${p}.scene.story`,{},locale)};
    const manners=cfg.manners.map(m=>({id:m.id,name:t(`${p}.manner.${m.id}.name`,{},locale),label:t(`${p}.manner.${m.id}.label`,{},locale),
      reveals:t(`${p}.manner.${m.id}.reveals`,{},locale),chosen:item.manner===m.id,closed:!!item.manner&&item.manner!==m.id,selected:selected===m.id}));
    if(item.state==='choose'){
      const chosen=manners.find(m=>m.id===selected)||null;
      return {...v,feedback,scene,manners,action:{kind:'choose',title:t('chain.choose.title',{},locale),
        select:manners.map(m=>({id:m.id,label:t('chain.choose.select',{manner:m.label},locale)})),
        confirm:chosen?{id:chosen.id,title:t('chain.choose.confirmTitle',{manner:chosen.label},locale),body:t('chain.choose.confirmBody',{},locale),
          label:t('chain.choose.confirm',{},locale),back:t('chain.choose.back',{},locale)}:null}};
    }
    const manner=manners.find(m=>m.chosen),k=`${p}.manner.${item.manner}`;
    const chosenText=t('chain.chosen',{manner:manner?.label},locale),closedText=manners.filter(m=>m.closed).map(m=>t('chain.notChosen',{manner:m.label},locale));
    const encounter={title:t('chain.encounter.title',{},locale),name:t(`${k}.encounter.name`,{},locale),
      teaser:t(`${k}.encounter.teaser`,{},locale),story:t(`${k}.encounter.story`,{},locale),
      progress:t('chain.encounter.progress',{days:Math.min(Number(item.days)||0,cfg.encounter.daysTarget),daysTarget:cfg.encounter.daysTarget},locale),
      waiting:t('chain.encounter.waiting',{},locale),pending:t('chain.encounter.pending',{},locale),ready:item.state!=='waiting'};
    const out={...v,feedback,scene,manners,manner:item.manner,chosen:chosenText,closed:closedText,encounter};
    if(item.state==='waiting')return {...out,action:{kind:'wait',label:t(`${k}.encounter.action`,{},locale),ready:false}};
    if(item.state==='ready')return {...out,readyText:t('chain.encounter.ready',{},locale),action:{kind:'resolve',label:t(`${k}.encounter.action`,{},locale),ready:true}};
    return {...out,outcome:{id:item.outcome,eyebrow:t('chain.outcome.eyebrow',{},locale),name:t(`${k}.outcome.name`,{},locale),
      text:t(`${k}.outcome.text`,{},locale),decision:t('chain.decision',{clue:clue?.name,manner:manner?.label},locale),resolvedAt:item.resolvedAt||null}};
  }
  function notebook(payload,locale='fr',selected={}){
    const chains=(payload?.chains||[]).map(c=>chainView(c,locale,selected[c.id]||null)).filter(Boolean);
    const clues=(payload?.clues||[]).map(c=>clueView(c,locale)).filter(Boolean);
    return {title:t('notebook.title',{},locale),intro:t('notebook.intro',{},locale),empty:clues.length?'':t('notebook.empty',{},locale),
      count:t('notebook.count',{count:clues.length},locale),clues,chains,rules:t('notebook.rules',{},locale),privacy:t('notebook.privacy',{},locale)};
  }
  /* What the map of a world shows: the button to the notebook and the chains that leave or reach this world. */
  function mapEntries(payload,w,locale='fr'){
    const chains=(payload?.chains||[]).filter(c=>CHAINS[c.id]&&c.state!=='none');
    const clues=(payload?.clues||[]).length,open=chains.filter(c=>!['locked','unknown'].includes(c.state));
    const here=chains.filter(c=>{const cfg=contract(c.id,c.version)||current(c.id);return cfg&&(cfg.from===w||cfg.to===w);}).map(c=>{
      const cfg=contract(c.id,c.version)||current(c.id),out=cfg.from===w;
      return {id:c.id,state:c.state,direction:out?'from':'to',anchor:`quete-${c.id}`,stateLabel:t(`chain.state.${c.state}`,{},locale),
        label:t(out?'map.from':'map.to',{world:world(out?cfg.to:cfg.from,locale),title:t(`${c.id}.title`,{},locale)},locale)};
    });
    return {label:t('map.open',{},locale),count:t('map.count',{count:clues,chains:open.length},locale),clues,open:open.length,here};
  }
  function conflict(requested,item,locale='fr'){
    if(!requested||!item?.manner||item.manner===requested)return '';
    return t('chain.choose.conflict',{manner:t(`${item.id}.manner.${item.manner}.label`,{},locale)},locale);
  }
  function errorText(code,locale='fr'){
    if(code==='RPG_OFFLINE')return t('error.offline',{},locale);
    if(strings.fr[`error.${code}`])return t(`error.${code}`,{},locale);
    if(code==='RPG_TIMEOUT'||/fetch|network|timeout/i.test(String(code||'')))return t('error.sync',{},locale);
    return '';
  }

  /* ---- Graph control. Returns the problems (empty = every chain is reachable, acyclic and ends on its scenes). ---- */
  const FORBIDDEN=/sport|discipline|family|hour|window|time|weekday|minute|duration|pace|speed|distance|xp|credit|reward|beacon|chapter/i;
  function keysDeep(o,out=[]){if(o&&typeof o==='object'){for(const [k,v] of Object.entries(o)){out.push(k);keysDeep(v,out);}}return out;}
  const WORLDS=['aube','marees','forge','aurores'];
  /* The arcs a clue can come from, as the existing modules describe them (V1.5.0 to V1.5.3). */
  function arcsOf(modules){
    const Cm=modules.campaigns||root.TitanAdventureCampaigns,K=modules.consequence||root.TitanAdventureConsequence;
    const arcs={};
    for(const w of WORLDS){const d=Cm?.describe(w,modules);if(d)arcs[w]={id:d.id,guardian:d.guardian.id,routes:d.routes.map(r=>({id:r.id,outcome:r.outcome}))};}
    const consequences={};
    for(const [id,c] of Object.entries(K?.CONSEQUENCES||{})){const k=K.contract(id,c.current);if(k)consequences[id]=k;}
    return {arcs,consequences,campaigns:Cm};
  }
  function audit(modules={}){
    const problems=[],fail=m=>problems.push(m);
    const chains=modules.chains||CHAINS,T=modules.strings||S,text=k=>T[k];
    const {arcs,consequences,campaigns}=arcsOf(modules);
    if(!Object.keys(arcs).length)fail('the arcs of V1.5.0 to V1.5.3 are not available');
    const list=Object.values(chains).map(c=>c.versions[c.current]).filter(Boolean);
    const ids=new Set(list.map(c=>c.id)),clueIds=new Map(),edges=[],reach=new Map();
    // 1. Dependencies: every clue names a fact an existing arc can really produce, on the route it names.
    function possible(c,chain){
      const o=c.origin||{},why=m=>fail(`${chain.id}/${c.id}: impossible condition — ${m}`);
      if(!FACTS.includes(o.fact)){why(`unknown fact ${o.fact}`);return false;}
      if(o.fact==='chain'){
        if(!ids.has(o.chain)){why(`unknown chain ${o.chain}`);return false;}
        const src=list.find(x=>x.id===o.chain);
        if(!src.manners.some(m=>m.outcome===o.outcome)){why(`${o.chain} never ends on ${o.outcome}`);return false;}
        edges.push([chain.id,o.chain]);return true;
      }
      const a=arcs[o.world];
      if(!a){why(`no arc in ${o.world}`);return false;}
      if(a.id!==o.arc){why(`${o.arc} is not the arc of ${o.world}`);return false;}
      const r=a.routes.find(x=>x.id===o.route);
      if(!r){why(`no route ${o.route} in ${o.arc}`);return false;}
      if(r.outcome!==o.outcome){why(`route ${o.route} ends on ${r.outcome}, never on ${o.outcome}`);return false;}
      if(o.fact==='outcome'&&o.guardian!==a.guardian){why(`the guardian of ${o.arc} is ${a.guardian}, not ${o.guardian}`);return false;}
      if(o.fact==='consequence'){
        const k=consequences[o.consequence];
        if(!k||k.world!==o.world){why(`no consequence ${o.consequence} in ${o.world}`);return false;}
        const x=(k.outcomes||[]).find(y=>y.outcome===o.outcome);
        if(!x||x.route!==o.route){why(`${o.consequence} gives no access for ${o.outcome} on ${o.route}`);return false;}
      }
      return true;
    }
    for(const c of list){
      const p=c.id;
      if(!/^[a-z0-9-]{1,40}$/.test(p))fail(`${p}: invalid id`);
      if(!WORLDS.includes(c.from)||!WORLDS.includes(c.to)||c.from===c.to)fail(`${p}: a chain links two different worlds (${c.from} → ${c.to})`);
      const extra=keysDeep({clues:c.clues.map(x=>x.origin),link:c.link,manners:c.manners,encounter:c.encounter}).filter(k=>FORBIDDEN.test(k));
      if(extra.length)fail(`${p}: time window, compulsory discipline or reward in the configuration: ${extra.join(',')}`);
      if(!c.clues?.length)fail(`${p}: no clue opens it`);
      const ok=[];
      for(const x of c.clues||[]){
        if(clueIds.has(x.id))fail(`${p}/${x.id}: the clue already opens ${clueIds.get(x.id)}`);clueIds.set(x.id,p);
        if(possible(x,c))ok.push(x);
        // 2. Scenes without exit: a clue that can never be linked, or a step without its text.
        const res=(campaigns?.check||(()=>({valid:false})))(c.link.primitive,{slots:[{id:c.link.slot,pool:c.link.pool}],answer:[x.answer]},[x.answer]);
        if(!res.valid||!res.correct)fail(`${p}/${x.id}: its mark ${x.answer} is not on the board (scene without exit)`);
        for(const k of ['name','origin','how','text','wrong','right'])if(!text(`${p}.clue.${x.id}.${k}`))fail(`${p}/${x.id}: missing text ${k}`);
      }
      reach.set(p,ok);
      // Alternative route: a player whose first choice was different must find another clue.
      const routes=new Set(ok.filter(x=>x.origin.fact!=='chain').map(x=>`${x.origin.world}:${x.origin.route}`));
      if(ok.length<2||(routes.size<2&&ok.every(x=>x.origin.fact!=='chain')))fail(`${p}: no alternative route for a player whose first choice was different`);
      if(c.link.primitive!=='pick'||!(campaigns?.PRIMITIVES||{})[c.link.primitive])fail(`${p}: unknown link primitive ${c.link.primitive}`);
      if(!Array.isArray(c.link.pool)||c.link.pool.length<2||new Set(c.link.pool).size!==c.link.pool.length)fail(`${p}: the link offers no real decision`);
      for(const m of c.link.pool||[])for(const k of ['name','text'])if(!text(`${p}.mark.${m}.${k}`))fail(`${p}: missing text for the mark ${m}`);
      if(new Set((c.clues||[]).map(x=>x.answer)).size!==(c.clues||[]).length)fail(`${p}: two clues share the same mark`);
      const manners=c.manners||[];
      if(manners.length<2)fail(`${p}: fewer than two manners, no real choice`);
      if(new Set(manners.map(m=>m.id)).size!==manners.length)fail(`${p}: two manners share an id`);
      if(manners.some(m=>!/^[a-z0-9_]{1,40}$/.test(m.outcome||'')))fail(`${p}: a manner has no outcome (scene without exit)`);
      if(new Set(manners.map(m=>m.outcome)).size!==manners.length)fail(`${p}: two manners end on the same scene`);
      for(const m of manners)for(const k of ['name','label','reveals','encounter.name','encounter.teaser','encounter.story','encounter.action','outcome.name','outcome.text'])
        if(!text(`${p}.manner.${m.id}.${k}`))fail(`${p}/${m.id}: missing text ${k} (scene without exit)`);
      for(const k of ['title','intro','place','scene.name','scene.story'])if(!text(`${p}.${k}`))fail(`${p}: missing text ${k}`);
      const d=c.encounter?.daysTarget,keys=Object.keys(c.encounter||{});
      if(!Number.isInteger(d)||d<1||d>3||keys.some(k=>k!=='daysTarget'))fail(`${p}: impossible condition — the next encounter asks ${JSON.stringify(c.encounter)} (1 to 3 active days only)`);
      // 3. Every state has a way out until the resolution, for every clue and every manner.
      const next={locked:'available',available:'link',link:'choose',choose:'waiting',waiting:'ready',ready:'resolved'};
      for(const x of ok)for(const m of manners){let s='locked',n=0;while(s!=='resolved'&&n<10){s=next[s];n++;}if(s!=='resolved')fail(`${p}/${x.id}/${m.id}: never resolved`);}
      // 4. Versions: a later version may add clues, never remove one (an engaged account keeps its access anyway).
      const vs=Object.keys(chains[p]?.versions||{}).map(Number).sort((a,b)=>a-b);
      for(let i=1;i<vs.length;i++){
        const before=chains[p].versions[vs[i-1]].clues.map(x=>x.id),after=new Set(chains[p].versions[vs[i]].clues.map(x=>x.id));
        const lost=before.filter(x=>!after.has(x));
        if(lost.length)fail(`${p}: version ${vs[i]} removes ${lost.join(',')} — an account holding it would lose the access`);
        if(chains[p].versions[vs[i]].version!==vs[i])fail(`${p}: version ${vs[i]} is labelled ${chains[p].versions[vs[i]].version}`);
      }
      if(chains[p]?.versions[chains[p].current]?.version!==chains[p]?.current)fail(`${p}: the current version is not declared`);
    }
    // 5. Cycles between chains, then reachability from the arcs (a chain only fed by a cycle can never open).
    const deps=new Map(list.map(c=>[c.id,edges.filter(e=>e[0]===c.id).map(e=>e[1])]));
    const seen=new Set(),stack=[];
    const visit=n=>{if(stack.includes(n)){fail(`cycle: ${[...stack.slice(stack.indexOf(n)),n].join(' → ')}`);return;}if(seen.has(n))return;stack.push(n);for(const m of deps.get(n)||[])visit(m);stack.pop();seen.add(n);};
    for(const c of list)visit(c.id);
    const reachable=new Set();let grew=true;
    while(grew){grew=false;for(const c of list){if(reachable.has(c.id))continue;
      if((reach.get(c.id)||[]).some(x=>x.origin.fact!=='chain'||(reachable.has(x.origin.chain))))(reachable.add(c.id),grew=true);}}
    for(const c of list)if(!reachable.has(c.id))fail(`${c.id}: unreachable — no arc of the four worlds can open it`);
    // 6. Independence: no main campaign configuration names a chain (nothing in a campaign waits for one).
    const camp=JSON.stringify([campaigns?.CAMPAIGNS||{},(modules.consequence||root.TitanAdventureConsequence)?.CONSEQUENCES||{}]);
    for(const c of list)if(camp.includes(c.id)||c.clues.some(x=>camp.includes(`"${x.id}"`)))fail(`${c.id}: a main campaign depends on this chain`);
    const nodes=list.flatMap(c=>[c.id,...c.clues.map(x=>`${x.origin.world||x.origin.chain}:${x.origin.route||''}:${x.origin.outcome}`)]);
    return {problems,chains:list.map(c=>c.id),clues:[...clueIds.keys()],edges,nodes:[...new Set(nodes)]};
  }

  const api={CHAINS,CATALOG,FACTS,STATES,strings,t,contract,current,clueView,chainView,notebook,mapEntries,conflict,errorText,audit};
  root.TitanAdventureQuests=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
