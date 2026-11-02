# TITAN V1.1 — revue SQL locale du 2 novembre 2026

Base examinée : `6b4bcaa`, branche candidate `codex/v11-finalization-20261102`. Aucune migration distante, aucun déploiement, aucune modification de compte réel.

Le snapshot fourni `sql-functions-review.json` contient 175 fonctions SECURITY DEFINER : 129 publiques et 46 privées. Les alertes « 3 anon + 68 authenticated » représentent **71 droits fonction-rôle sur 68 fonctions publiques distinctes** : les trois fonctions anon sont également accordées à authenticated. Ce ne sont pas 71 vulnérabilités ni 71 fonctions distinctes.

Deux défauts de confidentialité confirmés par lecture des définitions sont reproduits par `sql/tests/300_legacy_social_privacy.sql` : F1, aperçu d'un profil privé, suspendu ou bloqué par l'ancienne recherche de code ami ; F2, statistiques de séances accessibles avant acceptation d'une demande d'amitié, avec défaut de confidentialité permissif pour une clé absente. Les prédicats manquent dans ces fonctions SECURITY DEFINER et RLS ne les rajoute pas. Aucun autre contournement d'autorisation directement démontré pendant cette revue. Cette phrase ne vaut pas certification globale.

## Méthode, preuves et limites

Chaque corps des 68 fonctions ci-dessous a été lu, avec ses helpers d'identité, rôle, relation, apparence, récompense et export. La colonne empreinte est SHA-256 des octets UTF-8 de `definition` dans le snapshot fourni, tronqué à 12 caractères ; elle rattache la classification à une définition exacte. `A` = authenticated, `N` = anon. Toutes ces fonctions ont un search_path fixé dans le snapshot (`''` ou `public, pg_temp`). Toutes utilisent des requêtes statiques ; les helpers dynamiques d'export/effacement emploient `%I` pour les identifiants, `USING` pour l'UUID et des noms constants depuis les wrappers. Ils n'ont aucun droit anon/authenticated dans le snapshot. Les helpers d'administration dynamiques restants sont internes/révoqués ou passent par `private.titan_admin_assert` et une liste de tables autorisées.

La garde admin lit `profiles.role` / `titan_admins`, pas `raw_user_meta_data`. `private.titan_moderation_require_admin` exige `auth.uid()` et `private.titan_is_admin`; les gardes des profils protègent rôle, monnaie, entitlement et suspension. Les tests existants `300_admin_moderation`, `300_client_writes`, `300_user_isolation`, `300_admin_surface`, `300_security_lockdown` et les suites économie/concurrence couvrent des appels avec les véritables rôles SQL et des identités synthétiques, sans prouver une absence universelle de défaut.

Le contrôle de catalogues complémentaire, fourni par l'agent principal le 2 novembre 2026 en lecture seule, confirme que les 68 fonctions publiques accordées sont détenues par `postgres` (`rolbypassrls=true`, `rolsuper=false`), que `CREATE` sur `public` est refusé à anon et authenticated, et que les 80 tables publiques ont toutes RLS activée. Les RPCs peuvent donc effectivement franchir RLS : les gardes dans leurs corps sont indispensables. Restent non établis par ce lot la configuration des schémas exposés PostgREST, les membres de tous les rôles, les paramètres Auth et la fraîcheur/révocation des JWT. Les sorties advisor fournies restent des constats, pas des changements effectués ici. Une copie restaurée proche de production et les vérifications de configuration restent nécessaires avant publication.

## Registre des 71 droits (68 lignes, trois lignes N+A)

Les catégories SELF, RELATION, OWNER, ADMIN, AGGREGATE et INTENDED PUBLIC indiquent la frontière observée dans le corps. Elles signifient « garde identifiée à la lecture », sans prétendre qu'un test d'abus exhaustif existe pour chaque fonction. F1/F2 restent vulnérables dans le snapshot de production ; leur correctif appartient uniquement à la candidate.

