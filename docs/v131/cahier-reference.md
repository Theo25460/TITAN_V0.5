# Cahier des charges vivant — extrait de référence pour la V1.3.1

Source : Google Doc `1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M`, « Titan — Cahier des charges vivant Codex — Android, monétisation, RPG & sécurité », lu le 14/11/2026 (9 onglets : Contexte, V1, V1.1, V1.2, V1.2 Équilibrage, V1.3, V1.3.1 — Opération Excellence, DA & Bibliothèque, Archives).

Convention : le texte entre « guillemets » est cité tel quel du cahier. Ce qui est marqué **[déduit]** est une lecture de l’auteur de cet extrait, pas une phrase du cahier. Les identifiants (UX-131-06, ANTI-IA-03…) sont ceux du cahier.

## 1. Règles durables (onglet Contexte)

- Ordre de lecture : Contexte, puis V1.3 (« version active »), puis V1.3.1. « Les onglets V1, V1.1 et V1.2 sont des bilans historiques, jamais des instructions actives. »
- « GitHub donne la vérité du code, Netlify/Play/Supabase donnent celle de la production ; le cahier définit les besoins. Vérifier SHA, PR, CI, date et appareils avant d’affirmer “livré”. »
- Cap produit : « TITAN est un suivi sportif multisport avec RPG intégré à l’effort réel. Boucle sport → enregistrement validé → compréhension → progression du monde/rang → prochaine action utile. […] Le journal sportif doit rester excellent même sans intérêt pour le RPG. »
- DA : « fonds très sombres, accents cyan/turquoise et ambre maîtrisé, typographie claire, blasons et quatre mondes cohérents ; réutiliser les sources existantes, pas de style généré générique. Android et UX tactile d’abord, lisibilité à 200 %, TalkBack, réduction des animations, états vides/chargement/erreur utiles. Simplicité et prochaine action avant accumulation de fonctionnalités. »
- Données : « XP, crédits, droits et récompenses exclusivement autoritaires serveur » ; « Pas de double attribution d’une séance, ni addition des pas entre sources » ; « un pas local ou Santé Connect en aperçu n’accorde aucune progression sans vérification serveur ».
- Livraison : « NE PAS confondre développement terminé et publication. » « Écritures de production, migrations, fusion et publication Netlify/Play uniquement sur autorisation de release explicite. Distinguer simulation et vérification sur compte/appareil réel. »
- Convention pour les agents : « aucun test humain […] ne doit bloquer l’implémentation ni la livraison d’une version TESTABLE » ; « Tests verts ≠ preuve de qualité » ; l’agent « signale honnêtement ce qu’il ne peut pas tester (vrai appareil, compte externe, permissions, Play réel) SANS attendre ».
- Exception créative (12/11) : « chaque asset artistique DOIT recevoir l’approbation individuelle du propriétaire avant statut APPROUVÉ ou intégration définitive. »

## 2. Inventaire des écrans natifs tel que le cahier le donne

Le cahier **ne nomme pas** les 46 écrans un par un. Sa seule mention est le ticket V13-38 (onglet V1.3) :

> « V13-38 · P0 · MATRICE DE CONTRÔLE DÉRIVÉE DU RÉPERTOIRE — LES 46 ÉCRANS NATIFS. À réaliser / vérifier : 46 fichiers .tsx d’écrans sous mobile/src/screens ; les tests Jest du dépôt (62 fichiers + dossier) ne remplacent ni un parcours manuel ni un essai instrumenté de rendu et de gestes. »

Le chiffre 46 est donc un **décompte de fichiers `.tsx`** sous `mobile/src/screens` à la date du ticket, pas une liste de parcours. Vérification dans le dépôt le 14/11/2026 (branche `claude/titan-v131-finalization-9g6jjo`) :

| Mesure | Valeur | Détail |
| --- | --- | --- |
| Fichiers `.tsx` sous `mobile/src/screens` | **48** | +2 par rapport au cahier **[déduit : fichiers ajoutés depuis la rédaction du ticket]** |
| dont fichiers d’écran (`*Screen.tsx`) | **44** | les 4 autres sont des morceaux d’écran : `DuoCard`, `Questions`, `ExerciseEditor`, `SportMetricsEditor` |
| Routes de navigation | **45** | 40 routes de pile + 5 onglets ; `RoutesScreen.tsx` porte deux routes (`Routes`, `Route`) |

