# Déploiement et reprise

## Sources de vérité

| Sujet | Source |
| --- | --- |
| Code publié | branche GitHub `main` |
| Entrée web | `index.html` |
| Build Netlify | `netlify.toml` et `tools/build-public.mjs` |
| Sortie générée | `dist/` — jamais committé |
| Fonction de paiement | `functions/webhook.mjs` via `netlify/functions/webhook.mts` |
| Ordre SQL | `supabase/migrations/` (v300 : voir « Release 300 » ci-dessous) |
| Vérification publique | `PUBLIC_RELEASE_QA_CHECKLIST.md` |
| Exploitation détaillée | `PUBLIC_RELEASE_RUNBOOK.md` |

L'application publique est [https://titan-app.fr](https://titan-app.fr). L'ouverture de cette URL ne garantit pas à elle seule que GitHub, Netlify et Supabase utilisent le même état ; comparer le commit déployé avant une intervention.

## État de liaison vérifié le 11 septembre 2026

- projet Netlify : `titano-app` (`0a553bc3-458a-415d-9173-538faa0ac1e6`) ;
- URL principale : `https://titan-app.fr` ;
- état du déploiement : `ready` ;
- titre : `TITAN v100 grand public` ;
- publication actuelle : 10 août 2026 ;
- source : déploiement CLI, avec `commit_ref` et `commit_url` absents.

La migration GitHub ne redéploie donc pas automatiquement la production dans cet état. Il faut soit connecter explicitement le dépôt à Netlify, soit conserver un déploiement CLI contrôlé. Dans les deux cas, vérifier le SHA ou l'archive réellement publié et ne jamais déduire la version live du seul état de `main`.

## Configuration Netlify

Netlify doit utiliser :

- commande de build : `node tools/build-public.mjs` ;
- dossier publié : `dist` ;
- fonctions : `netlify/functions` ;
- bundler : `esbuild`.

Variables serveur requises :

- `PADDLE_WEBHOOK_SECRET` ;
- `SUPABASE_URL` ;
- `SUPABASE_SECRET_KEY`, ou temporairement `SUPABASE_SERVICE_ROLE_KEY` ;
- `PADDLE_ELITE_PRODUCT_IDS` et/ou `PADDLE_ELITE_PRICE_IDS` fortement recommandées.

Copier uniquement les noms depuis `.env.example`. Les vraies valeurs restent dans le gestionnaire de secrets Netlify. Le dossier local `.netlify/` est généré et ignoré : il n'est jamais une source de vérité portable.

## Publication standard

1. Créer une branche et une pull request.
2. Exécuter `pnpm run verify` localement et attendre la CI GitHub verte.
3. Faire relire les changements sensibles : `js/state.js`, `js/main.js`, `sw.js`, `functions/`, `netlify.toml` et `sql/`.
4. Fusionner dans `main`.
5. Déclencher le flux Netlify approuvé (connexion Git ou déploiement CLI) et vérifier qu'il utilise exactement le SHA fusionné.
6. Exécuter les smoke tests de `PUBLIC_RELEASE_QA_CHECKLIST.md` sur `titan-app.fr`.
7. Pour une modification PWA, tester une installation neuve puis une mise à jour depuis l'ancienne version.

## Supabase

Un push GitHub n'applique aucun fichier de `sql/`. Avant d'exécuter un script :

1. vérifier son état dans `PUBLIC_RELEASE_SQL_ORDER.md` ;
2. relire les rôles, RLS, grants, `SECURITY DEFINER` et `search_path` ;
3. sauvegarder la base avec une méthode approuvée ;
4. tester avec un compte standard, puis un compte admin si nécessaire ;
5. documenter le résultat et le rollback.

Ne jamais supposer qu'un fichier présent dans le dépôt est déjà actif en production.

## Retour arrière

- Front : redéployer dans Netlify le dernier commit validé, puis vérifier le cache PWA.
- Fonction : revenir au commit précédent et rejouer un événement Paddle de test signé dans un environnement sûr.
- Base : utiliser le rollback documenté pour le script concerné ; ne jamais restaurer ou supprimer des données sans cible et sauvegarde vérifiées.

Après un rollback, contrôler connexion, enregistrement d'une séance, Journal, Stats, entitlement TITAN+ et mise à jour du service worker.

## Release 300 — mise en production (une seule fois)

