# TITAN — Excellence sportive (18 novembre 2026)

Branche `claude/adoring-pascal-pq814x`, partie de `main` à `a4dc113` (PR #149 fusionnée). Mission indépendante de la PR #150
(UX/UI Web) : aucun fichier de #150 n'est réécrit ; la fusion à blanc des deux branches est propre (seul `social.html` est touché
des deux côtés, à des lignes différentes). Rien n'a été appliqué en production.

## 1. Ce qui a changé, par lot

### Lot A — chaîne séance → statistiques (Web et Android)

| Défaut constaté (audit) | Correction | Où |
|---|---|---|
| Limite de débit serveur (`TRAINING_RATE_LIMIT`, SQLSTATE 23514) traitée comme refus définitif : à partir de la 13ᵉ séance de l'heure, tout restait « refusé » | Temporaire sur les deux clients ; la file reprend seule | `js/main.js`, `mobile/src/lib/errors.ts` |
| Code brut affiché (« TRAINING_RATE_LIMIT ») ; séance réellement refusée impossible à retirer | Motif en mots ; « Retirer les séances refusées » (Web, confirmation) | `js/main.js`, `js/app/journal.js` |
| Suppression Android d'une séance en cours d'envoi (le serveur l'enregistrait quand même) | Bouton désactivé pendant l'envoi | `PendingScreen.tsx` |
| Une boîte de liens de parcours pleine bloquait toute la file Android | Le lien n'empêche plus de retirer une séance déjà envoyée | `mobile/src/data/queue.ts` |
| Séances retenues, signalées, refusées ou archivées comptées dans records, progression, grille de la semaine, badges | Règle unique `TitanTraining.counted` (celle de Carrière et du bilan mensuel) | `js/training-store.js`, `js/sport-insights.js`, `js/core/progress.js`, Android `hooks.ts`, `ProgressScreen`, `JournalScreen` |
| Marathon corrigé à 1 minute devenu record | Correction soumise aux mêmes bornes que la saisie ; `TitanTraining.plausible` écarte les mesures invraisemblables des records | `journal.js`, `training-store.js` |
| Android sans contrôle de vitesse ; 300 km au lieu de 1000 ; distance inconnue impossible | Bornes partagées alignées sur le déclencheur serveur (`TitanTraining.measureIssues`) | `training-store.js`, `mobile/src/core/session.ts` |
| Cotation « V5 » acceptée sous Fontainebleau sur Android (jamais comptée en record) | Même lecteur de cotation que les records | `session.ts` |
| « Maintenant » datait la séance à sa fin : sortie 23 h 15–0 h 10 rangée le lundi, dans la semaine suivante | La séance commence sa durée avant l'enregistrement (Web et Android) | `seance.js`, `session.ts` |
| Même effort saisi deux fois (montre puis saisie, GPX importé deux fois) sans avertissement | Question unique avant l'enregistrement, identifiants voisins compris ; rien n'est fusionné | `sport-contracts.js findDuplicate`, `seance.js`, `SessionFormScreen` |
| Brouillon GPS Android écrasé par n'importe quel autre formulaire, effacé après 48 h : seule copie de la distance mesurée | Brouillon GPS épinglé jusqu'à l'envoi ou l'abandon explicite (carte « L'ouvrir / L'abandonner ») | `drafts.ts`, `SessionFormScreen` |
| Bassin et « distance inconnue » supprimés à l'enregistrement Web ; colonne Ressenti toujours vide ; type d'exercice perdu à la correction | Conservés ; lecture `bio.rpe` ; `kind` transmis | `titan_features.js`, `journal.js` |
| `localStorage` plein : séance durable affichée « non enregistrée », puis doublon à la nouvelle tentative | L'instantané local ne transforme plus un succès en échec | `main.js` |
| Nombre illisible enregistré comme « distance inconnue » | Message explicite | `seance.js` |
| Progression d'un record recalculée sur chaque préfixe (4 s pour 600 séances), records recalculés à chaque frappe du Journal | Linéaire ; calcul une fois par changement d'historique | `records.js`, `journal.js` |

### Lot B — les 260 sports, contrats par famille

`js/core/sport-contracts.js` (copié tel quel dans l'application) décide ce qu'un formulaire **demande** pour chaque discipline :

| Formulaire (famille) | Mesuré par le formulaire lui-même | Comparé en progression sur |
|---|---|---|
| distance (course, vélo, marche, ski de fond, rame…) | distance, durée, dénivelé (si la famille grimpe ou si le catalogue le mesure) | allure (pieds) ou vitesse (roues, glisse, eau) |
| natation | mètres, durée, bassin | allure aux 100 m |
| force | exercices, séries, charges, répétitions, RIR | meilleure série, volume par exercice |
| poids du corps | mouvements, séries, répétitions, maintiens | répétitions |
| escalade | discipline, lieu, système, essais, réussites, cotation | meilleure cotation dans un même système |
| pratique (raquettes, collectifs, combat, yoga, précision…) | durée | durée ; mesures propres affichées côte à côte, jamais jugées |

Chaque discipline ajoute ensuite les champs de son groupe (`tools/data/sport-metrics.mjs`). Le catalogue serveur gardait aussi
**675 champs historiques** hors sujet, tous demandés jusqu'ici : note générique « Qualité exécution 1–10 », « Erreurs », « Actions
réussies » (sous la marche, le trail, le yoga…), cadence et chutes sous l'apnée, dénivelé et descentes sous le patinage artistique,
« top set » en double de l'éditeur de séries, douleur avant/après (donnée de santé) sous le yoga, score sans score adverse au
beach-volley, allure et nage sous l'aquagym, rounds et ateliers sous le triathlon… Ils ne sont plus demandés, chacun avec sa raison
(`audit()`), mais **une valeur déjà saisie reste affichée et modifiable** ; le catalogue serveur, sa validation, l'historique et les
récompenses sont inchangés (aucune migration). Garanties testées : chaque sport demande au moins trois mesures propres ; aucun ne
demande une note générique, une auto-évaluation ou une donnée de santé ; aucun formulaire ne demande deux fois ce qu'il mesure.
Correctif lié : la course d'orientation, la course à obstacles et le rogaining demandent enfin leur dénivelé.

### Lot C — intégrations

| Sujet | État |
|---|---|
| Santé Connect : 13 (CALISTHENICS) lu « danse », 49 (PLANK) « pilates », vraies danse (16) et pilates (48) ignorées | Corrigé d'après les constantes de la bibliothèque ; 52 types sans ambiguïté (tennis, HIIT, football, escalade, escaliers, tapis, rameur, eau libre…) ; types ambigus (arts martiaux, ski, pagaie, frisbee, autre) non devinés, l'écran le dit |
| Carte du QG lisant Santé Connect sur la seule permission Android (même après « Arrêter ») | Exige aussi le consentement TITAN |
| Archivage des imports : bouton disparu après arrêt (promis par le message) ; Garmin non archivable sur Android ; historique Strava non archivable (serveur) | Corrigé côté clients ; serveur dans le paquet v15 |
| Bouton GPS absent pour VTT, marche nordique, roller… (la liste nommait « mtb », une famille) | 32 sports de plein air de la forme distance |
| GPX très long refusé définitivement (> 50 Ko de détails) | Profil et intervalles allégés jusqu'à passer |
| Même effort importé sous deux identifiants voisins (Garmin « treadmill », Santé Connect « running ») : deux séances, deux récompenses | Migration `20261118090000` : groupes d'identifiants voisins (mêmes groupes que les clients) |
| Nage Garmin enregistrée en km (2 000 m → « 2 km ») | Migration : mètres pour les sports mesurés en mètres |

### Lot D — progression personnelle (`js/core/progression.js`, partagé)

- **Par rapport à ta séance comparable** (fiche du Journal Web, détail de séance Android) : même sport et taille comparable
  (distance à 25 % près, même exercice, même système de cotation) ; allure, vitesse, allure aux 100 m, meilleure série (même charge
  avec plus de répétitions = progrès), volume, cotation ; sous le seuil (2 % allure, 2,5 % charge, 10 % volume), « stable ».
- **Quelles disciplines progressent ?** (Statistiques Web, Progrès Android) : chaque discipline, pas seulement la principale
  (vitesse à vélo, allure en natation, cotation, exercice le plus pratiqué), 6 premières semaines contre les 6 dernières, avec le
  nombre de séances mesurées derrière chaque valeur.
- **Ces 4 semaines par rapport aux 4 précédentes** : séances, jours actifs et minutes **déclarées** par discipline ; les séances
  sans durée sont comptées, leur estimation TITAN est donnée à part ; pas de comparaison avec une période antérieure au journal.

Jamais : 1RM estimé, score, zone, conseil, estimation présentée comme mesure. Les séances retenues ou invraisemblables ne servent
jamais de référence. La préparation (refaire une séance, routines, dernière performance par exercice) existait déjà sur les deux
clients et n'a pas été dupliquée.

## 2. Preuves

| Contrôle | Résultat |
|---|---|
| `pnpm test` (Web, unitaires) | 697 tests, 0 échec ; nouveaux : `sport-contracts` (9), `session-reliability` (6), `progression` (9) |
| `pnpm run typecheck` (sport core) | vert |
| Jest Android + `tsc` | 959 tests, 107 suites, 0 échec |
| `pnpm run test:db` (réplique vierge, toutes migrations, tests SQL) | vert, dont `300_sport_excellence_imports.sql` |
| Parcours navigateur ciblés | `sport-measures` 7/7 (260 formulaires à 360 px), `session-local-date` 9/9 (alerte de doublon), `progression` 2/2, chaîne de séance 448/448 |
| `pnpm run verify` (typage, tests, build, audit, garde de publication) | vert |
| Suite navigateur complète (`pnpm run test:e2e`, Chromium) | 1 050 / 1 052 ; les 2 échecs (onglets de l'Aventure, passeport du Profil à 1280 px) passent 3 fois sur 3 isolément : parcours intermittents sous charge déjà signalés (`TITAN_ONE.md` § 7.5), pages non modifiées hormis une balise de script |
| Relecture indépendante du diff | 1 défaut réel trouvé et corrigé (`67190f7` : une seconde séance GPS ou live n'est plus perdue quand une autre attend) |

Rien n'a été vérifié sur un téléphone, un compte Garmin réel ou une vraie base Santé Connect : les intégrations sont prouvées par
tests automatisés et simulations uniquement.

## 3. Contrats partagés modifiés (impact Web / Android / RPG)

- `mobile/src/core/web/` reçoit deux modules de plus (`sport-contracts.js`, `progression.js`) et les versions modifiées de
  `sports.js`, `training-store.js`, `sport-insights.js`, `progress.js` (empreintes : `manifest.json`, test `webCore`).
- `TitanProgress.activeLogs` et `TitanInsights.active` excluent désormais les séances `is_suspicious`, `flagged`,
  `pending_review`, `rejected` et les éléments refusés de la file. Effet : cadence, maîtrise, chapitre de la semaine et records
  affichés côté client n'en tiennent plus compte. **L'XP et les récompenses restent calculées par le serveur, inchangées.**
- « Maintenant » : `date` = début de l'effort. Une séance à cheval sur minuit compte pour le jour où elle a commencé (quêtes,
  cadence, plafonds journaliers serveur). Le contrôle « date future » du serveur n'est pas concerné.
- Paquet v15 : le rapprochement des imports change seulement *quand* un import est lié (moins de doublons, donc moins de
  récompenses en double). Aucune règle de récompense n'est modifiée.

## 4. Relais au chantier RPG / TITAN LIVE

1. TITAN LIVE (`js/core/live-voies.js`) filtre les champs `legacy` mais lit encore les champs historiques non génériques : utiliser
   `TitanSportContracts.entryFields(sport, fields)` pour que les missions ne visent pas une cadence d'apnéiste ou un dénivelé de
   patinage artistique.
2. Les vues d'aventure qui comptent les séances côté client voient désormais les mêmes séances que le serveur (sans les retenues) ;
   vérifier qu'aucun texte n'annonce un progrès que le serveur n'a pas accordé.
3. `TitanProgression.compare` donne un « progrès mesuré » fiable (direction + seuil) : candidat naturel pour une scène de moment
   fort « record / progrès », à condition de n'afficher qu'après confirmation serveur de la séance.
4. Séance à cheval sur minuit : vérifier les quêtes journalières qui lisaient l'heure d'enregistrement.

## 5. Interface à prévoir (pour l'équipe UX, sans maquette)

Les réponses du Lot D sont livrées en cartes et listes existantes (`wk-q`, `moment-metrics`, `Card`/`T`). Besoins : une rangée
« avant → maintenant » compacte avec le mot de direction (jamais la couleur seule) ; une petite série par discipline (les points sont
dans `disciplines()`) ; la carte « séance GPS en attente » d'Android ; l'alerte de doublon (titre, séance existante, deux actions).

## 6. Limites et décisions qui restent

- **Paquet v15 non appliqué** (`supabase/release-v15/README.md`) : sans lui, un import sous un identifiant voisin peut encore créer
  un doublon (l'alerte client ne couvre que la saisie manuelle), une nage Garmin reste en km et l'archivage Strava échoue.
- Garmin : une activité **modifiée** chez Garmin n'est pas reportée (documenté dans `docs/GARMIN.md`) ; les types non associés
  (tennis, golf, padel, surf…) restent ignorés, et ROAD/MOUNTAIN/INDOOR biking deviennent « cycling » (sans doublon grâce aux
  groupes, mais sans distinction de discipline).
- Santé Connect : les séances importées n'ont pas de distance (lecture des distances = nouvelle permission, à tester sur téléphone).
- Import Strava : seuls les exports en anglais et en unités métriques sont compris (non vérifié sur de vrais fichiers).
- Les traces GPS Android sont envoyées dans la bibliothèque privée « Mes parcours » (≈ 1 m, départ et arrivée compris) sans option
  pour ne garder que les totaux : décision produit.
- 30 exercices au plus par séance de force (borne de la correction serveur) : une séance plus longue est refusée à la saisie.