| Fonction publique (signature du snapshot) | Droits | Classe | Garde / observation exacte | Empreinte |
| --- | --- | --- | --- | --- |
| `delete_own_account()` | A | SELF | auth.uid nonnull; all deletions use v_uid; quoted dynamic helpers revoked from API. | `f926b087e214` |
| `export_own_data()` | A | SELF | auth.uid nonnull; own profile and relations; candidate cumulative extras retain owner id. | `3f183fa6c6b8` |
| `titan_admin_feature_flag_set_v1(p_key text, p_enabled boolean, p_rollout integer, p_description text, p_expected_updated_at timestamp with time zone, p_create boolean)` | A | ADMIN | private.titan_moderation_require_admin before writes; key/rollout validation and audit. | `d5442ab0904c` |
| `titan_admin_feature_flags_v1()` | A | ADMIN | private.titan_moderation_require_admin before flag descriptions are read. | `7b6cddf5c222` |
| `titan_appeal_decide_v1(p_id bigint, p_accept boolean, p_note text)` | A | ADMIN | require_admin; appeal row locked; no self moderation; audited downstream exclusion/restore. | `e7013ae5d132` |
| `titan_appeal_list_v1(p_status text, p_limit integer)` | A | ADMIN | require_admin; status allowlist; limit <=100. | `a4677e182805` |
| `titan_appeal_submit_v1(p_kind text, p_session uuid, p_message text)` | A | SELF | auth.uid nonnull; session belongs to caller or own suspended account; bounded text/caps. | `c616fd505581` |
| `titan_assign_friend_code()` | A | SELF | auth.uid nonnull; reads/updates only profiles.id=auth.uid. | `e7622db16999` |
| `titan_atelier()` | A | SELF | auth.uid nonnull/profile exists; own balance, entitlement and inventory through ownership helpers. | `c98e8eafae53` |
| `titan_block_user(p_blocked_id uuid, p_reason text)` | A | SELF+RELATION | caller is blocker; self-block refused; deletes only caller-related friendship; bounded reason. | `534a5ad8c525` |
| `titan_challenge_create(p_title text, p_metric text, p_sport text, p_target numeric, p_days integer, p_invitees uuid[])` | A | RELATION | creator=auth.uid; invitees limited to10 and private.titan_are_friends; actor not suspended. | `7fd7cb5d9444` |
| `titan_challenge_respond(p_id uuid, p_action text)` | A | RELATION | membership selected/updated by challenge_id AND user_id=auth.uid; allowed state transitions. | `9d5174d4a126` |
| `titan_claim_achievement(p_achievement_id text)` | A | SELF | own profile locked; earned criterion computed from own logs; no client reward; one claim. | `4f7ebb5e3eb7` |
| `titan_create_guild(p_name text, p_motto text)` | A | SELF+RELATION | owner/current membership=auth.uid; server price charged atomically; suspension checked. | `6619b3f851c1` |
| `titan_create_social_challenge(p_opponent uuid, p_sport text, p_target numeric)` | A | SELF+RELATION | challenger=auth.uid; own profile lock; available opponent; zero stake and bounded target/rate. | `8eb1f96940ef` |
| `titan_displayed_title()` | A | SELF | auth.uid nonnull; own appearance passed to title-earned serialization. | `40557eaa1d97` |
| `titan_economy_journal_v1(p_user uuid, p_limit integer)` | A | ADMIN | auth.uid nonnull AND private.titan_is_admin; optional target cannot bypass gate; limit<=200. | `449e29547b9b` |
| `titan_expedition_board(p_id text)` | A | AGGREGATE | published expedition only; collective minutes/count; individual detail only for auth.uid membership. | `6ece19bdc9a2` |
| `titan_expedition_join(p_id text)` | A | SELF+RELATION | nonnull auth.uid; published/open expedition; insertion user_id=caller. | `e6963be062e1` |
| `titan_expedition_titles()` | A | SELF | join user_id=auth.uid; earned days/minutes computed for same uid; null uid returns no rows. | `c0164e4da78a` |
| `titan_feature_flags_v1()` | N+A | INTENDED PUBLIC | anon intended: boolean flag values/rollout only; no descriptions or account records. | `4a2359c3a9a6` |
| `titan_find_profile_by_friend_code(p_friend_code text)` | A | CONFIRMED F1 | Nonnull caller only; snapshot returns private/suspended/blocked target fields. Candidate fix required. | `0f6954f6f693` |
| `titan_get_my_guild()` | A | RELATION | guild resolved exclusively via caller membership; explicit member fields, guild messages/aggregate. | `9024940bb2ea` |
| `titan_guild_set_effort_target(p_minutes integer)` | A | OWNER | UPDATE guilds WHERE owner_id=auth.uid; target bounded60..100000. | `d1656fb4e2f5` |
| `titan_guild_week()` | A | RELATION | guild derived from caller membership; bounded aggregate days/minutes for same guild. | `0f5a72bf0512` |
| `titan_join_guild(p_code text)` | A | RELATION | nonnull unsuspended caller; normalized possession code; modifies only caller membership/profile. | `8fe33657dee3` |
| `titan_leave_guild()` | A | RELATION | caller membership deleted; owner transfer only when caller is guild owner. | `ba49927399ef` |
| `titan_list_global_messages()` | A | AUTHENTICATED READ | nonnull caller; public chat only, hidden/expired excluded, <=90; purge uses fixed TTLs. | `3427cf29b727` |
| `titan_list_guild_messages()` | A | RELATION | guild selected from caller membership; hidden/expired excluded; <=80. | `d842bae6b534` |
| `titan_list_my_friends()` | A | CONFIRMED F2 | Snapshot accepts pending relationships and defaults missing privacy true; target own-log aggregates leak before consent. | `1067173862ca` |
| `titan_moderation_case_v1(p_user uuid)` | A | ADMIN | require_admin before target profile, suspicious payloads and decisions. | `ecef69ef97f3` |
| `titan_moderation_decide_v1(p_user uuid, p_decision text, p_reason text)` | A | ADMIN | require_admin; no self/admin target; own admin audited profile mutation; target row lock. | `0123029b6376` |
| `titan_moderation_queue_v1(p_limit integer)` | A | ADMIN | require_admin before signals across accounts; limit<=200. | `577387dadc01` |
| `titan_moderation_revert_v1(p_decision_id bigint, p_reason text)` | A | ADMIN | require_admin; latest decision only; no self/admin target; locked profile and prior snapshot. | `afd0202c1640` |
| `titan_moment_cheer(p_id uuid)` | A | RELATION | nonnull caller; visible friends-only moment; accepted unblocked friend via helper; caller cheer only. | `98568c34cfa6` |
| `titan_moment_delete(p_id uuid)` | A | SELF | DELETE WHERE id=p_id AND user_id=auth.uid; null caller refused. | `23e2d85870ca` |
| `titan_moment_share(p_kind text, p_title text, p_detail text, p_sport text, p_log_id uuid, p_visibility text)` | A | SELF+RELATION | author=auth.uid; optional session must belong to caller and be active; private/friends visibility only. | `439094a64433` |
| `titan_mutate_analysis_view(p_action text, p_id uuid, p_expected_revision integer, p_name text, p_kind text, p_options jsonb)` | A | SELF | owner check after id lookup; own entitlement fresh/locked; revision lock, max10, allowlisted options. | `e62823c79d73` |
| `titan_my_appeals_v1()` | A | SELF | nonnull auth.uid; WHERE user_id=v_user; bounded50. | `3d9200b901cf` |
| `titan_my_review_state_v1()` | A | SELF | own profile/excluded sessions; own appeal predicate; bounded50. | `e4f71dbfb637` |
| `titan_my_verification_requests_v1()` | A | SELF | nonnull auth.uid; count/list WHERE user_id=v_user; bounded20. | `0bc033a3e838` |
| `titan_public_card(p_slug text)` | N+A | INTENDED PUBLIC | anon intended: enabled slug, target not suspended, explicit name/level/totals/sports/titles toggles; no route/raw logs. | `a25d2d84e3df` |
| `titan_public_card_save(p_enabled boolean, p_show jsonb, p_new_link boolean)` | A | SELF | nonnull unsuspended caller; upsert key user_id=auth.uid; controlled visibility booleans/new slug. | `2d765ad8a57a` |
| `titan_public_card_settings()` | A | SELF | nonnull auth.uid; WHERE user_id=auth.uid; fixed card-settings serializer. | `1cac547db9b4` |
| `titan_public_card_title(p_slug text)` | N+A | INTENDED PUBLIC | anon intended: enabled slug AND show_titles; target suspension checked; earned title helper. | `7fbeca48731f` |
| `titan_purchase_shop_item(p_item_id text)` | A | SELF | caller profile locked; active cosmetic/credits-only sale; server price; once-only ownership; no rewards. | `ac7852627f53` |
| `titan_report_chat_message(p_message_id text, p_reason text)` | A | AUTHENTICATED WRITE | nonnull caller; target global message exists; self-report refused; reporter=auth.uid; bounded reason. | `4af3011a732c` |
| `titan_save_profile_state(p_state jsonb, p_username text, p_avatar text, p_inventory jsonb, p_privacy jsonb, p_streak_count integer, p_last_week_id text, p_last_seen_news_version text)` | A | SELF | own unsuspended profile locked; revision; allowlisted preferences; authoritative XP/credits/role/inventory retained. | `532919d8ef8a` |
| `titan_send_global_message(p_content text)` | A | SELF | nonnull unsuspended caller; sender from own profile; bounded content; charged server price and trigger guards. | `151093d468f9` |
| `titan_send_guild_message(p_content text)` | A | RELATION | nonnull unsuspended caller; guild from own membership; sender=caller; bounded content/server charge. | `4cca65f89084` |
| `titan_session_exclusion_v1(p_session uuid, p_excluded boolean, p_reason text)` | A | ADMIN | require_admin; locked target log; no self/admin target; audit and guarded exclusion marker; reward settlement internal. | `c83ede09be0c` |
| `titan_session_risk_v1(p_user uuid, p_limit integer)` | A | ADMIN | require_admin before risk helper accepting arbitrary user; bounded helper. | `29b4d5616005` |
| `titan_set_appearance(p_slot text, p_item text)` | A | SELF | own profile; slot allowlist; equipped item must pass own cosmetic entitlement helper. | `8efc869f4919` |
| `titan_set_displayed_title(p_key text)` | A | SELF | nonnull unsuspended caller; key syntax and private.titan_title_earned for caller; rate limit. | `95109557b3bc` |
| `titan_set_guild_target(p_target integer)` | A | OWNER | guild WHERE owner_id=auth.uid; target1..30; update of that guild only. | `708e23f6e1b3` |
| `titan_social_overview()` | A | RELATION | accepted unblocked friends via helper; explicit privacy flags false; own requests/moments/challenge membership. | `c4fa0f4ebaac` |
| `titan_social_remove(p_user uuid)` | A | RELATION | deletes caller-involved friendship; removes only pending invite issued by caller-owned challenge. | `bab8c1d2a5a5` |
| `titan_social_request(p_code text)` | A | RELATION | nonnull caller; target publicProfile=true, not suspended or blocked; creates pending relation only. | `1e9d2ae20869` |
| `titan_social_respond(p_user uuid, p_accept boolean)` | A | RELATION | pending WHERE requester=p_user AND recipient=auth.uid; only recipient accepts/declines. | `62bc6ce0a331` |
| `titan_submit_cache_reconciliation(p_local_state jsonb)` | A | SELF | nonnull caller; own cloud state only; payload<=512KB; diagnostic insert, no progression mutation. | `d5744b46d3a1` |
| `titan_submit_combat_victory(p_enemy_key text, p_enemy_type text, p_enemy_id text, p_name text, p_level integer, p_reward_mult numeric, p_damage integer, p_details jsonb)` | A | SELF | own unsuspended profile locked; own bestiary/log; XP/credits forced zero despite client reward params. | `e48788f71f0b` |
| `titan_submit_training_session(p_sport text, p_category text, p_val numeric, p_unit text, p_details jsonb, p_date timestamp with time zone)` | A | SELF | own unsuspended profile locked; own idempotent receipt; server effort/caps; bounded date/value/details; held risky reward. | `fd4c4f233b53` |
| `titan_transition_social_challenge(p_id uuid, p_action text)` | A | RELATION | caller involved; participant-specific accept/decline/cancel; locked row; no legacy stake. | `364795892750` |
| `titan_unblock_user(p_blocked_id uuid)` | A | SELF | DELETE WHERE blocker_id=auth.uid AND blocked_id=p_blocked_id; own action log. | `2f51b683e66d` |
| `titan_verification_answer_v1(p_id bigint, p_answer text)` | A | SELF | locked request WHERE id=p_id AND user_id=auth.uid; open-only bounded answer. | `e80f024777c7` |
| `titan_verification_close_v1(p_id bigint)` | A | ADMIN | require_admin before target request mutation/audit. | `9963ed2f3e09` |
| `titan_verification_list_v1(p_status text, p_user uuid, p_limit integer)` | A | ADMIN | require_admin before optional arbitrary target list; allowlisted status; limit<=100. | `81ee1d6f009b` |
| `titan_verification_request_v1(p_user uuid, p_message text)` | A | ADMIN | require_admin; no self; real target; bounded message/open-count/cooldown; audit. | `0cd1f244b617` |