Liste des 45 routes (source : `mobile/src/navigation/RootNavigator.tsx` et `Tabs.tsx`), regroupées par les surfaces que le cahier cite (PRO-131-01, UX-131-08) :

| Surface du cahier | Routes natives |
| --- | --- |
| Accès, première utilisation | `Welcome`, `Login`, `Signup`, `Forgot`, `Onboarding`, `Guide` |
| QG | `QG` (onglet), `Steps` |
| Enregistrement, résultat | `Record` (onglet), `SessionForm`, `GpsRecord`, `Pending`, `SessionResult`, `SessionDetail`, `SessionEdit`, `Routes`, `Route` |
| Journal, statistiques, carrière | `Progress` (onglet), `Journal`, `Records`, `Career`, `Goals`, `Plan` |
| Aventure, mondes | `Adventure` (onglet), `World`, `Sentiers` |
| Profil | `Profile` (onglet), `Atelier`, `PublicCard` |
| Communauté, coaching | `Community` ; le coaching natif passe par `WebHub` (l’espace coach est sur le Web) |
| Offres | `TitanPlus` |
| Sources | `Sources`, `HealthConnect`, `Garmin` |
| Paramètres, aide, légal | `Settings`, `Account`, `Privacy`, `Notifications`, `Sports`, `Help`, `Feedback`, `Legal`, `About`, `DeleteAccount` |

La matrice détaillée par écran est dans [`lot3-4-ux-android.md`](lot3-4-ux-android.md).

## 3. Grille UX et critère « simplicité ≥ 8/10 »

Décision du 12/11/2026 (LOT 6 BIS) : « La simplicité d’utilisation et la cohérence graphique ne sont PLUS des chantiers reportables : elles font partie du périmètre V1.3.1 et sont des conditions de la sortie ouverte (Web + Android). Estimation de départ du propriétaire : 3/10 en prise en main (ressenti, non mesure instrumentée). OBJECTIF IMPÉRATIF : atteindre AU MOINS 8/10 avant l’ouverture ; aucune auto-note arbitraire ne suffit à déclarer ce seuil atteint. »

UX-131-06 — « Publier une grille NOTÉE SUR 10, un point chacun » :

| N° | Critère (citation) |
| --- | --- |
| 1 | « proposition de valeur comprise au premier écran » |
| 2 | « action “enregistrer” immédiatement trouvable » |
| 3 | « sélection du sport simple » |
| 4 | « saisie/connexion de séance évidente » |
| 5 | « confirmation et résultats intelligibles » |
| 6 | « impact RPG compréhensible » |
| 7 | « navigation/retour prévisibles » |
| 8 | « labels et hiérarchie sans jargon » |
| 9 | « erreurs, vide et permissions récupérables » |
| 10 | « parité des principes UX Android/Web et accessibilité » |

Règles d’attribution : « Chaque point obtenu doit être justifié par une preuve (scénario, capture, trace et, pour le ressenti, observation humaine). Mesurer les tâches critiques sur un build identifié, consigner succès/échecs, temps/frictions, et corriger jusqu’à ≥8/10 SANS échec P0 de prise en main. Les tests automatisés prouvent le fonctionnement, pas à eux seuls la compréhension humaine. »

Exigences UX associées :

