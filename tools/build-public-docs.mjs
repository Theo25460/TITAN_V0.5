// TITAN 300 — public documents: privacy, terms, legal notice, trust centre, help, changelog, sports
// catalogue, partnerships, sport-specific guides and the 404 page. Same template as build-public-site.mjs.
// Legal texts describe the product as it works in v300; a legal review is still recommended before a
// commercial launch (identity fields of the publisher cannot be invented and are kept as published).
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { icon, SITE, E, typical, page, breadcrumbTrail, faq, finalCta, cards, esc } from "./lib/public-template.mjs";

const UPDATED = "5 octobre 2026";
const SUPPORT = "titanteam.app@gmail.com";

const doc = ({ route, file, title, h1, eyebrow, description, ref, body, indexable = true, image = "forge", updated = UPDATED }) =>
  writeFileSync(
    file,
    page({
      route,
      title,
      description,
      image,
      indexable,
      body: `<header class="pub-page-head"><div class="pub-wrap"><p class="pub-eyebrow">${eyebrow}</p><h1>${h1}</h1>${ref ? `<p class="pub-fine">${ref} · mise à jour le ${updated}</p>` : ""}</div></header>
        <div class="pub-wrap"><div class="pub-doc">${body}</div></div>`,
    }),
  );
const legalNav = `<nav class="pub-toc" aria-label="Documents" style="margin-bottom:32px"><a href="/legal_privacy">Confidentialité</a><a href="/legal_cgu">Conditions d’utilisation</a><a href="/legal_mentions">Mentions légales</a><a href="/legal_hub">Centre de confiance</a><a href="/regles-communaute">Règles de la communauté</a><a href="/supprimer-mon-compte">Supprimer mon compte</a></nav>`;
const table = (head, rows) => `<div class="pub-table" tabindex="0" role="region" aria-label="Tableau"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

/* ---------------------------------------------------------------- Privacy */
doc({
  route: "/legal_privacy",
  file: "legal_privacy.html",
  title: "Politique de confidentialité | TITAN",
  h1: "Politique de confidentialité",
  eyebrow: "Confiance",
  description: "Quelles données TITAN traite, pourquoi, pendant combien de temps, qui peut les voir et comment exercer tes droits : privé par défaut, aucune publicité sur le site.",
  ref: "Version 13",
  updated: "16 novembre 2026",
  body: `${legalNav}
