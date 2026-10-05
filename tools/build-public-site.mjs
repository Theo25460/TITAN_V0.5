// TITAN 300 — public site generator: landing, offers and guides on the Ascension design.
// Every claim here must match what the app and the server actually do (see docs/ASCENSION_300.md).
// Usage: node tools/build-public-site.mjs   (rewrites the HTML files listed in PAGES and the sitemap)
import { writeFileSync } from "node:fs";
import { icon, C, E, SITE, TODAY, typical, monthsTo, fmtMonths, MASTERY, page, faq, finalCta, cards } from "./lib/public-template.mjs";

/* ---------- Offers (single source for landing and /tarifs) ---------- */
const FREE = [
  "Journal multisport complet : 260 sports, liste, calendrier, édition, export CSV et JSON",
  "Records avec leur séance source, objectifs datés, récap de la semaine",
  "Rang, maîtrise par sport, cadence choisie, collection",
  "Deux campagnes complètes : 18 chapitres, 2 gardiens",
  "Communauté : amis par consentement, Moments, défis sans mise, expéditions, guilde",
  "Atelier : cadres, ambiances et cartes gagnés avec tes crédits",
  "5 routines, coaching jusqu’à 3 sportifs, profil public (optionnel)",
];
const PLUS = [
  "Tout le Classique, avec exactement les mêmes règles d’XP et de crédits",
  "2 campagnes de plus : les forges d’Obsidienne et la citadelle des Aurores",
  "20 routines nommées au lieu de 5",
  "Jusqu’à 20 sportifs dans l’espace coach",
  "4 pièces de collection TITAN+ (Aegis, Givre, Aurores, Obsidienne)",
];
const offersHtml = `<div class="pub-grid cols-2">
  <article class="pub-card"><p class="pub-eyebrow">Classique</p><h3>Tout ce qui fait progresser.</h3><p class="pub-price">0 € <small>sans limite de durée</small></p><ul>${FREE.map((t) => `<li>${icon("check")}<span>${t}</span></li>`).join("")}</ul><a class="asc-btn asc-btn-secondary" href="/onboarding">Commencer gratuitement</a></article>
  <article class="pub-card is-plus"><p class="pub-eyebrow" style="color:var(--am)">TITAN+</p><h3>Plus de monde à explorer.</h3><p class="pub-price">5 € <small>par mois</small></p><ul>${PLUS.map((t) => `<li>${icon("check")}<span>${t}</span></li>`).join("")}</ul><a class="asc-btn asc-btn-primary" href="/boutique#plus">Découvrir TITAN+</a><p class="pub-fine">Prix final, taxes, renouvellement et résiliation affichés par Paddle avant le paiement.</p></article>
</div>
<div class="pub-card" style="margin-top:12px"><p class="pub-eyebrow">Ce que TITAN+ ne change jamais</p><p>Pas d’XP en plus, pas de crédits en plus, pas de plafond relevé, pas d’avance sur les gardiens, les classements ou les expéditions. On ne vend pas de progression.</p></div>`;

/* =====================================================================
   Landing
   ===================================================================== */
const heroMock = `<div class="pub-mock" aria-label="Exemple d’écran TITAN avec des données fictives">
  <span class="pub-mock-tag">Exemple · données fictives</span>
  <div class="pub-mock-card"><div class="pub-mock-id"><img src="/assets/renaissance/navigator.webp" alt="" width="104" height="104"><div><strong>Gardien · niveau 11</strong><small>Prochain rang : Champion au niveau 15</small></div></div><div class="pub-bar"><span style="--p:62%"></span></div><div class="pub-row"><span>Niveau 11</span><strong>${Math.round(E.levelRequirement(11) * 0.62).toLocaleString("fr-FR")} / ${E.levelRequirement(11).toLocaleString("fr-FR")} XP</strong></div></div>
  <div class="pub-mock-card"><div class="pub-row"><span>Cette semaine</span><strong>3 jours sur 4 visés</strong></div><div class="pub-days"><span class="on">L</span><span>M</span><span class="on">M</span><span>J</span><span class="on">V</span><span>S</span><span>D</span></div></div>
  <div class="pub-mock-card pub-mock-record"><p class="pub-eyebrow">${icon("star")} Record · course à pied</p><strong class="big">10 km · 47:12</strong><div class="pub-row"><span>Avant : 49:03</span><span>Séance source du 3 oct.</span></div></div>
  <div class="pub-mock-card"><div class="pub-row"><span>Course à pied · maîtrise</span><strong>Expérience · 6/10</strong></div><div class="pub-bar"><span style="--p:58%"></span></div></div>
</div>`;