## Défauts confirmés et correction minimale

F1 : `titan_find_profile_by_friend_code(text)` exige uniquement un appelant connecté et l'égalité de `friend_code`. Ainsi un code connu ou deviné renvoie UUID, nom, avatar, niveau, statut Elite et suspension, même lorsque `publicProfile=false`, le profil est suspendu ou l'une des parties bloque l'autre. `titan_social_request` fait déjà le contraire : même refus pour code inconnu, privé, suspendu ou bloqué. La correction aligne la recherche historique sur cette intention explicite et garde le même schéma de retour ; une recherche autorisée continue de fonctionner. Le niveau est masqué si showStats n'est pas explicitement vrai.

F2 : `titan_list_my_friends()` sélectionne toutes les lignes `friendships` impliquant l'appelant sans vérifier `status`. Une simple demande en attente suffit pour inclure la cible et calculer son nombre de séances / sport préféré. En outre, les clés `publicProfile`, `showStats`, `socialPresence` absentes sont traitées comme vraies, contrairement à la configuration privée par défaut et au nouvel aperçu social. La correction restreint aux amitiés acceptées via `private.titan_are_friends`, conserve le filtrage des blocages/suspensions et traite les drapeaux absents comme faux. Les valeurs explicitement partagées restent visibles après acceptation.

