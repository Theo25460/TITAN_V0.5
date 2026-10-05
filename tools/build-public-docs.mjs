// TITAN 300 — public documents: privacy, terms, legal notice, trust centre, help, changelog, sports
// catalogue, partnerships, sport-specific guides and the 404 page. Same template as build-public-site.mjs.
// Legal texts describe the product as it works in v300; a legal review is still recommended before a
// commercial launch (identity fields of the publisher cannot be invented and are kept as published).
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { icon, SITE, E, typical, page, faq, finalCta, cards, esc } from "./lib/public-template.mjs";

const UPDATED = "5 octobre 2026";
const SUPPORT = "titanteam.app@gmail.com";

const doc = ({ route, file, title, h1, eyebrow, description, ref, body, indexable = true, image = "forge" }) =>
  writeFileSync(
    file,
    page({
      route,
      title,
      description,
      image,
      indexable,
      body: `<header class="pub-page-head"><div class="pub-wrap"><p class="pub-eyebrow">${eyebrow}</p><h1>${h1}</h1>${ref ? `<p class="pub-fine">${ref} · mise à jour le ${UPDATED}</p>` : ""}</div></header>
        <div class="pub-wrap"><div class="pub-doc">${body}</div></div>`,
    }),
  );
const legalNav = `<nav class="pub-toc" aria-label="Documents" style="margin-bottom:32px"><a href="/legal_privacy">Confidentialité</a><a href="/legal_cgu">Conditions d’utilisation</a><a href="/legal_mentions">Mentions légales</a><a href="/legal_hub">Centre de confiance</a></nav>`;
const table = (head, rows) => `<div class="pub-table"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

/* ---------------------------------------------------------------- Privacy */
doc({
  route: "/legal_privacy",
  file: "legal_privacy.html",
  title: "Politique de confidentialité | TITAN",
  h1: "Politique de confidentialité",
  eyebrow: "Confiance",
  ref: "Version 5",
  description: "Quelles données TITAN traite, pourquoi, pendant combien de temps, qui peut les voir et comment exercer tes droits : privé par défaut, sans publicité.",
  body: `${legalNav}
