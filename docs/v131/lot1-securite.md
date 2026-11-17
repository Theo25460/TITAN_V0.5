# Lot 1 · Sécurité Supabase (hors couche sociale)

Périmètre : fonctions exposées, RLS, récompenses, coach, suppression et export, limites de débit, stockage, configuration Auth, concurrence, performance.
La couche sociale (amitiés, blocages, défis) est couverte par la migration `20261114160000` et n'est pas reprise ici.
Rien n'a été écrit en production : lecture seule (`SELECT` sur catalogues et agrégats, aucune ligne personnelle).

Fichiers du lot : `supabase/migrations/20261114170000_v131_security_advisors.sql` (nouveau), `sql/tests/300_v131_security_advisors.sql` (nouveau),
`tools/db/postflight-v131.sql` (contrôles ajoutés), ce document.

## 0. Méthode et fidélité du banc

- Production `oubmftfufwwzwpgvrcag` (PostgreSQL 17.6, 25 comptes, base de 29 Mo) : requêtes de catalogue et d'agrégats par l'outil Supabase.
- Banc local jetable : PostgreSQL 16, `/var/lib/postgresql/titan-pg-sec`, port 54341. Structure de production (`tools/db/baseline`) + migrations rejouées ;
  attaques sous `anon` et `authenticated` avec revendications JWT, comptes synthétiques. Arrêté et supprimé en fin de lot.
- Le conseiller Supabase n'a pas été relu en entier (≈ 100 ko) : ses constats connus (169 / 5 fonctions `SECURITY DEFINER` exposées, 66 tables privées sans politique,
  un `search_path` modifiable, mots de passe compromis non vérifiés) ont été **recalculés en SQL** sur les catalogues, ce qui donne les objets exacts.

**Le banc reproduit-il la production ?** Empreintes comparées (tri `collate "C"`) entre la production et le banc rejoué jusqu'à `20261104085851` :