<h2>1. En bref</h2>
<ul><li>TITAN est <strong>privé par défaut</strong> : ton journal, tes notes et tes statistiques ne sont visibles que par toi tant que tu n’en décides pas autrement.</li><li>Nous ne vendons aucune donnée. <strong>Aucune publicité n’est chargée sur le site web.</strong> Dans l’application Android, la version gratuite affiche quelques publicités Google AdMob, seulement après ton consentement et jamais pendant une séance ; TITAN+ et les offres Coach n’en affichent aucune.</li><li>Les statistiques d’usage ne sont liées à ton compte qu’avec ton accord ; tu peux les refuser entièrement.</li><li>Tu peux <strong>exporter</strong> ou <strong>supprimer</strong> toutes tes données depuis Profil, à tout moment.</li></ul>
<h2>2. Responsable du traitement</h2>
<p>L’équipe TITAN, projet indépendant porté par Théo et son cofondateur. Contact pour toute question ou demande liée à tes données : <a href="mailto:titanteam.app@gmail.com">titanteam.app@gmail.com</a>.</p>
<h2>3. Données traitées et finalités</h2>
<div class="pub-table" tabindex="0" role="region" aria-label="Tableau"><table><thead><tr><th>Catégorie</th><th>Données</th><th>Pourquoi</th><th>Base légale</th></tr></thead><tbody><tr><td>Compte</td><td>E-mail, identifiant, nom affiché, personnage choisi ; si tu te connectes avec Google, le nom et l’adresse e-mail que Google transmet</td><td>Créer le compte, te connecter, t’afficher</td><td>Exécution du service</td></tr><tr><td>Journal sportif</td><td>Sport, date, mesures (distance, durée, séries, charges, cotations), ressenti, notes, statistiques d’un GPX importé (le tracé d’un GPX importé n’est pas conservé). Si tu importes ton historique dans l’application Android à partir du fichier activities.csv d’un export Strava : pour chaque ancienne séance, la date, le sport, la durée, la distance et l’identifiant de l’activité, qui évite de l’importer deux fois (le fichier est lu sur ton téléphone et n’est pas envoyé)</td><td>Journal, records, analyses, progression</td><td>Exécution du service, à ton initiative</td></tr><tr><td>Pas du téléphone (Android)</td><td>Le compteur de pas TITAN lit le capteur de ton téléphone (autorisation « activité physique »). Les nombres de pas par jour restent sur ton téléphone ; aucun pas du compteur TITAN n’est envoyé à nos serveurs</td><td>Afficher tes pas et ton historique sur ton téléphone</td><td>Consentement (tu actives le compteur, tu peux le couper)</td></tr><tr><td>Santé Connect (Android)</td><td>Si tu la connectes : un nombre de pas par jour et, pour les séances d’exercice des sept derniers jours que tu choisis d’importer une par une, le type d’exercice, le début, la fin et le titre. TITAN ne lit ni le rythme cardiaque, ni le sommeil, ni les calories, ni le poids, ni la position, et n’écrit rien dans Santé Connect</td><td>Afficher tes pas sur tous tes appareils (ils ne donnent ni XP ni crédit) et ajouter à ton journal les séances que tu as choisies</td><td>Consentement, retirable à tout moment</td></tr><tr><td>Garmin</td><td>Si tu connectes Garmin : identifiant Garmin lié à ton compte, jetons d’accès chiffrés, résumés de tes activités (sport, date, durée, distance). Si tu autorises séparément les pas Garmin lorsqu’ils sont disponibles, TITAN reçoit aussi le total par jour et la période du relevé. Aucun rythme cardiaque ni donnée de sommeil ou de santé continue n’est conservé</td><td>Ajouter tes activités Garmin à ton journal une seule fois et, si tu le choisis, faire progresser les Sentiers du Titan à partir de tes pas vérifiés</td><td>Consentement, retirable à tout moment (TITAN se retire aussi chez Garmin)</td></tr><tr><td>Position (GPS, Android)</td><td>Pendant une séance GPS que tu démarres : position précise au premier plan, avec une notification visible. Le tracé enregistré est gardé dans ta bibliothèque de parcours, strictement privée : jamais partagée, supprimable parcours par parcours, exportée et supprimée avec ton compte (3 000 points et 200 parcours au plus)</td><td>Distance, durée et dénivelé de la séance, et revoir ton parcours sur la carte</td><td>Consentement (autorisation de position), à ton initiative</td></tr><tr><td>Progression</td><td>XP, niveau, crédits, maîtrise, cadence, campagnes, insignes, collection, apparence équipée</td><td>Faire fonctionner la progression et la garder équitable</td><td>Exécution du service ; intérêt légitime (anti-triche)</td></tr><tr><td>Mémoire de ta pratique (application Android)</td><td>Lettres à toi-même : le message (500 caractères au plus), le délai choisi (3, 6 ou 12 mois), la date de remise et un relevé de ta pratique au moment de l’écriture (minutes d’effort et jours actifs sur 30 jours). Chapitres de vie : le titre que tu donnes à une période (60 caractères au plus) et ses dates. Semaines tenues réclamées : la semaine, tes jours actifs, ta cadence et les crédits reçus</td><td>Te remettre ta lettre à la date choisie, raconter tes périodes en chiffres, créditer une semaine tenue une seule fois</td><td>Exécution du service, à ton initiative</td></tr><tr><td>Séance en direct (TITAN LIVE, seulement si elle est ouverte pour ton compte)</td><td>Le journal de la séance vécue en direct, joint à la séance : sport et Voie, intention choisie, minutes actives, repères saisis pendant la séance (compteurs propres au sport ; gêne notée avant et après, si tu la renseignes), missions réalisées, distance et dénivelé si la séance est suivie par GPS. Ton monde : ressources, bâtiments du Camp de base et trouvailles</td><td>Faire avancer un monde cosmétique à partir de tes séances, sans XP ni crédits</td><td>Exécution du service, à ton initiative</td></tr><tr><td>Communauté</td><td>Code ami, demandes, amitiés, blocages, Moments partagés, encouragements, défis (y compris un défi ouvert par un lien que tu envoies : la personne qui l’accepte y participe sans devenir ton amie), TITAN Duo et son résultat, liens d’invitation personnels que tu crées (dates et état, jamais le lien lui-même), cordées de la Grande Cordée et titres de route obtenus, participations aux expéditions, aux saisons et aux quêtes communes, guilde et messages, clubs et annonces, faction, objectif du jour, votes</td><td>Fonctions sociales et modération</td><td>Exécution du service ; intérêt légitime (sécurité)</td></tr><tr><td>Coaching</td><td>Invitations (empreinte du code), liens, périmètre choisi, propositions et leur statut, messages du suivi, modèles de séance du coach, check-ins hebdomadaires du sportif (fatigue, énergie, sommeil et motivation notés de 1 à 5, note courte), transmis au coach seulement si le sportif le choisit</td><td>Suivi entre un sportif et son coach</td><td>Exécution du service, avec le consentement explicite du sportif</td></tr><tr><td>Profil public</td><td>Uniquement les blocs que tu actives (nom, niveau, totaux, sports, distinctions)</td><td>Carte d’athlète accessible par lien</td><td>Consentement (désactivé par défaut)</td></tr><tr><td>TITAN+</td><td>Identifiants d’abonnement et jeton d’achat (Google Play ; fournisseur historique pour les droits existants), produit, statut, nature test ou achat vérifié, dates de renouvellement ou de fin</td><td>Vérifier l’achat côté serveur, activer, restaurer et gérer les droits d’accès</td><td>Exécution du contrat</td></tr><tr><td>Assistance</td><td>Catégorie, message, adresse e-mail de réponse et, si tu les joins, informations techniques (système, navigateur, type d’appareil, état du réseau)</td><td>Répondre à ta demande et suivre son traitement</td><td>Exécution du service ; obligation légale pour l’exercice de tes droits</td></tr><tr><td>Publicité (application Android gratuite)</td><td>Ton choix dans le formulaire de consentement de Google et, selon ce choix, l’identifiant publicitaire du téléphone, l’adresse IP et des données techniques de l’appareil, traités par Google AdMob. TITAN ne lit pas cet identifiant</td><td>Afficher les publicités de l’offre gratuite et en limiter le nombre</td><td>Consentement, recueilli par le formulaire de Google</td></tr><tr><td>Statistiques d’usage</td><td>Événements produit (liste au §6), page, date</td><td>Améliorer TITAN</td><td>Consentement, ou mesure anonyme sans identifiant</td></tr><tr><td>Sécurité</td><td>Journaux techniques, adresse IP chez nos prestataires, signalements</td><td>Protéger les comptes, prévenir la fraude</td><td>Intérêt légitime</td></tr></tbody></table></div>
<h2>4. Qui voit quoi</h2>
<div class="pub-table" tabindex="0" role="region" aria-label="Tableau"><table><thead><tr><th>Donnée</th><th>Toi</th><th>Tes amis acceptés</th><th>Coach (si tu l’autorises)</th><th>Profil public (si activé)</th></tr></thead><tbody><tr><td>Séances et mesures</td><td>Oui</td><td>Non</td><td>Selon ton périmètre</td><td>Non (totaux seulement, si choisis)</td></tr><tr><td>Notes de séance</td><td>Oui</td><td>Non</td><td>Seulement si tu l’autorises</td><td>Jamais</td></tr><tr><td>Niveau, activité de la semaine</td><td>Oui</td><td>Selon tes réglages de confidentialité</td><td>—</td><td>Si tu l’actives</td></tr><tr><td>Moments</td><td>Oui</td><td>Ceux que tu partages</td><td>—</td><td>Non</td></tr><tr><td>Check-in hebdomadaire (fatigue, énergie, sommeil, motivation)</td><td>Oui</td><td>Non</td><td>Seulement le check-in que tu choisis de partager</td><td>Jamais</td></tr><tr><td>Santé, poids, GPS</td><td>Oui (si saisis)</td><td>Jamais</td><td>Jamais</td><td>Jamais</td></tr><tr><td>Lettres à toi-même, chapitres de vie, monde TITAN LIVE</td><td>Oui</td><td>Jamais</td><td>Jamais</td><td>Jamais</td></tr></tbody></table></div>
<p>Les réglages se trouvent dans Profil &gt; Réglages et Profil &gt; Profil public. Changer un réglage s’applique aux lectures suivantes ; cela ne peut pas effacer ce qu’une personne a déjà vu.</p>
<h2>5. Données sportives et santé</h2>
<p>Ton journal peut révéler des informations sur ta condition physique. Elles servent uniquement à ton journal, à tes analyses et à ta progression. Elles ne sont jamais utilisées pour de la publicité, jamais vendues, et jamais affichées dans les espaces sociaux. Évite de saisir des diagnostics, traitements ou documents médicaux dans les notes. TITAN n’est pas un dispositif médical.</p>
<p>Le check-in hebdomadaire d’un suivi (fatigue, énergie, sommeil et motivation, notés de 1 à 5, avec une note courte) est une auto-évaluation facultative. Il n’est transmis à ton coach que si tu le choisis, check-in par check-in, et tu peux retirer ce partage.</p>
<p>« Ma carrière sportive » est calculée à partir de ton propre journal : elle n’envoie rien de plus. TITAN n’enregistre ni n’estime tes calories. Les pas ne sont jamais des séances ni des kilomètres de séance, et une séance n’est comptée qu’une seule fois, quelle que soit sa source.</p>
<h2>6. Statistiques d’usage</h2>
<p>Ces statistiques concernent le site et l’application Web ; l’application Android n’en envoie aucune. Trois situations, que tu choisis à l’inscription ou dans Profil &gt; Réglages :</p>
<ul><li><strong>Accord</strong> : les événements sont liés à ton compte pour comprendre les parcours (par exemple, combien de personnes enregistrent une deuxième séance).</li><li><strong>Pas encore de réponse</strong> : comptage anonyme, sans identifiant de compte ni d’appareil, sans référent.</li><li><strong>Refus</strong> : rien n’est envoyé.</li></ul>
<p>Événements possibles : inscription, onboarding terminé, première et deuxième séance, objectif créé, record battu, campagne démarrée ou avancée, défi rejoint, récap hebdomadaire consulté, ouverture du paiement TITAN+, activation de TITAN+, recherche ou filtre dans le catalogue des sports, comparaison ou bilan consulté, bilan exporté, vue d’analyse créée, renommée, ouverte ou supprimée, page d’information ouverte, assistance ouverte, catégorie d’assistance choisie et résultat de l’envoi. Les seules propriétés acceptées sont des catégories (famille de sport, identifiant de sport, étape, source, offre, monde, chapitre, type de vue, nombre, catégorie et résultat d’une demande d’assistance). Jamais de santé, de poids, de GPS, de note ni de texte libre. Conservation : 13 mois au plus.</p>
<p><strong>Google Analytics 4 (GA4)</strong> : suivi facultatif de fréquentation distinct des statistiques internes TITAN, uniquement après accord explicite via le bandeau ou le bouton « Statistiques ». Identifiant public de mesure : G-WYXQPP00H2. Avant accord ou en cas de refus, aucune balise Google Analytics n’est chargée. Si tu acceptes, Google reçoit une visite et l’adresse de la page sans paramètres d’URL ni fragment ; nous n’envoyons pas ton identifiant TITAN, tes entraînements, tes données Garmin, ton état de santé ni tes notes à GA4. Tu peux retirer ton accord à tout moment avec « Statistiques » ; le navigateur efface les cookies GA identifiables et recharge la page pour arrêter la balise. Trois événements sans aucune donnée associée peuvent aussi être envoyés, une seule fois par navigateur : inscription, première séance confirmée, deuxième séance confirmée. Google peut traiter les données hors UE selon ses propres conditions. Les données rattachées à un identifiant de cookie y sont conservées pendant la durée réglée dans Google Analytics 4 par l’éditeur, puis effacées par Google ; les rapports agrégés ne contiennent pas cet identifiant.</p>
<h2>7. Prestataires et transferts</h2>
<ul><li><strong>Supabase</strong> : base de données, authentification et fonctions serveur.</li><li><strong>Netlify</strong> : hébergement du site et des fonctions.</li><li><strong>Resend</strong> : envoi des e-mails de réponse de l’assistance.</li><li><strong>Google (connexion avec Google)</strong> : seulement si tu choisis ce mode de connexion ; Google transmet ton nom et ton adresse e-mail à TITAN.</li><li><strong>Google Analytics 4</strong> : mesure facultative de visites après consentement distinct ; scripts Google chargés uniquement après acceptation, gestion des cookies via le bouton « Statistiques ».</li><li><strong>Google Play</strong> : paiement de TITAN+ dans l’application Android, à son ouverture ; TITAN ne voit jamais tes coordonnées bancaires. Un accès de test, offert ou manuel ne prouve pas un paiement.</li><li><strong>Fournisseur de paiement historique</strong> : traitement des événements et droits d’anciens abonnements ; aucun nouvel achat web n’est actuellement proposé.</li><li><strong>Google AdMob</strong> (application Android, version gratuite seulement) : affiche les publicités. Après ton consentement (formulaire européen de Google), Google peut utiliser l’identifiant publicitaire de ton téléphone et des données techniques (adresse IP, modèle d’appareil). TITAN n’envoie à Google ni ton journal, ni tes séances, ni ta position. Tu peux changer ton choix dans Profil &gt; Confidentialité, ou réinitialiser ou supprimer l’identifiant publicitaire dans les réglages Android.</li></ul>
<p>Certains prestataires peuvent traiter des données hors de l’Union européenne, dans le cadre de leurs engagements contractuels (clauses contractuelles types) et de leurs garanties de sécurité. Aucune donnée n’est transmise à des courtiers ou à des réseaux sociaux ; la seule régie publicitaire est Google AdMob, dans l’application Android, comme décrit ci-dessus.</p>
<p>Santé Connect et Garmin ne sont pas des prestataires de TITAN : ce sont des sources que tu choisis de connecter. TITAN y lit ce que tu as autorisé et ne leur envoie aucune donnée de ton journal. Si l’application Android te propose un fond de carte sous tes parcours (désactivé par défaut), l’activer transmet la zone affichée et ton adresse IP au fournisseur de cartes nommé à l’écran.</p>
<h2>8. Durées de conservation</h2>
<div class="pub-table" tabindex="0" role="region" aria-label="Tableau"><table><thead><tr><th>Donnée</th><th>Durée</th></tr></thead><tbody><tr><td>Compte, journal, progression</td><td>Tant que le compte existe. Suppression immédiate à ta demande.</td></tr><tr><td>Inscription jamais confirmée et vide</td><td>30 jours</td></tr><tr><td>Compte sans aucune activité (connexion, session, séance)</td><td>3 ans, sauf abonnement TITAN+ en cours</td></tr><tr><td>Messages de discussion</td><td>48 à 72 heures selon l’espace</td></tr><tr><td>Messages d’un suivi entre un coach et un sportif, check-ins, modèles de séance</td><td>Tant que le compte existe (500 messages au plus par suivi) ; un fil n’est plus lisible dès que le suivi prend fin</td></tr><tr><td>Statistiques d’usage</td><td>13 mois</td></tr><tr><td>Demandes d’assistance</td><td>6 mois ; 13 mois pour un paiement ou un remboursement ; 12 mois pour l’exercice de tes droits</td></tr><tr><td>Copie technique des événements de facturation (le paiement lui-même est chez Google Play ou le fournisseur historique)</td><td>13 mois ; le contenu de l’événement est vidé si tu supprimes ton compte</td></tr><tr><td>Journaux d’administration et d’audit, signaux anti-triche, signalements traités</td><td>12 mois</td></tr><tr><td>Décisions de modération et recours tranchés</td><td>24 mois ; si tu as supprimé ton compte, ton identité et le détail des signalements sont retirés (le motif écrit par l’équipe est conservé)</td></tr><tr><td>Demandes de vérification et tes réponses</td><td>12 mois</td></tr><tr><td>Retenues de récompenses réglées</td><td>3 mois</td></tr><tr><td>Parcours GPS, pas, lien et activités Garmin</td><td>Tant que le compte existe ; un parcours se supprime à l’unité, une source se déconnecte dans Profil</td></tr><tr><td>Lettres à toi-même, chapitres de vie, semaines tenues réclamées, monde TITAN LIVE</td><td>Tant que le compte existe ; un chapitre de vie se supprime à l’unité</td></tr><tr><td>Journal d’équilibre du jeu (montants, types d’opération)</td><td>Conservé sans identité ni texte après la suppression du compte</td></tr><tr><td>Journal des actions sociales (amitiés, blocages)</td><td>90 jours</td></tr><tr><td>Rapports techniques de synchronisation entre ton appareil et ton compte</td><td>90 jours</td></tr><tr><td>Sauvegardes techniques</td><td>Chez le fournisseur de base de données, selon son propre calendrier</td></tr></tbody></table></div>
<p>Ces durées sont appliquées automatiquement chaque jour. Quand tu supprimes ton compte, ce que tu as produit (séances, objectifs, messages, signalements de bug, demandes) est effacé et ce qui doit rester pour la sécurité ne garde plus ton identité. Détail et marche à suivre : <a href="/supprimer-mon-compte">Supprimer mon compte</a>.</p>
<h2>9. Stockage sur ton appareil</h2>
<p>TITAN conserve sur ton appareil : ta session, les séances en attente d’envoi (pour le mode hors ligne), tes brouillons, tes préférences, tes choix de confidentialité et, si tu actives le compteur de pas TITAN sur Android, ton historique de pas. Dans l’application Android, les annonces vocales (sortie GPS, séance en direct) passent par la synthèse vocale du téléphone, sans rien enregistrer ; l’image d’une séance à partager est créée sur ton téléphone et TITAN ne l’envoie nulle part, tu choisis l’application qui la reçoit ; un import d’historique en cours garde sur le téléphone les séances qui restent à envoyer. Le site et l’application Web n’utilisent aucun traceur publicitaire ; avec ton accord, Google Analytics dépose ses cookies de mesure (§6). Dans l’application Android gratuite, le kit Google AdMob enregistre ton choix de consentement et peut, selon ce choix, utiliser l’identifiant publicitaire du téléphone (§7). Effacer les données du site supprime cette copie locale, pas les données de ton compte ; les séances non envoyées seraient perdues.</p>
<h2>10. Tes droits</h2>
<ul><li><strong>Accès et portabilité</strong> : Profil &gt; Exporter toutes mes données (JSON) et Exporter mon journal (CSV).</li><li><strong>Rectification</strong> : modifie une séance, ton nom ou tes réglages dans l’application.</li><li><strong>Effacement</strong> : Profil &gt; Supprimer mon compte. Suppression définitive des données du compte.</li><li><strong>Opposition, limitation, retrait du consentement</strong> : dans les réglages (statistiques d’usage, bouton « Statistiques » pour Google Analytics, « Gérer mes choix publicitaires » dans l’application Android, déconnexion de Santé Connect ou de Garmin), ou en écrivant à <a href="mailto:titanteam.app@gmail.com">titanteam.app@gmail.com</a>.</li></ul>
<p>Nous répondons sous un mois. Tu peux introduire une réclamation auprès de la CNIL (cnil.fr).</p>
<h2>11. Mineurs</h2>
<p>TITAN est ouvert à partir de 13 ans. Les mineurs l’utilisent avec l’accord d’un adulte, représentant légal, en particulier pour les fonctions sociales. Les profils restent privés par défaut pour tous.</p>
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
  description: "Les règles d’utilisation de TITAN : service, santé, TITAN+, monnaie virtuelle, communauté, coaching, profil public, triche et responsabilités.",
  ref: "Version 9",
  updated: "16 novembre 2026",
  body: `${legalNav}
<div class="pub-note"><strong>Santé d’abord.</strong> TITAN est un journal et un outil de motivation. Ce n’est ni un dispositif médical, ni un diagnostic, ni un coaching professionnel. En cas de douleur, malaise, blessure, pathologie ou reprise après une longue pause, arrête-toi et consulte un professionnel de santé. Aucune récompense ne justifie de forcer.</div>
<h2>1. Objet</h2><p>Ces conditions encadrent l’utilisation de TITAN (le « Service »), sur le site, dans l’application Web installée et dans l’application Android. Créer un compte ou utiliser le Service vaut acceptation. Si tu les refuses, cesse d’utiliser le Service ; tu peux supprimer ton compte à tout moment.</p>
<h2>2. Le Service</h2><p>TITAN est un projet indépendant, en amélioration continue. L’équipe fait de son mieux pour le garder disponible et fiable, sans pouvoir garantir l’absence d’interruption ou d’erreur. Les séances enregistrées hors ligne restent sur l’appareil jusqu’à leur envoi.</p>
<h2>3. Accès gratuit</h2><p>Le journal, les analyses de base, la progression, quatre campagnes, la Communauté, l’Atelier et le coaching de trois sportifs sont gratuits, sans limite de durée. Le site et l’application Web n’affichent aucune publicité. L’application Android gratuite affiche des publicités Google AdMob (une bannière sur le QG, le Journal et Progrès, et parfois un écran après l’enregistrement d’une séance), jamais avant le formulaire de consentement de Google et jamais pendant une séance ; elle n’en affiche aucune avec TITAN+, y compris une place reçue d’un coach, ni avec les offres Coach.</p>
<h2>4. TITAN+</h2>
<p>4.1. <strong>Contenu</strong> : TITAN+ ajoute du confort, des analyses et de la personnalisation selon l’offre présentée dans l’application, et retire la publicité de l’application Android. Les quatre campagnes restent gratuites. L’accès temporaire à Aegis, Givre, Aurores et Obsidienne ne les rend pas exclusives : elles peuvent aussi être acquises avec les crédits d’activité. TITAN+ n’augmente jamais l’XP, les crédits, les plafonds ni aucun avantage de progression.</p>
<p>4.2. <strong>Paiement et prix</strong> : TITAN+ et les offres Coach s’achètent uniquement dans l’application Android native, avec Google Play Billing. Tant que l’achat n’y est pas ouvert, TITAN+ n’est pas encore en vente, les offres Coach non plus, et aucun paiement n’est possible : l’écran des offres l’indique. Une fois l’achat ouvert, le prix applicable, les taxes, la période facturée, les conditions d’une éventuelle offre et le renouvellement sont ceux affichés par Google Play avant ta confirmation. Aucun paiement n’est accepté sur le site pour un nouvel abonnement.</p>
<p>4.2 bis. <strong>Offres Coach</strong> : Coach comprend le coach et 5 sportifs avec TITAN+ inclus ; Coach Ultra comprend le coach et 15 sportifs. Les deux offres ont la même suite de fonctions ; seule la capacité diffère. Le nombre de sportifs suivis est celui de l’offre : 5 ou 15. Sans offre Coach, un compte peut suivre 3 sportifs, avec ou sans TITAN+, sans TITAN+ pour eux. Une place est active seulement tant que le sportif accepte le suivi et que l’offre du coach donne un droit actif. Un coach peut remplacer un sportif par un autre ; pour qu’une place ne soit pas louée à tour de rôle, le nombre de suivis acceptés sur 30 jours glissants est limité à deux fois sa capacité (6 au moins). À son retrait, le sportif retrouve ses droits personnels sans perdre son historique, ses pièces acquises ni ses récompenses.</p>
<p>4.3. <strong>Renouvellement et résiliation</strong> : pour une offre à renouvellement automatique, Google Play prélève le prix à chaque période annoncée jusqu’à la résiliation. Tu peux arrêter le renouvellement dans <a href="https://play.google.com/store/account/subscriptions">tes abonnements Google Play</a>, avec le compte Google utilisé lors de l’achat. Sauf remboursement ou révocation, l’accès reste actif jusqu’à la fin de la période payée. Désinstaller TITAN ou supprimer ton compte TITAN ne résilie pas l’abonnement : résilie-le aussi chez le prestataire de paiement. Consulte <a href="https://support.google.com/googleplay/answer/7018481?hl=fr">l’aide Google Play sur la résiliation</a>.</p>
<p>4.4. <strong>Remboursement et rétractation</strong> : la résiliation n’entraîne pas à elle seule un remboursement. Les conditions dépendent notamment de ton pays, du délai et de la nature de l’achat, sous réserve de tes droits légaux. Pour un achat Google Play, consulte <a href="https://support.google.com/googleplay/answer/2479637?hl=fr">la politique et la procédure de remboursement Google Play</a> et, dans l’EEE, <a href="https://support.google.com/googleplay/answer/15576634?hl=fr">les règles applicables aux contenus et services numériques</a>. Tu peux aussi contacter <a href="mailto:titanteam.app@gmail.com">titanteam.app@gmail.com</a> pour un accès non livré ou défectueux. Un remboursement accompagné d’une révocation retire le droit correspondant ; un autre droit actif reste applicable.</p>
<p>4.5. <strong>Activation et restauration</strong> : un achat Google Play n’active l’accès qu’après vérification par le serveur TITAN auprès de Google, pour le compte TITAN utilisé lors de l’achat. Un achat en attente n’accorde pas d’accès. En cas d’interruption ou de changement d’appareil, utilise « Restaurer mes achats » avec les mêmes comptes Google et TITAN. Les accès de test, offerts ou accordés manuellement sont distincts d’un achat vérifié ; un achat vérifié peut aussi comporter un essai gratuit. Un droit actif ne constitue donc ni une facture ni la preuve d’un montant encaissé. La durée d’un accès offert ou de test est celle qui t’a été annoncée.</p>
<p>4.6. <strong>Droits existants et fin d’accès</strong> : les intégrations du fournisseur de paiement historique restent conservées pour traiter les événements des anciens abonnements. Si tu en possèdes un, sa gestion et les demandes de remboursement passent par le prestataire indiqué sur ton reçu, ou par notre assistance. Cette conservation n’ouvre pas de nouvelle vente web. À la fin d’un droit TITAN+, ton journal, ta progression, tes insignes, tes crédits et les pièces acquises avec tes crédits restent à toi ; seul l’accès temporaire aux pièces non acquises prend fin. Les données et réglages conservés restent soumis à la <a href="/legal_privacy">politique de confidentialité</a>.</p>
<h2>5. Monnaie et biens virtuels</h2><p>Les crédits, niveaux, insignes, titres et pièces cosmétiques sont des éléments de jeu sans valeur monétaire. Ils ne s’achètent pas, ne se vendent pas, ne s’échangent pas et ne sont pas remboursables. Les crédits se gagnent uniquement par l’effort enregistré, dans les mêmes limites pour tous, abonnés compris : avec les séances et, lorsque l’application Android la propose, avec une semaine tenue (50 crédits, une fois par semaine, à réclamer).</p>
<h2>6. Équité et triche</h2><p>Il est interdit d’automatiser des séances, de saisir des séances fictives pour gagner des récompenses, d’exploiter une faille ou de modifier les données envoyées au serveur. Les récompenses sont calculées et plafonnées par le serveur ; une séance saisie plus de 30 jours après sa date entre au journal sans XP. En cas d’abus, l’équipe peut annuler des récompenses, limiter une fonction ou suspendre un compte.</p>
<h2>7. Communauté</h2><p>Les amitiés nécessitent l’accord des deux personnes. Tu es responsable de ce que tu publies (nom affiché, Moments, messages de guilde, intitulés de défis, nom et annonces d’un club, messages d’un suivi). Sont interdits : harcèlement, propos haineux ou discriminatoires, contenus illégaux, spam, informations personnelles de tiers. Tu peux bloquer une personne ; l’équipe peut retirer un contenu signalé, selon les règles de la communauté.</p>
<h2>8. Coaching</h2><p>Le partage avec un coach commence après le consentement explicite du sportif, sur le périmètre qu’il choisit, et se révoque à tout moment. Les messages d’un suivi ne sont lisibles que par le coach et le sportif liés (et par l’équipe pour un message signalé) ; un check-in hebdomadaire n’est transmis au coach que si le sportif le choisit. TITAN ne vérifie pas les qualifications des coachs. Les propositions de séances ne sont pas des avis médicaux ; le sportif reste seul juge de sa pratique.</p>
<h2>9. Profil public et images</h2><p>Le profil public est désactivé par défaut. En l’activant, tu acceptes que toute personne disposant du lien voie les blocs que tu as choisis. Tu peux le désactiver ou changer de lien à tout moment. Les images partagées sont créées sur ton appareil ; une fois envoyées ailleurs, elles échappent au contrôle de TITAN.</p>
<h2>10. Propriété intellectuelle</h2><p>L’univers, les textes, les illustrations, le code et les règles propres à TITAN appartiennent à l’équipe éditrice, sous réserve des composants tiers (licences libres citées dans les mentions légales). Ton journal t’appartient.</p>
<h2>11. Données personnelles</h2><p>Voir la <a href="/legal_privacy">politique de confidentialité</a>.</p>
<h2>12. Mineurs</h2><p>TITAN est ouvert à partir de 13 ans. Les mineurs l’utilisent avec l’accord d’un adulte, représentant légal, en particulier pour les fonctions sociales et TITAN+.</p>
<h2>13. Droit applicable</h2><p>Droit français, sous réserve des règles impératives protégeant les consommateurs. En cas de difficulté, écris d’abord à <a href="mailto:titanteam.app@gmail.com">titanteam.app@gmail.com</a> pour trouver une solution amiable ; tu peux aussi recourir à un médiateur de la consommation ou aux juridictions compétentes.</p>`,
});