const homeFaq = faq([
  ["C’est un journal d’entraînement ou un jeu ?", "Un journal d’abord : tes séances, tes mesures, tes records, avec leur source. La progression (rang, maîtrise, aventure) se nourrit de ces séances réelles. Le jeu donne un fil ; il ne remplace jamais la donnée."],
  ["Comment l’XP est-elle calculée ?", `À partir de l’effort : les minutes de la séance, comptées pleinement jusqu’à 90 puis à moitié, multipliées par l’intensité ressentie. Une séance typique de 45 minutes rapporte environ ${typical.xp} XP. Les plafonds sont les mêmes pour tous : ${E.DAILY_XP_CAP.toLocaleString("fr-FR")} XP par jour et ${E.WEEKLY_XP_CAP.toLocaleString("fr-FR")} par semaine. <a href="/niveaux-et-xp">Toutes les règles</a>.`],
  ["Que se passe-t-il si je fais une pause ?", "Rien ne se perd : ni niveau, ni maîtrise, ni insignes. Tu choisis ta cadence (de 1 à 7 jours actifs par semaine) et tu peux déclarer une semaine en pause. Pas de série qui s’effondre, pas de culpabilité."],
  ["Mes données sont-elles publiques ?", "Non. Tout est privé par défaut. Les amis demandent ton accord, les Moments se partagent un par un, le profil public est désactivé tant que tu ne l’actives pas. Jamais de santé, de poids, de GPS ni de notes dans les espaces partagés."],
  ["Ça marche hors ligne ?", "Oui. Une séance enregistrée sans réseau reste sur ton téléphone et part toute seule au retour de la connexion. L’application s’installe sur l’écran d’accueil."],
  ["Peut-on tricher ?", "Ça ne rapporte rien. Les récompenses sont calculées par le serveur, plafonnées, et une séance saisie plus de 30 jours après sa date rejoint ton historique sans XP. Ton journal reste à toi ; la progression reste équitable."],
]);
const home = page({
  route: "/",
  title: "TITAN — Journal sportif multisport, progression et aventure",
  description: "Enregistre toutes tes séances, comprends tes progrès et fais avancer une aventure avec ton sport réel. Gratuit, sans publicité, privé par défaut.",
  schema: [
    { "@type": "WebApplication", name: "TITAN", url: `${SITE}/`, applicationCategory: "SportsApplication", operatingSystem: "Web, Android, iOS (navigateur)", isAccessibleForFree: true, offers: [{ "@type": "Offer", name: "Classique", price: "0", priceCurrency: "EUR" }, { "@type": "Offer", name: "TITAN+", price: "5", priceCurrency: "EUR" }] },
    homeFaq.schema,
  ],
  body: `<section class="pub-hero"><img class="pub-hero-bg" src="/assets/renaissance/valley.webp" srcset="/assets/renaissance/valley-small.webp 800w, /assets/renaissance/valley.webp 1600w" sizes="100vw" width="1600" height="900" alt="" fetchpriority="high" decoding="async">
  <div class="pub-wrap"><div class="pub-hero-copy"><p class="pub-eyebrow">${icon("bolt")} Journal multisport · progression · aventure</p>
    <h1>Ton sport réel.<br><em>Une progression qui dure.</em></h1>
    <p class="pub-lead">Course, musculation, escalade, natation, padel : enregistre ce que tu fais vraiment. TITAN en tire des repères clairs, une maîtrise qui grandit sport par sport et une aventure qui avance avec tes séances. Ici, seul l’effort fait avancer.</p>
    <div class="pub-cta"><a class="asc-btn asc-btn-primary" href="/onboarding">Commencer · 2 minutes ${icon("arrow")}</a><a class="asc-btn asc-btn-secondary" href="#boucle">Voir comment ça marche</a></div>
    <p class="pub-fine">Gratuit · Sans publicité · Sans carte bancaire · Essai sans compte</p></div>${heroMock}</div></section>
  <div class="pub-wrap"><div class="pub-promises"><span>${icon("layers")} 260 sports, chacun ses mesures</span><span>${icon("offline")} Fonctionne hors ligne</span><span>${icon("lock")} Privé par défaut</span><span>${icon("shield")} Aucune progression à vendre</span></div></div>

  <section class="pub-section" id="boucle"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">La boucle</p><h2>Prévoir. Bouger. Comprendre.<br>Et revenir avec envie.</h2><p class="pub-lead">Chaque séance fait tourner la même boucle, sans écran inutile entre toi et ton entraînement.</p></div>
    <ol class="pub-loop"><li><div><strong>Je prévois</strong><span>Une semaine type, sport par sport. Le QG te dit ce qui est prévu aujourd’hui.</span></div></li><li><div><strong>Je bouge</strong><span>Le sport que tu aimes, à ton rythme. TITAN ne t’impose ni allure ni charge.</span></div></li><li><div><strong>J’enregistre</strong><span>En quelques secondes, même sans réseau. Les champs s’adaptent au sport.</span></div></li><li><div><strong>Je comprends</strong><span>Le récap de la semaine répond à de vraies questions, avec les séances sources.</span></div></li><li><div><strong>Je progresse</strong><span>Rang, maîtrise par sport, records datés. Une progression longue, jamais achetée.</span></div></li><li><div><strong>Le monde réagit</strong><span>Une balise s’allume, un gardien recule, une expédition avance avec les autres.</span></div></li></ol></div></section>

  <section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">Un vrai carnet</p><h2>Chaque sport garde<br>ses propres mesures.</h2><p class="pub-lead">Une valeur absente reste absente : TITAN n’invente rien pour remplir un graphique.</p></div>
    ${cards([
      ["weight", "Musculation", "Exercices, séries, charges, répétitions, RIR. Routines réutilisables, progression par exercice et par variante.", "/carnet-musculation"],
      ["run", "Course, marche, vélo", "Distance, durée à la seconde, allure, vitesse, import GPX. Records sur 5, 10, 21,1 et 42,2 km avec la séance source.", "/journal-course-a-pied"],
      ["mountain", "Escalade", "Bloc ou voie, cotations françaises, Fontainebleau et V-scale tenues séparées. Essais et réussites.", "/suivi-escalade"],
      ["wave", "Et 250 autres", "Natation, padel, yoga, sports de combat, ski… Chaque sport a sa famille, ses champs et ses repères.", "/sports"],
    ], 4)}</div></section>

  <section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">Des statistiques qui répondent</p><h2>Pas des graphiques.<br>Des réponses.</h2><p class="pub-lead">Chaque semaine, TITAN répond aux questions que tu te poses vraiment, et dit sur quoi repose la réponse.</p></div>
    <div class="pub-grid cols-3">${[
      ["Est-ce que je progresse ?", "« 5 h 20 sur les 4 dernières semaines, 40 min de plus que les 4 précédentes. »"],
      ["Où va mon temps ?", "« L’endurance occupe 62 % de ton temps sur 12 semaines, puis la force (24 %). »"],
      ["Ma semaine est-elle chargée ?", "« Charge comparable à ta moyenne : rien d’inhabituel. »"],
      ["Mon allure s’améliore-t-elle ?", "« Sur tes sorties de 8 à 12 km, 5:02 /km contre 5:14 il y a deux mois. »"],
      ["Ma force progresse-t-elle ?", "« Squat barre : meilleure série à 85 kg × 5, contre 80 kg × 5 en août. »"],
      ["Je tiens ma cadence ?", "« 3 jours actifs sur 3 visés, 6 semaines tenues sur les 8 dernières. »"],
    ].map(([q, a]) => `<div class="pub-q"><strong>${q}</strong><span>${a}</span></div>`).join("")}</div><p class="pub-fine" style="margin-top:16px">Exemples de formulations, avec des valeurs fictives.</p></div></section>

  <section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">Une progression longue et honnête</p><h2>Cinq couches.<br>Aucune ne s’achète.</h2></div>
    ${cards([
      ["crown", "Le rang", `Sept rangs, de l’Éclaireur à la Légende. À trois séances de 45 minutes par semaine : Sentinelle en ${fmtMonths(monthsTo(6))}, Gardien en ${fmtMonths(monthsTo(10))}, Titan en ${fmtMonths(monthsTo(25))}.`],
      ["target", "La maîtrise", "Dix paliers par sport, qui demandent des heures <strong>et</strong> des semaines de pratique. Référence : 160 heures sur 90 semaines."],
      ["calendar", "La cadence", "Tu choisis combien de jours actifs viser. Une semaine en pause ne compte ni pour ni contre toi. Pas de série toxique."],
      ["compass", "L’aventure", "Quatre mondes, trente-six balises, quatre gardiens qui demandent de la constance plutôt qu’un exploit."],
      ["star", "La collection", "Insignes, jalons, records, titres d’expédition, cadres de rang : ton parcours, raconté sans rien gonfler."],
      ["shield", "L’équité", "Les mêmes plafonds pour tous, abonnés compris. Une séance saisie plus de 30 jours après sa date entre au journal sans XP."],
    ])}<a class="pub-link" href="/niveaux-et-xp" style="margin-top:20px">Toutes les règles de progression ${icon("arrow")}</a></div></section>

  <section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">L’aventure</p><h2>Quatre mondes.<br>Ton sport les rallume.</h2><p class="pub-lead">Chaque jour actif allume une balise. Au neuvième chapitre, le gardien attend trois jours actifs et 150 minutes d’effort, 90 au plus par jour.</p></div>
    <div class="pub-grid cols-4">${C.worlds.map((w) => `<a class="pub-world" href="/aventures-sportives#${w.id}"><img src="/assets/renaissance/${w.image}-small.webp" width="800" height="450" alt="" loading="lazy" decoding="async"><span class="pub-tier${w.tier === "plus" ? " plus" : ""}">${w.tier === "plus" ? "TITAN+" : "GRATUIT"}</span><h3>${w.name}</h3><p>${w.subtitle} · ${w.guardian}</p></a>`).join("")}</div></div></section>

  <section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">Ensemble, sans pression</p><h2>Avancer avec les autres.<br>Sans tout montrer.</h2></div>
    ${cards([
      ["send", "Moments", "Un record, une balise, une belle semaine : tu choisis ce que tes amis voient, un Moment à la fois. Ils peuvent t’encourager."],
      ["flag", "Défis sans mise", "Entre amis, en minutes d’effort ou en jours actifs. Aucun crédit en jeu, 90 minutes comptées au plus par jour."],
      ["mountain", "Expéditions", "Une saison, un gardien, toute la communauté. Chaque minute d’effort compte pareil, quel que soit le sport."],
      ["group", "Guilde", "Un objectif d’effort hebdomadaire commun, un fil de discussion, sans coût d’entrée."],
      ["shield", "Coaching consenti", "Le sportif choisit la période, le sport et les détails partagés. Le coach propose, il ne modifie jamais le journal.", "/pour-les-coachs"],
      ["lock", "Privé par défaut", "Amis sur demande acceptée, profil public désactivé, statistiques d’usage seulement avec ton accord."],
    ])}</div></section>

  <section class="pub-section" id="offres"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">Gratuit et TITAN+</p><h2>Le cœur est gratuit.<br>Pour de bon.</h2><p class="pub-lead">TITAN+ soutient le projet et ouvre plus de monde. Il n’achète jamais de progression.</p></div>${offersHtml}</div></section>
  ${homeFaq.html}${finalCta("valley")}`,
});
writeFileSync("index.html", home);

