/* TITAN LIVE — the persistent world fed by live sessions.
   Le Camp de base (interactive QG), Les Marches (one region per Voie), the Chronicles of the Cordée, the finds.
   Every value here is cosmetic world progression: never XP, never credits, never an advantage. The server
   (titan_live_settle_v1 / titan_live_build_v1) is the authority; settlePreview() mirrors its rule exactly. */
(function (root) {
  "use strict";

  const V = () => root.TitanLiveVoies || (typeof require === "function" ? require("./live-voies.js") : null);
  const H = () => root.TitanLiveEngine || (typeof require === "function" ? require("./live-engine.js") : null);

  /* ------------------------------------------------------------------ settlement rule (mirror of SQL) */
  const RULE = {
    version: 1,
    dailyEssenceCap: 90,          // counted effort-minutes per day, as everywhere in TITAN
    baseEclats: 10,               // first two settled sessions of the day
    baseSessionsPerDay: 2,
    missionEclats: 5,             // per verified mission
    maxMissions: 3,               // at most one of them declared
    maxDeclared: 1,
    accomplishmentEclats: 10,     // at least one mission done, whatever the intent (Cap tenu / Seuil / Découverte)
    harmonyEclats: 10,            // first settled session of this family in the ISO week
    findChance: { atteindre: 0.25, depasser: 0.25, explorer: 0.4 },
    duplicateFindEclats: 3,
    minActiveMinForMissions: 5,
  };

  /**
   * @param {{voie:string, intent:string, seed:string, beats:number, activeMin:number, missions:{id:string, declared?:boolean}[]}} journal
   * @param {{effortMinutes:number, essenceToday:number, sessionsToday:number, familySettledThisWeek:boolean, ownedFinds?:string[]}} ctx
   */
  function settlePreview(journal, ctx) {
    const voies = V();
    const voie = voies.VOIES[journal.voie];
    if (!voie) return { ok: false, reason: "UNKNOWN_VOIE" };
    const essence = voie.essence;
    const effort = Math.max(0, Math.floor(Number(ctx.effortMinutes) || 0));
    const essenceAmount = Math.max(0, Math.min(effort, RULE.dailyEssenceCap - Math.max(0, Number(ctx.essenceToday) || 0)));
    const missions = verifiedMissions(journal, ctx.extras);
    let eclats = 0;
    const lines = [];
    if ((ctx.sessionsToday || 0) < RULE.baseSessionsPerDay) { eclats += RULE.baseEclats; lines.push({ id: "base", eclats: RULE.baseEclats }); }
    if (missions.length) {
      eclats += missions.length * RULE.missionEclats; lines.push({ id: "missions", eclats: missions.length * RULE.missionEclats });
      eclats += RULE.accomplishmentEclats; lines.push({ id: voies.INTENTS[journal.intent]?.rewardLabel || "Accompli", eclats: RULE.accomplishmentEclats });
    }
    if (!ctx.familySettledThisWeek) { eclats += RULE.harmonyEclats; lines.push({ id: "harmonie", eclats: RULE.harmonyEclats }); }
    const find = findOf(journal);
    if (find && (ctx.ownedFinds || []).includes(find.key)) { eclats += RULE.duplicateFindEclats; lines.push({ id: "doublon", eclats: RULE.duplicateFindEclats }); }
    return { ok: true, essence, essenceAmount, eclats, missions: missions.map((x) => x.id), find, lines };
  }

  /** Same filter as the server: known mission of the journal's Voie, ids unique, at most one declared (by the mission's
   *  own rule, never by a flag of the journal), report missions checked against the session extras, ≥5 active minutes. */
  function verifiedMissions(journal, extras) {
    if (!(Number(journal.activeMin) >= RULE.minActiveMinForMissions)) return [];
    const seen = new Set();
    let declared = 0;
    const out = [];
    for (const m of (Array.isArray(journal.missions) ? journal.missions : []).slice(0, 6)) {
      if (out.length >= RULE.maxMissions) break;
      const id = String(m?.id || "");
      if (!/^[a-z]+\.[a-z_]{2,32}$/.test(id) || id.split(".")[0] !== journal.voie || seen.has(id)) continue;
      const kind = V().missionKind(id);
      if (!kind) continue;
      if (kind === "declared") { if (declared >= RULE.maxDeclared) continue; declared++; }
      if (kind === "report" && extras && !reportHolds(id, extras)) continue;
      seen.add(id);
      out.push({ id, declared: kind === "declared", kind });
    }
    return out;
  }

  function reportHolds(id, extras) {
    const field = id.split(".r_")[1];
    const def = V().FIELD_MISSIONS.find((f) => f.field === field);
    const n = (k) => (extras[k] === undefined || extras[k] === null || extras[k] === "" ? null : Number(extras[k]));
    const v = n(field);
    if (!def || v === null || !Number.isFinite(v)) return false;
    const c = def.cond;
    if (c.requires && n(c.requires) === null) return false;
    if (c.per) { const d = n(c.per.field); return d !== null && d > 0 && v <= d * c.per.max; }
    if (c.gte != null && !(v >= c.gte)) return false;
    if (c.lte != null && !(v <= c.lte)) return false;
    return true;
  }

  /** Deterministic find: the seed is the session's client_event_id, so the server draws the same one. */
  function findOf(journal) {
    const voie = journal.voie;
    const list = FINDS[voie];
    if (!list) return null;
    const h = H().hash;
    const chance = RULE.findChance[journal.intent] ?? 0.25;
    const roll = h(`${journal.seed}:find:${voie}`) / 4294967296;
    if (roll >= chance) return null;
    const idx = h(`${journal.seed}:item:${voie}`) % list.length;
    const item = list[idx];
    return { key: `${voie}:${idx}`, voie, index: idx, name: item[0], text: item[1], rare: idx >= list.length - 2 };
  }

  /* ------------------------------------------------------------------ Le Camp de base */
  const BUILDINGS = {
    observatoire: { id: "observatoire", essence: "souffle", name: "L’Observatoire des souffles", text: "Il cartographie tes traversées ; chaque niveau ouvre une lunette sur une région des Marches." },
    halle: { id: "halle", essence: "acier", name: "La Halle d’acier", text: "L’Arsenal y est exposé ; chaque niveau ajoute un râtelier et une enclume." },
    atelier: { id: "atelier", essence: "prisme", name: "L’Atelier du prisme", text: "Parois, cibles, scènes et éléments y laissent leurs cartes et leurs carnets." },
    arene: { id: "arene", essence: "ardeur", name: "L’Arène d’ardeur", text: "Bannières d’escouade, tableau d’honneur et parchemins du dojo." },
    jardin: { id: "jardin", essence: "seve", name: "Le Jardin de sève", text: "Terrasses du Sanctuaire et écurie du Lien ; il change avec les saisons." },
    phare: { id: "phare", essence: null, name: "Le Phare du camp", text: "Il s’élève avec les éclats de toutes tes Voies et éclaire la Cordée." },
  };
  const LEVEL_COST = [60, 120, 200, 300, 420]; // level 1..5
  const MAX_LEVEL = LEVEL_COST.length;
  const LEVEL_NAMES = ["En ruine", "Déblayé", "Rebâti", "Habité", "Rayonnant", "Légendaire"];

  /** Cost to raise a building from `level` to `level+1`: its essence first, then éclats for the remainder. */
  function buildPlan(buildingId, level, wallet) {
    const b = BUILDINGS[buildingId];
    if (!b || level >= MAX_LEVEL) return null;
    const cost = LEVEL_COST[level];
    const own = b.essence ? Math.min(cost, Math.max(0, wallet.essences?.[b.essence] || 0)) : 0;
    const eclats = cost - own;
    return { building: buildingId, from: level, to: level + 1, cost, essence: b.essence, useEssence: own, useEclats: eclats, affordable: eclats <= (wallet.eclats || 0) };
  }

  /* ------------------------------------------------------------------ Les Marches */
  const REGION_STEPS = [1, 3, 6, 10, 15];       // settled sessions in the Voie to reveal each land
  const GUARDIAN = { sessions: 21, days: 12 };  // the guardian answers to regularity, not volume
  function region(voieId, stats) {
    const voie = V().VOIES[voieId];
    const sessions = stats?.sessions || 0, days = stats?.days || 0;
    const lands = REGION_STEPS.filter((s) => sessions >= s).length;
    const next = REGION_STEPS.find((s) => sessions < s) || null;
    return { voie: voieId, name: voie.name, artefact: voie.artefact.name, guardian: voie.guardian.name, lands, of: REGION_STEPS.length,
      next, guardianReady: sessions >= GUARDIAN.sessions && days >= GUARDIAN.days, guardianNeeds: GUARDIAN };
  }

  /* ------------------------------------------------------------------ Chronicles of the Cordée */
  /** Global arc: unlocked by regularity (settled days) and accelerated, never required, by variety. */
  const CORDEE_STEPS = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55];
  const CORDEE = [
    ["Le camp sous la neige", "Au pied des quatre mondes, un camp de base dort sous la neige. Une corde usée pend à l’entrée, ses brins défaits. Ta première séance déblaie le seuil."],
    ["Les brins", "La corde n’en était pas une : vingt brins tressés, un par façon de bouger. On l’appelait la Cordée. Chaque brin a son gardien, et chaque gardien s’est endormi."],
    ["Le premier gardien", "Un gardien t’a reconnu au bruit de ton effort. Il ne parle pas de victoire : il demande seulement si tu reviendras."],
    ["La vallée et l’archipel", "Depuis le Phare, on aperçoit l’Aube et les Marées. Les brins passaient par là : chaque monde gardait un nœud de la Cordée."],
    ["Les forges et la citadelle", "Les forges d’Obsidienne et la citadelle des Aurores tenaient les nœuds les plus lourds. Leurs gardiens se souviennent d’athlètes qui changeaient de Voie sans changer de rythme."],
    ["Ce qui a dénoué la Cordée", "Ce n’est ni une guerre ni un monstre. C’est l’habitude de bouger seul, chacun dans sa Voie, sans que les brins se croisent. La Cordée s’est relâchée, puis défaite."],
    ["Le tressage", "Un brin ne se répare pas d’un seul effort héroïque. Il se retresse fil à fil, séance après séance, en revenant. Le Phare du camp commence à briller."],
    ["Les autres camps", "Au loin, d’autres feux s’allument : d’autres camps de base, d’autres athlètes. Leurs brins sont différents des tiens, et c’est exactement ce qui manquait."],
    ["La Grande Cordée", "Les gardiens se réveillent pour une raison : une nouvelle Cordée se tresse, plus large que l’ancienne, avec des brins que personne n’avait imaginés."],
    ["Le nœud du Titan", "La Cordée ne relie plus seulement les mondes : elle relie ceux qui bougent. Ton nœud tient. Il ne dépend pas d’un record, seulement de ton retour."],
  ];
  function cordee(stats) {
    const days = stats?.days || 0;
    const voies = stats?.voies || 0;
    const score = days + 2 * Math.max(0, voies - 1);
    const unlocked = CORDEE_STEPS.filter((s) => score >= s).length;
    const next = CORDEE_STEPS.find((s) => score < s) || null;
    return { score, unlocked, of: CORDEE.length, next, chapters: CORDEE.slice(0, unlocked).map(([title, text], i) => ({ index: i + 1, title, text })) };
  }

  /** Each Voie has its own arc of five fragments, revealed with its lands. */
  const ARCS = {
    sentier: ["Les bornes sont plus anciennes que les routes. Quelqu’un les a posées pour être retrouvé.", "Le Passeur de brume ne guide personne : il marche à côté, au même pas.", "Tes Échos ne sont pas des rivaux. Ce sont tes anciennes séances qui te font signe.", "La brume se lève là où l’on n’était jamais passé. Explorer est une façon de tresser.", "Le Passeur te tend son brin : il est fait de tous les chemins que tu as repris."],
    roue: ["Les relais de l’Expédition reliaient des régions que personne ne traversait d’une traite.", "La Dame des cols attend au sommet, mais elle regarde surtout la descente : on y revient vivant.", "Le messager du vélotaf porte des nouvelles de camp en camp, sans jamais compter ses jours.", "Les cols portent des noms que tu leur donnes en passant.", "Le brin de la roue est le plus long : il fait le tour des Marches."],
    flots: ["Les amers ont été dressés par des rameurs qui voulaient que d’autres rentrent au port.", "La Gardienne des courants lit le sillage : un sillage régulier vaut mieux qu’une vague.", "Le portulan se dessine à l’envers : les côtes connues d’abord, l’inconnu ensuite.", "Garder des forces pour le retour, c’est le premier savoir des flots.", "La Gardienne te confie un brin mouillé d’embruns, souple comme une écoute."],
    nage: ["Sous le bassin, un archipel englouti attendait qu’on lui rende la lumière.", "Le Veilleur des abysses compte les retours au bassin, jamais les longueurs.", "Chaque nage éclaire un fond différent : le dos, la brasse, le crawl ont leurs couleurs.", "L’eau libre ne se défie pas. Elle se partage.", "Le brin des profondeurs est le plus calme : il tient sans tirer."],
    altitude: ["Les refuges des Hautes Routes ont été bâtis par ceux qui savaient renoncer.", "L’Ermite des crêtes salue autant le demi-tour que le sommet.", "Le carnet de cimes garde les panoramas, et les jours où la montagne a dit non.", "L’heure de demi-tour est la plus ancienne règle des Marches.", "L’Ermite te remet un brin de corde de montagne : il a déjà retenu beaucoup de monde."],
    forge: ["Le Colosse de fer n’a jamais été vaincu d’un seul coup. Il a été démonté plaque par plaque.", "La braise doit retomber : une lame trempée trop vite casse.", "L’Arsenal ne compte pas les kilos : il compte les séances où la lame est revenue sur l’enclume.", "Une frappe nette garde de la réserve. Les forgerons qui frappaient à l’échec ont tous des cicatrices.", "Le Colosse s’agenouille et tend un brin d’acier tressé, froid et sûr."],
    corps: ["La constellation des mouvements existait avant les salles : elle se dessine avec le corps seul.", "L’Acrobate de pierre montre l’étoile suivante quand la précédente est stable.", "Une variante assistée n’est pas une étoile mineure. C’est le début d’une constellation.", "Le gainage se compte en souffles tenus, pas en douleur.", "L’Acrobate te confie un brin tendu entre deux étoiles."],
    paroi: ["Chaque chute a laissé une marque sur la Paroi : ce sont des prises que d’autres liront.", "La Sentinelle de granit ne s’incline que devant la patience.", "Un projet garde la mémoire de tous ses essais, même ceux qu’on voudrait oublier.", "Les avant-bras reposés grimpent plus loin que les avant-bras pressés.", "La Sentinelle te remet un brin noué en huit, le nœud de la confiance."],
    joute: ["Le Chevalier du filet salue le jeu, jamais seulement le score.", "Les remontées sont gravées au tableau d’honneur ; les défaites aussi, sans honte.", "Une passe d’armes se gagne à deux : sans partenaire, pas de joute.", "Le service appliqué vaut plus que le service rapide.", "Le Chevalier tend un brin tressé de cordage de raquette."],
    escouade: ["La Bannière d’escouade se brode avec des serments, pas avec des buts.", "Le Capitaine sans visage a porté tous les maillots. Il les connaît tous.", "Un serment tenu est discret : Bouclier, Passeur, Moteur, Finisseur ou Voix.", "Quand deux coéquipiers notent le même match, la bannière se partage.", "Le Capitaine te remet un brin aux couleurs de ton équipe."],
    dojo: ["Les Parchemins de maîtrise se remplissent par la pratique, jamais par les victoires.", "Le Maître au bâton juge le contrôle, pas la force.", "Entre deux rounds, le souffle est une technique.", "Un parchemin vierge est la plus belle page du dojo.", "Le Maître noue autour de ton poignet un brin de ceinture usée."],
    sanctuaire: ["Le Jardin du Sanctuaire a été abandonné pendant des saisons. Il ne demande que du temps.", "La Gardienne des sources ne se montre qu’à ceux qui ralentissent.", "Chaque terrasse restaurée retient un peu d’eau pour les autres Voies.", "La gêne qui baisse fait fleurir les plantes rares.", "La Gardienne te confie un brin de sève, vivant et souple."],
    cible: ["La Carte du ciel se dessine avec des étoiles proches, pas avec une seule étoile brillante.", "L’Astronome muet observe la constance du geste.", "Le silence fait partie du tir : TITAN se tait pour que tu entendes ton souffle.", "Changer de distance, c’est changer de ciel.", "L’Astronome te remet un brin fin comme une ligne de mire."],
    scene: ["Le Répertoire garde chaque enchaînement, de l’esquisse à la signature.", "La Danseuse d’ombre danse ton tableau, un temps plus tard.", "Une représentation n’est pas un concours : c’est un passage complet, offert.", "L’improvisation ouvre des scènes que le répertoire ignorait.", "La Danseuse tend un brin de ruban, léger et précis."],
    brasier: ["La Bête de cendre se lasse face à ceux qui respirent entre les vagues.", "Les remparts du repos font partie du combat.", "Une vague de plus à la même qualité vaut plus qu’une vague plus rapide.", "Chaque foyer garde la trace d’un format, d’une heure, d’une salle.", "La Bête de cendre se couche et laisse un brin encore chaud."],
    stade: ["Le Starter immobile ne donne le départ qu’à ceux qui ont récupéré.", "Les marques de la piste ne se comparent qu’entre elles.", "Une tentative pleine vaut mieux que trois tentatives pressées.", "Chaque épreuve nouvelle trace un couloir de plus sur la piste.", "Le Starter te remet un brin aux couleurs d’une ligne de départ."],
    elements: ["L’Atlas des éléments s’écrit avec des conditions, pas avec des exploits.", "Le Vent sans nom respecte ceux qui renoncent quand les conditions changent.", "Une page de l’Atlas vaut autant en eau calme qu’en grosse houle.", "Le cadre sûr est la première ligne de chaque page.", "Le Vent te confie un brin qui sent le sel, la neige et l’air."],
    pilotage: ["Le Carnet de trajectoires célèbre la constance, jamais le danger.", "L’Ingénieur de l’ombre note la régularité des tours.", "Le briefing est le premier tour de chaque session.", "Un nouveau tracé s’apprend lentement, puis s’oublie vite si on ne revient pas.", "L’Ingénieur te remet un brin gainé, pensé pour durer."],
    lien: ["L’Écurie garde le nom de chaque monture et le lien construit avec elle.", "La Cavalière d’argent juge l’accord, pas la hauteur des barres.", "Une séance calme renforce le lien autant qu’un concours.", "Chaque monture a son caractère ; le lien s’adapte à elle.", "La Cavalière te confie un brin de longe, patient et fidèle."],
    odyssee: ["Les Portails s’ouvrent à ceux qui changent de Voie sans s’arrêter.", "Le Héraut aux trois visages parle la langue de chaque segment.", "Chaque transition préparée est un portail plus fluide.", "Une Odyssée nourrit plusieurs Voies à la fois.", "Le Héraut te remet un brin tressé de trois couleurs."],
  };
  function arc(voieId, stats) {
    const list = ARCS[voieId] || [];
    const lands = region(voieId, stats).lands;
    return list.slice(0, lands).map((text, i) => ({ index: i + 1, text }));
  }

  /* ------------------------------------------------------------------ finds (cosmetic collection) */
  const FINDS = {
    sentier: [["Borne gravée", "Une pierre de borne qui porte la date de ton passage."], ["Lanterne de brume", "Elle brille quand un Écho est proche."], ["Carte froissée", "Un fragment de la Route des Marches."], ["Bâton du passeur", "Poli par mille pas."], ["Boussole de brume", "Rare : elle pointe vers les chemins jamais pris."], ["Sceau du Passeur", "Rare : remis à ceux qui reviennent."]],
    roue: [["Fanion de relais", "Planté à chaque région reliée."], ["Rayon d’argent", "Un rayon de roue gravé d’un col."], ["Carnet de route", "Les étapes de ta grande traversée."], ["Sacoche du messager", "Pleine de nouvelles d’autres camps."], ["Plaque de col", "Rare : un col qui porte ton nom."], ["Lanterne de la Dame", "Rare : elle éclaire les descentes."]],
    flots: [["Amer miniature", "Un repère côtier de bois flotté."], ["Coquillage du portulan", "Il chante la côte longée."], ["Pagaie gravée", "Une pagaie d’honneur, trop belle pour servir."], ["Fiole d’embruns", "Un souvenir de mer d’huile."], ["Compas de la Gardienne", "Rare : il suit les courants."], ["Ancre de verre", "Rare : elle tient sans peser."]],
    nage: [["Perle d’îlot", "Une lueur de l’archipel englouti."], ["Écaille irisée", "Elle change de couleur selon la nage."], ["Lunettes anciennes", "Retrouvées dans une épave."], ["Bouée de corail", "Un souvenir d’eau libre."], ["Lampe des abysses", "Rare : elle éclaire les fonds."], ["Sceau du Veilleur", "Rare : pour ceux qui reviennent au bassin."]],
    altitude: [["Pierre de refuge", "Une pierre du muret d’un refuge."], ["Piolet miniature", "Un souvenir de crête."], ["Carte des massifs", "Les refuges que tu as atteints."], ["Gourde d’ermite", "Elle garde l’eau froide."], ["Cristal de sommet", "Rare : il garde la lumière d’un panorama."], ["Sablier de demi-tour", "Rare : remis aux renoncements sages."]],
    forge: [["Plaque du Colosse", "Une plaque tombée, encore tiède."], ["Marteau d’apprenti", "Il frappe juste, pas fort."], ["Pierre à aiguiser", "Pour les lames de l’Arsenal."], ["Chaîne de trempe", "Chaque maillon, une séance."], ["Lame de reflet", "Rare : une lame qui a franchi un seuil."], ["Enclume du maître", "Rare : elle ne résonne que pour les frappes nettes."]],
    corps: [["Étoile de craie", "La trace d’une main sur la barre."], ["Bandeau tressé", "Il tient au front pendant les maintiens."], ["Carte du ciel corporel", "Ta constellation, dessinée à la main."], ["Anneau de suspension", "Un souvenir de traction."], ["Étoile filante", "Rare : une variante allumée."], ["Statuette de l’Acrobate", "Rare : elle tient en équilibre sur un doigt."]],
    paroi: [["Prise lue", "Une prise révélée par une chute."], ["Mousqueton gravé", "Il porte le nom d’un projet."], ["Sac à magnésie", "Usé par tes essais."], ["Corde lovée", "Une corde qui a retenu sans se plaindre."], ["Plaquette du projet", "Rare : posée le jour où il a cédé."], ["Œil de granit", "Rare : la Sentinelle t’a regardé."]],
    joute: [["Balle de joute", "Une balle d’un échange interminable."], ["Cordage d’honneur", "Un cordage tressé de tes manches."], ["Écusson du filet", "Il se coud sur un sac de sport."], ["Feuille de match", "Un score que personne n’a contesté."], ["Blason de remontée", "Rare : pour une manche gagnée après avoir été mené."], ["Gant du Chevalier", "Rare : il salue le jeu."]],
    escouade: [["Fanion d’escouade", "Il flotte au bord du terrain."], ["Brassard de serment", "Bouclier, Passeur, Moteur, Finisseur ou Voix."], ["Sifflet ancien", "Il a sifflé mille mi-temps."], ["Maillot brodé", "Les couleurs de ta bannière."], ["Bannière partagée", "Rare : un match noté avec tes coéquipiers."], ["Insigne du Capitaine", "Rare : il compte les serments tenus."]],
    dojo: [["Parchemin roulé", "Une technique, quelques caractères."], ["Cloche de bronze", "Elle sonne les rounds du dojo."], ["Ceinture usée", "Elle a beaucoup travaillé."], ["Bâton de pratique", "Pour les formes et les katas."], ["Sceau du contrôle", "Rare : un round maîtrisé."], ["Pinceau du Maître", "Rare : il écrit les parchemins vierges."]],
    sanctuaire: [["Galet d’eau douce", "Poli par une source restaurée."], ["Graine de terrasse", "Elle pousse au Jardin."], ["Lanterne de pierre", "Elle s’allume au crépuscule."], ["Bol de souffle", "Il vibre au rythme d’une expiration longue."], ["Fleur rare", "Rare : elle s’ouvre quand la gêne baisse."], ["Source miniature", "Rare : la Gardienne s’est montrée."]],
    cible: [["Étoile de cible", "Une étoile de ta carte du ciel."], ["Plume d’empennage", "Un souvenir de volée."], ["Craie de billard", "Bleue, évidemment."], ["Bouchon de mène", "Une mène serrée."], ["Constellation gravée", "Rare : trois unités régulières."], ["Lunette de l’Astronome", "Rare : elle voit la constance."]],
    scene: [["Ruban de scène", "Un ruban tombé pendant un passage."], ["Programme plié", "Le titre de ton enchaînement."], ["Chausson usé", "Il a répété longtemps."], ["Projecteur miniature", "Il éclaire un tableau."], ["Rappel doré", "Rare : un passage complet sans arrêt."], ["Masque de la Danseuse", "Rare : il danse un temps plus tard."]],
    brasier: [["Braise contenue", "Une braise qui ne brûle pas."], ["Chronomètre de foyer", "Il compte les vagues."], ["Corde à sauter tressée", "Un souvenir d’intervalle."], ["Rempart miniature", "Pour les repos tenus."], ["Cendre d’argent", "Rare : la Bête s’est lassée."], ["Cœur du Brasier", "Rare : il bat au rythme de tes formats."]],
    stade: [["Plot de départ", "Un souvenir de tentative pleine."], ["Témoin de relais", "Il passe de main en main."], ["Ruban de marque", "Il marque une distance."], ["Pointes usées", "Elles ont couru la piste."], ["Couloir doré", "Rare : une marque comparable."], ["Pistolet silencieux", "Rare : celui du Starter immobile."]],
    elements: [["Page de l’Atlas", "Une condition rencontrée."], ["Coquille de houle", "Elle garde le bruit d’une vague."], ["Flocon de verre", "Un souvenir de neige."], ["Plume de vent", "Un souvenir d’air."], ["Rose des vents", "Rare : une condition nouvelle."], ["Sceau du Vent sans nom", "Rare : un renoncement sage."]],
    pilotage: [["Drapeau à damier", "Un tour régulier."], ["Gant de piste", "Il a tenu le volant ou le guidon."], ["Carnet de réglages", "Les notes d’une session."], ["Casque miniature", "Il ne se porte pas, il se garde."], ["Trajectoire d’argent", "Rare : des tours constants."], ["Clé de l’Ingénieur", "Rare : elle règle la régularité."]],
    lien: [["Fer à cheval", "Un souvenir d’allure."], ["Brosse de pansage", "Pour après la séance."], ["Ruban de reprise", "Une reprise réussie."], ["Carnet d’écurie", "Le nom de ta monture."], ["Étrier d’argent", "Rare : un lien profond."], ["Rose de la Cavalière", "Rare : l’accord parfait."]],
    odyssee: [["Portail miniature", "Une transition franchie."], ["Dossard tressé", "Trois couleurs, trois Voies."], ["Sablier de transition", "Il s’écoule entre deux segments."], ["Carte des segments", "Ton Odyssée, d’un seul trait."], ["Clé des Portails", "Rare : une Odyssée complète."], ["Masque du Héraut", "Rare : trois visages, un seul effort."]],
  };

  const api = { RULE, settlePreview, verifiedMissions, findOf, BUILDINGS, LEVEL_COST, MAX_LEVEL, LEVEL_NAMES, buildPlan,
    REGION_STEPS, GUARDIAN, region, CORDEE, CORDEE_STEPS, cordee, ARCS, arc, FINDS };
  root.TitanLiveWorld = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