/* ---------------------------------------------------------------- Legal notice */
doc({
  route: "/legal_mentions",
  file: "legal_mentions.html",
  title: "Mentions légales | TITAN",
  h1: "Mentions légales",
  eyebrow: "Confiance",
  description: "Éditeur, contact, hébergement, prestataires, propriété intellectuelle et crédits des composants libres de TITAN.",
  ref: "Informations éditeur",
  updated: "14 novembre 2026",
  body: `${legalNav}
<h2>Éditeur</h2><p>TITAN est un projet indépendant de suivi sportif et de progression, développé par deux amis d’université.</p><p><strong>Équipe éditrice et responsable de publication</strong> : équipe TITAN, représentée par Théo et son cofondateur.<br>Contact : <a href="mailto:titanteam.app@gmail.com">titanteam.app@gmail.com</a></p>
<p><strong>Statut</strong> : projet étudiant en version publique. L’adresse postale, le numéro d’immatriculation et, le cas échéant, les informations TVA seront publiés ici dès qu’une structure juridique portera le service.</p>
<h2>Hébergement et prestataires</h2><ul><li><strong>Site</strong> : Netlify, Inc., 101 2nd Street, San Francisco, CA 94105, États-Unis — netlify.com</li><li><strong>Comptes et données</strong> : Supabase, Inc. — supabase.com</li><li><strong>Paiement des abonnements (TITAN+, Coach, Coach Ultra)</strong> : Google Play, dans l’application Android uniquement. TITAN ne collecte pas les numéros de carte bancaire. Le fournisseur de paiement historique reste intégré pour les droits existants, sans nouvelle vente web. Voir les <a href="/legal_cgu">conditions d’utilisation</a> pour la gestion et les remboursements.</li><li><strong>Publicité, mesure d’audience et e-mails</strong> : Google AdMob (application Android gratuite), Google Analytics 4 (facultatif, après ton accord) et Resend (réponses de l’assistance). Le détail figure dans la politique de confidentialité, § 7.</li></ul>
<h2>Propriété intellectuelle</h2><p>Le code, les textes, les règles de progression, les mondes, gardiens et personnages, ainsi que l’identité visuelle de TITAN, sont protégés. Certains éléments de code, de texte et d’illustration ont été produits avec l’assistance d’outils d’intelligence artificielle ; l’équipe reste responsable de leur choix, de leur vérification et de leur publication. Toute reproduction non autorisée est interdite.</p>
<h2>Composants libres</h2><ul><li>Archivo — police sous licence SIL Open Font License, hébergée par TITAN.</li><li>supabase-js — licence MIT.</li><li>qrcode-generator (Kazuhiko Arase) — licence MIT.</li></ul>
<h2>Responsabilité</h2><p>TITAN est fourni en l’état. Les informations affichées sont des repères personnels, pas des avis médicaux ou professionnels. Chacun reste responsable de sa pratique sportive.</p>
<h2>Données personnelles</h2><p>Voir la <a href="/legal_privacy">politique de confidentialité</a>. Contact RGPD : <a href="mailto:titanteam.app@gmail.com">titanteam.app@gmail.com</a>.</p>`,
});