/* =====================================================================
   Guides (one template)
   ===================================================================== */
function guide({ route, file, title, h1, eyebrow, description, image, lead, sections, faqItems, extraSchema = [] }) {
  const f = faq(faqItems, "Questions fréquentes");
  const html = page({
    route,
    title,
    description,
    image,
    schema: [...extraSchema, f.schema, { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: h1.replace(/<[^>]+>/g, " "), item: `${SITE}${route}` }] }],
    body: `<header class="pub-page-head"><div class="pub-wrap"><p class="pub-eyebrow">${eyebrow}</p><h1>${h1}</h1><p class="pub-lead">${lead}</p>
      <nav class="pub-toc" aria-label="Sur cette page">${sections.map(([id, t]) => `<a href="#${id}">${t}</a>`).join("")}</nav></div></header>
      <div class="pub-wrap"><article class="pub-article">${sections.map(([id, t, body]) => `<section id="${id}"><h2>${t}</h2><div class="pub-prose">${body}</div></section>`).join("")}</article></div>
      ${f.html}${finalCta(image === "valley" ? "archipelago" : "valley")}`,
  });
  writeFileSync(file, html);
}

guide({
  route: "/niveaux-et-xp",
  file: "niveaux-et-xp.html",
  title: "Niveaux, XP, rangs et maîtrise : les règles de progression TITAN",
  h1: "Les règles<br>de la progression",
  eyebrow: "Progression",
  description: "Comment TITAN calcule l’XP à partir de l’effort, les plafonds, les niveaux, les sept rangs, la maîtrise par sport et la cadence sans série toxique.",
  image: "aurora",
  lead: "Une progression qui a de la valeur doit être lisible, lente là où il faut et identique pour tout le monde. Voici toutes les règles, sans exception cachée.",
  sections: [
    ["xp", "L’XP vient de l’effort", `<p>Chaque séance est convertie en <strong>minutes d’effort</strong> : la durée déclarée (ou estimée prudemment si tu n’as donné qu’une distance), multipliée par l’intensité que tu as ressentie.</p>
      <p class="pub-formula">XP = minutes comptées × (0,6 + 0,08 × ressenti) × 10</p>
      <ul><li>Les <strong>90 premières minutes</strong> comptent pleinement, les 90 suivantes à moitié, au-delà plus rien : une sortie de six heures n’écrase pas une semaine régulière.</li><li>Le <strong>ressenti</strong> va de 1 à 10. Sans ressenti, TITAN prend 5.</li><li>Une séance typique de 45 minutes à un ressenti de 6 rapporte <strong>${typical.xp} XP</strong>.</li></ul>
      <p>Le sport ne change pas la formule : 45 minutes de yoga intense et 45 minutes de course au même ressenti pèsent pareil. C’est ton effort qui compte, pas la discipline.</p>`],
    ["plafonds", "Des plafonds identiques pour tous", `<div class="pub-table"><table><thead><tr><th>Règle</th><th>Valeur</th></tr></thead><tbody>
      <tr><td>XP maximale par jour</td><td class="num">${E.DAILY_XP_CAP.toLocaleString("fr-FR")}</td></tr><tr><td>XP maximale par semaine</td><td class="num">${E.WEEKLY_XP_CAP.toLocaleString("fr-FR")}</td></tr>
      <tr><td>Crédits</td><td>10 % de l’XP de la séance, plafonnés de la même façon</td></tr><tr><td>Séance saisie plus de ${E.HISTORY_DAYS} jours après sa date</td><td>Historique : journal, records et maîtrise, sans XP</td></tr><tr><td>Abonnés TITAN+</td><td>Exactement les mêmes plafonds</td></tr></tbody></table></div>
      <p>Les récompenses sont calculées par le serveur. Le même envoi répété ne crée pas une seconde récompense. Une séance corrigée met à jour tes analyses ; elle ne redonne pas d’XP.</p>`],
    ["niveaux", "Niveaux et rangs", `<p>Le niveau suivant demande <strong>500 × niveau<sup>1,3</sup></strong> XP. Les premiers niveaux arrivent vite pour te mettre en route, les suivants demandent des mois. C’est voulu : un rang doit raconter une histoire.</p>
      <div class="pub-table"><table><thead><tr><th>Rang</th><th>Niveau</th><th>À 3 séances de 45 min par semaine</th></tr></thead><tbody>${C.ranks.map((r) => `<tr><td>${r.name}</td><td class="num">${r.level}</td><td>${r.level === 1 ? "Dès le départ" : `environ ${fmtMonths(monthsTo(r.level))}`}</td></tr>`).join("")}</tbody></table></div>
      <p>Les personnages se débloquent avec les niveaux (2 au départ, puis aux niveaux 3, 6, 10 et 15). Les cadres de rang de l’Atelier aussi. Rien de tout cela ne s’achète.</p>`],
    ["maitrise", "La maîtrise, sport par sport", `<p>La maîtrise mesure ton expérience dans <strong>un</strong> sport. Chaque palier demande à la fois des heures de pratique et des semaines différentes : impossible de l’obtenir en un week-end. Toutes les séances comptent, y compris l’historique, parce que la maîtrise décrit ton expérience ; elle ne rapporte rien.</p>
      <div class="pub-table"><table><thead><tr><th>Palier</th><th>Heures</th><th>Semaines</th></tr></thead><tbody>${MASTERY.map(([n, h, w], i) => `<tr><td>${i + 1}. ${n}</td><td class="num">${h}</td><td class="num">${w}</td></tr>`).join("")}</tbody></table></div>`],
    ["cadence", "La cadence, sans série toxique", `<p>Tu choisis combien de <strong>jours actifs</strong> viser chaque semaine, de 1 à 7. Une semaine tenue s’ajoute à ton parcours ; une semaine manquée ne détruit rien. Tu peux déclarer une semaine en pause (vacances, blessure, examens) : elle ne compte ni pour ni contre toi.</p><p>Il n’y a pas de flamme qui s’éteint, pas de compteur remis à zéro, pas de notification culpabilisante.</p>`],
    ["decouverte", "Le mode découverte", `<p>Sans compte, TITAN fonctionne sur ton appareil avec les mêmes règles, à titre d’estimation : la progression officielle n’existe que sur un compte. Les séances de découverte peuvent rejoindre un compte créé ensuite. Rien n’est envoyé tant que tu n’as pas de compte.</p>`],
  ],
  faqItems: [
    ["Pourquoi mon ressenti change-t-il l’XP ?", "Parce qu’une heure facile et une heure très dure ne demandent pas le même effort. L’écart reste borné : de ×0,68 à ×1,4. Mentir sur son ressenti ne rapporte presque rien face aux plafonds."],
    ["Les objectifs ou les défis donnent-ils de l’XP ?", "Non. Seules les séances en donnent. Objectifs, défis, Moments et propositions de coach servent à s’organiser, pas à multiplier les récompenses."],
    ["Puis-je perdre un niveau ?", "Non. Un niveau, une maîtrise ou un insigne acquis le restent, même après une longue pause."],
    ["TITAN+ fait-il progresser plus vite ?", "Non. Mêmes formules, mêmes plafonds. TITAN+ ajoute deux campagnes, des routines, de la capacité coach et quatre pièces cosmétiques."],
  ],
});

