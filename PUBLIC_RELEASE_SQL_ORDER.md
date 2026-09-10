# TITAN OS - Ordre SQL public release

Ce fichier liste uniquement les scripts utiles a appliquer pour la prochaine passe Supabase.
Les anciens scripts deja appliques restent des logs: ne pas les rejouer sans raison.

## Appliques sur Supabase le 2026-05-19

- `sql/titan_cloud_social_guild_foundation.sql`
  - Cree la fondation cloud social/guilde: guildes, membres, messages guilde, ajout ami par code et RPC de gestion guilde.
  - Objectif: sortir le social/guilde du stockage local et rendre code ami + canal guilde fonctionnels sous RLS.
- `sql/titan_profile_state_rpc_foundation.sql`
  - Cree `titan_save_profile_state(...)` pour sauvegarder `game_state`, pseudo/avatar/privacy/inventaire/streak depuis le compte connecte.
  - Objectif: garder le meme avancement entre appareils, sans laisser le front modifier les flags serveur sensibles.
- `sql/titan_rpc_execute_grants_hotfix.sql`
  - Verrouille les grants `execute` des RPC ajoutees: pas d'acces anon, RPC publiques uniquement en `authenticated`, helpers internes fermes.
- `sql/titan_guild_messages_sender_index_hotfix.sql`
  - Ajoute l'index `guild_messages_sender_id_idx` pour corriger l'avertissement FK performance du chat guilde.
- `sql/titan_public_economy_clarity_foundation.sql`
  - Cree l'economie publique v65: cout des messages, creation guilde payante, limites caracteres gratuit/Elite, expiration messages 48h/72h, plafonds XP/credits hebdo et statut economie QG.
  - Verrouille les inserts directs `messages`/`guild_messages`: le front connecte doit passer par les RPC `titan_send_global_message` et `titan_send_guild_message`.
  - Ajoute `titan_get_economy_status()` pour afficher les plafonds et couts dans l'interface.
  - Ajoute une purge des messages expires via RPC et tente une planification `pg_cron` si disponible.
  - Statut 2026-05-20: appliquee via MCP, objets principaux verifies.
- `sql/titan_shop_economy_balance_v66.sql`
  - Harmonise la boutique avec l'economie v66: prix minimum des charges, upgrades plus chers, pubs volontaires plafonnees, cosmetiques Elite visuels et cooldowns serveur.
  - Remplace `titan_purchase_shop_item(p_item_id)` pour appliquer les limites cote Supabase: 2 achats de charges combat par semaine au total, 1 prime pub par jour et 3 par semaine, achats cosmetiques reserves Elite.
  - Ajoute un historique cout/reward dans `shop_history` pour auditer l'economie sans lire le cache local.
  - Statut 2026-05-20: appliquee via MCP, colonnes boutique v66 verifiees.
- `sql/titan_economy_rpc_anon_revoke_v66.sql`
  - Hotfix grants apres verification: retire explicitement `EXECUTE` a `anon`/`public` sur les RPC economie, chat, guilde, boutique et rewards.
  - Statut 2026-05-20: appliquee via MCP; verification OK, `anon` ne peut plus executer `titan_send_global_message`, `titan_get_economy_status` ni `titan_purchase_shop_item`.

## Applique sur Supabase le 2026-05-22

- `sql/titan_sports_pro_tracking_v72.sql`
  - Remplit les profils de suivi sport par sport dans `sports.extra_fields`.
  - Ajoute `tracking_summary` / `tracking_version` pour que formulaires, conseils et graphes lisent les definitions cloud.
  - Verification MCP: 131 sports actifs en `v72`, aucun sport actif sans champ specifique.

## Applique sur Supabase le 2026-05-24

