import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const file of ["renaissance-icons", "renaissance-catalog"])
  vm.runInContext(readFileSync(`js/${file}.js`, "utf8"), sandbox);
const icon = sandbox.window.titanIcon,
  C = sandbox.window.TitanCodex;
const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const header = `<a class="skip-link" href="#contenu-principal">Aller au contenu</a><header class="site-header"><a class="wordmark" href="/" aria-label="TITAN, accueil"><span class="wordmark-symbol">${icon("compass")}</span>TITAN<span class="wordmark-dot">.</span></a><nav class="site-links" aria-label="Navigation principale"><a href="/#experience">L’expérience</a><a href="/aventures-sportives">L’univers</a><a href="/sports">Les sports</a><a href="/tarifs">Gratuit & TITAN+</a></nav><div class="header-actions"><a class="login-link" href="/login">Se connecter</a><a class="button button-small" href="/aujourdhui">Mon aventure ${icon("arrow")}</a><button class="menu-toggle" type="button" aria-label="Ouvrir le menu" aria-controls="public-menu" aria-expanded="false">${icon("menu")}</button></div><nav id="public-menu" class="public-menu" aria-label="Menu mobile" hidden><a href="/#experience">L’expérience</a><a href="/aventures-sportives">L’univers</a><a href="/sports">Les sports</a><a href="/tarifs">Gratuit & TITAN+</a><a href="/debuter-titan">Bien démarrer</a><a href="/pour-les-coachs">Pour les coachs</a><a href="/login">Se connecter</a></nav></header>`;
const footer = `<footer class="site-footer"><a class="wordmark" href="/">TITAN<span class="wordmark-dot">.</span></a><p>Ton effort devient une aventure.<br>Tes progrès restent mesurables.</p><nav aria-label="Liens de bas de page"><a href="/debuter-titan">Bien démarrer</a><a href="/niveaux-et-xp">Niveaux & XP</a><a href="/comprendre-mes-donnees">Comprendre les données</a><a href="/fonctionnalites">Fonctionnalités</a><a href="/tarifs">Les offres</a><a href="/pour-les-coachs">Coachs</a><a href="/service">Aide</a><a href="/legal_privacy">Confidentialité</a><a href="/legal_cgu">Conditions</a><a href="/legal_mentions">Mentions légales</a></nav><small>© 2026 TITAN. Chaque chemin mérite son histoire.</small></footer>`;
function page({
  title,
  description,
  route = "/",
  body,
  image = "valley",
  structured = {},
  script = "",
}) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index, follow, max-image-preview:large"><link rel="canonical" href="https://titan-app.fr${route}"><meta name="theme-color" content="#0b1714"><meta property="og:site_name" content="TITAN"><meta property="og:type" content="website"><meta property="og:locale" content="fr_FR"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="https://titan-app.fr${route}"><meta property="og:image" content="https://titan-app.fr/assets/renaissance/${image}.webp"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="https://titan-app.fr/assets/renaissance/${image}.webp"><link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/image/logo-192.png"><link rel="manifest" href="/manifest.json">${route === "/" ? '<link rel="preload" as="image" href="/assets/renaissance/valley.webp" imagesrcset="/assets/renaissance/valley-small.webp 800w, /assets/renaissance/valley.webp 1600w" imagesizes="100vw">' : ""}<link rel="stylesheet" href="/css/design-system.css?v=200.0"><link rel="stylesheet" href="/css/home.css?v=200.0"><link rel="stylesheet" href="/css/renaissance-public.css?v=200.0"><script src="/js/titan-v100.js?v=200.0" defer></script><script src="/js/home.js?v=200.0" defer></script>${script ? `<script src="/js/${script}.js?v=200.0" defer></script>` : ""}<script src="/js/pwa.js?v=200.0" defer></script><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...structured }).replaceAll("<", "\\u003c")}</script></head><body class="titan-public renaissance-public">${header}<main id="contenu-principal">${body}</main>${footer}</body></html>`;
}
const faq = (items) =>
  `<section class="rp-section rp-faq public-faq"><p class="eyebrow">Les bonnes questions, des réponses claires</p><h2>Avant le premier pas.</h2>${items.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</section>`;
const cta = `<section class="rp-section"><div class="rp-cta"><img src="/assets/renaissance/archipelago-small.webp" width="800" height="450" loading="lazy" alt=""><p class="eyebrow">Le premier chapitre est à toi</p><h2>Le héros de cette histoire,<br>c’est toi.</h2><p>Commence avec ce que tu aimes pratiquer. TITAN s’occupe de garder le fil.</p><div class="rp-actions"><a class="button" href="/aujourdhui">Commencer gratuitement ${icon("arrow")}</a><a class="button button-outline" href="/debuter-titan">Le guide du premier jour</a></div><p class="rp-fine">Découverte sans compte · Deux campagnes gratuites · Sans carte bancaire</p></div></section>`;
const offers = `<div class="rp-offers"><article class="rp-offer"><p class="eyebrow">CLASSIQUE</p><h3>Une vraie aventure,<br>dès le premier jour.</h3><p class="rp-price">0 € <small>durablement gratuit</small></p><ul>${["Niveaux, XP, 7 rangs et 6 avatars à débloquer", "2 campagnes complètes · 18 chapitres et insignes", "Journal complet, édition et calendrier", "Objectifs datés, records et analyses par sport", "5 routines nommées, chronomètre et import GPX", "Export CSV et bilan personnel imprimable", "Espace coach : jusqu’à 3 sportifs suivis"].map((t) => `<li>${icon("check")}${t}</li>`).join("")}</ul><a class="button button-outline" href="/aujourdhui">Commencer gratuitement ${icon("arrow")}</a></article><article class="rp-offer plus"><p class="eyebrow">TITAN+</p><h3>Plus de mondes.<br>Plus de perspectives.</h3><p class="rp-price">5 € <small>/ mois · tarif proposé</small></p><ul>${["Tout le Classique, avec les mêmes règles d’XP", "2 campagnes supplémentaires · 18 chapitres et insignes", "Les forges d’Obsidienne et la citadelle des Aurores", "Bibliothèque étendue à 20 routines nommées", "Bilan imprimable avec comparaison de périodes", "Personnalisation supplémentaire dans la boutique", "Espace coach étendu à 20 sportifs suivis"].map((t) => `<li>${icon("check")}${t}</li>`).join("")}</ul><a class="button" href="/boutique#titan-plus">Découvrir TITAN+ ${icon("arrow")}</a><p class="rp-fine">Abonnement mensuel. Le prix final, les taxes et les conditions de renouvellement et d’annulation sont affichés par Paddle avant validation.</p></article></div>`;
const worldCards = C.worlds
  .map(
    (w) =>
      `<a class="rp-world" href="/adventure?world=${w.id}" aria-label="Découvrir ${w.name}"><img src="/assets/renaissance/${w.image}-small.webp" width="800" height="450" alt="" loading="lazy"><span class="rp-world-label">${w.tier === "free" ? "GRATUIT" : "TITAN+"} · 9 CHAPITRES</span><div class="rp-world-copy"><img class="rp-guardian-orbit" src="/assets/renaissance/guardian-${w.id}.webp" alt="${w.guardian}" width="640" height="640" loading="lazy"><h3>${w.name}</h3><p>${w.subtitle}</p>${icon("arrow")}</div></a>`,
  )
  .join("");
