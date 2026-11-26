# Paquet canonique v2-05 — Refonte RPG (V1.5.0 à V1.5.5) — NON APPLIQUÉ

> **Statut au 26/11/2026** : préparé par la mission A2 (fusion V2.0) sur la branche d'intégration. **Aucune application en production**
> sans l'accord explicite du propriétaire, une sauvegarde préalable (PITR ou copie logique) et la recette A3.

Généré par `node tools/db/build-production-bundle.mjs --bundle v2-05` depuis `supabase/migrations/` (fichiers SQL) et par
`node tools/db/v2-canonical.mjs readmes` (ce texte). **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` et
`tests/v2-migration-map.test.mjs` échouent si un fichier diffère de sa source.

Ordre : v2-01 → v2-02 → v2-03 → v2-04 → **v2-05** → v2-06 → v2-07 → v2-08. Ce paquet suppose : wraps private.titan_export_extras_v1 after every rewrite (v2-03) and the GPS wrapper (v2-04).

| Fichier | Lot | Origine (fichier et paquet du lot) | SHA du lot | Corps |
|---|---|---|---|---|
| `01-20261130103100_adventure_branches_v1.sql` | V1.5.0 | `20261123090000_adventure_branches_v1.sql` (paquet release-v21) | `1933f36dffefdfd129d31b6a1637773a3a14287d` | identique octet pour octet |
| `02-20261130103200_adventure_guardian_v1.sql` | V1.5.1 | `20261124090000_adventure_guardian_v1.sql` (paquet release-v22) | `f27a635e7d7c0c075dd3a24cb467c2d0f2742768` | identique octet pour octet |
| `03-20261130103300_adventure_consequence_v1.sql` | V1.5.2 | `20261125090000_adventure_consequence_v1.sql` (paquet release-v23) | `e48cf1d6ebc3b81bf9286053438600a11c6158fc` | identique octet pour octet |
| `04-20261130103400_adventure_campaigns_v1.sql` | V1.5.3 | `20261126090000_adventure_campaigns_v1.sql` (paquet release-v24) | `c9eed983c67e13f69459a6c14f64fad4407c7867` | identique octet pour octet |
| `05-20261130103500_adventure_quest_chains_v1.sql` | V1.5.4 | `20261127090000_adventure_quest_chains_v1.sql` (paquet release-v25) | `721cc47ce9693e5e1ebb98efef29aeb51fd41377` | identique octet pour octet |
| `06-20261130103600_adventure_chronicles_v1.sql` | V1.5.5 | `20261128090000_adventure_chronicles_v1.sql` (paquet release-v26) | `52e83b24283e7809d38ce4e828e014db79f3442f` | identique octet pour octet |

## Procédure

1. `00-check-before.sql` : chaque ligne `ok = true` (état attendu, registre à la version `20261130102100`) : `private` 172 fonctions, droits `b8688897b9d4`, corps `3ea4527e4347` ; `public` 349 fonctions, droits `83b7ea4975a1`, corps `6c770c056d27`.
2. Les fichiers `01-…` à `06-…` dans l'ordre, un appel par fichier. Chacun est une transaction gardée : refusé s'il est
   rejoué ou si la migration précédente manque ; un refus ne garde rien et le même fichier peut être rejoué.
3. `99-check-after.sql` : chaque ligne `ok = true` (`private` 211 fonctions, droits `5fd34db4c64f`, corps `40ecab77ebf0` ; `public` 361 fonctions, droits `6c7c5a9dda1f`, corps `19863d8fcd1c`), puis `tools/db/postflight-v11.sql`, `postflight-v13.sql` et `postflight-v131.sql` : toutes vraies.

Empreintes mesurées sur une réplique vierge par `tools/db/measure-v2-fingerprints.sh` (`tools/db/v2-fingerprints.json`).
Répétition complète : `pnpm run test:db` (base jetable vierge) et `tools/db/v2-replica-rehearsal.sh` (réplique synthétique de l'état actuel).

## Retour arrière

Toujours dans l'ordre inverse des paquets (le dernier appliqué d'abord), migration par migration, avec les instructions « Rollback » de
l'en-tête de chaque fichier. Les en-têtes citent les **anciennes** versions des lots : se reporter au tableau de correspondance.
Les fonctions d'export `private.titan_export_extras_v1` sont des enveloppes successives : les retirer dans l'ordre inverse.

## Notes d'origine des paquets remplacés

### V1.5.0 — `supabase/release-v21/README.md` au SHA `1933f36dffefdfd129d31b6a1637773a3a14287d`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v21 (généré) — V1.5.0 Bifurcations, arc pilote de la Vallée de l’Aube — NON APPLIQUÉ EN PRODUCTION
>
> > **État au 19/11/2026** : préparé et répété sur une réplique vierge seulement. L’application en production est une décision du
> > propriétaire (même procédure que v20). Tant que ce paquet n’est pas appliqué, le Web et Android restent sur le contrat v1 des
> > rencontres (repli automatique sur `PGRST202`) et l’arc pilote ne s’affiche pas : rien ne casse.
>
> Généré par `node tools/db/build-production-bundle.mjs --bundle v21` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
> `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` bifurcations | Table privée `private.adventure_branch_entries` (RLS, aucun accès API) : entrée explicite dans l’arc pilote `aube-arc1`, horodatée et versionnée. Contrat versionné `private.titan_adventure_branch_config` (même JSON que `js/core/adventure-branches.js`). `titan_adventure_branch_snapshot_v1` / `titan_adventure_branch_action_v1` (authentifiés) : instantané v1 + bloc `branch`, actions `enter` et `confirm` ; `start`/`sync`/`claim` délèguent à `titan_adventure_rpg_action_v1`. Déclencheur `adventure_branch_gate` : une étape d’une voie confirmée ne s’obtient que si sa condition est remplie, quel que soit le client. Export de compte : section `adventureBranches` ajoutée | Oui, dans « Rencontres secondaires » de la Vallée de l’Aube : au jalon 2, deux voies (corniche, ruines), une confirmation, puis une scène, une interaction et un indice propres à la voie. XP, crédits, jours actifs, objectifs de campagne : inchangés |
>
> La décision réutilise le choix canonique existant (`private.adventure_encounter_rewards`, ordinal 2, choix 0 = corniche,
> 1 = ruines), écrit une seule fois par compte sous le verrou de profil : stable après confirmation, relu par tout autre appareil.
> Une campagne qui avait déjà passé le jalon 2 garde sa version d’origine (`legacy`).
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v20, appliqué le 18 novembre 2026).
> 2. `01-…` (garde d’ordre : refusé s’il est rejoué ou si `20261122090000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131 (la couche d’export V1.5.0 y est suivie).
>
> Empreintes mesurées sur une réplique vierge le 19 novembre 2026 : avant = état v20 attendu (identique, `private` 120,
> `public` 324), après = `private` 125 fonctions, `public` 326 fonctions.
> Répétitions : `sql/tests/300_adventure_branches.sql`, `tools/db/test-branch-concurrency.py` (deux connexions réelles).
>
> Retour arrière : en-tête de la migration (`drop trigger adventure_branch_gate`, suppression des deux fonctions publiques,
> restauration de `private.titan_export_extras_v1` depuis `titan_export_extras_before_branches_v1`). Les clients repassent seuls
> sur le contrat v1.