- `sql/titan_sports_strava_inspired_v73.sql`
  - Ajoute 17 sports/variantes inspires des apps de suivi modernes: padel, basketball, volleyball, cricket, danse, pickleball, gravel, ski rando, randonnee longue, escalade bloc/voie, rameur, kayak, paddle, yoga mobilite, HIIT et Hyrox.
  - Ajoute `tracking_summary`, `balance_profile`, descriptions et ordre de tri pour que le front puisse afficher des formulaires et analyses sport-specifiques.
  - Statut: appliquee via MCP Supabase sur le projet `oubmftfufwwzwpgvrcag`.

## Applique sur Supabase le 2026-05-25

- `sql/titan_olympic_sports_catalog_v77.sql`
  - Ajoute/tague le catalogue JO ete LA28 et JO d'hiver Milano Cortina 2026 dans `public.sports`.
  - Verification MCP: 178 sports actifs au total, 51 protocoles `olympic_summer_2028`, 16 protocoles `olympic_winter_2026`, 0 id attendu manquant.

## Applique sur Supabase le 2026-06-03

- `sql/titan_cloud_progression_snapshot_v78.sql`
  - Ajoute `public.titan_get_progression_snapshot()` pour lire la progression officielle: niveau, XP, credits, seances 7/30 jours, derniere trace et plafonds hebdo.
  - Place le helper `SECURITY DEFINER` dans `private`, garde le wrapper public en `SECURITY INVOKER`, retire l'acces `anon` et accorde seulement `authenticated`.
  - Durcit les ecritures sensibles: supprime les policies/grants self insert/update profil et self insert/update/delete training logs; les mutations passent par RPC serveur ou policy admin.
  - Verification MCP: wrapper public sans `SECURITY DEFINER`, helper prive avec `search_path=''`, `anon_execute=false`, `authenticated_execute=true`.
- `sql/titan_search_path_hardening_v78.sql`
  - Applique `search_path=''` aux helpers signales par Supabase advisor: `titan_clean_economy_message`, `titan_week_start`, `titan_v72_sport_profile`, `titan_v72_tracking_summary`, `titan_v72_sport_fields`.
  - Verification MCP: chaque fonction retourne `search_path=""` dans `pg_proc.proconfig`.
- `sql/titan_progression_policy_consolidation_v78.sql`
  - Supprime les policies SELECT dupliquees `profiles_select_own` et `training_logs_select_own`; les policies `self_or_admin` restantes couvrent deja lecture proprietaire + lecture admin.
  - Objectif: reduire les warnings performance sans rouvrir d'ecriture directe.
- `sql/titan_supabase_security_cleanup_v79.sql`
  - Ajoute des policies deny explicites aux tables RLS volontairement fermees: `admin_messages`, `audit_logs`, `daily_quests`, `game_settings`, `sports_db`, `titan_billing_events`, `titan_social_action_log`, `titan_weekly_reward_usage`, `zones`.
  - Remplace la policy contact `WITH CHECK true` par une validation stricte: message, email, status, priority, admin_note et user_id.
  - Remplace les anciennes policies admin basees sur `is_admin()`/`is_super_admin()` par `private.titan_is_admin(auth.uid())`, puis retire `EXECUTE` aux vieux helpers publics.
  - Verification MCP: plus de warnings `rls_enabled_no_policy`, plus de policy contact permissive, helpers admin publics non executables par `anon`/`authenticated`.
- `sql/titan_supabase_connection_security_v80.sql`
  - Ajoute les fonctions de diagnostic/verification progression utilisees par le client central Supabase.
  - Objectif: rendre la connexion Supabase inspectable sans rouvrir d'ecriture sensible directe.
- `sql/titan_internal_rpc_execute_closure_v80.sql`
  - Ferme l'execution directe des anciens RPC admin et helpers economie internes.
  - Verification MCP: RPC admin `_v1` non executables par `anon`, progression/boutique/training conservent le chemin `authenticated`.
- `sql/titan_sports_catalog_cleanup_v81.sql`
  - Desactive les doublons legacy (`mtb`, `beach_volley`, `soccer`, etc.) au profit des sports canoniques avec `tracking_summary.mergedInto`.
  - Ajoute 20 sports utiles et complete les champs manquants: descriptions, `required_fields`, formules XP/credits, regles anti-abus et resumes de suivi.
  - Verification MCP: 198 sports au total, 187 actifs, 0 description/formule/champ requis/regle anti-abus manquant.