<h2>1. En bref</h2>
<ul><li>TITAN est <strong>privé par défaut</strong> : ton journal, tes notes et tes statistiques ne sont visibles que par toi tant que tu n’en décides pas autrement.</li><li>Nous ne vendons aucune donnée et <strong>aucune publicité</strong> n’est chargée.</li><li>Les statistiques d’usage ne sont liées à ton compte qu’avec ton accord ; tu peux les refuser entièrement.</li><li>Tu peux <strong>exporter</strong> ou <strong>supprimer</strong> toutes tes données depuis Profil, à tout moment.</li></ul>
<h2>2. Responsable du traitement</h2>
<p>L’équipe TITAN, projet indépendant porté par Théo et son cofondateur. Contact pour toute question ou demande liée à tes données : <a href="mailto:${SUPPORT}">${SUPPORT}</a>.</p>
<h2>3. Données traitées et finalités</h2>
${table(["Catégorie", "Données", "Pourquoi", "Base légale"], [
  ["Compte", "E-mail, identifiant, nom affiché, personnage choisi", "Créer le compte, te connecter, t’afficher", "Exécution du service"],
  ["Journal sportif", "Sport, date, mesures (distance, durée, séries, charges, cotations), ressenti, notes, statistiques d’un GPX importé (le tracé GPS n’est pas conservé)", "Journal, records, analyses, progression", "Exécution du service, à ton initiative"],
  ["Progression", "XP, niveau, crédits, maîtrise, cadence, campagnes, insignes, collection, apparence équipée", "Faire fonctionner la progression et la garder équitable", "Exécution du service ; intérêt légitime (anti-triche)"],
  ["Communauté", "Code ami, demandes, amitiés, blocages, Moments partagés, encouragements, défis, participations aux expéditions, guilde et messages", "Fonctions sociales et modération", "Exécution du service ; intérêt légitime (sécurité)"],
  ["Coaching", "Invitations (empreinte du code), liens, périmètre choisi, propositions et leur statut", "Suivi entre un sportif et son coach", "Exécution du service, avec le consentement explicite du sportif"],
  ["Profil public", "Uniquement les blocs que tu actives (nom, niveau, totaux, sports, distinctions)", "Carte d’athlète accessible par lien", "Consentement (désactivé par défaut)"],
  ["TITAN+", "Identifiants d’abonnement Paddle, statut, dates de renouvellement ou de fin", "Activer et gérer l’abonnement", "Exécution du contrat"],
  ["Statistiques d’usage", "Événements produit (liste au §6), page, date", "Améliorer TITAN", "Consentement, ou mesure anonyme sans identifiant"],
  ["Sécurité", "Journaux techniques, adresse IP chez nos prestataires, signalements", "Protéger les comptes, prévenir la fraude", "Intérêt légitime"],
])}
<h2>4. Qui voit quoi</h2>
${table(["Donnée", "Toi", "Tes amis acceptés", "Coach (si tu l’autorises)", "Profil public (si activé)"], [
  ["Séances et mesures", "Oui", "Non", "Selon ton périmètre", "Non (totaux seulement, si choisis)"],
  ["Notes de séance", "Oui", "Non", "Seulement si tu l’autorises", "Jamais"],
  ["Niveau, activité de la semaine", "Oui", "Selon tes réglages de confidentialité", "—", "Si tu l’actives"],
  ["Moments", "Oui", "Ceux que tu partages", "—", "Non"],
  ["Santé, poids, GPS", "Oui (si saisis)", "Jamais", "Jamais", "Jamais"],
])}
<p>Les réglages se trouvent dans Profil &gt; Réglages et Profil &gt; Profil public. Changer un réglage s’applique aux lectures suivantes ; cela ne peut pas effacer ce qu’une personne a déjà vu.</p>
<h2>5. Données sportives et santé</h2>
<p>Ton journal peut révéler des informations sur ta condition physique. Elles servent uniquement à ton journal, à tes analyses et à ta progression. Elles ne sont jamais utilisées pour de la publicité, jamais vendues, et jamais affichées dans les espaces sociaux. Évite de saisir des diagnostics, traitements ou documents médicaux dans les notes. TITAN n’est pas un dispositif médical.</p>
<h2>6. Statistiques d’usage</h2>
<p>Trois situations, que tu choisis à l’inscription ou dans Profil &gt; Réglages :</p>
<ul><li><strong>Accord</strong> : les événements sont liés à ton compte pour comprendre les parcours (par exemple, combien de personnes enregistrent une deuxième séance).</li><li><strong>Pas encore de réponse</strong> : comptage anonyme, sans identifiant de compte ni d’appareil, sans référent.</li><li><strong>Refus</strong> : rien n’est envoyé.</li></ul>
<p>Événements possibles : inscription, onboarding terminé, première et deuxième séance, objectif créé, record battu, campagne démarrée ou avancée, défi rejoint, récap hebdomadaire consulté, ouverture du paiement TITAN+, activation de TITAN+. Les seules propriétés acceptées sont des catégories (famille de sport, identifiant de sport, étape, monde, chapitre). Jamais de santé, de poids, de GPS, de note ni de texte libre. Conservation : 13 mois au plus.</p>
<h2>7. Prestataires et transferts</h2>
<ul><li><strong>Supabase</strong> : base de données, authentification et fonctions serveur.</li><li><strong>Netlify</strong> : hébergement du site et fonction de réception des paiements.</li><li><strong>Paddle</strong> : vendeur officiel et paiement de TITAN+ ; TITAN ne voit jamais tes coordonnées bancaires.</li></ul>
<p>Certains prestataires peuvent traiter des données hors de l’Union européenne, dans le cadre de leurs engagements contractuels (clauses contractuelles types) et de leurs garanties de sécurité. Aucune donnée n’est transmise à des courtiers, régies publicitaires ou réseaux sociaux.</p>
<h2>8. Durées de conservation</h2>
${table(["Donnée", "Durée"], [
  ["Compte, journal, progression", "Tant que le compte existe. Suppression immédiate à ta demande."],
  ["Inscription jamais confirmée et vide", "30 jours"],
  ["Compte sans aucune activité (connexion, session, séance)", "3 ans, sauf abonnement TITAN+ en cours"],
  ["Messages de discussion", "48 à 72 heures selon l’espace"],
  ["Statistiques d’usage", "13 mois au plus"],
  ["Données de facturation", "Chez Paddle, selon ses obligations légales"],
])}
<h2>9. Stockage sur ton appareil</h2>
<p>TITAN conserve sur ton appareil : ta session, les séances en attente d’envoi (pour le mode hors ligne), tes brouillons, tes préférences et tes choix de confidentialité. Aucun traceur publicitaire. Effacer les données du site supprime cette copie locale, pas les données de ton compte ; les séances non envoyées seraient perdues.</p>
<h2>10. Tes droits</h2>
<ul><li><strong>Accès et portabilité</strong> : Profil &gt; Exporter toutes mes données (JSON) et Exporter mon journal (CSV).</li><li><strong>Rectification</strong> : modifie une séance, ton nom ou tes réglages dans l’application.</li><li><strong>Effacement</strong> : Profil &gt; Supprimer mon compte. Suppression définitive des données du compte.</li><li><strong>Opposition, limitation, retrait du consentement</strong> : dans les réglages, ou en écrivant à <a href="mailto:${SUPPORT}">${SUPPORT}</a>.</li></ul>
<p>Nous répondons sous un mois. Tu peux introduire une réclamation auprès de la CNIL (cnil.fr).</p>
<h2>11. Mineurs</h2>
<p>Avant 15 ans, l’utilisation de TITAN et de ses fonctions sociales nécessite l’accord d’un représentant légal. Les profils restent privés par défaut pour tous.</p>
<h2>12. Sécurité</h2>
<p>Les données de chaque compte sont isolées par des règles d’accès en base. Les récompenses, achats et partages sont validés par le serveur. Aucune clé secrète n’est présente dans l’application. En cas de faille suspectée, écris-nous immédiatement.</p>
<h2>13. Modifications</h2>
<p>Cette politique évolue avec le produit. Les changements importants sont signalés dans l’application et dans les <a href="/changelog">nouveautés</a>.</p>`,
});

/* ---------------------------------------------------------------- Terms */
doc({
  route: "/legal_cgu",
  file: "legal_cgu.html",
  title: "Conditions générales d’utilisation | TITAN",
  h1: "Conditions d’utilisation",
  eyebrow: "Confiance",
  ref: "Version 5",
  description: "Les règles d’utilisation de TITAN : service, santé, TITAN+, monnaie virtuelle, communauté, coaching, profil public, triche et responsabilités.",
  body: `${legalNav}
