# Audit de la navigation utilisateur web — UX01

## Résultat

Audit réalisé sur le frontend versionné de TITAN au 13 octobre 2026, parent publié `0a1feec31867c7f1506cdf1f27498fb5331fe8f4` (PR #49, ouverte et non fusionnée). Les 42 pages utilisateur construites ont été parcourues dans Chromium à 360 et 1280 px. L'inventaire comprend les menus principaux, Plus, sous-navigation, groupes locaux, menus publics et parcours ciblés. Il identifie les libellés qui nécessitent une explication, avec une distinction entre observations reproductibles et hypothèses de compréhension.

UX01 est terminé pour ce frontend : les destinations et les ambiguïtés sont documentées. Cela ne clôture pas les corrections UX04/UX06/UX09, la validation native, ni une étude de compréhension auprès d'utilisateurs. Aucun code applicatif, HTML, CSS, test existant ou comportement n'est modifié par ce lot.

Le défaut concret prioritaire concerne les onglets Coaching et Atelier : après mise au focus du premier `role="tab"`, `ArrowRight` laisse le focus sur ce premier bouton aux deux formats. Les autres recommandations de libellés sont des hypothèses à valider, pas des difficultés constatées chez de vrais utilisateurs.

## Méthode et preuves

- `pnpm verify` : 183 tests réussis, build de 101 ressources hors ligne, audit existant sans erreur et avec 16 avertissements préexistants.
- Reproduction : `pnpm build`, puis `node tools/audit-navigation.mjs`. Le script nécessite les dépendances du projet et Chromium Playwright ; il compare les sources produit au parent publié et aux fichiers effectivement servis dans `dist` avant observation.
- Preuve structurée : [CDC_WEB_NAVIGATION_AUDIT_EVIDENCE_2026-10-13.json](CDC_WEB_NAVIGATION_AUDIT_EVIDENCE_2026-10-13.json), contenant les SHA-256 de 113 fichiers de première partie, 184 emplacements de navigation dans les sources, 118 observations, 29 formes distinctes de groupes et 307 formes distinctes de liens/boutons visibles dans `main`. Ces 307 contrôles n'ont aucun rapport avec les 307 tâches du CDC.
- Les groupes sont dédupliqués par structure et libellés ; ils peuvent être cachés selon le format. Chaque observation conserve la visibilité du groupe, ses indices sélectionnés et le défilement horizontal local. Les contrôles de navigation incluent liens et boutons ; une destination `null` désigne un bouton, pas un lien cassé. Les quatre entrées Plus sont enregistrées séparément dans `pages[].more`. Les contrôles de `main` sont un instantané : une fin de rendu asynchrone peut varier à la marge (filtre « Tous les sports » dans Stats) sans changer les groupes/destinations recensés. Aucun inventaire exhaustif de tous les états métier n'est revendiqué.
- 44 fichiers HTML construits, dont 42 interfaces utilisateur. `admin.html` (console opérateur) et `googleb8fedd43e28cf7d4.html` (vérification technique) sont exclus du parcours, mais leur contenu n'est pas modifié.
- 84 passages de base (42 × 2), complétés par les ouvertures de menus publics mobiles et dix observations de variantes synthétiques Profil/Coaching/Communauté/Atelier. Tous les menus Plus présents sur les douze pages à shell applicatif sont ouverts à 360 px, leurs quatre descriptions vérifiées, puis fermés avec Échap.
- Réseau tiers et service workers bloqués, analytics refusé, compte factice créé en mémoire. Aucune donnée réelle ni requête vers un fournisseur ; états Communauté/catalogue vides et endpoints Coaching indisponibles simulés. Aucun succès de partage, achat, catalogue payant ou invitation réelle revendiqué.
- Aucun débordement horizontal **du document**, aucune exception JavaScript de page observée et aucune ancre locale visible sans cible dans ces 118 observations. Pour les 33 chemins locaux distincts recensés, le script vérifie l'existence du HTML canonique dans `dist`, puis une réponse HTTP 200. Le serveur de build renvoie aussi 200 pour son fallback : le HEAD seul ne suffirait pas à vérifier une destination. Ce contrôle ne valide ni authentification ni fonction métier ni liens externes. Les paramètres de requête sont retirés des destinations exportées.
- Des captures intermédiaires des douze pages applicatives et quatre variantes membre, aux deux formats, ont permis une inspection visuelle ciblée de QG, Profil, Prévoir, Coaching et Atelier. Elles ne constituent pas un audit de contraste, lecteur d'écran ou ergonomie complet.

## Navigation principale et secondaire

Le shell propose cinq entrées principales stables et quatre entrées secondaires. Les liens portent un état actif enregistré dans la preuve. La rail desktop contient aussi le logo et l'accès au compte ; ces deux liens supplémentaires expliquent le nombre supérieur de contrôles dans ce groupe.

| Libellé | Destination | Sens affiché / contexte | Observation de compréhension |
|---|---|---|---|
| QG | `/aujourdhui` | En-tête « Ton QG », accueil personnel | Acronyme court ; hypothèse qu'un nouvel utilisateur a besoin de « Ton tableau de bord » ou d'une explication dans l'accueil. |
| Progrès | `/stats` | « Ta semaine », puis Semaine/Journal/Records/Objectifs | Destination cohérente comme territoire ; « Semaine » décrit la vue initiale, pas un second territoire. |
| Nouvelle séance (desktop), Séance (mobile) | `/training` | Libellé accessible mobile « Enregistrer une séance » | Action concrète et explicite ; garder cette précision à l'endroit de l'enregistrement. |
| Aventure | `/adventure` | Univers et régions | Identité RPG lisible ; fonctionnement/progression hors de cet audit et réservé au chantier RPG01. |
| Profil | `/profile` | Sections personnelles et compte | Destination claire ; certaines sections demandent du contexte, ci-dessous. |
| Communauté | `/social` | Plus : « Expéditions, amis, défis, guilde » | Les descriptions des raccourcis locaux donnent ensuite un sens concret. |
| Coaching | `/coaching` | Plus : « Partager tes séances avec un coach, sous ton contrôle » | Bonne explication du périmètre ; les deux modes sont distingués. |
| Atelier | `/boutique` | Plus : « Personnalisation et TITAN+ » | Hypothèse de flou sur desktop, où la rail expose seulement « Atelier » ; garder le nom et expliciter sa fonction. |
| Aide | `/service` | Plus : « Questions, contact, signaler un problème » | Même destination appelée « Assistance » et « Aide et contact » ailleurs ; harmonisation à décider. |

Le panneau Plus contient également Conditions, Confidentialité et Nouveautés. Le changement de format conserve les mêmes destinations principales et secondaires ; les aides textuelles du panneau mobile sont un point positif à réutiliser avec mesure.

## Sous-navigation, groupes locaux et parcours ciblés

| Groupe | Entrées recensées | Fonction et limite |
|---|---|---|
| Pages de Progrès | Semaine → `/stats`, Journal → `/journal`, Records → `/records`, Objectifs → `/objectifs` | Présentes sur les quatre pages. À 360 px, bande défilante locale ; pas de débordement du document. |
| Pages de Séance | Enregistrer → `/training`, Prévoir → `/prevoir` | Présentes **sur les deux pages**. Dans Training, `js/app/seance.js` ajoute le sous-menu dynamiquement ; l'absence d'attribut statique n'est pas une absence de navigation. |
| Régions d'Aventure | Vallée de l'Aube, Archipel des Marées, Forges d'Obsidienne, Citadelle des Aurores | Quatre **boutons** avec intention et statut Gratuit/TITAN+. Bande défilante mobile ; aucune évaluation des cartes, récompenses ou règles RPG. |
| Sections du profil | Maîtrise, ADN, Collection, Personnage, Réglages, Compte ; Public ajouté en membre | Ancres locales présentes. Bande défilante mobile : des entrées restent hors de la portion initiale. Maîtrise/ADN sont des hypothèses d'ambiguïté pour un nouveau venu. |
| Mon espace (Coaching) | Je suis sportif, J'accompagne | Deux boutons `role="tab"`, état sélectionné ; variante coach parcourue avec serveur simulé indisponible. Défaut ArrowRight mesuré. |
| Type de pièce (Atelier) | Cadres, Ambiances, Cartes | Trois boutons `role="tab"`. Les descriptions source expliquent portrait, lumière de carte d'aventure et style de cartes partagées ; le nom « Cartes » seul peut rester ambigu. Catalogue synthétique vide, défaut ArrowRight mesuré. |
| Dans la communauté | Moments, Amis, Défis, Guilde | Quatre ancres avec description fonctionnelle dans la variante membre vide. Leur sens ne repose pas seulement sur le nom RPG. |
| Connexion ou inscription | Se connecter, Créer un compte | Deux **boutons** de changement de formulaire, sans `role="tab"` ; aucune attente APG de flèches appliquée à ce groupe. |
| Pages de sports | Précédent, Suivant ; noms accessibles Page précédente/Page suivante | Générées uniquement si `result.pages > 1` (`js/app/sport-browser.js:58`). Recensées dans les sources ; non affichées avec les historiques vides de cet audit. |
| Récupération / compte | 404, erreur réseau, connexion, onboarding, changement de mot de passe | Actions visibles recensées ; sans vrai lien de récupération, installation, historique chargé ou validation de compte. |
| Analyse et vues conditionnelles | Contrôles visibles de Progrès/Journal/Records/Objectifs | Inventaire de l'état découverte. Pas de parcours payé ou de session volumineuse validé ; aucune conclusion de compréhension sur ces états non observés. |

Le frontend public a un header de cinq destinations (Fonctionnalités, Progression, Aventure, Coachs, Tarifs), un menu mobile de huit destinations ajoutant Bien démarrer, Comprendre mes données et Se connecter, puis quatre groupes de footer (Produit, Comprendre, Par sport, Confiance). Les guides Aventure, données, démarrage, niveaux/XP et coachs ont leurs tables de matières ; les pages juridiques ont un groupe Documents. Le catalogue exact de ces groupes et de leurs ancres figure dans `surfaces` de la preuve.

Sur `/dynamic-page`, le fallback public issu du code courant conserve « TITAN OS » et « Accueil », alors que le reste du frontend se présente comme TITAN. Le CMS distant étant bloqué, cette observation porte sur le fallback local, pas sur un contenu CMS publié.

## Constats et ordre des suites

| Priorité | Nature de la preuve | Constat | Suite proposée / CDC |
|---|---|---|---|
| 1 | Mesure Chromium, 4 observations | Coaching et Atelier : focus sur le premier tab, ArrowRight, focus inchangé à 360 et 1280 px. Sources `js/app/coaching.js:294` et `js/app/atelier.js:260`. | UX09 : choisir une sémantique cohérente, puis implémenter/vérifier le parcours clavier correspondant. Si `tablist/tab` est conservé, vérifier focus, sélection et association aux panneaux. Aucun correctif dans ce lot. |
| 2 | Noms et contextes observés ; compréhension hypothétique | QG, Atelier, Maîtrise, ADN et Cartes exigent de connaître l'univers ou la fonction. Les descriptions Plus/source réduisent déjà une partie de cette ambiguïté. | UX01 → suites UX06/UX07/UX08 : conserver la DA, proposer des explications courtes situées, puis faire décrire la destination attendue par des utilisateurs avant un renommage global. |
| 3 | Divergence textuelle factuelle | `/service` se nomme Aide dans le shell, Assistance dans le titre et certains accès Profil/footer, Aide et contact dans la plupart des footers publics. | UX06 : décider un terme repère et garder les précisions adaptées au contexte. Pas d'erreur de destination constatée. |
| 4 | Rendu mobile observé ; difficulté hypothétique | Progrès, régions et sections Profil défilent horizontalement. Des destinations sortent de la portion initiale à 360 px. | UX04/UX09 : vérifier un indice de suite et l'accès focus/scroll à toutes les entrées ; éviter d'assimiler ce défilement local au débordement global absent. |
| 5 | Deux contextes éditoriaux observés | Public « Progression » ouvre niveaux/XP ; application « Progrès » ouvre la semaine mesurée. | UX06 : expliquer la différence entre statistiques et progression RPG dans leurs contextes. Les territoires peuvent rester distincts ; aucune confusion utilisateur mesurée. |
| 6 | Fallback local observé | « TITAN OS » subsiste dans la navigation de page dynamique. | UX06 : aligner ce fallback sur la marque courante dans un lot de copie ciblé, après contrôle du CMS. |

Le [modèle d'onglets WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) décrit le déplacement entre onglets avec les flèches horizontales et les relations entre tabs et panneaux. Il sert de référence technique au premier constat. L'audit a mesuré ArrowRight seulement ; il ne certifie aucune conformité WCAG, ni tous les raccourcis, ni les lecteurs d'écran.

Pour la prochaine validation humaine, demander où chaque libellé mènerait et quelle action la personne s'attend à pouvoir effectuer, avant de montrer la destination. Aucun participant, résultat d'étude ou taux de réussite n'est inventé. Un lot ultérieur pourra corriger le défaut clavier confirmé sans attendre une décision générale de vocabulaire.

## Périmètre restant ouvert

Android/TWA/Play Console, Safari/iOS/Firefox, réseau/cache hors ligne réel, grand historique, catalogue TITAN+ réel, coach actif, profil public réel, outils admin et billing, lecture d'écran et étude utilisateurs restent hors de cette preuve. Les claims WORK/Play Console et RPG01 sont préservés. UX04 et UX06 gardent leurs statuts ; UX09 et QA13 restent partiels. Les références de PR, revue et CI exactes sont consignées dans la passation et dans le CDC natif après validation.

## Inventaire des 42 pages construites

L'état de référence ci-dessous est celui de découverte à 360 px. Les variantes et chaque surface/contrôle sont détaillés dans la preuve JSON ; l'absence de `data-territory` désigne un parcours public ou ciblé sans shell de territoire.

| Route | Titre observé | Territoire | Groupes présents dans le DOM |
|---|---|---|---|
| /404 | Page introuvable \| TITAN | Public / ciblé | Navigation principale, Menu, Produit, Comprendre, Par sport, Confiance |
| /adventure | Aventure — TITAN | aventure | Navigation principale, Régions |
| /athlete | Carte d’athlète — TITAN | Public / ciblé | Actions du parcours dans main |
| /aujourdhui | QG — TITAN | qg | Navigation principale |
| /aventures-sportives | L’aventure TITAN : 4 mondes, 36 balises, 4 gardiens | Public / ciblé | Navigation principale, Menu, Sur cette page, Produit, Comprendre, Par sport, Confiance |
| /boutique | Atelier — TITAN | atelier | Navigation principale |
| /carnet-musculation | Carnet de musculation : séries, charges, RIR et progression \| TITAN | Public / ciblé | Navigation principale, Menu, Produit, Comprendre, Par sport, Confiance |
| /changelog | Nouveautés de TITAN | Public / ciblé | Navigation principale, Menu, Produit, Comprendre, Par sport, Confiance |
| /coaching | Coaching — TITAN | coaching | Navigation principale |
| /comprendre-mes-donnees | Comprendre ses données sportives : mesures, records et limites \| TITAN | Public / ciblé | Navigation principale, Menu, Sur cette page, Produit, Comprendre, Par sport, Confiance |
| /debuter-titan | Bien démarrer avec TITAN : 2 minutes et une première séance | Public / ciblé | Navigation principale, Menu, Sur cette page, Produit, Comprendre, Par sport, Confiance |
| /dynamic-page | Page publique TITAN | Public / ciblé | Navigation |
| /fonctionnalites | Fonctionnalités : journal, statistiques, progression \| TITAN | Public / ciblé | Navigation principale, Menu, Produit, Comprendre, Par sport, Confiance |
| / | TITAN — Journal sportif multisport, progression et aventure | Public / ciblé | Navigation principale, Menu, Produit, Comprendre, Par sport, Confiance |
| /journal-course-a-pied | Journal de course à pied : allure, records et progression \| TITAN | Public / ciblé | Navigation principale, Menu, Produit, Comprendre, Par sport, Confiance |
| /journal-entrainement | Journal d’entraînement en ligne, gratuit et hors ligne \| TITAN | Public / ciblé | Navigation principale, Menu, Produit, Comprendre, Par sport, Confiance |
| /journal | Journal — TITAN | progres | Navigation principale, Pages de Progrès |
| /legal_cgu | Conditions générales d’utilisation \| TITAN | Public / ciblé | Navigation principale, Menu, Documents, Produit, Comprendre, Par sport, Confiance |
| /legal_hub | Centre de confiance : confidentialité, équité, sécurité \| TITAN | Public / ciblé | Navigation principale, Menu, Documents, Produit, Comprendre, Par sport, Confiance |
| /legal_mentions | Mentions légales \| TITAN | Public / ciblé | Navigation principale, Menu, Documents, Produit, Comprendre, Par sport, Confiance |
| /legal_privacy | Politique de confidentialité \| TITAN | Public / ciblé | Navigation principale, Menu, Documents, Produit, Comprendre, Par sport, Confiance |
| /login | Connexion — TITAN | Public / ciblé | Connexion ou inscription, Informations |
| /motivation-sport | Garder la motivation pour le sport, sans culpabiliser \| TITAN | Public / ciblé | Navigation principale, Menu, Produit, Comprendre, Par sport, Confiance |
| /network-error | Hors ligne — TITAN | Public / ciblé | Actions du parcours dans main |
| /niveaux-et-xp | Niveaux, XP, rangs et maîtrise : les règles de progression TITAN | Public / ciblé | Navigation principale, Menu, Sur cette page, Produit, Comprendre, Par sport, Confiance |
| /objectifs | Objectifs — TITAN | progres | Navigation principale, Pages de Progrès |
| /onboarding | Premiers pas — TITAN | Public / ciblé | Actions du parcours dans main |
| /partenariats | Partenariats : clubs, salles, coachs et associations \| TITAN | Public / ciblé | Navigation principale, Menu, Produit, Comprendre, Par sport, Confiance |
| /pour-les-coachs | TITAN pour les coachs : suivi consenti et séances proposées | Public / ciblé | Navigation principale, Menu, Sur cette page, Produit, Comprendre, Par sport, Confiance |
| /prevoir | Prévoir — TITAN | seance | Navigation principale, Pages de Séance |
| /profile | Profil — TITAN | profil | Navigation principale, Sections du profil |
| /progression-sportive | Mesurer sa progression sportive sans se raconter d’histoires \| TITAN | Public / ciblé | Navigation principale, Menu, Produit, Comprendre, Par sport, Confiance |
| /records | Records — TITAN | progres | Navigation principale, Pages de Progrès |
| /service | Assistance, aide et contact \| TITAN | Public / ciblé | Navigation principale, Menu, Choisir une catégorie, Produit, Comprendre, Par sport, Confiance |
| /social | Communauté — TITAN | communaute | Navigation principale |
| /sports | Les 260 sports suivis par TITAN, famille par famille | Public / ciblé | Navigation principale, Menu, Produit, Comprendre, Par sport, Confiance |
| /stats | Ta semaine — TITAN | progres | Navigation principale, Pages de Progrès |
| /suivi-escalade | Suivi d’escalade : cotations, essais et réussites \| TITAN | Public / ciblé | Navigation principale, Menu, Produit, Comprendre, Par sport, Confiance |
| /suivi-sportif | Suivi sportif multisport : un journal pour tous tes sports | Public / ciblé | Navigation principale, Menu, Produit, Comprendre, Par sport, Confiance |
| /tarifs | Gratuit et TITAN+ : tout ce qui est inclus \| TITAN | Public / ciblé | Navigation principale, Menu, Produit, Comprendre, Par sport, Confiance |
| /training | Nouvelle séance — TITAN | seance | Navigation principale, Pages de Séance |
| /update-password | Nouveau mot de passe — TITAN | Public / ciblé | Informations |
