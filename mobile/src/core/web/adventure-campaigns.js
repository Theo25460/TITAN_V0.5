/* V1.5.3 — Quatre mondes, quatre mécaniques. One common, versioned configuration for the first arc of every world, shared
   unchanged by the website and the Android app (mobile/src/core/web/adventure-campaigns.js is a byte copy, checked by hash).
   The Vallée de l'Aube keeps its V1.5.0/V1.5.1 contracts (aube-arc1 v1 + veilleur v1, modules adventure-branches.js and
   adventure-guardian.js); the Marées, the Forge and the Aurores get the same engine, configured here:
     - conditions   the V1.5.0 branch steps (scene, clue) counted from the decision, then the frozen v1 milestones 5 and 6;
                    the same multiples of the journey's frozen target and the same active days in every world and on every
                    route. No real time window, no compulsory discipline: a condition only knows effort points and days.
     - scenes       one choice (the encounter engine's canonical choice, ordinal 2) changes the scene, the clue and the
                    resolution of the arc.
     - mechanics    one decision mechanic per world, built on one primitive common to the encounter engine: a list of slots,
                    each answered with one token of its pool, checked by the server (titan_adventure_mechanic_check).
                    pick (Aube, the Veilleur's sign) · chart (Marées, map of currents then passage) · sequence (Forge, order
                    of the pieces) · link (Aurores, chain of beacons).
     - texts        every visible string has a key; the January translation adds a locale without touching the structure.
   The server holds the same JSON (supabase/migrations/20261126090000_adventure_campaigns_v1.sql, checked by
   tests/adventure-campaigns.test.mjs) and stays the authority. audit() is the automatic dead-path control: every choice
   leads to a route, every route to a solvable mechanic and a resolution, every declared resolution is reachable. */