const homeBody = `<section class="rp-hero"><img src="/assets/renaissance/valley.webp" srcset="/assets/renaissance/valley-small.webp 800w,/assets/renaissance/valley.webp 1600w" sizes="100vw" width="1600" height="900" fetchpriority="high" alt=""><div class="rp-hero-copy"><p class="eyebrow">${icon("compass")} LE SPORT DEVIENT UNE AVENTURE</p><h1>Fais du sport.<br><em>Écris ta légende.</em></h1><p class="rp-hero-description">Ta course, ta séance de musculation, cette voie enfin réussie : chaque effort nourrit ton personnage. Gagne des niveaux, explore des mondes et comprends tes progrès.</p><div class="rp-actions"><a class="button" href="/aujourdhui">Commencer mon aventure ${icon("arrow")}</a><a class="text-link" href="#experience">Découvrir l’expérience ${icon("chevron")}</a></div><p class="rp-fine">Gratuit · Sans carte bancaire · Sur mobile et ordinateur</p></div><figure class="rp-hero-character"><div class="rp-portrait"><img src="/assets/renaissance/scout.webp" width="640" height="640" alt="L’Éclaireuse, personnage de l’univers TITAN"><span class="rp-avatar-level"><small>NIVEAU</small>6</span></div><figcaption><p class="eyebrow">SENTINELLE · VALLÉE DE L’AUBE</p><h2>Un peu plus loin,<br>à chaque effort.</h2><p>Une séance. Des repères. Un nouveau chapitre.</p><div class="rp-xp"><span></span></div><div class="rp-xp-copy"><span>TON PERSONNAGE ÉVOLUE</span><span>TON HISTOIRE RESTE</span></div><p class="rp-fine">Illustration d’un parcours fictif. Ton aventure commence au niveau 1.</p></figcaption></figure></section><div class="rp-ribbon"><span>${icon("mountain")} Tous tes sports</span><span>${icon("compass")} 4 mondes à explorer</span><span>${icon("shield")} Pas de niveau perdu après une pause</span><span>${icon("phone")} Pensé pour le quotidien</span></div>
<section class="rp-section" id="experience"><div class="rp-section-head"><div><p class="eyebrow">01 / Le sport fait avancer l’histoire</p><h2>La même séance.<br>Trois raisons de revenir.</h2></div><p>Le journal, le personnage et l’aventure avancent ensemble. Tu sais ce que tu as fait, ce que tu as gagné et où aller ensuite.</p></div><div class="rp-product-demo"><div class="rp-demo-tabs" role="tablist" aria-label="Découvrir les trois dimensions de TITAN"><button id="demo-tab-sport" role="tab" aria-selected="true" aria-controls="renaissance-demo" data-demo="sport">${icon("chart")}<span><strong>Ton sport, en clair.</strong><small>Des mesures utiles, les séances sources et des objectifs à ta mesure.</small></span></button><button id="demo-tab-personnage" role="tab" aria-selected="false" tabindex="-1" aria-controls="renaissance-demo" data-demo="personnage">${icon("shield")}<span><strong>Ton personnage, en mouvement.</strong><small>Niveaux durables, rangs et avatars qui se débloquent avec ton parcours.</small></span></button><button id="demo-tab-aventure" role="tab" aria-selected="false" tabindex="-1" aria-controls="renaissance-demo" data-demo="aventure">${icon("compass")}<span><strong>Un monde qui s’ouvre.</strong><small>Des chapitres, des gardiens et des insignes liés aux séances validées.</small></span></button></div><div class="rp-demo-panel" id="renaissance-demo" role="tabpanel" aria-labelledby="demo-tab-sport" tabindex="0"><p class="eyebrow">EXEMPLE FICTIF · UNE SEMAINE MULTISPORT</p><h3>Chaque pratique trouve sa place.</h3><div class="rp-demo-numbers"><div><strong>3</strong><span>séances</span></div><div><strong>135</strong><span>minutes renseignées</span></div><div><strong>3</strong><span>jours actifs</span></div></div><div class="rp-demo-row"><strong>Course</strong><span>5 km · 30 min</span></div><div class="rp-demo-row"><strong>Musculation</strong><span>4 exercices · 45 min</span></div><div class="rp-demo-row"><strong>Escalade</strong><span>Voie · 60 min</span></div><p class="rp-fine">Les valeurs absentes restent absentes. Chaque indicateur retrouve sa séance.</p></div></div></section>
<section class="rp-section" id="univers"><div class="rp-section-head"><div><p class="eyebrow">02 / Un univers qui a de la profondeur</p><h2>Quatre horizons.<br>Trente-six chapitres. Ton chemin.</h2></div><p>Deux campagnes gratuites pour prendre le départ. Deux autres avec TITAN+. Chacune a son histoire, son gardien et ses neuf insignes.</p></div><div class="rp-worlds">${worldCards}</div><div class="rp-principles"><article>${icon("leaf")}<h3>Un rythme qui t’appartient.</h3><p>Une journée compte une fois. Les étapes n’expirent pas. Tu peux reprendre sans perdre ton niveau.</p></article><article>${icon("journal")}<h3>Deux chemins pour progresser.</h3><p>Régularité : pratiquer sur plusieurs jours. Observation : ajouter un repère personnel à tes séances.</p></article><article>${icon("shield")}<h3>L’abonnement ouvre des horizons.</h3><p>Les niveaux se gagnent par la pratique. Les récompenses des campagnes sont cosmétiques, avec les mêmes règles pour tous.</p></article></div><a class="text-link" href="/aventures-sportives">Explorer les règles et les mondes ${icon("arrow")}</a></section>
<section class="rp-data"><div class="rp-section rp-data-layout"><div><p class="eyebrow">03 / Du jeu, et de vrais repères</p><h2>Ta progression a<br>quelque chose à raconter.</h2><p class="rp-muted">Des données organisées selon ta pratique. Tu peux remonter aux séances, corriger une saisie et comprendre ce qui est réellement comparable.</p><div class="rp-data-list"><a href="/carnet-musculation">${icon("weight")}<div><strong>Musculation</strong><span>Séries, répétitions, charges, RIR et évolution par exercice.</span></div>${icon("arrow")}</a><a href="/journal-course-a-pied">${icon("route")}<div><strong>Course, marche et vélo</strong><span>Distance, durée, allure et records de séances comparables.</span></div>${icon("arrow")}</a><a href="/suivi-escalade">${icon("mountain")}<div><strong>Escalade</strong><span>Essais, réussites et cotations, avec des systèmes distincts.</span></div>${icon("arrow")}</a></div></div><div class="rp-data-example"><header><div><p class="eyebrow">EXEMPLE FICTIF · MUSCULATION</p><h3>Squat · même variante</h3></div>${icon("chart")}</header><div class="rp-bars" role="img" aria-label="Volumes déclarés : 900, 960, 900 et 1020 kilogrammes"><div style="height:74%"><span>900</span></div><div style="height:82%"><span>960</span></div><div style="height:74%"><span>900</span></div><div style="height:92%"><span>1 020</span></div></div><div class="rp-chart-dates"><span>04 sept.</span><span>07 sept.</span><span>10 sept.</span><span>13 sept.</span></div><table><caption class="sr-only">Détail de la dernière séance fictive de squat</caption><tbody><tr><th>Séries renseignées</th><td>3</td></tr><tr><th>Répétitions</th><td>30</td></tr><tr><th>Volume déclaré</th><td>1 020 kg</td></tr></tbody></table><p class="rp-fine">Volume = somme des charges × répétitions. Une variation n’est pas, à elle seule, une mesure de gain de force.</p><a class="text-link" href="/comprendre-mes-donnees">Comprendre les indicateurs ${icon("arrow")}</a></div></div></section>
<section class="rp-section"><div class="rp-section-head"><div><p class="eyebrow">04 / Un personnage qui te ressemble</p><h2>Choisis ton visage.<br>Construis ton histoire.</h2></div><p>Six personnages originaux. Des déblocages liés au niveau, accessibles gratuitement. Ta collection garde la trace des chapitres accomplis.</p></div><div class="rp-avatars">${C.avatars.map((a) => `<figure class="rp-avatar"><img src="/assets/renaissance/${a.id}.webp" width="640" height="640" alt="${a.name}" loading="lazy"><figcaption><strong>${a.name}</strong><small>Niveau ${a.level} · gratuit</small></figcaption></figure>`).join("")}</div><p class="rp-fine">Les personnages ne donnent aucun avantage sportif ni bonus de puissance.</p></section>
<section class="rp-section"><div class="rp-section-head"><div><p class="eyebrow">05 / Du contenu, pas de raccourci</p><h2>Le cœur du jeu est gratuit.<br>L’aventure peut s’agrandir.</h2></div><p>Garde tes séances, tes niveaux et tes insignes acquis. TITAN+ ajoute des campagnes et des outils d’organisation.</p></div>${offers}<p class="rp-fine">La découverte reste sur cet appareil. Un compte permet la synchronisation des nouvelles séances. <a href="/tarifs">Comparer toutes les fonctions et les conditions →</a></p></section>
<section class="rp-section"><div class="rp-section-head"><div><p class="eyebrow">06 / Des outils qu’on comprend</p><h2>Moins de questions.<br>Plus de repères.</h2></div><a class="text-link" href="/debuter-titan">Bien démarrer ${icon("arrow")}</a></div><div class="rp-guides"><a class="rp-guide" href="/niveaux-et-xp">${icon("shield")}<h3>Comment fonctionnent les niveaux ?</h3><p>XP confirmée, seuil suivant, rangs, pauses et déblocages : les règles du personnage.</p><span>LE GUIDE DE LA PROGRESSION →</span></a><a class="rp-guide" href="/comprendre-mes-donnees">${icon("chart")}<h3>Que racontent vraiment mes chiffres ?</h3><p>Unités, valeurs manquantes, séries, records et contexte des comparaisons.</p><span>LE GUIDE DES DONNÉES →</span></a><a class="rp-guide" href="/motivation-sport">${icon("leaf")}<h3>Comment garder le plaisir de revenir ?</h3><p>Un cap personnel, une semaine adaptée, une trace de ce qui a compté.</p><span>LA RÉGULARITÉ À TA FAÇON →</span></a></div></section>${faq(
  [
    [
      "Est-ce un jeu ou un journal sportif ?",
      "Les deux sont reliés. Tes séances alimentent ton journal et tes analyses. Sur un compte connecté, leur validation alimente aussi la progression du personnage et les missions actives. Le jeu donne un fil conducteur ; les données restent consultables et corrigeables.",
    ],
    [
      "Faut-il être déjà sportif pour commencer ?",
      "Tu choisis ton sport et ton objectif. Les campagnes demandent des jours de pratique, sans imposer de vitesse, de charge ou de performance. Le mode découverte permet de comprendre l’application avant de créer un compte.",
    ],
    [
      "Que se passe-t-il si je fais une pause ?",
      "Tes niveaux et tes insignes acquis restent conservés. Les chapitres n’ont pas de date limite. Un objectif daté peut être ajusté ou archivé, sans pénalité de niveau.",
    ],
    [
      "Mes données sont-elles publiques ?",
      "Le journal et les objectifs personnels sont privés. Les espaces communautaires ont leur propre visibilité : ne publie dans un message que ce que tu souhaites partager. Consulte la politique de confidentialité pour les détails.",
    ],
    [
      "Puis-je utiliser TITAN sur mon téléphone ?",
      "Oui. L’application web s’adapte aux petits écrans et peut être ajoutée à l’écran d’accueil. Les brouillons et les séances sont conservés sur l’appareil ; les récompenses officielles attendent la confirmation du serveur.",
    ],
  ],
)}${cta}`;
writeFileSync(
  "index.html",
  page({
    title: "TITAN — Le sport devient une aventure. Niveaux, quêtes et progrès.",
    description:
      "Transforme tes séances en aventure : niveaux, personnages, 4 mondes et journal multisport. Deux campagnes gratuites, records et objectifs. Mobile et ordinateur.",
    body: homeBody,
    script: "renaissance-demo",
    structured: {
      "@graph": [
        {
          "@type": "Organization",
          "@id": "https://titan-app.fr/#organization",
          name: "TITAN",
          url: "https://titan-app.fr/",
          logo: "https://titan-app.fr/image/logo-192.png",
        },
        {
          "@type": "WebSite",
          name: "TITAN",
          url: "https://titan-app.fr/",
          inLanguage: "fr-FR",
        },
        {
          "@type": "WebApplication",
          name: "TITAN",
          url: "https://titan-app.fr/",
          applicationCategory: "SportsApplication",
          operatingSystem: "Web",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
          featureList: [
            "Niveaux et personnages",
            "Deux campagnes gratuites",
            "Journal multisport",
            "Objectifs datés",
            "Records contextualisés",
            "Analyses par exercice",
          ],
        },
      ],
    },
  }),
);