## Applique sur Supabase le 2026-06-04

- `sql/titan_supabase_fk_performance_indexes_v86.sql`
  - Ajoute les index manquants sur les cles etrangeres publiques detectees par l'audit performance Supabase.
  - Le script est idempotent: il ignore les FKs deja couvertes par un index valide dont les colonnes de gauche correspondent.
  - Objectif: accelerer les jointures, suppressions/updates avec contraintes FK et reduire les warnings de performance sans modifier RLS, grants ni logique metier.
- `sql/titan_sports_broad_catalog_v82.sql`
  - Etend le catalogue avec un large socle de vrais sports reconnus/pratiques: sports collectifs, raquette, precision, para/handisport, outdoor, combat, eau, glisse et force.
  - Desactive les entrees non sportives (`diy`, `moving`, `sauna`, `meditation`, `vr_fitness`, `stroller_walk`, `hobby_horsing`, etc.) sans supprimer les lignes.
  - Statut MCP: migration presente sur Supabase sous `titan_sports_broad_catalog_v82` le 2026-06-04.
- `sql/titan_supabase_duplicate_index_cleanup_v86.sql`
  - Supprime les doublons `messages_created_idx` et `profiles_friend_code_unique_idx`.
  - Verification prealable: les deux index retires n'etaient pas proprietaires d'une contrainte.
  - Objectif: reduire le cout d'ecriture et de maintenance d'index sans changer les garanties de lecture ni d'unicite.
- `sql/titan_public_partnership_stats_cache_v86.sql`
  - Remplace la RPC publique `titan_public_partnership_stats()` en `SECURITY DEFINER` par une RPC `SECURITY INVOKER` lisant un cache public d'agregats.
  - Garde les statistiques visibles sur la page partenaires sans laisser `anon` declencher une fonction privilegiee sur les tables privees.
  - Le cache ne contient aucune donnee utilisateur individuelle et peut etre rafraichi lors des passes admin/release.

## Appliques sur Supabase le 2026-07-30

- `sql/titan_rls_auth_select_performance_v87.sql`
  - Remplace les appels directs `auth.uid()` des policies publiques par `(select auth.uid())`.
  - Remplace la derniere policy `auth.role()` de catalogue par une policy `TO authenticated`.
  - Verification advisor: 93 alertes `auth_rls_initplan` supprimees, aucune restante.
- `sql/titan_billing_event_ordering_v87.sql`
  - Ajoute l'horodatage d'evenement Paddle aux profils et a l'historique billing.
  - Ajoute une RPC reservee `service_role` qui refuse atomiquement les evenements plus anciens que l'etat Elite courant.
- `SUPABASE_SECURITY_REVIEW_V87.md`
  - Documente l'allowlist des 25 RPC `SECURITY DEFINER` volontairement executables par `authenticated`.

## Nouveaux scripts a appliquer

Audit sans modification:
- `sql/titan_public_beta_readiness_audit.sql`
  - A lancer avant une beta publique pour relire RLS, grants anon, RPC serveur critiques et index recommandes.
  - Lecture seule: ne cree, ne modifie et ne supprime aucun objet.
  - Toute ligne `fix_*` ou `review_*` doit etre analysee avant d'ouvrir largement.

0. `sql/titan_training_sync_p0_repair.sql`
   - A appliquer en priorite si les seances sport ne s'enregistrent pas dans Supabase.
   - Repare `training_logs`, grants/policies RLS et RPC `titan_submit_training_session(...)`.
   - Ajoute `titan_training_storage_health()` pour verifier que le stockage sport est operationnel.

0.bis `sql/titan_training_credits_ambiguity_hotfix.sql`
   - A appliquer sans redeploy si Supabase renvoie `column reference "credits" is ambiguous` lors d'une seance sport.
   - Remplace uniquement la RPC d'entrainement avec des alias explicites sur `profiles.credits`.