<div class="pub-note"><strong>Santé d’abord.</strong> TITAN est un journal et un outil de motivation. Ce n’est ni un dispositif médical, ni un diagnostic, ni un coaching professionnel. En cas de douleur, malaise, blessure, pathologie ou reprise après une longue pause, arrête-toi et consulte un professionnel de santé. Aucune récompense ne justifie de forcer.</div>
<h2>1. Objet</h2><p>Ces conditions encadrent l’utilisation de TITAN (le « Service »), sur le web et en application installée. Créer un compte ou utiliser le Service vaut acceptation. Si tu les refuses, cesse d’utiliser le Service ; tu peux supprimer ton compte à tout moment.</p>
<h2>2. Le Service</h2><p>TITAN est un projet indépendant, en amélioration continue. L’équipe fait de son mieux pour le garder disponible et fiable, sans pouvoir garantir l’absence d’interruption ou d’erreur. Les séances enregistrées hors ligne restent sur l’appareil jusqu’à leur envoi.</p>
<h2>3. Accès gratuit</h2><p>Le journal, les analyses, la progression, deux campagnes, la Communauté, l’Atelier et le coaching de trois sportifs sont gratuits, sans limite de durée et sans publicité.</p>
<h2>4. TITAN+</h2>
<p>4.1. <strong>Contenu</strong> : deux campagnes supplémentaires, jusqu’à 20 routines nommées, jusqu’à 20 sportifs suivis dans l’espace coach et quatre pièces cosmétiques. TITAN+ n’augmente jamais l’XP, les crédits, les plafonds ni aucun avantage de progression.</p>
<p>4.2. <strong>Paiement</strong> : Paddle est le vendeur officiel. Le prix, les taxes, le renouvellement, la rétractation et les remboursements sont présentés par Paddle avant validation et régis par ses conditions.</p>
<p>4.3. <strong>Résiliation</strong> : depuis le lien de gestion de l’e-mail de reçu Paddle ou via le support. L’accès reste actif jusqu’à la fin de la période payée. À la fin de l’abonnement, ton journal, ta progression, tes insignes et tes crédits sont conservés ; les pièces TITAN+ reviennent au style d’origine et les campagnes TITAN+ ne peuvent plus être poursuivies.</p>
<h2>5. Monnaie et biens virtuels</h2><p>Les crédits, niveaux, insignes, titres et pièces cosmétiques sont des éléments de jeu sans valeur monétaire. Ils ne s’achètent pas, ne se vendent pas, ne s’échangent pas et ne sont pas remboursables. Les crédits se gagnent uniquement avec les séances, dans les mêmes limites pour tous.</p>
<h2>6. Équité et triche</h2><p>Il est interdit d’automatiser des séances, de saisir des séances fictives pour gagner des récompenses, d’exploiter une faille ou de modifier les données envoyées au serveur. Les récompenses sont calculées et plafonnées par le serveur ; une séance saisie plus de 30 jours après sa date entre au journal sans XP. En cas d’abus, l’équipe peut annuler des récompenses, limiter une fonction ou suspendre un compte.</p>
<h2>7. Communauté</h2><p>Les amitiés nécessitent l’accord des deux personnes. Tu es responsable de ce que tu publies (nom affiché, Moments, messages de guilde, intitulés de défis). Sont interdits : harcèlement, propos haineux ou discriminatoires, contenus illégaux, spam, informations personnelles de tiers. Tu peux bloquer une personne ; l’équipe peut retirer un contenu signalé.</p>
<h2>8. Coaching</h2><p>Le partage avec un coach commence après le consentement explicite du sportif, sur le périmètre qu’il choisit, et se révoque à tout moment. TITAN ne vérifie pas les qualifications des coachs. Les propositions de séances ne sont pas des avis médicaux ; le sportif reste seul juge de sa pratique.</p>
<h2>9. Profil public et images</h2><p>Le profil public est désactivé par défaut. En l’activant, tu acceptes que toute personne disposant du lien voie les blocs que tu as choisis. Tu peux le désactiver ou changer de lien à tout moment. Les images partagées sont créées sur ton appareil ; une fois envoyées ailleurs, elles échappent au contrôle de TITAN.</p>
<h2>10. Propriété intellectuelle</h2><p>L’univers, les textes, les illustrations, le code et les règles propres à TITAN appartiennent à l’équipe éditrice, sous réserve des composants tiers (licences libres citées dans les mentions légales). Ton journal t’appartient.</p>
<h2>11. Données personnelles</h2><p>Voir la <a href="/legal_privacy">politique de confidentialité</a>.</p>
<h2>12. Mineurs</h2><p>Avant 15 ans, l’accord d’un représentant légal est nécessaire, en particulier pour les fonctions sociales et TITAN+.</p>
<h2>13. Droit applicable</h2><p>Droit français, sous réserve des règles impératives protégeant les consommateurs. En cas de difficulté, écris d’abord à <a href="mailto:${SUPPORT}">${SUPPORT}</a> pour trouver une solution amiable ; tu peux aussi recourir à un médiateur de la consommation ou aux juridictions compétentes.</p>`,
});

/* ---------------------------------------------------------------- Legal notice */
doc({
  route: "/legal_mentions",
  file: "legal_mentions.html",
  title: "Mentions légales | TITAN",
  h1: "Mentions légales",
  eyebrow: "Confiance",
  ref: "LCEN",
  description: "Éditeur, contact, hébergement, prestataires, propriété intellectuelle et crédits des composants libres de TITAN.",
  body: `${legalNav}