const articles = [
  {
    route: "/niveaux-et-xp",
    title: "Niveaux, XP et rangs : comprendre la progression TITAN",
    description:
      "Comment gagner des niveaux dans TITAN ? Comprends l’XP confirmée, les rangs, les avatars, les pauses et la différence entre compte et découverte.",
    image: "aurora",
    lead: "Une séance laisse une trace sportive et fait grandir ton personnage. Les règles doivent rester lisibles : voici ce qui change ton niveau, ce qui débloque un avatar et ce que tu conserves après une pause.",
    sections: [
      [
        "xp",
        "L’XP part de la séance enregistrée",
        `<p>Sur un compte connecté, une séance est d’abord conservée sur ton appareil. Le serveur vérifie ensuite la demande et renvoie la récompense réellement attribuée. L’écran de fin distingue ces deux états. Une connexion absente ou une séance en attente ne doit pas être confondue avec une récompense confirmée.</p><p>L’XP dépend des règles du sport et des informations retenues par le moteur, avec des plafonds et des contrôles. Multiplier les envois de la même séance ne crée pas plusieurs récompenses. Le montant confirmé apparaît dans la séance et la progression du personnage.</p><div class="rp-example"><p><strong>Le bon réflexe :</strong> si ton journal affiche une séance en attente, laisse la synchronisation se terminer. N’ajoute pas une deuxième copie pour accélérer l’XP.</p></div>`,
      ],
      [
        "niveau",
        "Un niveau, un seuil, un prochain palier",
        `<p>La jauge du personnage montre l’XP acquise dans le niveau courant et le seuil nécessaire pour passer au suivant. Le surplus est reporté lors de la montée de niveau. Le seuil suit la formule <strong>arrondi inférieur de 2 200 × niveau<sup>1,18</sup></strong> : il augmente progressivement.</p><p>Le QG affiche le prochain niveau et le prochain rang. Le niveau décrit une progression dans le jeu. Il n’est ni un classement médical, ni une certification de force, d’endurance ou de maîtrise d’un sport.</p><div class="rp-table"><table><thead><tr><th>Rang</th><th>Niveau requis</th></tr></thead><tbody>${C.ranks.map((r) => `<tr><td>${r.name}</td><td>${r.level}</td></tr>`).join("")}</tbody></table></div>`,
      ],
      [
        "avatars",
        "Des personnages et des insignes à débloquer",
        `<p>Deux avatars sont disponibles dès le départ. Les suivants s’ouvrent aux niveaux 3, 6, 10 et 15. Tous ces personnages sont inclus gratuitement. Choisis-les depuis <a href="/personnage">Personnage</a> : le choix est cosmétique et ne modifie pas la récompense de tes séances.</p><p>Les campagnes possèdent leurs propres insignes. Pour en obtenir un, termine la mission du chapitre puis récupère sa récompense. Les insignes ne donnent pas d’XP supplémentaire. Tu peux ainsi explorer de nouveaux mondes sans qu’un abonnement achète un avantage de niveau.</p>`,
      ],
      [
        "pause",
        "Reprendre sans repartir de zéro",
        `<p>Une pause n’enlève pas le niveau acquis. Les missions de campagne ne comportent pas d’échéance. Le calendrier et tes objectifs t’aident à choisir un rythme, sans transformer une journée vide en sanction.</p><p>Une correction ou un archivage met à jour les analyses et les contributions aux missions non réclamées. Un insigne déjà obtenu reste dans ta collection. Corriger une séance ne provoque pas un deuxième gain d’XP : les récompenses et leurs contrôles suivent le reçu de la séance.</p>`,
      ],
      [
        "decouverte",
        "Comprendre le mode découverte",
        `<p>Sans compte, TITAN propose une simulation locale pour essayer le personnage et les campagnes gratuites. Elle est stockée dans ce navigateur et ne devient pas automatiquement la progression officielle d’un compte. Effacer les données du navigateur peut l’effacer.</p><p>Pour le niveau de découverte, le calcul utilise une approximation fondée sur la durée : 10 points par minute, avec un minimum de 60 et un maximum de 600 par séance, puis 1 200 par jour. Une durée absente prend une base de démonstration de 15 minutes. Cette règle sert à explorer l’interface ; elle ne représente pas la récompense officielle des différents sports.</p><p>Crée un compte si tu veux synchroniser les nouvelles séances et recevoir une progression confirmée. Garde une copie de tes données de découverte grâce à l’export avant de changer d’appareil.</p>`,
      ],
    ],
    faq: [
      [
        "Puis-je acheter des niveaux ?",
        "Non. TITAN+ ouvre des campagnes et des outils supplémentaires. Les six avatars de progression et les rangs suivent le niveau gagné par la pratique.",
      ],
      [
        "Pourquoi l’XP de ma séance attend-elle ?",
        "La séance peut être conservée localement avant sa confirmation. Consulte son état de synchronisation dans le journal et reconnecte-toi si nécessaire.",
      ],
    ],
  },
  {
    route: "/aventures-sportives",
    title: "Les aventures sportives TITAN : 4 mondes, 36 chapitres",
    description:
      "Découvre les campagnes TITAN : deux mondes gratuits, deux avec TITAN+, 36 chapitres, quatre gardiens et des missions qui suivent ta pratique.",
    image: "archipelago",
    lead: "Les portes de TITAN se rallument au fil de ta pratique. Chaque région propose neuf chapitres, une histoire et un gardien. Les objectifs de mission restent concrets et consultables.",
    sections: [
      [
        "mondes",
        "Quatre régions, quatre intentions",
        `<div class="rp-worlds">${worldCards}</div><p><strong>La vallée de l’Aube</strong> accompagne le départ et la reprise. <strong>L’archipel des Marées</strong> invite à varier ses repères. Ces deux campagnes sont gratuites, avec dix-huit chapitres et autant d’insignes.</p><p><strong>Les forges d’Obsidienne</strong> et <strong>la citadelle des Aurores</strong> complètent l’aventure avec TITAN+. Les pratiques proposées mettent davantage l’accent sur la précision du journal, la comparaison et la lecture du parcours. Les missions restent soumises aux mêmes critères.</p>`,
      ],
      [
        "chemins",
        "Régularité ou Observation : choisis ton chemin",
        `<p>Au départ d’une campagne, choisis l’une des deux voies. <strong>Régularité</strong> compte les jours comportant une séance confirmée. <strong>Observation</strong> demande en plus une note personnelle d’au moins dix caractères dans la séance.</p><p>Une note utile peut être un ressenti, une précision de terrain, une variante d’exercice ou une intention pour la prochaine fois. Le conseil de chaque chapitre donne une piste d’utilisation du journal ; il ne remplace pas le critère mesurable de la mission.</p><div class="rp-example"><p>« Séance sur tapis, allure confortable » est un contexte que tu pourras retrouver. « Départ trop rapide, mieux répartir la prochaine fois » est une observation personnelle. Tu restes libre de ce que tu notes.</p></div>`,
      ],
      [
        "compter",
        "Quelles séances font avancer une étape ?",
        `<ol><li>Démarre la campagne pour activer sa première étape.</li><li>Enregistre une séance après le début de l’étape. La pratique doit avoir eu lieu au plus tôt le jour de ce départ, dans le fuseau choisi au démarrage.</li><li>Attends sa confirmation si tu utilises un compte connecté.</li><li>Retrouve la contribution dans le détail du chapitre. Une seule journée est comptée, même si tu as enregistré plusieurs séances.</li><li>Quand le nombre demandé est atteint, récupère l’insigne pour ouvrir l’étape suivante.</li></ol><p>Les étapes demandent un, deux ou trois jours de pratique selon le chapitre. Elles n’expirent pas. La quantité de kilomètres, la vitesse et la charge ne rendent pas la mission plus rapide. Les séances précédant le départ de l’étape ne sont pas réutilisées pour la suivante.</p>`,
      ],
      [
        "gardiens",
        "Le gardien marque un chapitre accompli",
        `<p>Le neuvième chapitre conclut chaque région. Le Veilleur de pierre, la Gardienne des courants, l’Artisan de braise et la Sentinelle du ciel incarnent cette dernière étape. Tu progresses face au gardien avec des contributions sportives, pas en déclarant une victoire dans le navigateur.</p><p>L’insigne final rejoint ta collection comme les huit précédents. Il raconte un parcours de pratique. Il ne prouve pas une performance certifiée et ne donne aucun avantage financier.</p>`,
      ],
      [
        "regles",
        "Correction, abonnement et confidentialité",
        `<p>Une séance archivée, refusée ou exclue par un contrôle ne compte pas dans une mission en cours. Une correction peut donc modifier la progression avant la récupération de la récompense. Les insignes déjà acquis restent visibles.</p><p>Si TITAN+ expire, tes insignes acquis restent dans la collection. Le démarrage et la récupération des nouvelles récompenses des campagnes TITAN+ demandent un abonnement actif. Les campagnes gratuites restent accessibles.</p><p>La carte de campagne ne publie pas ton journal. Les liens de séance ouvrent tes propres données. Pour un entraînement adapté à ta situation, garde la décision sportive séparée du jeu et de ses récompenses.</p>`,
      ],
    ],
    faq: [
      [
        "Puis-je jouer à plusieurs campagnes ?",
        "Tu peux commencer plusieurs régions disponibles. Chaque région conserve son étape, son chemin et sa date de départ. Le QG met en avant la dernière campagne activée.",
      ],
      [
        "Dois-je faire du sport tous les jours ?",
        "Non. Les campagnes comptent des journées de pratique sans imposer de délai. Les jours sans séance ne font pas perdre de progression acquise.",
      ],
    ],
  },
  {
    route: "/comprendre-mes-donnees",
    title: "Comprendre ses données sportives : mesures et records | TITAN",
    description:
      "Distance, durée, volume de musculation, cotations et records : les définitions utilisées par TITAN, leurs sources et les limites des comparaisons.",
    image: "forge",
    lead: "Un chiffre utile doit avoir une unité, une source et une limite claire. Cette page explique les mesures que tu retrouves dans Progrès, Records et Objectifs.",
    sections: [
      [
        "sources",
        "Partir des séances sources",
        `<p>Les analyses personnelles utilisent les séances de ton journal. Les séances archivées et celles datées dans le futur sont exclues des calculs. Les filtres de sport et de période précisent le périmètre consulté. Une donnée saisie à la main reste une déclaration ; un fichier importé n’est pas une certification sportive.</p><p>Les graphiques par exercice, records et objectifs proposent des liens vers les séances qui les alimentent. Si un total semble incohérent, commence par vérifier la date, l’unité et les mesures de ces séances. L’édition permet de corriger une erreur sans créer une seconde activité.</p>`,
      ],
      [
        "absence",
        "Une valeur manquante n’est pas un zéro",
        `<p>Une séance peut avoir une distance sans durée, une durée sans distance ou des séries sans ressenti. TITAN n’invente pas les mesures absentes. Les vues de synthèse indiquent combien de séances comportent les données utilisées.</p><p>Le ressenti de séance, s’il est renseigné, va de 1 à 10. Une ancienne valeur nulle ne devient pas un effort « moyen ». Le RIR d’une série, lorsqu’il est saisi, est distinct de ce ressenti global. Zéro RIR est une valeur renseignée ; un champ vide est une absence.</p>`,
      ],
      [
        "distance",
        "Distance, durée, allure et vitesse",
        `<div class="rp-table"><table><thead><tr><th>Mesure</th><th>Calcul et unité</th></tr></thead><tbody><tr><td>Distance</td><td>Distance totale enregistrée en kilomètres.</td></tr><tr><td>Durée</td><td>Minutes renseignées ou temps de déplacement disponible dans le GPX.</td></tr><tr><td>Allure moyenne</td><td>Durée ÷ distance, affichée en minutes et secondes par kilomètre.</td></tr><tr><td>Vitesse moyenne</td><td>Distance ÷ durée en heures, en km/h.</td></tr></tbody></table></div><p>Une sortie de 5 km en 30 minutes correspond à 6 min/km et 10 km/h. Sans durée ou sans distance positive, ces deux valeurs dérivées ne sont pas calculées. Les arrêts, le terrain et le dénivelé peuvent rendre deux sorties très différentes malgré une même moyenne.</p><p>Les records de durée sur 1, 5, 10, 21,1 et 42,2 km comparent uniquement des séances dont la distance totale se situe à ±1 % de la distance de référence. Ce ne sont pas des meilleurs segments extraits d’une trace GPS.</p>`,
      ],
      [
        "force",
        "Séries, charges et volume de musculation",
        `<p>Le volume déclaré est la somme des <strong>charges × répétitions</strong> de chaque série renseignée. Trois séries de dix répétitions à 40 kg donnent 1 200 kg de volume. La charge est celle que tu saisis : garde une convention constante, par exemple la charge totale plutôt qu’un haltère seul, pour comparer tes séances.</p><p>Les courbes séparent le nom, la variante et l’équipement. Un squat goblet et un squat barre ne sont pas fusionnés arbitrairement. Au poids du corps, le suivi présente les répétitions. Si une même série d’historique mélange charges et poids du corps, le graphique de volume garde l’unité kilogramme : une répétition ne devient jamais un kilogramme.</p><p>Le record de charge affiche le nombre de répétitions réellement déclaré avec cette charge. TITAN ne transforme pas ce record en 1RM estimé. Un volume plus important peut venir de davantage de séries, d’une charge différente ou d’un autre objectif de séance ; il ne suffit pas à conclure à un gain de force.</p>`,
      ],
      [
        "escalade",
        "Des cotations qui gardent leur contexte",
        `<p>Les cotations françaises de voie, Fontainebleau de bloc et V-scale restent séparées. La discipline, le lieu et le mode d’assurage distinguent également les groupes de comparaison. Une cotation inconnue reste dans la séance, mais n’est pas classée avec une valeur numérique inventée.</p><p>Les essais et les réussites sont les nombres que tu as renseignés. Leur absence n’est pas remplacée par une estimation. Vérifie le système de cotation et le type de pratique avant d’interpréter un meilleur niveau déclaré.</p>`,
      ],
      [
        "objectifs",
        "Un cap personnel, des calculs vérifiables",
        `<p>Un objectif utilise des dates inclusives et une mesure choisie : séances, jours actifs, minutes ou kilomètres. Tu peux le limiter à un sport. Une journée active compte une fois ; les minutes et kilomètres s’additionnent uniquement lorsque leur mesure est disponible.</p><p>Les objectifs peuvent être ajustés ou archivés. Ils ne donnent pas d’XP supplémentaire. Ils servent à organiser ta pratique, et non à remplacer un programme individualisé. <a href="/objectifs">Créer un objectif</a> ou <a href="/stats">ouvrir mes analyses</a>.</p>`,
      ],
    ],
    faq: [
      [
        "Pourquoi mon objectif indique-t-il moins de séances contributrices que mon journal ?",
        "Une séance peut être hors de la période, appartenir à un autre sport, être archivée ou ne pas posséder la mesure demandée. Le détail de l’objectif donne les séances effectivement utilisées.",
      ],
      [
        "Mes corrections changent-elles les records ?",
        "Oui. Les records et les analyses sont recalculés à partir du journal courant. Archiver ou corriger une séance peut donc modifier les résultats affichés.",
      ],
    ],
  },
  {
    route: "/debuter-titan",
    title: "Bien démarrer avec TITAN : première séance, aventure et objectifs",
    description:
      "Le guide du premier jour sur TITAN : découvrir le QG, choisir une campagne, enregistrer une séance, comprendre ses données et retrouver sa sauvegarde.",
    image: "valley",
    lead: "Pas besoin de tout configurer avant de commencer. Choisis une pratique, ouvre ta première campagne et construis un journal que tu auras plaisir à retrouver.",
    sections: [
      [
        "depart",
        "1. Découvrir le QG",
        `<p>Le <a href="/aujourdhui">QG</a> réunit ton personnage, la mission active et les repères de la semaine. En mode découverte, tu peux essayer l’application sans carte bancaire ni compte. Le bandeau « sur cet appareil » précise que les données restent dans ce navigateur.</p><p>Si tu souhaites synchroniser tes nouvelles séances et ta progression entre appareils, <a href="/login">connecte-toi à ton compte</a>. Les données de découverte et celles du compte sont séparées. L’export te permet de conserver une copie de ton essai.</p>`,
      ],
      [
        "campagne",
        "2. Activer la première campagne",
        `<p>Ouvre <a href="/adventure">Aventure</a>, choisis la vallée de l’Aube puis démarre le chemin Régularité ou Observation. Ce départ définit le début de ta première mission. Les séances enregistrées avant ce départ restent dans le journal mais n’alimentent pas rétroactivement ce chapitre.</p><p>La voie Régularité demande des jours de pratique. La voie Observation demande aussi une note personnelle. Les chapitres se réalisent sans échéance : choisis le rythme qui convient à ta pratique réelle.</p>`,
      ],
      [
        "seance",
        "3. Enregistrer ce que tu as réellement fait",
        `<p>Dans <a href="/training">Séance</a>, choisis ton sport, vérifie la date et renseigne les champs utiles. Pour une course, commence par la distance et la durée. Pour la musculation, ajoute les exercices et leurs séries. En escalade, choisis le type de pratique et le système de cotation.</p><p>Le chronomètre peut t’aider à reporter une durée. Les détails, le ressenti et les notes restent facultatifs sauf si tu as choisi une mission Observation. Un brouillon conserve la saisie pendant la préparation de la séance.</p><div class="rp-example"><p>Tu as seulement noté « 35 minutes de marche » ? Garde cette mesure. Il vaut mieux une durée réelle qu’une distance inventée pour remplir un champ.</p></div>`,
      ],
      [
        "resultat",
        "4. Lire le résultat et récupérer l’insigne",
        `<p>Après l’enregistrement, l’écran de résultat rassemble la séance, la progression du personnage et celle de l’aventure. Sur un compte connecté, une confirmation du serveur peut encore être nécessaire. Le journal conserve l’état de synchronisation.</p><p>Quand la mission atteint son objectif, ouvre le chapitre et récupère l’insigne. Cela démarre l’étape suivante. Les contributions des étapes précédentes ne sont pas reportées dans la nouvelle étape. Retrouve tes insignes dans <a href="/personnage">Personnage</a>.</p>`,
      ],
      [
        "reperes",
        "5. Choisir un objectif qui te sert",
        `<p>Dans <a href="/objectifs">Objectifs</a>, choisis une mesure, un sport éventuel et une période. Tu peux commencer avec un modèle puis le modifier. Un nombre de jours actifs peut être plus lisible qu’une distance si tu alternes plusieurs disciplines.</p><p>Consulte ensuite <a href="/stats">Progrès</a> et <a href="/records">Records</a>. Lis les unités et les séances sources avant de comparer deux résultats. Un record de jeu n’est pas une consigne pour augmenter ton effort.</p>`,
      ],
      [
        "retrouver",
        "6. Retrouver, corriger et sauvegarder",
        `<p>Le <a href="/journal">Journal</a> propose liste, calendrier et filtres. Tu peux corriger une séance, modifier ses séries ou l’archiver. Les analyses et les missions non réclamées prennent en compte ces changements.</p><p>Le mode découverte dépend du stockage du navigateur. Évite de l’effacer avant d’avoir exporté les données que tu veux garder. Sur un compte, vérifie que les séances ont bien été confirmées avant de changer d’appareil. L’ajout de TITAN à l’écran d’accueil donne un accès rapide, mais ne remplace pas la synchronisation.</p><p>Besoin de comprendre un état de sauvegarde ? Consulte <a href="/service">l’aide</a>. Pour préparer une séance à l’avance, utilise le planning du QG et les routines de la page Séance.</p>`,
      ],
    ],
    faq: [
      [
        "Combien coûte le premier essai ?",
        "Le mode découverte, le journal, les objectifs, les niveaux et deux campagnes complètes sont gratuits. TITAN+ est proposé séparément, sans être nécessaire pour commencer.",
      ],
      [
        "Puis-je faire plusieurs sports ?",
        "Oui. Le personnage garde une progression globale, tandis que les analyses distinguent les disciplines et leurs mesures. Tu n’as pas besoin de créer un journal différent pour chaque sport.",
      ],
    ],
  },
];
for (const a of articles) {
  const body = `<article class="rp-article"><nav class="rp-breadcrumb" aria-label="Fil d’Ariane"><a href="/">TITAN</a> / <a href="/debuter-titan">Guides</a> / ${a.title.split(":")[0]}</nav><p class="eyebrow">LE GUIDE TITAN · MIS À JOUR EN SEPTEMBRE 2026</p><h1>${a.title.replace(" | TITAN", "")}</h1><p class="rp-lead">${a.lead}</p><img class="rp-article-hero" src="/assets/renaissance/${a.image}.webp" srcset="/assets/renaissance/${a.image}-small.webp 800w,/assets/renaissance/${a.image}.webp 1600w" sizes="(max-width:700px) 100vw,1000px" width="1600" height="900" alt="Paysage de l’univers TITAN"><div class="rp-article-layout"><nav class="rp-toc" aria-label="Sommaire"><strong>DANS CE GUIDE</strong>${a.sections.map(([id, title]) => `<a href="#${id}">${title}</a>`).join("")}</nav><div class="rp-article-content">${a.sections.map(([id, title, content]) => `<section id="${id}"><h2>${title}</h2>${content}</section>`).join("")}<a class="button" href="/aujourdhui">Retrouver mon QG ${icon("arrow")}</a></div></div></article>${faq(a.faq)}${cta}`;
  writeFileSync(
    a.route.slice(1) + ".html",
    page({
      ...a,
      body,
      structured: {
        "@type": "Article",
        headline: a.title,
        description: a.description,
        inLanguage: "fr-FR",
        datePublished: "2026-09-13",
        dateModified: "2026-09-13",
        author: {
          "@type": "Organization",
          name: "TITAN",
          url: "https://titan-app.fr/",
        },
        mainEntityOfPage: "https://titan-app.fr" + a.route,
        image: "https://titan-app.fr/assets/renaissance/" + a.image + ".webp",
      },
    }),
  );
}
const comparison = [
  ["Journal complet, édition et calendrier", "Inclus", "Inclus"],
  ["Niveaux, XP, 7 rangs et 6 avatars", "Inclus", "Inclus"],
  [
    "Campagnes et insignes",
    "2 mondes · 18 chapitres",
    "4 mondes · 36 chapitres",
  ],
  ["Objectifs datés et archives", "Inclus", "Inclus"],
  ["Records et comparaison de deux séances", "Inclus", "Inclus"],
  ["Analyses par exercice et contexte d’escalade", "Inclus", "Inclus"],
  ["Export CSV du journal et des détails", "Inclus", "Inclus"],
  ["Routines nommées", "5 routines", "20 routines"],
  ["Bilan personnel imprimable", "Inclus", "Inclus"],
  ["Comparaison de périodes dans le bilan", "—", "Inclus"],
  ["Sportifs suivis dans l’espace coach", "3", "20"],
  ["Bonus de niveau ou de puissance achetés", "Aucun", "Aucun"],
];
writeFileSync(
  "tarifs.html",
  page({
    route: "/tarifs",
    title: "TITAN gratuit et TITAN+ à 5 € par mois : fonctions et campagnes",
    description:
      "Compare TITAN Classique et TITAN+ : deux campagnes gratuites, journal complet, niveaux et objectifs. Plus de mondes, routines et bilans à 5 € par mois.",
    body: `<section class="rp-section"><div class="rp-section-head"><div><p class="eyebrow">DU CONTENU. PAS DE NIVEAU ACHETÉ.</p><h1 style="font-size:clamp(2.7rem,5vw,5rem)">Ton aventure commence gratuitement.</h1></div><p>Choisis les mondes et les outils qui te sont utiles. Tes données et les fonctions essentielles du journal restent accessibles.</p></div>${offers}</section><section class="rp-section"><div class="rp-section-head"><h2>Ce qui est inclus, précisément.</h2></div><div class="comparison-table-wrap"><table class="comparison-table"><caption>Comparaison des fonctions TITAN Classique et TITAN+</caption><thead><tr><th>Fonction</th><th>Classique · gratuit</th><th>TITAN+</th></tr></thead><tbody>${comparison.map((row) => `<tr><th scope="row">${row[0]}</th><td>${row[1]}</td><td>${row[2]}</td></tr>`).join("")}</tbody></table></div><p class="rp-fine">Les mêmes contrôles d’XP s’appliquent à tous les comptes. Les campagnes donnent des récompenses cosmétiques. Le compte et la connexion permettent la synchronisation ; la découverte conserve une progression locale distincte.</p></section>${faq(
      [
        [
          "Que se passe-t-il à l’expiration de TITAN+ ?",
          "Le journal, les analyses gratuites et les campagnes gratuites restent accessibles. Les insignes acquis sont conservés. Démarrer ou réclamer une nouvelle récompense dans une campagne TITAN+ nécessite un abonnement actif.",
        ],
        [
          "Les routines au-delà de la limite gratuite sont-elles supprimées ?",
          "Tes routines existantes restent disponibles et peuvent être chargées. Au-delà de cinq routines, la création d’une nouvelle routine demande TITAN+ ; tu peux toujours remplacer une routine existante.",
        ],
        [
          "Quel est le prix et comment fonctionne le renouvellement ?",
          "Le tarif proposé est de 5 € par mois. Le paiement Paddle affiche le prix final applicable, les taxes, la fréquence de renouvellement et les modalités d’annulation avant confirmation. Consulte également les conditions générales.",
        ],
        [
          "Puis-je essayer sans transmettre mes coordonnées bancaires ?",
          "Oui. La découverte et l’offre Classique ne demandent pas de carte bancaire. Le paiement est une démarche séparée pour TITAN+.",
        ],
      ],
    )}${cta}`,
    structured: {
      "@type": "WebPage",
      name: "TITAN Classique et TITAN+",
      url: "https://titan-app.fr/tarifs",
      inLanguage: "fr-FR",
    },
  }),
);
let sitemap = readFileSync("sitemap.xml", "utf8");
for (const a of articles)
  if (!sitemap.includes(`https://titan-app.fr${a.route}</loc>`))
    sitemap = sitemap.replace(
      "</urlset>",
      `  <url><loc>https://titan-app.fr${a.route}</loc><lastmod>2026-09-13</lastmod></url>\n</urlset>`,
    );