- UX-131-01 : matrice « écran → but utilisateur → action principale → friction → correctif → preuve avant/après » ; distinguer P0/P1/P2.
- UX-131-02 : « Dès le QG, une personne n’ayant jamais vu TITAN doit comprendre en 10 secondes ce qu’est l’application, ce qu’elle peut faire maintenant et où cliquer. Mettre l’enregistrement d’une séance au premier plan ; rendre évidentes les voies Manuel / GPS–GPX / Garmin lorsqu’elles sont disponibles et justifiées. […] Réduire options visibles et jargon ; divulgation progressive des fonctions avancées. Aucun système RPG, social ou abonnement ne doit gêner la première séance. »
- UX-131-03 : parcours de référence « découvrir → trouver son sport → enregistrer → vérifier → comprendre les statistiques et récompenses réellement attribuées → voir l’impact sur la progression RPG → savoir quoi faire ensuite ». « pas de faux succès ni écran vide ».
- UX-131-04 / 05 : charte du dépôt (`design/titan-visual-library/`), assets « EXPRESSÉMENT approuvés » seulement ; « Aucun asset “pending”, rejeté ou sans registre ne part en production » ; les dix pictogrammes du lot 01 sont « des WebP 160 × 160 sans alpha et SANS master haute définition : les afficher seulement à une taille adaptée (32–64 px sur fond compatible) » ; « Les visuels de TITAN+, Coach et Coach Ultra restent hors refonte sauf nouvelle décision explicite. »
- UX-131-08 : « Pas de nouvelle fonctionnalité gratuite : simplifier, fusionner, supprimer ou déplacer ce qui gêne. »
- V13-40 (QG) : « une carte unique “Ta prochaine action” » ; « accès à Enregistrer une séance en 1 à 2 gestes ». V13-33 : « premier écran 360 × 740 dp : sans défilement, pouvoir identifier le rang, le monde actif, l’effort à faire et le bouton de séance ».
- V13-41 : « PREMIÈRE VICTOIRE EN MOINS DE 2 MINUTES » ; « Ne jamais prétendre qu’une démo a généré des XP serveur » ; « proposer “plus tard” sur connexion de capteurs, avatar, premium, amis ».
- V13-43 (résultat) : « trois sections maximum : “Tu as fait” […], “Cela a changé” (XP/rang/découverte/quête réellement confirmés ou attente explicite), “À essayer ensuite” (une seule mission raisonnable). […] Si serveur indisponible : “séance gardée, validation en attente”, zéro faux XP. »
- V13-47 : « relancer une séance habituelle en 2 gestes (hors saisie des performances) ».
- V13-24 : blason visible sur tous les téléphones (320 à 430 dp, texte 100/150/200 %).
- V13-21 : « icônes avec zone tactile ≥44 dp » **[déduit : le dépôt applique déjà 48 dp, plus exigeant ; on garde 48]**.

## 4. Les dix contrôles anti-clichés (LOT 6 TER, « bloquants avant sortie ouverte »)

Principe : « Il faut démontrer leur ABSENCE en tant que défauts sur les parcours prioritaires Android et Web. Ce n’est PAS une liste d’interdictions de techniques : dégradés, cartes, gamification, images, animations et composants peuvent rester quand ils servent TITAN. »

| ID | Cliché | « ÉCHEC si » (citation abrégée par des […]) | Surfaces à vérifier |
| --- | --- | --- | --- |
| ANTI-IA-01 | Dégradés, halos, néon de décoration | « les halos cyan/violet, contours lumineux, brillances et arrière-plans abstraits se répètent sans information utile, concurrencent le contenu, créent de la fatigue visuelle ou diminuent le contraste » | QG, onboarding, aventure, boutons principaux, cartes d’état, offres |
| ANTI-IA-02 | Empilement mécanique de cartes arrondies | « chaque donnée, titre ou geste est enfermé dans une boîte semblable, ce qui masque la hiérarchie, impose trop de défilement ou fragmente le QG et le profil » | QG, journal, profil (« actuellement trop chargé »), statistiques, communauté |
| ANTI-IA-03 | Gamification factice, récompenses bruyantes | « des XP, trophées, pop-ups, particules et notifications s’affichent à répétition pour des clics insignifiants, ou si des gains sont présentés avant confirmation serveur » | saisie, bilan, quêtes, ouverture d’un monde, retour au QG |
| ANTI-IA-04 | Illustrations génériques et incohérentes | « on voit des silhouettes anonymes, faux équipements, sportifs “stock IA”, anatomies absurdes, objets flottants ou variations visuelles incompatibles » | catalogue des sports, états vides, QG, mondes, onboarding |
| ANTI-IA-05 | Marketing creux ou interchangeable | « titre, bouton, description ou écran explique TITAN par “libérez votre potentiel”, “révolutionnez”, “expérience ultime” ou jargon RPG hors contexte sans dire ce qu’on fait » | accueil, fiche Play, onboarding, QG, offres, messages |
| ANTI-IA-06 | Dashboard qui noie l’action | « le premier écran expose trop de widgets concurrents, des statistiques sans priorité, plusieurs CTA équivalents ou oblige à chercher l’ajout de séance » | compréhension en 10 s, démarrage de séance, première visite et retour |
| ANTI-IA-07 | Mélange incohérent d’icônes | « pictos 3D réalistes, emojis, illustrations plates, traits et icônes pleines sont mélangés au hasard sur une même surface, avec tailles/poids/cadrages discordants » | sélecteur de sport, barre de navigation, QG, profil, paramètres |
| ANTI-IA-08 | Animations et transitions inutiles (« NON suppression générale des mouvements ») | « animation déclenchée à chaque navigation ou carte, répétitive, clignotante, ralentissant l’action, bloquant un bouton, provoquant des sauts de page ou attendant artificiellement la fin d’un effet » | toutes ; « ordre de grandeur 150–300 ms pour transitions simples » ; respecter « réduire les animations » |
| ANTI-IA-09 | Templates SaaS plaqués | « sections tarifs/abonnements, modales, badges “populaire”, boutons “Découvrir” ou modules copiés-collés sans rôle réel, avec hiérarchie manipulatrice ou contenu disproportionné » | offres, achats/restauration, profil, paramètres, communauté |
| ANTI-IA-10 | Écran séduisant mais parcours incompréhensible | « une capture paraît premium alors que les vrais gestes perdent l’utilisateur : action cachée, libellé opaque, sélection sportive longue, back cassé, double saisie, écran sans sortie, XP incompréhensibles ou fonctions impossibles à retrouver » | parcours complet, comptes neufs et réguliers, petit écran, grand texte |

