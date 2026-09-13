# TITAN Renaissance — plan de transformation du produit

Statut au 13 septembre 2026 : plan de référence accepté, largement réalisé dans la livraison 200. Le périmètre effectivement implémenté, les validations, les limites et les évolutions restantes sont détaillés dans [RENAISSANCE_200.md](RENAISSANCE_200.md). Les sections ci-dessous conservent la vision longue ; elles ne doivent pas être utilisées comme une liste commerciale des fonctions disponibles.

## 1. Direction

Promesse proposée : **« Ton effort devient une aventure. Tes progrès restent mesurables. »**

TITAN doit donner envie de pratiquer, de revenir et de comprendre sa progression. Le jeu et les données partageront une même source : la séance enregistrée, validée et rattachée à son propriétaire.

L’interface présentera trois conséquences de chaque séance :

1. **Sport** : mesures, historique, record éventuel et progression de l’objectif.
2. **Personnage** : XP réellement attribuée, niveau, rang et récompense débloquée.
3. **Aventure** : progression de quête, étape de campagne et contribution collective éventuelle.

Exemple fonctionnel : une séance de musculation enregistre les séries ; son enregistrement confirmé fait avancer une quête hebdomadaire ; l’XP attribuée par le serveur remplit la jauge du personnage ; les volumes réellement renseignés alimentent les graphiques. Un écran de fin raconte ces trois résultats avec des liens vers leurs détails. Les montants d’XP ne sont pas fixés dans cette maquette : ils doivent provenir du moteur de règles.

## 2. Constats dans le dépôt

- La page Aujourd’hui de la version 102 privilégie activité hebdomadaire, objectif, reprise et planning. Elle ne donne pas au personnage et à l’aventure une place centrale.
- Les champs XP/niveau, les trophées, les talents, l’inventaire, le bestiaire et le code de campagne existent encore. Il faut examiner leur cohérence, leur utilité et leur autorité serveur avant de les reconnecter au parcours principal.
- La page Progrès affiche surtout séances, minutes, kilomètres et répartition. Les données propres aux disciplines méritent de vraies vues spécialisées.
- Les illustrations sont réparties entre avatar, boss, mob, item, boutique et visuels éditoriaux. Leur remplacement doit suivre une direction artistique commune.
- Le correctif serveur précédent a neutralisé des récompenses de combat fondées sur une victoire déclarée par le client. Un nouveau système de combat récompensé demande une mécanique vérifiable au serveur.
- IndexedDB, reçus de séance, révisions, exports et certaines protections de facturation constituent un socle à préserver.
- Les 35 tests et contrôles de la version 102 couvrent un périmètre précis. Ils ne certifient pas l’ensemble du produit, de la sécurité, des paiements ou des appareils.

## 3. Architecture de navigation

| Destination principale | Contenu et action centrale |
|---|---|
| **QG** | Personnage, niveau, XP, prochain déblocage, quête active, objectif sportif et résumé de la semaine. Une action prioritaire selon le contexte. |
| **Aventure** | Carte, campagne, missions, adversaires, collection et progression coopérative. |
| **Séance** | Saisie rapide, séance planifiée, routines, chronomètre, exercices, imports. Accès permanent et pratique au pouce. |
| **Progrès** | Onglets Journal, Analyses, Records, Objectifs et Bilans. Tous les graphiques permettent de retrouver les séances sources. |
| **Profil** | Identité sportive, avatar, titres, équipement cosmétique, statistiques de carrière, confidentialité, compte et abonnement. |

Sur mobile : cinq accès fixes, création de séance centrale, filtres compacts, graphiques tactiles et détails progressifs. Sur ordinateur : navigation plus explicite et surfaces de comparaison plus larges. Les coachs disposent d’une vue centrée sur les données lorsqu’ils consultent des informations partagées ; le jeu reste intégré au compte personnel.

## 4. Moteur de progression

### Niveau, XP et maîtrise

- Niveau global durable, XP courante, seuil suivant, paliers de rang et déblocages compréhensibles.
- Vue par discipline montrant la pratique accumulée et des jalons adaptés. Les libellés décrivent la pratique enregistrée, pas une capacité physique certifiée.
- Courbe de progression documentée et simulée pour un débutant, un pratiquant régulier, un sportif expérimenté et une personne alternant plusieurs sports.
- Récompenses de régularité fondées sur des objectifs hebdomadaires choisis ; récupération et semaines allégées compatibles avec la progression.
- Pas de perte punitive du niveau acquis après une pause ; parcours de reprise et défis ajustables.
- Plafonds et rendements décroissants explicables : éviter que multiplier les petites saisies ou déclarer des volumes extrêmes domine le jeu.
- Une monnaie cosmétique gagnée clairement identifiée. Pas d’empilement de monnaies et de compteurs sans usage distinct.

