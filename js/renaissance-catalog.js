(function (root) {
  "use strict";
  const worlds = [
    {
      id: "aube",
      name: "La vallée de l’Aube",
      subtitle: "Retrouver son élan",
      tier: "free",
      image: "valley",
      color: "#ade8cb",
      guardian: "Le Veilleur de pierre",
      intro:
        "Les portes de la vallée se sont endormies. Chaque effort rallume une balise. Tu n’as pas besoin d’aller vite : il suffit de tracer ton chemin.",
      ending:
        "Les neuf balises éclairent à nouveau la vallée. Le Veilleur te reconnaît : tu as construit un rythme qui t’appartient.",
      chapters: [
        [
          "Le premier signal",
          "Une lueur attend au bord du sentier. Ton premier effort lui donne vie.",
          "Choisis une pratique que tu connais. La séance peut être courte : renseigne ce que tu as réellement fait.",
          "Éclaireur",
        ],
        [
          "Le pont des possibles",
          "Deux rives se rejoignent lorsque tu reviens sur le chemin.",
          "Prépare ton prochain créneau dans le planning du QG. Un rendez-vous réaliste vaut mieux qu’un programme trop chargé.",
          "Bâtisseur de ponts",
        ],
        [
          "Le carnet du passeur",
          "Le passeur collectionne les histoires, pas les performances.",
          "Ajoute une note de séance : ce qui était facile, ce qui l’était moins et ce que tu veux retrouver la prochaine fois.",
          "Conteur",
        ],
        [
          "Le refuge des cèdres",
          "Un refuge apparaît entre les arbres. Ici, personne ne te demande de courir tous les jours.",
          "Ajuste ton objectif hebdomadaire à ta disponibilité. Les jours sans séance ne retirent aucun niveau.",
          "Gardien du rythme",
        ],
        [
          "Les échos du lac",
          "Le lac reflète les chemins parcourus. Un détail oublié devient un repère.",
          "Ouvre ton journal et vérifie la durée et l’unité de ta dernière séance. Une correction améliore aussi tes analyses.",
          "Observateur",
        ],
        [
          "L’atelier des repères",
          "Des outils anciens prennent forme quand tu apprends à lire tes efforts.",
          "Compare deux séances du même sport. Garde les mêmes unités et le même contexte avant d’en tirer une conclusion.",
          "Artisan",
        ],
        [
          "La montée des lucioles",
          "Les balises dessinent un passage que tu ne voyais pas au départ.",
          "Retrouve ton sport le plus pratiqué dans Progrès. Observe les jours actifs, sans confondre fréquence et intensité.",
          "Porte-lumière",
        ],
        [
          "Le cercle de pierre",
          "Le Veilleur te laisse approcher. Il reconnaît les retours, même après une pause.",
          "Crée un objectif daté à partir de ton rythme réel. Tu pourras l’ajuster si ta semaine change.",
          "Sentinelle",
        ],
        [
          "L’éveil du Veilleur",
          "Les dernières balises se répondent. La porte de l’Aube peut enfin s’ouvrir.",
          "Prends le temps de relire ton bilan. Choisis une habitude utile à conserver pour la prochaine aventure.",
          "Veilleur de l’Aube",
        ],
      ],
    },
    {
      id: "marees",
      name: "L’archipel des Marées",
      subtitle: "Explorer à sa façon",
      tier: "free",
      image: "archipelago",
      color: "#8edbe5",
      guardian: "La Gardienne des courants",
      intro:
        "Au large, les îles changent de visage avec la lumière. Retrouve les phares et découvre les différentes facettes de ta pratique.",
      ending:
        "Les phares guident de nouveau les voyageurs. Tu sais désormais choisir tes repères, et changer de cap quand tu en as besoin.",
      chapters: [
        [
          "La carte incomplète",
          "Un cartographe te confie une carte sans itinéraire imposé.",
          "Repère les sports proposés dans le catalogue. Ajoute aux favoris ceux que tu pratiques vraiment.",
          "Cartographe",
        ],
        [
          "Le phare des unités",
          "Un phare s’allume lorsque les distances retrouvent leur juste mesure.",
          "Vérifie l’unité avant de saisir un résultat : kilomètres, minutes, répétitions et kilogrammes ne s’additionnent pas.",
          "Navigateur",
        ],
        [
          "La crique des essais",
          "Dans la crique, chaque essai laisse une trace, même sans record.",
          "Renseigne les tentatives et réussites lorsqu’un sport le permet. Un essai apporte du contexte à la progression.",
          "Explorateur des criques",
        ],
        [
          "Les voiles familières",
          "Une embarcation connue rend le départ plus simple.",
          "Enregistre une routine réutilisable ou duplique une séance. Vérifie chaque valeur avant de la valider.",
          "Maître des voiles",
        ],
        [
          "La boussole calme",
          "La boussole indique ton cap, sans comparer ton voyage à celui des autres.",
          "Dans Progrès, sélectionne un seul sport. Commence par une question précise : fréquence, durée ou régularité ?",
          "Boussole des îles",
        ],
        [
          "L’île des nuances",
          "Les reliefs se révèlent avec la lumière. Les chiffres aussi ont besoin de contexte.",
          "Ajoute un ressenti facultatif et une note. Un résultat isolé ne décrit pas toute ta séance.",
          "Lecteur des courants",
        ],
        [
          "La traversée",
          "La route s’éloigne du rivage. Tes repères restent avec toi.",
          "Exporte ton journal pour conserver tes données. Vérifie que les colonnes et les dates correspondent à ton besoin.",
          "Passeur des îles",
        ],
        [
          "Le jardin des marées",
          "Le jardin suit les marées : une autre façon de rester constant.",
          "Observe tes semaines sur une période plus longue. Une semaine légère n’efface pas les précédentes.",
          "Gardien des marées",
        ],
        [
          "Le retour des phares",
          "La Gardienne réunit les lumières de l’archipel. La carte porte désormais tes chemins.",
          "Fais le bilan de tes sports favoris et de ceux que tu veux explorer. La suite peut emprunter un nouveau chemin.",
          "Gardien des horizons",
        ],
      ],
    },
    {
      id: "forge",
      name: "Les forges d’Obsidienne",
      subtitle: "Affiner ses repères",
      tier: "plus",
      image: "forge",
      color: "#f3bb86",
      guardian: "L’Artisan de braise",
      intro:
        "Sous la montagne, les ateliers attendent de retrouver leur précision. Chaque étape façonne un instrument pour mieux comprendre tes efforts.",
      ending:
        "La grande forge rayonne. Tu repars avec des repères plus solides et des outils que tu sais utiliser.",
      chapters: [
        [
          "L’étincelle",
          "Un atelier oublié retrouve sa première lumière.",
          "Choisis un indicateur à suivre pendant cette campagne. Un seul repère clair rend les comparaisons plus utiles.",
          "Porte-étincelle",
        ],
        [
          "La balance juste",
          "L’artisan ajuste sa balance avant de travailler le métal.",
          "Vérifie la qualité de tes saisies : durée, charge, répétitions et contexte. Une case inconnue peut rester vide.",
          "Métrologue",
        ],
        [
          "Le moule",
          "Une forme réutilisable réduit les gestes inutiles.",
          "Organise tes routines par intention et matériel disponible. Donne-leur des noms que tu reconnaîtras facilement.",
          "Modeleur",
        ],
        [
          "Les deux lames",
          "Deux pièces côte à côte révèlent ce qu’un regard seul ne voit pas.",
          "Compare deux périodes de même durée dans ton bilan. Lis aussi combien de séances disposent des données nécessaires.",
          "Comparateur",
        ],
        [
          "Le grain du métal",
          "Les détails du métal expliquent sa résistance.",
          "En musculation, observe un même exercice et une même variante. Pour un autre sport, conserve un contexte comparable.",
          "Artisan du détail",
        ],
        [
          "Le soufflet",
          "La forge alterne les souffles et les silences.",
          "Regarde la répartition de tes séances dans le calendrier. Déplace les créneaux prévus selon tes contraintes réelles.",
          "Maître du souffle",
        ],
        [
          "Le sceau",
          "Un sceau indique d’où vient une pièce et comment elle a été façonnée.",
          "Ouvre la séance source d’un record. Note ce qui la rend comparable, et ce qui la distingue des autres.",
          "Porte-sceau",
        ],
        [
          "La pièce maîtresse",
          "L’atelier prend la forme de tes habitudes.",
          "Prépare un bilan lisible : période, sport, valeurs renseignées et une observation personnelle.",
          "Architecte de la forge",
        ],
        [
          "Le cœur de braise",
          "L’Artisan transmet le feu de l’atelier. La précision devient ton outil.",
          "Conserve les outils que tu utilises réellement. Retire les objectifs et routines qui ne t’aident plus.",
          "Artisan de braise",
        ],
      ],
    },
    {
      id: "aurores",
      name: "La citadelle des Aurores",
      subtitle: "Construire sur la durée",
      tier: "plus",
      image: "aurora",
      color: "#c4b5fd",
      guardian: "La Sentinelle du ciel",
      intro:
        "Au-delà des crêtes, la citadelle conserve les récits des voyageurs. Assemble ton propre atlas et prépare les chemins à venir.",
      ending:
        "La citadelle accueille ton récit. Aucun dernier niveau ne met fin à ton aventure : la prochaine étape reste ton choix.",
      chapters: [
        [
          "Le col silencieux",
          "Le passage s’ouvre aux voyageurs qui connaissent leur rythme.",
          "Repars de tes quatre dernières semaines pour choisir un objectif compatible avec ton quotidien.",
          "Voyageur des cimes",
        ],
        [
          "L’atlas personnel",
          "Chaque page de l’atlas révèle un chemin différent.",
          "Explore tes records par sport. Une distance, une charge et une cotation demandent des lectures différentes.",
          "Archiviste",
        ],
        [
          "Le fil des saisons",
          "La citadelle rassemble les saisons sans effacer les pauses.",
          "Observe une période de trois mois. Repère les changements de pratique avant d’interpréter les totaux.",
          "Tisseur des saisons",
        ],
        [
          "Le belvédère",
          "Prendre de la hauteur révèle les limites d’une carte.",
          "Vérifie les données manquantes dans ton bilan. Une absence de durée ne veut pas dire que la séance a duré zéro minute.",
          "Guetteur",
        ],
        [
          "La chambre des échos",
          "Les voix des autres éclairent le voyage lorsqu’on choisit de les écouter.",
          "Prépare une observation à partager avec un coach ou un partenaire, en choisissant les données que tu souhaites montrer.",
          "Messager des cimes",
        ],
        [
          "L’aiguille du nord",
          "L’aiguille retrouve le nord après chaque détour.",
          "Modifie un objectif devenu inadapté. Un objectif sert à guider une pratique, pas à imposer un rythme coûte que coûte.",
          "Porte-cap",
        ],
        [
          "Le livre ouvert",
          "Ton récit reste entre tes mains.",
          "Télécharge tes données et relis tes réglages de confidentialité. Un partage doit rester un choix explicite.",
          "Gardien du récit",
        ],
        [
          "La dernière terrasse",
          "La lumière atteint la terrasse où les voyages se préparent.",
          "Planifie une semaine simple avec une marge pour les imprévus. Prévois aussi les jours sans séance.",
          "Architecte des cimes",
        ],
        [
          "Le ciel retrouvé",
          "La Sentinelle ouvre le dôme. Les aurores dessinent tous tes chemins.",
          "Relis le chemin parcouru et choisis ce qui te motive pour la suite : apprendre, explorer, pratiquer ensemble ou consolider.",
          "Sentinelle des Aurores",
        ],
      ],
    },
  ];
  const targets = [1, 2, 2, 2, 3, 2, 3, 3, 3];
  worlds.forEach((world) => {
    world.chapters = world.chapters.map((c, i) =>
      Object.freeze({
        id: `${world.id}-${i + 1}`,
        index: i + 1,
        name: c[0],
        story: c[1],
        practice: c[2],
        title: c[3],
        target: targets[i],
        boss: i === 8,
      }),
    );
  });
  const ranks = [
    { level: 1, name: "Éclaireur" },
    { level: 3, name: "Explorateur" },
    { level: 6, name: "Sentinelle" },
    { level: 10, name: "Gardien" },
    { level: 15, name: "Champion" },
    { level: 25, name: "Titan" },
    { level: 40, name: "Légende" },
  ];
  const avatars = [
    {
      id: "scout",
      name: "L’Éclaireuse",
      role: "La curiosité ouvre le chemin",
      level: 1,
    },
    {
      id: "ranger",
      name: "Le Passeur",
      role: "Chaque retour compte",
      level: 1,
    },
    {
      id: "keeper",
      name: "La Gardienne",
      role: "Un rythme qui dure",
      level: 3,
    },
    {
      id: "artisan",
      name: "L’Artisan",
      role: "L’attention aux détails",
      level: 6,
    },
    {
      id: "navigator",
      name: "La Navigatrice",
      role: "Toujours un nouvel horizon",
      level: 10,
    },
    {
      id: "sentinel",
      name: "La Sentinelle",
      role: "Ton chemin, ton histoire",
      level: 15,
    },
  ];
  const routes = [
    {
      id: "rhythm",
      name: "Régularité",
      description: "Pratiquer sur des jours différents",
      unit: "jours actifs",
    },
    {
      id: "journal",
      name: "Observation",
      description: "Pratiquer et noter un repère personnel",
      unit: "jours avec une séance annotée",
    },
  ];
  root.TitanCodex = Object.freeze({
    worlds,
    ranks,
    avatars,
    routes,
    version: 1,
  });
})(typeof window === "undefined" ? globalThis : window);