Protocole de recette : « tableau de 10 contrôles × surfaces concernées […] : “preuve du défaut recherché / statut PASS ou FAIL / justification / capture ou vidéo avant-après / ticket et PR / cas limite / revue finale”. PASS signifie que le cliché est ABSENT ou que le choix visuel est motivé et non nuisible ; […] aucune déclaration PASS sans preuve. […] En cas de doute ergonomique ou esthétique : corriger ou documenter comme non vérifié, pas approuver par défaut. »

Arbitrage : « ne jamais confondre “anti-IA” avec austérité. […] Supprimer ce qui est décoratif, interchangeable, trompeur ou lent ; garder ce qui clarifie, oriente, récompense justement et renforce l’identité TITAN. »

## 5. RPG lisible (LOT 6 QUATER, « P0 UX avant ouverture »)

Décision du 12/11/2026 : « Les utilisateurs, y compris le propriétaire, se perdent dans la partie RPG : ils ne savent pas quelle mission suivre, ce qu’apporte leur effort ni où retrouver leurs gains. L’objectif n’est pas de réduire la richesse narrative, mais de présenter UNE histoire principale, une action immédiatement compréhensible et une conséquence concrète après chaque séance. […] règles serveur/économie inchangées ».

| ID | Exigence (citation abrégée) | Test demandé |
| --- | --- | --- |
| RPG-131-01 | « afficher en haut une seule carte dominante : monde actif, chapitre actuel, action sportive précise, progression vers la balise, obstacle réel, récompense attendue, CTA unique “Enregistrer une séance” ou “Continuer” selon état » ; le reste « par divulgation progressive » | mission repérée en ≤ 5 s (profils neuf, régulier, multi-mondes) |
| RPG-131-02 | « Je fais du sport : mes séances admissibles peuvent faire avancer le chapitre et mon XP », « Je marche : mes pas vérifiés explorent les sentiers », « Je progresse : mon histoire évolue et je collecte des souvenirs » ; « info-bulle facultative “Pourquoi ?” » | un nouveau joueur explique avec ses mots ce qui avance avec une séance et avec les pas |
| RPG-131-03 | résultat : « effort enregistré / XP réellement confirmés / évolution du chapitre / prochaine action » ; « AVANT → APRÈS » ; « ne jamais afficher une balise ou une récompense comme acquise si sync en attente, erreur, séance historique, plafond ou absence de campagne » | chaque scénario dit ce qui a changé, ce qui n’a pas changé et pourquoi |
| RPG-131-04 | supprimer les « clics administratifs » après vérification des contrats serveur ; « aucune attribution optimiste de récompense sur le client » | pas de clic superflu, jamais de double gain |
| RPG-131-05 | mondes qui changent visuellement ; « AUCUN asset nouveau n’est réputé approuvé » | captures du même monde à plusieurs étapes |

Ordre imposé : « 1) mission principale ; 2) clarification des règles ; 3) conséquence de séance ; 4) automatisation prudente des validations ; 5) transformation visuelle persistante. Repenser l’architecture d’information AVANT d’ajouter des animations ou des images. »

