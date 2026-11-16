/* TITAN LIVE — the twenty "Voies": one shared engine, twenty ways to live a session.
   A Voie is not a skin. Each one owns a beat (what makes the session advance), a live panel, missions that only make
   sense for that practice, events, a persistent artefact and a safety class. Every sport of the catalogue resolves to
   exactly one Voie (by balance profile, then by explicit sport override) plus sport-specific tuning.
   Pure data + resolution. No XP, no credits: the live layer only grants world resources and cosmetics, settled by the
   server (titan_live_settle_v1). */
(function (root) {
  "use strict";

  /** @typedef {"atteindre"|"depasser"|"explorer"} Intent */
  /** @typedef {"libre"|"regard"|"mains_libres"|"aucune"} Safety */

  const INTENTS = {
    atteindre: {
      id: "atteindre", label: "Atteindre", short: "Mon objectif",
      promise: "Tenir le cap que tu as choisi, avec un accompagnement bienveillant.",
      tone: "encourage", rewardLabel: "Cap tenu",
    },
    depasser: {
      id: "depasser", label: "Se dépasser", short: "Un cran plus loin",
      promise: "Tenter un léger progrès par rapport à tes séances comparables, sans forcer au-delà du raisonnable.",
      tone: "challenge", rewardLabel: "Seuil franchi",
    },
    explorer: {
      id: "explorer", label: "Explorer", short: "Sans chiffre",
      promise: "Pratiquer librement : le monde réagit à ta présence, pas à ta performance.",
      tone: "discover", rewardLabel: "Découverte",
    },
  };

  /** Immersion levels: what the companion is allowed to use. Safety can only lower them. */
  const IMMERSION = {
    silence: { id: "silence", level: 0, label: "Silencieux", hint: "Rien pendant la séance, un récit à la fin." },
    notifications: { id: "notifications", level: 1, label: "Notifications", hint: "Les passages clés en notification discrète." },
    audio: { id: "audio", level: 2, label: "Audio", hint: "Une voix courte aux moments utiles, jamais en continu." },
    aventure: { id: "aventure", level: 3, label: "Aventure narrative", hint: "Le récit vit avec ta séance : événements, rencontres, missions." },
  };

  /** Safety classes. They cap immersion and decide when the screen may ask for a tap. */
  const SAFETY = {
    libre: { id: "libre", label: "Interactions libres", maxLevel: 3, tapsWhileActive: true, minGapS: 90,
      why: "Séance statique ou en salle : tu peux toucher l’écran entre deux efforts." },
    regard: { id: "regard", label: "Coup d’œil", maxLevel: 3, tapsWhileActive: false, minGapS: 150,
      why: "En mouvement, l’écran se lit d’un coup d’œil ; les choix attendent une pause." },
    mains_libres: { id: "mains_libres", label: "Mains libres", maxLevel: 2, tapsWhileActive: false, minGapS: 300,
      why: "Route, eau, montagne : aucune demande d’action pendant l’effort, voix rare et courte." },
    aucune: { id: "aucune", label: "Concentration totale", maxLevel: 0, tapsWhileActive: false, minGapS: Infinity,
      why: "Pratique à risque ou de précision : TITAN se tait pendant l’effort et raconte après." },
  };

  /** Five essences, one per TITAN DNA family. Same value everywhere: one counted effort-minute = one essence. */
  const ESSENCES = {
    souffle: { id: "souffle", family: "endurance", label: "Souffle", building: "observatoire" },
    acier: { id: "acier", family: "force", label: "Acier", building: "halle" },
    prisme: { id: "prisme", family: "technique", label: "Prisme", building: "atelier" },
    ardeur: { id: "ardeur", family: "jeu", label: "Ardeur", building: "arene" },
    seve: { id: "seve", family: "mobilite", label: "Sève", building: "jardin" },
  };

  /* Mission check DSL (evaluated by live-engine, re-verified by the server when marked verify:"log"):
     {metric:"activeMin", gte:n | {goal:f} | {baseline:f}} · {metric:"beats", gte:n, where?} · {metric:"beatStreak", gte, where}
     {metric:"distanceM"|"elevationM", gte} · {metric:"restsRespected", gte} · {metric:"distinct", key, gte}
     {metric:"field", field, gte} · {metric:"declared"} (the athlete confirms; at most one per session counts). */
  const m = (id, intents, label, text, when, check, extra = {}) => ({ id, intents, label, text, when, check, ...extra });
  const ALL = ["atteindre", "depasser", "explorer"];

  const VOIES = {
    sentier: {
      id: "sentier", name: "La Traversée", essence: "souffle", panel: "route", safety: "regard",
      tagline: "Chaque effort pose une borne sur la carte d’aventure.",
      beat: { id: "borne", one: "borne", many: "bornes", every: { effortMin: 6 } },
      loop: [
        "Avant : tu choisis un cap (distance, durée ou aucun) et, si tu veux, un Écho : ta propre séance comparable qui court à tes côtés sur la carte.",
        "Pendant : la carte réelle trace ton chemin, la carte d’aventure avance au rythme de ton effort normalisé, pas de tes kilomètres. Une borne tous les 6 minutes d’effort.",
        "Les lieux jamais traversés lèvent le brouillard de ta carte personnelle : explorer un nouveau quartier compte autant qu’aller vite.",
        "Après : les bornes gravées rejoignent la Route des Marches et rapprochent le Gardien des sentiers.",
      ],
      artefact: { id: "route", name: "La Route des Marches", text: "Toutes tes bornes, reliées ; les nouveaux lieux révélés." },
      guardian: { name: "Le Passeur de brume", text: "Il ne se laisse approcher que par ceux qui reviennent." },
      liveData: ["gps.distance", "gps.pace", "gps.elevation", "timer"],
      missions: [
        m("sentier.cap_moitie", ["atteindre"], "La moitié du cap", "Atteins la moitié de ton objectif ; la carte révèle la seconde rive.", { phase: "mid" }, { metric: "activeMin", gte: { goal: 0.5 } }, { verify: "log" }),
        m("sentier.regulier", ["atteindre", "explorer"], "Le pas tranquille", "Garde une allure où tu peux parler pendant 10 minutes.", { phase: "warm" }, { metric: "declared" }),
        m("sentier.echo", ["depasser"], "Rattraper l’Écho", "Ton Écho est à quelques bornes. Rejoins-le avant la fin, à ton rythme.", { phase: "mid", needs: "echo" }, { metric: "beats", gte: { baseline: 1.05 } }, { verify: "log" }),
        m("sentier.final_souple", ["depasser"], "Le dernier relais", "Sur les 5 dernières minutes, relance légèrement si tu te sens bien. Sinon, garde ton allure : la mission compte quand même.", { phase: "late" }, { metric: "declared" }, { safetyNote: "Jamais à une traversée de route : la relance attend un tronçon dégagé." }),
        m("sentier.brouillard", ["explorer"], "Lever le brouillard", "Passe par une rue ou un chemin que tu n’as jamais emprunté.", { phase: "warm", needs: "gps" }, { metric: "field", field: "newPlaces", gte: 1 }),
        m("sentier.halte", ALL, "La halte des sources", "Après 45 minutes, une gorgée d’eau ; la borne suivante s’illumine.", { phase: "mid", afterMin: 45 }, { metric: "declared" }),
      ],
      events: [
        { id: "echo_cote", when: { needs: "echo" }, text: "Ton Écho apparaît sur la carte, à ta hauteur." },
        { id: "borne_ancienne", when: { everyBeats: 5 }, text: "Une borne ancienne porte une inscription : un fragment de chronique se révèle." },
        { id: "terre_nouvelle", when: { needs: "gps", field: "newPlaces" }, text: "Terre nouvelle : le brouillard se lève sur un lieu que tu n’avais jamais traversé." },
        { id: "col", when: { elevationEveryM: 100 }, text: "Un col se dessine sur la carte d’aventure : 100 m de montée gravés." },
      ],
      fallback: "Sans GPS (tapis, salle, téléphone rangé) : le chrono et la distance déclarée suffisent. La carte d’aventure avance au même rythme, seule la carte réelle reste vide.",
    },

    roue: {
      id: "roue", name: "L’Expédition", essence: "souffle", panel: "route", safety: "mains_libres",
      tagline: "Des régions entières à relier, col après col.",
      beat: { id: "relais", one: "relais", many: "relais", every: { effortMin: 8 } },
      loop: [
        "Avant : tu choisis une région de l’Expédition à relier ; TITAN te montre les relais qu’il faut pour la rejoindre, en minutes d’effort.",
        "Pendant : écran géant et lisible, zéro demande de toucher en roulant. La voix (si tu l’actives) annonce seulement les relais et les cols.",
        "Les montées pèsent : chaque tranche de dénivelé franchie devient un col nommé sur ta carte.",
        "Après : les régions reliées forment ta grande traversée ; le vélotaf ouvre la Route du messager, une contribution hebdomadaire sans série.",
      ],
      artefact: { id: "expedition", name: "La Grande Traversée", text: "Les régions reliées, les cols franchis, tes trajets du messager." },
      guardian: { name: "La Dame des cols", text: "Elle attend au sommet de chaque région, sans chronomètre." },
      liveData: ["gps.distance", "gps.speed", "gps.elevation", "timer", "declared.avg_power", "declared.cadence"],
      missions: [
        m("roue.relier", ["atteindre"], "Relier la région", "Atteins ton objectif du jour : la région se relie à ton réseau.", { phase: "start" }, { metric: "activeMin", gte: { goal: 1 } }, { verify: "log" }),
        m("roue.col", ["depasser", "explorer"], "Le col du jour", "Franchis 150 m de montée cumulée.", { phase: "warm", needs: "gps" }, { metric: "elevationM", gte: 150 }, { verify: "log" }),
        m("roue.endurance", ["depasser"], "La longue étape", "Roule un peu plus longtemps que ta médiane récente, sans hausser l’intensité.", { phase: "mid" }, { metric: "activeMin", gte: { baseline: 1.1 } }, { verify: "log" }),
        m("roue.cadence", ["atteindre", "depasser"], "La cadence souple", "Sur home trainer : 10 minutes en cadence fluide, sans forcer sur le braquet.", { phase: "warm", indoorOnly: true }, { metric: "declared" }),
        m("roue.relais", ["atteindre", "explorer"], "Trois relais", "Allume trois relais de l’Expédition, à l’allure qui te convient.", { phase: "start" }, { metric: "beats", gte: 3 }, { verify: "log" }),
        m("roue.variations", ["explorer"], "Le parcours imaginaire", "Sur home trainer : change de cadence ou de position toutes les 5 minutes, comme sur une route qui tourne.", { phase: "start", indoorOnly: true }, { metric: "declared" }),
        m("roue.inconnu", ["explorer"], "La route inconnue", "Emprunte une portion jamais roulée.", { phase: "warm", needs: "gps" }, { metric: "field", field: "newPlaces", gte: 1 }),
      ],
      events: [
        { id: "relais_region", when: { everyBeats: 3 }, text: "Un relais s’allume : la région suivante se rapproche." },
        { id: "col_nomme", when: { elevationEveryM: 150 }, text: "Col franchi. Il porte désormais ton passage sur la carte." },
        { id: "vent", when: { random: 0.15 }, text: "Le récit souffle un vent porteur sur la carte d’aventure : rien à faire, profite." },
      ],
      fallback: "Sans GPS (home trainer, spinning, vélo d’appartement) : relais au temps d’effort, puissance et cadence déclarées si tu les as. La région se relie de la même façon.",
    },

    flots: {
      id: "flots", name: "Le Cabotage", essence: "souffle", panel: "route", safety: "mains_libres",
      tagline: "D’amer en amer, au rythme de la pagaie ou de la coulisse.",
      beat: { id: "amer", one: "amer", many: "amers", every: { effortMin: 7 } },
      loop: [
        "Avant : choisis une côte de l’archipel à longer. Sur l’eau, le téléphone reste à l’abri : tout est automatique.",
        "Pendant : un amer (repère côtier) tous les 7 minutes d’effort. Au rameur, la cadence de coups (si tu la renseignes) dessine la houle de la carte.",
        "Après : les côtes longées s’ajoutent à ton portulan, la carte marine de tes sorties.",
      ],
      artefact: { id: "portulan", name: "Le Portulan", text: "La carte marine de tes sorties, amer par amer." },
      guardian: { name: "La Gardienne des courants", text: "Elle lit ta régularité dans le sillage." },
      liveData: ["gps.distance", "gps.speed", "timer", "declared.stroke_rate"],
      missions: [
        m("flots.cote", ["atteindre"], "Longer la côte", "Tiens ton objectif ; la côte entière rejoint le portulan.", { phase: "start" }, { metric: "activeMin", gte: { goal: 1 } }, { verify: "log" }),
        m("flots.cadence", ["depasser"], "La houle régulière", "Au rameur : 3 blocs de 4 minutes à cadence stable, récupération libre.", { phase: "warm", indoorOnly: true }, { metric: "beats", gte: 3, where: { kind: "block" } }),
        m("flots.amers", ["atteindre", "explorer"], "Trois amers", "Dresse trois amers sur la côte d’aventure.", { phase: "start" }, { metric: "beats", gte: 3 }, { verify: "log" }),
        m("flots.baie", ["explorer"], "La baie cachée", "Découvre un plan d’eau ou un départ jamais utilisé.", { phase: "start", needs: "gps" }, { metric: "field", field: "newPlaces", gte: 1 }),
        m("flots.retour", ALL, "Garder des forces pour le retour", "Sur l’eau, fais demi-tour avant la moitié de ton énergie.", { phase: "start", outdoorOnly: true }, { metric: "declared" }, { safetyNote: "Mission de sécurité : elle compte comme les autres." }),
      ],
      events: [
        { id: "amer", when: { everyBeats: 4 }, text: "Un amer se dresse : la côte suivante apparaît au portulan." },
        { id: "calme", when: { random: 0.12 }, text: "Mer d’huile sur la carte d’aventure : un fragment de récit flotte vers toi." },
      ],
      fallback: "Sans GPS (rameur, bassin) : amers au temps d’effort et cadence déclarée. Sur l’eau sans téléphone : saisie de la sortie au retour, même portulan.",
    },

    nage: {
      id: "nage", name: "Les Profondeurs", essence: "souffle", panel: "log", safety: "aucune",
      tagline: "Chaque longueur éclaire un îlot de l’archipel englouti.",
      beat: { id: "ilot", one: "îlot", many: "îlots", every: { effortMin: 5 } },
      loop: [
        "Avant : tu prépares ta plongée en blocs (échauffement, séries, retour au calme) ; le téléphone reste au bord.",
        "Pendant : le chrono tourne en silence ; TITAN ne compte jamais tes longueurs à ta place.",
        "Au bord du bassin, entre deux blocs, un toucher valide le bloc terminé : un îlot s’éclaire.",
        "Après : la saisie des mètres et des nages révèle la carte de l’archipel englouti ; les nages variées éclairent des fonds différents.",
      ],
      artefact: { id: "archipel", name: "L’Archipel englouti", text: "Les îlots éclairés par tes blocs, une couleur par nage." },
      guardian: { name: "Le Veilleur des abysses", text: "Il récompense les retours au bassin, pas les records." },
      liveData: ["timer", "declared.blocks", "post.meters", "post.stroke"],
      missions: [
        m("nage.plan", ["atteindre"], "La plongée prévue", "Termine les blocs que tu as préparés.", { phase: "start" }, { metric: "beats", gte: { plan: 1 }, where: { kind: "block" } }),
        m("nage.ilots", ["atteindre", "explorer"], "Quatre îlots", "Éclaire quatre îlots de l’archipel (environ 20 minutes de nage effective).", { phase: "start" }, { metric: "beats", gte: 4 }, { verify: "log" }),
        m("nage.technique", ["depasser"], "Le bloc technique", "Un bloc d’éducatifs ou de nage moins habituelle.", { phase: "warm" }, { metric: "beats", gte: 1, where: { kind: "block", tag: "technique" } }),
        m("nage.nages", ["explorer"], "Les fonds colorés", "Utilise au moins deux nages différentes.", { phase: "start" }, { metric: "distinct", key: "stroke", gte: 2 }),
        m("nage.eau_libre", ALL, "Le compagnon de rive", "En eau libre : nage accompagné ou avec bouée de signalisation.", { phase: "start", outdoorOnly: true }, { metric: "declared" }, { safetyNote: "Aucune autre mission n’est proposée en eau libre." }),
      ],
      events: [
        { id: "ilot", when: { everyBeats: 1 }, text: "Un îlot s’éclaire dans l’archipel englouti." },
        { id: "epave", when: { everyBeats: 4 }, text: "Une épave affleure : un fragment de chronique remonte à la surface." },
      ],
      fallback: "Le mode par défaut : chrono silencieux puis saisie au bord. Si une montre écrit la séance dans Health Connect, TITAN l’importe au retour.",
    },

    altitude: {
      id: "altitude", name: "Les Hautes Routes", essence: "souffle", panel: "route", safety: "mains_libres",
      tagline: "La montagne se mesure en refuges, pas en vitesse.",
      beat: { id: "refuge", one: "refuge", many: "refuges", every: { elevationM: 150, effortMin: 15 } },
      loop: [
        "Avant : tu fixes ton heure de demi-tour. C’est la première mission de chaque course en montagne, et elle rapporte comme les autres.",
        "Pendant : un refuge tous les 150 m de dénivelé (ou 15 minutes d’effort sans altitude fiable). Aucune demande de toucher en marchant.",
        "Au sommet ou au point le plus haut, une pause photographique : le panorama rejoint ton carnet de cimes.",
        "Après : la carte des massifs garde tes refuges ; l’heure de demi-tour respectée est saluée, jamais reprochée si tu as renoncé.",
      ],
      artefact: { id: "cimes", name: "Le Carnet de cimes", text: "Les refuges atteints, les sommets, les renoncements sages." },
      guardian: { name: "L’Ermite des crêtes", text: "Il honore autant le demi-tour que le sommet." },
      liveData: ["gps.distance", "gps.elevation", "timer", "declared.pack_kg"],
      missions: [
        m("altitude.demi_tour", ALL, "L’heure de demi-tour", "Fixe une heure de demi-tour et respecte-la, sommet atteint ou non.", { phase: "start" }, { metric: "declared" }, { safetyNote: "Mission prioritaire en montagne." }),
        m("altitude.refuges", ["atteindre"], "La chaîne de refuges", "Atteins 3 refuges.", { phase: "warm" }, { metric: "beats", gte: 3 }, { verify: "log" }),
        m("altitude.denivele", ["depasser"], "La marche de plus", "Un peu plus de dénivelé que ta médiane récente, au même rythme cardiaque ressenti.", { phase: "mid", needs: "gps" }, { metric: "elevationM", gte: { baseline: 1.1 } }, { verify: "log" }),
        m("altitude.panorama", ["explorer"], "Le panorama", "Prends une pause au point le plus haut de ta sortie.", { phase: "mid" }, { metric: "declared" }),
      ],
      events: [
        { id: "refuge", when: { everyBeats: 1 }, text: "Un refuge s’allume sur la carte des massifs." },
        { id: "sommet", when: { field: "max_altitude_m" }, text: "Point culminant enregistré : le panorama rejoint ton carnet." },
      ],
      fallback: "Sans altitude fiable : refuges au temps d’effort. Sans téléphone : saisie au retour du dénivelé et de l’altitude max, même carnet.",
    },

    forge: {
      id: "forge", name: "La Forge", essence: "acier", panel: "sets", safety: "libre",
      tagline: "Chaque série est une frappe ; chaque exercice, une lame que tu trempes.",
      beat: { id: "frappe", one: "frappe", many: "frappes", every: { beat: "set" } },
      loop: [
        "Avant : tu choisis ton plan (exercices et séries de travail). Le Colosse de la séance porte une plaque par série prévue.",
        "Pendant : une série saisie = une frappe. Le minuteur de repos est la braise qui refroidit : la frappe suivante est « nette » si tu as laissé la braise retomber.",
        "Une série dans ta zone de réserve (1 à 3 répétitions en réserve) est une frappe nette ; l’échec n’est jamais récompensé.",
        "Après : chaque exercice est une lame de ton Arsenal. Elle se trempe avec la régularité (séances où tu l’as travaillée), pas avec la charge.",
      ],
      artefact: { id: "arsenal", name: "L’Arsenal", text: "Une lame par exercice, trempée séance après séance." },
      guardian: { name: "Le Colosse de fer", text: "Ses plaques tombent une à une ; il ne se brise pas en une seule série héroïque." },
      liveData: ["timer", "declared.set.reps", "declared.set.load", "declared.set.rir", "rest.timer"],
      missions: [
        m("forge.plan", ["atteindre"], "Faire tomber les plaques", "Termine toutes les séries de travail prévues.", { phase: "start" }, { metric: "beats", gte: { plan: 1 }, where: { kind: "set" } }, { verify: "log" }),
        m("forge.nettes", ["atteindre", "depasser"], "Trois frappes nettes", "Trois séries de suite avec 1 à 3 répétitions en réserve.", { phase: "warm", afterBeats: 1 }, { metric: "beatStreak", gte: 3, where: { kind: "set", rirMin: 1, rirMax: 3 } }),
        m("forge.seuil", ["depasser"], "Le seuil de la lame", "Sur un exercice comparable, une répétition de plus ou un petit palier de charge, en gardant au moins 1 répétition en réserve.", { phase: "mid", needs: "baseline" }, { metric: "field", field: "thresholdSets", gte: 1 }, { safetyNote: "Une seule tentative proposée par séance, jamais à l’échec." }),
        m("forge.braise", ALL, "Laisser la braise retomber", "Respecte le repos conseillé sur 4 séries.", { phase: "warm" }, { metric: "restsRespected", gte: 4 }),
        m("forge.lame_neuve", ["explorer"], "Une lame neuve", "Essaie un exercice que tu n’as pas encore dans ton Arsenal.", { phase: "start" }, { metric: "field", field: "newExercises", gte: 1 }),
      ],
      events: [
        { id: "plaque", when: { everyBeats: 1 }, text: "Une plaque du Colosse tombe." },
        { id: "etincelle", when: { field: "thresholdSets" }, text: "Étincelle : ta lame vient de franchir un seuil comparable." },
        { id: "trempe", when: { everyBeats: 6 }, text: "La trempe prend : une lame de l’Arsenal gagne un reflet." },
      ],
      fallback: "Sans saisie série par série : tu indiques la durée et le nombre de séries à la fin. Le Colosse perd ses plaques d’un coup, la lame se trempe pareil.",
    },

    corps: {
      id: "corps", name: "L’Ascension du corps", essence: "acier", panel: "sets", safety: "libre",
      tagline: "Ton propre poids, une constellation de mouvements à allumer.",
      beat: { id: "palier", one: "palier", many: "paliers", every: { beat: "set" } },
      loop: [
        "Avant : tu choisis tes mouvements dans ta constellation (pompes, tractions, gainage…).",
        "Pendant : une série ou un maintien = un palier. Le gainage se compte en secondes tenues, pas en douleur.",
        "Les variantes (assistée, standard, lestée) sont des étoiles différentes : passer d’une variante à l’autre allume une nouvelle étoile.",
        "Après : ta constellation montre ce que ton corps sait faire aujourd’hui et ce qui s’ouvre ensuite.",
      ],
      artefact: { id: "constellation", name: "La Constellation des mouvements", text: "Chaque mouvement et ses variantes, du plus accessible au plus rare." },
      guardian: { name: "L’Acrobate de pierre", text: "Il te montre la variante suivante quand la précédente est stable." },
      liveData: ["timer", "declared.set.reps", "declared.set.hold", "rest.timer"],
      missions: [
        m("corps.paliers", ["atteindre"], "La montée des paliers", "Termine les séries prévues.", { phase: "start" }, { metric: "beats", gte: { plan: 1 }, where: { kind: "set" } }),
        m("corps.propre", ["atteindre", "depasser"], "La forme propre", "Trois séries de suite arrêtées avant la dégradation de la forme.", { phase: "warm" }, { metric: "beatStreak", gte: 3, where: { kind: "set", rirMin: 1, rirMax: 4 } }),
        m("corps.variante", ["depasser", "explorer"], "L’étoile suivante", "Essaie une variante plus exigeante sur une série courte.", { phase: "mid" }, { metric: "field", field: "newExercises", gte: 1 }),
        m("corps.respiration", ALL, "Respirer dans le maintien", "Sur un gainage, respire calmement plutôt que de bloquer.", { phase: "mid" }, { metric: "declared" }),
      ],
      events: [
        { id: "etoile", when: { everyBeats: 3 }, text: "Une étoile de ta constellation s’intensifie." },
        { id: "variante", when: { field: "newExercises" }, text: "Nouvelle étoile : une variante vient de s’allumer." },
      ],
      fallback: "Sans saisie détaillée : total des répétitions ou durée à la fin, la constellation s’allume selon les mouvements cités.",
    },

    paroi: {
      id: "paroi", name: "La Paroi", essence: "prisme", panel: "wall", safety: "regard",
      tagline: "Chaque essai lit la paroi. Chaque chute aussi.",
      beat: { id: "essai", one: "essai", many: "essais", every: { beat: "attempt" } },
      loop: [
        "Avant : tu marques (ou pas) un projet : une voie ou un bloc que tu travailles sur plusieurs séances.",
        "Pendant : entre deux essais, un toucher : réussite, flash ou chute, et la cotation si tu la connais. Rien pendant la grimpe.",
        "Les chutes révèlent des prises sur la paroi d’aventure : elles comptent comme de la lecture, jamais comme un échec.",
        "Après : ton projet garde la mémoire de tous ses essais. Le jour où il passe, la paroi raconte toute son histoire.",
      ],
      artefact: { id: "projets", name: "Le Carnet de paroi", text: "Tes projets, leurs essais, le jour où ils ont cédé." },
      guardian: { name: "La Sentinelle de granit", text: "Elle ne s’incline que devant la patience." },
      liveData: ["timer", "declared.attempt.result", "declared.attempt.grade", "rest.timer"],
      missions: [
        m("paroi.lecture", ["atteindre", "explorer"], "Lire la paroi", "Fais 6 essais, réussis ou non.", { phase: "warm" }, { metric: "beats", gte: 6, where: { kind: "attempt" } }),
        m("paroi.projet", ["depasser"], "Le siège du projet", "Trois essais sur ton projet, avec au moins 3 minutes de repos entre chacun.", { phase: "mid", needs: "project" }, { metric: "beats", gte: 3, where: { kind: "attempt", project: true } }),
        m("paroi.flash", ["depasser"], "Le flash", "Réussis une voie ou un bloc du premier coup, à ton niveau habituel.", { phase: "warm" }, { metric: "beats", gte: 1, where: { kind: "attempt", result: "flash" } }),
        m("paroi.repos", ALL, "Avant-bras reposés", "Respecte le repos conseillé après 3 essais difficiles.", { phase: "mid" }, { metric: "restsRespected", gte: 3 }),
        m("paroi.secteur", ["explorer"], "Le secteur inconnu", "Essaie un style que tu fréquentes moins (dévers, dalle, fissure…).", { phase: "start" }, { metric: "declared" }),
      ],
      events: [
        { id: "prise", when: { field: "falls" }, text: "Une chute, une prise révélée : la paroi se lit mieux." },
        { id: "cede", when: { field: "projectSent" }, text: "Le projet cède. La paroi raconte tous tes essais." },
        { id: "relais", when: { everyBeats: 5 }, text: "Un relais d’aventure s’ancre sur la paroi." },
      ],
      fallback: "Sans saisie entre les essais : nombre d’essais et de réussites à la fin. Le projet avance quand tu le cites.",
    },

    joute: {
      id: "joute", name: "La Joute", essence: "ardeur", panel: "score", safety: "regard",
      tagline: "Les échanges deviennent des passes d’armes ; les manches, des chapitres.",
      beat: { id: "manche", one: "manche", many: "manches", every: { beat: "game", effortMin: 10 } },
      loop: [
        "Avant : match, entraînement ou panier de balles. En match, tu peux tenir un tableau de score à deux grandes zones tactiles ; sinon, TITAN découpe la séance en manches de 10 minutes.",
        "Pendant : entre les points ou aux changements de côté, un toucher par point. L’Élan monte avec les séquences gagnées, mais aussi avec les points difficiles disputés.",
        "Les retours au score (remonter un set) sont des événements majeurs ; perdre un match n’enlève rien.",
        "Après : sets et résultat, s’ils sont renseignés, rejoignent ton tableau d’honneur. Sinon, tes manches de travail suffisent.",
      ],
      artefact: { id: "tableau", name: "Le Tableau d’honneur", text: "Tes joutes, tes remontées, tes adversaires réguliers (sans classement)." },
      guardian: { name: "Le Chevalier du filet", text: "Il salue le jeu, jamais seulement le score." },
      liveData: ["timer", "declared.point", "declared.game", "declared.set"],
      missions: [
        m("joute.manches", ["atteindre"], "Les manches du jour", "Joue le nombre de manches ou de sets prévu.", { phase: "start" }, { metric: "beats", gte: { plan: 1 }, where: { kind: "game" } }),
        m("joute.service", ["atteindre", "depasser"], "Le service appliqué", "Pendant une manche, concentre-toi sur ta première balle ou ton service.", { phase: "warm" }, { metric: "declared" }),
        m("joute.remontee", ["depasser"], "La remontée", "Gagne une manche ou un set après avoir été mené.", { phase: "mid" }, { metric: "field", field: "comebacks", gte: 1 }),
        m("joute.sequence", ["depasser"], "La passe d’armes", "Gagne 3 points de suite.", { phase: "warm" }, { metric: "beatStreak", gte: 3, where: { kind: "point", won: true } }),
        m("joute.partenaire", ["explorer"], "Le jeu partagé", "Joue avec un ou une partenaire nouveau, ou essaie un coup que tu évites d’habitude.", { phase: "start" }, { metric: "declared" }),
      ],
      events: [
        { id: "elan", when: { field: "momentum" }, text: "L’Élan du duel monte : trois points de suite." },
        { id: "remontee", when: { field: "comebacks" }, text: "Remontée ! Cette manche rejoint ton tableau d’honneur." },
        { id: "long_echange", when: { random: 0.1 }, text: "Un échange interminable : le public imaginaire retient son souffle." },
      ],
      fallback: "Sans score : la séance se découpe en manches de 10 minutes, avec un thème de travail facultatif par manche (service, déplacement, revers).",
    },

    escouade: {
      id: "escouade", name: "L’Escouade", essence: "ardeur", panel: "score", safety: "aucune",
      tagline: "Un serment avant le coup d’envoi, un rapport de campagne après.",
      beat: { id: "periode", one: "période", many: "périodes", every: { beat: "period", effortMin: 15 } },
      loop: [
        "Avant : tu prêtes un serment, ton rôle du jour : Bouclier (défendre), Passeur (faire jouer), Moteur (presse et replis), Finisseur (conclure), Voix (organiser). Il ne dépend pas de ton poste.",
        "Pendant : le téléphone dort dans le sac. Le chrono tourne et découpe le match en périodes du sport (mi-temps, quarts, tiers, sets).",
        "Au retour au banc ou à la mi-temps, un toucher valide la période ; jamais de notification pendant le jeu.",
        "Après : un rapport de campagne de 20 secondes avec les seules statistiques de ton sport. Ton serment est tenu ou non, sans jugement ; les coéquipiers TITAN qui notent le même match partagent une bannière.",
      ],
      artefact: { id: "banniere", name: "La Bannière d’escouade", text: "Tes serments tenus, les matchs partagés avec tes coéquipiers." },
      guardian: { name: "Le Capitaine sans visage", text: "Il compte les serments tenus, pas les buts." },
      liveData: ["timer", "declared.period", "post.sport_fields"],
      missions: [
        m("escouade.serment", ALL, "Le serment tenu", "Tiens le rôle choisi avant le match (déclaré au rapport).", { phase: "start" }, { metric: "declared" }),
        m("escouade.match", ["atteindre"], "Jusqu’au bout", "Joue toutes les périodes prévues, en comptant tes remplacements.", { phase: "start" }, { metric: "beats", gte: { plan: 1 }, where: { kind: "period" } }),
        m("escouade.rapport", ["depasser"], "Le rapport précis", "Renseigne au moins deux statistiques de ton sport après le match.", { phase: "late" }, { metric: "field", field: "reportedStats", gte: 2 }),
        m("escouade.poste", ["explorer"], "Un autre regard", "Essaie un poste ou un rôle inhabituel pendant une période.", { phase: "start" }, { metric: "declared" }),
      ],
      events: [
        { id: "mi_temps", when: { field: "period" }, text: "Période terminée : la bannière flotte un peu plus haut." },
        { id: "coequipiers", when: { needs: "team" }, text: "Des coéquipiers TITAN ont noté le même match : la bannière est partagée." },
      ],
      fallback: "Le cas général : chrono silencieux puis rapport. Sans statistiques, le serment et le temps de jeu suffisent.",
    },

    dojo: {
      id: "dojo", name: "Le Dojo", essence: "ardeur", panel: "rounds", safety: "libre",
      tagline: "Rounds sonnés, techniques notées sur des parchemins de maîtrise.",
      beat: { id: "round", one: "round", many: "rounds", every: { beat: "round" } },
      loop: [
        "Avant : format (technique, formes, opposition contrôlée) et cloche : nombre de rounds, durée, repos. La cloche suit le rythme de ton club si tu préfères le chrono du mur.",
        "Pendant : chaque round terminé est un round sonné. Entre les rounds, tu peux noter la technique travaillée.",
        "Chaque technique a son parchemin : il se remplit par la pratique (séances où tu l’as travaillée), jamais par les victoires.",
        "Après : tes parchemins montrent la largeur de ton art. Le contrôle et la technique propre sont célébrés, la puissance jamais.",
      ],
      artefact: { id: "parchemins", name: "Les Parchemins de maîtrise", text: "Une technique, un parchemin, des séances de pratique." },
      guardian: { name: "Le Maître au bâton", text: "Il juge le contrôle, pas la force." },
      liveData: ["timer", "bell", "declared.round.technique", "declared.bouts"],
      missions: [
        m("dojo.rounds", ["atteindre"], "La cloche jusqu’au bout", "Termine les rounds prévus.", { phase: "start" }, { metric: "beats", gte: { plan: 1 }, where: { kind: "round" } }),
        m("dojo.technique", ["atteindre", "explorer"], "Le parchemin du jour", "Note la technique principale travaillée sur 2 rounds.", { phase: "warm" }, { metric: "distinct", key: "technique", gte: 1 }),
        m("dojo.controle", ["depasser"], "Le round maîtrisé", "Un round d’opposition où tu privilégies le contrôle et la défense.", { phase: "mid" }, { metric: "declared" }, { safetyNote: "Jamais d’incitation à frapper plus fort." }),
        m("dojo.repos", ALL, "Le souffle entre les rounds", "Respecte le repos entre 3 rounds.", { phase: "warm" }, { metric: "restsRespected", gte: 3 }),
        m("dojo.nouvelle", ["explorer"], "Un parchemin vierge", "Travaille une technique que tu n’as pas encore notée.", { phase: "start" }, { metric: "field", field: "newTechniques", gte: 1 }),
      ],
      events: [
        { id: "cloche", when: { everyBeats: 1 }, text: "Round sonné." },
        { id: "parchemin", when: { field: "newTechniques" }, text: "Un parchemin vierge porte ses premiers caractères." },
      ],
      fallback: "Sans cloche : la durée et le nombre de rounds à la fin, les techniques citées remplissent les parchemins.",
    },

    sanctuaire: {
      id: "sanctuaire", name: "Le Sanctuaire", essence: "seve", panel: "flow", safety: "libre",
      tagline: "Chaque souffle restaure une terrasse du jardin.",
      beat: { id: "souffle", one: "cycle de souffle", many: "cycles de souffle", every: { effortMin: 4 } },
      loop: [
        "Avant : zone à apaiser (dos, hanches, épaules…) et, si tu veux, ta gêne de départ sur 10.",
        "Pendant : silence par défaut. Un guide de respiration facultatif ; un cycle de souffle tous les 4 minutes de pratique.",
        "Chaque cycle restaure une terrasse du jardin du Sanctuaire : herbes, eau, pierres. Le jardin change avec les saisons de ta pratique.",
        "Après : ta gêne d’arrivée et de départ forme ton carnet d’apaisement. Aucune performance, aucune comparaison.",
      ],
      artefact: { id: "jardin", name: "Le Jardin du Sanctuaire", text: "Des terrasses restaurées, une saison par mois de pratique." },
      guardian: { name: "La Gardienne des sources", text: "Elle ne se montre qu’à ceux qui ralentissent." },
      liveData: ["timer", "breath.pacer", "declared.pain_before", "declared.pain_after"],
      missions: [
        m("sanctuaire.terrasses", ["atteindre"], "Restaurer les terrasses", "Pratique la durée que tu t’es fixée.", { phase: "start" }, { metric: "activeMin", gte: { goal: 1 } }, { verify: "log" }),
        m("sanctuaire.souffle", ALL, "Le souffle long", "Cinq minutes d’expirations plus longues que les inspirations.", { phase: "warm" }, { metric: "declared" }),
        m("sanctuaire.tenue", ["depasser"], "La tenue confortable", "Garde une posture un peu plus longtemps qu’à l’habitude, sans douleur.", { phase: "mid", painBelow: 5 }, { metric: "declared" }, { safetyNote: "Désactivée si la gêne déclarée est de 5 ou plus." }),
        m("sanctuaire.nouvelle", ["explorer"], "La graine nouvelle", "Essaie une posture ou un enchaînement nouveau.", { phase: "warm" }, { metric: "declared" }),
      ],
      events: [
        { id: "terrasse", when: { everyBeats: 2 }, text: "Une terrasse du jardin retrouve son eau." },
        { id: "apaisement", when: { field: "painDrop" }, text: "La gêne déclarée a baissé : une fleur rare s’ouvre au Sanctuaire." },
      ],
      fallback: "Le mode par défaut est déjà silencieux. Sans saisie de gêne, le jardin pousse avec le temps de pratique.",
    },

    cible: {
      id: "cible", name: "La Cible", essence: "prisme", panel: "score", safety: "aucune",
      tagline: "La régularité dessine des constellations ; le score n’est qu’une étoile.",
      beat: { id: "volee", one: "volée", many: "volées", every: { beat: "end", effortMin: 10 } },
      loop: [
        "Avant : ta routine de concentration (respiration, geste d’ancrage). TITAN ne vibrera ni ne parlera jamais pendant un tir.",
        "Pendant : après chaque volée, mène, trou ou frame, un score rapide si tu veux. Chaque unité allume une étoile.",
        "Les étoiles proches (scores réguliers) se relient en constellations : la régularité compte plus que le meilleur coup, ce qui rend la Voie juste pour les débutants.",
        "Après : ta carte du ciel garde tes constellations et ta meilleure série.",
      ],
      artefact: { id: "ciel", name: "La Carte du ciel", text: "Tes constellations de régularité, séance après séance." },
      guardian: { name: "L’Astronome muet", text: "Il observe la constance du geste." },
      liveData: ["timer", "declared.end.score"],
      missions: [
        m("cible.volees", ["atteindre"], "Les volées prévues", "Termine le nombre de volées, mènes ou trous prévus.", { phase: "start" }, { metric: "beats", gte: { plan: 1 }, where: { kind: "end" } }),
        m("cible.constellation", ["depasser"], "La constellation", "Trois unités de suite avec un score proche de ta moyenne de séance.", { phase: "mid" }, { metric: "field", field: "steadyEnds", gte: 3 }),
        m("cible.routine", ALL, "Le geste identique", "Garde la même routine pré-tir sur 5 essais.", { phase: "warm" }, { metric: "declared" }),
        m("cible.distance", ["explorer"], "Un autre ciel", "Change de distance, de terrain ou de configuration une fois.", { phase: "mid" }, { metric: "declared" }),
      ],
      events: [
        { id: "etoile", when: { everyBeats: 1 }, text: "Une étoile s’allume." },
        { id: "constellation", when: { field: "steadyEnds" }, text: "Trois étoiles proches : une constellation se dessine." },
      ],
      fallback: "Sans score : la durée découpe la séance en volées de 10 minutes ; la carte du ciel s’allume au rythme de la pratique.",
    },

    scene: {
      id: "scene", name: "La Scène", essence: "prisme", panel: "flow", safety: "libre",
      tagline: "Tes enchaînements forment un répertoire, de l’esquisse à la signature.",
      beat: { id: "tableau", one: "tableau", many: "tableaux", every: { beat: "routine", effortMin: 8 } },
      loop: [
        "Avant : tu choisis le ou les enchaînements du jour dans ton répertoire, ou tu en crées un.",
        "Pendant : la musique a la priorité : TITAN reste visuel. Un toucher par passage complet d’un enchaînement (un tableau).",
        "Chaque enchaînement grandit : esquisse, répété, maîtrisé, signature, selon le nombre de séances où tu l’as travaillé.",
        "Après : la scène s’illumine de tes tableaux ; un passage complet sans arrêt est salué comme une représentation.",
      ],
      artefact: { id: "repertoire", name: "Le Répertoire", text: "Tes enchaînements, de l’esquisse à la signature." },
      guardian: { name: "La Danseuse d’ombre", text: "Elle danse le tableau que tu répètes, un temps plus tard." },
      liveData: ["timer", "declared.routine.run"],
      missions: [
        m("scene.repetitions", ["atteindre"], "Les répétitions", "Passe ton enchaînement 4 fois.", { phase: "warm" }, { metric: "beats", gte: 4, where: { kind: "routine" } }),
        m("scene.representation", ["depasser"], "La représentation", "Un passage complet sans t’arrêter.", { phase: "mid" }, { metric: "beats", gte: 1, where: { kind: "routine", clean: true } }),
        m("scene.improvisation", ["explorer"], "L’improvisation", "Cinq minutes d’improvisation ou de figure nouvelle.", { phase: "mid" }, { metric: "declared" }),
        m("scene.echauffement", ALL, "Le corps prêt", "Un vrai échauffement avant les figures exigeantes.", { phase: "start" }, { metric: "declared" }, { safetyNote: "Proposée en premier pour la gym, le cirque et les figures aériennes." }),
      ],
      events: [
        { id: "projecteur", when: { everyBeats: 2 }, text: "Un projecteur s’allume sur la scène." },
        { id: "rappel", when: { field: "cleanRuns" }, text: "Rappel ! Le passage complet rejoint ton répertoire." },
      ],
      fallback: "Sans toucher pendant la pratique : la durée et les enchaînements cités à la fin suffisent.",
    },

    brasier: {
      id: "brasier", name: "Le Brasier", essence: "ardeur", panel: "rounds", safety: "libre",
      tagline: "Des vagues à repousser, une récupération qui fait partie du combat.",
      beat: { id: "vague", one: "vague", many: "vagues", every: { beat: "round" } },
      loop: [
        "Avant : format (intervalles, circuit, EMOM, stations). Le minuteur travail/repos est prêt.",
        "Pendant : chaque intervalle tenu repousse une vague. Les repos sont des remparts : les écourter ne rapporte rien.",
        "Les dernières vagues sont annoncées tôt pour que tu doses, jamais pour te presser.",
        "Après : le brasier garde la trace de tes formats ; tenir la même qualité sur un round de plus vaut plus que d’aller plus vite.",
      ],
      artefact: { id: "foyers", name: "Les Foyers", text: "Tes formats d’entraînement et les vagues repoussées." },
      guardian: { name: "La Bête de cendre", text: "Elle se lasse face à ceux qui respirent entre les vagues." },
      liveData: ["timer", "interval.timer", "declared.round.reps"],
      missions: [
        m("brasier.vagues", ["atteindre"], "Repousser les vagues", "Termine tous les intervalles prévus.", { phase: "start" }, { metric: "beats", gte: { plan: 1 }, where: { kind: "round" } }),
        m("brasier.remparts", ALL, "Tenir les remparts", "Respecte tous les repos du format.", { phase: "start" }, { metric: "restsRespected", gte: { plan: 0.8 } }),
        m("brasier.vague_plus", ["depasser"], "La vague de plus", "Un round supplémentaire à la même qualité que les autres, si tu te sens bien.", { phase: "late" }, { metric: "beats", gte: { plan: 1, plus: 1 }, where: { kind: "round" } }, { safetyNote: "Proposée seulement si l’effort ressenti déclaré reste sous 8." }),
        m("brasier.format", ["explorer"], "Un autre foyer", "Essaie un format que tu ne fais jamais.", { phase: "start" }, { metric: "declared" }),
      ],
      events: [
        { id: "vague", when: { everyBeats: 1 }, text: "Vague repoussée." },
        { id: "derniere_ligne", when: { beatsLeft: 2 }, text: "Encore deux vagues dans ton format : dose ton énergie." },
      ],
      fallback: "Sans minuteur : la durée et le nombre de rounds à la fin. Le brasier s’allume pareil.",
    },

    stade: {
      id: "stade", name: "Le Stade", essence: "souffle", panel: "rounds", safety: "regard",
      tagline: "Des tentatives, des marques, la récupération comme rituel.",
      beat: { id: "tentative", one: "tentative", many: "tentatives", every: { beat: "attempt" } },
      loop: [
        "Avant : épreuve du jour (sprint, haies, saut, lancer, départs) et récupération entre tentatives.",
        "Pendant : chaque tentative est notée d’un toucher pendant ta récupération, avec la marque si tu l’as.",
        "La récupération complète est une condition de la tentative « pleine » ; enchaîner sans repos ne rapporte rien.",
        "Après : la piste d’aventure garde tes marques par épreuve, comparées seulement entre elles.",
      ],
      artefact: { id: "piste", name: "La Piste des marques", text: "Tes tentatives et tes marques, par épreuve." },
      guardian: { name: "Le Starter immobile", text: "Il ne donne le départ qu’à ceux qui ont récupéré." },
      liveData: ["timer", "declared.attempt.mark", "rest.timer"],
      missions: [
        m("stade.tentatives", ["atteindre"], "Les tentatives prévues", "Réalise les tentatives prévues avec récupération complète.", { phase: "start" }, { metric: "beats", gte: { plan: 1 }, where: { kind: "attempt" } }),
        m("stade.recuperation", ALL, "La récupération pleine", "Respecte la récupération sur 4 tentatives.", { phase: "warm" }, { metric: "restsRespected", gte: 4 }),
        m("stade.marque", ["depasser"], "La marque comparable", "Approche ta meilleure marque récente sur la même épreuve.", { phase: "mid", needs: "baseline" }, { metric: "field", field: "thresholdMarks", gte: 1 }),
        m("stade.epreuve", ["explorer"], "Une autre épreuve", "Essaie une épreuve ou un départ inhabituel.", { phase: "start" }, { metric: "declared" }),
      ],
      events: [
        { id: "tentative", when: { everyBeats: 1 }, text: "Tentative notée sur la piste." },
        { id: "marque", when: { field: "thresholdMarks" }, text: "Marque comparable : la piste s’illumine." },
      ],
      fallback: "Sans saisie entre les tentatives : épreuve, nombre de tentatives et meilleure marque à la fin.",
    },

    elements: {
      id: "elements", name: "Les Éléments", essence: "prisme", panel: "log", safety: "aucune",
      tagline: "Vagues, vent, neige, air : un atlas des conditions rencontrées.",
      beat: { id: "lecture", one: "lecture", many: "lectures", every: { beat: "run", effortMin: 20 } },
      loop: [
        "Avant : tu lis les conditions (vent, houle, neige, terrain) et tu les notes en trois touchers. C’est le cœur de la Voie.",
        "Pendant : TITAN se tait totalement. Aucune notification, aucune voix, aucun défi pendant la pratique.",
        "Après : glisses, vagues, vols ou passages rejoignent l’Atlas des éléments ; chaque condition nouvelle rencontrée ouvre une page.",
        "Aucun défi de hauteur, de profondeur, de vitesse ou de prise de risque n’existe dans cette Voie.",
      ],
      artefact: { id: "atlas", name: "L’Atlas des éléments", text: "Les conditions rencontrées, page après page." },
      guardian: { name: "Le Vent sans nom", text: "Il respecte ceux qui renoncent quand les conditions changent." },
      liveData: ["timer", "pre.conditions", "post.runs"],
      missions: [
        m("elements.lecture", ALL, "Lire les conditions", "Note les conditions avant d’y aller.", { phase: "start" }, { metric: "field", field: "conditionsRead", gte: 1 }),
        m("elements.securite", ALL, "Le cadre sûr", "Pratique dans un cadre adapté (encadré, accompagné ou équipé) et note-le.", { phase: "start" }, { metric: "declared" }, { safetyNote: "Mission prioritaire de la Voie." }),
        m("elements.page", ["explorer", "depasser"], "Une page de l’Atlas", "Rencontre une condition que ton atlas ne connaît pas encore.", { phase: "late" }, { metric: "field", field: "newConditions", gte: 1 }),
        m("elements.technique", ["atteindre", "depasser"], "Le geste du jour", "Choisis un point technique et note s’il a progressé.", { phase: "start" }, { metric: "declared" }),
      ],
      events: [
        { id: "page", when: { field: "newConditions" }, text: "Nouvelle page de l’Atlas : ces conditions rejoignent ta collection." },
      ],
      fallback: "C’est déjà la forme normale de la Voie : chrono silencieux, saisie avant et après.",
    },

    pilotage: {
      id: "pilotage", name: "La Trajectoire", essence: "prisme", panel: "log", safety: "aucune",
      tagline: "La constance des tours, jamais la prise de risque.",
      beat: { id: "tour", one: "tour", many: "tours", every: { beat: "lap", effortMin: 10 } },
      loop: [
        "Avant : circuit ou piste, nombre de sessions prévues. Le téléphone ne doit pas être consulté en piste.",
        "Pendant : aucun signal. TITAN compte le temps en arrière-plan.",
        "Après : tours, sessions et meilleur tour si tu l’as. La Voie mesure la constance entre tes tours, pas la vitesse pure.",
      ],
      artefact: { id: "trajectoires", name: "Le Carnet de trajectoires", text: "Tes circuits, la constance de tes tours." },
      guardian: { name: "L’Ingénieur de l’ombre", text: "Il note la régularité, jamais le danger." },
      liveData: ["timer", "post.laps"],
      missions: [
        m("pilotage.sessions", ["atteindre"], "Les sessions prévues", "Termine les sessions prévues.", { phase: "start" }, { metric: "declared" }),
        m("pilotage.constance", ["depasser"], "La constance", "Note des tours réguliers plutôt qu’un seul tour rapide.", { phase: "late" }, { metric: "declared" }),
        m("pilotage.briefing", ALL, "Le briefing", "Vérifie équipement et consignes de piste avant de rouler.", { phase: "start" }, { metric: "declared" }, { safetyNote: "Mission prioritaire de la Voie." }),
        m("pilotage.nouveau", ["explorer"], "Un nouveau tracé", "Découvre un circuit ou une configuration inédite.", { phase: "start" }, { metric: "declared" }),
      ],
      events: [
        { id: "tour", when: { field: "laps" }, text: "Tes tours rejoignent le carnet de trajectoires." },
      ],
      fallback: "Forme normale : chrono silencieux puis saisie après la piste.",
    },

    lien: {
      id: "lien", name: "Le Lien", essence: "seve", panel: "log", safety: "aucune",
      tagline: "Une progression à deux : toi et ton cheval.",
      beat: { id: "reprise", one: "reprise", many: "reprises", every: { effortMin: 12 } },
      loop: [
        "Avant : tu choisis (ou crées) le profil de ta monture : nom et caractère. La Voie se vit à deux.",
        "Pendant : aucune interaction en selle. Le chrono découpe la séance en reprises.",
        "Après : allures, figures, barres et fautes si tu les notes. Le lien grandit avec la régularité de vos séances communes et les séances calmes comptent autant que les concours.",
      ],
      artefact: { id: "ecurie", name: "L’Écurie", text: "Tes montures, le lien construit avec chacune." },
      guardian: { name: "La Cavalière d’argent", text: "Elle juge l’accord entre le cavalier et sa monture." },
      liveData: ["timer", "post.sport_fields"],
      missions: [
        m("lien.reprises", ["atteindre"], "Les reprises prévues", "Termine la séance prévue.", { phase: "start" }, { metric: "activeMin", gte: { goal: 1 } }, { verify: "log" }),
        m("lien.calme", ALL, "La séance calme", "Termine par quelques minutes au pas, rênes longues.", { phase: "late" }, { metric: "declared" }),
        m("lien.figure", ["depasser"], "La figure travaillée", "Travaille une figure ou un enchaînement précis et note la sensation.", { phase: "mid" }, { metric: "declared" }),
        m("lien.dehors", ["explorer"], "L’extérieur", "Une balade ou un terrain nouveau avec ta monture.", { phase: "start" }, { metric: "declared" }),
      ],
      events: [
        { id: "lien", when: { everyBeats: 2 }, text: "Le lien avec ta monture s’approfondit." },
      ],
      fallback: "Forme normale : chrono puis saisie au retour à l’écurie.",
    },

    odyssee: {
      id: "odyssee", name: "L’Odyssée", essence: "souffle", panel: "legs", safety: "mains_libres",
      tagline: "Des segments enchaînés, chaque transition est un portail.",
      beat: { id: "segment", one: "segment", many: "segments", every: { beat: "leg", effortMin: 10 } },
      loop: [
        "Avant : tu poses tes segments (natation, vélo, course, tir, obstacles…). Chacun appartient à sa propre Voie.",
        "Pendant : au changement de segment, un seul toucher (ou aucun : les segments se reconstituent au retour).",
        "Chaque transition est un portail sur la carte ; chaque segment nourrit l’essence de sa propre Voie.",
        "Après : ton Odyssée relie plusieurs Voies d’un coup : c’est la seule façon d’ouvrir les Portails du Camp de base.",
      ],
      artefact: { id: "portails", name: "Les Portails", text: "Tes enchaînements multi-segments et leurs transitions." },
      guardian: { name: "Le Héraut aux trois visages", text: "Il ne s’adresse qu’à ceux qui changent de Voie sans s’arrêter." },
      liveData: ["timer", "gps.distance", "declared.leg"],
      missions: [
        m("odyssee.segments", ["atteindre"], "Tous les segments", "Termine tous les segments prévus.", { phase: "start" }, { metric: "beats", gte: { plan: 1 }, where: { kind: "leg" } }),
        m("odyssee.transitions", ["depasser"], "Les portails fluides", "Prépare tes transitions à l’avance et note-les.", { phase: "start" }, { metric: "declared" }),
        m("odyssee.ordre", ["explorer"], "Un autre ordre", "Enchaîne deux segments dans un ordre inhabituel.", { phase: "start" }, { metric: "declared" }),
      ],
      events: [
        { id: "portail", when: { field: "leg" }, text: "Portail franchi : le segment suivant s’ouvre." },
      ],
      fallback: "Sans toucher aux transitions : les segments se saisissent au retour, la carte se reconstitue.",
    },
  };

  /* ------------------------------------------------------------------------------------------- */
  /* Resolution: profile → voie, then explicit sport overrides. Every catalogue sport resolves.   */
  /* ------------------------------------------------------------------------------------------- */
  const PROFILE_VOIE = {
    running: "sentier", trail: "sentier", mountain_endurance: "sentier", hiking: "altitude",
    cycling: "roue", mtb: "elements", swimming: "nage", water: "flots", glide: "sentier", mixed: "odyssee",
    mixed_conditioning: "brasier", speed: "brasier", strength: "forge", strength_max: "forge", calisthenics: "corps",
    climbing: "paroi", skill: "scene", precision: "cible", gym_skill: "scene", dance: "scene",
    team: "escouade", football: "escouade", rugby: "escouade", hockey_team: "escouade", contact_team: "escouade",
    racket: "joute", combat: "dojo", combat_grappling: "dojo", combat_striking: "dojo", combat_weapon: "dojo",
    mobility: "sanctuaire", mindbody: "sanctuaire",
  };

  const SPORT_VOIE = {
    // Endurance on foot that belongs to the mountain.
    alpinism: "altitude", hiking: "altitude", snowshoeing: "altitude", via_ferrata: "paroi",
    ski_touring: "altitude", ski_mountaineering: "altitude",
    rucking: "sentier", rogaining: "sentier",
    // Track and field: attempts, not distance.
    athletics: "stade", para_athletics: "stade", sprint: "stade", hurdles: "stade", bmx_racing: "stade", lifesaving_sport: "stade",
    // Wheels that are not an expedition.
    artistic_cycling: "scene", cycle_ball: "escouade", cycle_polo: "escouade",
    // Water: conditions, team, scene.
    canoe_slalom: "elements", sailing: "elements", surfing: "elements", freediving: "elements", snorkeling: "elements",
    canyoning: "elements", diving: "elements", kitesurf: "elements", wakeboard: "elements", windsurf: "elements",
    bodyboarding: "elements", rafting: "elements", skimboarding: "elements", water_skiing: "elements",
    canoe_polo: "escouade", underwater_hockey: "escouade", underwater_rugby: "escouade",
    artistic_swimming: "scene", aquagym: "brasier",
    // Snow and ice.
    alpine_skiing: "elements", freestyle_skiing: "elements", snowboard: "elements", telemark_skiing: "elements",
    ski_jumping: "elements", bmx_freestyle: "elements", skateboarding: "elements", parkour: "elements",
    bobsleigh: "pilotage", luge: "pilotage", skeleton: "pilotage", speed_skiing: "pilotage",
    figure_skating: "scene", biathlon: "odyssee", nordic_combined: "odyssee",
    // Air, motor and horse.
    skydiving: "elements", paragliding: "elements", karting: "pilotage", motocross: "pilotage",
    equestrian: "lien", dressage: "lien", eventing: "lien", show_jumping: "lien", horse_racing: "lien", polo: "escouade",
    // Mixed.
    hiit: "brasier", hyrox: "brasier", obstacle_course: "odyssee", elliptical: "sentier",
    // Strength duels stay at the forge, cardio classes at the brasier.
    zumba: "scene", springboard_diving: "scene",
  };

  /** Sport-level tuning: plan defaults and vocabulary that make each sport feel like itself. */
  const T = (o) => o;
  const SPORT_TUNING = {
    // Racket scoring: points per game, games/sets of a match.
    tennis: T({ score: { point: "point", game: "jeu", set: "set", sets: 3 } }),
    wheelchair_tennis: T({ score: { point: "point", game: "jeu", set: "set", sets: 3 } }),
    real_tennis: T({ score: { point: "point", game: "jeu", set: "set", sets: 3 } }),
    padel: T({ score: { point: "point", game: "jeu", set: "set", sets: 3 } }),
    beach_tennis: T({ score: { point: "point", game: "jeu", set: "set", sets: 3 } }),
    platform_tennis: T({ score: { point: "point", game: "jeu", set: "set", sets: 3 } }),
    badminton: T({ score: { point: "point", game: "set", set: "set", sets: 3, points: 21 } }),
    table_tennis: T({ score: { point: "point", game: "manche", set: "manche", sets: 5, points: 11 } }),
    squash: T({ score: { point: "point", game: "jeu", set: "jeu", sets: 5, points: 11 } }),
    racquetball: T({ score: { point: "point", game: "jeu", set: "jeu", sets: 3, points: 15 } }),
    pickleball: T({ score: { point: "point", game: "jeu", set: "jeu", sets: 3, points: 11 } }),
    racketlon: T({ score: { point: "point", game: "set", set: "set", sets: 4, points: 21 } }),
    // Team sports: periods.
    football: T({ periods: { count: 2, minutes: 45, label: "mi-temps" } }),
    futsal: T({ periods: { count: 2, minutes: 20, label: "mi-temps" } }),
    beach_soccer: T({ periods: { count: 3, minutes: 12, label: "tiers-temps" } }),
    blind_football: T({ periods: { count: 2, minutes: 20, label: "mi-temps" } }),
    basketball: T({ periods: { count: 4, minutes: 10, label: "quart-temps" } }),
    wheelchair_basketball: T({ periods: { count: 4, minutes: 10, label: "quart-temps" } }),
    basketball_3x3: T({ periods: { count: 1, minutes: 10, label: "match" } }),
    netball: T({ periods: { count: 4, minutes: 15, label: "quart-temps" } }),
    korfball: T({ periods: { count: 2, minutes: 30, label: "mi-temps" } }),
    handball: T({ periods: { count: 2, minutes: 30, label: "mi-temps" } }),
    beach_handball: T({ periods: { count: 2, minutes: 10, label: "période" } }),
    rugby: T({ periods: { count: 2, minutes: 40, label: "mi-temps" } }),
    rugby_sevens: T({ periods: { count: 2, minutes: 7, label: "mi-temps" } }),
    wheelchair_rugby: T({ periods: { count: 4, minutes: 8, label: "quart-temps" } }),
    american_football: T({ periods: { count: 4, minutes: 15, label: "quart-temps" } }),
    flag_football: T({ periods: { count: 2, minutes: 20, label: "mi-temps" } }),
    australian_rules_football: T({ periods: { count: 4, minutes: 20, label: "quart-temps" } }),
    gaelic_football: T({ periods: { count: 2, minutes: 35, label: "mi-temps" } }),
    hurling: T({ periods: { count: 2, minutes: 35, label: "mi-temps" } }),
    camogie: T({ periods: { count: 2, minutes: 30, label: "mi-temps" } }),
    ice_hockey: T({ periods: { count: 3, minutes: 20, label: "tiers-temps" } }),
    inline_hockey: T({ periods: { count: 2, minutes: 20, label: "mi-temps" } }),
    field_hockey: T({ periods: { count: 4, minutes: 15, label: "quart-temps" } }),
    floorball: T({ periods: { count: 3, minutes: 20, label: "tiers-temps" } }),
    bandy: T({ periods: { count: 2, minutes: 45, label: "mi-temps" } }),
    ringette: T({ periods: { count: 4, minutes: 15, label: "période" } }),
    lacrosse: T({ periods: { count: 4, minutes: 15, label: "quart-temps" } }),
    lacrosse_sixes: T({ periods: { count: 4, minutes: 8, label: "quart-temps" } }),
    water_polo: T({ periods: { count: 4, minutes: 8, label: "période" } }),
    canoe_polo: T({ periods: { count: 2, minutes: 10, label: "mi-temps" } }),
    polo: T({ periods: { count: 4, minutes: 7, label: "chukka" } }),
    volleyball: T({ periods: { count: 5, minutes: 20, label: "set" } }),
    beach_volleyball: T({ periods: { count: 3, minutes: 18, label: "set" } }),
    sitting_volleyball: T({ periods: { count: 5, minutes: 18, label: "set" } }),
    sepak_takraw: T({ periods: { count: 3, minutes: 15, label: "set" } }),
    futnet: T({ periods: { count: 3, minutes: 15, label: "set" } }),
    baseball: T({ periods: { count: 9, minutes: 18, label: "manche" } }),
    softball: T({ periods: { count: 7, minutes: 15, label: "manche" } }),
    cricket: T({ periods: { count: 2, minutes: 75, label: "innings" } }),
    ultimate: T({ periods: { count: 2, minutes: 40, label: "mi-temps" } }),
    kabaddi: T({ periods: { count: 2, minutes: 20, label: "mi-temps" } }),
    kho_kho: T({ periods: { count: 4, minutes: 9, label: "tour" } }),
    roller_derby: T({ periods: { count: 2, minutes: 30, label: "période" } }),
    // Precision units.
    archery: T({ end: { one: "volée", many: "volées", plan: 12 } }),
    shooting: T({ end: { one: "série", many: "séries", plan: 6 } }),
    golf: T({ end: { one: "trou", many: "trous", plan: 9 } }),
    disc_golf: T({ end: { one: "trou", many: "trous", plan: 9 } }),
    darts: T({ end: { one: "leg", many: "legs", plan: 10 } }),
    bowling: T({ end: { one: "partie", many: "parties", plan: 3 } }),
    billiards_pool: T({ end: { one: "frame", many: "frames", plan: 8 } }),
    snooker: T({ end: { one: "frame", many: "frames", plan: 5 } }),
    curling: T({ end: { one: "manche", many: "manches", plan: 8 } }),
    petanque: T({ end: { one: "mène", many: "mènes", plan: 13 } }),
    bocce: T({ end: { one: "mène", many: "mènes", plan: 12 } }),
    boccia: T({ end: { one: "manche", many: "manches", plan: 6 } }),
    croquet: T({ end: { one: "arceau", many: "arceaux", plan: 12 } }),
    // Combat bells.
    boxing: T({ bell: { rounds: 6, workS: 180, restS: 60 } }),
    kickboxing: T({ bell: { rounds: 6, workS: 120, restS: 60 } }),
    thaiboxing: T({ bell: { rounds: 5, workS: 180, restS: 60 } }),
    savate: T({ bell: { rounds: 5, workS: 120, restS: 60 } }),
    mma: T({ bell: { rounds: 5, workS: 300, restS: 60 } }),
    judo: T({ bell: { rounds: 6, workS: 240, restS: 60 } }),
    bjj: T({ bell: { rounds: 6, workS: 360, restS: 60 } }),
    grappling: T({ bell: { rounds: 6, workS: 300, restS: 60 } }),
    sambo: T({ bell: { rounds: 6, workS: 300, restS: 60 } }),
    wrestling: T({ bell: { rounds: 6, workS: 180, restS: 30 } }),
    freestyle_wrestling: T({ bell: { rounds: 6, workS: 180, restS: 30 } }),
    greco_roman_wrestling: T({ bell: { rounds: 6, workS: 180, restS: 30 } }),
    sumo: T({ bell: { rounds: 10, workS: 30, restS: 60 } }),
    fencing: T({ bell: { rounds: 8, workS: 180, restS: 60 } }),
    kendo: T({ bell: { rounds: 8, workS: 180, restS: 60 } }),
    arm_wrestling: T({ bell: { rounds: 8, workS: 60, restS: 120 } }),
    // Interval formats.
    hiit: T({ interval: { rounds: 8, workS: 40, restS: 20 } }),
    crossfit: T({ interval: { rounds: 5, workS: 180, restS: 60 } }),
    hyrox: T({ interval: { rounds: 8, workS: 240, restS: 30, label: "station" } }),
    fitness_class: T({ interval: { rounds: 8, workS: 180, restS: 45 } }),
    rope_jump: T({ interval: { rounds: 10, workS: 60, restS: 30 } }),
    stair_climbing: T({ interval: { rounds: 6, workS: 120, restS: 60 } }),
    aquagym: T({ interval: { rounds: 6, workS: 300, restS: 60 } }),
    // Strength rests.
    powerlifting: T({ rest: { s: 180 } }), weightlifting: T({ rest: { s: 150 } }), strongman: T({ rest: { s: 180 } }),
    para_powerlifting: T({ rest: { s: 180 } }), muscu_gym: T({ rest: { s: 120 } }), muscu_builder: T({ rest: { s: 120 } }),
    kettlebell: T({ rest: { s: 75 } }), trx: T({ rest: { s: 60 } }),
    // Climbing rests.
    bouldering: T({ rest: { s: 180 } }), climbing_route: T({ rest: { s: 300 } }), sport_climbing: T({ rest: { s: 300 } }),
    // Indoor equivalents.
    treadmill: T({ indoor: true }), elliptical: T({ indoor: true }), cycling_indoor: T({ indoor: true }), spinning: T({ indoor: true }),
    rowing_machine: T({ indoor: true }),
    // Road-heavy: never encourage speed while moving.
    velotaf: T({ road: true }), cycling_road: T({ road: true }), cycling: T({ road: true }), handbike: T({ road: true }), para_cycling: T({ road: true }),
    // Open water sports switch to strict silence.
    open_water_swimming: T({ outdoor: true }),
  };

  /** Sports whose practice makes any in-session prompt unsafe, whatever their Voie default. */
  const STRICT_SILENCE = new Set([
    "open_water_swimming", "freediving", "diving", "skydiving", "paragliding", "karting", "motocross", "bobsleigh", "luge",
    "skeleton", "speed_skiing", "ski_jumping", "alpine_skiing", "freestyle_skiing", "snowboard", "telemark_skiing",
    "kitesurf", "windsurf", "surfing", "canyoning", "rafting", "ice_climbing", "alpinism", "show_jumping", "eventing", "horse_racing",
  ]);
  /** Sports practiced on public roads. */
  const ROAD = new Set(["cycling", "cycling_road", "velotaf", "handbike", "para_cycling", "gravel", "roller", "inline_speed_skating", "roller_ski"]);
  /** GPS-capable outdoor sports (the phone can record a trace). */
  const NO_GPS = new Set(["treadmill", "elliptical", "cycling_indoor", "spinning", "rowing_machine", "athletics", "para_athletics",
    "cycling_track", "short_track_speed_skating", "speed_skating", "ice_skating", "hurdles", "sprint", "stair_climbing", "rope_jump"]);

  const snapshotRows = () => {
    if (!root.TITAN_SPORTS_SNAPSHOT && typeof require === "function") { try { require("./sports-catalog.js"); } catch (_) { /* web: loaded by the page */ } }
    return root.TITAN_SPORTS_SNAPSHOT || [];
  };
  let indexCache = null;
  function index() {
    if (indexCache) return indexCache;
    indexCache = new Map();
    for (const row of snapshotRows()) {
      const [id, label, unit, cat, profile, , , fields] = row;
      indexCache.set(id, { id, label, unit, cat, profile, fields: Array.isArray(fields) ? fields : [] });
    }
    return indexCache;
  }

  function voieIdOf(sportId, profile) {
    return SPORT_VOIE[sportId] || PROFILE_VOIE[profile || ""] || "sentier";
  }

  /** Measurable data for one sport: what can be live, what is declared, what comes after. Never invented. */
  function dataOf(sport, voie) {
    const fields = (sport.fields || []).filter((f) => f && !f.legacy).map((f) => f.id);
    const gps = sport.unit === "km" && !NO_GPS.has(sport.id) && ["route"].includes(voie.panel);
    const has = (id) => fields.includes(id);
    const declaredLive = [];
    if (voie.panel === "sets") declaredLive.push("séries (répétitions, charge, réserve)");
    if (voie.panel === "wall") declaredLive.push("essais (réussite, flash, chute, cotation)");
    if (voie.panel === "score") declaredLive.push(voie.id === "escouade" ? "périodes" : voie.id === "cible" ? "score par unité" : "points et manches");
    if (voie.panel === "rounds") declaredLive.push(voie.id === "stade" ? "tentatives et marques" : "rounds terminés");
    if (voie.panel === "flow") declaredLive.push(voie.id === "sanctuaire" ? "gêne avant/après" : "passages d’enchaînement");
    if (voie.panel === "legs") declaredLive.push("changements de segment");
    return {
      timer: true,
      gps,
      steps: ["sentier", "altitude"].includes(voie.id) && sport.unit === "km",
      heartRate: has("avg_hr") ? "déclarée ou importée après séance" : null,
      power: has("avg_power") ? "déclarée" : null,
      declaredLive,
      afterFields: fields.slice(0, 8),
    };
  }

  function safetyOf(sport, voie) {
    if (STRICT_SILENCE.has(sport.id)) return "aucune";
    if (ROAD.has(sport.id) && voie.safety !== "aucune") return "mains_libres";
    return voie.safety;
  }

  const resolved = new Map();
  /** Full live configuration of one sport (memoised: the engine calls it on every step and never mutates it). */
  function resolve(sportId) {
    if (resolved.has(sportId)) return resolved.get(sportId);
    const conf = build(sportId);
    if (index().has(sportId)) resolved.set(sportId, conf);
    return conf;
  }

  function build(sportId) {
    const sport = index().get(sportId) || { id: sportId, label: String(sportId || "Séance"), unit: "min", cat: "", profile: "", fields: [] };
    const voieId = voieIdOf(sport.id, sport.profile);
    const voie = VOIES[voieId] || VOIES.sentier;
    const tuning = SPORT_TUNING[sport.id] || {};
    const data = dataOf(sport, voie);
    if (tuning.indoor) data.gps = false;
    const safety = safetyOf(sport, voie);
    const beat = { ...voie.beat };
    if (tuning.end) Object.assign(beat, { one: tuning.end.one, many: tuning.end.many });
    if (tuning.periods && voie.id === "escouade") Object.assign(beat, { one: tuning.periods.label, many: tuning.periods.label === "match" ? "matchs" : `${tuning.periods.label}s`.replace("ss", "s") });
    if (tuning.interval?.label) Object.assign(beat, { one: tuning.interval.label, many: `${tuning.interval.label}s` });
    const plan = defaultPlan(sport, voie, tuning);
    const missions = voie.missions.filter((mi) => {
      if (mi.when?.indoorOnly && !tuning.indoor && !NO_GPS.has(sport.id)) return false;
      if (mi.when?.outdoorOnly && (tuning.indoor || NO_GPS.has(sport.id))) return false;
      if (mi.when?.outdoorOnly && voie.id === "nage" && sport.id !== "open_water_swimming") return false;
      if (mi.when?.needs === "gps" && !data.gps) return false;
      return true;
    });
    // When the screen may not ask for a tap during the effort, missions are chosen before the start (see live-engine).
    const offerMode = SAFETY[safety].tapsWhileActive ? "live" : "before";
    return {
      sport: sport.id, label: sport.label, unit: sport.unit, profile: sport.profile,
      family: ESSENCES[voie.essence].family, essence: voie.essence,
      voie: voie.id, voieName: voie.name, panel: voie.panel, tagline: voie.tagline,
      safety, safetyLabel: SAFETY[safety].label, safetyWhy: SAFETY[safety].why, maxImmersion: SAFETY[safety].maxLevel,
      road: ROAD.has(sport.id) || !!tuning.road,
      beat, plan, data, tuning,
      offerMode, missions, events: voie.events, artefact: voie.artefact, guardian: voie.guardian,
      fallback: voie.fallback,
    };
  }

  function defaultPlan(sport, voie, tuning) {
    if (tuning.periods) return { kind: "period", count: tuning.periods.count, minutes: tuning.periods.minutes };
    if (tuning.bell) return { kind: "round", count: tuning.bell.rounds, workS: tuning.bell.workS, restS: tuning.bell.restS };
    if (tuning.interval) return { kind: "round", count: tuning.interval.rounds, workS: tuning.interval.workS, restS: tuning.interval.restS };
    if (tuning.end) return { kind: "end", count: tuning.end.plan };
    if (tuning.score) return { kind: "game", count: tuning.score.sets };
    switch (voie.panel) {
      case "sets": return { kind: "set", count: voie.id === "forge" ? 12 : 8, restS: tuning.rest?.s || (voie.id === "forge" ? 90 : 60) };
      case "wall": return { kind: "attempt", count: 8, restS: tuning.rest?.s || 180 };
      case "rounds": return voie.id === "stade" ? { kind: "attempt", count: 6, restS: 240 } : { kind: "round", count: 6, workS: 180, restS: 60 };
      case "score": return voie.id === "escouade" ? { kind: "period", count: 2, minutes: 30 } : voie.id === "cible" ? { kind: "end", count: 10 } : { kind: "game", count: 3 };
      case "legs": return { kind: "leg", count: 3 };
      case "flow": return voie.id === "scene" ? { kind: "routine", count: 4 } : { kind: "time", minutes: 20 };
      default: return { kind: "time", minutes: voie.id === "nage" ? 40 : 45 };
    }
  }

  function all() {
    return [...index().keys()].map(resolve);
  }

  const api = { INTENTS, IMMERSION, SAFETY, ESSENCES, VOIES, PROFILE_VOIE, SPORT_VOIE, SPORT_TUNING, STRICT_SILENCE, ROAD, resolve, all, voieIdOf };
  root.TitanLiveVoies = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
