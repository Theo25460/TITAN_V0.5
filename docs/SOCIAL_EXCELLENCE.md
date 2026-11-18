# TITAN ONE · Opération Connexion — le social et la fidélisation (20 novembre 2026)

Branche `claude/peaceful-ramanujan-0erk4m`, construite sur la branche TITAN LIVE `claude/trusting-planck-4cbljf` (elle-même sur
l'Excellence sportive, PR #151) et sur la dernière note de recette de #151. Rien n'est publié ni appliqué : quatre migrations
préparées dans le paquet `supabase/release-v17/`, trois drapeaux serveur fermés par défaut.

But : deux amis installent TITAN, s'ajoutent, partagent ce qu'ils choisissent, relèvent un défi et vivent une progression commune ;
la même chose pour un groupe de sportifs de disciplines et de niveaux différents. Le jeu solo reste entier.

## 0. Ce qui existait, ce qui ne marchait pas

L'infrastructure sociale était riche (amis avec consentement, Moments et encouragements, défis entre amis, liens de défi, TITAN Duo,
expéditions, guildes, clubs, quête commune, saisons, objectif mondial, classement équitable, factions, Panthéon). L'audit du code et
des fonctions serveur a trouvé :

| # | Défaut | Effet réel | Lot |
|---|---|---|---|
| 1 | Un code ami ne marche que si son propriétaire est « trouvable », ce qui publie aussi son pseudo dans les anciennes listes | Deux nouveaux amis (comptes privés par défaut) ne pouvaient pas s'ajouter sans s'exposer | A |
| 2 | Six limites anti-spam comptaient des lignes jamais écrites (`buddy_invite`, `buddy_nudge`, `challenge_link`, `challenge_link_accept`, `intent_set`, `intent_cheer`) | « 10 invitations par jour », « 20 liens par jour »… ne s'appliquaient pas | A |
| 3 | Une demande d'ami n'expirait jamais | Demandes fantômes indéfiniment | A |
| 4 | On pouvait bloquer, jamais voir qui ni débloquer (« passer par le support ») | Blocage irréversible de fait | A |
| 5 | `private.titan_effort_days`, source de **tous** les comptes collectifs, ignorait l'anti-triche : une séance dont la récompense était **retenue** ou **annulée**, ou jamais tamponnée par le serveur, comptait | Duo, défis, expéditions et leurs titres, guilde, quête commune, saisons, objectif mondial, factions et la « semaine tenue » (50 crédits cosmétiques) acceptaient des séances non confirmées | B |
| 6 | Le résultat d'un défi terminé nommait tous les participants à tous, inconnus d'un lien ouvert et comptes bloqués compris | Fuite de pseudos que le tableau en cours cachait déjà | B |
| 7 | Le TITAN Duo oubliait son issue : à la fin des 14 jours, rien ne disait si l'objectif commun était atteint | Aucune célébration, aucune reprise | B |
| 8 | Les clubs n'avaient aucun objectif commun | Espace d'annonces seulement | B |
| 9 | Aucune expérience coopérative RPG entre amis (« La Grande Cordée » seulement conçue) | — | C |
| 10 | Rien ne rassemblait ce qui s'était passé dans son cercle depuis la dernière visite | — | D |

## A. Amis et interactions — `20261120090000_social_friends.sql`

- **Lien d'invitation personnel** : un usage, 7 jours, révocable, 5 liens vivants, 20 créés par jour. Le créateur consent en le créant,
  la personne qui l'ouvre en l'acceptant ; **rien n'est écrit avant « Accepter »**. Seul le SHA-256 du jeton est stocké. L'aperçu ne
  nomme l'invitant qu'à un compte connecté. Bloqué, suspendu, propre lien, lien utilisé, retiré ou expiré : même réponse « invalide ».
  Web `/social?invitation=…`, Android (lien vérifié `/social`) : carte « X t'invite à devenir ami ».
- **Demandes** : expirent après 30 jours (masquées, refusées à l'acceptation, remplacées si l'on redemande) ; demandes envoyées
  listées avec leur échéance et **annulables** ; une demande d'un compte bloqué ou suspendu n'est plus acceptable.
- **Comptes bloqués** : liste de ses propres blocages, « Débloquer » (l'amitié n'est pas rétablie) ; un bloqué ne voit jamais qui l'a bloqué.
- **Limites** : les six limites mortes comptent désormais (le limiteur écrit lui-même la ligne ; les appelants qui l'écrivaient déjà ne
  comptent pas double).