<h2>Éditeur</h2><p>TITAN est un projet indépendant de suivi sportif et de progression, développé par deux amis d’université.</p><p><strong>Équipe éditrice et responsable de publication</strong> : équipe TITAN, représentée par Théo et son cofondateur.<br>Contact : <a href="mailto:${SUPPORT}">${SUPPORT}</a></p>
<p><strong>Statut</strong> : projet étudiant en version publique. L’adresse postale, le numéro d’immatriculation et, le cas échéant, les informations TVA seront publiés ici dès qu’une structure juridique porte le service ; ils ne sont pas inventés en attendant.</p>
<h2>Hébergement et prestataires</h2><ul><li><strong>Site</strong> : Netlify, Inc., 101 2nd Street, San Francisco, CA 94105, États-Unis — netlify.com</li><li><strong>Comptes et données</strong> : Supabase, Inc. — supabase.com</li><li><strong>Paiement TITAN+</strong> : Paddle, vendeur officiel. TITAN ne collecte pas les numéros de carte bancaire.</li></ul>
<h2>Propriété intellectuelle</h2><p>Le code, les textes, les règles de progression, les mondes, gardiens et personnages, ainsi que l’identité visuelle de TITAN, sont protégés. Certains éléments de code, de texte et d’illustration ont été produits avec l’assistance d’outils d’intelligence artificielle ; l’équipe reste responsable de leur choix, de leur vérification et de leur publication. Toute reproduction non autorisée est interdite.</p>
<h2>Composants libres</h2><ul><li>Archivo et Manrope — polices sous licence SIL Open Font License, hébergées par TITAN.</li><li>supabase-js — licence MIT.</li><li>qrcode-generator (Kazuhiko Arase) — licence MIT.</li></ul>
<h2>Responsabilité</h2><p>TITAN est fourni en l’état. Les informations affichées sont des repères personnels, pas des avis médicaux ou professionnels. Chacun reste responsable de sa pratique sportive.</p>
<h2>Données personnelles</h2><p>Voir la <a href="/legal_privacy">politique de confidentialité</a>. Contact RGPD : <a href="mailto:${SUPPORT}">${SUPPORT}</a>.</p>`,
});

/* ---------------------------------------------------------------- Trust centre */
doc({
  route: "/legal_hub",
  file: "legal_hub.html",
  title: "Centre de confiance : confidentialité, équité, sécurité | TITAN",
  h1: "Centre de confiance",
  eyebrow: "Confiance",
  description: "Les engagements de TITAN : privé par défaut, aucune publicité, aucune progression vendue, données exportables et supprimables, paiements opérés par Paddle.",
  body: `${legalNav}
