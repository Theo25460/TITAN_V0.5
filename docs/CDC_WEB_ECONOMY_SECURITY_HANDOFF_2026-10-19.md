# Handoff — sécurité structurante de l'économie (SEC05, SEC06, SEC10) et reprise LEG10

Chantier AUTRE — Claude Code, 19/10/2026. Branche `claude/titan-cahier-charges-0k7cdn`, reconstruite sur la PR #100 (`530269c573b906779344be9c79e7b9f058bb1261`). Ancienne tête du lot de suppression de compte conservée dans la branche `backup/claude-deletion-c5be003`. Aucune fusion, aucun déploiement, aucune migration appliquée à un projet réel. Production lue uniquement par agrégats (aucune donnée personnelle).

## Trois points, une priorité : « sécurité structurante de l'économie »

| Point | Statut | Ce qui est livré | Preuve |
|---|---|---|---|
| SEC06 — journaux d'audit des transactions virtuelles et de la modération | `[~]` | Journal append-only `private.titan_economy_journal`, alimenté par déclencheur sur `profiles` : solde, XP, niveau (économie), `is_elite`, fin et remboursement (abonnement), `is_suspended`, `status`, `role` (modération). Écrit pour tous les auteurs : RPC joueur, outil service, worker de facturation. Pas de nom, e-mail ni texte. Lecture : RPC `titan_economy_journal_v1` réservée aux administrateurs, bornée à 200. | `sql/tests/300_economy_audit.sql` ; 5 mutations détectées (garde de ligne, garde de troncature, déclencheur, droit de lecture, immutabilité). |
| SEC05 — contraintes contre soldes négatifs, doublons et états impossibles | `[~]` | Les trois CHECK crédits/XP/niveau et les contrôles de rôle/statut, préparés `NOT VALID`, sont validés ; nouveau CHECK sur les montants d'achat (`shop_history`). Contrôle de production : 6 profils, 5 achats, 0 violation. | `sql/tests/300_z_economy_audit_migration.sql` (précondition non validée, validation, rejeu sans recréation, données et droits inchangés). |
| SEC10 — attaques logiques boutique, Premium, séances | `[~]` | `sql/tests/300_economy_attacks.sql` : joueur hostile (avec `user_metadata` forgé) contre écritures directes de solde, XP, niveau, abonnement, rôle et statut, faux historique, faux inventaire et faux reçus, six fonctions internes, achats inconnus ou injectés ou répétés ou sans fonds, séances absurdes, futures ou mal formées, métadonnées de récompense forgées, auto-attribution Premium, compte suspendu, accès anonyme. | Aucune faille trouvée : la matrice verrouille les protections existantes. Deux ouvertures volontaires (droit sur `add_rewards`, RLS de `shop_history`) la font échouer ; retirer un seul garde de profil ne suffit pas (défense en profondeur). |

Aucun point n'est fermé : voir « Bloquant » et « Backlog ».

## Reprise du lot LEG10 (suppression de compte) sur la chaîne

Le lot livré le 11/10 est repris sur la PR #100. Conservé : migration `20261011061707_account_deletion_integrity.sql`, suites `300_account_deletion*.sql`, `js/training-store.js`, test unitaire, handoff du 11/10. **Non repris** pour respecter les réservations Codex (`js/app/profil.js`, `profile.html`, `tests/e2e/smoke.e2e.mjs`) : l'avertissement TITAN+/Paddle dans la feuille de suppression et son test navigateur. La suppression du Profil de Codex appelle déjà `TitanQueue.deleteOwner`, qui efface désormais aussi le brouillon et le minuteur de séance.

Corrections issues de la revue de cette reprise : une guilde héritée reçoit la ligne de membre qui lui manquait ; le nettoyage local ne peut plus interrompre la purge IndexedDB (test rouge avant, vert après) ; le journal ne peut plus détacher un compte vivant.

## Vérifications