- Export du compte : les liens créés (dates et état, jamais de jeton).

## B. Duos, défis, clubs — `20261120100000_social_groups.sql`

- **Séances confirmées seulement** : `private.titan_confirmed_sessions` (règle des quêtes périodiques : statut `valid`, non suspecte, non
  archivée, non historique, `serverReward = true`, aucune récompense retenue ou annulée). Une séance retenue compte dès sa libération.
  Toute séance non historique est analysée à l'enregistrement, même au-delà du plafond d'XP : une séance invraisemblable sans XP est
  retenue elle aussi (montants nuls). Le classement équitable entre amis lit les mêmes séances confirmées.
- **Résultat d'un défi** : nommé seulement à soi, à ses amis et au partenaire d'un lien partagé, comme le tableau en cours.
- **TITAN Duo** : un binôme qui atteint ses 14 jours est **figé une fois** (jours actifs de chacun, atteint ou non) ; le résultat reste
  14 jours (« Objectif atteint avec Léa · 13 / 12 », « Repartir avec Léa ») ; un ancien partenaire qui n'est plus ami n'est plus nommé ;
  un arrêt anticipé ne fige rien. Toujours sans devoir pratiquer le même sport (jours actifs, tous sports).
- **Club** : un administrateur fixe un objectif hebdomadaire en minutes d'effort ; chaque membre lit le total et le nombre de membres
  actifs, jamais un nom ni une part ; à partir de 3 membres seulement (seuil des trophées de saison), sinon l'objectif seul.

## C. La Grande Cordée — `20261120110000_grande_cordee.sql`, `js/core/cordee.js`

Une expédition coopérative entre amis de sports différents, **mode des défis entre amis** (`titan_challenges.kind = 'cordee'`) : les
invitations, l'acceptation, le départ, les liens à usage unique, la règle des noms, les blocages, les résultats figés, le Panthéon,
l'export et l'effacement du compte sont **réutilisés**, rien n'est dupliqué.