guide({
  route: "/aventures-sportives",
  file: "aventures-sportives.html",
  title: "L’aventure TITAN : 4 mondes, 36 balises, 4 gardiens",
  h1: "Ton sport rallume<br>quatre mondes",
  eyebrow: "Aventure",
  description: "Comment fonctionnent les campagnes TITAN : jours actifs, balises, gardiens qui demandent de la constance, expéditions saisonnières et insignes cosmétiques.",
  image: "archipelago",
  lead: "Chaque monde compte neuf balises et un gardien. Ce ne sont pas des quêtes à cocher : ce sont tes vraies journées de sport qui les allument.",
  sections: [
    ["mondes", "Quatre mondes, quatre intentions", `<div class="pub-grid cols-2">${C.worlds.map((w) => `<div class="pub-world" id="${w.id}"><img src="/assets/renaissance/${w.image}-small.webp" width="800" height="450" alt="" loading="lazy" decoding="async"><span class="pub-tier${w.tier === "plus" ? " plus" : ""}">${w.tier === "plus" ? "TITAN+" : "GRATUIT"}</span><h3>${w.name}</h3><p>${w.subtitle}. Gardien : ${w.guardian}.</p></div>`).join("")}</div>
      <p>La vallée de l’Aube et l’archipel des Marées sont gratuits : 18 chapitres complets. Les forges d’Obsidienne et la citadelle des Aurores viennent avec TITAN+, avec exactement les mêmes règles.</p>`],
    ["balises", "Comment une balise s’allume", `<ol><li>Démarre une campagne, choisis ton chemin : <strong>Rythme</strong> (jours actifs) ou <strong>Journal</strong> (jours avec une note de séance d’au moins 10 caractères).</li><li>Chaque chapitre demande un, deux ou trois jours actifs, enregistrés après son départ.</li><li>Un jour compte une fois, quel que soit le volume : trois séances le même jour valent un jour.</li><li>Quand la mission est remplie, allume la balise : l’insigne rejoint ta collection et le chapitre suivant commence.</li></ol>
      <p>Les chapitres n’expirent pas. Les séances archivées, signalées ou ajoutées plus de 30 jours après leur date ne comptent pas.</p>`],
    ["gardiens", "Les gardiens récompensent la constance", `<p>Au neuvième chapitre, le gardien attend <strong>trois jours actifs et 150 minutes d’effort</strong>, avec <strong>90 minutes au plus par jour</strong>. Une journée héroïque ne suffit pas : il faut revenir. C’est exactement ce qui fait progresser dans la vraie vie.</p>`],
    ["expeditions", "Les expéditions de saison", `<p>Plusieurs fois par an, une expédition rassemble toute la communauté face à un gardien de saison. Chaque minute d’effort compte pareil, quel que soit ton sport, 90 au plus par jour. Un objectif personnel (par exemple 4 jours et 300 minutes sur la période) donne un titre à garder dans ta collection.</p>`],
    ["recompenses", "Des récompenses qui racontent", `<p>Insignes, titres et cadres sont cosmétiques. Ils ne donnent ni XP ni crédits, et ne se perdent pas après une correction de journal ou la fin d’un abonnement.</p>`],
  ],
  faqItems: [
    ["Dois-je faire du sport tous les jours ?", "Non. Les chapitres comptent des jours actifs sans échéance. Tu avances à ton rythme."],
    ["Faire plus de kilomètres accélère-t-il l’aventure ?", "Non. Une balise compte des jours ; le gardien plafonne l’effort à 90 minutes par jour. La constance passe avant l’exploit."],
    ["Que deviennent mes insignes si TITAN+ s’arrête ?", "Ils restent dans ta collection. Seuls le démarrage et la suite des campagnes TITAN+ demandent un abonnement actif."],
  ],
});