writeFileSync("sitemap.xml", sitemap);
console.log("Renaissance: accueil, tarifs et quatre guides publics générés.");
const featureGroups = [
  [
    "compass",
    "Une aventure qui se construit",
    "Deux campagnes gratuites et deux avec TITAN+. Chaque monde propose neuf chapitres, une histoire, deux chemins de progression et un gardien final. Les journées de pratique confirmées alimentent les missions ; tu récupères ensuite un insigne cosmétique.",
    "/adventure",
    "Explorer les campagnes",
  ],
  [
    "shield",
    "Un personnage durable",
    "Sept rangs, des niveaux gagnés par la pratique et six avatars accessibles gratuitement. Les pauses ne retirent pas de niveau. Le profil, le QG et la collection retrouvent le même personnage. Les règles de calcul restent consultables.",
    "/niveaux-et-xp",
    "Comprendre les niveaux",
  ],
  [
    "journal",
    "Un journal qui reste exploitable",
    "Liste et calendrier, filtres par sport et période, recherche, notes, duplication, édition et archives. Une correction de mesure recalcule les analyses. L’export CSV du journal et des détails est gratuit.",
    "/journal",
    "Ouvrir le journal",
  ],
  [
    "weight",
    "Des mesures adaptées au sport",
    "Musculation : séries, répétitions, charges et RIR. Course et vélo : distances, durées, allures et vitesse. Escalade : essais, réussites et cotations séparées selon le système et le contexte. Chaque mesure garde son unité.",
    "/comprendre-mes-donnees",
    "Lire les indicateurs",
  ],
  [
    "flag",
    "Un cap que tu peux ajuster",
    "Objectifs datés en séances, jours actifs, minutes ou kilomètres, avec filtre de sport. Quatre modèles personnalisables, progression calculée, séances contributrices et archives. Aucun bonus d’XP n’incite à multiplier les objectifs.",
    "/objectifs",
    "Choisir mon objectif",
  ],
  [
    "trophy",
    "Des records avec leur source",
    "Records par sport et par exercice, comparaisons de deux séances, courbes et tableaux détaillés. Les données absentes restent absentes. Les records de distance comparent des séances entières, sans prétendre analyser des segments GPS.",
    "/records",
    "Voir mes records",
  ],
  [
    "calendar",
    "Moins de préparation répétitive",
    "Planning hebdomadaire, brouillons de séance, chronomètre, import GPX et routines nommées. Cinq routines en Classique, vingt avec TITAN+. Tu peux reprendre et adapter ce que tu as déjà préparé.",
    "/training",
    "Préparer une séance",
  ],
  [
    "group",
    "Un suivi décidé ensemble",
    "Un coach invite ; le sportif choisit les dates, le sport et les détails partagés. Propositions de séances, acceptation, refus et rattachement à une activité réalisée. Trois sportifs suivis gratuitement, vingt avec TITAN+.",
    "/pour-les-coachs",
    "Découvrir le suivi",
  ],
  [
    "download",
    "Des bilans que tu peux conserver",
    "Bilan personnel imprimable gratuit, choix de période et repères de pratique. TITAN+ ajoute la comparaison de périodes. L’export personnel rassemble également les objectifs et la progression d’aventure du compte.",
    "/bilan",
    "Préparer un bilan",
  ],
];
writeFileSync(
  "fonctionnalites.html",
  page({
    route: "/fonctionnalites",
    title: "Fonctionnalités TITAN : jeu, journal sportif, données et coachs",
    description:
      "Découvre les campagnes, niveaux, objectifs, analyses par sport, routines et suivi coach de TITAN. Fonctions gratuites et TITAN+ expliquées concrètement.",
    body: `<section class="rp-section"><p class="eyebrow">UNE APPLICATION, TROIS DIMENSIONS</p><h1 class="rp-page-title">Le plaisir de jouer.<br>Des progrès que tu comprends.</h1><p class="rp-lead">TITAN relie ta pratique, ton personnage et tes repères. Tu peux commencer simplement, puis ouvrir les outils qui te servent vraiment.</p><div class="rp-feature-grid">${featureGroups.map(([symbol, title, copy, url, label]) => `<article class="rp-feature"><span class="rp-feature-icon">${icon(symbol)}</span><h2>${title}</h2><p>${copy}</p><a class="text-link" href="${url}">${label} ${icon("arrow")}</a></article>`).join("")}</div></section><section class="rp-section"><h2>Sur le téléphone, au quotidien.</h2><p class="rp-lead">Une navigation vers le QG, l’aventure, la séance, les progrès et le profil. Le journal reste accessible depuis les données. TITAN peut être ajouté à l’écran d’accueil ; les séances enregistrées hors ligne restent en attente de confirmation du compte.</p><div class="rp-principles"><article>${icon("leaf")}<h3>Découvrir sans compte</h3><p>L’essai conserve les données sur cet appareil. Son niveau est une simulation distincte du compte synchronisé.</p></article><article>${icon("shield")}<h3>Savoir ce qui est sauvegardé</h3><p>Une séance locale, en attente ou confirmée n’a pas le même statut. L’application conserve cet état dans le journal.</p></article><article>${icon("chart")}<h3>Garder des repères honnêtes</h3><p>Les données déclarées ne sont pas une certification de performance. Le jeu ne remplace pas une décision d’entraînement adaptée.</p></article></div></section>${faq(
      [
        [
          "Qu’est-ce qui est gratuit ?",
          "Le journal, les niveaux, six avatars à débloquer, deux campagnes, les objectifs, les records, les analyses, cinq routines, le bilan personnel et le suivi de trois sportifs. La page des offres précise les capacités de chaque formule.",
        ],
        [
          "Les abonnés gagnent-ils plus d’XP ?",
          "Les campagnes supplémentaires ne donnent pas de bonus d’XP. Les mêmes contrôles serveur s’appliquent aux séances de tous les comptes.",
        ],
        [
          "Mon journal est-il automatiquement visible par un coach ?",
          "Non. Le partage commence après ton acceptation explicite et utilise le périmètre que tu choisis. Tu peux le modifier ou révoquer le lien.",
        ],
      ],
    )}${cta}`,
    structured: {
      "@type": "WebPage",
      name: "Fonctionnalités TITAN",
      url: "https://titan-app.fr/fonctionnalites",
    },
  }),
);
writeFileSync(
  "pour-les-coachs.html",
  page({
    route: "/pour-les-coachs",
    title:
      "TITAN pour les coachs : suivi sportif consenti et séances partagées",
    description:
      "Un espace coach pour suivre les séances autorisées et proposer les suivantes. Consentement du sportif, données choisies, 3 suivis gratuits ou 20 avec TITAN+.",
    image: "archipelago",
    body: `<section class="rp-section"><p class="eyebrow">POUR LES COACHS ET LES SPORTIFS ACCOMPAGNÉS</p><h1 class="rp-page-title">Un suivi clair.<br>Une relation choisie.</h1><p class="rp-lead">Retrouve les séances que ton sportif accepte de partager, propose la suite et garde le fil entre deux échanges. Son personnage et son aventure restent son espace personnel.</p><div class="rp-actions"><a class="button" href="/coaching">Ouvrir l’espace coach ${icon("arrow")}</a><a class="button button-outline" href="#fonctionnement">Comprendre le partage</a></div><img class="rp-article-hero" src="/assets/renaissance/archipelago-small.webp" width="800" height="450" alt="Les passages reliés de l’archipel des Marées"></section><section class="rp-section" id="fonctionnement"><p class="eyebrow">UN CADRE COMMUN, AVANT LES DONNÉES</p><h2>Du premier contact à la séance réalisée.</h2><div class="rp-feature-grid"><article class="rp-feature"><span class="rp-feature-icon">${icon("group")}</span><h3>1. Inviter personnellement</h3><p>Le coach crée un code à usage unique, valable sept jours, puis le transmet au sportif par son canal habituel. TITAN n’envoie pas d’invitation automatique. Le sportif vérifie l’identité affichée avant d’accepter.</p></article><article class="rp-feature"><span class="rp-feature-icon">${icon("shield")}</span><h3>2. Choisir le périmètre</h3><p>Le sportif choisit la date de début et éventuellement un sport. Les notes et les détails techniques sont désactivés par défaut. Il accepte explicitement le partage et peut revoir ces choix ensuite.</p></article><article class="rp-feature"><span class="rp-feature-icon">${icon("chart")}</span><h3>3. Lire les mesures autorisées</h3><p>Le coach consulte le sport, la date, la mesure principale et la durée disponible. Avec l’accord correspondant, il peut aussi voir les séries et certains repères d’escalade, ou les notes de séance.</p></article><article class="rp-feature"><span class="rp-feature-icon">${icon("calendar")}</span><h3>4. Proposer la prochaine séance</h3><p>Un titre, un sport, une date et des consignes structurent une proposition. Le sportif peut l’accepter ou la refuser. Le coach peut annuler une proposition devenue inutile ou la réutiliser comme point de départ.</p></article><article class="rp-feature"><span class="rp-feature-icon">${icon("check")}</span><h3>5. Relier ce qui a été réalisé</h3><p>Après l’entraînement, le sportif rattache une séance de son propre journal à une proposition acceptée. L’activité doit correspondre au sport et au périmètre autorisé. Une séance ne valide pas plusieurs propositions.</p></article><article class="rp-feature"><span class="rp-feature-icon">${icon("leaf")}</span><h3>6. Garder la liberté d’arrêter</h3><p>Chaque participant peut fermer le lien. L’accès aux séances et aux propositions cesse dans l’espace partagé. Les informations déjà consultées ou conservées par l’autre personne ne peuvent pas être rappelées.</p></article></div></section><section class="rp-section"><div class="rp-section-head"><h2>Le bon niveau de partage.</h2><p>Un lien de suivi ne donne pas au coach le droit de modifier le journal, le personnage, l’abonnement ou les objectifs privés du sportif.</p></div><div class="rp-table"><table><caption>Données du suivi coach</caption><thead><tr><th>Périmètre</th><th>Ce que cela implique</th></tr></thead><tbody><tr><th>Mesures de base</th><td>Date, sport, valeur, unité et durée disponible, dans les dates et sports autorisés.</td></tr><tr><th>Détails, sur choix du sportif</th><td>Séries, charges, répétitions, RIR et repères d’escalade autorisés. Le lieu précis n’est pas transmis par ce partage.</td></tr><tr><th>Notes, sur choix du sportif</th><td>Le texte des notes de séance. Évite d’y inclure des informations que tu ne souhaites pas communiquer.</td></tr><tr><th>Hors de ce partage</th><td>Traces et coordonnées GPS, données de santé, poids, sommeil et biographie.</td></tr></tbody></table></div><p class="rp-muted">TITAN ne vérifie pas les diplômes, l’identité professionnelle ou l’adéquation d’un accompagnement. Choisis une personne de confiance et organise directement avec elle les modalités de votre relation. Cet espace ne constitue pas un dispositif de diagnostic ou de prescription médicale.</p></section><section class="rp-section"><h2>Commencer petit. Accompagner davantage.</h2><div class="rp-offers"><article class="rp-offer"><p class="eyebrow">CLASSIQUE · GRATUIT</p><h3>Jusqu’à 3 sportifs suivis.</h3><p>Invitations, choix du partage, lecture des séances autorisées et propositions. Un sportif peut être relié à cinq coachs au maximum.</p><a class="button button-outline" href="/coaching">Créer mon espace</a></article><article class="rp-offer plus"><p class="eyebrow">TITAN+</p><h3>Jusqu’à 20 sportifs suivis.</h3><p>Les mêmes protections et fonctions, avec davantage de relations actives côté coach. L’abonnement est nécessaire sur le compte du coach pour cette capacité étendue.</p><a class="button" href="/tarifs">Comparer les offres</a></article></div></section>${faq(
      [
        [
          "Le sportif doit-il payer ?",
          "Il peut accepter un lien et gérer son partage avec un compte Classique gratuit. La capacité de vingt sportifs dépend de l’abonnement du coach.",
        ],
        [
          "Que se passe-t-il si le coach quitte TITAN+ ?",
          "Les relations existantes et leur accès consenti restent disponibles. La création et l’acceptation de nouvelles relations respectent à nouveau la limite gratuite de trois sportifs.",
        ],
        [
          "Puis-je retirer seulement les notes ?",
          "Oui. Le sportif peut modifier les options du lien sans fermer toute la relation. Les prochaines lectures appliquent le nouveau périmètre.",
        ],
        [
          "Les propositions donnent-elles de l’XP ?",
          "Non. Seule la séance sportive suit les règles habituelles de validation. Accepter une proposition ou la marquer réalisée ne crée pas une seconde récompense.",
        ],
      ],
    )}${cta}`,
    structured: {
      "@type": "WebPage",
      name: "TITAN pour les coachs",
      url: "https://titan-app.fr/pour-les-coachs",
    },
  }),
);