0.ter `sql/titan_server_progression_authority.sql`
   - A appliquer maintenant: rend XP, level-up et bonus credits de niveau autoritaires cote Supabase.
   - Remplace `titan_submit_training_session(...)` et `titan_submit_combat_victory(...)` avec `DROP FUNCTION` inclus pour eviter l'erreur "cannot change return type".
   - Ajoute `profiles.xp`, `titan_level_requirement(level)` et `titan_apply_progression_reward(...)`.
   - Le front v57 lit `credits_after`, `xp_after`, `level_after`, `level_bonus`, `leveled_up` et ne pousse plus `level/credits/xp` directement via `profiles.update`.

1. `sql/titan_social_privacy_rate_limit.sql`
   - Ajoute `profiles.privacy`, blocage utilisateur, logs d'actions sociales.
   - Ajoute rate limit serveur sur ajout/suppression amis.
   - Remplace proprement la RPC `titan_list_my_friends()` avec `drop function if exists` pour eviter l'erreur Supabase "cannot change return type".

2. `sql/titan_billing_subscription_lifecycle.sql`
   - Ajoute les colonnes Elite manquantes: renouvellement, fin, essai, remboursement, dernier event.
   - Complete `titan_billing_events` avec status/dates.

3. `sql/titan_training_server_rewards_rpc.sql`
   - Cree une premiere RPC `titan_submit_training_session(...)`.
   - Calcule XP/credits de facon bornee cote Supabase, insere `training_logs`, met a jour `profiles.credits`.
   - L'anti-triche deja pose reste le garde-fou sur les valeurs impossibles.

4. `sql/titan_rls_critical_tables_closure.sql`
   - Ferme les grants/policies des tables critiques les plus sensibles: seances, activites, achats, succes, inventaire, defis sociaux, messages, guildes.
   - Ignore proprement les tables/colonnes absentes avec des `NOTICE`, donc le script reste compatible avec l'etat actuel de ta base.
   - Les `NOTICE` ne sont pas forcement des erreurs, mais il faut les lire pour reperer les tables qui demandent encore une policy specifique.

5. `sql/titan_shop_purchase_rpc.sql`
   - Cree `titan_purchase_shop_item(p_item_id)` pour valider cout, credits et cooldowns boutique cote Supabase.
   - Garde `shop_history` user-owned sous RLS.
   - Le front tente cette RPC pour les comptes connectes et conserve un fallback local si elle n'est pas encore appliquee.

6. `sql/titan_social_wager_challenge_rpc.sql`
   - Cree `titan_create_wager_challenge(...)` pour debiter la mise et creer le defi social en transaction serveur.
   - Garde `social_challenges` sous RLS pour les deux joueurs impliques.
   - Le front tente cette RPC avant l'ancien insert direct.

7. `sql/titan_public_grants_closure_from_audit.sql`
   - A appliquer apres le CSV RLS review qui montrait `fix_required_anon_grant`.
   - Retire les droits anonymes dangereux sur `profiles`, `friendships` et `messages`.
   - Reduit aussi les droits `authenticated` au strict minimum utile sur les tables critiques.

8. `sql/titan_public_policy_cleanup_from_logic_review.sql`
   - A appliquer apres le CSV policy logic review qui montrait `review_public_role`.
   - Supprime les anciennes policies `public` sur les tables privees et les policies `true` trop larges.
   - Recree les policies propres `authenticated` quand necessaire.

9. `sql/titan_guild_raid_policy_no_owner_hotfix.sql`
   - A appliquer si la revue logique affiche `guild_raid,NO_POLICY,fix_required_no_policy`.
   - Ferme `guild_raid` par defaut avec une policy `false` tant que la table n'a pas de colonne proprietaire claire.
   - Ne supprime aucune donnee.