guide({
  route: "/comprendre-mes-donnees",
  file: "comprendre-mes-donnees.html",
  title: "Comprendre ses données sportives : mesures, records et limites | TITAN",
  h1: "Ce que disent<br>vraiment tes chiffres",
  eyebrow: "Données",
  description: "Distance, durée, allure, volume de musculation, cotations, records et estimations : les définitions utilisées par TITAN, leurs sources et leurs limites.",
  image: "forge",
  lead: "Un chiffre utile a une unité, une source et une limite claire. Voici comment TITAN calcule ce que tu vois dans Progrès, Records et Objectifs.",
  sections: [
    ["sources", "Tout part de tes séances", `<p>Chaque analyse renvoie aux séances qui l’alimentent. Les séances archivées et celles datées dans le futur sont exclues. Une donnée saisie reste une déclaration ; un GPX importé n’est pas une certification.</p>`],
    ["absence", "Une valeur manquante n’est pas un zéro", `<p>Une séance peut avoir une distance sans durée, des séries sans ressenti. TITAN n’invente pas les mesures absentes et indique combien de séances alimentent chaque calcul. Quand une durée doit être estimée pour l’effort (distance seule), l’estimation est signalée comme telle.</p>`],
    ["endurance", "Distance, durée, allure, vitesse", `<div class="pub-table"><table><thead><tr><th>Mesure</th><th>Calcul</th></tr></thead><tbody><tr><td>Durée</td><td>Saisie à la seconde, ou temps de déplacement du GPX</td></tr><tr><td>Allure</td><td>Durée ÷ distance, en min/km</td></tr><tr><td>Vitesse</td><td>Distance ÷ durée, en km/h</td></tr><tr><td>Records de distance</td><td>Séances dont la distance totale est à ±1 % de 1, 5, 10, 21,1 ou 42,2 km</td></tr></tbody></table></div><p>Les records comparent des séances entières : ce ne sont pas des meilleurs segments extraits d’une trace GPS.</p>`],
    ["force", "Séries, charges et volume", `<p>Le volume est la somme des <strong>charges × répétitions</strong> des séries renseignées. Les exercices sont séparés par nom, variante et équipement. Le record de charge affiche les répétitions réellement faites ; TITAN ne fabrique pas de 1RM estimé. Un volume plus grand ne prouve pas, à lui seul, un gain de force.</p>`],
    ["escalade", "Des cotations qui gardent leur contexte", `<p>Cotations françaises, Fontainebleau et V-scale restent séparées, ainsi que la discipline et le mode d’assurage. Une cotation inconnue reste dans la séance sans recevoir de valeur inventée.</p>`],
    ["effort", "Minutes d’effort", `<p>Les minutes d’effort servent à l’XP, aux défis, à la guilde et aux expéditions : durée comptée (90 minutes pleines, puis à moitié) × intensité ressentie. Elles rendent comparables des sports très différents sans prétendre mesurer ta physiologie.</p>`],
  ],
  faqItems: [
    ["Mes corrections changent-elles les records ?", "Oui. Records et analyses sont recalculés depuis le journal actuel. Corriger ou archiver une séance met tout à jour."],
    ["TITAN mesure-t-il ma santé ?", "Non. TITAN n’est pas un dispositif médical et ne partage jamais de données de santé ou de poids dans les espaces sociaux."],
  ],
});