### Quêtes et campagne

- Missions de découverte, d’assiduité, de diversité sportive et d’objectifs personnels.
- Critères précis, versionnés, évalués au serveur ; affichage de l’avancement et des séances contributrices.
- Première campagne gratuite avec introduction, étapes, adversaires et conclusion ; accès à un jeu substantiel sans abonnement.
- Combats liés à des contributions sportives validées. Si des décisions tactiques sont introduites, le serveur valide aussi les actions et l’issue ; le navigateur ne déclare pas une victoire récompensée.
- Personnage évolutif, titres, trophées, inventaire et collection visibles depuis le QG.
- Défis collectifs optatifs, puis clubs/équipes et objectifs coopératifs. Les classements distinguent les catégories et la provenance des activités lorsqu’elle est connue.
- Activité saisie manuellement et fichier importé ne sont jamais présentés comme une performance sportive certifiée. Aucune récompense financière liée à ces classements.

### Moment de récompense

- Fin de séance : résultat sportif, XP confirmée, éventuel changement de niveau, quête et prochain objectif.
- Animation brève, désactivable ou réduite, avec accès immédiat au journal.
- État hors ligne explicite ; la confirmation et les récompenses officielles suivent la réponse du serveur.
- Mode découverte jouable et compréhensible, avec séparation visible de la progression locale et du compte synchronisé.

## 5. Données sportives réellement utiles

| Famille | Mesures et outils à développer |
|---|---|
| Course, marche, vélo | Distance, durée, allure/vitesse dérivée, dénivelé, régularité, comparaison de parcours lorsque les traces le permettent, records comparables. |
| Musculation | Séries individuelles, charge, répétitions, RIR, volume par exercice, évolution d’une même variante, routines, séances planifiées et édition des séries après enregistrement. |
| Escalade | Bloc/voie, durée, système de cotation, niveau tenté/réussi, essais, réussites, mode d’assurage et lieu distincts. Pas de classement numérique commun entre systèmes incompatibles. |
| Sports collectifs et de raquette | Durée, entraînement/match, résultat et indicateurs spécifiques disponibles ; schémas simples et honnêtes pour les disciplines non spécialisées. |
| Mobilité et autres pratiques | Durée, fréquence, objectif, note et ressenti facultatif. Aucun score de santé inventé à partir d’une absence de données. |

Fonctions transversales : calendrier et agenda, objectifs datés, filtres enregistrables, comparaison de périodes et de séances, records avec contexte, annotations, export CSV, bilan PDF mis en page, gestion des erreurs de saisie et visibilité des données incomplètes.

Chaque indicateur aura une définition, son unité, sa provenance et les conditions permettant une comparaison. Les estimations éventuelles seront nommées comme telles. Les graphiques resteront lisibles au toucher et fourniront une alternative tabulaire.

## 6. Direction artistique et bibliothèque visuelle

Direction de départ : **aventure sportive cinématographique, personnages et environnements stylisés, matériaux travaillés, lumière maîtrisée et interface lisible**. L’objectif est un univers original suffisamment affirmé pour le jeu, assez mature pour convenir à des adultes et à des sportifs exigeants.

Trois familles d’assets distinctes et coordonnées :

1. **Commandes** : pictogrammes SVG précis pour navigation, édition, filtres et actions ; proportions, épaisseur et vocabulaire communs. Suppression des caractères de police utilisés comme substituts incohérents.
2. **Illustrations générées** : personnages, environnements, adversaires, scènes de campagne, images de disciplines et états vides. Même direction de lumière, cadrage, matières et gamme de couleurs.
3. **Récompenses** : insignes de niveau, titres, médailles, équipements et cadres d’avatar reconnaissables à petite taille.

Premier catalogue cible, à produire par ensembles cohérents : une scène principale, quatre environnements de campagne, six avatars avec évolutions, douze adversaires, vingt-quatre insignes, douze illustrations de familles sportives et les principaux états vide/chargement/erreur/réussite. Chaque lot doit être inspecté et intégré, avec variantes de cadrage pour mobile. Ces quantités sont un périmètre cible, pas des assets déjà générés.