/* ---------------------------------------------------------------- Community rules and moderation (LEG47) */
doc({
  route: "/regles-communaute",
  file: "regles-communaute.html",
  title: "Règles de la communauté et modération | TITAN",
  h1: "Règles de la communauté et modération",
  eyebrow: "Confiance",
  ref: "Version 2",
  updated: "14 novembre 2026",
  description: "Ce qui est interdit dans la communauté TITAN, comment signaler, ce que l’équipe peut décider, ce qui est automatique ou non, et comment contester une décision.",
  body: `${legalNav}
<div class="pub-note"><strong>En une phrase.</strong> La communauté TITAN est faite pour s’encourager à bouger. Une personne de l’équipe décide de toute sanction, la motive, et tu peux la contester.</div>
<h2>Ce qui est interdit</h2>
<ul><li>Le harcèlement, les menaces et les propos haineux ou discriminatoires.</li><li>Les contenus illégaux.</li><li>L’usurpation d’identité : se faire passer pour une autre personne ou pour l’équipe.</li><li>La fraude et la triche : séances fictives, automatisation, exploitation d’une faille (voir les <a href="/legal_cgu">conditions d’utilisation</a>, article 6).</li><li>Le spam.</li><li>Les informations personnelles de tiers.</li></ul>
<p>Cela vaut pour ce que tu écris ou choisis d’afficher : nom affiché, Moments, messages de guilde et de discussion, intitulés de défis, nom et annonces d’un club, messages entre un coach et un sportif. Tu peux à tout moment bloquer une personne.</p>
<h2>Signaler un contenu ou un comportement</h2>
<p>Dans un club, les boutons « Signaler ce club » et « Signaler cette annonce » envoient ton signalement à l’équipe ; dans un suivi, un message se signale depuis la conversation. Pour tout le reste, écris à <a href="mailto:${SUPPORT}">${SUPPORT}</a> en indiquant où tu as vu le problème (espace, date, nom affiché). Une personne de l’équipe lit chaque signalement. TITAN est un projet indépendant : nous ne garantissons pas de délai de réponse, et un signalement abusif peut lui-même être sanctionné.</p>
<h2>Ce que l’équipe peut décider</h2>
${table(["Mesure", "Ce qu’elle change", "Ce qu’elle ne change pas"], [
  ["Retirer un message", "Un message de discussion signalé n’est plus visible des autres. Un nom affiché ou un autre contenu contraire aux règles est traité au cas par cas, par écrit.", "Ton compte."],
  ["Demander une vérification", "Une alerte s’affiche dans TITAN ; tu lis la demande et tu réponds une fois depuis la page <a href=\"/recours\">Recours</a>.", "Rien d’automatique : répondre ne déclenche aucune sanction."],
  ["Mettre une séance à l’écart", "La séance reste dans ton journal mais ne compte plus dans les classements ni les récompenses compétitives.", "Les XP et crédits déjà acquis."],
  ["Suspendre le compte", "Tu ne peux plus écrire dans TITAN : enregistrer une séance ou un objectif, acquérir une pièce de l’Atelier, ajouter des amis ou écrire dans la communauté, modifier ton profil, ni envoyer une demande d’assistance depuis l’application (écris alors par e-mail). Aucune durée n’est fixée d’avance : la suspension dure jusqu’à ce que l’équipe la lève, par exemple après un recours accepté.", "Ta progression et tes données, qui ne sont pas supprimées. Tu peux toujours supprimer ton compte, ou demander tes données par e-mail."],
  ["Bloquer le compte", "Réservé aux cas graves, décidé par une personne de l’équipe avec l’outil d’administration. Un recours contre un blocage est examiné à part par l’équipe.", "Tes droits sur tes données."],
])}
<h2>Ce qui est automatique, et ce qui ne l’est pas</h2>
<p>Un calcul automatique repère des séances inhabituelles (par exemple une vitesse impossible, deux séances qui se chevauchent ou une fréquence hors norme). Il sert à <strong>classer les comptes à examiner</strong> et à expliquer pourquoi, point par point, à la personne qui les examine. Il peut aussi <strong>retenir environ 24 heures</strong> les XP et crédits d’une séance à risque élevé, ou d’une séance qu’il ne peut pas évaluer (par exemple une séance saisie longtemps après sa date) : sans décision de l’équipe, ils sont crédités ensuite, et rien de ce qui est déjà acquis n’est jamais repris. Si ton compte est suspendu, les retenues restent en attente tant que la suspension dure. Ce calcul peut se tromper.</p>
<p>Il ne suspend ni ne bloque aucun compte. Toute suspension, tout blocage et toute mise à l’écart d’une séance sont décidés par une personne, avec un motif écrit, enregistrés avec son auteur et annulables.</p>
<h2>Contester une décision</h2>
<p>Si une séance est mise à l’écart ou si ton compte est suspendu, ouvre la page <a href="/recours">Recours</a> (connecté) et explique ce qui s’est passé, entre 10 et 500 caractères. Une personne de l’équipe relit ta demande et te répond avec une note que tu peux lire. Tu peux avoir cinq recours en attente ; après un refus, un nouveau recours sur le même objet est possible au bout de 7 jours. Accepter un recours lève la mise à l’écart ou la suspension.</p>
<h2>Combien de temps c’est conservé</h2>
<p>Les décisions de modération et les recours tranchés sont conservés 24 mois (une suspension encore en vigueur, ou une décision non annulée, est conservée tant qu’elle compte) ; les demandes de vérification et tes réponses, 12 mois. Sans ton identité si tu as supprimé ton compte (voir <a href="/legal_privacy">confidentialité</a> et <a href="/supprimer-mon-compte">suppression du compte</a>).</p>
<h2>Autres recours</h2>
<p>Tu peux aussi écrire à <a href="mailto:${SUPPORT}">${SUPPORT}</a>, ou introduire une réclamation auprès de la CNIL (cnil.fr) pour tes données personnelles.</p>`,
});