guide({
  route: "/debuter-titan",
  file: "debuter-titan.html",
  title: "Bien démarrer avec TITAN : 2 minutes et une première séance",
  h1: "Ton premier jour,<br>en deux minutes",
  eyebrow: "Bien démarrer",
  description: "Choisir ses sports et sa cadence, enregistrer une première séance, lire son QG et sa semaine : le guide du premier jour sur TITAN.",
  image: "valley",
  lead: "Pas besoin de tout configurer. Quatre questions, une séance, et TITAN sait déjà t’aider.",
  sections: [
    ["accueil", "1. Quatre questions", `<p>Tes sports (cinq au plus), ta cadence (jours actifs visés par semaine), ta confidentialité, et ta première séance. Tu peux essayer sans compte : tout reste sur ton appareil, clairement signalé comme découverte.</p>`],
    ["seance", "2. Enregistrer ce que tu as vraiment fait", `<p>Choisis le sport, la date, puis les champs utiles : distance et durée pour une course, exercices et séries en musculation, cotations en escalade. Une durée réelle vaut mieux qu’une distance inventée.</p><p class="pub-note">Sans réseau ? Enregistre quand même : la séance part toute seule au retour de la connexion.</p>`],
    ["qg", "3. Lire ton QG", `<p>Le QG montre une seule chose importante à la fois : la prochaine action utile, ta semaine par rapport à ta cadence, et ce qui a bougé depuis ta dernière visite. Chaque recommandation dit pourquoi elle t’est proposée.</p>`],
    ["semaine", "4. Comprendre ta semaine", `<p>Dans Progrès, le récap répond à des questions concrètes : est-ce que je progresse, où va mon temps, ma semaine est-elle chargée. Chaque réponse cite les séances sur lesquelles elle repose.</p>`],
    ["compte", "5. Garder tes séances", `<p>Crée un compte quand tu veux : tes séances de découverte peuvent le rejoindre. Le compte synchronise tes appareils et rend ta progression officielle. Tu peux exporter ou supprimer tes données à tout moment depuis Profil.</p>`],
  ],
  faqItems: [
    ["Combien coûte le premier essai ?", "Rien. L’essai, le journal, les analyses, la progression et deux campagnes complètes sont gratuits, sans carte bancaire."],
    ["Puis-je installer TITAN sur mon téléphone ?", "Oui : depuis le navigateur, « Ajouter à l’écran d’accueil ». TITAN s’ouvre alors comme une application et fonctionne hors ligne."],
  ],
});