| Ce que le joueur comprend | Comment le serveur le compte |
|---|---|
| **L'objectif commun** : « 30 longueurs ensemble, soit 10 par membre encordé » | part = allure (douce 3, régulière 5, soutenue 8 par semaine) × durée (7 à 28 jours) ; objectif = part × membres encordés |
| **Sa contribution** : « Ta part : 4 longueurs sur 10 » ou « Ton brin est tressé » | par jour : 1 longueur dès 12 min d'effort compté, 2 dès 35 min, jamais plus ; compte jusqu'à 1,5 × la part |
| **La progression du groupe** : « La cordée : 29 / 30 (dont 4 grâce à la variété des sports) », quatre camps | somme des parts plafonnées + 2 longueurs par famille de sport au-delà de la première (familles TITAN LIVE, table semée `private.titan_live_sports`), 8 au plus |
| **Ce qui a été débloqué** : camps à 25, 50, 75, 100 %, récit de la route, titre au sommet | sommet écrit **une fois** sous verrou de ligne ; résultats figés ; titre de route (`cordee:aube` → « Brin de l'Aube ») pour chaque membre qui a apporté au moins une longueur |

- **Équité** : une marche débutante de 20 min vaut la moitié d'une sortie de trois heures ; le plafond empêche un athlète entraîné de
  porter seul le groupe au sommet ; un membre qui se repose ne condamne pas les autres. Mêmes longueurs pour la même régularité dans
  les cinq familles (`tests/cordee.test.mjs`). Écart assumé avec `GAME_DESIGN.md` § 8.1 : la variété **ouvre** des longueurs mais n'est
  pas une condition (deux amis coureurs n'auraient jamais pu réussir).
- **RPG** : quatre routes, une par monde de l'Aventure (Aube, Marées, Forges d'Obsidienne, Aurores), qui prolongent le chapitre 9 de la
  chronique TITAN LIVE (« La Grande Cordée »). Aucune XP, aucun crédit, essence ou éclat : l'équilibrage du RPG n'est pas touché ; le
  titre est cosmétique et se porte comme un titre d'expédition. Rien ne s'achète.
- **Limites** : 3 cordées créées par jour, 3 cordées en cours menées, 7 amis invités, 10 membres (limite des liens de défi).
- Au sommet : « Porter le titre » et « Partager ce sommet » (un Moment pour ses amis, jamais public).
- Web : section « La Grande Cordée » de la Communauté ; page `/defi` d'un lien de cordée (sans aucun nom). Android : Communauté > Défis.

## D. Fidélisation — `20261120120000_social_digest.sql`, `js/core/social-digest.js`

« **Depuis ta dernière visite** » (Web, haut de la Communauté) et « **Dans ton cercle** » (Android, Communauté > Amis, à partir de l'heure
de dernière visite du QG) : une lecture seule qui rassemble, depuis la dernière visite (1 heure à 30 jours) :
un sommet ou un Duo à célébrer, la cordée et ses camps, une invitation qui attend, les défis terminés, les Moments que des amis ont
**choisi** de partager, les encouragements reçus, les demandes, les amis actifs **s'ils l'autorisent** (`socialPresence`, jamais quoi,
où ni combien), un souvenir (« il y a 50 jours, vous atteigniez La voûte des Aurores à 4 ») et **une** suggestion de cordée dont
l'allure suit les 28 derniers jours (jamais plus que ce qui a été fait). Rien n'est envoyé : ni notification ni courriel ; rien
n'apparaît quand rien ne s'est passé ; aucun jour manqué, aucune série, aucune urgence (`tests/social-digest.test.mjs`,
`tests/no-pressure-mechanics.test.mjs`).

## Relecture indépendante (agent relecteur, 20 novembre 2026) et corrections

| Constat | Correction |
|---|---|
| Une cordée pouvait atteindre le sommet avec son seul créateur (part × 1) puis se fermer avant que les invités répondent | Un invité qui n'a pas répondu compte dans l'objectif pendant les 48 premières heures (ensuite seuls les membres encordés comptent : un invité silencieux ne bloque jamais le sommet) ; dès deux personnes, deux membres doivent avoir apporté une longueur ; aucun sommet dans les 48 premières heures |
| `titan_challenge_result_v1` pouvait figer une cordée comme un défi individuel avant son sommet (titres perdus, Panthéon faussé) | Une cordée y est réglée par sa propre règle ; résultats d'un inconnu sans progression |
| La variété comptait des familles de séances symboliques (1 min) | Une famille compte seulement pour une séance avec effort, un jour qui a apporté au moins une longueur |
| Un membre sans nom exposait sa progression et ses familles de sport | Un membre que l'on ne peut pas voir n'est que « Membre de la cordée » ; seuls les totaux de la cordée restent |
| La liste des blocages pouvait révéler le pseudo d'un compte privé à partir de son identifiant | Nom seulement pour un profil trouvable ou un ancien contact (demande d'ami entre les deux) ; sinon « Compte bloqué » |
| Effacement inutile d'une demande expirée (annulé par l'erreur qui suivait) ; effacement possible d'une amitié acceptée en concurrence | Refus simple ; verrou de ligne et effacement limité à une demande encore en attente |
| Boucle de règlement sur toutes les anciennes cordées | Limitée à la fenêtre affichée (14 jours) |
| Limites (liens vivants, cordées en cours, compteurs sociaux) contournables par appels parallèles | Verrou consultatif par compte et par action dans le limiteur, appelé avant les comptages |
| Les titres de route disparaissaient si le créateur d'une cordée effaçait son compte | Titres conservés dans `private.titan_cordee_titles` (effacés seulement avec le compte de leur titulaire) ; décrits dans la politique de confidentialité et la page de suppression |

## Fiabilité et sécurité — ce qui est vérifié

| Exigence | Preuve |
|---|---|
| Aucune amitié sans l'accord du destinataire | `300_social_friends.sql` (lien : rien avant acceptation ; code : demande en attente), `300_v131_friendship_consent.sql` |
| Isolation entre comptes, activités privées illisibles | `300_social_digest.sql` (Moment privé, inconnu, ami bloqué absents), `300_social.sql`, `300_user_isolation.sql`, `300_rls_coverage.sql` ; aucune table nouvelle n'a de droit d'API |
| Invitations expirées, refusées, révoquées | liens ami (expiré, révoqué, utilisé, bloqué) ; demandes expirées ; Duo refusé ; cordée déclinée |
| Blocage | lien refusé, amitié terminée, cordée du bloqueur quittée, noms masqués, liste de ses blocages |
| Déduplication | une ligne par membre (clé primaire), un sommet unique (verrou), résultats `on conflict do nothing`, longueurs par jour |
| Départs et suppressions | départ d'une cordée (objectif réduit), départ d'un club, effacement du compte (cascades existantes) |
| Attribution unique des récompenses | titre de route = résultat figé ; aucune XP ni crédit (vérifié dans chaque test SQL) |
| Séances confirmées seulement | `300_social_groups.sql` (retenue, annulée, non tamponnée), `300_grande_cordee.sql` (séance retenue ignorée) |
| Abus et spam | six limites rétablies, 20 liens par jour, 3 cordées par jour, 7 invités, textes libres absents de la cordée |
| Synchronisation Web/Android | modules partagés copiés à l'octet (`mobile/src/core/web/manifest.json`, `webCore.test.ts`) ; mêmes fonctions serveur |
| Protection des mineurs | **Non vérifiable** : TITAN ne demande pas l'âge (décision du propriétaire déjà relevée dans `TITAN_ONE.md` § 0 bis). La couche ajoutée ne contient aucun texte libre nouveau, rien de public, des noms visibles seulement entre amis, et le lien personnel ne vaut que pour une personne |