Repères fixes : « Quatre mondes, neuf balises par monde et dix-huit rencontres annexes par monde » ; sept rangs : « Éclaireur (niv.1), Explorateur (3), Sentinelle (6), Gardien (10), Champion (15), Titan (25), Légende (40) ».

## 6. Exigences V1.3.1 et statut écrit dans le cahier

En-tête de l’onglet : « Statut · INTÉGRÉE DANS MAIN — NON PRÊT À PUBLIER | 10 novembre 2026 ». Périmètre : « Aucun gros nouveau module, aucun système RPG supplémentaire, pas de refonte visuelle gratuite ».

| Lot | Objet | Tickets | Statut écrit dans le cahier |
| --- | --- | --- | --- |
| 0 | Reprise du code V1.3 sans build intermédiaire | 3 cases | cases « [ ] » non cochées |
| 1 | Sécurité et intégrité (P0) | SEC-131-01 à 06 | pas de statut par ticket ; le suivi du 10/11 dit que la migration de sécurité `20261110142656` « reste à appliquer » |
| 2 | Fiabilité fonctionnelle (P0) | QA-131-01 à 05 | pas de statut par ticket |
| 3 | Performance, Supabase, résilience | PERF-131-01 à 04 | pas de statut par ticket |
| 4 | SEO technique | SEO-131-01 à 05 | pas de statut par ticket |
| 5 | Surveillance, publication progressive | OPS-131-01 à 04 | pas de statut par ticket |
| 6 | Finition « studio » | PRO-131-01 à 07 | « [ ] À EXÉCUTER » |
| 6 bis | UX et identité visuelle, condition de sortie ouverte (P0 produit) | UX-131-01 à 08 | ouvert ; départ estimé 3/10 par le propriétaire |
| 6 ter | Tests anti-clichés (P0 qualité) | ANTI-IA-01 à 10 | ouvert (« 10/10 contrôles anti-clichés PASS documentés » à produire) |
| 6 quater | RPG lisible et immersif (P0 UX) | RPG-131-01 à 05 | ouvert |
| 7 | Revue critique du code | REV-131-01 à 06 | cases non cochées |
| 8 | Livraison finale Web et Play | REL-131-01 à 06 | cases non cochées |

**Attention à la numérotation [déduit]** : dans le cahier, « LOT 3 » = performance et « LOT 4 » = SEO. Les « lots 3 et 4 » du registre `docs/v131/` (UX Android) correspondent aux lots 6, 6 bis, 6 ter et 6 quater du cahier.

Suivi d’exécution daté du 10/11/2026 (seul état de réalisation écrit) : « PR #142 fusionnée dans main à 756ab50… » ; « 578 tests Web et serveur, 1 023 scénarios Chromium, les rejeux PostgreSQL 17.6, 757 tests unitaires Android et cinq parcours Maestro » ; « Le bundle 1.3.1 (1303) est signé » ; « La matrice des appareils et de l’accessibilité Android reste partielle » ; « Le cycle réel d’achat et de remboursement […] reste à qualifier » ; « Netlify sert toujours 761340d ».

Critères de sortie UX (GO/NO-GO d’ouverture, LOT 6 BIS) : « [ ] parcours sportifs essentiels immédiatement compréhensibles ; [ ] note de prise en main ≥8/10 selon la grille et preuves ; [ ] validation humaine de la compréhension réalisée ou explicitement marquée en attente (dans ce cas ouverture NON validée) ; [ ] aucun P0 UX ; [ ] charte GitHub respectée et assets approuvés intégrés lorsque compatibles ; [ ] aucune image non approuvée ; [ ] cohérence visuelle et tactile Android/Web prouvée ; [ ] revue des états d’erreur, permissions, grand texte, hors ligne ; [ ] aucun P0 sécurité/fiabilité/paiement. Une CI verte et une apparence “plus belle” ne suffisent pas à fermer ce lot. »

Exigences de finition utiles à toutes les équipes : PRO-131-01 « chaque écran a un objectif, une action primaire visible et un parcours de retour clair. Aucun bouton fantôme, conteneur vide, écran disproportionné ni décalage visuel » ; PRO-131-03 animation « courte, utile, désactivable […] ; jamais d’effet bloquant avant une saisie ou pour annoncer des XP non confirmés » ; PRO-131-04 « tester 320–430 dp […], police 100–200 % » et « ne jamais prétendre avoir testé un téléphone réel sans preuve » ; PRO-131-05 « comprendre l’action du jour en 10 s → lancer/reprendre une séance en ≤2 gestes […] → synthèse “ce que j’ai fait / ce que TITAN a changé / prochaine action” ».