- Banc PostgreSQL 16 natif, deux voies de la CI (migrations depuis `20261005150000` ; bundle `release-300.sql` + correctifs) : 30 suites SQL par voie, rejeu des migrations dans une transaction appelante, contrats de concurrence existants. Tous verts.
- `pnpm run verify` : 219/219 tests, build et audit sans erreur, 16 avertissements préexistants.
- E2E Chromium complet : voir la note de clôture de ce lot dans le cahier.
- Une revue de code unique (effort élevé) sur `530269c..HEAD` : 8 remarques. 5 corrigées et vérifiées (rôle de connexion enregistré, garde `to_regclass`, détachement du journal limité aux comptes supprimés, ligne de membre du successeur, purge locale indépendante). 3 documentées : `profile.html`, verrou bref de `auth.users`, rétention du journal.

## BLOQUANT À CORRIGER MAINTENANT

1. **La modération d'un autre compte par la console d'administration échoue.** `titan_admin_update_profile_v1`, appelée par `js/admin.js`, est refusée par `titan_guard_profile_progression` (`PROFILE_USER_MISMATCH` : le garde exige `auth.uid() = profil modifié`). Reproduit sur le banc, qui reprend la structure de production ; le garde de production a la même définition et est actif (lecture seule). Conséquence : un administrateur connecté ne peut ni suspendre ni changer le statut ou le rôle d'un autre compte par cette voie. Non corrigé ici : le garde protège la progression, hors de mon périmètre déclaré. Question Q-003.
2. **`profile.html` charge encore `training-store.js?v=300.0`** alors que les 13 autres pages chargent `300.1` : un cache ancien pourrait conserver l'ancien `deleteOwner` sur la page même du Profil. Changement d'une seule référence, à faire dès que la réservation « validation du nom Profil » de Codex est libérée.

## NON BLOQUANT / BACKLOG FINITION

- Le journal croît sans purge ; aucune rétention n'est définie (dépend de Q-002 a). Il faudra un chemin de purge explicite et audité, car les entrées sont immuables par conception.
- Les entrées d'un compte supprimé sont conservées, détachées du compte (`user_id` et `actor_id` à `NULL`) : choix cohérent avec la mesure anonyme, à valider légalement (Q-002).
- Les achats uniques n'ont aucune unicité en base : `shop_history` et l'ancienne table `inventory` n'ont qu'une clé `id`. Seule la fonction d'achat l'empêche (concurrence testée en PR #21). Une contrainte demande de décrire quels objets sont à achat unique.
- La lecture du journal par un administrateur n'est pas elle-même journalisée.
- Un sport libre est accepté et récompensé comme un sport connu, sans bonus (vérifié) : c'est la validation modulaire par sport de CHEAT02 qui y répondra.
- Rewarded ads et rendements Premium réels : non testés, car non implémentés (SEC10 reste partiel pour eux).
- Verrou bref sur `auth.users` à la première application de la migration de suppression (6 comptes en production, délai maximal de 5 s).

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

Priorité de la roadmap : Android et intégrations santé, ou monétisation. Hors RPG (réservé). Côté sécurité, après Q-003 : journal des actions de modération réelles (BOT04 à BOT09) et validation des contraintes restantes.

## Retour arrière

Base : `drop trigger titan_journal_profile_change on public.profiles; drop table private.titan_economy_journal; drop function public.titan_economy_journal_v1(uuid, integer), private.titan_journal_profile_change(), private.titan_economy_journal_guard();` — supprime le journal et donc ses preuves ; les contraintes validées peuvent rester (elles ne rejettent que des états déjà impossibles). Suppression de compte : voir le handoff du 11/10.

## Texte à reporter dans le cahier

Q-003 — Faut-il corriger le garde de profil pour que la console d'administration puisse modérer un autre compte ?
Tâche concernée : BOT04, BOT06, SEC06.
Bloquant : NON pour le web joueur ; OUI pour toute modération réelle par la console.
Pourquoi la réponse aide : sans correction, aucune suspension, aucun changement de rôle ni de statut n'est possible par `titan_admin_update_profile_v1`, donc la file de modération et les actions graduées ne peuvent pas fonctionner.
Choix recommandé : autoriser l'exception uniquement lorsque l'appel passe par la fonction d'administration et que l'appelant est administrateur (indicateur local à la transaction posé par cette seule fonction `SECURITY DEFINER`), avec test d'isolation inchangé pour les joueurs et entrée dans le journal.
Option utilisée temporairement si aucune réponse : aucun changement ; la modération passe par l'outil service.
Réponse utilisateur : [à remplir]
Résolution Codex : [à remplir après lecture]