### V1.5.1 — `supabase/release-v22/README.md` au SHA `f27a635e7d7c0c075dd3a24cb467c2d0f2742768`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v22 (généré) — V1.5.1 Gardiens, le Veilleur de pierre de l’arc pilote — NON APPLIQUÉ EN PRODUCTION
>
> > **État au 19/11/2026** : préparé et répété sur une réplique vierge seulement. Il suppose le paquet v21 (V1.5.0 Bifurcations)
> > déjà appliqué. L’application en production est une décision du propriétaire. Tant que ce paquet n’est pas appliqué, le Web et
> > Android restent sur le contrat V1.5.0 (repli automatique sur `PGRST202`) et le Veilleur garde le parcours v1 : rien ne casse.
>
> Généré par `node tools/db/build-production-bundle.mjs --bundle v22` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
> `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` gardiens | Table privée `private.adventure_guardian_encounters` (RLS, aucun accès API) : préparation, tentatives, issue, versionnées. Contrat versionné `private.titan_adventure_guardian_config` (même JSON que `js/core/adventure-guardian.js`). `titan_adventure_guardian_snapshot_v1` / `titan_adventure_guardian_action_v1` (authentifiés) : instantané V1.5.0 + bloc `guardian`, actions `prepare` et `resolve` ; les autres actions délèguent à `titan_adventure_branch_action_v1`. Déclencheur `adventure_guardian_gate` : la récompense du jalon 6 d’une voie pilote confirmée exige une issue enregistrée, quel que soit le client. Export de compte : section `adventureGuardians` ajoutée | Oui, dans « Rencontres secondaires » de la Vallée de l’Aube, après l’indice : observer le Veilleur (jalon 5), associer l’indice à un signe, puis rouvrir le passage (corniche) ou restituer le serment (ruines). XP, crédits, jours actifs, objectifs de campagne : inchangés |
>
> Les transitions sportives sont les seuils figés du moteur des rencontres (jalon 5 : 5 × cible, 3 jours actifs, chapitre 3 ;
> jalon 6 : 6 × cible, 3 jours, chapitre 3), identiques pour les deux voies. L’issue est écrite une seule fois par compte, sous le
> verrou de profil, à partir de l’indice enregistré par le serveur.
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v21).
> 2. `01-…` (garde d’ordre : refusé s’il est rejoué ou si `20261123090000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131 (la couche d’export V1.5.1 y est suivie).
>
> Empreintes mesurées sur une réplique vierge le 19 novembre 2026 : avant = état v21 attendu (identique, `private` 125,
> `public` 326), après = `private` 130 fonctions, `public` 328 fonctions. Répétitions : `sql/tests/300_adventure_guardian.sql`,
> `tools/db/test-guardian-concurrency.py` (deux connexions réelles), paquet rejoué refusé.
>
> Retour arrière : en-tête de la migration (`drop trigger adventure_guardian_gate`, suppression des deux fonctions publiques,
> restauration de `private.titan_export_extras_v1` depuis `titan_export_extras_before_guardian_v1`). Les clients repassent seuls
> sur le contrat V1.5.0.

### V1.5.2 — `supabase/release-v23/README.md` au SHA `e48cf1d6ebc3b81bf9286053438600a11c6158fc`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v23 (généré) — V1.5.2 Camp et conséquences — NON APPLIQUÉ EN PRODUCTION
>
> > **État au 19/11/2026** : préparé et répété sur une réplique vierge seulement. Il suppose les paquets v21 (V1.5.0 Bifurcations)
> > et v22 (V1.5.1 Gardiens) déjà appliqués. L’application en production est une décision du propriétaire. Tant que ce paquet
> > n’est pas appliqué, le Camp de base et la Vallée n’affichent aucun accès (repli silencieux sur `PGRST202`) : rien ne casse.
>
> Généré par `node tools/db/build-production-bundle.mjs --bundle v23` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
> `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` conséquences | Tables privées `private.adventure_consequences` et `private.adventure_consequence_events` (RLS, aucun accès API) : découverte, tentatives, passages, versionnés. Contrat versionné `private.titan_adventure_consequence_config` (même JSON que `js/core/adventure-consequence.js`). `titan_adventure_consequences_v1()` (lecture, authentifiés) et `titan_adventure_consequence_action_v1(world, discover \| visit, marks)` sous le verrou de profil. `private.titan_adventure_consequence_metrics_v1(14)` : comptes agrégés sans identité, pour le propriétaire. Export de compte : sections `adventureConsequences` et `adventureConsequenceEvents` | Oui, pour un compte qui a résolu le Veilleur : une carte « Retour de la Vallée de l’Aube » dans le Camp de base, qui mène au belvédère (corniche : aligner deux repères du croquis, raccourci entre la clairière des lucioles et le passage du Veilleur) ou à l’archive des passeurs (ruines : rapprocher le fragment d’une gravure, salle annexe). XP, crédits, récompenses, effort, ressources et bâtiments LIVE : inchangés |
>
> L’accès naît de l’issue canonique écrite une seule fois par la V1.5.1. Un compte sans arc pilote, un compte pilote qui n’a pas
> résolu le Veilleur et un compte « legacy » (mini-boss obtenu avant la V1.5.1) ne voient aucun accès : aucune issue n’est inventée.
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v22).
> 2. `01-…` (garde d’ordre : refusé s’il est rejoué ou si `20261124090000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131 (la couche d’export V1.5.2 y est suivie).
>
> Empreintes mesurées sur une réplique vierge le 19 novembre 2026 : avant = état v22 attendu (identique, `private` 130,
> `public` 328), après = `private` 135 fonctions, `public` 330 fonctions ; migration rejouée deux fois : empreintes identiques.
> Répétitions : `sql/tests/300_adventure_consequence.sql`, `tools/db/test-consequence-concurrency.py` (deux connexions réelles),
> paquet rejoué refusé.
>
> Mesure à 14 jours : `select * from private.titan_adventure_consequence_metrics_v1(14);` (SQL editor, rôle propriétaire) donne,
> par issue, les comptes ayant résolu le Veilleur, ceux qui ont découvert l’accès, ceux qui l’ont emprunté, le nombre d’essais et
> de passages dans les 14 jours suivant la résolution.
>
> Retour arrière : en-tête de la migration (suppression des deux fonctions publiques, restauration de
> `private.titan_export_extras_v1` depuis `titan_export_extras_before_consequence_v1`). Les clients masquent alors l’accès.

### V1.5.3 — `supabase/release-v24/README.md` au SHA `c9eed983c67e13f69459a6c14f64fad4407c7867`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v24 (généré) — V1.5.3 Quatre mondes, quatre mécaniques — NON APPLIQUÉ EN PRODUCTION
>
> > **État au 19/11/2026** : préparé et répété sur une réplique vierge seulement. Il suppose les paquets v21 (V1.5.0 Bifurcations),
> > v22 (V1.5.1 Gardiens) et v23 (V1.5.2 Camp et conséquences) déjà appliqués. L’application en production est une décision du
> > propriétaire. Tant que ce paquet n’est pas appliqué, les Marées, la Forge et les Aurores gardent leur journal v1 (repli
> > silencieux sur `PGRST202`) : rien ne casse.
>
> Généré par `node tools/db/build-production-bundle.mjs --bundle v24` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
> `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` campagnes | Configuration commune versionnée `private.titan_adventure_campaign_config` (même JSON que `js/core/adventure-campaigns.js`) pour `marees-arc1`, `forge-arc1` et `aurores-arc1` v1. Les fonctions de contrat V1.5.0 et V1.5.1 (`titan_adventure_branch_config/current`, `titan_adventure_guardian_config/current`) sont redéclarées : littéraux de la Vallée inchangés, trois arcs dérivés de la configuration commune. Colonne `last_answer` dans `private.adventure_guardian_encounters`. Primitive commune `private.titan_adventure_mechanic_check`. `titan_adventure_campaign_snapshot_v1(world)` et `titan_adventure_campaign_action_v1(world, action, …, answer)` (action `solve`) pour les authentifiés | Oui, pour un compte qui ouvre le journal des rencontres d’un des trois mondes et entre volontairement dans le premier arc : un choix, une scène, un indice, puis la mécanique du monde (carte des courants, ordre des pièces, balises à relier) et une issue propre à la voie. XP, crédits, jours actifs, récompenses et effort : inchangés |
>
> Un parcours des trois mondes qui avait déjà passé le choix (ordinal 2) avant ce paquet reste « legacy » : version, récompenses
> et chapitres conservés. Un compte qui n’entre pas garde le journal v1. Une ancienne version de l’application affiche l’arc comme
> « version inconnue » et ne peut ni y entrer ni sauter une étape (déclencheurs V1.5.0 et V1.5.1).
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v23).
> 2. `01-…` (garde d’ordre : refusé s’il est rejoué ou si `20261125090000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131 (aucune nouvelle couche d’export : la
>    colonne `last_answer` apparaît dans la section `adventureGuardians` existante).
>
> Empreintes mesurées sur une réplique vierge le 19 novembre 2026 : avant = état v23 attendu (identique, `private` 135,
> `public` 330), après = `private` 142 fonctions, `public` 332 fonctions ; migration rejouée deux fois : empreintes identiques.
> Répétitions : `sql/tests/300_adventure_campaigns.sql`, `tools/db/test-campaign-concurrency.py` (deux connexions réelles),
> paquet rejoué refusé.
>
> Retour arrière : en-tête de la migration (rejouer les quatre fonctions de contrat de 20261123090000 et 20261124090000, supprimer
> les deux fonctions publiques et les fonctions privées de campagne). Les clients reviennent alors au journal v1 dans ces trois mondes.

### V1.5.4 — `supabase/release-v25/README.md` au SHA `721cc47ce9693e5e1ebb98efef29aeb51fd41377`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v25 (généré) — V1.5.4 Quêtes entre les mondes — NON APPLIQUÉ EN PRODUCTION
>
> > **État au 19/11/2026** : préparé et répété sur une réplique vierge seulement. Il suppose les paquets v21 (V1.5.0 Bifurcations),
> > v22 (V1.5.1 Gardiens), v23 (V1.5.2 Camp et conséquences) et v24 (V1.5.3 Quatre mondes, quatre mécaniques) déjà appliqués.
> > L’application en production est une décision du propriétaire. Tant que ce paquet n’est pas appliqué, le Web et Android
> > n’affichent ni carnet d’indices ni accès depuis la carte (repli silencieux sur `PGRST202`) : rien ne casse.
>
> Généré par `node tools/db/build-production-bundle.mjs --bundle v25` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
> `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` chaînes de quêtes | Table `private.adventure_quests` (une ligne par compte et par chaîne, version figée, indice d’entrée, essais, manière, issue). Contrat versionné `private.titan_adventure_quest_config` (même JSON que `js/core/adventure-quests.js`) pour `atelier-oublie` et `feux-cote` v1. Les indices ne sont pas stockés : `private.titan_adventure_quest_fact` les lit dans l’état canonique des arcs (issue de gardien V1.5.1/V1.5.3, accès découvert V1.5.2). `titan_adventure_quests_v1()` et `titan_adventure_quest_action_v1(chain, start|link|choose|resolve, answer, manner)` pour les authentifiés. Mesure agrégée `private.titan_adventure_quest_metrics_v1()` (propriétaire seulement). Section d’export `adventureQuests` | Oui, pour un compte qui détient un indice : un carnet d’indices (origine, état, destination) dans la vue Carnet, un bouton sur la carte du monde, puis une piste facultative en quatre étapes. XP, crédits, jours actifs, balises, récompenses et effort : inchangés |
>
> Aucun déclencheur n’est ajouté : aucune étape d’une campagne principale n’attend une chaîne. Une chaîne commencée garde sa
> version et son indice d’entrée ; une version ultérieure ne peut qu’ajouter des indices (contrôle `audit()`).
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v24).
> 2. `01-…` (garde d’ordre : refusé s’il est rejoué ou si `20261126090000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131 (ils suivent la nouvelle couche
>    d’export `titan_export_extras_before_quests_v1`).
>
> Empreintes mesurées sur une réplique vierge le 19 novembre 2026 : avant = état v24 attendu (identique, `private` 142,
> `public` 332), après = `private` 149 fonctions, `public` 334 fonctions ; migration rejouée deux fois : empreintes identiques.
> Répétitions : `sql/tests/300_adventure_quest_chains.sql`, `tools/db/test-quest-concurrency.py` (deux connexions réelles),
> paquet rejoué refusé.
>
> Retour arrière : en-tête de la migration (supprimer les deux fonctions publiques ; restaurer `private.titan_export_extras_v1`
> depuis `titan_export_extras_before_quests_v1`). Les clients masquent alors le carnet sans erreur.

### V1.5.5 — `supabase/release-v26/README.md` au SHA `52e83b24283e7809d38ce4e828e014db79f3442f`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v26 (généré) — V1.5.5 Chroniques et aventures rejouables — NON APPLIQUÉ EN PRODUCTION
>
> > **État au 23/11/2026** : préparé et répété sur une réplique vierge seulement. Il suppose les paquets v21 (V1.5.0 Bifurcations),
> > v22 (V1.5.1 Gardiens), v23 (V1.5.2 Camp et conséquences), v24 (V1.5.3 Quatre mondes, quatre mécaniques) et v25 (V1.5.4
> > Quêtes entre les mondes) déjà appliqués. L’application en production est une décision du propriétaire. Tant que ce paquet
> > n’est pas appliqué, le Web et Android n’affichent ni chroniques ni relance (repli silencieux sur `PGRST202`) : rien ne casse.
>
> Généré par `node tools/db/build-production-bundle.mjs --bundle v26` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
> `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` chroniques | Table `private.adventure_arc_runs` (parties 2 à 100 d’un premier arc : version de l’arc et des règles figées, voie, étapes, essais de la mécanique, issue, abandon ; une seule partie active par compte et par arc, index unique partiel). Table `private.adventure_chronicle_events` (relecture, départ, résolution, abandon ; 2 000 par compte au plus). La partie 1 n’est pas recopiée : `private.titan_adventure_chronicle_original` la lit dans les faits des arcs (récompenses 1 à 6, entrée V1.5.0, gardien V1.5.1/V1.5.3, accès V1.5.2, pistes V1.5.4). Règles versionnées `private.titan_adventure_chronicle_config` (même JSON que `js/core/adventure-chronicles.js`). `titan_adventure_chronicles_v1()` et `titan_adventure_chronicle_action_v1(world, start\|choose\|advance\|solve\|resolve\|abandon\|read\|sync, …)` pour les authentifiés. Mesure agrégée `private.titan_adventure_chronicle_metrics_v1()` (propriétaire seulement). Sections d’export `adventureRuns` et `adventureChronicleEvents` | Oui, pour un compte qui a commencé un monde : les Chroniques dans la vue Carnet (Web) et sous la carte du monde (Android), puis, une fois le premier arc achevé, « Rejouer ». XP, crédits, jours actifs, balises, récompenses, effort et registre d’effort : inchangés |
>
> Aucun déclencheur n’est ajouté et aucune table existante n’est écrite : l’issue active dans le monde reste celle de la première
> partie (accès du camp, carnet d’indices, campagne). Une partie n’avance qu’avec les séances confirmées créées et datées après son
> choix, dans le registre de ce monde ; elle ne rapporte rien.
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v25).
> 2. `01-…` (garde d’ordre : refusé s’il est rejoué ou si `20261127090000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131 (ils suivent la nouvelle couche
>    d’export `titan_export_extras_before_chronicles_v1`).
>
> Empreintes mesurées sur une réplique vierge le 23 novembre 2026 : avant = état v25 attendu (identique, `private` 149,
> `public` 334), après = `private` 159 fonctions, `public` 336 fonctions ; migration rejouée deux fois : empreintes identiques.
> Répétitions : `sql/tests/300_adventure_chronicles.sql`, `tools/db/test-chronicle-concurrency.py` (deux connexions réelles),
> paquet rejoué refusé (« migration 20261128090000 is already registered »).
>
> Retour arrière : en-tête de la migration (supprimer les deux fonctions publiques ; restaurer `private.titan_export_extras_v1`
> depuis `titan_export_extras_before_chronicles_v1`). Les clients masquent alors les chroniques sans erreur.