${cards([
  ["lock", "Privé par défaut", "Journal privé, amis sur demande acceptée, profil public désactivé, coach seulement avec ton accord."],
  ["shield", "Aucune progression vendue", "Mêmes formules et mêmes plafonds pour tous. TITAN+ n’achète ni XP, ni crédits, ni avance.", "/niveaux-et-xp"],
  ["eye", "Pas de publicité", "Aucun script publicitaire, aucune revente de données."],
  ["download", "Tes données, à toi", "Export JSON et CSV, suppression du compte en un geste depuis Profil."],
], 2)}
<h2>Documents</h2><ul><li><a href="/legal_privacy">Politique de confidentialité</a> — données, finalités, durées, droits.</li><li><a href="/legal_cgu">Conditions d’utilisation</a> — règles, TITAN+, équité, communauté.</li><li><a href="/legal_mentions">Mentions légales</a> — éditeur, hébergement, crédits.</li></ul>
<h2>Nous écrire</h2><p>Question, demande RGPD, signalement d’un contenu ou d’une faille : <a href="mailto:${SUPPORT}">${SUPPORT}</a>.</p>`,
});

/* ---------------------------------------------------------------- Help */
const helpFaq = [
  ["Ma séance indique « en attente » : est-elle perdue ?", "Non. Elle est enregistrée sur ton appareil et partira toute seule quand le réseau reviendra. Le point de synchronisation (en haut de l’application) indique l’état. Ne la saisis pas une deuxième fois."],
  ["Je n’ai pas reçu l’e-mail de confirmation.", "Vérifie les indésirables, puis utilise « Renvoyer l’e-mail » sur l’écran de connexion. Le lien ouvre directement la suite de l’inscription."],
  ["J’ai oublié mon mot de passe.", "Sur l’écran de connexion, « Mot de passe oublié » t’envoie un lien de réinitialisation."],
  ["Pourquoi cette séance n’a-t-elle pas donné d’XP ?", "Trois raisons possibles : le plafond du jour ou de la semaine était atteint, la séance a été saisie plus de 30 jours après sa date (elle compte alors comme historique), ou elle attend encore sa confirmation par le serveur."],
  ["Comment corriger ou supprimer une séance ?", "Journal, puis la séance : « Modifier » ou « Archiver ». Les analyses et les records se mettent à jour ; l’XP n’est pas redonnée."],
  ["Comment installer TITAN sur mon téléphone ?", "Android (Chrome) : menu ⋮ puis « Installer l’application ». iPhone (Safari) : bouton Partager puis « Sur l’écran d’accueil »."],
  ["Comment exporter ou supprimer mes données ?", "Profil, section Compte et données : export JSON complet, export CSV du journal, suppression définitive du compte."],
  ["Comment arrêter TITAN+ ?", "Depuis le lien de gestion de l’e-mail de reçu Paddle, ou en nous écrivant. L’accès reste actif jusqu’à la fin de la période payée."],
  ["Quelqu’un me harcèle.", "Bloque la personne depuis Communauté (menu de l’ami), puis écris-nous avec le nom affiché et ce qui s’est passé."],
];
const help = faq(helpFaq, "Les réponses rapides");
writeFileSync(
  "service.html",
  page({
    route: "/service",
    title: "Aide et contact | TITAN",
    description: "Synchronisation, connexion, XP, corrections, installation, export, TITAN+ et signalement : les réponses rapides et le contact de l’équipe TITAN.",
    image: "valley",
    schema: [help.schema],
    body: `<header class="pub-page-head"><div class="pub-wrap"><p class="pub-eyebrow">Aide</p><h1>On t’aide.</h1><p class="pub-lead">Les réponses aux questions les plus fréquentes. Pour tout le reste, une vraie personne te répond.</p>
      <div class="pub-cta"><a class="asc-btn asc-btn-primary" href="mailto:${SUPPORT}">${icon("send")} Écrire à l’équipe</a><a class="asc-btn asc-btn-secondary" href="/debuter-titan">Bien démarrer</a></div></div></header>
      ${help.html}
      <section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">Comprendre</p><h2>Les guides</h2></div>${cards([
        ["compass", "Bien démarrer", "Ton premier jour en deux minutes.", "/debuter-titan"],
        ["crown", "Les règles de progression", "XP, plafonds, rangs, maîtrise, cadence.", "/niveaux-et-xp"],
        ["chart", "Comprendre mes données", "Mesures, records, limites des comparaisons.", "/comprendre-mes-donnees"],
        ["lock", "Confidentialité", "Ce que nous traitons et tes droits.", "/legal_privacy"],
      ], 4)}</div></section>`,
  }),
);

/* ---------------------------------------------------------------- Changelog */
const releases = [
  ["300", "Ascension", "5 octobre 2026", [
    "Nouvelle application : cinq espaces (QG, Progrès, Séance, Aventure, Profil), mobile d’abord, hors ligne.",
    "XP calculée à partir de l’effort (durée × ressenti), mêmes plafonds pour tous ; séances anciennes en historique.",
    "Rang, maîtrise par sport, cadence choisie avec semaines en pause, collection.",
    "Récap hebdomadaire qui répond à de vraies questions, records avec leur séance source, objectifs avec projection.",
    "Aventure : balises, gardiens qui demandent de la constance, expéditions de saison.",
    "Communauté : amis par consentement, Moments, défis sans mise, guilde par effort.",
    "Coaching consenti, Atelier (cosmétiques gagnés à l’effort), TITAN+ sans avantage de progression.",
    "Profil public optionnel avec QR, images à partager, profils privés par défaut, statistiques d’usage avec consentement.",
    "Sécurité serveur renforcée et purge des comptes inactifs corrigée.",
  ]],
  ["200", "Renaissance", "13 septembre 2026", ["Univers de quatre mondes, personnages, campagnes et gardiens.", "Objectifs datés, records contextualisés, espace coach consenti."]],
  ["90", "Le sport d’abord", "31 juillet 2026", ["Saisie recentrée sur le sport, musculation par séries, journal unifié avec calendrier."]],
  ["88", "Catalogue multisport", "30 juillet 2026", ["Plus de 260 sports avec recherche par nom, alias et famille."]],
];
doc({
  route: "/changelog",
  file: "changelog.html",
  title: "Nouveautés de TITAN",
  h1: "Nouveautés",
  eyebrow: "Journal des versions",
  description: "Les évolutions importantes de TITAN, expliquées simplement : version 300 Ascension et versions précédentes.",
  image: "aurora",
  body: releases.map(([v, name, date, items]) => `<h2>v${v} — ${name}</h2><p class="pub-fine">${date}</p><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`).join(""),
});

/* ---------------------------------------------------------------- Sports catalogue */
const sbx = { window: {} };
vm.createContext(sbx);
vm.runInContext(readFileSync("js/core/sports-catalog.js", "utf8"), sbx);
vm.runInContext(readFileSync("js/core/sports.js", "utf8"), sbx);
const SP = sbx.window.TitanSports;
const rows = sbx.window.TITAN_SPORTS_SNAPSHOT || [];
const byFamily = new Map();
for (const r of rows) {
  const fam = SP.familyOf(r[0]);
  if (!byFamily.has(fam)) byFamily.set(fam, []);
  byFamily.get(fam).push(r[1]);
}
const FAMILY_TEXT = {
  endurance: "Distance, durée, allure ou vitesse, dénivelé et import GPX quand il existe.",
  force: "Exercices, séries, charges, répétitions et RIR, ou répétitions au poids du corps.",
  technique: "Cotations, essais et réussites, figures et durées selon la discipline.",
  jeu: "Durée, matchs, sets ou rounds selon le sport, et ressenti.",
  mobilite: "Durée et ressenti, pour le yoga, les étirements et la récupération active.",
};
writeFileSync(
  "sports.html",
  page({
    route: "/sports",
    title: `Les ${rows.length} sports suivis par TITAN, famille par famille`,
    description: `Course, musculation, escalade, natation, raquette, combat, équipe, glisse : les ${rows.length} sports que TITAN journalise, avec leurs mesures.`,
    image: "archipelago",
    body: `<header class="pub-page-head"><div class="pub-wrap"><p class="pub-eyebrow">Catalogue</p><h1>${rows.length} sports.<br>Chacun ses mesures.</h1><p class="pub-lead">TITAN adapte la saisie à ta discipline et calcule l’effort de la même façon pour tous : la durée et ton ressenti.</p></div></header>
      ${[...byFamily.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([fam, list]) => `<section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">${icon(SP.FAMILY_ICON[fam] || "bolt")} ${esc(SP.FAMILY_LABEL[fam] || fam)} · ${list.length} sports</p><p class="pub-lead">${FAMILY_TEXT[fam] || ""}</p></div><p class="pub-prose" style="max-width:none">${list.sort((a, b) => a.localeCompare(b, "fr")).map(esc).join(" · ")}</p></div></section>`)
        .join("")}${finalCta("valley")}`,
  }),
);

/* ---------------------------------------------------------------- Partnerships */
doc({
  route: "/partenariats",
  file: "partenariats.html",
  title: "Partenariats : clubs, salles, coachs et associations | TITAN",
  h1: "Construire avec les clubs<br>et les coachs",
  eyebrow: "Partenariats",
  description: "Clubs, salles, associations et coachs : ce que TITAN peut apporter à vos sportifs, et nos conditions (aucune donnée revendue, aucune publicité).",
  image: "archipelago",
  body: `<p class="pub-lead">TITAN aide les sportifs à pratiquer régulièrement et à comprendre leurs progrès. Si vous accompagnez des sportifs, parlons-en.</p>