## 7. Protocole de test utilisateur exigé

UX-131-07 — « Validation avant sortie OUVERTE. Faire une recette de compréhension avec idéalement 5 à 10 nouveaux utilisateurs non initiés, sur l’appareil cible : trouver un sport, enregistrer une séance, retrouver ses statistiques, comprendre ses gains et revenir au QG. Viser ≥80 % de parcours essentiels achevés sans aide et score ≥8/10 sur la grille, sans confusion P0 ; noter les écarts et les corriger avant ouverture. Si le panel n’est pas disponible, livrer sans délai les builds techniques et les preuves automatiques, mais marquer l’ergonomie “non validée humainement” : ne PAS présenter le 8/10 comme confirmé ni déclarer l’ouverture publique autorisée sur cette seule base. »

Compléments :

- LOT 6 QUATER, recette bloquante : « mission actuelle et prochaine action identifiées en ≤5 s » ; « distinction séances/pas/XP/quête expliquée sans ouvrir la documentation » ; « au moins 80 % des tâches critiques réussies sans aide sur échantillon de nouveaux utilisateurs avant GO sortie ouverte ».
- ANTI-IA-10 : « test de compréhension avec nouveaux utilisateurs avant ouverture publique ».
- Le cahier cite cinq tâches ; la liste de « dix tâches essentielles » utilisée par le protocole du lot est **[déduite]** de ces cinq tâches, de la grille UX-131-06 et des tests RPG-131-01/02.
- Tension à connaître : OPS-131-04 et PRO-131-06 disent « Aucun panel humain […] à attendre » pour **livrer** ; UX-131-07 exige le panel pour **ouvrir**. Lecture retenue **[déduit]** : on livre sans panel, on n’ouvre pas sans lui.

## 8. Décisions consignées comme validées

| Date | Décision | Source |
| --- | --- | --- |
| 12/11/2026 | Simplicité et cohérence graphique dans le périmètre V1.3.1, conditions de la sortie ouverte ; objectif ≥ 8/10 | LOT 6 BIS |
| 12/11/2026 | RPG : une histoire principale, une action, une conséquence après chaque séance ; économie inchangée | LOT 6 QUATER |
| 12/11/2026 | Approbation individuelle du propriétaire pour chaque asset ; « Silence, absence de réponse, création d’un fichier, capture ou CI verte » ne valent pas approbation | Contexte, DA § 5 |
| 12/11/2026 | « 10 PICTOGRAMMES SPORTS LOT 01 APPROUVÉS POUR BIBLIOTHÈQUE MAIS PAS ENCORE INTÉGRÉS À L’APP » | DA, en-tête |
| 10/11/2026 | Pas de build ni de publication intermédiaire pour clore la V1.3 ; publication seulement « sur autorisation explicite » | Contexte |
| 10/11/2026 | Prix France vérifiés dans la Play Console : « 4,99 €, 19,99 € et 39,99 € TTC » (TITAN+, Coach, Coach Ultra) ; cycle d’achat réel non qualifié | V1.3.1, suivi |
| — | Sept blasons canoniques et leurs niveaux ; les jalons de carrière ne créent pas de rang | V13-14 |
| — | Palette : fond `#05070A`, couches `#090D12` / `#0E141A` / `#141C24` / `#1B2530`, texte `#EEF3F7`, acier `#A8B6C3`, cyan `#3DD9E8` (« action/progression »), ambre `#F4BB54` (« record, distinction, rareté »), vert `#57D39B`, rouge `#F2665F` | DA § 2 |
| — | Écart assumé : « V13-46 conserve le Duo privé à deux sur 14 jours » | V1.3, écarts |
| — | Les visuels TITAN+, Coach et Coach Ultra « restent hors refonte » | UX-131-05 |

Ce que le cahier **ne valide pas** : aucun score de simplicité, aucun des dix contrôles anti-clichés, aucun essai sur téléphone réel de l’ergonomie. Le nom d’offre s’écrit « Coach Ultra » dans le cahier ; le dépôt écrit parfois « Coach Pro » (voir `mobile/docs/INVENTAIRE.md`) : à trancher par le lot textes **[déduit]**.