guide({
  route: "/pour-les-coachs",
  file: "pour-les-coachs.html",
  title: "TITAN pour les coachs : suivi consenti et séances proposées",
  h1: "Un suivi à deux,<br>décidé par le sportif",
  eyebrow: "Coachs et sportifs",
  description: "Invitation privée, consentement explicite, périmètre choisi par le sportif, propositions de séances acceptées ou déclinées. 3 sportifs gratuits, 20 avec TITAN+.",
  image: "archipelago",
  lead: "Le coach voit ce que le sportif accepte de partager, propose des séances, et ne touche jamais au journal. Le sportif peut tout arrêter à tout moment.",
  sections: [
    ["invitation", "1. Une invitation à usage unique", `<p>Le coach crée un code privé, valable une fois et pour une durée limitée, et le transmet à son sportif. TITAN ne vérifie pas les qualifications d’un coach : le sportif vérifie à qui il partage.</p>`],
    ["perimetre", "2. Le sportif choisit le périmètre", `<ul><li>À partir de quelle date ses séances sont visibles.</li><li>Un sport ou tous les sports.</li><li>Les détails techniques (séries, charges, RIR, escalade) ou seulement l’essentiel.</li><li>Ses notes, ou pas.</li></ul><p>Le partage commence uniquement après son accord explicite. Il peut le modifier ou le révoquer à tout moment ; les séances partagées ne sont gardées qu’en mémoire chez le coach.</p>`],
    ["propositions", "3. Des propositions, pas des ordres", `<p>Le coach propose une séance (sport, date, consignes). Le sportif l’accepte ou la décline, puis la relie à la séance réellement faite. Une proposition ne crée jamais d’XP ni de séance à sa place.</p>`],
    ["capacite", "4. Capacité", `<div class="pub-table"><table><thead><tr><th></th><th>Classique</th><th>TITAN+ (coach)</th></tr></thead><tbody><tr><td>Sportifs suivis</td><td class="num">3</td><td class="num">20</td></tr><tr><td>Le sportif doit-il payer ?</td><td>Non</td><td>Non</td></tr></tbody></table></div>`],
  ],
  faqItems: [
    ["Le coach peut-il modifier mes séances ?", "Non. Il lit le périmètre que tu as choisi et propose des séances. Ton journal ne change que par toi."],
    ["Puis-je retirer seulement mes notes ?", "Oui. Modifie le périmètre sans arrêter le suivi ; les prochaines lectures appliquent tes nouveaux choix."],
    ["Les données de santé sont-elles partagées ?", "Non. Le partage porte sur les séances : dates, sports, mesures, durées, et, si tu l’acceptes, les détails techniques et les notes."],
  ],
});