(function(root){
  'use strict';
  const STEPS=[{ordinal:3,kind:'scene',effortTargets:1,daysTarget:1},{ordinal:4,kind:'clue',effortTargets:2,daysTarget:2}];
  /* The versioned contracts. A new version is ADDED (never edited): a running arc keeps the version it entered. */
  const CAMPAIGNS={
    'marees-arc1':{current:1,versions:{1:{id:'marees-arc1',version:1,world:'marees',arc:1,choiceOrdinal:2,steps:STEPS,
      guardian:{id:'gardienne',observeOrdinal:5,ordinal:6,primitive:'chart'},
      routes:[
        {id:'carte',choice:0,clue:'releve',outcome:'chenal_ouvert',
          slots:[{id:'nord',pool:['est','ouest','calme']},{id:'sud',pool:['est','ouest','calme']},{id:'passage',pool:['chenal','recifs','large']}],answer:['est','ouest','chenal']},
        {id:'gardienne',choice:1,clue:'chant',outcome:'large_franchi',
          slots:[{id:'nord',pool:['est','ouest','calme']},{id:'sud',pool:['est','ouest','calme']},{id:'passage',pool:['chenal','recifs','large']}],answer:['calme','est','large']}]}}},
    'forge-arc1':{current:1,versions:{1:{id:'forge-arc1',version:1,world:'forge',arc:1,choiceOrdinal:2,steps:STEPS,
      guardian:{id:'artisan',observeOrdinal:5,ordinal:6,primitive:'sequence'},
      routes:[
        {id:'soufflet',choice:0,clue:'plan',outcome:'foyer_ranime',
          slots:[{id:'p1',pool:['charniere','cuir','buse','ressort']},{id:'p2',pool:['charniere','cuir','buse','ressort']},{id:'p3',pool:['charniere','cuir','buse','ressort']}],answer:['charniere','cuir','buse']},
        {id:'artisans',choice:1,clue:'chanson',outcome:'enclume_chantante',
          slots:[{id:'p1',pool:['axe','ressort','tete','cuir']},{id:'p2',pool:['axe','ressort','tete','cuir']},{id:'p3',pool:['axe','ressort','tete','cuir']}],answer:['axe','ressort','tete']}]}}},
    'aurores-arc1':{current:1,versions:{1:{id:'aurores-arc1',version:1,world:'aurores',arc:1,choiceOrdinal:2,steps:STEPS,
      guardian:{id:'sentinelle',observeOrdinal:5,ordinal:6,primitive:'link'},
      routes:[
        {id:'constellations',choice:0,clue:'carte-ciel',outcome:'balises_rallumees',
          slots:[{id:'depart',pool:['cairn','lac','rocher','col']},{id:'etape',pool:['cairn','lac','rocher','col']},{id:'arrivee',pool:['cairn','lac','rocher','col']}],answer:['cairn','lac','col']},
        {id:'histoire',choice:1,clue:'recit',outcome:'recit_transmis',
          slots:[{id:'depart',pool:['rocher','pin','cairn','col']},{id:'etape',pool:['rocher','pin','cairn','col']},{id:'arrivee',pool:['rocher','pin','cairn','col']}],answer:['rocher','pin','col']}]}}}
  };
  const PRIMITIVES={pick:{distinct:false},chart:{distinct:false},sequence:{distinct:true},link:{distinct:true}};
  // The Vallée keeps its own contracts; the common configuration only references them (and the audit checks them too).
  const AUBE={world:'aube',pilot:'aube-arc1',version:1,guardian:'veilleur',primitive:'pick'};

  const S={
    // Common to the three new arcs (same wording as the V1.5.0/V1.5.1 modules where the meaning is the same).
    'pilot.enter':'Découvrir les deux voies',
    'pilot.enterNote':'Entrée facultative dans le premier arc. Tes XP, crédits, jours actifs et objectifs de campagne ne changent pas.',
    'pilot.equal':'Même effort pour les deux voies, et dans les quatre mondes : {effort} points d’effort confirmés et {days} jours actifs après ta décision. N’importe quel sport compte, à l’heure qui te convient.',
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
    'pilot.legacy':'Ta campagne avait déjà passé cet embranchement : elle garde sa version d’origine et tous ses acquis.',
    'pilot.offline':'Hors ligne : ta décision n’est pas envoyée. Reconnecte-toi pour la confirmer.',
    'pilot.unknown':'Cette version de l’arc n’est pas connue de l’application. Mets-la à jour pour continuer, ta progression est conservée.',
    'pilot.clueFound':'Indice trouvé',
    'pilot.clueUsable':'Indice utilisable face à {guardian}',
    'guardian.equal':'Même effort sur les deux voies et dans les quatre mondes : les seuils figés de la campagne ouvrent chaque phase.',
    'phase.observe':'Observer','phase.resolve':'Résoudre',
    'phase.state.done':'terminé','phase.state.active':'en cours','phase.state.waiting':'à venir',
    'threshold':'{effort}/{effortTarget} points · {days}/{daysTarget} jours actifs · chapitre {chapter}/{chapterTarget}',
    'threshold.ready':'Le serveur confirme le seuil.',
    'threshold.remaining':'Ce qui ouvre la suite : {effort} point(s) d’effort et {days} jour(s) actif(s) confirmés{chapter}.',
    'threshold.chapter':', puis le chapitre {chapter} de la campagne',
    'threshold.note':'Ta séance sportive ne demande aucune action dans le jeu. Une séance en attente compte dès sa validation, après actualisation.',
    'solve.free':'Aucun effort n’est demandé pour cette étape. Une erreur se corrige autant de fois que nécessaire.',
    'solve.incomplete':'Choisis une réponse pour chaque case avant de valider.',
    'solve.used':'déjà dans une autre case',
    'resume.title':'Au retour','resume.acquired':'Déjà acquis','resume.next':'Ce qui ouvre la suite',
    'resume.route':'Voie suivie : {route}','resume.clue':'Indice : {clue}',
    'resume.answer':'{answerTitle} : {answer}','resume.outcome':'Issue : {outcome}',
    'next.noContribution':'Aucune séance validée depuis ta préparation.',
    'next.contributions':'{sessions} séance(s) validée(s) depuis ta préparation.',
    'next.ready':'Résous la rencontre : le serveur a confirmé le seuil.',
    'next.resolved':'Rien à faire ici : ta victoire est inscrite dans ce monde.',
    'resolved.text':'La rencontre est close. Le serveur a inscrit son issue pour ce compte, sur le Web comme sur Android.',
    'legacy.text':'Tu avais déjà franchi ce gardien avant cette version : ta victoire est conservée telle quelle.',
    'unknown.text':'Cette version de la rencontre n’est pas connue de l’application. Mets-la à jour pour continuer, ta progression est conservée.',
    'corrected':'Une séance corrigée ou en attente ne compte plus : {effort} point(s) retiré(s) de ce monde.',
    'error.INVALID_ANSWER':'Cette réponse ne correspond pas aux cases de la rencontre. Choisis une réponse par case.',
    'error.GUARDIAN_NOT_OBSERVED':'Observe d’abord le gardien.',
    'error.GUARDIAN_NOT_PREPARED':'Résous d’abord la mécanique de la rencontre.',
    'error.GUARDIAN_INCOMPATIBLE':'Ta campagne garde sa version d’origine pour ce gardien.',
    'error.GUARDIAN_UNAVAILABLE':'Ce gardien n’est pas disponible dans ce monde.',
    'error.GUARDIAN_CLUE_MISSING':'Le serveur ne trouve pas ton indice utilisable. Actualise tes preuves.',
    'error.ENCOUNTER_INCOMPLETE':'Le seuil n’est pas encore atteint. Reviens à ton rythme, rien n’est perdu.',
    'error.sync':'Synchronisation impossible. Rien n’est perdu : l’écran garde le dernier état confirmé par le serveur. Réessaie.',
    'error.offline':'Hors ligne : la rencontre n’avance qu’avec le serveur. Tes acquis sont conservés.'
  };
  /* Per-arc texts, flattened below into '<arc id>.<key>'. */
  const TEXT={
    'marees-arc1':{
      title:'La carte brouillée',
      intro:'La carte de la crique est brouillée : ses courants ont été effacés. Deux voies mènent à la Gardienne des courants : choisis comment les retrouver.',
      'map.choice':'La carte brouillée','map.scene':'Carte ou ponton','map.clue':'Un courant à relever','map.observe':'Face à la Gardienne','map.guardian':'La Gardienne des courants',
      'guardian.name':'La Gardienne des courants','guardian.short':'la Gardienne','resume.observed':'Gardienne des courants observée',
      'guardian.intro':'La Gardienne veille sur l’île. Observe-la, reconstitue la carte des courants, puis choisis ton passage.',
      'phase.prepare':'Tracer la carte',
      'locked.text':'La Gardienne attend plus loin. Rends ton indice utilisable pour l’atteindre.',
      'observe.text':'La Gardienne se tient au bord de l’eau. Entre elle et toi, la carte des courants est illisible.',
      'observe.action':'Observer la Gardienne',
      'prepare.text':'Reporte sur la carte le courant que tu as observé au nord et au sud, puis choisis le passage qu’ils désignent.',
      'prepare.submit':'Tracer la carte et choisir ce passage',
      'waiting.text':'Ta carte est tracée. La Gardienne attend une preuve de ta régularité avant de te laisser passer.',
      'ready.text':'Le serveur confirme l’ouverture. Tu peux franchir le passage.',
      'next.locked':'Termine l’étape de l’indice pour atteindre la Gardienne.',
      'next.observe':'Le serveur confirme l’ouverture : observe la Gardienne.',
      'next.prepare':'Reporte tes observations sur la carte. Aucun effort n’est demandé.',
      'answer.title':'Carte tracée',
      'slot.nord':'Courant au nord de la crique','slot.sud':'Courant au sud de la crique','slot.passage':'Passage vers l’île',
      'token.est':'vers l’est','token.ouest':'vers l’ouest','token.calme':'calme',
      'token.chenal':'le chenal du nord','token.recifs':'la passe des récifs','token.large':'le large',
      'scene.far':'Au loin, la Gardienne des courants veille sur son île, derrière une carte brouillée.',
      'scene.blocking':'La Gardienne se tient au bord de l’eau. Les courants entre elle et toi sont illisibles.',
      'scene.signs':'La carte de la crique est étalée devant la Gardienne : deux courants et un passage restent à tracer.',
      'route.carte.name':'la carte des marées','route.carte.label':'Lire la carte des marées',
      'route.carte.reveals':'Tu relèveras les courants depuis le rivage, à l’aide de la carte mouillée.',
      'route.carte.scene.name':'La crique des cartes','route.carte.scene.story':'La carte mouillée sèche sur un rocher. L’encre a coulé, mais quelques flèches restent lisibles.',
      'route.carte.scene.action':'Déplier la carte','route.carte.scene.done':'Une flèche intacte le montre : au nord, le courant porte vers l’est.',
      'route.carte.clue.name':'Le relevé des bouées','route.carte.clue.story':'Trois bouées dérivent à l’entrée de la crique. Leur dérive dit où va l’eau.',
      'route.carte.clue.action':'Relever les bouées','route.carte.clue.done':'Au sud, les bouées dérivent vers l’ouest. Porté vers l’est, le chenal du nord mène droit à l’île.',
      'route.carte.right':'Ta carte est juste : le courant du nord porte vers l’est, celui du sud vers l’ouest, et le chenal du nord mène à l’île.',
      'route.carte.wrong.nord':'Ta carte mouillée garde une flèche intacte au nord. Relis-la avant de tracer ce courant.',
      'route.carte.wrong.sud':'Les bouées du sud ne dérivent pas dans ce sens. Reprends ton relevé.',
      'route.carte.wrong.passage':'Tes deux courants ne portent pas vers ce passage. Choisis celui que ton relevé désigne.',
      'route.carte.watching':'La Gardienne suit du regard le chenal du nord que tu as tracé. Elle attend la preuve de ta régularité.',
      'route.carte.action':'Franchir le chenal',
      'route.carte.outcome.name':'le chenal ouvert',
      'route.carte.outcome.text':'Tu engages ta barque dans le chenal du nord. La Gardienne reconnaît le courant que tu as lu et lève la chaîne qui fermait le chenal.',
      'route.carte.decisive':'Indice décisif : le relevé des bouées, reporté sur la carte des courants.',
      'route.carte.decision':'Décision : tu as choisi le chenal du nord, et la Gardienne l’a rouvert pour les navigateurs.',
      'route.carte.resolved':'La chaîne du chenal est levée. La Gardienne te fait signe depuis l’île.',
      'route.gardienne.name':'la Gardienne','route.gardienne.label':'Questionner la gardienne',
      'route.gardienne.reveals':'Tu écouteras ceux qui connaissent la mer pour retrouver les courants.',
      'route.gardienne.scene.name':'Le ponton des pêcheurs','route.gardienne.scene.story':'Les pêcheurs réparent leurs filets au bout du ponton. Ils parlent des courants comme de vieux voisins.',
      'route.gardienne.scene.action':'Écouter les pêcheurs','route.gardienne.scene.done':'Les pêcheurs le répètent : au nord, l’eau reste calme toute la journée.',
      'route.gardienne.clue.name':'Le chant des courants','route.gardienne.clue.story':'Une vieille chanson de marins décrit le chemin de l’île.',
      'route.gardienne.clue.action':'Retrouver le chant','route.gardienne.clue.done':'Le chant le dit : au sud, le courant porte vers l’est. En le suivant par le large, on atteint l’île sans toucher les récifs.',
      'route.gardienne.right':'Ta carte est juste : le nord est calme, le courant du sud porte vers l’est, et le large mène à l’île.',
      'route.gardienne.wrong.nord':'Les pêcheurs ont décrit l’eau du nord autrement. Repense à ce qu’ils répètent.',
      'route.gardienne.wrong.sud':'Le chant ne dit pas que le courant du sud va dans ce sens. Reprends le couplet.',
      'route.gardienne.wrong.passage':'Le chant évite ce passage. Choisis celui qu’il désigne pour suivre le courant du sud.',
      'route.gardienne.watching':'La Gardienne suit du regard la route du large que tu as tracée. Elle attend la preuve de ta régularité.',
      'route.gardienne.action':'Prendre le large',
      'route.gardienne.outcome.name':'le large franchi',
      'route.gardienne.outcome.text':'Tu suis le courant du sud jusqu’au large. La Gardienne t’attend sur l’île et confie le chant aux navigateurs qui viendront.',
      'route.gardienne.decisive':'Indice décisif : le chant des courants, reporté sur la carte.',
      'route.gardienne.decision':'Décision : tu as pris le large, et la Gardienne a confié le chant des courants aux navigateurs.',
      'route.gardienne.resolved':'Le courant du sud t’a porté jusqu’à l’île. La Gardienne chante avec toi.'
    },
    'forge-arc1':{
      title:'Le foyer froid',
      intro:'Le foyer de la Forge est froid et son mécanisme est démonté. Deux voies mènent à l’Artisan de braise : choisis ce que tu veux restaurer.',
      'map.choice':'Le foyer froid','map.scene':'Soufflet ou banc des artisans','map.clue':'Un ordre à retrouver','map.observe':'Face à l’Artisan','map.guardian':'L’Artisan de braise',
      'guardian.name':'L’Artisan de braise','guardian.short':'l’Artisan','resume.observed':'Artisan de braise observé',
      'guardian.intro':'L’Artisan garde le foyer éteint. Observe-le, remonte les pièces dans le bon ordre, puis restaure le mécanisme.',
      'phase.prepare':'Assembler',
      'locked.text':'L’Artisan attend plus loin. Rends ton indice utilisable pour l’atteindre.',
      'observe.text':'L’Artisan se tient devant l’établi. Les pièces du mécanisme sont étalées, sans ordre.',
      'observe.action':'Observer l’Artisan',
      'prepare.text':'Place les pièces dans l’ordre du montage : la première, la deuxième, puis la troisième. Une pièce de trop reste sur l’établi.',
      'prepare.submit':'Monter les pièces dans cet ordre',
      'waiting.text':'Les pièces sont montées. L’Artisan attend une preuve de ta régularité avant d’allumer le mécanisme.',
      'ready.text':'Le serveur confirme l’ouverture. Tu peux remettre le mécanisme en marche.',
      'next.locked':'Termine l’étape de l’indice pour atteindre l’Artisan.',
      'next.observe':'Le serveur confirme l’ouverture : observe l’Artisan.',
      'next.prepare':'Remonte les pièces dans l’ordre. Aucun effort n’est demandé.',
      'answer.title':'Ordre de montage',
      'slot.p1':'Première pièce','slot.p2':'Deuxième pièce','slot.p3':'Troisième pièce',
      'token.charniere':'la charnière','token.cuir':'le cuir','token.buse':'la buse','token.ressort':'le ressort','token.axe':'l’axe','token.tete':'la tête du marteau',
      'scene.far':'Au loin, l’Artisan de braise veille sur le foyer froid de la Forge.',
      'scene.blocking':'L’Artisan se tient devant l’établi. Les pièces du mécanisme sont étalées, sans ordre.',
      'scene.signs':'Sur l’établi de l’Artisan, quatre pièces attendent : trois forment le mécanisme, une est de trop.',
      'route.soufflet.name':'le soufflet','route.soufflet.label':'Réparer le vieux soufflet',
      'route.soufflet.reveals':'Tu retrouveras l’ordre des pièces du soufflet qui ranime le foyer.',
      'route.soufflet.scene.name':'Le soufflet crevé','route.soufflet.scene.story':'Le grand soufflet gît près du foyer, sa toile percée. Ses pièces sont rangées dans un coffre.',
      'route.soufflet.scene.action':'Ouvrir le coffre','route.soufflet.scene.done':'Sur le couvercle, un croquis : d’abord la charnière, qui tient le cadre.',
      'route.soufflet.clue.name':'Le plan du soufflet','route.soufflet.clue.story':'Le plan de l’atelier est cloué au mur, à demi brûlé.',
      'route.soufflet.clue.action':'Déchiffrer le plan','route.soufflet.clue.done':'Le plan se lit enfin : la charnière, puis le cuir, puis la buse qui souffle dans le foyer.',
      'route.soufflet.right':'L’ordre est juste : la charnière tient le cadre, le cuir le couvre, la buse souffle dans le foyer.',
      'route.soufflet.wrong.p1':'Le croquis du couvercle commence par la pièce qui tient le cadre. Reprends depuis la première pièce.',
      'route.soufflet.wrong.p2':'Après la charnière, le plan montre ce qui couvre le cadre.',
      'route.soufflet.wrong.p3':'La dernière pièce du plan est celle qui souffle dans le foyer.',
      'route.soufflet.watching':'L’Artisan pose la main sur le soufflet remonté. Il attend la preuve de ta régularité.',
      'route.soufflet.action':'Ranimer le foyer',
      'route.soufflet.outcome.name':'le foyer ranimé',
      'route.soufflet.outcome.text':'Le soufflet remonté pousse l’air dans le foyer. La braise reprend : l’Artisan rallume la Forge pour ceux qui viendront.',
      'route.soufflet.decisive':'Indice décisif : le plan du soufflet, suivi pièce après pièce.',
      'route.soufflet.decision':'Décision : tu as restauré le soufflet, et l’Artisan a ranimé le foyer.',
      'route.soufflet.resolved':'Le foyer brûle de nouveau. L’Artisan entretient la braise.',
      'route.artisans.name':'les artisans','route.artisans.label':'Écouter les artisans',
      'route.artisans.reveals':'Tu apprendras des artisans comment remonter le marteau de l’enclume.',
      'route.artisans.scene.name':'Le banc des artisans','route.artisans.scene.story':'Les artisans se reposent autour de l’enclume muette. Le grand marteau est démonté à leurs pieds.',
      'route.artisans.scene.action':'S’asseoir avec eux','route.artisans.scene.done':'Le plus âgé le rappelle : tout commence par l’axe, sinon rien ne tient.',
      'route.artisans.clue.name':'La chanson de l’enclume','route.artisans.clue.story':'Les artisans fredonnent la chanson du montage, couplet après couplet.',
      'route.artisans.clue.action':'Apprendre la chanson','route.artisans.clue.done':'La chanson le dit : l’axe, puis le ressort, puis la tête du marteau.',
      'route.artisans.right':'L’ordre est juste : l’axe porte le ressort, et le ressort lance la tête du marteau.',
      'route.artisans.wrong.p1':'Le plus âgé des artisans l’a dit : tout commence par une autre pièce. Reprends depuis la première.',
      'route.artisans.wrong.p2':'Le deuxième couplet de la chanson parle d’une autre pièce.',
      'route.artisans.wrong.p3':'La chanson se termine par la pièce qui frappe l’enclume.',
      'route.artisans.watching':'L’Artisan soupèse le marteau remonté. Il attend la preuve de ta régularité.',
      'route.artisans.action':'Faire chanter l’enclume',
      'route.artisans.outcome.name':'l’enclume qui chante',
      'route.artisans.outcome.text':'Le marteau remonté frappe l’enclume, qui résonne de nouveau. L’Artisan t’apprend le premier couplet de la chanson des artisans.',
      'route.artisans.decisive':'Indice décisif : la chanson de l’enclume, suivie couplet après couplet.',
      'route.artisans.decision':'Décision : tu as remonté le marteau, et l’Artisan t’a confié la chanson des artisans.',
      'route.artisans.resolved':'L’enclume résonne dans toute la Forge. L’Artisan fredonne avec toi.'
    },
    'aurores-arc1':{
      title:'Le ciel couvert',
      intro:'Le ciel des Hauts est couvert et les balises de la traversée sont éteintes. Deux voies mènent à la Sentinelle du ciel : choisis comment t’orienter.',
      'map.choice':'Le ciel couvert','map.scene':'Étoiles ou refuge','map.clue':'Des balises à relier','map.observe':'Face à la Sentinelle','map.guardian':'La Sentinelle du ciel',
      'guardian.name':'La Sentinelle du ciel','guardian.short':'la Sentinelle','resume.observed':'Sentinelle du ciel observée',
      'guardian.intro':'La Sentinelle garde la traversée. Observe-la, relie les balises dans l’ordre, puis oriente ta traversée.',
      'phase.prepare':'Relier les balises',
      'locked.text':'La Sentinelle attend plus loin. Rends ton indice utilisable pour l’atteindre.',
      'observe.text':'La Sentinelle se tient sur la crête. Autour d’elle, les balises de la traversée sont éteintes.',
      'observe.action':'Observer la Sentinelle',
      'prepare.text':'Relie trois balises dans l’ordre de ta traversée : le départ, l’étape, puis l’arrivée.',
      'prepare.submit':'Relier ces balises',
      'waiting.text':'Les balises sont reliées. La Sentinelle attend une preuve de ta régularité avant de les rallumer.',
      'ready.text':'Le serveur confirme l’ouverture. Tu peux entreprendre la traversée.',
      'next.locked':'Termine l’étape de l’indice pour atteindre la Sentinelle.',
      'next.observe':'Le serveur confirme l’ouverture : observe la Sentinelle.',
      'next.prepare':'Relie les balises dans l’ordre. Aucun effort n’est demandé.',
      'answer.title':'Balises reliées',
      'slot.depart':'Balise de départ','slot.etape':'Balise d’étape','slot.arrivee':'Balise d’arrivée',
      'token.cairn':'la balise du cairn','token.lac':'la balise du lac gelé','token.rocher':'la balise du rocher','token.col':'la balise du col','token.pin':'la balise du pin',
      'scene.far':'Au loin, la Sentinelle du ciel veille sur la crête, sous un ciel couvert.',
      'scene.blocking':'La Sentinelle se tient sur la crête. Autour d’elle, les balises sont éteintes.',
      'scene.signs':'Quatre balises éteintes entourent la Sentinelle : trois forment ta traversée, une est hors de ta route.',
      'route.constellations.name':'les constellations','route.constellations.label':'Observer les constellations',
      'route.constellations.reveals':'Tu relieras les balises en suivant les étoiles.',
      'route.constellations.scene.name':'Le lac des étoiles','route.constellations.scene.story':'Le lac reflète un coin de ciel dégagé. Quelques étoiles percent les nuages.',
      'route.constellations.scene.action':'Guetter l’éclaircie','route.constellations.scene.done':'L’étoile du berger se lève au-dessus de la balise du cairn : c’est ton point de départ.',
      'route.constellations.clue.name':'La carte du ciel','route.constellations.clue.story':'Une carte du ciel est gravée sur la pierre du belvédère.',
      'route.constellations.clue.action':'Lire la carte du ciel','route.constellations.clue.done':'La carte relie la balise du cairn, puis la balise du lac gelé, puis la balise du col.',
      'route.constellations.right':'Les balises sont bien reliées : du cairn au lac gelé, puis jusqu’au col, sous les étoiles.',
      'route.constellations.wrong.depart':'L’étoile du berger s’est levée au-dessus d’une autre balise. Reprends ton départ.',
      'route.constellations.wrong.etape':'La carte du ciel ne passe pas par cette balise après le cairn.',
      'route.constellations.wrong.arrivee':'La carte du ciel finit sa ligne sur une autre balise.',
      'route.constellations.watching':'La Sentinelle suit des yeux la ligne de balises que tu as tracée. Elle attend la preuve de ta régularité.',
      'route.constellations.action':'Rallumer les balises',
      'route.constellations.outcome.name':'les balises rallumées',
      'route.constellations.outcome.text':'Tu relies les balises sous les étoiles et elles se rallument une à une. La Sentinelle ouvre l’observatoire aux voyageurs de la nuit.',
      'route.constellations.decisive':'Indice décisif : la carte du ciel, suivie d’une balise à l’autre.',
      'route.constellations.decision':'Décision : tu as rallumé les balises, et la Sentinelle a ouvert l’observatoire.',
      'route.constellations.resolved':'Les balises brillent sur la crête. La Sentinelle garde l’observatoire ouvert.',
      'route.histoire.name':'l’histoire des voyageurs','route.histoire.label':'Partager une histoire',
      'route.histoire.reveals':'Tu relieras les balises en suivant le récit des voyageurs.',
      'route.histoire.scene.name':'Le refuge des voyageurs','route.histoire.scene.story':'Au refuge, des voyageurs se réchauffent et échangent leurs récits de traversée.',
      'route.histoire.scene.action':'Partager ton histoire','route.histoire.scene.done':'En retour, une voyageuse raconte : elle est partie de la balise du rocher.',
      'route.histoire.clue.name':'Le récit de la traversée','route.histoire.clue.story':'La voyageuse décrit sa traversée, balise après balise.',
      'route.histoire.clue.action':'Écouter le récit','route.histoire.clue.done':'Elle est allée de la balise du rocher à la balise du pin, puis jusqu’à la balise du col.',
      'route.histoire.right':'Les balises sont bien reliées : du rocher au pin, puis jusqu’au col, comme la voyageuse.',
      'route.histoire.wrong.depart':'La voyageuse n’est pas partie de cette balise. Repense au début de son récit.',
      'route.histoire.wrong.etape':'Le récit ne passe pas par cette balise après le rocher.',
      'route.histoire.wrong.arrivee':'La voyageuse a fini sa traversée ailleurs.',
      'route.histoire.watching':'La Sentinelle suit des yeux la traversée de la voyageuse. Elle attend la preuve de ta régularité.',
      'route.histoire.action':'Suivre la traversée',
      'route.histoire.outcome.name':'le récit transmis',
      'route.histoire.outcome.text':'Tu suis la traversée de la voyageuse, balise après balise. La Sentinelle inscrit son récit dans le registre de l’observatoire.',
      'route.histoire.decisive':'Indice décisif : le récit de la traversée, suivi d’une balise à l’autre.',
      'route.histoire.decision':'Décision : tu as suivi le récit, et la Sentinelle l’a inscrit au registre de l’observatoire.',
      'route.histoire.resolved':'Le récit de la voyageuse est au registre. La Sentinelle te salue depuis la crête.'
    }
  };
  for(const [id,table] of Object.entries(TEXT))for(const [k,v] of Object.entries(table))S[`${id}.${k}`]=v;
  const strings={fr:S};
  function t(key,vars={},locale='fr'){
    const table=strings[locale]||strings.fr,raw=table[key]??strings.fr[key]??key;
    return raw.replace(/\{(\w+)\}/g,(_,k)=>vars[k]!=null?String(vars[k]):'');
  }

  const contract=(id,version)=>CAMPAIGNS[id]?.versions?.[version]||null;
  const campaignFor=world=>Object.values(CAMPAIGNS).map(c=>c.versions[c.current]).find(c=>c.world===world)||null;
  const byGuardian=(id,version)=>Object.values(CAMPAIGNS).map(c=>c.versions[version]).find(c=>c?.guardian.id===id)||null;
  /* Projections read by the V1.5.0 and V1.5.1 server functions (the same derivation runs in SQL). */
  const branchContract=c=>c&&{id:c.id,version:c.version,world:c.world,arc:c.arc,choiceOrdinal:c.choiceOrdinal,steps:c.steps,
    routes:c.routes.map(r=>({id:r.id,choice:r.choice,clue:r.clue}))};
  const guardianContract=c=>c&&{id:c.guardian.id,version:c.version,pilot:c.id,pilotVersions:[c.version],world:c.world,
    observeOrdinal:c.guardian.observeOrdinal,ordinal:c.guardian.ordinal,primitive:c.guardian.primitive,signs:[],
    routes:c.routes.map(r=>({route:r.id,clue:r.clue,outcome:r.outcome,slots:r.slots,answer:r.answer}))};

  /* The common primitive, as the server checks it: one token per slot, from that slot's pool; distinct tokens when the
     primitive orders pieces or links beacons. Returns {valid, correct, firstWrong} (firstWrong is the 1-based slot). */
  function check(primitive,route,answer){
    const slots=route?.slots||[];
    if(!Array.isArray(answer)||answer.length!==slots.length||!slots.length)return {valid:false,correct:false,firstWrong:null};
    if(answer.some((x,i)=>typeof x!=='string'||!slots[i].pool.includes(x)))return {valid:false,correct:false,firstWrong:null};
    if(PRIMITIVES[primitive]?.distinct&&new Set(answer).size!==answer.length)return {valid:false,correct:false,firstWrong:null};
    const i=answer.findIndex((x,k)=>x!==route.answer[k]);
    return {valid:true,correct:i<0,firstWrong:i<0?null:i+1};
  }

  /* ---- Branch view (same shape as TitanAdventureBranches.view, so both clients reuse their branch renderers). ---- */
  function branchView(snapshot,locale='fr'){
    const b=snapshot?.branch;
    if(!snapshot?.active||!b||b.state==='none')return null;
    const c0=campaignFor(snapshot.world),k=c0?c0.id:'';
    if(b.state==='legacy')return {state:'legacy',title:t(`${k}.title`,{},locale),text:t('pilot.legacy',{},locale)};
    const c=contract(b.pilot,b.version);
    if(!c)return {state:'unknown',title:t(`${k}.title`,{},locale),text:t('pilot.unknown',{},locale)};
    const p=c.id,rt=id=>({id,name:t(`${p}.route.${id}.name`,{},locale),label:t(`${p}.route.${id}.label`,{},locale),reveals:t(`${p}.route.${id}.reveals`,{},locale)});
    const target=Number(snapshot.target)||0,choice=snapshot.milestones?.find(m=>m.ordinal===c.choiceOrdinal),last=c.steps[c.steps.length-1];
    const routes=c.routes.map(r=>({...rt(r.id),choice:r.choice,followed:b.route===r.id,closed:!!b.route&&b.route!==r.id}));
    const base={pilot:c.id,version:c.version,world:c.world,state:b.state,title:t(`${p}.title`,{},locale),intro:t(`${p}.intro`,{},locale),
      equal:t('pilot.equal',{effort:last.effortTargets*target,days:last.daysTarget},locale),routes,route:b.route||null,pendingNote:t('pilot.pendingNote',{},locale)};
    if(b.state==='available')return {...base,enter:t('pilot.enter',{},locale),enterNote:t('pilot.enterNote',{},locale)};
    if(b.state==='entered'){
      const effort=Math.max(0,(choice?.effortTarget||0)-(Number(snapshot.effort)||0)),days=Math.max(0,(choice?.daysTarget||0)-(Number(snapshot.days)||0));
      return {...base,choiceOrdinal:c.choiceOrdinal,ready:choice?.ready===true,notReady:choice?.ready?'':t('pilot.notReady',{effort,days},locale)};
    }
    const route=c.routes.find(r=>r.id===b.route);if(!route)return {state:'unknown',title:base.title,text:t('pilot.unknown',{},locale)};
    const steps=c.steps.map(step=>{
      const server=(b.steps||[]).find(s=>s.ordinal===step.ordinal)||{},m=snapshot.milestones?.find(x=>x.ordinal===step.ordinal)||{};
      const effortTarget=step.effortTargets*target,daysTarget=step.daysTarget,key=`${p}.route.${route.id}.${step.kind}`;
      const effort=Math.min(effortTarget,Number(b.effortSince)||0),days=Math.min(daysTarget,Number(b.daysSince)||0);
      return {ordinal:step.ordinal,kind:step.kind,name:t(`${key}.name`,{},locale),story:t(`${key}.story`,{},locale),action:t(`${key}.action`,{},locale),done:t(`${key}.done`,{},locale),
        earned:m.earned===true||server.earned===true,ready:m.ready===true,effort,days,effortTarget,daysTarget,progress:t('pilot.progress',{effort,effortTarget,days,daysTarget},locale)};
    });
    // The clue says what was observed: the scene's finding, then (usable) the clue's finding. The mechanic is solved from it.
    const clue=b.clue?{id:b.clue.id,state:b.clue.state,name:t(`${p}.route.${route.id}.clue.name`,{},locale),
      label:t(b.clue.state==='usable'?'pilot.clueUsable':'pilot.clueFound',{guardian:t(`${p}.guardian.short`,{},locale)},locale),
      text:b.clue.state==='usable'?`${t(`${p}.route.${route.id}.scene.done`,{},locale)} ${t(`${p}.route.${route.id}.clue.done`,{},locale)}`:t(`${p}.route.${route.id}.scene.done`,{},locale)}:null;
    return {...base,route:route.id,followed:t('pilot.followed',{route:rt(route.id).name},locale),closed:routes.filter(r=>r.closed).map(r=>t('pilot.closed',{route:r.name},locale)),
      steps,current:steps.find(s=>!s.earned)||null,clue,readyText:t('pilot.ready',{},locale)};
  }

  /* ---- Guardian view (same shape as TitanAdventureGuardian.view; the 'prepare' action is the world's mechanic). ---- */
  const PHASES=['observe','prepare','resolve'],phaseIndex={locked:0,observe:0,prepare:1,waiting:2,ready:2,resolved:3};
  function thresholdView(th,locale){
    if(!th)return null;
    const effort=Math.max(0,Number(th.effortTarget)-Number(th.effort)),days=Math.max(0,Number(th.daysTarget)-Number(th.days));
    const chapter=Number(th.chapter)<Number(th.chapterTarget)?t('threshold.chapter',{chapter:th.chapterTarget},locale):'';
    return {ordinal:th.ordinal,ready:th.ready===true,
      progress:t('threshold',{effort:Math.min(Number(th.effort),Number(th.effortTarget)),effortTarget:th.effortTarget,days:Math.min(Number(th.days),Number(th.daysTarget)),daysTarget:th.daysTarget,chapter:Math.min(Number(th.chapter),Number(th.chapterTarget)),chapterTarget:th.chapterTarget},locale),
      remaining:th.ready===true?t('threshold.ready',{},locale):t('threshold.remaining',{effort,days,chapter},locale),note:t('threshold.note',{},locale)};
  }
  const tokenName=(p,id,locale)=>t(`${p}.token.${id}`,{},locale);
  function guardianView(snapshot,locale='fr'){
    const g=snapshot?.guardian;
    if(!snapshot?.active||!g||g.state==='none')return null;
    const c0=campaignFor(snapshot.world),k=c0?c0.id:'';
    const title=t(`${k}.guardian.name`,{},locale);
    if(g.state==='legacy')return {state:'legacy',title,text:t('legacy.text',{},locale)};
    const c=byGuardian(g.id,g.version);
    if(!c||g.state==='unknown')return {state:'unknown',title,text:t('unknown.text',{},locale)};
    const p=c.id,route=c.routes.find(r=>r.id===g.route);
    if(!route)return {state:'unknown',title,text:t('unknown.text',{},locale)};
    const m=snapshot.mechanic&&snapshot.mechanic.state!=='none'?snapshot.mechanic:null;
    const at=phaseIndex[g.state]??0,phaseName=id=>t(id==='prepare'?`${p}.phase.prepare`:`phase.${id}`,{},locale);
    const phases=PHASES.map((id,i)=>{const st=i<at?'done':i===at?'active':'waiting';return {id,name:phaseName(id),state:st,label:`${phaseName(id)} · ${t(`phase.state.${st}`,{},locale)}`};});
    const r=`${p}.route.${route.id}`,clue=t(`${r}.clue.name`,{},locale);
    const threshold=['locked','observe','waiting','ready'].includes(g.state)?thresholdView(g.threshold,locale):null;
    let action=null;
    if(g.state==='observe')action={kind:'claim',ordinal:c.guardian.observeOrdinal,label:t(`${p}.observe.action`,{},locale),ready:threshold?.ready===true};
    if(g.state==='prepare'){
      const last=Array.isArray(m?.lastAnswer)?m.lastAnswer:[];
      action={kind:'solve',primitive:c.guardian.primitive,distinct:PRIMITIVES[c.guardian.primitive].distinct,submit:t(`${p}.prepare.submit`,{},locale),
        note:t('solve.free',{},locale),incomplete:t('solve.incomplete',{},locale),usedLabel:t('solve.used',{},locale),
        slots:route.slots.map((s,i)=>({id:s.id,index:i+1,label:t(`${p}.slot.${s.id}`,{},locale),last:last[i]||null,
          options:s.pool.map(x=>({id:x,label:tokenName(p,x,locale)}))}))};
    }
    if(g.state==='waiting'||g.state==='ready')action={kind:'resolve',label:t(`${r}.action`,{},locale),ready:g.state==='ready'};
    // Feedback on the last answer: concrete, tied to the clue and to the first slot that does not match what was observed.
    let feedback=null;
    if(m&&m.lastCorrect===false&&g.state==='prepare'&&m.firstWrong){
      const slot=route.slots[m.firstWrong-1];feedback={correct:false,attempts:m.attempts,slot:slot?.id||null,text:t(`${r}.wrong.${slot?.id}`,{},locale)};
    }
    if(m&&m.lastCorrect===true&&g.state!=='resolved')feedback={correct:true,attempts:m.attempts,slot:null,text:t(`${r}.right`,{},locale)};
    const outcome=g.state==='resolved'?{id:g.outcome,name:t(`${r}.outcome.name`,{},locale),text:t(`${r}.outcome.text`,{},locale),
      decisive:t(`${r}.decisive`,{},locale),decision:t(`${r}.decision`,{},locale),resolvedAt:g.resolvedAt}:null;
    const solved=['waiting','ready','resolved'].includes(g.state);
    const answer=solved?route.answer.map(x=>tokenName(p,x,locale)):null;
    const acquired=[t('resume.route',{route:t(`${r}.name`,{},locale)},locale)];
    if(g.state!=='locked')acquired.push(t('resume.clue',{clue},locale));
    if(g.observedAt)acquired.push(t(`${p}.resume.observed`,{},locale));
    if(answer)acquired.push(t('resume.answer',{answerTitle:t(`${p}.answer.title`,{},locale),answer:answer.join(c.guardian.primitive==='chart'?', ':' → ')},locale));
    if(outcome)acquired.push(t('resume.outcome',{outcome:outcome.name},locale));
    let next;
    if(g.state==='locked')next=t(`${p}.next.locked`,{},locale);
    else if(g.state==='observe')next=threshold?.ready?t(`${p}.next.observe`,{},locale):threshold?.remaining;
    else if(g.state==='prepare')next=t(`${p}.next.prepare`,{},locale);
    else if(g.state==='waiting')next=`${Number(g.sincePrepared?.sessions)>0?t('next.contributions',{sessions:g.sincePrepared.sessions},locale):t('next.noContribution',{},locale)} ${threshold?.remaining||''}`.trim();
    else if(g.state==='ready')next=t('next.ready',{},locale);
    else next=t('next.resolved',{},locale);
    const textKey={locked:`${p}.locked.text`,observe:`${p}.observe.text`,prepare:`${p}.prepare.text`,waiting:`${p}.waiting.text`,ready:`${p}.ready.text`,resolved:'resolved.text'}[g.state];
    // Scene: the world's approved guardian illustration; the caption is the complete description (alternative without motion).
    const pose={locked:'far',observe:'blocking',prepare:'blocking',waiting:'watching',ready:'watching',resolved:'resolved'}[g.state];
    const caption=pose==='watching'?t(`${r}.watching`,{},locale):pose==='resolved'?t(`${r}.resolved`,{},locale):t(`${p}.scene.${g.state==='prepare'?'signs':pose}`,{},locale);
    return {id:c.guardian.id,version:c.version,world:c.world,state:g.state,route:route.id,primitive:c.guardian.primitive,title,
      intro:t(`${p}.guardian.intro`,{},locale),equal:t('guardian.equal',{},locale),text:t(textKey,{},locale),phases,
      scene:{pose,caption,world:c.world,primitive:c.guardian.primitive,answer,passage:pose==='resolved'?'open':'closed',oath:'none',signs:g.state==='prepare',focus:null},
      threshold,action,feedback,outcome,clue,
      resume:{title:t('resume.title',{},locale),acquiredTitle:t('resume.acquired',{},locale),nextTitle:t('resume.next',{},locale),acquired,next,
        corrected:Number(g.corrected?.effort)>0&&!outcome?t('corrected',{effort:g.corrected.effort},locale):''},
      observeOrdinal:c.guardian.observeOrdinal,ordinal:c.guardian.ordinal};
  }

  /* Map nodes of the first arc, renamed for the route followed (same rules as the V1.5.0/V1.5.1 modules). */
  function nodes(path,snapshot,locale='fr'){
    const v=branchView(snapshot,locale),g=guardianView(snapshot,locale),c=campaignFor(snapshot?.world);
    if(!c)return path;
    const p=c.id;
    return path.map(n=>{
      if(v&&!['legacy','unknown'].includes(v.state)){
        if(n.ordinal===c.choiceOrdinal)return {...n,name:t(`${p}.map.choice`,{},locale),story:v.intro,choices:v.routes.map(r=>r.label),endings:v.routes.map(r=>t('pilot.followed',{route:r.name},locale))};
        const step=c.steps.find(s=>s.ordinal===n.ordinal);
        if(step){
          if(!v.route)return {...n,kind:step.kind,name:t(`${p}.map.${step.kind}`,{},locale),story:v.intro,choices:[],endings:[]};
          const s=v.steps.find(x=>x.ordinal===n.ordinal);return {...n,kind:step.kind,name:s.name,story:s.story,choices:[],endings:[]};
        }
      }
      if(g&&!['legacy','unknown'].includes(g.state)){
        if(n.ordinal===g.observeOrdinal)return {...n,name:t(`${p}.map.observe`,{},locale),story:t(`${p}.observe.text`,{},locale),choices:[],endings:[]};
        if(n.ordinal===g.ordinal)return {...n,name:t(`${p}.map.guardian`,{},locale),story:g.outcome?g.outcome.text:g.intro,choices:[],endings:[]};
      }
      return n;
    });
  }
  function conflict(requested,snapshot,locale='fr'){
    const route=snapshot?.branch?.route,c=contract(snapshot?.branch?.pilot,snapshot?.branch?.version);
    return route&&requested&&route!==requested&&c?t('pilot.conflict',{route:t(`${c.id}.route.${route}.name`,{},locale)},locale):'';
  }
  function errorText(code,locale='fr'){
    if(code==='RPG_OFFLINE')return t('error.offline',{},locale);
    if(strings.fr[`error.${code}`])return t(`error.${code}`,{},locale);
    if(code==='RPG_TIMEOUT'||/fetch|network|timeout/i.test(String(code||'')))return t('error.sync',{},locale);
    return '';
  }
  /* Branch and guardian APIs for a world: the Vallée keeps its V1.5.0/V1.5.1 modules, the three other worlds use this one.
     Both shapes are the same, so the website and Android render every world with the same components. */
  const branchApi={t,contract:(id,version)=>branchContract(contract(id,version)),view:branchView,nodes,conflict,offlineText:locale=>t('pilot.offline',{},locale)};
  const guardianApi={t,view:guardianView,nodes:(path)=>path,errorText};
  function forWorld(world,modules={}){
    if(world==='aube'||!campaignFor(world))return {branches:modules.branches||root.TitanAdventureBranches||null,guardian:modules.guardian||root.TitanAdventureGuardian||null,campaign:false};
    return {branches:branchApi,guardian:guardianApi,campaign:true};
  }

  /* ---- Dead-path control. Returns the list of problems (empty = every path leads to a resolution). ---- */
  const FORBIDDEN=/sport|discipline|family|hour|window|time|weekday|minute|duration|pace|speed|distance/i;
  function keysDeep(o,out=[]){if(o&&typeof o==='object'){for(const [k,v] of Object.entries(o)){out.push(k);keysDeep(v,out);}}return out;}
  /* A uniform description of an arc, including the Vallée (its sign is the 'pick' primitive with one slot). */
  function describe(world,modules={}){
    if(world==='aube'){
      const B=modules.branches||root.TitanAdventureBranches,G=modules.guardian||root.TitanAdventureGuardian;
      const b=B?.contract(AUBE.pilot,AUBE.version),g=G?.contract(AUBE.guardian,AUBE.version);if(!b||!g)return null;
      return {id:b.id,version:b.version,world,arc:b.arc,choiceOrdinal:b.choiceOrdinal,steps:b.steps,
        guardian:{id:g.id,observeOrdinal:g.observeOrdinal,ordinal:g.ordinal,primitive:AUBE.primitive},
        routes:b.routes.map(r=>{const gr=g.routes.find(x=>x.route===r.id)||{};return {id:r.id,choice:r.choice,clue:r.clue,outcome:gr.outcome,slots:[{id:'signe',pool:g.signs}],answer:[gr.sign]};}),
        text:k=>{
          const m=/^route\.([a-z-]+)\.(scene|clue)\.(name|story|action|done)$/.exec(k);if(m)return B.strings.fr[`route.${m[1]}.${m[2]}.${m[3]}`];
          const w=/^route\.([a-z-]+)\.wrong\.signe\.([a-z-]+)$/.exec(k);if(w)return G.strings.fr[`route.${w[1]}.wrong.${w[2]}`];
          const o=/^route\.([a-z-]+)\.(right|action|outcome\.name|outcome\.text|decisive|decision)$/.exec(k);if(o)return G.strings.fr[`route.${o[1]}.${o[2]}`];
          const tk=/^token\.([a-z-]+)$/.exec(k);if(tk)return G.strings.fr[`sign.${tk[1]}.name`];
          return k==='title'?B.strings.fr['pilot.title']:k==='guardian.name'?G.strings.fr['guardian.title']:undefined;
        },
        // The Veilleur's signs are read on the statue itself: the clue explains the sign, it does not name it.
        observed:r=>G.strings.fr[`route.${r}.right`]};
    }
    // modules.config / modules.strings let the tests audit a modified copy (mutation checks) without touching the contract.
    const c=modules.config||campaignFor(world),T=modules.strings||S;if(!c)return null;
    return {...c,text:k=>T[`${c.id}.${k}`],observed:r=>`${T[`${c.id}.route.${r}.scene.done`]||''} ${T[`${c.id}.route.${r}.clue.done`]||''}`};
  }
  function audit(world,modules={},path){
    const problems=[],d=describe(world,modules),fail=m=>problems.push(`${world}: ${m}`);
    if(!d){fail('no first-arc configuration');return problems;}
    const engine=path||(modules.rpg||root.TitanAdventureRpg)?.path(world)||[];
    const kindAt=o=>engine[o-1]?.kind;
    if(engine.length!==18)fail('the encounter engine path is not available');
    if(kindAt(d.choiceOrdinal)!=='choice')fail(`ordinal ${d.choiceOrdinal} is not the engine choice`);
    if(kindAt(d.guardian.ordinal)!=='miniboss')fail(`ordinal ${d.guardian.ordinal} is not the arc's mini-boss`);
    const ords=[d.choiceOrdinal,...d.steps.map(s=>s.ordinal),d.guardian.observeOrdinal,d.guardian.ordinal];
    if(ords.some((o,i)=>i&&o!==ords[i-1]+1))fail(`ordinals ${ords.join(',')} do not follow each other: a step would be skipped`);
    if(ords.some(o=>engine[o-1]?.arc!==d.arc))fail('a step leaves the arc');
    // Sport conditions: only effort points and active days, increasing, identical for both routes (steps are shared).
    let e=0,dd=0;
    for(const s of d.steps){
      const extra=Object.keys(s).filter(k=>!['ordinal','kind','effortTargets','daysTarget'].includes(k));
      if(extra.length)fail(`step ${s.ordinal} has a condition other than effort and days: ${extra.join(',')}`);
      if(!Number.isInteger(s.effortTargets)||s.effortTargets<=e||!Number.isInteger(s.daysTarget)||s.daysTarget<dd||s.daysTarget<1)fail(`step ${s.ordinal} thresholds are not increasing`);
      if(s.effortTargets>d.guardian.ordinal||s.daysTarget>Math.ceil(d.guardian.ordinal/2))fail(`step ${s.ordinal} asks more than the arc's frozen resolution threshold`);
      e=s.effortTargets;dd=s.daysTarget;
    }
    const forbidden=keysDeep({steps:d.steps,guardian:d.guardian,routes:d.routes}).filter(k=>FORBIDDEN.test(k));
    if(forbidden.length)fail(`time window or compulsory discipline in the configuration: ${forbidden.join(',')}`);
    if(!PRIMITIVES[d.guardian.primitive])fail(`unknown primitive ${d.guardian.primitive}`);
    // Routes: every choice index leads to exactly one route, every route to a solvable mechanic and one resolution.
    const choices=d.routes.map(r=>r.choice).sort();
    if(d.routes.length!==2||choices[0]!==0||choices[1]!==1)fail(`choices ${choices.join(',')} do not cover both canonical choices (dead choice)`);
    if(new Set(d.routes.map(r=>r.id)).size!==d.routes.length)fail('two routes share an id');
    const outcomes=d.routes.map(r=>r.outcome);
    if(outcomes.some(o=>!/^[a-z0-9_]{1,40}$/.test(o||'')))fail('a route has no resolution');
    if(new Set(outcomes).size!==outcomes.length)fail('two routes end on the same resolution');
    for(const r of d.routes){
      const res=check(d.guardian.primitive,r,r.answer);
      if(!res.valid||!res.correct)fail(`route ${r.id}: its own answer is not accepted by the primitive (dead end)`);
      if(r.slots.some(s=>s.pool.length<2))fail(`route ${r.id}: a slot offers no real decision`);
      // There is always a wrong answer to correct, and each slot that can be wrong has its concrete feedback.
      for(const s of r.slots){
        const key=`route.${r.id}.wrong.${s.id}`;
        if(world==='aube'){for(const x of s.pool.filter(x=>x!==r.answer[0]))if(!d.text(`route.${r.id}.wrong.signe.${x}`))fail(`route ${r.id}: no feedback for the sign ${x}`);}
        else if(!d.text(key))fail(`route ${r.id}: no feedback for a wrong ${s.id}`);
      }
      for(const k of ['scene.name','scene.story','scene.action','scene.done','clue.name','clue.story','clue.action','clue.done','right','action','outcome.name','outcome.text','decisive','decision'])
        if(!d.text(`route.${r.id}.${k}`))fail(`route ${r.id}: missing text ${k}`);
      for(const x of new Set(r.slots.flatMap(s=>s.pool)))if(!d.text(`token.${x}`))fail(`route ${r.id}: token ${x} has no text`);
      // Solvable from what was observed: every expected token is named in the route's own findings.
      const seen=String(d.observed(r.id)||'').toLowerCase();
      for(const x of r.answer){const label=String(d.text(`token.${x}`)||'').toLowerCase().replace(/^(la|le|les|l’)\s?/,'');if(!label||!seen.includes(label))fail(`route ${r.id}: « ${label||x} » is never observed on the route`);}
    }
    // The state machine of the arc: every state has an exit and the walk ends on a declared resolution.
    const machine={available:['entered'],entered:['confirmed'],confirmed:['scene'],scene:['clue'],clue:['observe'],observe:['prepare'],prepare:['prepare','waiting'],waiting:['ready'],ready:['resolved'],resolved:[]};
    for(const r of d.routes){
      let state='available',steps=0;const walked=[];
      while(state!=='resolved'&&steps<20){walked.push(state);const next=machine[state];if(!next?.length){fail(`route ${r.id}: dead state ${state}`);break;}state=next[next.length-1];steps++;}
      if(state!=='resolved')fail(`route ${r.id}: the walk never reaches a resolution (${walked.join('>')})`);
    }
    return problems;
  }
  const WORLDS=['aube','marees','forge','aurores'];
  function auditAll(modules={}){
    const problems=WORLDS.flatMap(w=>audit(w,modules));
    const prim=WORLDS.map(w=>describe(w,modules)?.guardian.primitive);
    if(new Set(prim).size!==WORLDS.length)problems.push(`the four worlds do not have four distinct mechanics: ${prim.join(',')}`);
    const resolutions=WORLDS.flatMap(w=>(describe(w,modules)?.routes||[]).map(r=>`${w}:${r.outcome}`));
    if(new Set(resolutions).size!==resolutions.length)problems.push('a resolution is declared twice');
    return {problems,resolutions,primitives:Object.fromEntries(WORLDS.map((w,i)=>[w,prim[i]]))};
  }

  const api={CAMPAIGNS,PRIMITIVES,AUBE,WORLDS,strings,t,contract,campaignFor,byGuardian,branchContract,guardianContract,check,
    branchView,guardianView,nodes,conflict,errorText,forWorld,describe,audit,auditAll};
  root.TitanAdventureCampaigns=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