Correctif candidat : `20261102130000_legacy_social_privacy.sql`, deux CREATE OR REPLACE, mêmes signatures, aucun changement de données de profil/séance et aucun nouveau droit. Le CLI Supabase n'est pas installé dans cet environnement ; le nom suit le prochain créneau UTC libre après `20261102120000`. Le retour arrière vers les définitions antérieures réintroduirait les deux fuites : en cas d'incident, fermer temporairement EXECUTE pour authenticated sur ces deux RPCs plutôt que restaurer les corps vulnérables. Les wrappers historiques internes qui consomment la liste d'amis sont déjà révoqués de l'API ; le contrat reste utilisable pour des relations consenties.

## Autres alertes et surface candidate

Les 20 informations « private + RLS activée sans policy » sont compatibles avec des tables internes sans droit API, lues par des RPCs SECURITY DEFINER qui vérifient elles-mêmes l'appelant. Ajouter une policy permissive pour faire disparaître l'alerte ouvrirait la table. Les tests `300_admin_surface`, `300_rls_coverage`, `300_garmin_tokens`, `300_routes`, `300_coach_tools` et les gates de catalogues doivent vérifier cette fermeture ; les alertes seules ne prouvent ni fuite ni innocuité.

Les 61 autres fonctions publiques du snapshot n'ont aucun EXECUTE anon/authenticated ; les 46 privées incluent helpers de policies, triggers, services et outils admin. Les fonctions internes recevant un UUID arbitraire (récompenses, charge, export/effacement, risque) ne deviennent sûres que si leurs droits restent fermés et leurs appelants gardés. Les fonctions privées accordées à authenticated, notamment portail coach, aventure, correction de séance et snapshots, vérifient identité/propriétaire/relation ; les fonctions admin privées exigent l'assertion admin. Ne pas exposer le schéma private dans PostgREST ; ses trois helpers de rôle accordés à anon ne constituent pas des endpoints publics tant que ce schéma reste privé.