10. `sql/titan_messages_authenticated_only_privacy.sql`
   - Option recommande si on veut eviter que `messages.sender_id` soit lisible par des visiteurs anonymes.
   - Retire `SELECT` a `anon` sur `messages`.
   - Garde le chat global pour les utilisateurs connectes.

11. `sql/titan_combat_victory_rewards_rpc.sql`
   - A appliquer maintenant si `titan_messages_authenticated_only_privacy.sql` est deja passe.
   - Cree `titan_submit_combat_victory(...)` pour calculer XP/credits combat cote Supabase.
   - Ecrit `combat_logs`, met a jour `user_bestiary`, credite `profiles.credits`/`profiles.xp` et garde un rate limit simple.

12. `sql/titan_achievement_claim_rpc.sql`
   - A appliquer apres le RPC combat.
   - Cree `titan_claim_achievement(p_achievement_id)` pour crediter les succes une seule fois cote Supabase.
   - Retire l'insert direct `authenticated` sur `user_achievements`: le front connecte passe par la RPC, fallback legacy seulement si RPC absente.

13. `sql/titan_suspended_user_action_guards.sql`
   - A appliquer apres le RPC succes.
   - Ajoute un trigger commun qui refuse les actions sensibles si `profiles.is_suspended = true`.
   - Couvre les tables existantes parmi: `training_logs`, `messages`, `friendships`, `shop_history`, `social_challenges`, `combat_logs`, `user_achievements`.

14. `sql/titan_public_catalog_read_access.sql`
   - A appliquer maintenant si l'app affiche "DB mode secours" ou "11 tables a verifier".
   - Redonne un `SELECT` public controle aux tables catalogue non privees: mobs, bosses, talents, sports, succes config, global config, fun stats, boutique, news.
   - Ne concerne pas les donnees privees utilisateur (`profiles`, `training_logs`, `friendships`, etc.).

15. `sql/titan_chat_message_moderation_final.sql`
   - A appliquer apres le catalog read access.
   - Ajoute le signalement d'un message precis via `titan_report_chat_message(...)`.
   - Ajoute le masquage admin `titan_admin_hide_chat_message(...)` et filtre les messages masques dans le chat connecte.
   - Compatible avec `messages.id` en `bigint` ou `uuid`: `message_id` est stocke en `text`, sans FK incompatible.
   - Ne supprime aucun message existant.

16. `sql/titan_public_economy_clarity_foundation.sql`
   - Deja applique le 2026-05-20 sur `oubmftfufwwzwpgvrcag`; ne pas rejouer sans raison.
   - A appliquer apres la fondation social/guilde et la moderation finale chat sur un autre environnement.
   - Impose cote serveur les couts sociaux, limites Elite/gratuit, retention messages, caps hebdo et lecture du statut economie.
   - Remplace les RPC sport/combat pour appliquer les caps avant progression.
   - Necessite que `titan_apply_progression_reward`, `titan_clean_social_text`, `titan_is_admin`, `messages`, `guild_messages`, `combat_logs` et `training_logs` existent deja.

17. `sql/titan_shop_economy_balance_v66.sql`
   - Deja applique le 2026-05-20 sur `oubmftfufwwzwpgvrcag`; ne pas rejouer sans raison.
   - A appliquer apres l'economie v65 et le RPC boutique initial sur un autre environnement.
   - Normalise prix/cooldowns boutique et remplace `titan_purchase_shop_item(...)`.
   - Necessite `profiles`, `shop_items` et `shop_history`; le script cree/complete `shop_history` si besoin.

18. `sql/titan_economy_rpc_anon_revoke_v66.sql`
   - Deja applique le 2026-05-20 sur `oubmftfufwwzwpgvrcag`; ne pas rejouer sans raison.
   - Ferme explicitement les EXECUTE anon sur les RPC sensibles apres v65/v66.

