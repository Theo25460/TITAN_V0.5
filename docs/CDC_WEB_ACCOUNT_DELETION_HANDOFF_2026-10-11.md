# Handoff — suppression de compte web (LEG10, LEG09/LEG11 associés)

> **Reprise du 19/10/2026 sur la PR #100** : voir `docs/CDC_WEB_ECONOMY_SECURITY_HANDOFF_2026-10-19.md`. Ne sont plus portés : l'avertissement TITAN+ du Profil et le test navigateur (fichiers réservés à Codex). Le défaut n°4 reste couvert par `deleteOwner`. La passation de guilde crée aussi la ligne de membre manquante d'un successeur hérité.

Chantier AUTRE — Claude Code, 11/10/2026. Branche `claude/titan-cahier-charges-0k7cdn`, construite sur la PR #36 prête, ouverte et non fusionnée : parent `c425e7b4877e575cba48a60354dae29231dd05e3`, arbre `6c23a6ee8a079d867cd338194910c2483605c41c`. Aucune fusion, aucun déploiement, aucune migration appliquée à un projet réel. Le [cahier des charges](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M) n'a pas pu être édité depuis cet environnement (connecteur Drive en lecture seule) : la déclaration, les statuts et la question à reporter sont rédigés en fin de document.

## Résultat du lot

« Profil > Supprimer mon compte » existait (RPC `delete_own_account()`), mais aucun test ne l'exerçait. Une réplique peuplée avec toutes les surfaces v300 a révélé cinq défauts, chacun reproduit avant correction.

| # | Défaut reproduit | Effet | Correction |
|---|---|---|---|
| 1 | `admin_messages.receiver_id` sans règle `ON DELETE` | Un compte ayant reçu un message admin ne pouvait plus être supprimé (erreur de clé étrangère, rien supprimé) | `ON DELETE CASCADE` : ces messages sont des données du compte |
| 2 | `profiles.guild_id` sans règle, `guilds.owner_id` en cascade | Le créateur d'une guilde avec d'autres membres ne pouvait plus se supprimer, que ce soit par la RPC ou par le support | Déclencheur `BEFORE DELETE` sur `auth.users` (un déclencheur `AFTER INSERT` y existe déjà) : avant toute cascade, la propriété passe au plus ancien autre membre, comme dans `titan_leave_guild()`. Les membres « hérités », connus seulement par `profiles.guild_id`, sont aussi pris en compte. Une guilde sans autre membre reste retirée par la cascade existante. `profiles.guild_id` et `delete_own_account()` sont inchangés |
| 3 | `titan_admins.created_by` sans règle | Un admin ayant nommé un autre admin ne pouvait plus se supprimer | `ON DELETE SET NULL` : l'admin nommé garde son rôle |
| 4 | `TitanQueue.deleteOwner()` effaçait l'ancienne clé `titan_training_draft_<id>` | Le brouillon de séance en cours (`titan_seance_draft_v3:<id>`, notes et mesures) et son minuteur restaient sur l'appareil après suppression ; `titanSafeClearCache()` préserve volontairement les brouillons | `deleteOwner()` efface aussi les clés actuelles de `js/app/seance.js`, pour ce compte uniquement |
| 5 | Aucune information sur TITAN+ | Un abonné Paddle supprimant son compte continuait d'être prélevé sans compte | Avertissement factuel, toujours affiché et formulé au conditionnel (l'état TITAN+ peut ne pas être chargé), aligné sur CGU §4.3 : lien de l'e-mail de reçu Paddle ou support |

Lecture seule de la production (catalogue et trois comptages agrégés, aucune donnée personnelle lue) : les trois clés étrangères y sont bien `NO ACTION`. Aujourd'hui 0 message admin, 0 guilde avec d'autres membres et 0 admin nommé : le défaut est latent, mais `titan_create_guild` et `titan_join_guild` restent exécutables par tout membre. La dernière migration appliquée en production est `20261005230000` : aucune migration des PR #19 à #36 n'y figure.

## Fichiers