/* ---------- Tarifs ---------- */
const tarifsFaq = faq([
  ["Que se passe-t-il à la fin de TITAN+ ?", "Ton journal, tes analyses, ta progression, tes insignes et tes crédits restent. Les campagnes TITAN+ ne peuvent plus être poursuivies, les pièces TITAN+ reviennent au style d’origine, et la capacité coach revient à 3 pour les nouveaux suivis."],
  ["Les routines au-delà de 5 sont-elles supprimées ?", "Non. Elles restent utilisables. Au-delà de cinq, la création d’une nouvelle routine demande TITAN+ ; tu peux toujours remplacer une routine existante."],
  ["Comment résilier ?", "Depuis le lien de gestion de l’e-mail de reçu Paddle, ou en écrivant au support. L’accès reste actif jusqu’à la fin de la période payée."],
  ["Y a-t-il de la publicité ?", "Non, ni dans l’offre gratuite ni dans TITAN+."],
]);
writeFileSync(
  "tarifs.html",
  page({
    route: "/tarifs",
    title: "Gratuit et TITAN+ : tout ce qui est inclus | TITAN",
    description: "TITAN est gratuit pour journaliser, analyser et progresser. TITAN+ à 5 € par mois ajoute deux campagnes, des routines et de la capacité coach, jamais d’XP.",
    image: "aurora",
    schema: [tarifsFaq.schema, { "@type": "Product", name: "TITAN+", description: "Abonnement optionnel : campagnes, routines, capacité coach et cosmétiques, sans avantage de progression.", brand: { "@type": "Brand", name: "TITAN" }, offers: { "@type": "Offer", price: "5", priceCurrency: "EUR", url: `${SITE}/tarifs` } }],
    body: `<header class="pub-page-head"><div class="pub-wrap"><p class="pub-eyebrow">Gratuit et TITAN+</p><h1>Le cœur est gratuit.<br>Pour de bon.</h1><p class="pub-lead">Journaliser, comprendre et progresser ne doivent rien coûter. TITAN+ finance le projet et ouvre plus de monde, sans jamais vendre de progression.</p></div></header>
      <section class="pub-section"><div class="pub-wrap">${offersHtml}</div></section>
      <section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">Comparer</p><h2>Ligne par ligne.</h2></div><div class="pub-table"><table><thead><tr><th>Fonction</th><th>Classique</th><th>TITAN+</th></tr></thead><tbody>${[
        ["Journal, 260 sports, export CSV et JSON", "Inclus", "Inclus"],
        ["Records, objectifs, récap hebdomadaire", "Inclus", "Inclus"],
        ["Rang, maîtrise, cadence, collection", "Inclus", "Inclus"],
        ["Campagnes d’aventure", "2 mondes · 18 chapitres", "4 mondes · 36 chapitres"],
        ["Communauté, défis, expéditions, guilde", "Inclus", "Inclus"],
        ["Atelier (pièces gagnées avec les crédits)", "Inclus", "Inclus + 4 pièces TITAN+"],
        ["Routines nommées", "5", "20"],
        ["Sportifs suivis dans l’espace coach", "3", "20"],
        ["Profil public et images à partager", "Inclus", "Inclus"],
        ["XP, crédits, plafonds", "Identiques", "Identiques"],
        ["Publicité", "Aucune", "Aucune"],
      ].map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td></tr>`).join("")}</tbody></table></div></div></section>
      ${tarifsFaq.html}${finalCta("aurora")}`,
  }),
);

/* ---------- Fonctionnalités ---------- */
const featFaq = faq([
  ["Qu’est-ce qui est gratuit ?", "Le journal, les analyses, les records, les objectifs, la progression, deux campagnes, la Communauté, l’Atelier, cinq routines et le suivi de trois sportifs."],
  ["TITAN est-il une application mobile ?", "C’est une application web installable : depuis ton navigateur, ajoute-la à l’écran d’accueil. Elle fonctionne hors ligne."],
  ["Mon coach voit-il mon journal automatiquement ?", "Non. Le partage commence après ton accord explicite, sur le périmètre que tu choisis, et se révoque à tout moment."],
]);
writeFileSync(
  "fonctionnalites.html",
  page({
    route: "/fonctionnalites",
    title: "Fonctionnalités : journal, statistiques, progression | TITAN",
    description: "Tout ce que fait TITAN : journal de 260 sports, récap hebdomadaire, records sourcés, objectifs, rang et maîtrise, aventure, communauté, coaching et confidentialité.",
    image: "forge",
    schema: [featFaq.schema],
    body: `<header class="pub-page-head"><div class="pub-wrap"><p class="pub-eyebrow">Fonctionnalités</p><h1>Tout ce qu’il faut.<br>Rien de superflu.</h1><p class="pub-lead">Cinq espaces dans l’application : QG, Progrès, Séance, Aventure, Profil. Le reste est à un geste.</p></div></header>
      <section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">S’entraîner</p><h2>Enregistrer et préparer</h2></div>${cards([
        ["plus", "Séance", "260 sports, champs adaptés à chacun, durée à la seconde, séries détaillées, import GPX, brouillon conservé."],
        ["calendar", "Prévoir", "Ta semaine type sport par sport ; le QG te rappelle ce qui est prévu aujourd’hui."],
        ["layers", "Routines", "Mémorise tes séances de musculation et recharge-les en un geste."],
        ["offline", "Hors ligne", "Une séance sans réseau reste sur l’appareil et se synchronise toute seule."],
      ], 4)}</div></section>
      <section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">Comprendre</p><h2>Progrès</h2></div>${cards([
        ["chart", "Semaine", "Récap hebdomadaire, comparaison avec tes semaines habituelles, questions qui répondent.", "/comprendre-mes-donnees"],
        ["journal", "Journal", "Recherche, familles, calendrier, détail, comparaison avec la séance précédente, correction, archive, export."],
        ["star", "Records", "Par sport, avec la séance source, le contexte et l’historique des améliorations."],
        ["flag", "Objectifs", "Séances, jours, minutes ou kilomètres sur une période, avec projection de rythme."],
      ], 4)}</div></section>
      <section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">Progresser</p><h2>Rang, maîtrise, aventure</h2></div>${cards([
        ["crown", "Rang et niveau", "Sept rangs, une progression longue et identique pour tous.", "/niveaux-et-xp"],
        ["target", "Maîtrise", "Dix paliers par sport, en heures et en semaines.", "/niveaux-et-xp#maitrise"],
        ["compass", "Aventure", "Quatre mondes, gardiens, expéditions de saison.", "/aventures-sportives"],
        ["sparkle", "Atelier", "Cadres, ambiances de carte et styles d’image, gagnés avec les crédits de tes séances."],
      ], 4)}</div></section>
      <section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">Ensemble</p><h2>Communauté et coaching</h2></div>${cards([
        ["send", "Moments", "Partage un record ou une belle semaine avec tes amis, un Moment à la fois."],
        ["flag", "Défis", "Sans mise, en minutes d’effort ou en jours actifs."],
        ["group", "Guilde", "Objectif d’effort commun et discussion."],
        ["shield", "Coaching", "Partage consenti et propositions de séances.", "/pour-les-coachs"],
        ["qr", "Profil public", "Une carte d’athlète optionnelle, avec lien privé et QR code."],
        ["share", "Images", "Record, semaine ou ADN sportif en image, créée sur ton appareil."],
      ])}</div></section>
      <section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">Confiance</p><h2>Tes données t’appartiennent</h2></div>${cards([
        ["lock", "Privé par défaut", "Profil privé, amis sur demande acceptée, profil public désactivé."],
        ["eye", "Statistiques d’usage", "Seulement avec ton accord, sans santé, poids, GPS ni notes."],
        ["download", "Export", "Toutes tes données en JSON, ton journal en CSV, à tout moment."],
        ["trash", "Suppression", "Ton compte et ses données, définitivement, depuis Profil."],
      ], 4)}</div></section>
      ${featFaq.html}${finalCta("forge")}`,
  }),
);

/* ---------- Sitemap (public, indexable pages only) ---------- */
const INDEXABLE = [
  ["/", 1.0],
  ["/fonctionnalites", 0.9],
  ["/tarifs", 0.9],
  ["/niveaux-et-xp", 0.8],
  ["/aventures-sportives", 0.8],
  ["/comprendre-mes-donnees", 0.7],
  ["/debuter-titan", 0.8],
  ["/pour-les-coachs", 0.8],
  ["/sports", 0.7],
  ["/suivi-sportif", 0.7],
  ["/journal-entrainement", 0.7],
  ["/journal-course-a-pied", 0.7],
  ["/carnet-musculation", 0.7],
  ["/suivi-escalade", 0.7],
  ["/progression-sportive", 0.6],
  ["/motivation-sport", 0.6],
  ["/changelog", 0.4],
  ["/service", 0.4],
  ["/legal_privacy", 0.3],
  ["/legal_cgu", 0.3],
  ["/legal_mentions", 0.3],
  ["/legal_hub", 0.2],
];
writeFileSync(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${INDEXABLE.map(([r, p]) => `  <url><loc>${SITE}${r}</loc><lastmod>${TODAY}</lastmod><priority>${p.toFixed(1)}</priority></url>`).join("\n")}\n</urlset>\n`,
);
console.log("Public site v300: accueil, tarifs, fonctionnalités, 5 guides et sitemap générés.");