19. `sql/titan_sports_pro_tracking_v72.sql`
   - Remplit `sports.extra_fields` cote Supabase pour que chaque discipline garde un vrai profil de suivi au lieu d'un formulaire local trop generique.
   - Ajoute `sports.tracking_summary` et `sports.tracking_version` pour alimenter les formulaires, conseils et graphes avec des definitions sportives cloud.
   - Deja applique le 2026-05-22 sur `oubmftfufwwzwpgvrcag`; a appliquer avant de verifier le journal et les graphes de metriques specifiques sur un autre environnement.

## Verification apres application

0. Si l'audit renvoie `column reference "table_name" is ambiguous`, appliquer d'abord:

```sql
-- Copier/coller le contenu de:
-- sql/titan_public_release_rls_audit_fix_ambiguous_table_name.sql
```

1. Lancer ou relancer l'audit corrige:

```sql
select * from public.titan_public_release_rls_audit();
```

2. Controler que ces objets existent:

```sql
select to_regclass('public.titan_user_blocks') as blocks_table,
       to_regclass('public.titan_social_action_log') as social_log_table,
       to_regclass('public.titan_billing_events') as billing_events_table,
       to_regprocedure('public.titan_submit_training_session(text,text,numeric,text,jsonb,timestamp with time zone)') as training_rpc,
       to_regprocedure('public.titan_purchase_shop_item(text)') as shop_rpc,
       to_regprocedure('public.titan_create_wager_challenge(uuid,text,integer)') as wager_rpc,
       to_regprocedure('public.titan_submit_combat_victory(text,text,text,text,integer,numeric,integer,jsonb)') as combat_rpc,
       to_regprocedure('public.titan_apply_progression_reward(uuid,integer,integer)') as progression_rpc,
       to_regprocedure('public.titan_level_requirement(integer)') as level_requirement_rpc,
       to_regprocedure('public.titan_claim_achievement(text)') as achievement_rpc,
       to_regprocedure('public.titan_reject_suspended_user_action()') as suspended_guard,
       to_regprocedure('public.titan_save_profile_state(jsonb,text,text,jsonb,jsonb,integer,text,text)') as profile_state_rpc,
       to_regprocedure('public.titan_add_friend_by_code(text)') as friend_code_rpc,
       to_regprocedure('public.titan_get_my_guild()') as get_guild_rpc,
       to_regprocedure('public.titan_send_guild_message(text)') as send_guild_message_rpc,
       to_regprocedure('public.titan_get_economy_status()') as economy_status_rpc,
       to_regprocedure('public.titan_send_global_message(text)') as send_global_message_rpc,
       to_regprocedure('public.titan_apply_weekly_reward_cap(uuid,integer,integer)') as weekly_cap_rpc,
       to_regclass('public.training_logs') as training_logs_table,
       to_regclass('public.messages') as messages_table,
       to_regclass('public.guild_members') as guild_members_table,
       to_regclass('public.guild_messages') as guild_messages_table,
       to_regclass('public.titan_weekly_reward_usage') as weekly_reward_usage_table,
       to_regclass('public.combat_logs') as combat_logs_table,
       to_regclass('public.user_bestiary') as user_bestiary_table;
```

3. Controler les nouvelles colonnes:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name in (
    'privacy',
    'elite_renews_at',
    'elite_ends_at',
    'elite_trial_ends_at',
    'elite_refunded_at',
    'elite_last_event_name',
    'xp'
  )
order by column_name;
```

3.bis Controler les colonnes economie social:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('messages', 'guild_messages')
  and column_name in ('expires_at', 'cost_credits', 'hidden_at')
order by table_name, column_name;
```

3.ter Controler les colonnes economie boutique v66:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'shop_items' and column_name in ('requires_elite', 'economy_tier', 'cosmetic_id'))
    or
    (table_name = 'shop_history' and column_name in ('cost_credits', 'reward_credits', 'economy_meta'))
  )