/* ---------------------------------------------------------------- Account deletion (public, required by Google Play) */
doc({
  route: "/supprimer-mon-compte",
  file: "supprimer-mon-compte.html",
  title: "Supprimer mon compte et mes données | TITAN",
  h1: "Supprimer mon compte TITAN",
  eyebrow: "Confiance",
  ref: "Version 3",
  updated: "16 novembre 2026",
  description: "Comment supprimer ton compte TITAN et tes données depuis l’application ou par e-mail, ce qui est effacé tout de suite, ce qui est conservé et combien de temps.",
  body: `${legalNav}
<h2>Depuis l’application ou le site</h2>
<ol><li>Connecte-toi à TITAN (application Android ou <a href="/login">titan-app.fr</a>).</li><li>Ouvre <strong>Profil</strong>, puis la section <strong>Compte et données</strong>.</li><li>Si tu veux garder une copie, choisis d’abord <strong>Exporter toutes mes données</strong>.</li><li>Choisis <strong>Supprimer mon compte</strong>, écris <strong>SUPPRIMER</strong> pour confirmer, puis valide.</li></ol>
<p>La suppression est immédiate et définitive : elle ne peut pas être annulée.</p>
<h2>Si tu ne peux plus te connecter</h2>
<p>Écris à <a href="mailto:${SUPPORT}">${SUPPORT}</a> <strong>depuis l’adresse e-mail du compte</strong>, avec l’objet « Suppression de compte ». Nous supprimons le compte et te confirmons par e-mail, au plus tard sous un mois.</p>
<h2>Si tu es abonné à TITAN+</h2>
<p>Supprimer le compte ne résilie pas l’abonnement. Si tu t’es abonné dans l’application Android, résilie-le d’abord dans <a href="https://play.google.com/store/account/subscriptions" rel="noopener">tes abonnements Google Play</a> pour ne plus être facturé. Pour un abonnement plus ancien, souscrit sur le site, résilie-le auprès du prestataire indiqué sur ton reçu. Si tu es coach, les places TITAN+ de tes sportifs prennent fin avec ton compte.</p>
<h2>Ce qui est effacé tout de suite</h2>
<ul><li>Ton profil, tes séances, tes objectifs, ta progression, tes pièces de l’Atelier et ta collection.</li><li>Tes lettres à toi-même, tes chapitres de vie, tes semaines tenues réclamées et ton monde TITAN LIVE (ressources, bâtiments, trouvailles).</li><li>Tes parcours GPS, tes pas enregistrés sur le serveur, tes liens Santé Connect et Garmin (les jetons Garmin sont effacés).</li><li>Tes amitiés, tes liens d’invitation, tes défis, tes cordées et tes titres de route, tes messages, tes liens de coaching et ton appartenance à une guilde (si tu en étais le chef, elle passe au membre le plus ancien).</li><li>Tes demandes d’assistance, tes recours, tes signalements de bug et tes messages de contact.</li><li>Les copies techniques de tes messages dans le journal d’audit.</li><li>Les données de ton compte conservées sur ton appareil.</li></ul>
<h2>Ce qui est conservé, sans ton identité, et combien de temps</h2>
${table(["Donnée", "Ce qui reste", "Durée"], [
  ["Statistiques d’usage", "événements anonymes", "13 mois"],
  ["Copie technique des événements de facturation", "identifiants techniques ; le contenu de l’événement est vidé quand le compte est supprimé", "13 mois"],
  ["Décisions de modération", "type et date de la décision et motif écrit par l’administrateur, sans ton identité", "24 mois"],
  ["Journaux d’administration, signaux anti-triche, signalements traités", "traces sans identité", "12 mois"],
  ["Journal d’équilibre du jeu (montants, types d’opération)", "sans identité ni texte", "conservé : garantit l’équité du jeu pour les autres joueurs"],
])}
<p>Ces durées sont appliquées automatiquement chaque jour. Les sauvegardes techniques du fournisseur de base de données expirent selon son propre calendrier. Le paiement d’un abonnement relève de Google Play (ou, pour un ancien abonnement, du prestataire indiqué sur ton reçu), qui conserve ses données selon ses propres obligations légales. Dans l’application Android gratuite, ton choix publicitaire et l’identifiant publicitaire relèvent de Google et des réglages Android : la suppression du compte TITAN ne les efface pas.</p>
<h2>Tes autres droits</h2>
<p>Accès, export, rectification, opposition : voir la <a href="/legal_privacy">politique de confidentialité</a>. Tu peux aussi introduire une réclamation auprès de la CNIL (cnil.fr).</p>`,
});