## Tests

| Suite | Résultat |
|---|---|
| SQL : `tools/db/test-migrations.sh` (référence de production + toutes les migrations + 130 fichiers `sql/tests/300_*`) | vert ; nouveaux : `300_social_friends`, `300_social_groups`, `300_grande_cordee`, `300_social_digest` ; 18 jeux d'essai marquent désormais leurs séances « tamponnées par le serveur » (la règle qu'ils supposaient) |
| Web : `pnpm test` | 735 + 3 tests, 0 échec (dont `cordee.test.mjs`, `social-digest.test.mjs`, `production-bundle.test.mjs`) |
| Web : typage `pnpm typecheck` | vert |
| Parcours navigateur (Chromium) | `social-friends` 3, `grande-cordee` 5, `social-digest` 2, `buddy` 6, `clubs` 5, plus fumée et compte réel : voir la description de la PR |
| Android : `npm run typecheck`, `npx jest` | vert ; 987 tests, 111 suites (nouveaux : `socialFriends`, `cordee`, `circleDigest` ; ajouts à `duo`, `communityLot8`) |

## Migrations préparées (non appliquées)

Paquet `supabase/release-v17/` généré par `node tools/db/build-production-bundle.mjs --bundle v17` : `00-check-before.sql`,
quatre fichiers gardés (refusés s'ils sont rejoués ou si le précédent manque), `99-check-after.sql` avec l'empreinte mesurée sur une
réplique (privé 116 fonctions, public 320). **Prérequis : v15 et v16**, non appliqués au 20 novembre 2026.

## Ouverture progressive (décision du propriétaire)

1. Appliquer v15, v16 puis v17 (procédure du README de chaque paquet).
2. Créer les drapeaux `screens.friendlinks`, `screens.cordee` et `screens.digest` (centre de contrôle, page « Drapeaux ») : ils se
   résolvent par compte selon leur pourcentage. Les essayer d'abord sur une préproduction à 100 %, ou en production avec un pourcentage
   faible, puis élargir. Refermer un drapeau masque la fonction sans casser ce qui est en cours.
3. `screens.buddy` et `screens.clubs` doivent être ouverts pour voir le résultat du Duo et l'objectif de club.

## Limites qui demandent des appareils ou des comptes réels

- Aucun échange réel entre deux téléphones : invitation envoyée par WhatsApp, lien vérifié Android qui ouvre l'application, acceptation
  depuis un compte fraîchement créé. Les parcours sont simulés (Chromium, Jest) avec des serveurs factices et une base jetable.
- Aucune cordée vécue sur 14 jours par de vrais sportifs : les seuils (12 et 35 min) et les allures (3, 5, 8 longueurs par semaine)
  sont calibrés par simulation ; à revoir après un premier groupe.
- TalkBack, texte à 200 % et Safari non vérifiés sur les nouveaux écrans. Finition graphique de la Cordée volontairement minimale
  (jetons existants, aucun visuel nouveau).

## Relais

- Brancher sur la Grande Cordée les points 2 à 5 de `docs/live/GAME_DESIGN.md` § 8 (bannière d'escouade, Écho d'ami, gardien collectif
  hebdomadaire, défis de progression).
- Afficher les titres de route dans le sélecteur de titre du Profil (le serveur les accepte déjà ; le sélecteur Web liste aujourd'hui
  les insignes de chapitre et les titres d'expédition).
- Android : liste et retrait des liens de défi, création de club (aujourd'hui sur le Web).
