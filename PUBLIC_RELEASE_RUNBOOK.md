# TITAN OS - Runbook release publique

Objectif: pouvoir deployer, verifier et revenir en arriere sans improviser pendant un incident.

## Avant chaque migration Supabase

1. Exporter un backup Supabase depuis le dashboard du projet ou via `pg_dump`.
2. Sauvegarder au minimum les tables critiques: `profiles`, `training_logs`, `activities`, `messages`, `friendships`, `shop_history`, `user_achievements`, `inventory`, `guilds`, `guild_raid`, `titan_billing_events`.
3. Noter le nom exact du fichier backup, l'heure UTC, le hash du script SQL applique et l'operateur.
4. Appliquer la migration sur un environnement de test si disponible.
5. Verifier les policies RLS avec un compte utilisateur standard avant de deployer le front.

## Rollback Netlify

1. Ouvrir Netlify > Site TITAN OS > Deploys.
2. Identifier le dernier deploy sain avant incident.
3. Cliquer `Publish deploy` sur cette version.
4. Verifier en navigation privee:
   - `/`
   - `/login.html`
   - `/training.html`
   - `/profile.html`
   - `/sys_core_override_99.html` doit retourner 404
   - `/sql/titan_cache_reconciliation.sql` doit retourner 404
5. Purger/recharger le service worker si l'incident vient d'un cache obsolete.

## Rollback Supabase

1. Stopper les actions a risque si possible: maintenance front ou blocage temporaire des RPC concernees.
2. Restaurer depuis le backup Supabase le plus recent connu sain.
3. Rejouer uniquement les migrations validees apres ce backup.
4. Tester avec:
   - compte utilisateur standard
   - compte Elite
   - compte suspendu
   - compte sans historique
5. Comparer `profiles.game_state`, `training_logs` et `shop_history` sur quelques comptes de controle.

## Communication incident

1. Afficher un message maintenance via `GLOBAL_CONFIG.maintenance_mode` si le front reste accessible.
2. Publier une note courte dans le canal support: impact, debut incident, statut, prochaine verification.
3. Apres resolution, documenter la cause racine et ajouter un test ou une policy pour eviter la recurrence.