order by table_name, column_name;
```

4. Controler les tables critiques encore exposees:

```sql
select *
from public.titan_public_release_rls_audit()
where table_name in (
  'profiles',
  'training_logs',
  'activities',
  'messages',
  'friendships',
  'shop_history',
  'user_achievements',
  'inventory',
  'guilds',
  'guild_raid',
  'social_challenges'
)
order by table_name, recommendation;
```

Ou lancer le helper de lecture:

```sql
-- Copier/coller le contenu de:
-- sql/titan_public_release_rls_review_after_closure.sql
```

5. Si le helper affiche `fix_required_anon_grant` sur `profiles`, `friendships` ou `messages`, appliquer:

```sql
-- Copier/coller le contenu de:
-- sql/titan_public_grants_closure_from_audit.sql
```

6. Relancer ensuite:

```sql
select * from public.titan_public_release_rls_audit();
-- puis:
-- sql/titan_public_release_rls_review_after_closure.sql
```

7. Pour finir la revue manuelle des policies, lancer:

```sql
-- Copier/coller le contenu de:
-- sql/titan_public_release_policy_logic_review.sql
```

Objectif: aucune ligne `fix_required_*` ou `review_public_role` hors cas attendu `messages` en lecture seule.

8. Si le helper affiche `review_public_role` sur des tables privees ou `fix_required_anon_write` sur `messages`, appliquer:

```sql
-- Copier/coller le contenu de:
-- sql/titan_public_policy_cleanup_from_logic_review.sql
```

9. Relancer ensuite:

```sql
-- sql/titan_public_release_policy_logic_review.sql
```

10. Si le seul probleme restant est `guild_raid,NO_POLICY,fix_required_no_policy`, appliquer:

```sql
-- Copier/coller le contenu de:
-- sql/titan_guild_raid_policy_no_owner_hotfix.sql
```

11. Relancer ensuite:

```sql
-- sql/titan_public_release_policy_logic_review.sql
```

12. Option privacy plus stricte pour l'item 3:

```sql
-- Copier/coller le contenu de:
-- sql/titan_messages_authenticated_only_privacy.sql
```

Puis relancer:

```sql
select * from public.titan_public_release_rls_audit();
-- puis:
-- sql/titan_public_release_policy_logic_review.sql
```

13. Appliquer le nouveau RPC combat:

```sql
-- Copier/coller le contenu de:
-- sql/titan_combat_victory_rewards_rpc.sql
```

Puis verifier:

```sql
select to_regprocedure('public.titan_submit_combat_victory(text,text,text,text,integer,numeric,integer,jsonb)') as combat_rpc,
       to_regclass('public.combat_logs') as combat_logs_table,
       to_regclass('public.user_bestiary') as user_bestiary_table;
```

14. Appliquer le nouveau RPC succes:

```sql
-- Copier/coller le contenu de:
-- sql/titan_achievement_claim_rpc.sql
```

Puis verifier:

```sql
select to_regprocedure('public.titan_claim_achievement(text)') as achievement_rpc,
       to_regclass('public.user_achievements') as user_achievements_table;
```

15. Appliquer le garde comptes suspendus:

```sql
-- Copier/coller le contenu de:
-- sql/titan_suspended_user_action_guards.sql
```

Puis verifier:

```sql
select to_regprocedure('public.titan_reject_suspended_user_action()') as suspended_guard;
```

16. Appliquer le correctif lecture catalogue public:

```sql
-- Copier/coller le contenu de:
-- sql/titan_public_catalog_read_access.sql
```

Puis verifier:

```sql
select
  to_regclass('public.mobs') as mobs_table,
  has_table_privilege('anon', 'public.mobs', 'select') as anon_can_read_mobs,
  has_table_privilege('anon', 'public.shop_items', 'select') as anon_can_read_shop_items;
```

17. Appliquer la moderation finale des messages chat:

```sql
-- Copier/coller le contenu de:
-- sql/titan_chat_message_moderation_final.sql
```

Puis verifier:

```sql
select to_regprocedure('public.titan_report_chat_message(text,text)') as report_message_rpc,
       to_regprocedure('public.titan_admin_hide_chat_message(text,text)') as hide_message_rpc,
       exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'messages'
           and column_name = 'hidden_at'
       ) as messages_can_be_hidden;
```
