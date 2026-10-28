# V1.1 — migrations à appliquer (après la V1 publiée le 22/10/2026)

Production Supabase `oubmftfufwwzwpgvrcag` : les 29 migrations de la V1 (jusqu'à `20261021020000_abuse_limits_profile_surface`) sont appliquées. Les fichiers ci-dessous sont **nouveaux**, additifs, non appliqués, et ne doivent jamais rejouer le lot V1. Chacun laisse la transaction à l'appelant (aucun `BEGIN/COMMIT`) : appliquer un fichier à la fois, dans l'ordre, dans SQL Editor avec transaction, en inscrivant sa version d'origine, d'abord sur une copie restaurée. Le banc `tools/db/test-migrations.sh` (deux voies) les rejoue sur une réplique vide.

| # | Fichier | Effet | Données réécrites | Retour arrière |
|---|---|---|---|---|
| 30 | `20261028010000_sport_limits_more` | huit lignes de plafonds d'allure dans `private.titan_sport_limits` (trail, tapis, marche athlétique, marche nordique, aviron, aviron côtier, kayak, ski de fond), données et non code ; ne rejette jamais une séance, ne fait que nourrir le score de risque explicable | non (insertions, `on conflict do nothing`) | `delete from private.titan_sport_limits where sport in ('trail','nordic_walk','race_walking','treadmill','rowing','coastal_rowing','kayak','cross_country_skiing');` |
| 31 | `20261028020000_sport_specific_measures` | mesures propres à 81 sports qui n'avaient que des mesures génériques : trois mesures spécifiques en tête (priorités 1 à n), les anciennes conservées après, sans doublon | `public.sports.extra_fields` de 81 sports (configuration métier) ; les séances existantes ne changent pas | restaurer `extra_fields` depuis la sauvegarde logique de `public.sports` prise avant, ou retirer les champs de priorité ≤ n de chaque sport listé |

Ordre de mise en ligne : migrations 30 et 31 (indépendantes du site), puis publication du site par archive. Le site publié avant ces migrations fonctionne : les nouvelles mesures n'apparaissent qu'une fois la migration 31 appliquée.