- `supabase/migrations/20261011061707_account_deletion_integrity.sql` : deux contraintes recréées avec leur règle sur des tables d'administration minuscules (0 ligne concernée en production), seulement si elles ne l'ont pas déjà ; fonction `private.titan_guild_handover_before_account_delete()` (`SECURITY DEFINER`, `search_path` vide, exécution fermée aux rôles API) et son déclencheur, créé une seule fois. Aucune ligne réécrite ; `delete_own_account()` et ses droits sont inchangés. Un second passage ne recrée rien et ne prend aucun verrou de table ; `lock_timeout` local restauré, transaction laissée à l'appelant.
- `sql/tests/300_account_deletion.sql` : comptes synthétiques A (supprimé), B (ami, coach, sportif suivi, membre de la guilde de A), C (modérateur nommé par A, membre d'une guilde héritée de A par son seul profil), D (suspendu, seul dans sa guilde), E et F (suppression par le support d'un propriétaire de guilde). A utilise séance et révision de note, objectif, achat, Moment, encouragements, défi, carte publique, vue d'analyse, Aventure, état de profil, coaching dans les deux sens, analytics consenti, guilde et message admin. Vérifie : `anon` refusé ; suppression confirmée pour l'appelant seul ; rejeu après réponse perdue sans effet ; **balayage de toutes les colonnes uuid/texte/JSON de toutes les tables** sans référence restante ; notes et révisions effacées ; profils, séances et Moments de B et C identiques ; guilde transmise à B ; rôle de C conservé ; guilde héritée transmise à C ; compte suspendu supprimable et guilde vide retirée ; suppression par le support (`service_role`, sans RPC) qui transmet aussi la guilde. Seule exception du balayage : l'entrée `INSERT` du journal d'audit écrite par l'expéditeur du message admin (décision 1).
- `sql/tests/300_z_account_deletion_migration.sql` : double rejeu dans une transaction appelante avec guilde, message et admin existants. Lignes identiques, RPC et droits identiques, second passage sans recréation (mêmes OID), un seul déclencheur actif, fonction de passation non exécutable par `anon`/`authenticated`, règles des contraintes, `lock_timeout` et transaction de l'appelant conservés.
- `js/training-store.js` (référence `300.1` dans les 13 pages qui le chargent), `js/app/profil.js` (`profile.html` en `300.3`).
- `tests/training-integrity.test.mjs` : effacement local limité au compte supprimé (file, historique, brouillon, minuteur ; l'autre compte intact), y compris quand IndexedDB échoue ou manque (`titanForgetOwnerDrafts`, appelé en premier).
- `tests/e2e/smoke.e2e.mjs` : parcours réel de la feuille à 360 et 1280 px, et parcours PWA existant étendu (aucun ancien `training-store.js` ni `profil.js 300.2` servi depuis le cache).

## Vérifications

- RED avant correction, défaut par défaut, sur une réplique sans la migration : la suite SQL échoue sur chacune des deux contraintes prises isolément. Sans le déclencheur, elle échoue sur `profiles_guild_id_fkey` (propriétaire avec membres, par la RPC comme par le support). Sans le repli par `profiles.guild_id`, elle échoue sur la guilde héritée. Un premier essai, qui passait par `titan_leave_guild()` dans la RPC et `ON DELETE SET NULL`, échouait sur `PROFILE_USER_MISMATCH` : le garde de profil refuse, dans la session du compte supprimé, de modifier le profil des autres membres. D'où le déclencheur, qui ne touche que `guilds` et `guild_members`.
- RED client : le test unitaire montre les clés `titan_seance_draft_v3` et `titan_seance_timer_v3` restantes, puis un brouillon conservé quand IndexedDB échoue. L'E2E échoue sans l'avertissement (y compris dans sa version conditionnelle quand l'état TITAN+ manque) et, avec l'ancien `training-store.js`, sur le brouillon conservé.
- GREEN local : banc PostgreSQL 16 natif dans les deux voies de la CI (migrations depuis `20261005150000`, puis bundle historique `release-300.sql` + correctifs), 20 suites SQL par voie (18 + 2) et contrats concurrents existants. `pnpm run verify` : 143/143 tests, build et audit sans erreur, 16 avertissements SEO préexistants. E2E Chromium complet : 101/101 (100 existants + le nouveau parcours), aucune erreur de page.
- Parcours navigateur : confirmation tapée obligatoire, aucun appel avant ; échec réseau sans aucun effacement local (file, brouillon, session) avec nouvel essai possible ; double clic et Entrée pendant la requête n'envoient qu'un appel ; succès : déconnexion, effacement local limité à ce compte, redirection vers l'accueil ; aucune erreur de page.
- Revue indépendante unique (revue de code automatisée, effort élevé) sur `c425e7b..a1e9c20`, avant cette version : sept remarques. Six acceptées et corrigées puis revérifiées RED→GREEN : passation indépendante de `guild_members`, aucune destruction silencieuse de guilde par le support, brouillon effacé avant IndexedDB, rejeu sans recréation ni verrou, avertissement indépendant de l'état chargé, compteur supprimé avec le changement de RPC. La septième (ligne d'audit `DELETE` recréée par la cascade) n'est pas reproduite sur la réplique ; l'exemption du balayage a été réduite à l'entrée `INSERT` de l'expéditeur, pour qu'une telle ligne soit détectée. Pas de seconde revue.

## Décisions et limites (à reprendre)

1. **Journal d'audit administrateur** (`audit_logs`, fermé aux clients) : les entrées des actions du compte disparaissent avec lui ; les entrées d'actions d'un autre acteur qui le citent (ex. message admin envoyé) sont conservées au titre de la sécurité. Rien n'est effacé ou pseudonymisé : choix irréversible et juridique. Durée à fixer (LEG13).
2. **Copie des événements de facturation** (`titan_billing_events`) : `user_id` passe à `NULL`, mais le `payload` Paddle conserve `custom_data.user_id` et les identifiants Paddle. La politique dit « données de facturation chez Paddle » : la copie locale et sa durée doivent être validées puis documentées (LEG03/LEG13). Facturation non modifiée.
3. **Messages de support, signalements, rapports de bug** : `user_id` passe à `NULL`, le contenu (dont un e-mail saisi) reste. Durée absente de la politique : décision humaine requise.
4. **Statistiques consenties** : elles restent comme comptages anonymes (`user_id` à `NULL`), ce qui est cohérent avec la mesure anonyme et la durée de 13 mois de la politique. Vérifié par la suite.
5. **Abonnement Paddle** : la suppression ne le résilie pas ; l'avertissement réduit le risque sans le supprimer. Une résiliation automatique côté serveur relève d'un lot facturation (secret Paddle, idempotence). Le webhook enregistre aussi un événement avec l'ancien `user_id` : pour un compte supprimé, l'insertion échouera sur la clé étrangère et Paddle réessaiera. À traiter dans ce même lot (ignorer ou enregistrer sans compte). Non modifié ici.
6. **Suppression par le support** (Dashboard, `auth.users`) : elle n'échoue plus et transmet les guildes. Elle ne passe pas par la RPC : les messages de chat (`messages.sender_id` sans clé étrangère) restent orphelins jusqu'à leur purge normale (durée annoncée : 48 à 72 h), et les signaux anti-triche gardent leur contenu avec `user_id` à `NULL`. Recommandation : une RPC `service_role` qui réutilise `delete_own_account()`.
7. **Autres appareils** : le serveur révoque les sessions (cascade `auth.sessions`), mais les copies locales d'un autre appareil ne sont effacées qu'à sa prochaine action. Les séances en attente sur ces appareils ne pourront plus se synchroniser.
8. **Google Play (LEG09)** : l'aide officielle n'est pas joignable depuis cet environnement (proxy 403). D'après les résultats de recherche citant la page officielle *Understanding Google Play's app account deletion requirements* (support.google.com, réf. 13327111), il faut un chemin dans l'app (présent), une **ressource web pour demander la suppression sans réinstaller l'app**, les réponses « suppression des données » du formulaire Data safety et une information claire sur les données conservées. Une page publique `/supprimer-mon-compte` est proposée en annexe, non publiée tant que les durées 1 à 3 ne sont pas décidées (Q-002). Relire la page officielle avant soumission (GP01).
9. **Ordre de déploiement** : la migration est compatible avec le client en production (RPC inchangée) et peut précéder ou suivre le site. Gate A11 : sauvegarde et restauration vérifiées avant application. Le client corrigé fonctionne avec l'ancienne RPC.

## Retour arrière

- Client : rétablir `js/training-store.js`, `js/app/profil.js`, leurs références (`300.0`, `300.2`) et les tests à l'arbre parent. Effet : les brouillons du compte supprimé restent sur l'appareil et l'avertissement TITAN+ disparaît.
- Base : supprimer le déclencheur et sa fonction, puis recréer les deux contraintes sans règle `ON DELETE` (aucune ligne orpheline possible). Effet : les comptes concernés redeviennent impossibles à supprimer. Une suppression déjà effectuée ne se restaure pas, et une guilde déjà transmise garde son nouveau propriétaire : c'est l'effet voulu.

```sql
drop trigger titan_guild_handover_before_account_delete on auth.users;
drop function private.titan_guild_handover_before_account_delete();
alter table public.admin_messages drop constraint admin_messages_receiver_id_fkey,
  add constraint admin_messages_receiver_id_fkey foreign key (receiver_id) references auth.users(id);
alter table public.titan_admins drop constraint titan_admins_created_by_fkey,
  add constraint titan_admins_created_by_fkey foreign key (created_by) references auth.users(id);
```

## Annexe — proposition de page publique « Supprimer son compte TITAN » (non publiée)

> **Supprimer ton compte TITAN** — application TITAN, éditée par l'équipe TITAN.
> 1. Connecte-toi sur titan-app.fr (ou ouvre l'application), puis va dans Profil > Compte et données > Supprimer mon compte.
> 2. Écris SUPPRIMER pour confirmer. La suppression est immédiate et définitive.
> 3. Plus d'accès à ton compte ? Écris à titanteam.app@gmail.com depuis l'adresse du compte. Nous répondons sous un mois.
>
> **Supprimé** : compte et identifiants de connexion, profil, journal et notes, objectifs, progression, collection, Moments, encouragements, défis créés, amitiés, liens de coaching, carte publique, vues d'analyse, messages.
> **Conservé** : statistiques d'usage devenues anonymes (13 mois au plus) ; [à valider] données de facturation ; [à valider] journal de sécurité ; [à valider] messages envoyés au support.
> Si tu paies TITAN+, résilie d'abord l'abonnement avec le lien de l'e-mail de reçu Paddle : supprimer le compte ne le résilie pas.

## Texte à reporter dans le cahier (zone de coordination, statuts, questions)

**CHANTIER LIVRÉ — AUTRE (CLAUDE CODE) — SUPPRESSION DE COMPTE WEB — 11/10/2026**
MODÈLE : AUTRE — Claude Code.
PRIORITÉ PRINCIPALE : LEG10 — parcours de suppression de compte fonctionnel et vérifié ; LEG09/LEG11 associés.
PÉRIMÈTRE : suppression `auth.users` (RPC et support), clés étrangères et passation de guilde, effacement local et feuille Profil ; tests SQL, unitaires et E2E ; règles Google Play documentées. Production en lecture seule (catalogue et comptages agrégés).
FICHIERS / MODULES PRINCIPAUX : `supabase/migrations/20261011061707_account_deletion_integrity.sql`, `sql/tests/300_account_deletion.sql`, `sql/tests/300_z_account_deletion_migration.sql`, `js/training-store.js` et ses 13 références, `js/app/profil.js` et `profile.html`, `tests/training-integrity.test.mjs`, `tests/e2e/smoke.e2e.mjs`, `docs/CDC_WEB_ACCOUNT_DELETION_HANDOFF_2026-10-11.md`.
DÉPENDANCES : PR #36 (`c425e7b…`, arbre `6c23a6e…`) ; aucune dépendance au chantier RPG01 ni à Play Console.
NE PAS TOUCHER : RPG (audit Codex en cours), Android/Play Console (WORK), facturation/Paddle/prix, production, main/fusions, textes juridiques.
STATUT : [x]
NOTE DE HANDOFF : voir ce document (cinq défauts reproduits RED puis corrigés, revue unique avec six remarques corrigées, neuf décisions/limites, retour arrière). SQL 20 suites/voie, 143 tests, 101 E2E en local. Migration non appliquée ; Q-002 ouverte.

**Statuts** : LEG10 `[x]`. Note : web vérifié sur branche (réplique PostgreSQL 16 et navigateur), non déployé ; recette réelle après déploiement. LEG09 `[~]`. Note : exigences Google Play relevées, ressource web publique à créer après Q-002, page officielle à relire avant soumission. LEG11 `[~]`. Note : effacement vérifié de bout en bout ; accès/portabilité couverts par les exports existants (QA04) ; rectification et opposition non revérifiées.

**Q-002** — Question : quelles durées de conservation retenir après suppression d'un compte pour (a) le journal d'audit administrateur, (b) la copie locale des événements de facturation Paddle, (c) les messages de support et signalements ? Et faut-il publier une page `/supprimer-mon-compte` pour Google Play ?
Tâche concernée : LEG03, LEG09, LEG10, LEG13, GP05.
Bloquant : NON pour le web ; OUI pour finaliser Data safety et la page publique.
Pourquoi la réponse aide : la page exigée par Google Play et la politique de confidentialité doivent dire exactement ce qui est conservé et combien de temps.
Choix recommandé : conserver (a) et (b) pour la durée légale ou de sécurité la plus courte que vous validez, purger (c) après traitement, puis publier la page en annexe avec ces durées.
Option utilisée temporairement si aucune réponse : rien n'est effacé ni publié ; les données (a) à (c) restent en l'état et le parcours dans l'app est la seule voie documentée.
Réponse utilisateur : [à remplir]
Résolution Codex : [à remplir après lecture]