La v300 change à la fois le site et la base. Les migrations sont **additives** sauf quelques révocations volontaires (anciennes RPC d'ami par code, défis avec mise) que l'ancien front v200 utiliserait encore.

**Ordre retenu : le site d'abord, la base ensuite.** Le front v300 fonctionne sur la base v200 :
- une RPC v300 absente répond `PGRST202` : chaque écran l'annonce (« arrive avec la prochaine mise à jour du serveur ») au lieu d'un chargement sans fin ;
- l'aventure se valide sur les jours, comme le serveur v200 l'exige ;
- l'XP affichée est celle du serveur, et la règle « 1 min ≈ 10 XP » ne s'affiche qu'avec un instantané serveur en version 2 ;
- TITAN+ reste souscriptible, et son statut est relu depuis le profil écrit par le webhook.

Les migrations appliquées ensuite allument ces fonctions sans second déploiement. Aucun ancien front ne tourne donc contre une base v300. Simulation : `qa-degraded` (RPC v300 stubées en `PGRST202`).

### Mise en ligne depuis un environnement sans accès à Netlify

Le workflow **Mise en ligne (Netlify)** (`.github/workflows/deploy-netlify.yml`, manuel) prend le lien signé renvoyé par le connecteur Netlify (`deploy-site`). Ce lien est valable 30 minutes et limité à la création d'un build de ce site. Le workflow le masque, vérifie le build, retire les PNG/JPEG hérités qui ont un équivalent WebP (ils ne vont jamais dans `dist/`), puis lance l'envoi. Netlify construit ensuite le site selon `netlify.toml`.

### Avant

1. CI verte sur la PR (tests, E2E, banc de migrations) et `pnpm run test:db` vert en local.
2. Sauvegarde Supabase (point de restauration du jour visible dans le tableau de bord).
3. Vérifier que la tâche cron `nettoyage-inactifs` est bien **inactive** (désactivée le 5 octobre 2026, voir plus bas) :
   `select jobid, jobname, active from cron.job;`

### Migrations, dans cet ordre

| Version | Fichier | Effet |
| --- | --- | --- |
| 20261005150000 | `ascension_security_lockdown` | Politiques de guilde non récursives, fonctions privées fermées à `anon` |
| 20261005160000 | `ascension_progression_v300` | XP par l'effort, plafonds identiques, historique sans XP, niveaux recalculés sans baisse |
| 20261005170000 | `ascension_sport_labels` | Libellés de sports |
| 20261005180000 | `ascension_private_by_default` | Confidentialité fermée par défaut pour les nouveaux comptes |
| 20261005190000 | `ascension_profile_preferences` | Préférences v300 synchronisées (cadence, pauses, onboarding) |
| 20261005200000 | `ascension_social` | Amitiés par consentement, Moments, défis sans mise, expéditions, guilde par effort |
| 20261005210000 | `ascension_atelier` | Possession et apparence côté serveur, achat cosmétique uniquement, `shop_history` fermé en écriture |
| 20261005220000 | `ascension_public_card` | Carte d'athlète publique (désactivée par défaut) |
| 20261005230000 | `ascension_retention` | Purge des comptes réellement inactifs (3 ans) et des statistiques (13 mois), cron réactivé avec la nouvelle règle |

Appliquer chaque fichier tel quel (Supabase MCP `apply_migration` avec le nom sans horodatage, ou SQL editor), dans l'ordre, sans en sauter. **Variante en un seul geste** : `supabase/release-300.sql` (généré par `node tools/build-release-sql.mjs`) contient les 9 migrations dans une seule transaction et les inscrit dans l'historique ; il se colle tel quel dans l'éditeur SQL et refuse de s'exécuter deux fois. Vérifié sur le banc : `RELEASE_SQL=supabase/release-300.sql bash tools/db/test-migrations.sh`. Après chacun : aucune erreur, puis `select version, name from supabase_migrations.schema_migrations order by version desc limit 3;`.

### Contrôles après migrations

- Advisors Supabase (sécurité et performance) : aucune nouvelle alerte critique.
- `select count(*) from cron.job where active;` → 3 (messages expirés, comptes inactifs, statistiques).
- Avec un compte de test : `select public.titan_atelier();`, `select public.titan_public_card_settings();`, `select public.titan_social_overview();` répondent.

### Site (avant les migrations, voir l'ordre retenu)

1. Construire depuis le commit fusionné : `node tools/build-public.mjs` (avec `TWA_SHA256_FINGERPRINTS` si l'application Android est publiée).
2. Déployer en production Netlify (projet `titano-app`), une seule fois : CLI, connecteur, ou workflow « Mise en ligne (Netlify) ».
3. Smoke tests sur `titan-app.fr` : accueil, connexion, séance (en ligne puis hors ligne), journal, semaine, aventure, profil (export), Communauté, Atelier, `/u/<lien>` d'un compte de test, page de paiement TITAN+ ouverte puis fermée.
4. Ancienne PWA : ouvrir un appareil qui avait la v200, vérifier le bouton « Nouvelle version » puis le rechargement.

### Retour arrière

- Site : redéployer le dernier déploiement v200 depuis Netlify.
- Base : les migrations n'effacent aucune donnée. Les nouvelles tables/colonnes peuvent rester. Pour rouvrir une RPC révoquée à l'ancien front : `grant execute on function <nom>(<args>) to authenticated;`. La purge planifiée se coupe avec `select cron.alter_job(job_id := <id>, active := false);`.

## Incident du 5 octobre 2026 : purge des comptes

La tâche `nettoyage-inactifs` (`delete_inactive_users()`, quotidienne) supprimait tout compte dont `auth.users.last_sign_in_at` dépassait deux mois. Ce champ ne bouge qu'à une connexion explicite : un membre resté connecté (abonné TITAN+ compris) aurait été supprimé le 10 octobre. La tâche a été désactivée en production le 5 octobre (`cron.alter_job(1, active := false)`, aucune suppression). La migration `20261005230000_ascension_retention` remplace la règle (activité réelle : connexion, session, profil, séance ; 3 ans ; jamais avec TITAN+ en cours) et réactive la tâche, hebdomadaire.

## Rafraîchir le snapshot du banc local

Après chaque mise en production, régénérer `tools/db/baseline/` en lecture seule (aucune donnée) :

- tables et séquences : `information_schema.columns` + `pg_class` (schémas `public`, `private`) ;
- contraintes et index : `pg_get_constraintdef(oid)` sur `pg_constraint`, `pg_get_indexdef(indexrelid)` sur `pg_index` ;
- fonctions : `pg_get_functiondef(p.oid)` pour `public` et `private` ;
- déclencheurs, RLS, politiques, droits : `pg_get_triggerdef`, `pg_policies`, `relrowsecurity`, `information_schema.role_table_grants` et `routine_privileges` ;
- données de référence : `adventure_worlds`, catalogue des sports.

Les gros résultats MCP sont enregistrés sur disque puis extraits avec `tools/db/extract-mcp-result.py`. Rejouer ensuite `pnpm run test:db` depuis la première migration encore en attente.