Les illustrations seront produites avec l’outil de génération d’images puis optimisées pour le site. Les commandes simples resteront vectorielles. Les textes, valeurs et boutons resteront dans le HTML, jamais intégrés aux images. Chargement progressif des grandes scènes, images responsives, alternatives textuelles et animation réduite font partie de la conception.

## 7. Gratuit, TITAN+ et professionnels

| Domaine | Gratuit complet | TITAN+ | Espace professionnel, lot ultérieur |
|---|---|---|---|
| Jeu | Niveaux, XP, rangs, quêtes essentielles, campagne initiale, avatar, trophées, défis de base | Campagnes supplémentaires, variantes de quêtes, personnalisation et collections étendues | Défis privés encadrés et personnalisation du groupe |
| Sport | Saisie, journal complet, édition, calendrier, objectifs, routines essentielles, données et records de base | Planification et modèles avancés, organisation étendue | Attribution de séances et suivi de réalisation |
| Analyses | Synthèse utile par sport et exports des données personnelles | Comparaisons approfondies, tableaux configurables, bilans enrichis et historique de tendances | Vue des athlètes ayant accepté un partage, commentaires et bilans |
| Social | Amis, encouragements et participation aux défis autorisés | Outils supplémentaires d’organisation et personnalisation | Gestion de groupes et invitations |
| Prix | Essentiel durablement utilisable | Prix actuel conservé pendant la conception ; toute évolution doit correspondre à la valeur réellement livrée | Offre distincte à définir après réalisation des usages et des coûts |

L’abonnement n’achète ni niveaux, ni puissance, ni avantage au classement. Les activités additionnelles premium doivent respecter les mêmes plafonds de progression. Les fonctions premium annoncées et leurs droits réels seront alignés côté interface et serveur.

La partie coach n’est pas une simple page commerciale : invitations, consentement précis, périmètre de lecture/écriture, révocation et isolation entre coachs sont des prérequis. Les données privées d’un athlète ne deviennent jamais visibles par son appartenance à un groupe seulement.

## 8. Sécurité et maintien des données

- Cartographier les opérations sensibles et leurs droits : séances, récompenses, quêtes, inventaire, achats, remboursements, classements, messages, coachs et administration.
- Conserver la validation et l’attribution des récompenses au serveur ; journal des événements, protection contre les répétitions et tests de concurrence.
- Réexaminer les règles de modification et d’archivage : records, contribution aux quêtes, campagnes, classements et récompenses doivent suivre une règle documentée, sans double gain.
- Vérifier les lectures et écritures entre deux comptes ordinaires, deux coachs, un abonné expiré et un administrateur. RLS et droits des fonctions testés sur les cas négatifs.
- Contrôler activation, renouvellement, expiration, annulation et remboursement avec les mécanismes de test disponibles. Aucun achat réel de validation sans autorisation distincte.
- Sécuriser imports et médias : taille, type, contenu, stockage privé si nécessaire ; empêcher scripts injectés et export dangereux.
- Définir confidentialité par défaut, partage volontaire, blocage, signalement, limitations de débit et modération avant d’ouvrir les nouveaux usages communautaires.
- Préparer migrations versionnées, simulation sur copies de test, sauvegardes vérifiées et procédure de retour arrière. Préserver les niveaux et récompenses légitimes existants ; documenter toute conversion avant application.
- Suivre les erreurs et les échecs de synchronisation sans enregistrer de secrets ni exposer les données privées dans les logs.
- Supprimer progressivement les handlers inline et dépendances globales qui empêchent de renforcer la CSP et de tester les modules isolément.

## 9. SEO et acquisition

Positionnement éditorial : journal multisport gamifié, motivation par progression, aventures sportives, défis entre amis et suivi utile par discipline.

- Réécrire l’accueil autour du jeu, avec de véritables exemples de personnage, quête et écran de résultat ; montrer aussi les analyses.
- Pages utiles dédiées au fonctionnement des niveaux, aux quêtes, à la progression, aux usages multisports et aux offres.
- Contenus de fond par discipline, guides de démarrage, glossaire et démonstrations accessibles sans compte. Éviter la création massive de pages génériques au nom d’un sport.
- Titres et descriptions distincts, maillage entre guides et outils, canonicals, sitemap, redirections et balisage structuré correspondant au contenu réellement visible.
- Préserver les URL déjà indexées ; protéger les pages personnelles de l’indexation. Un partage public est une option distincte et explicite.
- Mesurer indexation, requêtes, impressions, clics et inscriptions issues du référencement dans Search Console et les outils réellement disponibles.
- Travailler le chargement, la stabilité de mise en page et la réactivité ; définir un budget d’images et de JavaScript. Cibles de référence : LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 au 75e percentile lorsque les données terrain existent.

