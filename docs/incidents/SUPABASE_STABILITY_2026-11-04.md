# TITAN — contre-expertise du 4 novembre 2026

Travail en cours sur une branche isolée. Aucune modification ou déploiement de production autorisé ni exécuté.

## Cause principale

Le contrôle métier de révision de `titan_save_profile_state` lève volontairement `40001`. Ce code désigne normalement un échec de sérialisation transitoire. PostgREST/hasql peut relancer la transaction sans fin avec les mêmes paramètres périmés. Les PR #129/#130 réduisent les écritures client mais ne corrigent pas cette amplification interne, ni les requêtes déjà bloquées.

Source officielle : https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions

## Mesures en lecture seule

- 04/11, 07:00–08:00 UTC : 3 556 entrées PROFILE_VERSION_CONFLICT/40001.
- Cinq processus PostgreSQL : 1904507, 1913219, 1913221, 1913222, 1913223 ; sessions ouvertes le 29 octobre. Leurs numéros de ligne de journal avancent d'environ un million chacun en une heure, beaucoup plus que les entrées disponibles dans Logs Explorer.
- Deux instantanés séparés de 63,782 secondes : +102 511 rollbacks (~1 607/s), +103 013 préparations PostgREST, +37 commits, 0 blocs lus, +308 681 blocs en cache, +17 560 115 octets temporaires, 0 deadlock. L'introspection de diagnostic contribue elle-même au temporaire ; ces compteurs ne sont pas des mesures de CPU ou de disque physique.
- Les logs HTTP de 24 h ne montrent que 12 sauvegardes Android réussies dans les principaux résultats, incompatible avec une explication reposant uniquement sur des requêtes HTTP client répétées. Ils ne constituent pas un comptage exhaustif du trafic.
- Quatre autres implémentations utilisent le même mauvais signal : séances, aventure, défis, vues d'analyse. La migration conserve les refus et change seulement leur SQLSTATE en PT409.
- Cron : 71 exécutions réussies sur la fenêtre examinée, maximum 0,756 s ; aucun échec répété. Huit jobs configurés dont deux hors fenêtre.
- Aucun bloqueur dans l'instantané, aucune réplication slot active ou retenue. Les triggers de protection profils n'introduisent pas de sauvegarde récursive. Index primaire profiles(id) présent.
- Advisories : 21 FK sans index, 22 combinaisons de policies permissives, 87 index non utilisés, une fonction search_path mutable, protection mots de passe compromis désactivée. Les avertissements SECURITY DEFINER nécessitent une vérification des contrôles internes, pas une suppression générale des RPC. Aucun de ces nombres ne prouve la cause de cette tempête.

## Livraison et limites

Migration préparée : `supabase/migrations/20261104085851_business_conflicts_no_transaction_retry.sql`.
Elle transforme les définitions installées pour préserver les changements V1.2, les droits, les signatures, les verrous, les XP, crédits et séances. Elle refuse une clause inattendue et ne tue aucune connexion.

Après autorisation explicite : sauvegarder les définitions actuelles, appliquer cette migration seule, vérifier les fonctions et leurs droits, puis arrêter uniquement les backends encore identifiés par des logs récents + PID + backend_start. Ne jamais réutiliser aveuglément les PID de ce rapport. Publier ensuite les correctifs client validés, recharger les anciens onglets, diffuser la mise à jour Android.

Retour arrière : préférer un correctif en avant ; conserver PT409 même si un frontend doit être restauré. Restaurer un ancien corps SQL réintroduisant 40001 réactiverait l'incident. Ne jamais supprimer les copies locales, files de séances ou données cloud. L'arrêt ciblé des backends annule seulement leurs transactions en cours ; les clients doivent conserver leurs copies en cas d'accusé incertain.

Preuves après intervention : fenêtres égales à 5 min, 1 h et 24 h ; erreurs par code et fonction, deltas de rollback et de pg_stat_statements, logs HTTP par endpoint, CPU et Disk I/O via les métriques Supabase, essais multiappareil sur données synthétiques. Un conflit réel PT409 reste normal ; une répétition continue ne l'est pas. Aucune résolution en production ni baisse CPU/I/O n'est revendiquée avant cette étape.