/* ---------------------------------------------------------------- Trust centre */
doc({
  route: "/legal_hub",
  file: "legal_hub.html",
  title: "Centre de confiance : confidentialité, équité, sécurité | TITAN",
  h1: "Centre de confiance",
  eyebrow: "Confiance",
  description: "Les engagements de TITAN : privé par défaut, aucune progression vendue, aucune publicité sur le site, données exportables et supprimables.",
  body: `${legalNav}
<p>Les <a href="/legal_cgu">conditions d’utilisation</a> expliquent Google Play, le renouvellement, la résiliation, les remboursements et la différence entre un achat vérifié et un accès offert ou de test.</p>
<h2>Nos engagements</h2>
<div class="pub-grid cols-2"><article class="pub-card pub-feature"><svg class="t-icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></svg><h3>Privé par défaut</h3><p>Journal privé, amis sur demande acceptée, profil public désactivé, coach seulement avec ton accord.</p></article><a href="/niveaux-et-xp" class="pub-card pub-feature"><svg class="t-icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m8 12 3 3 5-6"/></svg><h3>Aucune progression vendue</h3><p>Mêmes formules et mêmes plafonds pour tous. TITAN+ n’achète ni XP, ni crédits, ni avance.</p></a><article class="pub-card pub-feature"><svg class="t-icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><h3>Publicité encadrée</h3><p>Aucune publicité sur le site ni dans l’application Web. Dans l’application Android gratuite, Google AdMob, jamais avant le formulaire de consentement de Google ni pendant une séance ; aucune avec TITAN+ ou les offres Coach. Aucune revente de données.</p></article><article class="pub-card pub-feature"><svg class="t-icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg><h3>Tes données, à toi</h3><p>Export JSON et CSV, suppression du compte depuis Profil.</p></article></div>
<h2>Documents</h2><ul><li><a href="/legal_privacy">Politique de confidentialité</a> — données, finalités, durées, droits.</li><li><a href="/legal_cgu">Conditions d’utilisation</a> — règles, TITAN+, équité, communauté.</li><li><a href="/legal_mentions">Mentions légales</a> — éditeur, hébergement, crédits.</li><li><a href="/regles-communaute">Règles de la communauté</a> — ce qui est interdit, comment signaler, ce que l’équipe peut faire, comment contester.</li><li><a href="/supprimer-mon-compte">Supprimer mon compte</a> — comment, et ce qui est effacé ou conservé.</li></ul>
<h2>Nous écrire</h2><p>Question, demande RGPD, signalement d’un contenu ou d’une faille : <a href="mailto:titanteam.app@gmail.com">titanteam.app@gmail.com</a>.</p>`,
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
  ["Comment arrêter TITAN+ ?", "L’abonnement se gère dans Google Play, avec le compte Google utilisé lors de l’achat : arrête le renouvellement dans tes abonnements Google Play ; l’accès reste actif jusqu’à la fin de la période payée. Tant que l’achat n’est pas ouvert dans l’application Android, TITAN+ n’est pas encore en vente et il n’y a rien à arrêter."],
  ["Quelqu’un me harcèle.", "Bloque la personne depuis Communauté (menu de l’ami), puis écris-nous avec le nom affiché et ce qui s’est passé."],
];
const help = faq(helpFaq, "Les réponses rapides");
// The help centre (categories, support form wired by js/app/assistance.js) is written in tools/content/service-main.tpl:
// this generator only wraps it in the shared header, footer, metadata and FAQ schema, so a rebuild never reverts it.
writeFileSync(
  "service.html",
  page({
    route: "/service",
    title: "Assistance TITAN : aide, connexion et contact — application de sport",
    description: "Assistance de TITAN, l’application de suivi sportif : connexion, séance en attente, XP, TITAN+, données, signalement. Trouve ta réponse ou écris à l’équipe.",
    image: "valley",
    schema: [help.schema],
    styles: ["/css/assistance.css?v=302.0"],
    scripts: ["/js/app/analytics.js?v=300.5", "/js/app/assistance.js?v=300.2"],
    body: readFileSync(new URL("./content/service-main.tpl", import.meta.url), "utf8"),
  }),
);

/* ---------------------------------------------------------------- Changelog */
const releases = [
  ["1.1", "Communauté, import d’activités et suivi", "3 novembre 2026", [
    "Séance : import d’un fichier GPX analysé sur ton appareil (distance, temps en mouvement, pauses, dénivelé, temps par kilomètre) ; connexion Garmin facultative, proposée dans Profil seulement lorsqu’elle est ouverte pour ton compte.",
    "Quêtes facultatives de la semaine et du mois, quête commune, saisons de 28 jours : un souvenir à la clé, jamais d’XP ni de crédits.",
    "Communauté : clubs privés, TITAN Duo sur quatorze jours, liens d’invitation à un défi, classement entre amis facultatif.",
    "Coaching : messages du suivi, modèles de séance et check-in hebdomadaire partagé seulement si le sportif le choisit.",
    "Longues sorties reconnues par des souvenirs dans le profil, sans XP en plus.",
    "Mesure de fréquentation Google Analytics, facultative et seulement après ton accord ; les conditions d’utilisation et la politique de confidentialité ont été mises à jour.",
  ]],
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
  ["88", "Catalogue multisport", "30 juillet 2026", ["260 sports avec recherche par nom, alias et famille."]],
];
doc({
  route: "/changelog",
  file: "changelog.html",
  title: "Nouveautés de TITAN : les versions de l’application",
  h1: "Nouveautés",
  eyebrow: "Journal des versions",
  description: "Les évolutions importantes de TITAN, expliquées simplement : version 1.1 de novembre 2026, version 300 Ascension et versions précédentes.",
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
const FAMILY_GUIDES = {
  endurance: [["/journal-course-a-pied", "Voir le journal de course à pied"], ["/suivi-velo", "Voir le journal vélo, gravel et VTT"]],
  force: [["/carnet-musculation", "Voir le carnet de musculation"]],
  technique: [["/suivi-escalade", "Comprendre les cotations d’escalade"]],
};
writeFileSync(
  "sports.html",
  page({
    route: "/sports",
    title: `Les ${rows.length} sports suivis par TITAN, famille par famille`,
    description: `Course, musculation, escalade, natation, raquette, combat, équipe, glisse : les ${rows.length} sports que TITAN journalise, avec leurs mesures.`,
    image: "archipelago",
    body: `<header class="pub-page-head"><div class="pub-wrap"><p class="pub-eyebrow">Catalogue</p><h1>${rows.length} sports.<br>Chacun ses mesures.</h1><p class="pub-lead">TITAN adapte la saisie à ta discipline et calcule l’effort de la même façon pour tous : la durée et ton ressenti.</p><a class="pub-link" href="/suivi-sportif">Découvrir le suivi multisport ${icon("arrow")}</a></div></header>
      ${[...byFamily.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([fam, list]) => {
          const guides = FAMILY_GUIDES[fam] || [];
          return `<section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">${icon(SP.FAMILY_ICON[fam] || "bolt")} ${list.length} sports</p><h2>${esc(SP.FAMILY_LABEL[fam] || fam)}</h2><p class="pub-lead">${FAMILY_TEXT[fam] || ""}</p></div>
            <p class="pub-prose" style="max-width:none">${list.sort((a, b) => a.localeCompare(b, "fr")).map(esc).join(" · ")}</p>
            ${guides.map(([href, label]) => `<a class="pub-link" href="${href}" style="margin-top:16px">${label} ${icon("arrow")}</a>`).join("")}</div></section>`;
        })
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
  description: "Clubs, salles, associations et coachs : ce que TITAN peut apporter à vos sportifs, et nos conditions (aucune donnée revendue, aucune publicité sur le site).",
  image: "archipelago",
  body: `<p class="pub-lead">TITAN aide les sportifs à pratiquer régulièrement et à comprendre leurs progrès. Si vous accompagnez des sportifs, parlons-en.</p>
<h2>Ce qui existe déjà</h2><ul><li><strong>Espace coach</strong> : suivi consenti, périmètre choisi par le sportif, propositions de séances. Trois sportifs suivis sans offre Coach ; cinq avec Coach et quinze avec Coach Ultra, TITAN+ inclus pour eux. <a href="/pour-les-coachs">Voir le fonctionnement</a>.</li><li><strong>Guildes</strong> : un objectif d’effort hebdomadaire commun, pour un club ou une section.</li><li><strong>Expéditions</strong> : des saisons collectives où chaque minute d’effort compte pareil, quel que soit le sport.</li></ul>
<h2>Nos conditions</h2><ul><li>Aucune donnée individuelle n’est partagée avec un partenaire sans le consentement explicite de la personne.</li><li>Aucune revente de données, aucune publicité sur le site.</li><li>Pas de progression achetable, y compris pour un partenaire.</li></ul>
<h2>Nous écrire</h2><p><a href="mailto:${SUPPORT}?subject=Partenariat">${SUPPORT}</a> — présentez votre structure et ce que vous aimeriez construire.</p>`,
});

/* ---------------------------------------------------------------- Sport-specific guides */
const SPORTS_PARENT = ["/sports", "Les sports"];
const FEATURES_PARENT = ["/fonctionnalites", "Fonctionnalités"];

// Guides link to their neighbours from the content itself, so none depends on the footer alone to be found.
const GUIDES = {
  "/journal-course-a-pied": ["run", "Course à pied", "Allure, records et import GPX."],
  "/suivi-velo": ["bike", "Vélo, gravel et VTT", "Distance, dénivelé, GPX et longues sorties."],
  "/carnet-musculation": ["weight", "Musculation", "Séries, charges, routines et records."],
  "/suivi-escalade": ["mountain", "Escalade", "Cotations de bloc et carnet de séances."],
  "/suivi-sportif": ["layers", "Suivi multisport", "Un seul journal pour tous tes sports."],
  "/journal-entrainement": ["journal", "Journal d’entraînement", "Retrouver, corriger, exporter."],
  "/progression-sportive": ["chart", "Progression sportive", "Des comparaisons justes, avec leurs sources."],
  "/motivation-sport": ["calendar", "Motivation", "Une cadence choisie, des pauses sans pénalité."],
  "/defis-sportifs": ["flag", "Défis et quêtes", "Entre amis, sans mise ni pression."],
  "/aventures-sportives": ["compass", "L’aventure", "Quatre mondes que ton sport rallume."],
  "/niveaux-et-xp": ["crown", "Niveaux et XP", "Les règles de la progression."],
  "/comprendre-mes-donnees": ["target", "Comprendre mes données", "Mesures, records et limites."],
};
const relatedGuides = (routes) => `<section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">À lire aussi</p><h2>Guides voisins</h2></div>${cards(routes.map((r) => [...GUIDES[r], r]), 4)}</div></section>`;

function seoGuide({ route, file, title, h1, eyebrow, description, image, lead, sections, faqItems, parent, related = [] }) {
  const f = faq(faqItems, "Questions fréquentes");
  const breadcrumb = breadcrumbTrail(route, eyebrow, parent);
  writeFileSync(
    file,
    page({
      route,
      title,
      description,
      image,
      schema: [f.schema],
      breadcrumb,
      body: `<header class="pub-page-head"><div class="pub-wrap">${breadcrumb.html}<p class="pub-eyebrow">${eyebrow}</p><h1>${h1}</h1><p class="pub-lead">${lead}</p><div class="pub-cta"><a class="asc-btn asc-btn-primary" href="/onboarding">Commencer ${icon("arrow")}</a><a class="asc-btn asc-btn-secondary" href="/fonctionnalites">Toutes les fonctionnalités</a></div></div></header>
        <div class="pub-wrap"><article class="pub-article">${sections.map(([t, body]) => `<section><h2>${t}</h2><div class="pub-prose">${body}</div></section>`).join("")}</article></div>${related.length ? relatedGuides(related) : ""}${f.html}${finalCta(image === "valley" ? "archipelago" : "valley")}`,
    }),
  );
}

seoGuide({
  route: "/journal-course-a-pied",
  parent: SPORTS_PARENT,
  file: "journal-course-a-pied.html",
  title: "Journal de course à pied : allure, records et progression | TITAN",
  h1: "Un journal de course<br>qui comprend tes sorties",
  eyebrow: "Course à pied",
  description: "Note tes sorties en distance et durée à la seconde, importe un GPX, suis ton allure sur des sorties comparables et tes records sur 1, 5, 10, 21,1 et 42,2 km.",
  image: "valley",
  lead: "Distance, durée à la seconde, allure, dénivelé : enregistre ta sortie en quelques secondes et vois si tu progresses vraiment.",
  sections: [
    ["Ce que tu enregistres", `<p>La distance et la durée (heures, minutes, secondes), ton ressenti de 1 à 10, et si tu veux une note. Un fichier GPX de ta montre remplit la distance, le temps en mouvement et le dénivelé ; le tracé du fichier importé n’est pas conservé.</p>`],
    ["Des records honnêtes", `<p>Tes meilleurs temps sur 1, 5, 10, 21,1 et 42,2 km comparent des sorties entières dont la distance est à ±1 % de la référence. Chaque record garde sa séance source et l’historique de ses améliorations.</p>`],
    ["Ton allure, sur des sorties comparables", `<p>Le récap de la semaine compare ton allure sur des sorties de longueur proche, pour ne pas mélanger un fractionné et une sortie longue : « 5:02 /km contre 5:14 il y a deux mois ».</p>`],
    ["Importer un GPX", `<p>Le fichier est analysé sur ton appareil : distance, temps en mouvement, pauses, dénivelé positif et négatif et, quand l’enregistrement est complet, temps par kilomètre. Un GPX reste une importation, pas une preuve d’effort : tu choisis le sport et tu valides la séance avant qu’elle rejoigne ton journal.</p>`],
    ["Progresser sans se brûler", `<p>Ton XP vient de l’effort : les 90 premières minutes comptent pleinement, les 90 suivantes à moitié. Une semaine régulière vaut mieux qu’un dimanche démesuré, et la maîtrise de la course demande des heures et des semaines de pratique.</p>`],
  ],
  faqItems: [
    ["Faut-il une montre GPS ?", "Non. La distance et la durée suffisent. Le GPX est un plus si tu en as un."],
    ["Les records sont-ils des segments de ma trace ?", "Non : ils comparent des sorties entières de distance proche. C’est moins flatteur, mais plus juste."],
    ["Le journal de course est-il gratuit ?", "Oui. Le journal, les records et le récap de la semaine sont gratuits, sans publicité sur le site."],
  ],
  related: ["/suivi-velo", "/progression-sportive", "/journal-entrainement", "/motivation-sport"],
});
seoGuide({
  route: "/carnet-musculation",
  parent: SPORTS_PARENT,
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
    ["Des routines pour ne pas tout ressaisir", `<p>Une routine garde tes exercices, tes séries, tes charges et tes répétitions. Recharge-la, ajuste ce qui a changé, enregistre. Cinq routines sont gratuites ; au-delà, celles que tu as déjà restent utilisables, et TITAN+ permet d’en garder jusqu’à vingt.</p>`],
    ["L’effort, pas le tonnage", `<p>L’XP vient de la durée et de ton ressenti, comme pour tous les sports : soulever plus lourd ne rapporte pas plus de points qu’une séance d’endurance de même effort.</p>`],
  ],
  faqItems: [
    ["Puis-je suivre des exercices au poids du corps ?", "Oui : les répétitions sont suivies sans inventer de charge."],
    ["Que se passe-t-il si je corrige une série ?", "Les records et analyses sont recalculés ; l’XP de la séance ne change pas."],
    ["Le carnet de musculation est-il gratuit ?", "Oui. Les séries, les records, la progression par exercice et cinq routines sont gratuits. TITAN+ porte le nombre de routines à vingt."],
  ],
  related: ["/progression-sportive", "/journal-entrainement", "/suivi-sportif", "/comprendre-mes-donnees"],
});
seoGuide({
  route: "/suivi-escalade",
  parent: SPORTS_PARENT,
  file: "suivi-escalade.html",
  title: "Cotations de bloc en escalade : Fontainebleau et V-scale | TITAN",
  h1: "Cotations de bloc en escalade :<br>les lire, puis suivre tes séances",
  eyebrow: "Escalade · bloc et voie",
  description: "L’échelle des cotations de bloc en escalade : Fontainebleau, V-scale, repères de correspondance, bloc ou voie, et un carnet gratuit pour tes séances.",
  image: "aurora",
  lead: "Que signifie 6A+ ? Peut-on comparer un bloc et une voie ? Des repères pour lire une cotation, puis noter tes séances sans perdre leur contexte.",
  sections: [
    ["Lire une cotation de bloc", `<p>En <strong>Fontainebleau</strong> (Font ou Fb), la difficulté augmente avec le chiffre, puis la lettre et le signe + : <strong>6A, 6A+, 6B, 6B+, 6C, 6C+, 7A</strong>. Cette suite illustre l’ordre, pas toute l’échelle. En <strong>V-scale</strong>, on rencontre par exemple V0, V1, V2, puis des nombres croissants.</p>
      ${table(["Système", "Exemple", "Ce qu’il faut garder"], [
        ["Fontainebleau · bloc", "6A+", "Le système Font/Fb et la cotation complète"],
        ["V-scale · bloc", "V3", "Le système V, sans conversion automatique"],
        ["Française · voie", "6a+", "La discipline voie et le mode d’assurage"],
        ["Couleur de salle", "Bleu", "Le nom de la salle et sa propre légende"],
      ])}
      <p>La notation habituelle distingue les majuscules du bloc (6A) et les minuscules de la voie (6a). Les couleurs dépendent de la salle ; demande sa légende. Les cotations restent des appréciations : le style et l’ouverture changent le ressenti.</p>
      <p class="pub-fine">Repères vérifiés le 2 novembre 2026 : <a href="https://thebmc.co.uk/en/indoor-climbing-grades-explained">British Mountaineering Council — comprendre les cotations en salle (en anglais)</a>.</p>`],
    ["L’échelle Fontainebleau et ses repères en V-scale", `<p>Du plus facile au plus difficile. En dessous de 6, la cotation Fontainebleau s’écrit le plus souvent sans lettre (4, 5, 5+) ; à partir de 6, chaque chiffre se divise en A, B et C, chacun avec ou sans +.</p>
      ${table(["Fontainebleau", "Repère en V-scale"], [
        ["4", "V0"],
        ["5", "V1"],
        ["5+", "V2"],
        ["6A · 6A+", "V3"],
        ["6B · 6B+", "V4"],
        ["6C · 6C+", "V5"],
        ["7A", "V6"],
        ["7A+", "V7"],
        ["7B · 7B+", "V8"],
        ["7C", "V9"],
        ["7C+", "V10"],
        ["8A", "V11"],
      ])}
      <p>Ce sont les repères que l’on retrouve le plus souvent dans les tableaux publiés. Ils restent <strong>indicatifs</strong> : d’une source à l’autre, la correspondance bouge d’un demi-degré, surtout dans les premiers niveaux, et une même cotation ne se grimpe pas pareil d’un site ou d’une salle à l’autre. Au-delà de 8A, les deux échelles continuent de la même façon.</p>`],
    ["Équivalences : garder le système d’origine", `<p>Un tableau Font/V peut aider à se repérer, mais une conversion reste approximative. Une cotation de bloc ne décrit pas la même pratique qu’une cotation de voie. TITAN conserve donc <strong>la cotation dans son système d’origine</strong> et ne transforme pas un 6A en V3 ni en 6a.</p><p>Tu changes de salle ? Garde le lieu et le style dans tes notes plutôt que d’assimiler deux couleurs identiques. Tu passes dehors ? Le niveau réussi en salle ne garantit pas la réussite sur le rocher.</p><p class="pub-fine">Pour approfondir : <a href="https://www.mammut.com/fr/fr/stories-guides/bouldering-difficulty-scales-explained-climbers-guide">Mammut — échelles de bloc et limites des conversions</a> ; <a href="https://services.thebmc.co.uk/media/files/Skills/Leaflets/New%20Rock%20Climbers.pdf">BMC — débuter sur le rocher (PDF, en anglais)</a>.</p>`],
    ["Un exemple de carnet, sans fausse progression", `<p><strong>Exemple fictif de lecture du carnet</strong> : mardi, tu notes une meilleure réussite en 6A Font, 8 essais et 3 réussites. Jeudi, tu notes 6A+ Font, 12 essais et 4 réussites. Tu as réussi une cotation supérieure dans ce système, mais ces deux séances seules ne prouvent pas une progression durable.</p><p>Ajoute dans tes notes ce que les nombres oublient : même salle ou même secteur, dalle ou dévers, nouveau bloc ou passage déjà travaillé. Un essai non réussi garde son intérêt dans le carnet ; ne le saisis pas comme meilleure réussite. Le prochain repère peut être de refaire un passage avec moins d’essais, sans viser une cotation plus haute.</p>`],
    ["Ce que tu notes dans TITAN", `<p>La discipline (bloc, voie), le lieu, le mode d’assurage, le système de cotation, ta meilleure réussite, et si tu veux tes essais et réussites. La durée et le ressenti alimentent l’effort. Une cotation inconnue reste dans la séance sans recevoir de valeur inventée.</p><p>À la saisie, TITAN reconnaît en Fontainebleau un chiffre, une lettre à partir de 6 et un + éventuel (5+, 6A, 6B+, 7A) ; en V-scale, VB puis V0, V1, V2 et la suite ; en voie, la cotation française en minuscules (6a+). Une cotation écrite autrement t’est signalée avant l’enregistrement, pour que tu la corriges plutôt que de la laisser deviner.</p><p>Le récap montre l’évolution de ta meilleure cotation sur la période, par système, discipline et lieu, avec les séances sources. <a href="/comprendre-mes-donnees">Comprendre les mesures et leurs limites</a> ou <a href="/journal-entrainement">découvrir le journal, les corrections et l’export</a>.</p>`],
  ],
  faqItems: [
    ["Que veut dire 6A+ en bloc ?", "Dans le système Fontainebleau, 6A+ se situe entre 6A et 6B. Garde le nom du système avec la cotation pour éviter de la confondre avec une voie."],
    ["Une couleur correspond-elle toujours à la même cotation ?", "Non. Consulte la légende de ta salle et garde le lieu dans ton carnet. TITAN ne convertit pas une couleur en cotation."],
    ["Puis-je comparer un bloc 6A et une voie 6a ?", "Pas comme deux performances équivalentes. TITAN sépare la discipline et le système de cotation pour garder le contexte."],
    ["TITAN peut-il servir de carnet de croix ?", "En partie. TITAN garde, séance par séance, ta meilleure cotation réussie, tes essais et tes réussites, par système, discipline et lieu. Il ne tient pas une liste bloc par bloc ou voie par voie : écris le nom d’un passage dans la note de la séance si tu veux le retrouver."],
    ["Le carnet d’escalade est-il gratuit ?", "Oui. Le journal et ses exports sont gratuits et sans publicité sur le web. Tu peux essayer sans compte ; les séances restent alors sur cet appareil."],
  ],
  related: ["/progression-sportive", "/suivi-sportif", "/carnet-musculation", "/defis-sportifs"],
});
seoGuide({
  route: "/suivi-sportif",
  parent: SPORTS_PARENT,
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
    ["Cinq familles, des mesures qui ont du sens", `<p><strong>Endurance</strong> : distance, durée à la seconde, allure ou vitesse, dénivelé. <strong>Force</strong> : exercices, séries, charges, répétitions. <strong>Technique</strong> : cotations, essais et réussites. <strong>Jeu et combat</strong> : durée, matchs, sets ou rounds. <strong>Mobilité</strong> : durée et ressenti. Une mesure que tu ne donnes pas reste vide : TITAN n’invente rien pour remplir un graphique.</p>`],
    ["Une progression par sport, et une pour toi", `<p>Chaque sport a sa maîtrise : dix paliers qui demandent des heures et des semaines de pratique. Ton rang, lui, avance avec toutes tes séances, selon la même formule quel que soit le sport. Records, objectifs et récap de la semaine restent rangés sport par sport. <a href="/niveaux-et-xp">Les règles de progression</a>.</p>`],
  ],
  faqItems: [
    ["Mon sport n’est pas dans la liste.", "Écris-nous : le catalogue s’enrichit régulièrement. En attendant, choisis le sport le plus proche."],
    ["Puis-je enregistrer deux sports le même jour ?", "Oui. Chaque séance garde son sport et ses mesures. Pour l’aventure, plusieurs séances le même jour comptent pour un seul jour actif."],
    ["Le suivi multisport est-il gratuit ?", "Oui. Le journal, les 260 sports, les records, les objectifs et le récap de la semaine sont gratuits, sans limite de durée."],
  ],
  related: ["/journal-course-a-pied", "/suivi-velo", "/carnet-musculation", "/suivi-escalade"],
});
seoGuide({
  route: "/journal-entrainement",
  parent: FEATURES_PARENT,
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
    ["Ce que contient une séance", `<p>Un sport, une date, puis les mesures utiles : distance et durée pour une sortie, exercices et séries en musculation, cotations en escalade, durée et ressenti pour tout le reste. Ajoute une note si tu veux te souvenir du contexte. Une séance n’est comptée qu’une fois, qu’elle vienne d’une saisie ou d’un fichier importé.</p>`],
    ["Une séance oubliée a sa place", `<p>Tu peux ajouter une séance après coup. Saisie plus de 30 jours après sa date, elle rejoint ton historique : elle compte pour le journal, les records et la maîtrise, sans XP.</p>`],
    ["Du journal aux réponses", `<p>Le journal alimente le récap de la semaine, les records avec leur séance source, les objectifs et le bilan du mois et de l’année. <a href="/progression-sportive">Lire sa progression</a> ou <a href="/comprendre-mes-donnees">comprendre les mesures</a>.</p>`],
  ],
  faqItems: [
    ["Le journal est-il payant ?", "Non. Le journal complet est gratuit, sans limite de durée et sans publicité sur le site web."],
    ["Puis-je essayer le journal sans créer de compte ?", "Oui. En mode découverte, tes séances restent sur ton appareil ; elles peuvent rejoindre un compte créé ensuite."],
    ["Mes séances sont-elles visibles par d’autres ?", "Non. Le journal est privé par défaut ; un coach ne le voit qu’avec ton accord, sur le périmètre que tu choisis."],
  ],
  related: ["/suivi-sportif", "/journal-course-a-pied", "/carnet-musculation", "/progression-sportive"],
});
seoGuide({
  route: "/progression-sportive",
  parent: FEATURES_PARENT,
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
    ["Des records qui ont une source", `<p>Chaque record renvoie à la séance qui l’a établi et garde l’historique de ses améliorations. Corriger ou archiver une séance recalcule les records : rien ne reste figé sur une erreur de saisie.</p>`],
    ["Des objectifs datés", `<p>Fixe un objectif en séances, en jours actifs, en minutes ou en kilomètres sur une période. TITAN projette ton rythme actuel pour te dire où tu en es. Un objectif sert à s’organiser : seules les séances donnent de l’XP.</p>`],
    ["Ce que TITAN ne prétend pas", `<p>Plus de volume ne veut pas dire meilleure performance, et un chiffre isolé ne prouve pas un progrès. TITAN indique combien de séances alimentent chaque calcul et signale les durées estimées. <a href="/comprendre-mes-donnees">Les définitions et leurs limites</a>.</p>`],
  ],
  faqItems: [
    ["TITAN me dit-il comment m’entraîner ?", "Il propose la prochaine action utile et dit toujours pourquoi, sans remplacer un coach ni un avis médical."],
    ["Sur combien de temps juger une progression ?", "Sur plusieurs semaines : le récap compare tes 4 dernières semaines aux 4 précédentes. TITAN+ ajoute des comparaisons de 4, 12 ou 26 semaines complètes."],
  ],
  related: ["/journal-entrainement", "/motivation-sport", "/journal-course-a-pied", "/carnet-musculation"],
});
seoGuide({
  route: "/motivation-sport",
  parent: ["/niveaux-et-xp", "Niveaux et XP"],
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
    ["Des défis sans mise, des quêtes sans pénalité", `<p>Entre amis, un défi se joue en minutes d’effort ou en jours actifs, sans rien à perdre. Chaque semaine et chaque mois, une quête facultative propose un cap : la réussir laisse un souvenir dans ta collection, la manquer ne coûte rien. <a href="/defis-sportifs">Défis, quêtes et expéditions</a>.</p>`],
    ["Une progression qui ne se perd pas", `<p>Un niveau, une maîtrise ou un insigne acquis le restent, même après une longue pause. L’XP vient de l’effort, avec les mêmes plafonds pour tous : inutile de vouloir rattraper une semaine en forçant un dimanche.</p>`],
  ],
  faqItems: [
    ["TITAN+ est-il nécessaire pour rester motivé ?", "Non. Cadence, progression, quatre campagnes et la Communauté sont gratuits."],
    ["Que se passe-t-il si je manque une semaine ?", "Rien ne se perd. La semaine n’est simplement pas ajoutée à ton parcours ; tu peux aussi la déclarer en pause."],
  ],
  related: ["/defis-sportifs", "/aventures-sportives", "/progression-sportive", "/niveaux-et-xp"],
});

seoGuide({
  route: "/suivi-velo",
  parent: SPORTS_PARENT,
  file: "suivi-velo.html",
  title: "Suivi vélo, gravel et VTT : journal, GPX et dénivelé | TITAN",
  h1: "Un journal vélo pour la route,<br>le gravel et le VTT",
  eyebrow: "Vélo · route, gravel, VTT",
  description: "Note tes sorties vélo, gravel ou VTT : distance, durée, dénivelé, terrain, puissance si tu la mesures. Importe un GPX et garde le souvenir de tes longues sorties.",
  image: "archipelago",
  lead: "Route le dimanche, gravel en semaine, vélotaf tous les jours : chaque sortie garde ses mesures, et ton effort compte de la même façon.",
  sections: [
    ["Un sport par pratique", `<p>Vélo, cyclisme sur route, gravel, VTT, cyclo-cross, vélotaf, vélo d’intérieur : chaque pratique est un sport du catalogue, avec sa propre maîtrise et ses propres records. Tu peux tout ranger sous « Vélo » ou distinguer tes pratiques. <a href="/sports">Voir les ${rows.length} sports</a>.</p>`],
    ["Ce que tu enregistres", `<p>La distance et la durée, ton ressenti de 1 à 10 et, si tu les as, le dénivelé, le terrain (route, chemin roulant, sentier technique, mixte), la cadence, la fréquence cardiaque moyenne et la puissance moyenne ou maximale. Rien n’est obligatoire au-delà de l’essentiel : une mesure absente reste absente.</p>`],
    ["Importer un GPX", `<p>Exporte la sortie depuis ton compteur ou ta montre, puis importe le fichier : TITAN en tire la distance, le temps en mouvement, les pauses, le dénivelé positif et négatif et, quand l’enregistrement est complet, le temps par kilomètre. L’analyse se fait sur ton appareil et le tracé du fichier importé n’est pas conservé. Un GPX reste une importation, pas une preuve d’effort.</p>`],
    ["Les longues sorties ont leur place", `<p>50, 100 ou 200 km d’une traite, 4 ou 8 heures de sortie, 1 000 ou 3 000 m de dénivelé : ces efforts laissent un souvenir dans ton profil. Ils ne rapportent pas d’XP en plus : les 90 premières minutes comptent pleinement, les 90 suivantes à moitié, pour qu’une grande sortie n’écrase pas une semaine régulière.</p>`],
    ["Ta progression à vélo", `<p>Le récap de la semaine montre où va ton temps et si ton volume évolue sur quatre semaines. Ta plus longue distance est gardée comme record, avec sa séance source, et la maîtrise de chaque pratique avance avec tes heures et tes semaines. <a href="/progression-sportive">Lire sa progression</a>.</p>`],
  ],
  faqItems: [
    ["Faut-il un capteur de puissance ou un compteur GPS ?", "Non. La distance et la durée suffisent. La puissance, la cadence et le GPX sont des compléments si tu les as."],
    ["Le vélotaf compte-t-il ?", "Oui. Vélotaf est un sport du catalogue : chaque trajet enregistré est une séance, avec les mêmes règles d’effort que les autres."],
    ["Le vélo d’intérieur est-il suivi à part ?", "Oui. Vélo d’intérieur est un sport distinct, avec la résistance, la cadence et la puissance si tu les mesures."],
    ["Le journal vélo est-il gratuit ?", "Oui. Le journal, les records et l’import GPX sont gratuits, sans publicité sur le site."],
  ],
  related: ["/journal-course-a-pied", "/suivi-sportif", "/journal-entrainement", "/defis-sportifs"],
});
seoGuide({
  route: "/defis-sportifs",
  parent: FEATURES_PARENT,
  file: "defis-sportifs.html",
  title: "Défis sportifs entre amis, quêtes et expéditions | TITAN",
  h1: "Des défis sportifs<br>sans mise ni pression",
  eyebrow: "Défis et quêtes",
  description: "Défis entre amis en minutes d’effort ou en jours actifs, quêtes de la semaine et du mois, TITAN Duo, saisons et expéditions : avancer ensemble, sans rien à perdre.",
  image: "aurora",
  lead: "Se lancer un défi entre amis, suivre une quête de la semaine, avancer à deux pendant quatorze jours : tout est facultatif, et rien ne s’achète.",
  sections: [
    ["Les défis entre amis", `<p>Tu crées un défi et tu invites tes amis avec un lien à usage unique, qui ne contient aucune donnée personnelle. Le défi se compte en <strong>minutes d’effort</strong> ou en <strong>jours actifs</strong>, 90 minutes au plus par jour : une personne régulière peut tenir tête à quelqu’un qui s’entraîne beaucoup un seul jour. Aucun crédit n’est en jeu, et le résultat final est figé par le serveur.</p>`],
    ["Les quêtes de la semaine et du mois", `<p>Chaque semaine et chaque mois, TITAN te propose une quête facultative. La terminer laisse un souvenir dans ta collection ; elle ne donne ni XP ni crédits, et la manquer ne retire rien. Une quête commune réunit aussi, chaque semaine, celles et ceux qui choisissent d’y participer : tu n’y vois que le total, la cible et ta propre part.</p>`],
    ["TITAN Duo : quatorze jours à deux", `<p>Avec un ami accepté, tu t’engages pour quatorze jours. Un seul binôme à la fois, pour que l’engagement garde son sens.</p>`],
    ["Saisons et expéditions", `<p>Une saison dure 28 jours : y participer est un choix, se reposer ne coûte rien, et aucun classement n’y est affiché. Plusieurs fois par an, une expédition rassemble toute la communauté face à un gardien de saison : chaque minute d’effort compte pareil, quel que soit le sport. <a href="/aventures-sportives">L’aventure et ses expéditions</a>.</p>`],
    ["Guilde, clubs et classement entre amis", `<p>Une guilde partage un objectif d’effort hebdomadaire et un fil de discussion. Un club est l’espace privé d’un club réel, que l’on rejoint avec un code. Le classement entre amis est facultatif : personne n’y figure sans l’avoir choisi, et il regarde la régularité, jamais le volume.</p>`],
    ["Ce que les défis ne font jamais", `<p>Ils ne donnent ni XP, ni crédits, ni avance : seules tes séances font progresser ton rang, avec les mêmes plafonds pour tous. Ton journal reste privé par défaut. <a href="/niveaux-et-xp">Les règles de progression</a>.</p>`],
  ],
  faqItems: [
    ["Faut-il pratiquer le même sport pour se défier ?", "Non. Un défi compte des minutes d’effort ou des jours actifs : un coureur, une grimpeuse et un nageur peuvent s’y mesurer."],
    ["Que gagne-t-on à la fin d’un défi ?", "Rien qui s’achète ou qui fasse progresser plus vite : ni XP, ni crédits. Le résultat reste affiché, et c’est tout."],
    ["Peut-on participer sans compte ?", "Non. Les défis, les quêtes et TITAN Duo demandent un compte, parce qu’ils reposent sur des séances confirmées par le serveur."],
    ["Les défis sont-ils gratuits ?", "Oui. La Communauté, les défis, les quêtes et les expéditions font partie de l’offre gratuite."],
  ],
  related: ["/motivation-sport", "/aventures-sportives", "/niveaux-et-xp", "/suivi-sportif"],
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
console.log("Public docs v300: confidentialité, CGU, mentions, confiance, aide, nouveautés, sports, partenariats, 9 guides, 404.");