L’acquisition ne sera pas déclarée améliorée sur la seule présence de nouvelles balises. Le suivi des résultats et la création régulière de contenu utile font partie du chantier ; aucun volume de visites n’est promis.

## 10. Ordre de réalisation et portes de validation

| Lot | Livrable concret | Condition de passage |
|---|---|---|
| 1. Cadrage du jeu et des données | Inventaire de l’existant, règles XP/niveaux/quêtes, navigation, catalogue des fonctions et maquettes de quatre écrans centraux | On comprend le jeu, le bénéfice sportif et le prochain geste ; règles de récompenses simulables. |
| 2. Direction artistique intégrée | QG, personnage, écran de fin de séance et première scène d’aventure, sur mobile et ordinateur ; première famille d’illustrations | Une séance produit un résultat visuel complet et cohérent, avec interactions et données réelles. |
| 3. Progression autoritaire | Niveaux, rangs, quêtes, inventaire, moteur de campagne et migrations | Pas de gain indu par répétition, changement de compte ou modification des données ; historique préservé. |
| 4. Données approfondies | Hub Progrès, analyses par famille, records, objectifs, édition avancée et planning | Chaque total est traçable ; unités, absences et comparaisons sont justes. |
| 5. Contenu et offres | Campagne gratuite complète, contenu premium, collections et matrice des droits | Chaque promesse d’offre correspond à une fonction livrée et testée ; progression équitable. |
| 6. Communauté | Amis, défis coopératifs, groupes, signalements et protections | Droits et règles de modération testés avant ouverture. |
| 7. Professionnels | Espace coach utilisable, invitations, consentement, programmes et bilans | Isolation et révocation vérifiées ; aucune publication comme fonction disponible avant cela. |
| 8. Acquisition et exploitation | Pages publiques finales, contenu SEO, instrumentation, performances, tests de production et déploiement | Parcours critiques validés, CI verte, migration réversible et contrôle du domaine public. |

Les contrôles de sécurité, d’accessibilité, de performance et de responsive s’effectuent dans chaque lot. Le lot 8 consolide la livraison ; il ne reporte pas tous les contrôles à la fin.

Le premier lot visible doit déjà montrer **QG + personnage + résultat de séance + aventure**, reliés ensemble. Une nouvelle page d’accueil seule ne représente pas l’achèvement de cette transformation.

## 11. Recette et mesure du résultat

Parcours à tester : découverte sans compte ; inscription et reprise du mode invité selon une règle définie ; première séance ; progression de quête ; montée de niveau ; reprise après pause ; séance hors ligne puis synchronisation ; correction/archivage ; conflit entre deux appareils ; export ; accès premium expiré ; partage coach et révocation ; suppression du compte et des données selon la politique définie.

Tests d’affichage : petit téléphone, grands téléphones, tablette, ordinateur, clavier, zoom 200 %, contraste, réduction des animations, réseau lent et états vides. Vérification Safari/iOS et Android lorsqu’un environnement de test est disponible ; distinguer émulation de largeur et test d’appareil réel.

Mesures produit : temps jusqu’à la première séance, abandon de saisie, succès de sauvegarde/synchronisation, retour à 7 et 30 jours, participation aux quêtes, usage des analyses et intérêt pour TITAN+. Les objectifs chiffrés seront fixés à partir d’une mesure initiale, pas inventés après livraison.

## 12. Références consultées

- [Habitica](https://habitica.com/static/home) : avatar, niveaux, objets et quêtes liés aux actions de l’utilisateur. Référence de mécanique, sans reprendre ses pénalités ni son identité graphique.
- [Zombies, Run! — démarrage](https://zrx.app/news/get-started) : missions et récit intégrés à l’activité. Référence de continuité narrative, avec un univers TITAN original et multisport.
- [Google — contenu utile](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) : priorité à l’utilité pour le visiteur.
- [Google — Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals) : repères de chargement, stabilité et réactivité.

Ces références alimentent les choix de conception. Elles ne prouvent ni une supériorité de TITAN ni un résultat commercial futur.