<h2>Ce qui existe déjà</h2><ul><li><strong>Espace coach</strong> : suivi consenti, périmètre choisi par le sportif, propositions de séances. Trois sportifs gratuitement, vingt avec TITAN+. <a href="/pour-les-coachs">Voir le fonctionnement</a>.</li><li><strong>Guildes</strong> : un objectif d’effort hebdomadaire commun, pour un club ou une section.</li><li><strong>Expéditions</strong> : des saisons collectives où chaque minute d’effort compte pareil, quel que soit le sport.</li></ul>
<h2>Nos conditions</h2><ul><li>Aucune donnée individuelle n’est partagée avec un partenaire sans le consentement explicite de la personne.</li><li>Aucune revente de données, aucune publicité.</li><li>Pas de progression achetable, y compris pour un partenaire.</li></ul>
<h2>Nous écrire</h2><p><a href="mailto:${SUPPORT}?subject=Partenariat">${SUPPORT}</a> — présentez votre structure et ce que vous aimeriez construire.</p>`,
});

/* ---------------------------------------------------------------- Sport-specific guides */
function seoGuide({ route, file, title, h1, eyebrow, description, image, lead, sections, faqItems }) {
  const f = faq(faqItems, "Questions fréquentes");
  writeFileSync(
    file,
    page({
      route,
      title,
      description,
      image,
      schema: [f.schema],
      body: `<header class="pub-page-head"><div class="pub-wrap"><p class="pub-eyebrow">${eyebrow}</p><h1>${h1}</h1><p class="pub-lead">${lead}</p><div class="pub-cta"><a class="asc-btn asc-btn-primary" href="/onboarding">Commencer ${icon("arrow")}</a><a class="asc-btn asc-btn-secondary" href="/fonctionnalites">Toutes les fonctionnalités</a></div></div></header>
        <div class="pub-wrap"><article class="pub-article">${sections.map(([t, body]) => `<section><h2>${t}</h2><div class="pub-prose">${body}</div></section>`).join("")}</article></div>${f.html}${finalCta(image === "valley" ? "archipelago" : "valley")}`,
    }),
  );
}

seoGuide({
  route: "/journal-course-a-pied",
  file: "journal-course-a-pied.html",
  title: "Journal de course à pied : allure, records et progression | TITAN",
  h1: "Un journal de course<br>qui comprend tes sorties",
  eyebrow: "Course à pied",
  description: "Note tes sorties en distance et durée à la seconde, importe un GPX, suis ton allure sur des sorties comparables et tes records sur 5, 10, 21,1 et 42,2 km.",
  image: "valley",
  lead: "Distance, durée à la seconde, allure, dénivelé : enregistre ta sortie en quelques secondes et vois si tu progresses vraiment.",
  sections: [
    ["Ce que tu enregistres", `<p>La distance et la durée (heures, minutes, secondes), ton ressenti de 1 à 10, et si tu veux une note. Un fichier GPX de ta montre remplit la distance, le temps en mouvement et le dénivelé ; le tracé GPS n’est pas conservé.</p>`],
    ["Des records honnêtes", `<p>Tes meilleurs temps sur 1, 5, 10, 21,1 et 42,2 km comparent des sorties entières dont la distance est à ±1 % de la référence. Chaque record garde sa séance source et l’historique de ses améliorations.</p>`],
    ["Ton allure, sur des sorties comparables", `<p>Le récap de la semaine compare ton allure sur des sorties de longueur proche, pour ne pas mélanger un fractionné et une sortie longue : « 5:02 /km contre 5:14 il y a deux mois ».</p>`],
    ["Progresser sans se brûler", `<p>Ton XP vient de l’effort : les 90 premières minutes comptent pleinement, au-delà à moitié. Une semaine régulière vaut mieux qu’un dimanche démesuré, et la maîtrise de la course demande des heures et des semaines de pratique.</p>`],
  ],
  faqItems: [
    ["Faut-il une montre GPS ?", "Non. La distance et la durée suffisent. Le GPX est un plus si tu en as un."],
    ["Les records sont-ils des segments de ma trace ?", "Non : ils comparent des sorties entières de distance proche. C’est moins flatteur, mais plus juste."],
  ],
});
seoGuide({
  route: "/carnet-musculation",
  file: "carnet-musculation.html",
  title: "Carnet de musculation : séries, charges, RIR et progression | TITAN",
  h1: "Un carnet de musculation<br>série par série",
  eyebrow: "Musculation",
  description: "Note chaque série (charge, répétitions, RIR), réutilise tes routines et suis ta progression par exercice et par variante, sans 1RM inventé.",
  image: "forge",
  lead: "Exercices, séries, charges, répétitions, RIR : le détail qui compte, et une lecture claire de ta progression par exercice.",
  sections: [
    ["Série par série", `<p>Ajoute tes exercices, puis chaque série : charge, répétitions et RIR si tu le suis. Duplique une série, réordonne les exercices, mémorise la séance en routine pour la recharger la prochaine fois (5 routines, 20 avec TITAN+).</p>`],
    ["Une progression lisible", `<p>Chaque exercice est suivi séparément, avec sa variante et son équipement : un squat goblet n’est pas un squat barre. Le récap répond à « ma force progresse-t-elle ? » avec ta meilleure série et son évolution.</p>`],
    ["Des records sans extrapolation", `<p>Le record de charge affiche les répétitions réellement faites. TITAN ne fabrique pas de 1RM estimé et rappelle qu’un volume plus élevé ne prouve pas, à lui seul, un gain de force.</p>`],
    ["L’effort, pas le tonnage", `<p>L’XP vient de la durée et de ton ressenti, comme pour tous les sports : soulever plus lourd ne rapporte pas plus de points qu’une séance d’endurance de même effort.</p>`],
  ],
  faqItems: [
    ["Puis-je suivre des exercices au poids du corps ?", "Oui : les répétitions sont suivies sans inventer de charge."],
    ["Que se passe-t-il si je corrige une série ?", "Les records et analyses sont recalculés ; l’XP de la séance ne change pas."],
  ],
});
seoGuide({
  route: "/suivi-escalade",
  file: "suivi-escalade.html",
  title: "Suivi d’escalade : cotations, essais et réussites | TITAN",
  h1: "Ton escalade,<br>cotation par cotation",
  eyebrow: "Escalade",
  description: "Bloc ou voie, cotations françaises, Fontainebleau et V-scale tenues séparées, essais et réussites : un suivi d’escalade qui garde le contexte.",
  image: "aurora",
  lead: "Bloc, voie, salle ou falaise : TITAN garde chaque cotation dans son système et son contexte, pour des comparaisons qui ont un sens.",
  sections: [
    ["Ce que tu notes", `<p>La discipline (bloc, voie), le lieu, le mode d’assurage, le système de cotation, ta meilleure réussite, et si tu veux tes essais et réussites. La durée et le ressenti alimentent l’effort.</p>`],
    ["Des systèmes qui ne se mélangent pas", `<p>Les cotations françaises, Fontainebleau et V-scale restent séparées. Une cotation inconnue reste dans la séance sans recevoir de valeur inventée.</p>`],
    ["Voir sa progression", `<p>Le récap montre l’évolution de ta meilleure cotation sur la période, par système, avec les séances sources.</p>`],
  ],
  faqItems: [["Puis-je mélanger salle et falaise ?", "Oui : le lieu et le mode d’assurage sont gardés pour comparer ce qui est comparable."]],
});
seoGuide({
  route: "/suivi-sportif",
  file: "suivi-sportif.html",
  title: "Suivi sportif multisport : un journal pour tous tes sports",
  h1: "Tous tes sports,<br>un seul journal",
  eyebrow: "Multisport",
  description: "Course, musculation, natation, padel, yoga : un journal multisport qui adapte la saisie à chaque discipline et compare l’effort de façon juste.",
  image: "archipelago",
  lead: "Tu cours le mardi, tu grimpes le jeudi et tu joues au padel le samedi ? Un seul journal, des mesures adaptées à chaque sport.",
  sections: [
    ["Chaque sport ses champs", `<p>${rows.length} sports, chacun avec sa famille et ses mesures : distance et allure, séries et charges, cotations, durée et ressenti. <a href="/sports">Voir le catalogue</a>.</p>`],
    ["Un effort comparable", `<p>Pour additionner des sports différents sans les trahir, TITAN utilise des minutes d’effort : la durée comptée multipliée par ton ressenti. Une séance typique de 45 minutes rapporte environ ${typical.xp} XP, quel que soit le sport.</p>`],
    ["Où va ton temps", `<p>Le récap montre la part de chaque famille (endurance, force, technique, jeu, mobilité) sur douze semaines, et ton sport de la semaine.</p>`],
  ],
  faqItems: [["Mon sport n’est pas dans la liste.", "Écris-nous : le catalogue s’enrichit régulièrement. En attendant, choisis le sport le plus proche."]],
});
seoGuide({
  route: "/journal-entrainement",
  file: "journal-entrainement.html",
  title: "Journal d’entraînement en ligne, gratuit et hors ligne | TITAN",
  h1: "Un journal d’entraînement<br>que tu rouvres avec plaisir",
  eyebrow: "Journal",
  description: "Recherche, calendrier, détail, comparaison avec la séance précédente, correction, archive, export CSV : un journal d’entraînement complet, gratuit et hors ligne.",
  image: "valley",
  lead: "Tes séances, retrouvées en un instant, comparées à la précédente, corrigées sans perdre l’historique.",
  sections: [
    ["Retrouver", `<p>Recherche, filtres par famille et période, vue liste ou calendrier. Chaque séance ouvre son détail, sa comparaison avec la séance précédente du même sport et ses éventuels records.</p>`],
    ["Corriger sans tricher", `<p>Une erreur de saisie se corrige : les analyses et records se mettent à jour, l’XP ne bouge pas. Une séance archivée peut être restaurée.</p>`],
    ["Hors ligne et exportable", `<p>Une séance enregistrée sans réseau reste sur l’appareil et se synchronise toute seule. Tout ton journal s’exporte en CSV, toutes tes données en JSON.</p>`],
  ],
  faqItems: [["Le journal est-il payant ?", "Non. Le journal complet est gratuit, sans limite de durée et sans publicité."]],
});
seoGuide({
  route: "/progression-sportive",
  file: "progression-sportive.html",
  title: "Mesurer sa progression sportive sans se raconter d’histoires | TITAN",
  h1: "Progresser,<br>et le savoir vraiment",
  eyebrow: "Progression",
  description: "Volume, allure, charge, cotations, régularité : comment TITAN mesure ta progression sportive avec des comparaisons justes et leurs séances sources.",
  image: "forge",
  lead: "Une progression se lit sur des séances comparables, sur plusieurs semaines, avec leurs sources. C’est exactement ce que fait TITAN.",
  sections: [
    ["Comparer ce qui est comparable", `<p>L’allure se compare sur des sorties de longueur proche, la force exercice par exercice et variante par variante, l’escalade par système de cotation.</p>`],
    ["Sur la bonne durée", `<p>Le récap compare tes 4 dernières semaines aux 4 précédentes, ta semaine à tes semaines habituelles au même moment, et ta régularité à la cadence que tu as choisie.</p>`],
    ["Une progression de jeu qui respecte le sport", `<p>Le rang et la maîtrise avancent lentement, à partir de l’effort réel et avec les mêmes plafonds pour tous. <a href="/niveaux-et-xp">Les règles</a>.</p>`],
  ],
  faqItems: [["TITAN me dit-il comment m’entraîner ?", "Il propose la prochaine action utile et dit toujours pourquoi, sans remplacer un coach ni un avis médical."]],
});
seoGuide({
  route: "/motivation-sport",
  file: "motivation-sport.html",
  title: "Garder la motivation pour le sport, sans culpabiliser | TITAN",
  h1: "La motivation<br>qui ne culpabilise pas",
  eyebrow: "Motivation",
  description: "Une cadence choisie, des pauses sans pénalité, une progression longue et une aventure qui avance avec tes séances : la motivation sans série toxique.",
  image: "aurora",
  lead: "Pas de flamme qui s’éteint, pas de compteur remis à zéro. Une cadence choisie, et l’envie de revenir.",
  sections: [
    ["Une cadence à ta mesure", `<p>Tu choisis combien de jours actifs viser par semaine, de 1 à 7. Une semaine tenue s’ajoute à ton parcours ; une semaine manquée ne détruit rien.</p>`],
    ["Les pauses font partie du sport", `<p>Vacances, blessure, examens : déclare une semaine en pause, elle ne compte ni pour ni contre toi. Ton niveau, ta maîtrise et tes insignes restent.</p>`],
    ["Un monde qui réagit", `<p>Chaque jour actif allume une balise ; les gardiens récompensent la constance ; les expéditions te font avancer avec les autres. <a href="/aventures-sportives">L’aventure</a>.</p>`],
  ],
  faqItems: [["TITAN+ est-il nécessaire pour rester motivé ?", "Non. Cadence, progression, deux campagnes et la Communauté sont gratuits."]],
});

/* ---------------------------------------------------------------- 404 */
writeFileSync(
  "404.html",
  page({
    route: "/404",
    title: "Page introuvable | TITAN",
    description: "Cette page n’existe pas ou plus. Retrouve ton QG ou l’accueil de TITAN.",
    indexable: false,
    body: `<header class="pub-page-head"><div class="pub-wrap"><p class="pub-eyebrow">404</p><h1>Ce chemin<br>ne mène nulle part.</h1><p class="pub-lead">La page a peut-être changé d’adresse. Tes séances, elles, sont à leur place.</p><div class="pub-cta"><a class="asc-btn asc-btn-primary" href="/aujourdhui">Ouvrir mon QG</a><a class="asc-btn asc-btn-secondary" href="/">Accueil</a></div></div></header>`,
  }),
);
console.log("Public docs v300: confidentialité, CGU, mentions, confiance, aide, nouveautés, sports, partenariats, 7 guides, 404.");