La candidate V1.1 crée aussi des RPCs après le snapshot, notamment import, Garmin, consultations, intentions, binômes, saisons, défis par lien, monde, clubs, factions, places Coach, outils Coach et parcours ; elles ne sont pas comprises dans les 71 alertes historiques. La matrice individuelle ci-dessus ne doit pas être présentée comme leur audit exhaustif. Leurs frontières de propriétaire/participant/admin/service, signatures, révocations et search_path sont examinées dans les fichiers sensibles et exercées par les suites métier disponibles. Les gates de catalogues en fixent l'inventaire de droits. Exemples sensibles : jetons Garmin réservés service_role et jamais exportés ; traces GPS uniquement user_id=auth.uid, aucune lecture coach/ami/carte publique ; check-ins coach visibles au coach uniquement si partagés et relation encore autorisée ; modifications de produits/plans exigent le rôle admin. Pas de remplacement massif en SECURITY INVOKER : certaines fonctions doivent franchir des tables internes pour appliquer leurs gardes.

Le search_path fixé réduit la résolution contrôlée par l'appelant ; le contrôle complémentaire confirme aussi les propriétaires et l'absence de CREATE pour les deux rôles API dans public. La seule présence de SECURITY DEFINER reste une surface à examiner : [documentation Supabase sur les fonctions](https://supabase.com/docs/guides/database/functions), [RLS et fonctions privilégiées](https://supabase.com/docs/guides/database/postgres/row-level-security). Le chargement du changelog Markdown a échoué dans l'outil de lecture (type MIME non pris en charge) ; la documentation officielle de fonctions et la recherche documentaire Supabase ont été consultées. Aucun changement de version Supabase n'est proposé.

L'option Auth « leaked password protection » désactivée reste ouverte et dépend de la configuration Auth/service, pas d'une migration SQL locale. Aucune activation distante n'a été tentée.

## Vérification

Résultats locaux observés le 2 novembre 2026 :

- Baseline et toutes les migrations depuis `20261005150000` jusqu'à routes rejouées dans **PGlite 0.3.14**, PostgreSQL embarqué en mémoire. Seule la déclaration d'extension pgcrypto absente du moteur est omise ; aucune fonction crypto n'est simulée.
- Nouveau test exécuté contre les corps historiques : **rouge**, cinq assertions de confidentialité reproduites (privé, suspendu, bloqué, demande en attente, showStats absent). Après la migration corrective : **vert**, y compris retrait du partage des statistiques, blocage dans les deux sens, relation acceptée et recherche publique autorisées. Deuxième application de la migration et même test : **verts**.
- `tools/db/postflight-v11.sql` sur l'état candidat et le registre synthétique des 31 migrations : **aucune ligne bloquante en échec**. Les quatre nouvelles mutations négatives (grants API/RLS routes, anon sur chaque ancienne RPC) sont toutes détectées puis annulées. La table `private.titan_routes`, auparavant absente de l'inventaire des tables du gate alors que ses RPCs étaient listées, y est ajoutée.
- `node --test tests/production-plan.test.mjs` : **4/4** ; `git diff --check` : vert.

Reproduction ciblée : installer PGlite hors du dépôt, puis lancer `node tools/db/test-sql-security-pglite.mjs /chemin/vers/@electric-sql/pglite`. Le script n'ouvre aucune connexion distante ; il recrée la baseline, constate les cinq défauts avant correctif, vérifie le correctif et les mutations des gates, puis détruit la base en mémoire. Le test SQL est également inclus automatiquement dans le banc natif via le glob `300_*.sql`.

Une tentative complémentaire des 98 fichiers SQL sous PGlite a donné **77 réussites, 21 non aboutis**. Cela n'est pas un banc natif entièrement vert. Les limites sont consignées sans désactiver leurs assertions :

| Cause observée | Fichiers non aboutis |
| --- | --- |
| `extensions.gen_random_bytes` absent, car pgcrypto indisponible | `300_account_deletion.sql`, `300_coach_seats.sql`, `300_coach_tools.sql` |
| Nom de base embarquée ne satisfait pas la garde `titan_test_` | `300_adventure_multisport.sql`, `300_adventure_personal_targets.sql`, `300_z_account_deletion_migration.sql`, `300_z_adventure_personal_migration.sql`, `300_z_adventure_quest_migration.sql`, `300_z_analytics_migration.sql`, `300_z_appeals_migration.sql`, `300_z_economy_audit_migration.sql`, `300_z_entitlement_transaction.sql`, `300_z_moderation_migration.sql`, `300_z_purchase_admin_migration.sql`, `300_z_rate_limits_migration.sql`, `300_z_reward_holds_migration.sql`, `300_z_risk_analysis_migration.sql`, `300_z_session_exclusion_migration.sql`, `300_z_session_risk_migration.sql` |
| Métacommandes psql (au-delà des inclusions SQL simples) non exécutables dans PGlite | `300_z_cosmetic_migration.sql` |
| Assertion de présence du verrou advisory dans `pg_locks` en échec sur moteur embarqué ; aucune preuve de verrouillage/concurrence tirée de ce moteur | `300_risk_analysis.sql` |

Le banc natif `tools/db/test-migrations.sh`, son chemin `RELEASE_SQL=supabase/release-300.sql` et les scripts de concurrence à deux connexions **restent requis** sur PostgreSQL natif avec pgcrypto, uuid-ossp, pg_trgm, psql et capacité de créer une base `titan_test_`. PostgreSQL natif n'a pas pu être installé dans cette session (contraintes uid/filesystem de l'environnement). L'absence de ces vérifications empêche de conclure à une validation SQL complète de publication. Le réglage Auth et les vérifications PostgREST restent ouverts.
