# Handoff — intégrité économique web — 8 octobre 2026

PR : [#21](https://github.com/Theo25460/TITAN_V0.5/pull/21). Base `e903ac3`, branche `codex/web-integrite-economie-cdc`. Indépendante de [#19](https://github.com/Theo25460/TITAN_V0.5/pull/19) (navigation) et [#20](https://github.com/Theo25460/TITAN_V0.5/pull/20) (isolation/search_path), sans fusion ou déploiement pendant ce lot.

Source : [cahier maître](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M/edit), SEC04, SEC05 et SEC10. **Ces trois exigences restent partielles** : ce lot couvre les séances et achats cosmétiques en crédits, pas l'ensemble des opérations sensibles, paiement, Premium ou publicités.

## Défaut corrigé

Les profils n'avaient pas de contrainte SQL sur les bornes basses de crédits, XP et niveau. Le trigger de progression protège les UPDATE ; il ne couvre pas les INSERT. Le banc a reproduit un INSERT privilégié de crédits négatifs accepté. Ce défaut n'établit pas que le client authenticated peut directement écrire l'économie ; les restrictions client existantes sont conservées.

`supabase/migrations/20261008113411_web_economy_bounds.sql`, créée par Supabase CLI 2.120.0, ajoute :

| Contrainte | Borne |
| --- | --- |
| `profiles_credits_minimum_check` | `credits >= 0` |
| `profiles_xp_minimum_check` | `xp >= 0` |
| `profiles_level_minimum_check` | `level >= 1` |

Les CHECK sont `NOT VALID` : nouvelles lignes et lignes modifiées vérifiées, sans scan ni réécriture de l'historique. Les colonnes gardent leur sémantique nullable ancienne. La migration ne change ni RPC, ni grants, ni gardes existantes. Elle borne l'attente des verrous à 5 secondes puis restaure le réglage appelant, et ne contient aucun COMMIT de la transaction appelante. [Sémantique PostgreSQL de NOT VALID](https://www.postgresql.org/docs/17/sql-altertable.html).

**Migration préparée, non appliquée en production.**

## Contrats de répétition et de concurrence

`sql/tests/300_economy_integrity.sql` utilise deux propriétaires, les rôles restreints et des fixtures annulées :

- Rejeu identique : réponse complète du reçu original, une séance et une consommation de quota.
- UUID identique avec contenu modifié : `EVENT_CONTENT_CONFLICT`, aucune nouvelle récompense.
- UUID identique chez un autre propriétaire : reçu et séance indépendants.
- Rejeu après édition/archive : reçu original, séance toujours archivée, aucun second gain.
- Reçus non forgeables par authenticated ; unicité du reçu même pour un writer privilégié.
- Achat répété : refus exact `PURCHASE_LIMIT_ONCE`, un seul historique et un seul débit.
- INSERT crédits=-1, XP=-1, niveau=0 : SQLSTATE 23514 et nom de contrainte exact ; frontières crédits=0, XP=0, niveau=1 acceptées.

`tools/db/test-economy-concurrency.py` lance deux vrais processus psql. Les RPC s'exécutent sous authenticated ; le verrou initial privilégié sert uniquement à orchestrer le chevauchement. `pg_blocking_pids` prouve que le second appel attend effectivement le premier :

- Séance 30 minutes : même reçu complet aux deux appels, une séance, un reçu, 300 XP, 30 crédits et une seule consommation de quota.
- Achat à 450 crédits : un succès, un refus précis, une ligne d'historique et portefeuille 1000 → 550.

La base doit s'appeler `titan_test_…` avant toute mutation. Les identités aléatoires sont nettoyées, les processus ont des délais bornés et tout worker vivant est arrêté en cas d'échec. La fenêtre de chevauchement est de trois secondes ; un runner très ralenti produit un échec explicite si le verrou n'est pas observé, jamais un succès sans concurrence.

## Deux chemins de migration

La relecture indépendante a trouvé deux défauts importants dans la première version : le bundle historique omettait le correctif, et un COMMIT interne pouvait interrompre la transaction globale d'un bundle régénéré. Les deux défauts ont été reproduits avant correction.

Le bundle `supabase/release-300.sql` reste celui des neuf migrations historiques. Le banc teste désormais séparément les migrations individuelles et le bundle historique suivi des migrations absentes de son historique. Cela évite de réécrire un bundle déjà utilisé, et ne signifie pas que celui-ci contient le nouveau correctif. Pour le déploiement, appliquer la nouvelle migration séparément via le processus de release et vérifier son inscription dans l'historique de la cible.

`tools/db/test-economy-migration.sql` ouvre une transaction appelante, crée un marqueur temporaire, rejoue la migration et annule. Il vérifie la disparition du marqueur, la restauration des contraintes et la conservation du lock_timeout appelant. Un COMMIT interne fait réellement échouer ce test.

La CI rejoue 10 migrations au total et les 7 suites SQL de cette branche, plus le test de transaction et les deux scénarios concurrents, pour chacun des deux chemins. Tests web de base : 60 unitaires et 6 parcours navigateur ; les ajouts de #19/#20 restent dans leurs PR respectives.

## Preuves

- [37770833435 — défaut de bornes](https://github.com/Theo25460/TITAN_V0.5/actions/runs/37770833435) : contrats séquentiels passés, échec attendu « database must reject invalid credits on INSERT ».
- [37771347307 — correction initiale](https://github.com/Theo25460/TITAN_V0.5/actions/runs/37771347307) : trois jobs verts, nouvelles bornes et deux connexions concurrentes vérifiées.
- [37771760136 — défauts de release](https://github.com/Theo25460/TITAN_V0.5/actions/runs/37771760136) : échec du rollback appelant et, séparément, INSERT négatif accepté par le chemin du bundle historique.
- [37772140507 — corrections de release](https://github.com/Theo25460/TITAN_V0.5/actions/runs/37772140507), commit `96064e364b323738c5a75be9b2d37de09799f610` : les deux chemins, rollback et concurrence passent ; trois jobs verts.
- Les checks de la tête finale de [#21](https://github.com/Theo25460/TITAN_V0.5/pull/21/checks) sont la preuve de livraison des deux corrections de release. Relecture : aucun Critical, deux Important corrigés par tests RED→GREEN, aucun Minor.
- Vérification locale : baseline 60/60, AST Python, `bash -n`, `git diff --check`. SQL exécuté uniquement par la CI éphémère ; aucun PostgreSQL local disponible.

## Préflight, validation et rollback

Lecture de catalogue et d'agrégats du projet connecté : zéro crédit négatif, zéro XP négatif, zéro niveau inférieur à 1 au 08/10/2026. Aucune ligne individuelle lue ou modifiée. Refaire ces agrégats avant release ; les résultats antérieurs ne garantissent pas l'état futur.

Après application, traiter toute anomalie historique explicitement, sans normalisation automatique. Puis valider séparément, dans une fenêtre de release adaptée :

```sql
alter table public.profiles validate constraint profiles_credits_minimum_check;
alter table public.profiles validate constraint profiles_xp_minimum_check;
alter table public.profiles validate constraint profiles_level_minimum_check;
```

Retour arrière du seul correctif, sans toucher aux profils :

```sql
alter table public.profiles
  drop constraint profiles_credits_minimum_check,
  drop constraint profiles_xp_minimum_check,
  drop constraint profiles_level_minimum_check;
```

Cela retire la défense sur INSERT ; les gardes UPDATE existantes restent en place. Mettre aussi l'historique de migration en cohérence via la procédure de release.

## Choix et limites de la revue

- Nullable et refus souple UPDATE conservés pour compatibilité ; ce lot ne transforme pas toutes les valeurs absentes en erreurs.
- Achat répété conservé comme refus sans effet ; aucun nouveau reçu d'achat ou protocole client.
- Validation historique et performance/verrouillage réels en production différés ; contrôle d'agrégats et attente bornée limitent le périmètre, sans prouver le comportement de toute charge de production.
- Matrice complète des droits et payloads, billing, publicités, autres récompenses et UI hors de cette revue ciblée ; SEC04/SEC05/SEC10 restent ouverts.
- Le parent collecte les preuves runtime et termine le handoff ; la relecture statique seule ne prouve pas les tests SQL.

Le cahier est synchronisé avant les commits importants et lors du handoff final. Aucun changement Android/Play Console, paiement ou production. Le périmètre est libéré après remise finale ; le cahier Titan global reste ouvert.
