# Handoff — plan de mise en production (A09, A10, A11)

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `dd7b890`. Aucune fusion, aucun déploiement, **aucune migration appliquée**, aucune écriture en production (un seul `SELECT` de comptages exécuté en lecture seule).

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| A09 — plan de retour arrière | `[~]` | Retour arrière écrit pour chacune des 14 migrations en attente (`docs/CDC_WEB_PRODUCTION_RELEASE_PLAN_2026-10-19.md` §2). Non rejoué sur une copie. |
| A10 — protection de la base | `[~]` | Seules deux migrations réécrivent des données (catalogue de 4 cosmétiques, mondes d'aventure/`quest_profile`), capture préalable décrite (§3). La validation des contraintes du fichier 12 est couverte par le contrôle préalable. Rien n'a été testé sur un environnement non-production restauré. |
| A11 — sauvegarde et restauration vérifiées | `[~]` | Porte décrite (§1.3-1.4) ; **non exécutée** : exige l'accès au tableau de bord Supabase. |

## Contenu

- `tools/db/preflight-production.sql` : un seul `SELECT`, comptages seulement. Exécuté sur la production : tous les contrôles bloquants OK (4 cosmétiques, 0 valeur négative, 0 doublon d'achat cosmétique, 0 ligne hors valeurs `role`/`status`, aucune des 14 migrations déjà appliquée).
- Plan ordonné, retour arrière par fichier, compatibilité site/base, recette, conduite en cas d'échec.
- `tests/production-plan.test.mjs` (dans `pnpm test`) : le plan cite chaque migration en attente dans l'ordre, le contrôle les liste toutes et ne contient aucune écriture. Mutation vérifiée (ajout d'un `update` → échec).
- Revue indépendante unique : 7 remarques, toutes traitées (contrôles `role`/`status` manquants pour le fichier 12 — le plus important —, `lock_timeout` mal décrit, retour arrière du fichier 11 incomplet, signatures des `DROP FUNCTION`, libellés).

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important ouvert dans ce lot. Rappel : ne pas appliquer le fichier 11 sans décision si un monde d'aventure payant doit le rester (il force `tier = 'free'` ; 2 mondes concernés en production).

## NON BLOQUANT / BACKLOG FINITION

- Répétition réelle sur une copie restaurée (A11) à faire par une personne ayant accès au tableau de bord.
- Le plan ne couvre pas le déploiement du site, les variables Netlify/Paddle, Android ni la rotation des clés (SEC08).
- `supabase/release-300.sql` (9 migrations) existe pour l'ancien lot ; aucun fichier de lot unique n'est généré pour ces 14.

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

SEC08 (plan de rotation des clés, documentaire), CHEAT12/CHEAT13, Android après réponse à Q-001, monétisation. Une décision humaine est nécessaire pour appliquer le lot en production.

## Retour arrière

Supprimer les trois fichiers ajoutés, `tests/production-plan.test.mjs` et son entrée dans le script `test` de `package.json`.
