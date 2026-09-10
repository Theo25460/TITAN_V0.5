# TITAN OS - Revue securite Supabase v87

Date: 2026-07-30

## Resultat

- Toutes les tables applicatives exposees ont RLS active.
- Les appels `auth.uid()` des policies publiques sont evalues comme `select auth.uid()` pour eviter une reevaluation par ligne.
- Les 25 alertes `authenticated_security_definer_function_executable` restantes sont volontaires: ce sont les RPC metier authentifiees utilisees par le client.
- Chaque RPC de cette liste verifie `auth.uid()`, fixe son `search_path`, refuse `anon` et n'accorde `EXECUTE` qu'a `authenticated`.
- Les helpers internes et RPC admin controles pendant l'audit ne sont pas executables par les roles client.

## Allowlist RPC authentifiees

### Compte et profil

- `delete_own_account`
- `export_own_data`
- `titan_assign_friend_code`
- `titan_save_profile_state`
- `titan_submit_cache_reconciliation`

### Progression

- `titan_claim_achievement`
- `titan_purchase_shop_item`
- `titan_submit_combat_victory`
- `titan_submit_training_session`

### Social, guilde et moderation

- `titan_add_friend_by_code`
- `titan_block_user`
- `titan_create_guild`
- `titan_create_wager_challenge`
- `titan_find_profile_by_friend_code`
- `titan_get_my_guild`
- `titan_join_guild`
- `titan_leave_guild`
- `titan_list_global_messages`
- `titan_list_guild_messages`
- `titan_list_my_friends`
- `titan_report_chat_message`
- `titan_send_global_message`
- `titan_send_guild_message`
- `titan_set_guild_target`
- `titan_unblock_user`

## Alertes dashboard a traiter manuellement

- Activer la protection Auth contre les mots de passe compromis dans le dashboard Supabase.
- Les warnings de policies permissives multiples restants doivent etre consolides table par table sur un environnement de staging; ils ne justifient pas une modification en masse de la logique d'acces en production.
- Les index signales comme inutilises sont informatifs et ne doivent pas etre supprimes sans historique de charge representatif.