| Catégorie | Production | Banc | Verdict |
|---|---|---|---|
| Fonctions `public` + `private` : nombre, `SECURITY DEFINER`, droits `anon` / `authenticated`, `search_path` | 361 | 361 | Identiques (32 seaux d'empreintes égaux) |
| Corps des fonctions après normalisation (casse, blancs, commentaires) | 361 | 361 | 358 identiques ; 2 écarts de parenthésage sans effet (`handle_audit_log`, `titan_session_exclusion_v1`) ; **1 écart réel : D1** |
| Politiques RLS · déclencheurs · index | 118 · 48 · 336 | idem | Identiques |
| Droits de table `anon` / `authenticated` | 139 tables | 139 | Identiques (`afdba815`) |
| Colonnes · tables avec RLS | 1 132 · 140 | 1 127 · 139 | Une table de plus en production : `private.titan_rpc_backup_20261104` (D5) |
| Contraintes | 547 | 547 | 1 écart d'affichage PG 17 / PG 16 (`daily_quests_difficulty_check`), sans effet |

Deux enseignements de cette comparaison :

1. Les corps de production ont été **ressaisis** lors de leur application (commentaires retirés, mots-clés en majuscules, 91 fonctions en `\r\n`). Ils ne sont pas
   octet pour octet ceux du dépôt ; une de ces ressaisies a introduit un défaut (D1). Les migrations doivent être appliquées **telles quelles, à partir du fichier**.
2. La production porte des privilèges par défaut (`ALTER DEFAULT PRIVILEGES` : toute fonction créée dans `public` par `postgres` reçoit `EXECUTE` pour `anon` et
   `authenticated` ; toute table reçoit `SELECT` pour `anon` et l'écriture pour `authenticated`) que **le banc n'a pas**. Contrôle fait : migrations en attente
   rejouées sur une copie munie de ces privilèges → exposition finale identique à celle du banc (`diff` vide sur 383 fonctions et 145 tables). Aucun oubli de `revoke`.
   Reste un angle mort des tests : une future migration qui ne révoquerait que `public` passerait au banc et serait ouverte en production (à faire par : responsable
   de `tools/db/supabase-shim.sql`, ajouter ces privilèges par défaut au banc).

## 1. Défauts trouvés

| # | Défaut | Gravité | Preuve | Correction | Statut |
|---|---|---|---|---|---|
| D1 | **L'export RGPD échoue en production pour tout compte lié à Garmin ou ayant eu un binôme.** `private.titan_export_extras_before_rpg_v1`, ressaisie en production, a perdu deux clés : `jsonb_build_object(…, 'revoked_at', g.revoked_at, g.last_event_at)` et `(…, 'ends_on', b.ends_on, b.ended_at)`. Nombre impair d'arguments : erreur `22023` dès qu'une ligne existe. Aujourd'hui 0 lien Garmin et 0 binôme : défaut latent, qui se déclenche à la première liaison Garmin, donc avec la V1.3.1. Aucune migration en attente ne le répare. | P1 | Production : `position('g.revoked_at, g.last_event_at)' in prosrc) > 0` → vrai, idem `'b.ends_on, b.ended_at)'`. Banc avec le corps de production : `export_own_data()` → `ERROR: argument list must have even number of elements` pour le compte lié, export normal pour un compte non lié. Dépôt correct : `20261102120000_routes.sql:183`. | `20261114170000` § 2 : corps du dépôt réinstallé (sans effet sur une base issue du dépôt). Contrôles `export:garmin link names last_event_at` et `export:buddy pair names ended_at` dans `postflight-v131.sql`. | Corrigé, non testé en conditions réelles |
| D2 | **« Exporter toutes mes données » n'exportait pas tout.** 26 familles de données rattachées au compte manquaient : liens, programmes et invitations coach ; recours ; vues d'analyse enregistrées ; demandes de vérification et d'assistance ; blocages ; signalements déposés ; journal de combat ; droits d'accès (abonnements) ; récompenses retenues ; plafonds hebdomadaires ; journal des mouvements de crédits et d'XP ; statistiques d'usage ; décisions de modération ; messages de guilde ; encouragements et relances envoyés ; défis et liens de duel créés ; participations aux concours ; parrainages. La politique de confidentialité promet l'accès et la portabilité par ce bouton (`legal_privacy.html`, « Accès et portabilité »). | P1 | Banc : tables contenant l'identifiant d'un compte utilisé (25) comparées aux clés de son export ; catalogue : 50 tables à clé étrangère vers le compte absentes du code d'export. | `20261114170000` § 3 : nouvelle fonction interne `private.titan_export_extras_v131_v1`, ajoutée en fin de `export_own_data()`. La chaîne existante n'est ni renommée ni modifiée (les contrôles `postflight-v11` et `postflight-v13` restent valides). Identifiants d'équipe, notes internes, empreintes de jetons et jetons d'achat exclus. | Corrigé et vérifié (banc) |
| D3 | **Dépôt anonyme sans borne dans `public.bug_reports`.** Un visiteur non connecté pouvait insérer des lignes de taille quelconque et choisir `status`, `severity`, `admin_note`, `screenshot_url`. Scénario : remplir la base (29 Mo aujourd'hui) en quelques centaines de requêtes, ou pré-remplir la note interne lue par l'équipe. La table n'a aucun appelant dans le Web ni dans l'application et n'a reçu aucune ligne depuis le 21 novembre 2025 (`n_tup_ins = 0`). | P1 | Banc, rôle `anon` : `insert … values (repeat('T',100000), repeat('D',1000000), 'resolved', 'critical', 'note posée par un anonyme', …)` → `INSERT 0 1` ; 5 000 lignes en une requête → acceptées. | `20261114170000` § 4 : politique **restrictive** `bug_reports_intake_bounds_v131` (titre 3 à 200, description ≤ 5 000, détails techniques ≤ 8 000 octets, `status = 'new'`, `admin_note` vide, gravité dans la liste). Le droit `INSERT` n'est pas retiré. | Corrigé et vérifié (banc) |
| D4 | `private.titan_intent_day_ok(date)` : `search_path` laissé à l'appelant, et déclarée `IMMUTABLE` alors qu'elle lit `current_date`. | P2 | Catalogue (production et banc) : `proconfig` vide, `provolatile = 'i'`. | `20261114170000` § 1 : `search_path = ''`, `STABLE`, corps inchangé (`ALTER FUNCTION`). Plus aucune fonction des schémas applicatifs sans `search_path` fixé. | Corrigé et vérifié (banc) |
| D5 | Table `private.titan_rpc_backup_20261104` en production, absente du dépôt : sauvegarde de 5 définitions prise lors du correctif `PT409`. RLS activée, aucun droit API, 5 lignes. | P2 | Production : colonnes `function_signature, original_definition, original_owner, original_grants, backup_date`. | Aucune : ne rien supprimer. Les définitions sauvegardées lèvent `40001` : ne jamais les réinstaller. | En attente d'approbation (retrait) |
| D6 | `20261104085851` appliquée en production hors registre. | P1 (processus) | Registre arrêté à `20261102150000` ; 6 fonctions portent `PT409`, aucune ne lève `40001`. | Runbook § 6, étape 1 : la rejouer pour l'inscrire. Rejeu prouvé sans effet (empreinte des 361 corps identique avant et après sur le banc). | En attente d'approbation |
| D7 | **Fichier d'un compte supprimé encore public.** Le seau `avatars` (public) contient 1 objet (JPEG, 139 ko, janvier 2026) dont le propriétaire n'existe plus dans `auth.users`. La suppression de compte ne touche pas au stockage. | P1 (confidentialité) | Production : `storage.objects` → 1 objet, `orphan_owner = 1`. | Hors SQL : supprimer l'objet par l'API ou le tableau de bord Storage. À faire par : titulaire du projet. | En attente d'approbation |
| D8 | Seau `avatars` : public, sans limite de taille ni de type, dépôt ouvert à tout compte connecté (`name like auth.uid() || '%'`). Aucun code client n'y dépose plus rien (seul `js/ui.js:315` lit une URL publique). Scénario : héberger n'importe quel fichier sur le domaine de stockage du projet. | P2 | Production : `storage.buckets` (`public = true`, `file_size_limit` et `allowed_mime_types` nuls), 4 politiques sur `storage.objects`. | Décision : fermer le dépôt (retirer les 2 politiques `INSERT`) ou borner (`file_size_limit`, `image/*`). Réglage Storage, pas une migration du dépôt. | Borné par `20261116100000` (2 Mo, PNG/JPEG/WebP, test `300_v131_abuse_bounds.sql`), appliqué en production le 16/11. Retrait des 2 politiques `INSERT` : tableau de bord Storage (propriétaire `supabase_storage_admin`, hors portée de `postgres`). |
| D9 | `public.contact_messages` : dépôt anonyme borné par ligne (3 000 caractères) mais sans limite de nombre ; aucun appelant, 0 ligne en un an. `analytics_events` : même absence de limite pour un visiteur anonyme (contenu validé, purge mensuelle). | P2 | Banc, `anon` : 5 000 messages de 3 000 caractères en une requête → acceptés. Test existant `300_security_lockdown.sql:56` qui exige ce droit (« contact form still open »). | Non modifié : décision produit (formulaire supprimé ?). Une limite pour un anonyme ne se fait pas en SQL (pas d'identité) : passer par une fonction serveur ou un captcha. | En attente d'approbation |
| D10 | Le compte d'équipe (1 administrateur) n'a aucun second facteur ; la vérification des mots de passe compromis est désactivée. Ce compte lit tous les profils et accorde TITAN+. | P1 | Production : `auth.mfa_factors` vide, 1 profil `admin`, 1 ligne `titan_admins` active ; conseiller : protection désactivée. | Réglages Auth (tableau de bord). | En attente d'approbation |
| D11 | Pas de limite de débit sur `titan_submit_cache_reconciliation` (une ligne ≈ 1 ko par appel, charge utile acceptée jusqu'à 512 ko, aucune purge) ni sur `titan_find_profile_by_friend_code` (déjà noté le 14 novembre). | P2 | Banc : 300 appels consécutifs → 300 lignes ; production : 737 insertions pour 25 comptes. | Non modifié (changerait le comportement d'un RPC appelé au démarrage, `js/state.js:299`). À faire par : lot données. | Corrigé pour `titan_submit_cache_reconciliation` par `20261116100000` : 20 rapports par compte et 24 h, réponse inchangée, conservation 90 jours (test rouge puis vert). Appliqué en production le 16/11. `titan_find_profile_by_friend_code` borné à 30 recherches par heure par `20261116110000` (test rouge puis vert), appliqué en production le 16/11. |

## 2. Matrice

| Élément | Attendu | Réalité constatée | Écart | Gravité | Correction | Preuve | Statut |
|---|---|---|---|---|---|---|---|
| a. Fonctions exécutables par `anon` | Uniquement du contenu public | 19 dans `public` : 14 calculs purs sans accès aux données, 5 `SECURITY DEFINER` (carte publique × 3, aperçu de lien de duel, drapeaux). 4 dans `private`, inatteignables (`anon` n'a pas `USAGE`). | Aucun | — | — | Balayage : 19 appels sous `anon`, aucun ne rend de donnée de compte ; carte : `CARD_NOT_FOUND` sans lien activé ; lien : jeton de 64 hexadécimaux comparé par SHA-256 | Vérifié conforme |
| a. Fonctions exécutables par `authenticated` | Contrôle d'identité, de propriété ou de rôle dans chacune | 209 dans `public` (169 `SECURITY DEFINER`), 24 dans `private`. Voir § 3. | Aucun exploitable | — | — | Balayage des 209 sous un joueur hostile avec l'identifiant d'un autre compte : 52 refus `ADMIN_REQUIRED` / `ADMIN_ONLY`, aucune lecture ni écriture croisée | Vérifié conforme |
| a. Schéma `private` atteignable ? | Non servi par l'API | `USAGE` accordé à `authenticated` (nécessaire aux enveloppes `SECURITY INVOKER`), pas à `anon`. Non servi : le conseiller compte 169 / 5, soit exactement `public` ; `pg_stat_statements` ne contient aucune requête `"private".…` des rôles API ; `pg_graphql` absent. | Liste des schémas exposés non lisible en SQL | P2 | — | Requêtes de catalogue ; `pg_stat_statements` | Bloqué par un accès externe (réglage API du projet à lire dans le tableau de bord) |
| a. Production : aides coach et droits d'accès | Réservées au serveur | 7 fonctions `private.titan_coach_*` / `titan_entitlement*` exécutables par `PUBLIC`, `anon`, `authenticated` | Fermé par `20261110142656` et `20261110130137`, non appliquées | P1 tant que non appliquées (P0 si `private` était un jour exposé : `titan_coach_seat_write` ouvre un TITAN+ à n'importe qui) | Runbook § 6 | § 4 ; test existant `300_v131_coach_grants.sql` | En attente d'approbation |
| b. RLS sur les schémas exposés | Activée partout, aucune écriture pour tous | 80 tables `public`, 60 `private` : RLS activée sur toutes ; aucune politique d'écriture `USING (true)` ; `USING (true)` seulement en lecture de catalogues (sports, succès, objets, mondes…) | Aucun | — | — | Catalogue production = banc (118 politiques, empreinte égale) | Vérifié conforme |
| b. `profiles` : colonnes sensibles | Invisibles aux autres comptes et aux anonymes | Lecture : sa propre ligne, ou modérateur / administrateur. Écriture directe : administrateur seul. `email` jamais renseigné (0 / 25). Un modérateur lit toutes les colonnes, y compris facturation et notes internes. | Étendue de lecture du modérateur | P2 | Décision : vue restreinte pour le rôle modérateur | Banc : `select id, username, email from profiles` sous A → 1 ligne (la sienne) ; `update … set credits, xp, level, is_elite, role, is_admin, is_premium` → `UPDATE 0` | Vérifié conforme (remarque P2) |
| b. `profiles` par les RPC | Rien de plus que le profil public | `titan_find_profile_by_friend_code` rend `is_elite` et `is_suspended` d'un profil trouvable à qui connaît son code | Statut payant visible | P2 | À faire par : lot social | Lecture du corps | Non terminé |
| b. Séances, records, statistiques, tracés, jetons Garmin, pas, assistance, recours, statistiques d'usage | Propriétaire seul (ou administrateur) | `training_logs` : propriétaire ou administrateur ; tracés, jetons Garmin, pas, assistance, recours : tables `private` sans droit API, lues par des RPC filtrés sur `auth.uid()` ; `analytics_events` : lecture administrateur seule | Aucun | — | — | Balayage : `titan_route_get_v1`, `titan_analysis_views`, `titan_coach_*`, `titan_challenge_result_v1` avec l'identifiant de B → `NOT_FOUND` / `SHARING_UNAVAILABLE` ; tests existants `300_user_isolation`, `300_routes`, `300_garmin_tokens` | Vérifié conforme |
| b. Politique `coupons` | Pas d'identifiant en dur | `USING (auth.uid() = '080d9fef-…')` ; aucun droit de table, donc inerte | Identifiant de compte dans une politique | P2 | Supprimer la politique (décision) | Catalogue | En attente d'approbation |
| c. XP, crédits, niveau, possessions | Calculés par le serveur | Écriture directe refusée ; `titan_save_profile_state` ignore `credits`, `xp`, `level`, `isElite`, inventaire envoyés par le client ; `titan_submit_combat_victory` force les récompenses à 0 malgré `p_reward_mult` ; succès vérifiés sur les séances, une fois | Aucun | — | — | Banc : état envoyé `credits 999999, level 99, isElite true` → profil inchangé (`200 \| 0 \| 1 \| f \| {}`) ; tests `300_client_writes`, `300_economy_attacks` | Vérifié conforme |
| c. Rejeu d'une séance | Une seule récompense par `client_event_id` | Reçu par compte : même contenu → même réponse, sans second gain ; contenu différent → `EVENT_CONTENT_CONFLICT` ; le profil est verrouillé pendant l'appel | Aucun | — | — | Banc : 2 appels identiques → `300 \| 30 \| 300` deux fois, profil crédité une fois ; `test-economy-concurrency.py` | Vérifié conforme |
| c. Plafonds et dates | Plafonds journalier (1 800 XP) et hebdomadaire ; pas de date future ; pas de gain rétroactif | Plafond journalier calculé sur l'heure de création (antidater ne le contourne pas) ; refus au-delà de +10 min ; 0 XP au-delà de 30 jours ; une modification de séance ne recalcule jamais l'XP | La modification accepte une date antérieure à 1990 (bornée à l'insertion seulement) | P2 | À faire par : lot données | Lecture de `titan_submit_training_session` et `private.titan_update_training_session` ; tests `300_training_anticheat`, `300_session_hold_edits` | Vérifié conforme (remarque P2) |
| d. Coach : invitation, consentement, places | Jeton à usage unique, consentement explicite, capacité | Jeton de 48 hexadécimaux stocké haché, 7 jours ; `CONSENT_REQUIRED` sans consentement ; le coach ne peut pas accepter sa propre invitation ; rejeu → `INVITE_UNAVAILABLE` ; capacité et rotation des places contrôlées sous verrou | Aucun | — | — | Scénario complet joué sur le banc (C invite, B accepte, A tente le rejeu) ; `300_coach_seats` | Vérifié conforme |
| d. Coach : ce qu'il lit | Rien avant consentement, le périmètre consenti après, rien après révocation | Avant : 0 séance, 0 lien. Après : séances depuis la date choisie par le sportif, sans notes ni détail si non partagés ; lui seul peut élargir (`ATHLETE_ONLY`). Après révocation : `SHARING_UNAVAILABLE` sur séances, messages, bilans. Le lien révoqué reste lisible par les deux parties (dates, réglages). | Aucun | — | — | Banc : séance de 20 jours hors périmètre non rendue, `details: {}` ; tiers → `SHARING_UNAVAILABLE` | Vérifié conforme |
| d. Capacité sans offre Coach | Cohérente avec les offres | 3 sportifs sans abonnement, 20 avec TITAN+, 5 avec Coach, 15 avec Coach Ultra | Déjà signalé (décision produit n° 8 du 14 novembre) | P1 | Décision produit | `private.titan_coach_capacity` | En attente d'approbation |
| e. Suppression de compte | Aucune référence restante | Compte utilisé dans 25 tables, supprimé par `delete_own_account()` : 0 occurrence de son identifiant dans `public`, `private`, `auth`, `storage` (recherche dans chaque ligne de chaque table) ; 143 clés étrangères vers le compte, toutes `CASCADE` ou `SET NULL` | Fichiers de stockage non supprimés (D7) | P1 | D7 | Banc ; `300_account_deletion` | Vérifié conforme en base ; D7 ouvert |
| e. Export | Tout ce qui est promis, rien d'autrui | D1 et D2 | Voir § 1 | P1 | `20261114170000` | `300_v131_security_advisors.sql` § 2 | Corrigé, non testé en conditions réelles |
| e. Export ou suppression d'autrui | Impossible | Les deux RPC n'ont aucun paramètre et opèrent sur `auth.uid()` ; l'export de A ne contient jamais l'identifiant de B, y compris avec un coach ou un blocage en commun | Aucun | — | — | Banc : `position(B in export_own_data()::text) = 0` pour A et pour le coach de B | Vérifié conforme |
| e. Journaux techniques non exportés | À trancher | `titan_rate_events`, `titan_training_rate_state`, `titan_social_action_log`, `audit_logs`, `training_receipts`, `titan_billing_events`, sessions : non exportés (journaux à durée courte, doublons des séances, données du prestataire) | Décision juridique | P2 | — | § 1 D2 | En attente d'approbation |
| f. Limites de débit | Sur chaque écriture | En place sur séances, achats, guildes, carte publique, apparence, messages, social, clubs, tracés, imports. Absentes : D3 (corrigé), D9, D11 ; les plafonds par compte ne s'appliquent pas à un anonyme (`titan_rate_limit` ignore un identifiant nul) | D9, D11 | P2 | Voir § 1 | Catalogue des déclencheurs ; `300_rate_limits`, `300_abuse_surface_limits` | Non terminé |
| g. Stockage | Seaux privés ou bornés | 1 seau `avatars`, public, non borné ; RLS active sur les tables `storage` | D7, D8 | P1 / P2 | Voir § 1 | Production, lecture seule | En attente d'approbation |
| h. Configuration Auth | Durcie | 25 comptes par e-mail, 1 identité Google, 0 compte anonyme, 9 e-mails non confirmés dont aucun ne s'est jamais connecté, 0 second facteur, vérification des mots de passe compromis désactivée | D10 | P1 | Réglages Auth | Agrégats `auth.users`, `auth.identities`, `auth.mfa_factors` | En attente d'approbation |
| h. Connexions anonymes, longueur minimale du mot de passe, confirmation d'e-mail | — | Réglages non lisibles en SQL | — | — | — | — | Bloqué par un accès externe |
| i. Concurrence : `40001` | Plus aucun refus métier en `40001` | Production et dépôt : 0 fonction lève `40001` ; `PT409` (HTTP 409, sans relance) dans 6 fonctions en production, 8 dans le dépôt. Trace de la tempête passée : **786 630 577 transactions annulées** pour 14,9 millions validées, 786 604 788 exécutions du préambule de l'API sous `authenticated`. Compteur immobile entre deux mesures à 4 h 40 d'écart, aucune session active : la boucle est arrêtée. | Aucun | — | — | `pg_stat_database`, `pg_stat_statements`, `pg_stat_activity` ; `300_business_conflicts.sql` | Vérifié conforme |
| i. Ce que prouvent les contrats `tools/db` | — | Deux connexions réelles : une seule révision acceptée et un refus `PT409` (vues d'analyse, aventure, assistance) ; une récompense unique par séance et pas de solde négatif (économie) ; un seul propriétaire par achat (droits d'accès) ; plafonds tenus sous course (séances, recours, retenues) ; retrait de consentement contre import. Non couvert : deux sauvegardes de profil simultanées (`PROFILE_VERSION_CONFLICT`) — seul le code d'erreur est contrôlé ; côté client, `js/state.js:538` bloque la synchronisation au premier conflit. | Pas de contrat à deux connexions sur la sauvegarde du profil | P2 | À faire par : lot données | `tools/db/test-*-concurrency.py`, `tools/db/test-migrations.sh` | Vérifié conforme (remarque P2) |
| j. Performance | Rien de bloquant à cette échelle | 33 clés étrangères sans index (32 en production), 4 index en double (`guild_members_user_idx`, `titan_weekly_reward_usage_user_week_idx`, `site_settings_key_idx`, `contest_draws_key_idx`), 79 index non uniques jamais lus sur 336. Plus grande table utilisateur : 477 lignes. | Sans effet mesurable | — | Aucune : ni index ajouté ni index supprimé (aucun gain à 25 comptes ; ne rien supprimer pour faire taire un conseiller). Liste en § 7. | Requêtes de catalogue ; `pg_stat_user_tables` | Vérifié conforme |

## 3. Classement des fonctions exposées (état final du dépôt)

| Classe | `public` | `private` |
|---|---|---|
| (i) contrôle `auth.uid()` ou propriété | 137 | 7 |
| (ii) réservées à l'équipe (rôle vérifié dans la fonction) | 52 | 10 |
| (iii) volontairement publiques ou calculs purs | 20 (19 ouvertes à `anon` + `titan_admin_json_value_sql`) | 4 (`titan_is_admin`, `titan_is_moderator_or_admin`, `titan_admin_role_for`, `titan_analytics_payload_valid_v300` : appelées par les politiques RLS) |
| (iv) suspectes après essai | 0 exploitable | 3 sans contrôle propre (`titan_appearance`, `titan_cosmetic_owned`, `titan_card_settings_json`), inatteignables par l'API |
| Total exécutable par `authenticated` | 209 | 24 |

Fonctions suspectes examinées et verdict :

| Fonction | Soupçon | Essai | Verdict |
|---|---|---|---|
| `titan_economy_limits(p_user_id)` | Lecture du statut d'un autre compte | Appel avec l'identifiant de B | Sans objet : le sujet est toujours l'appelant (`coalesce(auth.uid(), p_user_id)`), fonction non `SECURITY DEFINER` |
| `titan_submit_combat_victory(…, p_reward_mult, …)` | Multiplicateur de récompense fourni par le client | Lecture du corps | Récompenses forcées à 0 ; écrit seulement le bestiaire |
| `titan_save_profile_state(p_state, …, p_inventory, …)` | Auto-attribution de crédits, niveau, TITAN+, objets | État forgé | Rien n'est repris du client |
| `titan_claim_achievement` | Succès non mérité, double gain | Lecture du corps | Critère recalculé sur les séances, clé unique |
| `titan_submit_cache_reconciliation(jsonb)` | Injection d'un état local | 300 appels | Rapport seul, aucune progression modifiée ; pas de limite (D11) |
| `titan_update_training_session` → `private.…` | Modification de la séance d'autrui, XP recalculée | Identifiant de B | `SESSION_NOT_FOUND` ; l'XP n'est jamais touchée |
| `titan_coach_portal(p_action, p_data)` | Lecture sans consentement, places, rejeu | Scénario complet | Conforme (§ 2 d) |
| `titan_find_profile_by_friend_code` | Énumération, statut payant | Lecture du corps | Profils trouvables seulement ; remarque P2 |
| `titan_public_card`, `titan_challenge_link_preview_v1`, `titan_feature_flags_v1` (ouvertes à `anon`) | Fuite d'identité | Appels anonymes | Carte sur consentement, aperçu sans identité, drapeaux publics |
| `titan_admin_json_value_sql` | Aide d'administration appelable par un joueur | Appel | Calcul pur (mise entre guillemets), aucun accès aux données |
| `private.titan_admin_role_for(uuid)`, `titan_is_admin(uuid)`, `titan_is_moderator_or_admin(uuid)` | Rôle d'autrui | Appel direct en SQL | Répondent pour n'importe quel compte, mais schéma non servi ; indispensables aux politiques RLS : ne pas révoquer |
| `private.titan_appearance(uuid)`, `titan_cosmetic_owned(uuid, text)` | Apparence d'autrui | Appel direct en SQL | Idem, schéma non servi |
| Production : `private.titan_coach_seat_write` et 6 autres | Auto-attribution d'un TITAN+ | Test existant `300_v131_coach_grants.sql` | Fermé par les migrations en attente |
| 52 RPC d'administration | Appel par un joueur | Chacun appelé sous un joueur | 52 refus `42501` |

## 4. Écart de droits production ↔ dépôt

Production = banc rejoué jusqu'à `20261104085851` (empreintes égales). Écart avec l'état final (`20261114170000`) :

| Objet | Production aujourd'hui | Après migrations | Fermé par |
|---|---|---|---|
| `public.friendships` | `authenticated` : `SELECT, INSERT, DELETE` + politique `friendships_insert_own` | `SELECT, DELETE`, aucune politique d'insertion | `20261110142656` |
| `private.titan_coach_plan(uuid)`, `titan_coach_capacity(uuid)`, `titan_coach_seat_write(uuid,uuid,boolean,timestamptz)`, `titan_coach_sync_seats(uuid)`, `titan_coach_seats_sweep()`, `titan_entitlements_coach_hook()` | `EXECUTE` pour `PUBLIC`, `anon`, `authenticated` | Aucun rôle API | `20261110142656` |
| `private.titan_entitlement_refresh_profile(uuid)` | idem | Aucun rôle API | `20261110130137` |
| 6 tables `private.titan_journey_*` et `private.titan_garmin_oauth_attempts` | absentes | RLS activée, aucun droit API | `20261105213712`, `20261110140000` |
| 20 fonctions nouvelles (parcours, OAuth Garmin, pas vérifiés, Play) | absentes | Ouvertes à `authenticated` : `public.titan_journey_snapshot_v1()`, `titan_journey_sync_v1()` et leurs corps `private` ; le reste à `service_role` seul | `20261105213712` … `20261110152900` |
| `private.titan_intent_day_ok(date)` | `search_path` libre, `IMMUTABLE` | `search_path = ''`, `STABLE` | `20261114170000` |
| `private.titan_export_extras_before_rpg_v1(uuid)` | corps défectueux (D1) | corps du dépôt | `20261114170000` |
| `private.titan_export_extras_v131_v1(uuid)` | absente | aucun rôle API ; appelée par `export_own_data()` | `20261114170000` |
| `public.bug_reports` | insertion anonyme sans borne | politique restrictive `bug_reports_intake_bounds_v131` | `20261114170000` |

Sans écart : toutes les autres fonctions, politiques, déclencheurs, index et droits de table.

## 5. Migration `20261114170000_v131_security_advisors`

Additive et rejouable ; aucune ligne lue, modifiée ou supprimée ; aucun droit élargi ; signatures et droits des fonctions existantes conservés. La politique est posée sous
un délai de verrou de 5 s. S'applique après `20261114160000`.

| Vérification | Résultat |
|---|---|
| `sql/tests/300_v131_security_advisors.sql` avant la migration | Échec : `the day check runs with an empty search_path` |
| Même test après la migration | Réussi |
| Même test sur une copie portant le corps de production (D1) : avant / après | Échec / réussi ; export d'un compte lié à Garmin : `22023` / réussi |
| Migration appliquée deux fois de suite | Aucune erreur, même état |
| `postflight-v131.sql` : 6 contrôles ajoutés | Faux avant, vrais après ; seuls restent faux au banc les 3 contrôles `play-plan:*` (données de production) |
| Corps de `private.titan_export_extras_v1`, `…_before_journey_v1`, `…_before_rpg_v1` | Empreintes identiques avant et après sur une base issue du dépôt |
| Rejeu complet `tools/db/test-migrations.sh` (toutes les migrations, tous les `sql/tests/300_*.sql`, contrats concurrents) | Réussi, voir ci-dessous |

Rejeu complet, banc privé (`TITAN_PG_DIR=/var/lib/postgresql/titan-pg-sec PGPORT_TEST=54341`, PostgreSQL 16.15 ; la CI utilise 17.6) :

| Commande | Résultat |
|---|---|
| `tools/db/test-migrations.sh` | `OK: migrations and tests passed on a clean replica.` — 81 migrations dont `20261114170000`, 112 fichiers `sql/tests/300_*.sql` dont le nouveau, portes de publication et contrats concurrents |
| `RELEASE_SQL=supabase/release-300.sql tools/db/test-migrations.sh` | Idem, code de sortie 0 |
| Migration et test sur la copie munie des privilèges par défaut de production | Réussi ; `private.titan_export_extras_v131_v1` fermée à `anon`, `authenticated` et `service_role` |

Un premier jet de la migration renommait `private.titan_export_extras_v1` (comme les migrations d'export précédentes) : il a fait échouer le contrôle
`export:RPG conservé` de `postflight-v11.sql`. La version livrée ne touche plus à cette chaîne.

## 6. Runbook de production (ordre exact)

Prérequis : fenêtre autorisée, aucun déploiement Web ou Android en cours, produits Google Play encore inactifs.

**Avant**

1. Sauvegarde : confirmer dans le tableau de bord qu'une sauvegarde du jour existe (ou déclencher la restauration à un instant donné si disponible) ; prendre l'export logique
   `tools/db/rehearsal/export-production.sql` (un seul `SELECT`), gardé hors dépôt et chiffré ; relever `structure-fingerprint.sql` et `all-table-sums.sql`.
2. Répétition sur une copie (`tools/db/rehearsal/README.md`) : restauration, les 10 migrations dans l'ordre, les trois postflights.
3. `tools/db/preflight-production.sql` : toutes les lignes vraies.

**Règles d'application** : une transaction par migration ; le fichier du dépôt **tel quel, sans ressaisie ni reformatage** (cause de D1) ; inscription au registre avec la
version du nom de fichier ; en cas d'erreur `lock_timeout`, rien n'est changé : rejouer la même migration.

| Ordre | Migration | Effet | Contrôle immédiat | Retour arrière |
|---|---|---|---|---|
| 1 | `20261104085851_business_conflicts_no_transaction_retry` | Déjà en place hors registre : rejeu sans effet, puis inscription | `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.prosrc ~ 'errcode\s*=\s*''40001'''` → 0 | Aucun. Ne jamais réinstaller `private.titan_rpc_backup_20261104` (relance la boucle `40001`). |
| 2 | `20261105213712_journey_v13` | 5 tables `private.titan_journey_*`, RPC du parcours, section d'export | `postflight-v13.sql` | `revoke execute on function public.titan_journey_snapshot_v1(), public.titan_journey_sync_v1() from authenticated` (parcours éteint, données conservées) |
| 3 | `20261110130137_entitlement_profile_consistency` | Même source pour TITAN+ et le résumé du profil ; recalcule le résumé des comptes ayant à la fois un droit actif et un droit éteint | 2 droits `manual` en production, aucun mixte attendu : `select count(*) from public.profiles where is_elite` → 2, inchangé | Réappliquer les définitions précédentes de `private.titan_entitlement_refresh_profile` et `public.titan_apply_entitlement_v1` (`20261102090000`, `20261020020000`) ; profils : export logique de l'étape « Avant » |
| 4 | `20261110140000_garmin_oauth_state` | Table des tentatives OAuth, RPC serveur, déclencheur de retrait de consentement | `ledger:20261110140000` | `drop trigger titan_garmin_cancel_oauth_on_withdrawal on private.titan_source_consents` ; les RPC ne sont ouverts qu'à `service_role` |
| 5 | `20261110142656_v131_social_entitlement_grants` | Ferme l'amitié forcée et les 6 aides coach | `friendships:*` et `rpc:private.titan_coach_*` de `postflight-v131.sql` | Aucun souhaitable : rouvrir les droits rouvre la faille |
| 6 | `20261110152700_garmin_verified_dailies` | 3 colonnes facultatives, pas vérifiés Garmin | `rpc:public.titan_garmin_ingest_dailies_v1(jsonb)` | `drop trigger titan_garmin_clear_dailies_authorization on private.titan_garmin_links` ; colonnes laissées |
| 7 | `20261110152800_serialize_activity_imports` | Imports sérialisés avec l'écriture des séances, mêmes signatures | Import de test sur la copie de répétition | Réappliquer les définitions précédentes des 4 fonctions (`20261028110000` pour les imports et Garmin, `20261028100000` pour les pas) |
| 8 | `20261110152900_play_receipt_provenance` | 2 colonnes sur les droits d'accès, RPC Play | `rpc:public.titan_play_*`, `play-plan:titan01/02/03` | `revoke execute on function public.titan_play_checkout_ready_v1(uuid) from service_role` : l'application garde Google Play fermé |
| 9 | `20261114160000_v131_social_consent_hardening` | Consentement social | `friendships:status *`, `hardened:*` | Voir l'en-tête du fichier : garder la migration ; contrainte et déclencheur retirables seuls |
| 10 | `20261114170000_v131_security_advisors` | D1, D2, D3, D4 | `search_path:*`, `intent day check:*`, `export:*`, `bug reports:*` | Voir l'en-tête du fichier, point par point |

**Après**

1. `tools/db/postflight-v13.sql` et `tools/db/postflight-v131.sql` : toutes les lignes vraies.
2. Conformité des corps au dépôt (détecte une ressaisie) : la requête ci-dessous doit rendre exactement `private | 90 | 11d5bc331f53 | 04d9ecb08088` et
   `public | 293 | db4eeb91a3d2 | 7df661985ca5` (valeurs du banc dans l'état final ; `handle_audit_log` et `titan_session_exclusion_v1` exclus, voir § 0).

```sql
select n.nspname as schema, count(*) as fonctions,
  substr(md5(string_agg(p.oid::regprocedure::text || '|' || p.prosecdef || has_function_privilege('anon', p.oid, 'EXECUTE') || has_function_privilege('authenticated', p.oid, 'EXECUTE')
    || coalesce(array_to_string(p.proconfig, ','), ''), ';' order by p.oid::regprocedure::text collate "C")), 1, 12) as droits,
  substr(md5(string_agg(p.oid::regprocedure::text || '|' || md5(lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n\r]*', '', 'g'), '\s+', '', 'g'))), ';'
    order by p.oid::regprocedure::text collate "C") filter (where p.proname not in ('handle_audit_log', 'titan_session_exclusion_v1'))), 1, 12) as corps
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') group by 1 order by 1;
```

3. `all-table-sums.sql` : seules changent les tables touchées par l'étape 3 (profils recalculés) ; `structure-fingerprint.sql` à archiver comme nouvelle référence, puis
   régénérer `tools/db/baseline`.
4. Essais réels : export d'un compte de test lié à Garmin ; demande d'amitié ; ouverture de l'écran d'achat (contrôle serveur).
5. Dernier recours si un contrôle reste faux et ne se corrige pas par rejeu : restauration de la sauvegarde de l'étape « Avant » (perte des écritures de la fenêtre).

Hors migrations, à faire dans le tableau de bord : D7 (objet orphelin), D8 (seau `avatars`), D10 (second facteur de l'équipe, mots de passe compromis).

## 7. Performance : relevé (aucune action)

Clés étrangères sans index (33) : `adventure_effort_ledger(source_id)`, `(user_id, world_id)` ; `adventure_journeys(world_id)` ; `titan_appeals(decided_by)`, `(session_id)` ;
`titan_buddies(ended_by)`, `(inviter_id)` ; `titan_club_announcements(author_id)` ; `titan_club_bans(user_id)` ; `titan_club_reports(announcement_id)`, `(club_id)`,
`(handled_by)`, `(reporter_id)` ; `titan_club_trophies(awarded_by)` ; `titan_clubs(created_by)` ; `titan_coach_message_reports(reporter_id)` ;
`titan_coach_messages(sender_id)` ; `titan_common_quests(created_by)` ; `titan_economy_journal(actor_id)` ; `titan_faction_members(faction_key)` ;
`titan_feature_flags(updated_by)` ; `titan_journey_acquisitions(config_version)` ; `titan_moderation_decisions(admin_id)` ; `titan_pioneers(granted_by)` ;
`titan_poll_votes(poll_id, option_position)` ; `titan_polls(created_by)` ; `titan_roadmap_items(created_by)` ; `titan_seasons(created_by)` ;
`titan_verification_requests(closed_by)`, `(requested_by)` ; `titan_world_goals(created_by)` ; `coach_assignments(session_id)` ; `coach_links(coach_id)`.

À reprendre quand les tables grossiront, en commençant par celles parcourues à chaque suppression de séance ou de compte : `titan_economy_journal(actor_id)`,
`adventure_effort_ledger(source_id)`, `titan_coach_messages(sender_id)`, `titan_appeals(session_id)`.

## 8. Non vérifié

- Liste des schémas servis par l'API, connexions anonymes, longueur minimale du mot de passe, confirmation d'e-mail, durée des sessions : réglages du projet, non lisibles en SQL.
- Conseiller Supabase : non relu ligne à ligne ; recalculé en SQL pour les fonctions, la RLS, le `search_path`, les index.
- Fonctions serveur Netlify (clé de service) et leurs propres contrôles : hors périmètre SQL de ce lot.
- Règles anti-triche et économie (seuils, formules) : non modifiées, non réévaluées ; seuls les contournements techniques ont été cherchés.
- `titan_adventure_action` et `titan_adventure_rpg_action_v1` : refus d'entrée invalide constatés, logique de progression non attaquée en profondeur (aucune récompense monétaire).
- `delete_inactive_users()` (tâche hebdomadaire `nettoyage-inactifs`) : présente et active, critère d'inactivité non relu.
- Tout essai réel en production : export d'un compte lié à Garmin, dépôt anonyme refusé, comportement de l'API après `notify pgrst`.
- Observation hors périmètre : `titan_moment_share` enregistre le sport « Course à pied » sous la forme `oursepied` (nettoyage du libellé) ; à faire par : lot données.
