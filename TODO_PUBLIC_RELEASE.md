# TITAN OS - TODO LIST VERSION GRAND PUBLIC

Document de relais pour les prochains clavardages Codex.

But: transformer TITAN OS V0.5, aujourd'hui beta jouable, en version grand public fiable, securisee et comprehensible sans perdre son identite de jeu sportif.

Etat du projet au moment de ce document:
- Site statique HTML/CSS/JS deployable sur Netlify.
- Backend principal: Supabase.
- Paiement Elite: Paddle via fonction Netlify `functions/webhook.mjs`.
- Donnees locales: `localStorage` avec `STATE_KEY = titan_os_v12_save`.
- Pages principales: `index.html`, `login.html`, `training.html`, `adventure.html`, `stats.html`, `profile.html`, `boutique.html`, `social.html`, `chat.html`, `activities.html`, `journal.html`, `guide.html`, `health.html`.
- Fichiers noyau: `js/config.js`, `js/state.js`, `js/main.js`, `js/ui.js`, `js/data.js`, `js/titan_features.js`.
- Service worker: `sw.js`.
- Priorite absolue avant ouverture publique: securite Supabase/RLS, anti-triche, moderation, fiabilite de la sync et parcours mobile.

Consigne pour les prochains assistants:
- Ne pas tout implementer d'un bloc.
- Toujours traiter les items par priorite: P0 puis P1 puis P2, etc.
- Avant de modifier, lire les fichiers concernes et respecter le style existant.
- Ne pas supprimer les donnees ou changements utilisateur sans demande explicite.
- Pour chaque item termine, remplacer `[ ]` par `[x]`, ajouter une note courte si utile.
- Garder ce fichier comme tableau de bord principal de la version publique.

Legende:
- P0 = bloquant avant ouverture publique.
- P1 = essentiel pour une premiere version publique propre.
- P2 = stabilisation technique et qualite.
- P3 = retention, contenu, produit.
- P4 = croissance, polish, exploitation.

## Avancement en cours

2026-06-03:
- V78 progression cloud appliquee sur Supabase `oubmftfufwwzwpgvrcag`: `titan_get_progression_snapshot()` expose une lecture officielle niveau/XP/credits/seances/plafonds pour les comptes connectes, sans acces anon.
- Ecritures sensibles resserrees: le front ne pousse plus `game_state`/XP/credits/niveau via `profiles.update`; la sync profil exige `titan_save_profile_state`, et les seances connectees restent validees par RPC serveur.
- RLS/grants progression durcis: plus d'insert self sur `profiles`, plus d'insert/delete self sur `training_logs`; update direct garde seulement le chemin admin sous policy.
- Stats/Notifications/Service Hub affichent maintenant l'autorite cloud: snapshot serveur, file de sync, diagnostics profil/seance et bouton de verification.
- Guide enrichi: dictionnaire des donnees complete avec snapshot cloud, autorite serveur, queue sync et securite des ecritures sensibles.
- Helpers Supabase signales par advisor durcis avec `search_path=''`: `titan_clean_economy_message`, `titan_week_start`, fonctions sport v72.
- Policies progression consolidees apres advisor performance: suppression des doublons SELECT `profiles_select_own` / `training_logs_select_own`, lecture conservee via policies self-or-admin.
- V79 securite Supabase appliquee: tables RLS fermees avec deny policies explicites, contact public sans `WITH CHECK true`, anciennes policies admin branchees sur `private.titan_is_admin`, `check_if_admin`/`is_admin`/`is_super_admin` non executables par le client.
- Produit V79: ajout du Smart Sport Brief, differentiation inspiree Strava/TrainingPeaks/WHOOP/Garmin, et separation plus nette Gratuit complet vs Elite 5 euros sans pay-to-win.
- Audit general 2026-06-03 effectue sur projet local + advisors Supabase + config Netlify locale. Verification OK: `node tools/check-inline-scripts.mjs` via Node embarque, `node --check` sur `config.js`, `main.js`, `ui.js`, `sw.js`, build public OK et `dist/` sans dossiers internes bloquants. Verification limitee: `npm` absent du PATH, Netlify distant non verifie car reauth requise.
- V80 demarre: client Supabase initialise avec options auth explicites, statut inspectable via `titanGetSupabaseConnectionStatus()`, healthcheck `titanTestSupabaseConnection()`, pages login/reset alignees sur le client central, CDN `partenariats.html` fige en `@supabase/supabase-js@2.57.4`, cache-busters front `?v=80`, service worker `titan-os-v80-supabase-security`.
- V80 securite progression: `pushProfileStateToCloud()` passe par RPC bornee a 7s et relance le snapshot progression, `safeProfileInsert()` bloque l'insert direct profil, la sauvegarde connectee reste serveur-autoritaire.
- Supabase v80 applique sur `oubmftfufwwzwpgvrcag`: migrations `titan_supabase_connection_security_v80` et `titan_internal_rpc_execute_closure_v80`; RPC admin `_v1` non executables par `anon`, anciens RPC admin `SECURITY DEFINER` fermes, helpers economie internes non executables directement, RPC progression/boutique/training restent `authenticated`.
- V81 catalogue sports applique sur Supabase: 198 sports au total, 187 actifs, doublons legacy desactives avec `mergedInto`, 20 nouveaux sports ajoutes, 0 description/formule/champ requis/regle anti-abus manquant apres verification MCP.
- V81 front polish: interrupteurs profil lisibles actif/coupe, preferences confidentialite toujours sauvegardees via `saveState({ forceCloud: true })`, stats renommees en lecture plus humaine, couche responsive finale PC/mobile, cache-busters front `?v=81`, runtime `81.0`, SW `titan-os-v81-cleanup`.
- Manques P0 restants 2026-06-03: refondre `titan_public_partnership_stats()` pour eviter le `SECURITY DEFINER` public, activer la protection mots de passe compromis dans Supabase Auth, tester compte reel/cross-device, tester redirects prod apres redeploy, valider webhook Paddle end-to-end, completer mentions legales avec identite juridique reelle.
- Manques P1/P2 restants 2026-06-03: index FK manquants, policies RLS permissives redondantes, index dupliques, cle Supabase encore legacy anon, `unsafe-inline` encore requis, nombreux `innerHTML`/handlers inline, CDN a self-host/SRI malgre versions figees, `admin.html` publie mais protege seulement par gate applicative (non precache en v80), images boss/avatar jusqu'a environ 10 Mo.
- Manques contenu/UX releves 2026-06-03: `ads.txt` encore placeholder, Search Console a verifier, captures produit reelles a ajouter, QA mobile complete a faire, accessibilite clavier/boutons icon-only a auditer, etats vides/loading/erreurs a uniformiser.

2026-05-18:
- Build public Netlify ajoute: `npm run build` genere `dist/` par allowlist via `tools/build-public.mjs`; `netlify.toml` publie maintenant `dist` au lieu de la racine, ce qui evite d'expedier `sql/`, `tools/`, docs internes, config et console admin.
- Version runtime/cache alignee en v63: `GAME_SETTINGS.version`, `TITAN_ASSET_VERSION`, cache-busters HTML et `sw.js`.
- Mobile v63: couche responsive finale pour QG, Training, Adventure, Stats, Boutique, Profile, Social, modales et navigation basse.
- Nettoyage marque: references residuelles a l'ancien nom remplacees par TITAN OS dans le front public et l'outil SEO; bouton news renomme en transmission.
- Audit Supabase reel applique sur le projet `oubmftfufwwzwpgvrcag`: RLS active partout en `public`, droits anonymes limites a la lecture catalogue/news, tables internes fermees, RPC navigateur reservees aux utilisateurs connectes, helpers/legacy fermes et `search_path` durci sur les fonctions signalees.
- Politiques trop permissives nettoyees: insert libre `admin_logs` supprime, listing public du bucket `avatars` retire. Restent en advisors: infos RLS sans policy sur tables volontairement fermees, avertissement generique sur RPC `SECURITY DEFINER` authentifiees, protection mots de passe compromis a activer dans le dashboard Supabase.
- Front polish: ajout du tuto de premiere connexion (`titan_first_run_guide_v1`) avec parcours "Premiere mission", "Progression", "Compte"; ne s'affiche plus apres validation.
- SEO differenciation: ajout de la page pilier `algorithme.html` / `/algorithme`, repositionnement home sur "moteur algorithmique de progression physique", JSON-LD enrichi, maillage interne home/menu/sitemap et mots-cles longue traine (`charge entrainement`, `XP sport`, `recuperation`, `progression sportive`).
- Verification locale: `tools/check-inline-scripts.mjs` ignore `dist/`; smoke OK avec 62 scripts parses, build public OK, `dist/` confirme sans fichiers internes ni secrets. QA navigateur locale tentee, mais le runtime bundlé expose `playwright` sans `playwright-core`, donc verification visuelle automatique non disponible dans cette session.

2026-04-30:
- Ajout d'un script SQL `sql/titan_cache_reconciliation.sql` pour comparer cache local et Supabase sans appliquer automatiquement la progression venant du navigateur.
- Ajout d'une table de rapports `titan_cache_reconciliation_reports` et d'une RPC `titan_submit_cache_reconciliation(p_local_state jsonb)`.
- Branchement front dans `js/state.js`: a la connexion, l'ancien cache local est resume puis envoye en audit avant d'etre remplace par le cloud.
- Le systeme signale les ecarts avatar/progression/historique/inventaire avec des `risk_flags`; aucune recompense, credit, XP ou statut Elite n'est accorde depuis le cache.
- La sync ne repousse plus automatiquement un cache local "plus recent" vers Supabase: le cloud reste prioritaire, le cache part en revue.
- Cache-busters `config.js` et `state.js` remontes a `v=49` dans les pages HTML; `GAME_SETTINGS.version` passe a `49.0`.
- Mode dev verrouille en production: `TITAN_ENABLE_DEV_TOOLS=false`, bouton dev masque hors flag explicite, fonctions globales `dev*` inactives hors testeur + flag.
- Helper anti-XSS centralise confirme dans `ui.js`: `titanEscapeText`, `titanEscapeHtml`, `titanSafeText`.
- Chat durci cote front: messages bornes a 500 caracteres, anti-spam local 5/min, signalement moderation, blocage local par expediteur.
- Ajout d'un script SQL `sql/titan_chat_moderation_hardening.sql` pour imposer cote Supabase l'auteur reel, la longueur message, le refus des comptes suspendus et le rate limit 5/min.
- Cache-busters `ui.js`, `main.js` et `chat.js` remontes a `v=49`; `TITAN_ASSET_VERSION` passe a `49`.
- Webhook Lemon Squeezy durci: idempotence par `titan_billing_events`, verification produit/variant via env `LEMONSQUEEZY_ELITE_PRODUCT_IDS` / `LEMONSQUEEZY_ELITE_VARIANT_IDS`, suivi billing sur `profiles`, garde sur statuts d'abonnement inactifs.
- Ajout d'un script SQL `sql/titan_billing_hardening.sql` pour table evenements billing et colonnes Elite.
- Ajout d'un script SQL `sql/titan_profile_privacy_hardening.sql`: fermeture du SELECT large sur `profiles`, RPC `titan_find_profile_by_friend_code`, RPC `titan_list_my_friends`, policies `friendships`.
- Social/chat utilisent les RPC de profil social quand disponibles, avec fallback legacy tant que le SQL n'est pas applique.
- Console admin `sys_core_override_99.html` bloquee cote Netlify et `_redirects` avec retour 404; le fichier reste local mais n'est plus route publiquement.
- Ajout d'une CSP dans `netlify.toml` avec `connect-src` limite a Supabase/Lemon Squeezy/Adcash et domaines CDN/cartes explicitement declares. Note: `unsafe-inline` reste requis tant que le JS/CSS inline n'est pas refactorise.
- Suppression des `console.log/debug/info` non necessaires cote HTML/JS front; `console.warn/error` conserves pour les vrais diagnostics.
- Cache-busters `config.js`, `state.js`, `ui.js`, `main.js`, `social.js` remontes a `v=50`; `GAME_SETTINGS.version` passe a `50.0`, `TITAN_ASSET_VERSION` a `50`, cache SW a `titan-os-v50-security-consent`.
- Verification service-role: `SUPABASE_SERVICE_ROLE_KEY` n'apparait pas dans les HTML/JS front, uniquement dans `functions/webhook.mjs` via variable d'environnement.
- Durcissement XSS partiel dans `trophies.html`: bestiaire local echappe, chemins images bornes et suppression du `onclick` interpole pour les mobs.
- Contact legal/support/RGPD clarifie dans `legal_hub.html` en plus des pages mentions/confidentialite.
- Ajout de `js/consent.js`: Adcash n'est plus charge directement dans les pages, il est injecte uniquement apres consentement local. Refus memorise dans `localStorage`.
- Ajout de `PUBLIC_RELEASE_RUNBOOK.md`: procedure backup pre-migration, rollback Netlify, rollback Supabase et communication incident.
- Ajout de `sql/titan_training_anticheat_hardening.sql`: table `titan_suspicious_actions`, trigger anti-valeurs impossibles sur `training_logs`, limites frequence/distance/duree/XP/GPX, garde-fou sur sauts `profiles.credits`/`level`/taille `game_state`.
- Ajout de `sql/titan_privacy_account_rpc.sql`: RPC `export_own_data` et `delete_own_account`; `profile.html` utilise l'export cloud si disponible avec fallback local.
- Ajout de `sql/titan_public_release_rls_audit.sql`: RPC d'audit locale pour lister RLS, policies, grants anon/authenticated sur les tables critiques avant ouverture publique.
- Durcissement pseudo/avatar: helper `titanCleanProfileName` dans `js/state.js`, utilisation dans `profile.html`, nettoyage/garde SQL dans `titan_guard_profile_progression`.
- 2026-04-30 utilisateur: les 3 nouveaux SQL (`titan_training_anticheat_hardening.sql`, `titan_privacy_account_rpc.sql`, `titan_public_release_rls_audit.sql`) ont ete appliques dans Supabase. Reste a tester les parcours et analyser le resultat de l'audit RLS.
- 2026-05-05: correction front de l'enregistrement des seances: `training.html` n'envoie plus `val2: 0` quand la duree est vide; `js/main.js` detecte maintenant les inserts Supabase refuses silencieusement.
- 2026-05-05: revision de `sql/titan_training_anticheat_hardening.sql`: la duree anti-triche ignore les valeurs 0 issues d'un champ vide. A reappliquer dans Supabase pour remplacer le trigger deja pose.
- 2026-05-05: correction Adventure: les ennemis deja a 0 PV declenchent la victoire, mobs aleatoires conserves, boss tries par `level`, cycle mobs/boss progressif: 5 mobs de base puis +5 tous les 10 niveaux de boss.
- 2026-05-05 verification: `js/main.js` et `js/state.js` passent `node --check`; scripts inline de `training.html` et `adventure.html` parses OK; cache-busters front remontes en v51.
- 2026-05-05: amelioration immersion sobre orientee sport terminee: panneau effort 7j sur `training.html`, formulaire seance plus tactile mobile, bouton validation mobile sticky, barre phase terrain/boss sur `adventure.html`. Verification: scripts inline `training.html` et `adventure.html` parses OK.
- 2026-05-05: renforcement SEO/PWA: image sociale `image/og-titan-os.png`, schema JSON-LD home `WebSite` + `Organization` + `WebApplication`, sitemap regenere au 2026-05-05, tags PWA/Apple et manifest enrichi.
- 2026-05-05: ajout du bouton discret "Installer" sur `index.html` via `js/pwa.js`; prompt PWA natif si disponible, aide iPhone/Safari sinon, service worker `titan-os-v52-seo-pwa-install`.
- 2026-05-05: Adcash mieux cadre cote front: consentement ajoute aux pages publiques indexables, `js/consent.js` ignore les pages `noindex`/login/admin/update-password pour eviter des pubs sur zones privees ou pauvres en contenu.
- 2026-05-05: navigation simplifiee: 8 pages principales dans le menu, modules secondaires regroupes sous "Modules avances", libelles clarifies (`TABLEAU`, `ENTRAINEMENT`, `AVENTURE`, `PROGRES`, `COMMUNAUTE`).
- 2026-05-05: transition de page durcie: style/script critique `titan-critical-boot` injecte dans les heads pour masquer le rendu HTML nu avant chargement CSS/JS; asset cache-busters unifies en v53.
- 2026-05-05: service worker `titan-os-v53-network-first-polish`: pages HTML en network-first, assets en cache revalide, precache non bloquant; `profile.html` retire du precache.
- 2026-05-05: cache donnees serveur passe en `titan_data_cache_v2` avec timestamp/fraicheur 12h; le cache sert de warm start ou secours explicite, le reseau reste prioritaire.
- 2026-05-05: tri surface publique Netlify: blocage `qa-*.png`, `PUBLIC_RELEASE_*`, `TITAN_REPRISE_CONTEXTE.md`, `.env*`, `.git/*`; fichiers conserves localement pour ne pas perdre le contexte.
- 2026-05-05: correction chargement pages legales: le script critique `titan-critical-boot` a maintenant un fallback autonome si `ui.js` n'est pas charge, et masque aussi `.legal-layout`.
- 2026-05-05: `legal_hub.html` refait en centre de confiance complet: documents principaux, donnees/RGPD, cookies-publicite, paiement Elite, securite, contact et note de prudence juridique.
- 2026-05-05 en cours: lot TODO local sur scripts de verification, QA manuelle, accessibilite motion, remplacement d'alertes visibles et petits etats offline/sync si faisable.
- 2026-05-05: ajout `package.json` scripts `check/test/smoke/lint`, outil `tools/check-inline-scripts.mjs`; verification OK: 56 scripts parses.
- 2026-05-05: ajout `PUBLIC_RELEASE_QA_CHECKLIST.md` couvrant auth, training, adventure, stats/profil, boutique/Elite, social/chat, offline/PWA, securite/build.
- 2026-05-05: remplacement des `alert()` visibles parcours public par notifications/fallback console sur social, chat, health, training, profile, talents, trophies; alertes restantes limitees a console admin protegee/dev.
- 2026-05-05: ajout indicateur global de sync `titan-sync-status`: local, en cours, cloud, offline, erreur; branche sur sauvegarde locale, sync profil et envoi seance.
- 2026-05-05: ajout bouton PWA "Nouvelle version - recharger" quand un service worker attend; `sw.js` accepte `SKIP_WAITING`; cache/app version unifies en v54.
- 2026-05-05: documentation ordre chargement scripts ajoutee dans `README_TITAN_OS.md`; lazy-loading cible sur images non critiques guide/trophees/social; lien Support/feedback ajoute a la navigation utilitaire.
- 2026-05-05: helpers UI reutilisables ajoutes (`titanStateBlock`, `titanRenderStateBlock`) et helpers data exposes (`titanWithTimeout`, `titanRetry`); maintenance confirmee via `GLOBAL_CONFIG.maintenance_mode`.
- 2026-05-05: centralisation config front: `login.html` et `update-password.html` lisent Supabase depuis `js/config.js`; liens Lemon Squeezy, Discord, support et Adcash passent par `TITAN_EXTERNAL_URLS` avec fallback prudent.
- 2026-05-05: ajout `network-error.html` et fallback service worker pour les navigations sans reseau ni cache; cache SW renomme `titan-os-v54-network-fallback`.
- 2026-05-05: monitoring front local ajoute dans `js/ui.js`: capture `window.error` et `unhandledrejection`, stockage des 30 dernieres erreurs dans `localStorage` via `titanGetClientErrors()`.
- 2026-05-05: ajout `changelog.html` visible depuis la navigation utilitaire; resume v54, sport/immersion, securite et travail public release.
- 2026-05-05: social commence a utiliser les helpers d'etats UI (`titanRenderStateBlock`) pour mode invite, amis vides, erreurs DB/profils et module indisponible.
- 2026-05-05: suivi performance local ajoute: load, DOM ready, LCP et CLS exposes via `titanGetPerformanceSnapshot()` dans `js/ui.js`.
- 2026-05-05: clarification Gratuit vs Elite ajoutee dans `boutique.html`: suivi sportif gratuit, analyses/cosmetiques Elite, rappel Lemon Squeezy et absence de stockage bancaire.
- 2026-05-05: file d'attente locale des seances non synchronisees ajoutee dans `js/main.js`; retry automatique apres reconnexion/auth via `flushPendingTrainingLogs()`.
- 2026-05-05: version asset exposee dans `js/config.js` via `TITAN_ASSET_VERSION`; `js/main.js` l'utilise pour corriger les stylesheets chargees.
- 2026-05-05: accessibilite formulaire amelioree: labels associes login/training, sliders biometrie labels, upload GPX utilisable au clavier, reset password avec aria-label.
- 2026-05-05: logique conflit local/cloud documentee: le cloud reste prioritaire, le cache local plus recent est envoye en audit via reconciliation et les seances non synchronisees passent par une queue dediee.
- 2026-05-05: accessibilite clavier stats: onglets Performance/Labo convertis en vrais boutons avec `aria-pressed`.
- 2026-05-05: centre de notifications interne ajoute (`notifications.html`): queue de sync seances, erreurs locales, snapshot performance et rappel transmissions; lien ajoute a la navigation utilitaire.
- 2026-05-05: onboarding public ajoute (`onboarding.html`) avec parcours profil/avatar, discipline simple, premiere mission et liens directs vers profil/training/stats.
- 2026-05-05: premiers reglages confidentialite ajoutes au profil: profil public, stats visibles, presence sociale; sauvegarde dans `state.user.privacy` et sync game_state.
- 2026-05-05: dimensions/decoding ajoutes aux images statiques restantes: 404, guide, login, adventure, lore trophees.
- 2026-05-05: depot Git local initialise et `.gitignore` ajoute pour secrets/caches/captures QA/logs.
- 2026-05-05: objectif hebdomadaire personnalisable ajoute sur le QG: progression semaine, input 1-14 seances, sauvegarde dans `state.user.weeklyGoalSessions`.
- 2026-05-05: calendrier d'entrainement confirme dans `training.html`: planning hebdo, cellules jour, objectif par date, statut aujourd'hui/effectue.
- 2026-05-05: comparaison semaine actuelle vs precedente confirmee via `titanGetWeekComparison()`, affichee sur QG et stats.
- 2026-05-05: missions actives ajoutees au QG: seance du jour, contexte, recuperation, objectif hebdo, variation de disciplines.
- 2026-05-05: progression visible des succes confirmee dans `trophies.html`: courant/objectif, barre et pourcentage avant deblocage.
- 2026-05-05: niveaux par discipline ajoutes dans `disciplines.html`, calcules depuis XP par sport avec barre de progression.
- 2026-05-05: recommandations recuperation ajoutees dans `health.html` selon score forme: normal, controle, intensite reduite, recuperation prioritaire.
- 2026-05-05: import GPX confirme robuste cote front: erreur fichier vide, preview carte, distance/duree/denivele/allure, limites points standard/Elite.
- 2026-05-05: backlog integrations sport formalise dans `PUBLIC_RELEASE_INTEGRATIONS_BACKLOG.md` pour Strava, Garmin, Apple Health, Google Fit/Health Connect.
- 2026-05-05: objectifs collectifs de guilde confirmes dans `social.html`: objectif hebdo, progression et ajustement local.
- 2026-05-06: streaks anti-frustration ajoutes: `streak_shields` dans le state, protection d'une semaine manquee, bonus hebdo conserve puis reset si absence trop longue.
- 2026-05-06: resume post-seance persistant ajoute: XP, credits, charge combat, records/badges/titres, loot synthetique et prochain objectif visibles dans `notifications.html`.
- 2026-05-06: classement amis optionnel ajoute dans `social.html`, masque par defaut via `privacy.friendRankings=false` et respecte `privacy.showStats`.
- 2026-05-06: confirmations social visibles remplacees par double-clic avec toast pour retrait ami et sortie de guilde; verification scripts inline OK.
- 2026-05-06: navigation service regroupee: `service.html` cree, sidebar reduite a un seul hub Service, drawer mobile avec hub accordeon, service worker mis a jour.
- 2026-05-06: SQL social public-release ajoute: `sql/titan_social_privacy_rate_limit.sql` pour privacy serveur, blocage utilisateur, logs d'actions sociales et rate limit ajout/suppression amis.
- 2026-05-06: cycle billing Elite complete: `sql/titan_billing_subscription_lifecycle.sql`, webhook Lemon Squeezy enrichi avec dates renouvellement/fin/essai/remboursement et fallback colonnes absentes.
- 2026-05-06: ordre SQL de reprise ajoute dans `PUBLIC_RELEASE_SQL_ORDER.md` pour appliquer uniquement les nouveaux scripts et verifier les objets/colonnes.
- 2026-05-06: bouton blocage agent ajoute au social: double-clic de confirmation, RPC `titan_block_user` si disponible, masquage local chat via `titan_blocked_senders`.
- 2026-05-06: premiere RPC recompenses serveur ajoutee: `sql/titan_training_server_rewards_rpc.sql` calcule XP/credits bornes, insere `training_logs` et credite `profiles.credits`.
- 2026-05-06: helper backup Supabase ajoute `tools/supabase-backup.ps1` + exclusion `backups/` pour generer dump complet et schema avant migrations.
- 2026-05-06: front branche sur `titan_submit_training_session`: les seances connectees tentent la RPC serveur avant fallback insert direct; la queue offline reutilise le meme chemin.
- 2026-05-06 utilisateur: base Supabase mise a jour avec les derniers SQL public release. Reste a tester en compte reel: seance via RPC, blocage social, privacy amis, billing webhook et audit RLS.
- 2026-05-06: script de fermeture RLS critique ajoute `sql/titan_rls_critical_tables_closure.sql` et ordre d'application mis a jour dans `PUBLIC_RELEASE_SQL_ORDER.md`; les `NOTICE` Supabase devront etre relus pour adapter les tables dont le schema differe.
- 2026-05-06: correction du script RLS critique: policies guildes/raids separees selon colonnes presentes (`owner_id`, `leader_id`, `user_id`) pour eviter qu'une variante de schema saute toute la regle.
- 2026-05-06: RPC boutique serveur ajoutee `sql/titan_shop_purchase_rpc.sql`; `js/main.js` tente `titan_purchase_shop_item` pour valider credits/cooldowns cote Supabase avant fallback local.
- 2026-05-06: helper lecture audit RLS ajoute `sql/titan_public_release_rls_review_after_closure.sql` pour classer les 11 tables critiques en actions (`enable_rls`, grant anon, policy manquante, revue manuelle).
- 2026-05-06: source anti-cheat corrigee: `sql/titan_training_anticheat_hardening.sql` ne depend plus directement de `titan_admins.active`, pour eviter l'erreur Supabase `column a.active does not exist`.
- 2026-05-06: RPC defi payant serveur ajoutee `sql/titan_social_wager_challenge_rpc.sql`; `js/main.js` tente `titan_create_wager_challenge` pour debiter la mise et creer le defi en transaction.
- 2026-05-06: policies `social_challenges` harmonisees dans le SQL defi pour eviter les doublons entre le script RLS critique et la RPC de mise.
- 2026-05-06: hotfix audit RLS ajoute `sql/titan_public_release_rls_audit_fix_ambiguous_table_name.sql` apres erreur Supabase `table_name is ambiguous`; helper review aliasse aussi ses colonnes.
- 2026-05-06: hotfix audit RLS v2: `privilege_type` est caste en `text` pour corriger l'erreur Supabase `information_schema.character_data[] does not match expected type text[]`.
- 2026-05-06 CSV audit Supabase analyse: `profiles`, `friendships` et `messages` ont des grants `anon` trop larges; ajout `sql/titan_public_grants_closure_from_audit.sql` pour fermer anon et reduire authenticated au strict necessaire.
- 2026-05-06: audit/review RLS durcis: `messages` n'est considere acceptable pour `anon` que si le seul privilege est `SELECT`.
- 2026-05-06 CSV audit Supabase apres fermeture grants: `profiles` et `friendships` ont `anon_privileges=[]`, `messages` a uniquement `anon_privileges=["SELECT"]`; plus aucun `fix_required_anon_grant` sur les 11 tables critiques.
- 2026-05-06: helper revue logique policies ajoute `sql/titan_public_release_policy_logic_review.sql` pour verifier roles publics, `using true`, `with check` manquant et presence de `auth.uid()` sur tables privees.
- 2026-05-06 CSV policy logic review analyse: anciennes policies role `public` encore presentes sur tables privees (`profiles`, `friendships`, `inventory`, `shop_history`, `training_logs`, `user_achievements`, `social_challenges`, `guild_raid`) et `messages` a un insert public; ajout `sql/titan_public_policy_cleanup_from_logic_review.sql`.
- 2026-05-06: helper policy logic review ajuste pour ne plus signaler les `DELETE` sans `with check`, car Postgres n'utilise pas `with check` sur DELETE.
- 2026-05-06: cleanup policies rendu tolerant aux noms accentues/mojibake vus dans le CSV Supabase (`Cr?er D?fi`, `succ?s`, etc.).

- 2026-05-06 CSV policy logic review apres cleanup: toutes les legacy policies dangereuses ont disparu; seul reste `guild_raid` sans policy. Ajout `sql/titan_guild_raid_policy_no_owner_hotfix.sql` pour fermer la table par defaut avec une policy `false`.
- 2026-05-06 CSV policy logic review final: plus aucun `fix_required_*`; `guild_raid` ferme via `guild_raid_closed_until_schema_owner`; RLS logique validee pour les tables critiques.
- 2026-05-06: SQL privacy optionnel/recommande ajoute `sql/titan_messages_authenticated_only_privacy.sql` pour retirer le `SELECT` anon sur `messages` et eviter l'exposition publique de `sender_id`.
- 2026-05-06 utilisateur: `sql/titan_messages_authenticated_only_privacy.sql` applique dans Supabase; le chat front bloque maintenant le canal global aux invites pour suivre la nouvelle RLS sans erreur visible.
- 2026-05-06: RPC combat serveur ajoutee `sql/titan_combat_victory_rewards_rpc.sql`: victoires connectees bornees cote Supabase, logs combat, bestiaire utilisateur, credits/XP profil et rate limit simple.
- 2026-05-06: `adventure.html` branche les victoires connectees sur `titan_submit_combat_victory`; fallback local conserve pour invite/offline/RPC absent.
- 2026-05-06: XSS training/sport details durci: helper `escapeUi` accepte bien `titanEscapeHtml`, resumes/notes/tags de seance echappes avant rendu `innerHTML`.
- 2026-05-06 utilisateur: `sql/titan_combat_victory_rewards_rpc.sql` applique dans Supabase. Reste a tester une victoire aventure avec compte connecte et verifier `combat_logs`/`user_bestiary`.
- 2026-05-06: champs sociaux durcis: nom/devise/code guilde nettoyes avant stockage local, defis actifs echappent sport/status avant `innerHTML`.
- 2026-05-06: RPC succes serveur ajoutee `sql/titan_achievement_claim_rpc.sql`; `unlockAchievement` tente `titan_claim_achievement` pour verrouiller les recompenses uniques cote Supabase avant fallback legacy, et ne donne plus les credits locaux si le serveur refuse.
- 2026-05-06: import GPX durci: limite taille standard/Elite, rejet XML mal forme, limite points, coordonnees invalides ignorees et trace insuffisante refusee proprement.
- 2026-05-06 utilisateur: `sql/titan_achievement_claim_rpc.sql` applique dans Supabase. Reste a tester le deblocage d'un succes en compte connecte et verifier `user_achievements`.
- 2026-05-06: garde comptes suspendus ajoute `sql/titan_suspended_user_action_guards.sql`; triggers sur actions sensibles existantes pour refuser training/chat/social/shop/combat/succes si `profiles.is_suspended=true`.
- 2026-05-06 utilisateur: `sql/titan_suspended_user_action_guards.sql` applique dans Supabase. Reste a tester un compte suspendu reel sur chat/training/social pour valider les refus visibles.
- 2026-05-06: XSS succes/social legacy durci: `trophies.html` echappe titre/description/id/icon des succes DB; l'ancien `loadMyFriends()` redirige vers le chemin `loadMyFriendsV2()` durci.
- 2026-05-06: UX compte suspendu ajoutee: helper global `titanIsSuspendedError`/`titanNotifySuspended`; training, boutique, defis, chat et ajout ami affichent un refus lisible au lieu d'une erreur SQL brute.
- 2026-05-06: XSS boutique durci: les cartes boutique echappent nom/description/status/prix, valident les icones Remix et passent par un token local pour les actions au lieu d'injecter directement les ids catalogue dans les `onclick`.
- 2026-05-06: XSS historique d'activites durci: `activities.html` echappe sport/date/valeur/unite/XP, nettoie les classes categorie et valide les icones avant rendu des cartes.
- 2026-05-06: XSS disciplines durci: aggregation historique protegee, records et feed aventure echappes, icones/titres filtres; ancien header mobile `js/ui.js` echappe aussi le pseudo.
- 2026-05-06: moderation chat renforcee: le bouton bloquer masque toujours localement et tente maintenant `titan_block_user` cote Supabase pour rendre le blocage durable entre appareils.
- 2026-05-06: SQL moderation finale chat ajoute `sql/titan_chat_message_moderation_final.sql`: signalement d'un message precis, colonnes `messages.hidden_*`, RPC admin `titan_admin_hide_chat_message` et policy qui filtre les messages masques.
- 2026-05-06: hotfix SQL moderation chat: `message_id` passe en `text`, suppression de l'ancienne FK incompatible et des anciennes RPC `uuid`; compatible avec les bases ou `messages.id` est `bigint` comme chez l'utilisateur.
- 2026-05-06: profil cosmetiques durci: labels/icones/ids des visuels Elite sont filtres avant rendu `innerHTML`.
- 2026-05-06: CDN figes: Supabase JS passe de `@2` a `@2.57.4`, Chart.js de flottant a `@4.5.0`; Remixicon et Leaflet etaient deja versions.
- 2026-05-06: stats labo durci: labels/icones/valeurs `FUN_STATS_DB` sont echappes/valides avant rendu.
- 2026-05-06: correctif DB boot ajoute `sql/titan_public_catalog_read_access.sql` pour restaurer la lecture publique controlee des tables catalogue non privees apres fermeture RLS; `loadServerData` passe a 10s et classe les lenteurs catalogue en soft issues au lieu de bloquer l'experience.
- 2026-05-06: passe caracteres visibles: correction ASCII propre sur login, reset password, accueil, chat et boutique; suppression des principaux mojibakes visibles critiques. Sitemap `lastmod` passe au 2026-05-06.
- 2026-05-06 diagnostic sync sport: l'enregistrement des seances n'etait pas uniquement DB; la prod doit embarquer le `js/main.js` actuel pour utiliser `titan_submit_training_session`, detecter les inserts silencieusement refuses et rejouer la queue locale.
- 2026-05-06 P0 sport sync: cache-busters front/SW montes en v55 pour forcer le nouveau JS apres Netlify; `js/main.js` ajoute diagnostic `titanGetTrainingSyncDiagnostic()` et force une sauvegarde profil apres validation cloud; SQL `titan_training_sync_p0_repair.sql` ajoute pour reparer/verifier `training_logs` + RPC.
- 2026-05-06 hotfix DB sport: erreur Supabase `credits is ambiguous` corrigee par alias explicites dans `titan_submit_training_session`; extension de la correction aux RPC credits boutique, defis, combat, succes et console admin. SQL court ajoute: `sql/titan_training_credits_ambiguity_hotfix.sql`.
- 2026-05-06 final polish sync: notifications parasites de sauvegarde/cloud supprimees, file d'attente offline conservee, statut sync reduit a un petit voyant discret vert/ambre/rouge via `titanSetSyncStatus`.
- 2026-05-06 final polish SEO/Adcash: meta description accueil resserree, schema `Organization` complete avec support, preview moteur ajoutee dans `PUBLIC_SEARCH_PREVIEW.md`; `ads.txt` et sitemap verifies localement.
- 2026-05-06 final polish mobile/boutique: CSS global v56 ajoute pour focus clavier, zones tactiles, anti-debordement mobile/desktop; boutique rendue plus stable sur petits ecrans et plus propre visuellement.
- 2026-05-06 final polish economie: progression niveau allongee (`XP_PER_LEVEL_BASE=2200`, courbe exponentielle douce), bonus credits de niveau reduit, combat repasse par `checkLevelUp()` pour garder une progression coherente.
- 2026-05-06 verification finale locale: cache-busters HTML/JS et service worker montes en v57; passe caracteres visibles relancee sur pages publiques; `node --check` OK sur `config.js`, `main.js`, `ui.js`, `sw.js`; `tools/check-inline-scripts.mjs` OK avec 58 scripts parses.
- 2026-05-06 correction autorite progression: ajout `sql/titan_server_progression_authority.sql`; Supabase decide maintenant XP cumulee, level-up et bonus credits via `titan_apply_progression_reward`, utilisee par les RPC sport/combat. Front v57 ne pousse plus `level/credits/xp` directement dans `profiles.update`.
- 2026-05-13: sprint lissage UX/beta publique v60: navigation principale reduite a 5 entrees (`TABLEAU`, `ENTRAINEMENT`, `AVENTURE`, `PROGRES`, `PROFIL`), modules social/boutique/journal/trophees/sante passes en secondaire.
- 2026-05-13: SEO public recadre sur la marque "TITAN OS": sitemap limite aux pages publiques utiles (`/`, `/guide`, `/service`, legal, changelog), pages app privees en `noindex`, titles/descriptions/OG/JSON-LD regeneres.
- 2026-05-13: publicites limitees aux pages publiques autorisees (`index`, `guide`, `service`, `changelog`) avec consentement; retrait du consentement/script pub des pages privees et suppression du declenchement pub apres validation d'une seance.
- 2026-05-13: monetisation Adcash ajustee pour rentabilite propre: primes publicitaires volontaires activees en boutique via consentement, pas d'auto-ads sur boutique, exclusion des comptes Elite, entrainement/login/reset/pages privees sans script pub.
- 2026-05-13: textes de confiance alignes avec la monetisation reelle: CGU moins agressives sur la publicite, remboursement Elite renvoye aux conditions Lemon Squeezy/support, mentions legales marquent l'identite juridique a completer par Theo avant ouverture large.
- 2026-05-13: garde-fous autorite serveur renforces cote front: compte connecte bloque les recompenses critiques si RPC serveur absente pour training, succes, boutique, defis payants et recompenses combat; les invites restent en mode local/demo.
- 2026-05-13: entrainement simplifie: H1 clarifie, onglets natifs `button`, biometrie repliee par defaut, message initial corrige, cache-busters front/SW montes en v60.
- 2026-05-13: CSP Netlify resserree sur `script-src`, `connect-src` et `frame-src`; X-Robots-Tag ajoutes aux principales pages app noindex.
- 2026-05-13: ajout `sql/titan_public_beta_readiness_audit.sql`, audit Supabase lecture seule pour verifier RLS, grants anon, RPC critiques et index recommandes avant beta publique.
- 2026-05-13 verification locale: `node tools/check-inline-scripts.mjs` OK avec 62 scripts parses; `node --check` OK sur `config.js`, `main.js`, `ui.js`, `consent.js`, `sw.js`, `tools/apply-seo.mjs`; `npm run check/test/smoke` non lances car `npm` indisponible dans le terminal.
- 2026-05-13 verification Edge headless locale: accueil desktop/mobile, training mobile et service mobile charges sans scroll horizontal; bottom nav = 5 items; training en `noindex` sans `consent.js`; erreurs console uniquement liees aux ressources externes volontairement bloquees pendant le test local.
- 2026-05-13 verification monetisation Edge headless: boutique mobile `noindex` avec `consent.js` uniquement pour prime volontaire, aucun chargement Adcash automatique, clic prime sans consentement => bannière + `ADS_CONSENT_REQUIRED`, compte Elite local => prime pub non eligible; mobile nav = `QG/SPORT/GAME/STATS/MOI`.

- 2026-05-19: roadmap differenciation SPORT/RPG ajoutee selon arbitrage produit utilisateur. Axe retenu: fusionner coach sportif adaptatif, progression par discipline, radar physique, signaux corporels, competition personnelle, classes hybrides, talents profonds, boss a mecaniques credibles, bestiaire statistique, guild raids, recuperation valorisee et journal d'aventure narratif. Les boosts avances doivent etre reserves a Elite sans rendre la version gratuite incomplete ni pay-to-win.
- 2026-05-19: fondation cloud cross-device ajoutee: RPC `titan_save_profile_state`, sauvegarde `game_state` systematique via Supabase pour les comptes connectes, chargement cloud autoritaire a la connexion, preserve les champs serveur sensibles (`is_elite`, `is_tester`, `is_suspended`) et garde les rewards critiques cote RPC existantes.
- 2026-05-19: social/guildes sortent du mode local: RPC `titan_add_friend_by_code`, guildes cloud (`titan_create_guild`, `titan_join_guild`, `titan_leave_guild`, `titan_set_guild_target`, `titan_get_my_guild`) et chat guilde cloud (`titan_list_guild_messages`, `titan_send_guild_message`). Le code ami ne depend plus d'un insert direct bloque par RLS.
- 2026-05-19: premiere vague SPORT/RPG implementee: coach adaptatif QG, radar physique, qualites physiques, alertes de desequilibre, debrief post-seance enrichi, classes hybrides, reputation, mecaniques boss credibles, preparation boss, check-in recovery quotidien et journal d'aventure automatique.
- 2026-05-19: vague 2 produit retenue: retour apres absence, plateau, retour au calme, records contextualises, score fraicheur, calendrier de charge, badges de regularite, plans Elite, analyses similaires Elite, rapport mensuel Elite; cote RPG: metiers de campagne, ennemis lies aux desequilibres, titres evolutifs, cartes boss uniques, compagnon tactique, boss a phases a partir du 5e boss, roles sportifs de guilde et boss 10 "duel contre soi-meme".
- 2026-05-19: garde-fous UX ajoutes a la roadmap: refonte couleurs/CSS, vigilance mobile, guide premier lancement, architecture d'information beton, decouverte claire des fonctionnalites et regle Supabase-first pour tout nouvel ajout.
- 2026-05-19: passe v65 "clarity/economie" en local: navigation renomme en 5 hubs simples (`QG`, `SPORT`, `AVENTURE`, `PROGRES`, `PROFIL`), guide premier lancement etendu, styles globaux adoucis, police `Sora` + `Rajdhani`, cartes/boutons/touches mobile stabilises, QG enrichi avec un encart economie lisible.
- 2026-05-19: economie sociale preparee dans `sql/titan_public_economy_clarity_foundation.sql`: messages global/guilde payants, limite 280 caracteres gratuit / 700 Elite, retention 48h messages globaux et 72h guilde, creation guilde a 3000 credits, plafonds hebdo 9600 XP + 4800 credits gratuits et +20% Elite.
- 2026-05-19: front branche sur cette economie: `chat.html` et `js/chat.js` affichent cout/limite/retention et passent par RPC serveur; `social.html` affiche le cout de creation de guilde; `index.html` affiche les plafonds hebdo et couts sociaux dans le QG; les recompenses sport/combat affichent un avertissement quand le plafond hebdo est atteint.
- 2026-05-20: connecteur Supabase retabli. Migrations appliquees sur `oubmftfufwwzwpgvrcag`: `titan_shop_economy_balance_v66`, `titan_public_economy_clarity_foundation`, puis hotfix `titan_economy_rpc_anon_revoke_v66`. Verification OK: RPC economie/chat/guilde/boutique presentes, table `titan_weekly_reward_usage` presente, colonnes `expires_at`/`cost_credits`/`hidden_at` et colonnes boutique v66 presentes. Verification grants OK: `anon` ne peut plus executer les RPC sensibles chat/economie/boutique testees.

## P0 - Bloquants avant ouverture publique

1. [x] Auditer toutes les policies Supabase RLS sur `profiles`, `training_logs`, `activities`, `messages`, `friendships`, `shop_history`, `user_achievements`, `inventory`, `guilds`, `guild_raid`. Note: CSV final policy logic review OK; toutes les lignes restantes sont `ok_review` sauf `activities` absente/inutilisee.
2. [x] Verifier que chaque joueur ne peut lire/ecrire que ses propres donnees privees. Note: policies finales en `authenticated` + `auth.uid()` sur tables privees; `guild_raid` ferme par policy `false` tant que schema proprietaire absent.
3. [x] Verifier que les donnees publiques exposees ne revelent pas email, user id sensible, IP, token ou donnees sportives privees. Note: profils/friendships non accessibles en anon, RPC sociales limitees, `messages` retire du SELECT anon via `sql/titan_messages_authenticated_only_privacy.sql`; les tables catalogue non privees sont rouvertes par `sql/titan_public_catalog_read_access.sql` pour garder le site bootable.
4. [ ] Deplacer ou valider cote serveur toutes les recompenses critiques: XP, credits, objets, succes, degats boss, statut Elite. Note partielle: SQL anti-triche bloque les sauts impossibles; `titan_submit_training_session` pose une RPC serveur XP/credits pour les seances; `titan_apply_progression_reward` decide XP cumulee, level-up et bonus credits de niveau cote Supabase; `titan_purchase_shop_item` valide credits/cooldowns boutique; `titan_create_wager_challenge` verrouille les mises de defis; `titan_submit_combat_victory` ajoute le chemin serveur combat et le front l'utilise; `titan_claim_achievement` verrouille les credits de succes uniques. Note 2026-05-20: migration v65 appliquee, les plafonds hebdo serveur XP/credits existent et les RPC associees sont presentes.
5. [x] Ajouter des controles anti-triche cote Supabase ou fonction serveur: valeurs max par sport, duree, distance, volume, frequence. Note: `sql/titan_training_anticheat_hardening.sql` applique dans Supabase; revision 2026-05-05 a reappliquer pour ignorer les durees vides envoyees anciennement a 0.
6. [x] Ajouter un journal des actions suspectes: activite impossible, spam chat, achat anormal, progression trop rapide. Note: `titan_suspicious_actions` applique dans Supabase; chat a deja reports/rate-limit.
7. [x] Nettoyer les modes debug/dev visibles dans l'interface publique. Note: `TITAN_ENABLE_DEV_TOOLS=false` et fonctions dev neutralisees hors flag/testeur.
8. [x] Verifier et proteger `sys_core_override_99.html`; idealement le retirer du build public si c'est une console admin. Note: URL bloquee localement par `netlify.toml` et `_redirects` avec 404 force; test prod 2026-05-05 montre encore l'ancien deploy accessible, redeployer en urgence.
9. [x] Supprimer ou masquer les `console.log` non necessaires en production. Note: plus de `console.log/debug/info` cote HTML/JS front; warnings/errors conserves.
10. [ ] Remplacer les rendus `innerHTML` qui utilisent du contenu utilisateur par du rendu echappe ou `textContent`. Note partielle: bestiaire `trophies.html` durci pour les mobs locaux et boss DB; succes DB echappent titre/description/id/icon; historique/details seance training et sport details corriges pour utiliser `titanEscapeHtml`; historique global `activities.html` et disciplines echappent les champs de seance/records/combat; stats labo echappe `FUN_STATS_DB`; defis sociaux actifs echappent sport/status; ancien rendu amis legacy neutralise; boutique echappe nom/description/status et valide icon/id avant rendu; profil cosmetiques filtre labels/icones/ids; ancien header mobile echappe le pseudo.
11. [x] Ajouter une fonction utilitaire d'echappement HTML centralisee si `innerHTML` reste necessaire pour certains templates. Note: `titanEscapeText`, `titanEscapeHtml`, `titanSafeText`.
12. [ ] Verifier tous les champs utilisateur: pseudo, code ami, chat, bio, nom de guilde, messages admin, import GPX. Note partielle: pseudo/avatar durcis front + SQL; pseudo re-echappe dans les rendus globaux; chat/code ami deja bornes; nom/devise/code guilde nettoyes cote front; GPX borne en taille/points/XML/coordonnees; messages chat peuvent etre signales/masques par SQL final; messages admin restent a auditer plus finement.
13. [ ] Ajouter moderation chat: signaler message, masquer message, bannir/suspendre utilisateur. Note partielle: signalement chat vers `titan_moderation_reports`, signalement de message precis via `titan_report_chat_message`, masquage admin via `titan_admin_hide_chat_message`, masquage local des expediteurs, blocage chat tente `titan_block_user` pour persister entre appareils; refus SQL des comptes suspendus ajoute via triggers d'actions sensibles avec message front lisible; blocage social serveur ajoute; test admin reel encore a faire.
14. [x] Ajouter rate limit chat/social: messages par minute, demandes amis par jour, suppression/ajout repetes. Note: chat 5/min via SQL; social ajoute `titan_social_action_log` + trigger limitant ajout ami/jour et suppressions/heure.
15. [x] Ajouter blocage utilisateur: ne plus voir ses messages, ne plus recevoir ses demandes. Note: blocage local chat global + SQL `titan_user_blocks`, RPC `titan_block_user`/`titan_unblock_user`, filtrage amis et bouton bloquer cote social.
16. [x] Securiser le webhook Paddle avec idempotence: ne pas retraiter deux fois le meme evenement. Note: `functions/webhook.mjs` verifie `Paddle-Signature`; `titan_billing_events.event_id` unique.
17. [x] Verifier le paiement Elite par ID produit/prix Paddle plutot que par nom de produit. Note: env `PADDLE_ELITE_PRODUCT_IDS` / `PADDLE_ELITE_PRICE_IDS`, fallback nom conserve pour premier deploiement seulement.
18. [x] Stocker en base les infos minimales d'abonnement: status, order/subscription id, date d'expiration, derniere verification. Note: `titan_billing_subscription_lifecycle.sql` ajoute renouvellement/fin/essai/remboursement/dernier event; webhook renseigne les champs si presents.
19. [x] Ajouter gestion robuste des evenements d'abonnement: creation, update, paiement echoue, annulation, expiration, remboursement. Note: webhook Paddle couvre subscription created/activated/trialing/updated/resumed/past_due, transaction completed, canceled/paused, avec fallback colonnes absentes; test dashboard Paddle reel reste a faire dans item 35/selection sprint.
20. [x] Verifier que `SUPABASE_SERVICE_ROLE_KEY` n'apparait jamais cote front. Note: recherche HTML/JS OK; la cle est seulement referencee dans `functions/webhook.mjs` via env serveur.
21. [x] Verifier que la cle anon Supabase n'autorise rien de dangereux sans RLS. Note: CSV audit apres `sql/titan_public_grants_closure_from_audit.sql` confirme `anon_privileges=[]` sur `profiles`/`friendships` et `anon_privileges=["SELECT"]` seulement sur `messages`.
22. [x] Ajouter une Content Security Policy dans `netlify.toml`, en tenant compte des CDN utilises. Note: CSP ajoutee pour self, Supabase, Paddle, CDN, fonts et Adcash.
23. [x] Ajouter `connect-src` CSP pour Supabase, Paddle et services strictement necessaires. Note: `connect-src` limite a self, Supabase REST/WSS, Paddle et Adcash.
24. [ ] Ajouter `script-src` CSP limitee; eviter autant que possible le JS inline a terme. Note partielle: v79 limite `script-src` a self/CDN utiles/Adcash/Paddle, mais `unsafe-inline` reste temporairement necessaire a cause des scripts et handlers inline.
25. [x] Verifier que `/sql/`, `/tools/`, fichiers `.sql`, `.md`, `.toml`, `package.json` ne sont pas accessibles publiquement apres deploy. Note 2026-06-03: `node tools/build-public.mjs` OK; `dist/` ne contient pas `sql/`, `tools/`, `functions/`, docs internes, `netlify.toml`, `package.json`, TODO ou console admin.
26. [ ] Tester les redirects Netlify en prod, pas seulement en local. Note 2026-06-03: local `_redirects` et build OK; verification Netlify distante bloquee par reauth 401, donc refaire apres connexion Netlify et redeploy.
27. [x] Ajouter un parcours suppression compte fonctionnel et conforme RGPD via RPC `delete_own_account`. Note: RPC appliquee dans Supabase et appelee par `profile.html`; test fonctionnel compte reel encore a faire item 35.
28. [x] Ajouter export des donnees personnelles utilisateur. Note: RPC `export_own_data` appliquee dans Supabase; `profile.html` exporte cloud + state local, fallback local si RPC absente.
29. [x] Ajouter un contact legal/support clair dans les pages legales. Note: `titanteam.app@gmail.com` visible dans hub legal, mentions et confidentialite.
30. [ ] Verifier les mentions legales pour un lancement France/UE. Note partielle: hub legal complete le 2026-05-05; il manque encore l'identite juridique exacte selon statut reel de l'editeur avant lancement officiel.
31. [x] Ajouter consentement cookies/analytics si un outil de mesure ou pub est actif. Note: `js/consent.js` bloque Adcash tant que l'utilisateur n'a pas accepte.
32. [x] Verifier le statut Adcash/publicites: consentement, pages autorisees, pas de pub intrusive sur actions sportives critiques. Note: front cadre le chargement apres consentement uniquement sur accueil/guide/service/changelog; boutique autorise seulement les primes volontaires apres clic utilisateur et consentement; pas de script pub sur training/login/reset/pages privees; comptes Elite exclus des pubs; validation finale du compte, categories et Auto ads reste dans le dashboard Adcash.
33. [ ] Ajouter sauvegarde/restauration Supabase avant toute migration majeure. Note partielle: procedure documentee dans `PUBLIC_RELEASE_RUNBOOK.md`; helper `tools/supabase-backup.ps1` ajoute pour dump complet/schema; test restauration encore a faire.
34. [x] Documenter un plan rollback deploy: comment revenir a la version precedente en cas d'incident. Note: runbook Netlify/Supabase ajoute dans `PUBLIC_RELEASE_RUNBOOK.md`.
35. [ ] Tester inscription, confirmation email, login, reset password, logout, compte suspendu, suppression compte. Note partielle: les erreurs compte suspendu sont maintenant mappees proprement cote front; test reel Supabase encore a faire.

## P1 - Premiere experience grand public

36. [x] Creer un onboarding guide: choix avatar, sport principal, objectif, premiere mission. Note: `onboarding.html` ajoute et relie depuis l'accueil/navigation utilitaire.
37. [x] Ajouter une premiere seance demo ou un parcours "premier entrainement" tres court. Note: premiere mission conseillee ajoutee dans `onboarding.html` sans creer de fausse donnee.
38. [x] Clarifier en 5 secondes ce qu'est TITAN OS sur la premiere page publique. Note: bandeau intro index + titre/meta expliquent suivi sportif gamifie, XP, objectifs, stats et progression.
39. [ ] Creer une landing publique separee des vues connectees si necessaire.
40. [ ] Ajouter captures ou visuels reels du produit sur la page publique.
41. [ ] Rendre le parcours "inviteur -> inscription -> premiere action" fluide. Note partielle: accueil pointe vers `onboarding.html`, puis profil/training/stats; navigation et training simplifiees en v60; inscription/login reel encore a tester.
42. [x] Remplacer les `alert()` par des toasts/modales coherents avec l'UI. Note: parcours publics remplaces par `showNotification`/fallback console; confirmations social critiques converties en double-clic toast; restent seulement console admin protegee et bouton dev non public.
43. [ ] Harmoniser les etats loading, erreur, succes sur toutes les pages. Note partielle: helper commun ajoute; social commence a l'utiliser pour offline/empty/error; v65 ajoute des messages economie lisibles pour credits insuffisants, rate limit, plafond hebdo et RPC social/chat manquantes.
44. [ ] Ameliorer les etats vides: historique vide, chat vide, amis vides, boutique vide, stats vides. Note partielle: etat amis vide harmonise dans le social; chat affiche maintenant briefing cout/retention/limites pour eviter un ecran incomprehensible.
45. [x] Ajouter un message offline clair quand Supabase est inaccessible. Note: indicateur global `Mode hors ligne`/`Cloud indisponible` + notifications DB secours existantes.
46. [x] Ajouter une file d'attente locale pour activites creees offline puis synchronisees plus tard. Note: queue `titan_pending_training_logs_v1`, retry apres auth/init; les refus anti-triche cloud ne sont pas relances en boucle.
47. [x] Definir la logique de conflit localStorage/Supabase: cloud gagne, local gagne, fusion, ou confirmation. Note: cloud prioritaire; cache local plus recent envoye en audit/reconciliation; seances offline gerees par queue locale dediee.
48. [x] Ajouter un indicateur de sync: sauvegarde locale, cloud OK, erreur cloud. Note: `titan-sync-status` affiche local, pending, cloud, offline et error sous forme de voyant discret; les toasts cloud/sauvegarde non critiques sont filtres.
49. [ ] Optimiser le mobile en priorite: navigation, boutons, formulaires, lisibilite, zones tactiles. Note partielle: liens aide/legal/support regroupes dans un hub Service desktop/mobile; v60 reduit la bottom nav aux 5 actions essentielles et replie les modules secondaires; v65 stabilise boutons, modales, cartes, drawer mobile et encarts QG/chat; QA mobile 360/390/tablette reste a faire.
50. [ ] Verifier toutes les pages sur mobile 360px, tablette, desktop. Note partielle 2026-05-13: Edge headless OK sur accueil desktop 1365, accueil mobile 360, training mobile 390 et service mobile 390; reste a couvrir toutes les pages et un mobile reel.
51. [x] Ajouter une page "Comment ca marche" simple: sport reel -> XP -> boss -> loot -> progression. Note: `guide.html` + guide modal index couvrent sport, XP, campagne, records/badges et boutique/Elite.
52. [x] Clarifier Gratuit vs Elite: fonctionnalites, prix, renouvellement, annulation. Note: comparatif ajoute en boutique; prix/TVA/conditions restent affiches par Paddle avant paiement.
53. [ ] Ajouter profil public/prive avec reglages de confidentialite. Note partielle: toggles profil sauvegardes dans `state.user.privacy` et `profiles.privacy`; profil public, stats, presence sociale et classement amis exposes; audit RLS reel reste a faire.
54. [ ] Permettre de masquer stats personnelles, historique et presence sociale. Note partielle: `profiles.privacy.showStats` masque niveau/sessions/favori dans RPC amis; `friendRankings` opt-in visible profil/social; masquage a etendre a toutes les vues sociales/cloud.
55. [x] Ajouter un centre de notifications interne: news, recompenses, alertes sync. Note: `notifications.html` regroupe sync en attente, erreurs locales, performance et rappel transmissions; les recompenses restent diffusees en toasts.
56. [x] Ajouter un changelog visible dans l'app. Note: `changelog.html` ajoute et lie dans la navigation utilitaire.
57. [x] Ajouter une FAQ courte: donnees, paiement, sport, progression, suppression compte. Note: FAQ guide + centre legal couvrent sport/progression, donnees, paiement Elite, suppression et contact.
58. [x] Ajouter bouton feedback/support depuis l'app. Note: lien `SUPPORT` mailto ajoute a la navigation utilitaire desktop/drawer.
59. [x] Ajouter page maintenance propre basee sur `GLOBAL_CONFIG.maintenance_mode`. Note: `applyGameData` declenche `triggerMaintenanceScreen()` si `global_config.maintenance_mode=true`; ecran maintenance existant dans `ui.js`.
60. [x] Ajouter une page erreur reseau ou base indisponible plus rassurante. Note: `network-error.html` sert de fallback navigation via `sw.js` si reseau et cache echouent.

## P2 - Fiabilite technique et qualite

61. [x] Initialiser ou verifier un vrai depot Git propre pour suivre les changements. Note: `git init` effectue localement; `.gitignore` ajoute.
62. [x] Ajouter scripts `package.json`: `lint`, `test`, `check`, `format` ou equivalents simples. Note: `check/test/smoke/lint` pointent vers `tools/check-inline-scripts.mjs`.
63. [x] Ajouter tests smoke pour ouvrir les pages principales sans erreur JS bloquante. Note 2026-06-03: `node tools/check-inline-scripts.mjs` OK via Node embarque avec 65 scripts parses; `node --check` OK sur `config.js`, `main.js`, `ui.js`, `sw.js`; `npm` reste indisponible dans ce terminal.
64. [x] Ajouter checklist QA manuelle dans un fichier dedie: auth, training, adventure, stats, boutique, social, chat. Note: `PUBLIC_RELEASE_QA_CHECKLIST.md`.
65. [x] Centraliser la config Supabase: eviter duplication entre `login.html` et `js/config.js`. Note: login et reset password lisent `TITAN_SUPABASE_URL` / `TITAN_SUPABASE_ANON_KEY` depuis `js/config.js`; v80 reutilise `initTitanSupabaseClient()` et les options auth centrales.
66. [ ] Centraliser les URLs externes: Paddle, Discord, Supabase, CDN. Note partielle: Paddle, Discord, support, Supabase et Adcash sont regroupes dans `TITAN_EXTERNAL_URLS`; les balises CDN HTML restent a traiter prudemment.
67. [x] Nettoyer les versions cache incoherentes: `v=46`, `v=48`, `CACHE_NAME` v49. Note: cache-busters HTML unifies en v54, `GAME_SETTINGS.version` passe a `54.0`, SW passe en v54.
68. [ ] Ajouter strategie de version unique dans `js/config.js` ou un fichier dedie. Note partielle 2026-06-03: version runtime `81.0`, `TITAN_ASSET_VERSION=81`, cache-busters front `?v=81` et SW `titan-os-v81-cleanup` alignes; les query params restent encore ecrits dans les HTML.
69. [x] Ameliorer `sw.js`: gestion update disponible, fallback offline, pas de cache obsolete bloquant. Note: HTML en network-first, assets revalides, precache partiel non bloquant, anciens caches supprimes a l'activation.
70. [x] Ajouter bouton ou logique "nouvelle version disponible, recharger". Note: `js/pwa.js` affiche un bouton si un service worker attend, puis demande `SKIP_WAITING`.
71. [ ] Compresser les images logo, avatars, boss, mobs. Note 2026-06-03: plusieurs boss/avatars pesent environ 8 a 10 Mo; priorite aux variantes WebP/AVIF responsive et a un budget poids par ecran.
72. [x] Ajouter `loading="lazy"` sur les images non critiques. Note: images secondaires guide, modal bestiaire et avatars sociaux charges en lazy/async; logos critiques conserves immediats.
73. [x] Verifier dimensions images pour eviter layout shift. Note: dimensions ajoutees aux images statiques restantes; images dynamiques CSS/background gardent leurs conteneurs stables.
74. [x] Figer les versions CDN: Supabase, Chart.js, Leaflet, Remixicon. Note 2026-06-03: Supabase JS fige en `@2.57.4` sur toutes les pages, Chart.js `4.5.0`, Leaflet `1.9.4`, Remixicon `3.5.0`.
75. [ ] Envisager self-host des librairies critiques pour reduire dependance CDN.
76. [ ] Ajouter SRI aux scripts CDN si compatible.
77. [ ] Auditer accessibilite: labels formulaires, focus clavier, contrastes, textes alternatifs. Note partielle: login/training/reset password ont recu des labels/ARIA clavier supplementaires.
78. [x] Ajouter support `prefers-reduced-motion` pour les effets forts. Note: CSS global deja present dans `css/style.css`, animations/transitions reduites.
79. [ ] Verifier que tous les boutons importants sont utilisables au clavier. Note partielle: onglets stats convertis en boutons natifs; upload GPX deja utilisable clavier.
80. [x] Ajouter monitoring erreurs front: Sentry, LogRocket, ou solution simple equivalente. Note: solution locale `titanReportClientError`/`titanGetClientErrors` avec capture erreurs JS et promesses rejetees.
81. [x] Ajouter suivi performance: LCP, CLS, erreurs JS, temps chargement Supabase. Note: snapshot local load/DOM/LCP/CLS + monitoring erreurs JS; v80 ajoute statut client Supabase et healthcheck auth/progression via `titanTestSupabaseConnection()`.
82. [ ] Refactor progressif du JS inline vers fichiers modules. Note 2026-06-03: audit local trouve encore beaucoup de `onclick`, `innerHTML` et scripts inline; c'est le verrou principal pour retirer `unsafe-inline` de la CSP.
83. [x] Creer helpers UI reutilisables: modal, toast, empty state, error state, loading state. Note: toast deja present; `titanStateBlock`/`titanRenderStateBlock` ajoutent empty/loading/error/offline/success reutilisables.
84. [x] Creer helpers data reutilisables: fetch Supabase avec timeout, gestion erreurs, retry simple. Note: `titanWithTimeout` expose le timeout existant, `titanRetry` ajoute un retry simple.
85. [x] Documenter l'ordre de chargement des scripts dans `README_TITAN_OS.md`. Note: section v54 ajoutee avec ordre CSS/CDN/consent/noyau/modules.

## P3 - Produit, retention et contenu

86. [x] Ajouter objectifs hebdomadaires personnalises. Note: QG affiche et sauvegarde `weeklyGoalSessions` avec progression de la semaine courante.
87. [x] Ajouter calendrier d'entrainement. Note: `training.html` contient deja le planning hebdomadaire avec calendrier, objectifs par jour et suivi des seances realisees.
88. [x] Ajouter streaks avec protection anti-frustration. Note: `streak_shields` ajoute au state; une semaine manquee peut etre absorbee, puis la serie repart a 1 si l'absence depasse la protection.
89. [x] Ajouter missions quotidiennes. Note: QG affiche seance du jour, contexte utile et check recuperation.
90. [x] Ajouter missions hebdomadaires. Note: QG affiche objectif hebdo personnalise et variation de disciplines.
91. [x] Ajouter progression visible des succes avant de les debloquer. Note: `trophies.html` affiche deja progression, pourcentage et barre pour chaque succes verrouille.
92. [x] Ajouter resume post-seance: XP, credits, boss damage, loot, record, prochain objectif. Note: resume persistant `lastSessionSummary` cree apres chaque seance et affiche dans `notifications.html`.
93. [x] Ajouter comparaison semaine actuelle vs semaine precedente. Note: comparaison XP hebdo deja affichee sur QG et stats via `titanGetWeekComparison()`.
94. [x] Ajouter niveaux par discipline sportive. Note: cartes discipline affichent niveau calcule par XP sport + progression vers niveau suivant.
95. [x] Ajouter recommandations simples de recuperation selon charge recente. Note: `health.html` affiche un conseil selon score; QG utilise aussi le snapshot recovery charge recente.
96. [x] Rendre l'import GPX plus robuste: erreurs lisibles, preview carte, distance/duree/verif. Note: `training.html` valide GPX, affiche preview carte/stats et limite le nombre de points selon statut.
97. [x] Ajouter integration Strava en backlog, apres securite et base stable. Note: documente dans `PUBLIC_RELEASE_INTEGRATIONS_BACKLOG.md`.
98. [x] Ajouter integration Garmin/Apple Health/Google Fit en backlog long terme. Note: documente dans `PUBLIC_RELEASE_INTEGRATIONS_BACKLOG.md`.
99. [x] Ajouter classements optionnels entre amis, jamais publics par defaut. Note: classement local amis ajoute dans `social.html`, opt-in `privacy.friendRankings=false` par defaut et masque si stats invisibles.
100. [x] Ajouter guildes avec objectifs collectifs et recompenses de groupe. Note: guildes cloud via RPC Supabase (`titan_create_guild`, `titan_join_guild`, `titan_leave_guild`, `titan_set_guild_target`, `titan_get_my_guild`) avec objectif hebdo/progression; recompenses de groupe serveur et raids evolues a garder en evolution future.

## P3/P4 - Roadmap differenciation SPORT/RPG - ajoute 2026-05-19

Vision generale:
- TITAN OS doit eviter de devenir seulement "un journal de sport avec de l'XP" ou "un mini RPG pose au-dessus du sport".
- Le coeur distinctif doit etre une boucle unique: le sport reel produit des signaux, les signaux font evoluer une identite physique, l'identite physique modifie la campagne RPG, puis la campagne donne une raison concrete de revenir s'entrainer.
- La version gratuite doit rester complete pour suivre, comprendre et progresser. Elite doit apporter profondeur, confort, personnalisation, analyse avancee, automatisation et contenu premium, jamais des recompenses critiques injustes.
- Toute recompense critique liee a XP, credits, boss, succes, guildes et classement doit rester validee cote serveur pour les comptes connectes.

### Bloc SPORT - Systeme d'entrainement differenciant

101. [x] Creer le "Coach adaptatif TITAN" comme cerveau hebdomadaire.
    Note produit: fusionne coach adaptatif, objectifs par discipline, detection des desequilibres, radar physique, qualites physiques, analyse post-seance et carnet de signaux corporels. Le coach doit produire une recommandation simple: "aujourd'hui", "cette semaine", "a eviter", "prochain cap".
    Gratuit: recommandation quotidienne simple basee sur historique local/cloud, objectif hebdo, sport favori, derniere seance, charge recente et recuperation basique.
    Elite: plan multi-jours plus detaille, alternatives selon temps disponible, lecture plus fine des tendances, simulations de semaine et priorisation automatique des qualites faibles.
    Donnees minimales: `state.history`, `training_logs`, `weeklyGoalSessions`, `details.bio.rpe`, `details.bio.sleep`, `details.tags`, sport principal, niveaux discipline.
    UI cible: QG en premier, puis `training.html` pour pre-remplir/suggerer la mission du jour; `stats.html` pour expliquer pourquoi la recommandation existe.
    Garde-fous: ne jamais presenter ca comme diagnostic medical; utiliser une formulation type "signal", "tendance", "suggestion".
    Avancement 2026-05-19: V1 en place dans le QG via `titanGetCoachRecommendation()`; affiche mission du jour, signal recovery, comparaison semaine, cap suivant, action a eviter, radar compact et identite sportive. Snapshot sauvegarde dans `state.user.coachSnapshot` puis pousse via `titan_save_profile_state`.

102. [ ] Transformer les objectifs par discipline en vrais parcours sportifs.
    Note produit: chaque discipline doit avoir une identite de progression, pas seulement un total XP. Exemple running: regularite, endurance, allure, denivele; muscu: volume, force, constance, mobilite; football: minutes jouees, actions decisives, role; combat: rounds, technique, sparring, recuperation.
    Gratuit: 1 objectif actif par discipline pratiquee, progression visible, badges de paliers, prochain objectif clair.
    Elite: plusieurs objectifs simultanes par discipline, objectifs personnalises, historiques de cycles, recommandations par poste/role/type de seance.
    Donnees: enrichir `state.user.disciplineGoals` ou table future `user_discipline_goals`; utiliser `SPORTS_CONFIG.extraFields` pour les sports specifiques.
    UI: `disciplines.html` devient une page majeure de specialisation, avec cartes par sport, niveau discipline, prochain cap et dernier record.
    Critere de qualite: un utilisateur doit comprendre en moins de 5 secondes "quoi faire ensuite" pour son sport principal.
    Avancement 2026-05-19: fondation data ajoutee via `state.user.disciplineGoals` et `titanSyncDisciplineGoals()` apres seance. Reste a refondre `disciplines.html` pour en faire une vraie page de parcours.
    Avancement 2026-05-25: V77 ajoute le catalogue JO/JO d'hiver complet dans `js/titan_features.js`, `training.html`, `guide.html` et `sql/titan_olympic_sports_catalog_v77.sql`, avec aliases de recherche et metadata Supabase.

103. [x] Ajouter la detection des desequilibres d'entrainement.
    Note produit: differenciation forte face aux apps qui affichent seulement des totaux. TITAN doit dire: trop peu de renfo, trop peu de recuperation, trop monotone, cardio sans mobilite, trop d'intensite, aucune technique recente, etc.
    Gratuit: 3 alertes max, sobres, non culpabilisantes, basees sur 14/28 jours.
    Elite: analyse plus profonde avec historique 90 jours, seuils personnalisables, priorite automatique dans le coach adaptatif.
    Exemples de signaux: aucune seance `recovery` depuis 10 jours; meme famille sportive >80% sur 28 jours; RPE moyen >8 sur 3 seances; sommeil faible + charge haute; objectif hebdo atteint mais variete faible.
    UI: QG affiche seulement l'alerte principale; `stats.html` affiche le detail et l'historique.
    Garde-fous: afficher "risque de monotonie" ou "signal de fatigue possible", jamais "blessure" ou "surentrainement" comme certitude.
    Avancement 2026-05-19: V1 ajoutee via `titanDetectTrainingImbalances()`: recovery absente, monotonie famille sportive, intensite elevee, sommeil faible + charge, variete faible. QG affiche le signal principal; `stats.html` affiche 3 signaux gratuits et 6 signaux Elite.

104. [x] Creer le Radar Physique TITAN.
    Note produit: un radar central qui traduit le sport reel en qualites physiques lisibles: endurance, force, explosivite, mobilite, technique, regularite, recuperation, polyvalence.
    Gratuit: radar simple avec 6 axes et explication courte par axe.
    Elite: radar avance 8 axes, historique d'evolution, comparaison periode actuelle vs precedente, poids personnalise selon objectif.
    Calcul: mapper chaque sport/famille/tag/extra vers des qualites. Exemple trail = endurance + outdoor + resilience; muscu = force + regularite; yoga = mobilite + recuperation; combat = technique + explosivite.
    UI: `stats.html` et `profile.html`; resume post-seance indique quelles qualites ont progresse.
    RPG link: ce radar nourrit les classes hybrides et certaines faiblesses boss.
    Avancement 2026-05-19: V1 ajoutee avec 8 axes (`endurance`, `force`, `explosivite`, `mobilite`, `technique`, `regularite`, `recuperation`, `polyvalence`), radar compact QG, panneau complet `stats.html`, resume profil et contributions post-seance.

105. [x] Introduire la progression par qualites physiques.
    Note produit: une seance ne donne pas seulement XP global; elle alimente des jauges de qualites. Cela rend la progression plus personnelle et moins generique.
    Gratuit: qualites calculees apres chaque seance, visibles dans le resume et le profil.
    Elite: details des contributions par champ specifique, tendances par bloc d'entrainement, export/filtrage.
    Donnees: `state.user.physicalQualities` ou table future `user_physical_qualities`; garder une trace compacte pour eviter de gonfler `game_state`.
    Exemple: fractionne running -> endurance + explosivite; force lourde -> force; match football -> technique + explosivite + endurance; mobilite -> recuperation + mobilite.
    RPG link: debloque titres, classes hybrides, talents contextuels et bonus narratifs non pay-to-win.
    Avancement 2026-05-19: V1 ajoutee dans `afterActivityLogged()`: chaque seance alimente `state.user.physicalQualities`, avec notification des qualites gagnees et sauvegarde cloud.

106. [x] Refaire l'analyse post-seance comme un debrief tactique propre.
    Note produit: l'analyse doit devenir un moment satisfaisant apres validation. Elle doit expliquer ce que la seance a change, pas seulement afficher +XP.
    Gratuit: XP, credits, charge combat, qualites augmentees, record eventuel, alerte recuperation simple, prochain geste conseille.
    Elite: analyse detaillee par discipline, comparaison aux 5 dernieres seances similaires, lecture des extras, projection du prochain objectif.
    UI: modal courte apres seance + archive dans `notifications.html` / journal.
    Ton: precis, motivant, jamais infantilisant. Eviter les phrases generiques.
    Donnees serveur: si compte connecte, conserver un resume compact valide avec la seance ou recalculable depuis `training_logs`.
    Avancement 2026-05-19: V1 enrichie dans `titanBuildPostSessionSummary()`: ajoute qualites, classe, reputation et prochaine recommandation coach au resume post-seance.

107. [ ] Preparer les integrations sportives externes comme accelerateur, pas comme dependance.
    Note produit: Strava/Garmin/Apple Health/Google Fit doivent eviter la saisie manuelle, mais TITAN doit rester utile sans eux.
    Gratuit: import manuel GPX robuste + saisie rapide.
    Elite possible: sync automatique multi-source, historique plus long importe, reconciliation intelligente des doublons, enrichissement automatique des champs.
    Backlog technique: OAuth, mapping activites, anti-doublons, consentement clair, suppression/export RGPD, rate limit.
    UI: page Service/Integrations avec statut, derniere synchro, erreurs lisibles.
    Priorite: apres beta publique stable et apres verification RLS/recompenses serveur.

108. [x] Ajouter la competition personnelle "contre soi-meme".
    Note produit: se differencier sans devoir exposer les donnees sociales. Le rival principal est l'ancien soi: meme sport, meme format, meme route GPX, meme exercice ou meme discipline.
    Gratuit: defis simples "bats ta meilleure seance", "reviens au niveau de ta meilleure semaine", "ameliore ton record".
    Elite: fantomes avances par parcours GPX, comparaison segment maison, filtres par conditions similaires, duel contre soi a J-30/J-90.
    UI: `training.html` avant validation propose un rival; `stats.html` affiche les duels gagnes/perdus.
    RPG link: les rivaux fantomes peuvent devenir des ennemis narratifs non publics.
    Confidentialite: aucun classement public par defaut.
    Avancement 2026-05-25: V76 ajoute `titanBuildSelfCompetition()`, affiche le duel personnel dans `training.html` et `stats.html`, et l'integre au resume post-seance.

109. [x] Construire le carnet de signaux corporels.
    Note produit: garder les signaux qui expliquent les performances: douleur, energie, sommeil, humeur, motivation, stress, nutrition, note courte, contexte.
    Gratuit: champs simples limites, visibles dans historique et utilises par recovery/coach.
    Elite: tendances, correlations simples, filtres par discipline, alertes de coherence "tu performes mieux quand...".
    UI: biometrie repliee dans `training.html`, synthese dans `health.html`, rappel discret dans le debrief.
    Garde-fous: parler de signaux personnels, pas de diagnostic. Ajouter microcopy prudente dans `health.html`.
    Donnees: garder le format compact dans `details.bio` et limiter les notes selon statut deja en place.
    Avancement 2026-05-25: V76 archive les check-ins dans `state.user.recoveryCheckIns`, affiche un carnet corporel dans `health.html` et garde les conseils en vocabulaire prudent.

### Bloc RPG - Identite, combat, campagne et retention

110. [x] Creer les classes hybrides basees sur le comportement sportif reel.
    Note produit: l'utilisateur ne choisit pas seulement une classe; TITAN la deduit et la fait evoluer selon ses habitudes. Une classe doit raconter "comment tu t'entraines".
    Exemples de classes: Vanguard (force + regularite), Ghost Runner (endurance + constance), Iron Monk (mobilite + recuperation + discipline), Storm Striker (combat + explosivite), Pathfinder (outdoor + endurance), Architect (polyvalence + technique), Revenant (retour apres pause), Bastion (force + recuperation), Velocity Blade (running + explosivite).
    Gratuit: classe principale + 1 sous-classe visible, calculee automatiquement, avec titre et bonus cosmetique/identitaire.
    Elite: multi-classe, historique d'evolution, presets visuels, predilections avancees, analyse "comment changer de classe".
    RPG link: classes influencent les textes de mission, certaines options de talents, la narration et les faiblesses detectees, sans donner d'avantage injuste en classement.
    Donnees: derivees du Radar Physique et de l'historique; stockage minimal `state.user.archetype`.
    Avancement 2026-05-19: V1 ajoutee via `titanDeriveArchetype()`: classe principale, sous-classe, titre et score calcules depuis le radar et l'historique. Affichage QG + profil.

111. [ ] Repenser l'arbre de talents pour le rendre vraiment dingue et strategique.
    Note produit: sortir du simple "+5% XP". Les talents doivent creer des builds, des compromis et des effets visibles dans le sport/RPG.
    Structure proposee: 5 constellations de talents: Corps, Souffle, Technique, Recuperation, Commandement.
    Types de talents: passifs, declencheurs, mutations de mission, pactes avec contrepartie, talents de classe, talents de guilde.
    Exemples creatifs:
    - "Surcharge Controlee": donne plus de charge combat apres une seance intense, mais augmente l'alerte fatigue si utilise trop souvent.
    - "Architecte du Cycle": une semaine variee reduit le cout des missions boss.
    - "Serment du Repos": une vraie seance recovery charge un bouclier utilisable contre un boss.
    - "Lame Patiente": les seances techniques font moins de degats immediats mais appliquent une faiblesse persistante.
    - "Ancre": si l'utilisateur revient apres absence, premiere seance de retour donne une mission de reprise au lieu de casser la dynamique.
    Gratuit: arbre court, choix irreversibles seulement cosmetiques ou reset peu couteux, effets comprehensibles.
    Elite: branches avancees, builds sauvegardes, simulations de build, apparence d'arbre premium, mais pas de multiplicateur pay-to-win sur rewards critiques.
    Technique: les talents qui touchent XP/credits/degats doivent etre valides cote serveur ou bornes par RPC.
    Avancement 2026-05-19: preview strategique ajoutee dans `talents.html` avec 5 constellations (`Corps`, `Souffle`, `Technique`, `Recuperation`, `Commandement`) et talents a compromis. Reste a implementer le vrai graphe interactif, les choix persistants, les resets et la validation serveur des effets critiques.

112. [x] Designer les boss avec mecaniques credibles liees au sport requis.
    Note produit: chaque boss doit demander un type d'effort coherent avec son theme, pas juste plus de HP. Comme les boss apparaissent une seule fois dans la progression, chaque boss doit avoir une signature claire et memorisable.
    Regle: un boss = une mecanique principale + une faiblesse sportive + une contrainte de preparation + une recompense narrative.
    Exemples:
    - Boss lourd/forteresse: sensible a force + regularite; faibles degats si l'utilisateur ne fait que cardio; preparation: 2 seances force ou full body recentes.
    - Boss rapide/evasif: sensible a fractionne, sprint, explosivite; preparation: seance courte intense ou sport collectif.
    - Boss toxique/fatigue: sensible a recuperation et sommeil; attaquer apres surcharge reduit les gains; une seance recovery peut ouvrir une fenetre.
    - Boss tacticien: sensible a technique, precision, sports de combat/raquette; les notes de seance et extras techniques peuvent compter.
    - Boss endurance/colosse long: sensible a volume cardio/outdoor; demande constance sur plusieurs jours.
    Gratuit: faiblesses visibles, bonus de degats simple, conseil de preparation.
    Elite: briefing avance, prediction des meilleures missions preparatoires, lore et analyse post-victoire plus riches.
    Technique: ajouter `bosses.mechanics`, `weakness`, `prep_rules`, `reward_profile`; garder fallback local si DB absente; valider victoire/rewards via `titan_submit_combat_victory`.
    Avancement 2026-05-19: V1 ajoutee avec profils de boss (`forteresse`, `evasif`, `toxique`, `tacticien`, `colosse`) selon le boss/campagne, faiblesse sportive, preparation credible et modulation des degats dans `combatDamage()`. `adventure.html` affiche mecanique + preparation avant attaque.

113. [x] Ajouter le bestiaire statistique pour mobs et boss, en respectant le fait que les boss sont uniques.
    Note produit: les mobs peuvent avoir des stats de farm/rencontres; les boss doivent etre archives comme evenements uniques de campagne.
    Mobs: rencontres, victoires, rarete, faiblesse, sport utilise, degats moyens, derniere rencontre, meilleur coup, loot eventuel.
    Boss: statut unique "vaincu/non vaincu", date de victoire, niveau, preparation utilisee, sport decisif, degats totaux, titre obtenu, entree narrative.
    Gratuit: bestiaire complet local/cloud basique, stats principales et lore court.
    Elite: filtres avances, timeline visuelle, comparaison de strategie, cartes de collection premium cosmetiques.
    UI: `trophies.html` ou future page Bestiaire; `disciplines.html` peut afficher "ennemis vaincus par cette discipline".
    Technique: eviter de compter plusieurs fois un boss deja vaincu; cle stable `BOSS:id:level` ou `campaign_boss_id`; mobs peuvent utiliser compteurs agreges.
    Avancement 2026-05-19: fondation data ajoutee dans `registerCombatVictory()`: mobs agreges avec rencontres/victoires/degats/sport/loot, boss archives avec cle unique `BOSS_<id>_LV<level>`, statut vaincu, niveau campagne, mecanique, sport decisif et recompense. Reste UI Bestiaire dediee + filtres Elite.
    Avancement 2026-05-25: V76 affiche aussi les boss archives dans `trophies.html` avec carte unique, faiblesse, mecanique et sport decisif.

114. [x] Creer un systeme de reputation joueur.
    Note produit: au-dela du niveau, TITAN doit nommer la maniere dont l'utilisateur progresse. La reputation doit se meriter par style sportif, regularite et choix RPG.
    Exemples: Regulier, Hybride, Sprinter, Endurant, Technicien, Recuperateur, Chasseur Alpha, Pilier de Guilde, Revenant, Monosport, Explorateur.
    Gratuit: reputation principale + 2 traits secondaires, visibles sur profil et QG.
    Elite: historique, badges visuels, cartes de profil, titres combines.
    Calcul: derive du Radar Physique, classes hybrides, bestiaire, guildes et signaux corporels.
    Social: visible seulement selon reglages privacy.
    Avancement 2026-05-19: V1 ajoutee via `titanDeriveReputation()`: reputation principale + traits secondaires, derives du radar, de l'archetype, des boss vaincus, de la recuperation et de la guilde. Affichage QG + profil.

115. [ ] Repenser les guild raids comme objectifs sportifs collectifs credibles.
    Note produit: les guildes ne doivent pas etre juste un chat + barre. Un raid doit transformer plusieurs efforts reels en progression collective.
    Exemples de raids: total minutes cardio, 20 seances collectives, 5 disciplines differentes, boss faible a la recuperation, raid "reprise" ou chaque membre fait une petite mission.
    Gratuit: rejoindre/creer guilde, objectif hebdo collectif, contribution individuelle, boss collectif simple.
    Elite: creation de raids personnalises, analytics guilde, roles tactiques, archives de saisons, themes visuels.
    Anti-triche: contributions serveur via `training_logs` valides; limiter gains; pas de recompense critique si RPC manquante.
    Retention: rappels doux et objectifs partages, jamais spam.
    Avancement 2026-05-19: fondation sociale/guilde cloud en place (creation, rejoindre, quitter, objectif hebdo, chat guilde, code ami fonctionnel). Reste a faire le vrai systeme de raid collectif base sur `training_logs` valides et rewards serveur.

116. [x] Valoriser la recuperation comme gameplay, tout en gardant le flux de connexion.
    Note produit: une journee sans entrainement ne doit pas etre une journee morte. Le repos peut devenir une action de jeu: scan, bouclier, preparation, analyse, rituel court.
    Objectif flux: donner une raison de se connecter meme les jours off, sans pousser a surcharger.
    Gratuit: check-in recovery en 20 secondes: sommeil, energie, douleur, motivation; donne un petit bouclier/streak shield ou prepare la prochaine mission sans XP abusif.
    Elite: rituels recovery avances, recommandations plus fines, historique des jours off, missions de deload, contenu narratif special.
    RPG link: certains boss exigent une preparation recovery; certains talents transforment la recuperation en defense ou en fenetre de faiblesse.
    Montee de garde-fou: pas de farm infini via check-in; cooldown quotidien; validation serveur pour recompenses.
    Avancement 2026-05-19: V1 ajoutee dans le QG: scan recovery quotidien sommeil/energie/douleur/motivation, entree journal, sauvegarde cloud et protection de streak bornee a une fois par jour.

117. [x] Creer le Journal d'Aventure automatique, propre et original.
    Note produit: transformer l'historique en histoire personnelle, sans texte generique ridicule. Le journal doit relier sport, boss, records, fatigue, retour apres absence, guilde et discipline.
    Format: entrees courtes, elegantes, contextuelles. Exemple: "Apres deux missions d'endurance et une seance de mobilite, le secteur Ferrite a cede. Le signal dominant: constance."
    Gratuit: journal recent auto-genere, 1 entree par evenement important: record, boss, retour, nouvelle classe, objectif semaine atteint.
    Elite: journal long, filtres par saison, export visuel, variantes de ton, chapitres de campagne, resume mensuel.
    Sources: `lastSessionSummary`, `adventureLog`, `records`, `disciplineBadges`, `bossLevel`, guild raids, recovery check-ins.
    Qualite: bannir les phrases creuses; utiliser templates contextualises et limites; jamais inventer une performance non presente dans l'historique.
    UI: `journal.html` devient une vraie page identitaire, pas seulement un historique.
    Avancement 2026-05-19: V1 ajoutee via `titanAppendAdventureJournalEntry()` et `syncPersonalJournal()`: les seances, changements de classe/reputation, victoires et check-ins recovery alimentent `state.user.adventureJournal`, visible dans `journal.html` avec filtre "Journal agent".

118. [ ] Garder le loot comme priorite basse pour une version suivante.
    Note produit: loot utile et cosmetique, mais ne pas l'attaquer avant coach, talents, boss, classes, bestiaire et journal.
    Gratuit futur: petits objets cosmetiques, titres, reliques de boss, fragments de lore.
    Elite futur: skins premium, effets visuels, cartes de collection, themes de profil.
    Interdit: loot qui donne un avantage sportif injuste, accelerateur XP agressif ou pay-to-win en raid/classement.
    Pre-requis: economie serveur robuste, inventaire propre, boutique stable, moderation visuelle.

### Vague 2 SPORT retenue - ajoute 2026-05-19

119. [x] Mode "Retour apres absence".
    Note produit: si un joueur revient apres plusieurs jours, TITAN ne doit pas le punir ni afficher un mur de retard. Le systeme doit transformer le retour en mission de reprise claire, douce et valorisante.
    Gratuit: detection d'absence, message de retour, proposition d'une petite seance adaptee, objectif de reprise, journal d'aventure "retour".
    Elite: reprise personnalisee selon historique long, sport dominant, fatigue declaree et objectif de cycle.
    Donnees Supabase: stocker `last_active_at`, dernier check-in, dernier entrainement, et evenement de reprise dans `game_state` ou future table `user_return_events`.
    UI: QG d'abord; training peut proposer directement une mission "reprise".
    Garde-fou: ne jamais dire que la serie est "perdue" comme message principal; afficher "reprendre proprement".
    Avancement 2026-05-25: V76 expose le retour via coach/training/stats et conserve l'approche "retour propre" sans punition.

120. [x] Detection de plateau sportif.
    Note produit: reperer quand un joueur tourne en rond: meme volume, meme intensite, meme score, pas de nouveau record contextuel, meme famille sportive trop longtemps.
    Gratuit: signal simple "plateau possible" + 1 suggestion: recuperer, varier, augmenter legerement, travailler technique.
    Elite: analyse par discipline, fenetre 30/60/90 jours, detection de plateau par qualite physique, proposition de micro-cycle.
    Donnees Supabase: calculer depuis `training_logs`, `state.history`, records et `physicalQualities`; garder les seuils serveur si cela influence rewards ou missions.
    UI: `stats.html` pour le detail, QG pour le signal principal.
    Garde-fou: parler de tendance, jamais de diagnostic.
    Avancement 2026-05-25: V76 ajoute `titanDetectPlateau()`, signal visible dans `training.html`, `stats.html` et resume post-seance.

121. [x] Retour au calme guide apres seance.
    Note produit: apres une seance intense, proposer une action courte qui aide a cloturer: respiration, marche, mobilite, hydratation, note de sensation.
    Gratuit: 1 routine courte selon sport/famille/intensite; sauvegarde d'un check "fait/passe".
    Elite: routines plus fines par discipline, historique des retours au calme, recommandations selon fatigue.
    Donnees Supabase: `training_logs.details.cooldown`, `game_state.user.recoveryCheckIns`; future table possible `user_cooldown_logs`.
    UI: debrief post-seance, jamais avant validation pour ne pas bloquer la saisie.
    Garde-fou: pas de recompense XP abusive; eventuellement un signal recovery ou journal.
    Avancement 2026-05-25: V76 ajoute `titanBuildCooldownGuide()`, affiche la routine dans Sport/Progres et la remonte dans le centre de notifications.

122. [x] Records contextualises.
    Note produit: sortir du record brut unique. Valoriser "meilleur effort depuis 30 jours", "meilleure seance courte", "meilleure semaine de regularite", "meilleur retour apres absence", "meilleur effort recovery".
    Gratuit: records contextuels principaux, visibles dans debrief, stats et journal.
    Elite: filtres avances par periode, discipline, format, condition de fatigue, comparaison aux seances similaires.
    Donnees Supabase: stocker les records importants dans `game_state.user.records` ou future table `user_records`; les records qui donnent recompense doivent etre valides cote RPC.
    UI: `stats.html` et resume post-seance; eviter une liste interminable.
    Garde-fou: un record doit expliquer pourquoi il compte en une phrase.
    Avancement 2026-05-25: V76 ajoute meilleur effort 30j, seance courte, retour, semaine reguliere et recovery via `titanBuildContextualRecords()`.

123. [x] Score de fraicheur.
    Note produit: un score simple pour savoir si le joueur est plutot pret, neutre ou a menager. Il croise sommeil, energie, douleur, motivation, charge recente et recovery.
    Gratuit: score lisible + couleur prudente + recommandation non medicale.
    Elite: tendance, facteurs explicatifs plus fins, correlation avec performances.
    Donnees Supabase: `dailyHealth`, `recoveryCheckIns`, `training_logs.details.bio`, charge 7/14 jours.
    UI: QG et health; ne pas transformer ca en tableau medical.
    Garde-fou: vocabulaire "signal", "fraicheur", "prudence", jamais diagnostic.
    Avancement 2026-05-25: V76 rend la fraicheur plus visible dans la lecture coach et le panneau personnel Progres.

124. [x] Calendrier de charge visuel.
    Note produit: afficher la semaine comme une carte de charge: leger, normal, intense, recovery, repos. Le joueur doit comprendre son rythme d'un coup d'oeil.
    Gratuit: vue semaine simple, code couleur lisible, lien vers les seances.
    Elite: vue mois, cycles, comparaison semaine precedente, projection du plan.
    Donnees Supabase: derive de `training_logs`, pas besoin de dupliquer sauf cache compact dans `game_state`.
    UI: QG compact + `stats.html` detail; mobile prioritaire avec 7 cases stables.
    Garde-fou: pas de palette agressive ou confuse; contraste AA minimum.
    Avancement 2026-05-25: V76 affiche le calendrier de charge 7 jours dans `stats.html` avec cases stables.

125. [x] Badges de regularite intelligente.
    Note produit: recompenser la constance sans pousser a s'entrainer tous les jours. Le repos coherent peut compter dans la regularite si le joueur suit un cycle propre.
    Gratuit: badges pour reprise, constance douce, semaine equilibree, recovery respectee, variete.
    Elite: badges de cycle, badges rares cosmetiques, historique visuel.
    Donnees Supabase: succes/rewards via `titan_claim_achievement`; badges cosmetiques via inventaire serveur si recompense.
    UI: profil, trophies, journal; ne pas spammer le QG.
    Garde-fou: aucune incitation a ignorer la fatigue pour garder un badge.
    Avancement 2026-05-25: V76 ajoute `titanBuildRegularityBadges()` et remonte les signaux dans Progres et le resume post-seance.

126. [ ] Elite - Plan multi-jours adaptatif.
    Note produit: Elite doit apporter une vraie profondeur d'accompagnement: semaine proposee avec alternatives selon temps disponible, fraicheur, sport principal et objectif.
    Gratuit: recommandation du jour et objectif hebdo restent accessibles.
    Elite: planning 3/5/7 jours, alternatives 10/20/45 min, deload, priorite aux qualites faibles, modification selon check-in.
    Donnees Supabase: future table `user_training_plans`; les plans doivent etre recalculables et synchronises cross-device.
    UI: QG resume, training detail; jamais un mur de planning.
    Garde-fou: pas de promesse medicale, pas de surcharge automatique.

127. [ ] Elite - Analyse des seances similaires.
    Note produit: comparer une seance aux 5/10 dernieres seances vraiment comparables: meme sport, format proche, duree/distance/charge proches.
    Gratuit: record contextuel simple.
    Elite: comparaison detaillee, tendance, meilleur contexte, progression par qualite.
    Donnees Supabase: calcul depuis `training_logs`; garder des index si requetes frequentes.
    UI: debrief post-seance et stats; afficher 3 insights max au debut.
    Garde-fou: ne pas noyer le joueur dans les chiffres.

128. [ ] Elite - Rapport mensuel premium.
    Note produit: un recap propre et partageable: progression, fraicheur, meilleure seance, qualites fortes/faibles, classe, reputation, boss, guilde, prochain cycle.
    Gratuit: resume mensuel court possible.
    Elite: rapport complet, export visuel, archive mensuelle, comparaison au mois precedent.
    Donnees Supabase: future table `user_monthly_reports` ou generation a la demande depuis `training_logs`, `combat_logs`, `game_state`.
    UI: `stats.html` / `journal.html`; format clair, sections repliees.
    Garde-fou: rapport utile et lisible, pas une page de statistiques brute.

### Vague 2 RPG retenue - ajoute 2026-05-19

129. [ ] Creer les "Metiers de campagne" TITAN.
    Note produit: remplacer l'idee de serment par un metier dans le lore: une fonction que le joueur incarne dans le monde TITAN selon sa maniere de s'entrainer. Le metier doit nourrir l'imaginaire sans casser le lien sport reel.
    Exemples de metiers:
    - Cartographe d'effort: endurance, outdoor, exploration, progression longue.
    - Forgeron du cycle: force, regularite, construction lente, discipline.
    - Veilleur de recuperation: recovery, sommeil, retour au calme, protection de streak.
    - Architecte de cadence: polyvalence, planification, semaine equilibree.
    - Ingenieur d'impact: explosivite, sprint, combat, intensite courte.
    - Chroniqueur du seuil: records contextualises, plateaux, journal, analyse.
    - Stratege de relais: contribution guilde, roles collectifs, objectifs partages.
    Gratuit: 1 metier principal derive du comportement + 1 orientation secondaire.
    Elite: historique d'evolution, variantes visuelles, chemins de metier avances, conseils pour changer de metier.
    Donnees Supabase: `state.user.campaignProfession` via `titan_save_profile_state`; future table `user_campaign_professions` si effets persistants.
    UI: profil + QG + journal; expliquer en une phrase "ce que ce metier dit de toi".
    Garde-fou: le metier donne identite, missions et narration; pas de multiplicateur pay-to-win.

130. [ ] Ennemis lies aux desequilibres sportifs.
    Note produit: certains ennemis doivent emerger des failles du joueur: monotonie, recovery oubliee, force sans mobilite, cardio sans technique, intensite sans sommeil.
    Gratuit: ennemis contextuels simples avec conseil clair pour les affaiblir.
    Elite: analyse plus fine, ennemis rares lies aux tendances 90 jours, briefing avance.
    Donnees Supabase: generer depuis `training_logs`, `physicalQualities`, `recoveryCheckIns`; si rewards, validation via `titan_submit_combat_victory`.
    UI: aventure affiche "pourquoi cet ennemi apparait" et "comment l'affaiblir".
    Garde-fou: ne pas culpabiliser; l'ennemi represente un signal, pas une faute.

131. [ ] Titres evolutifs.
    Note produit: les titres ne doivent pas etre de simples badges fixes. Ils evoluent selon les habitudes: retour, regularite, boss, recovery, guilde, records, metier.
    Exemples: Revenant, Pilier du Cycle, Lame Stable, Cartographe du Seuil, Veilleur des Jours Off, Architecte de Cadence.
    Gratuit: titres principaux gagnables par comportement.
    Elite: titres combines, cadres visuels, historique d'evolution, mise en avant profil.
    Donnees Supabase: claims via `titan_claim_achievement` si recompense; etat actif via `titan_save_profile_state`.
    UI: profil, journal, cartes boss; pas plus de 1 titre actif mis en avant.
    Garde-fou: titres visibles selon privacy.

132. [ ] Cartes de boss uniques.
    Note produit: chaque boss vaincu doit produire une carte souvenir unique: date, niveau, sport decisif, preparation, mecanique, degats, titre, phrase narrative.
    Gratuit: carte simple archivee.
    Elite: variantes visuelles premium, export, timeline, filtres.
    Donnees Supabase: `combat_logs`, `user_bestiary`, `game_state.game.bestiary`; future table `user_boss_cards`.
    UI: bestiaire / trophies / journal; une carte par boss, jamais de doublon.
    Garde-fou: les boss apparaissent une seule fois; la carte est une archive, pas un farm.

133. [ ] Compagnon tactique non-combatif.
    Note produit: un assistant de lore qui commente les tendances, explique le coach, relie sport et RPG, et aide le joueur a comprendre sans ajouter un mur de texte.
    Gratuit: commentaire court sur QG, debrief et journal.
    Elite: ton/personnalite visuelle, archives, briefing plus fin, mais pas de conseil medical.
    Donnees Supabase: preferences de ton et historique court via `game_state`; pas de donnees sensibles inutiles.
    UI: une phrase utile au bon endroit, jamais un chat envahissant.
    Garde-fou: toujours expliquer l'action suivante; ne pas masquer les infos importantes derriere le compagnon.

134. [ ] Boss a phases a partir du 5e boss.
    Note produit: ne pas complexifier les premiers boss. A partir du boss 5, introduire des phases progressives; chaque phase demande une qualite ou une preparation differente.
    Boss 1-4: mecanique unique claire.
    Boss 5-6: 2 phases simples.
    Boss 7-9: 2/3 phases avec contrainte de preparation.
    Boss 10+: phases plus complexes, adaptees au profil du joueur.
    Gratuit: phases visibles, conseils de preparation, combat comprehensible.
    Elite: briefing avance et analyse post-victoire detaillee.
    Donnees Supabase: schema futur `boss_phase_rules`, progression et victoire via RPC combat; le front ne valide jamais seul rewards/credits.
    UI: afficher une phase a la fois avec objectif clair; pas de tableau illisible.
    Garde-fou: complexite progressive, pas de surprise punitive.

135. [ ] Roles sportifs de guilde.
    Note produit: chaque membre peut avoir un role derive de ses qualites: soutien recovery, finisher explosif, pilier force, eclaireur endurance, tacticien technique, architecte polyvalent.
    Gratuit: role automatique visible en guilde, contribution individuelle, objectif collectif.
    Elite: roles tactiques avances, analytics guilde, historique saison, personnalisation visuelle.
    Donnees Supabase: `guild_members.role`, `training_logs`, `physicalQualities`; les contributions de raid doivent venir de logs valides serveur.
    UI: social/guilde + raids; montrer "ce que tu apportes" en une ligne.
    Garde-fou: ne pas exclure les joueurs faibles; tout role doit etre utile.

136. [ ] Boss 10 - Duel contre soi-meme.
    Note produit: le boss 10 doit etre un moment signature. Il analyse les forces dominantes du joueur et devient resistant, voire invincible, aux sports que le joueur spamme. Exemple: si le joueur ne fait presque que de la force, le boss absorbe les degats force et demande endurance, mobilite, recovery ou technique pour ouvrir une faille.
    Nom de travail: "L'Archive Inverse".
    Regle: le boss lit le radar physique, les familles sportives 30/60 jours, les desequilibres et le metier de campagne. Il bloque la qualite dominante et revele 2 axes faibles a travailler.
    Gratuit: duel accessible a tous, faiblesses visibles, progression claire.
    Elite: briefing avance, simulation des meilleures preparations, carte boss premium apres victoire.
    Donnees Supabase: calcul profil depuis `training_logs`, `physicalQualities`, `titanDetectTrainingImbalances`; victoire/reward via `titan_submit_combat_victory`; snapshot boss dans `game_state` pour cross-device.
    UI: expliquer "ton ancienne strategie ne suffit plus" sans frustrer; afficher clairement les sports qui ouvrent la faille.
    Garde-fou: pas de mur infranchissable permanent; le boss est invincible a l'axe dominant seulement tant que le joueur n'a pas cree une faille credible ailleurs.

### Garde-fous UX, CSS, mobile et Supabase - ajoute 2026-05-19

137. [ ] Refaire une passe couleur/CSS globale.
    Note produit: certaines couleurs sont faibles ou incoherentes; il faut stabiliser une vraie direction visuelle sans rendre l'app monotone ou agressive.
    Actions: auditer `css/style.css` et styles inline; harmoniser tokens couleur; verifier contrastes; corriger boutons/cartes/alertes qui font "bof"; eviter les palettes trop proches; clarifier couleurs gratuit/Elite/warning/success.
    Mobile: verifier que les couleurs restent lisibles dehors/luminosite forte.
    Garde-fou: ne pas refaire tout le design en un seul theme uniforme; garder une hierarchie claire.
    Avancement 2026-05-19: V65 ajoute une couche globale `CLARITY / PUBLIC BETA ORGANISATION` dans `css/style.css`, police `Sora` + `Rajdhani`, palette moins agressive, rayons 8px, boutons 44px, focus lisible et mobile plus stable. Reste audit visuel page par page.

138. [ ] QA mobile prioritaire et systematique.
    Note produit: toute nouvelle fonctionnalite doit etre pensee mobile avant desktop. Le site est dense; mobile ne doit jamais devenir une pile de cartes illisible.
    Tests minimum: 360px, 390px, 430px, tablette, desktop; pas de scroll horizontal; bottom nav stable; boutons 44px min; textes sans chevauchement; modales utilisables au clavier/tactile.
    Pages critiques: QG, training, adventure, stats, profile, social, chat, journal, talents, boutique.
    Garde-fou: aucune feature ne passe "done" sans capture ou verification mobile.
    Avancement 2026-05-19: V65 ajoute des contraintes responsive globales, drawer simplifie, modales full-width mobile, chat composer en grille et encart economie QG empile en mobile. Reste verification navigateur/captures reelles.

139. [x] Architecture d'information beton.
    Note produit: TITAN devient complexe; il faut que chaque joueur sache ou il est, a quoi sert la page, quelle est l'action principale, et ou retrouver les fonctions secondaires.
    Actions: definir 5 hubs max visibles, sous-modules ranges, fil d'Ariane leger ou titre de contexte, "prochaine action" claire sur chaque page.
    Regle: 1 action principale par ecran, 2 actions secondaires max visibles; le reste en details repliees.
    Garde-fou: ne supprimer aucun contenu utile, mais eviter le paquet d'informations incomprehensible.
    Avancement 2026-05-19: navigation renomme en langage joueur (`QG`, `SPORT`, `AVENTURE`, `PROGRES`, `PROFIL`), secondaires ranges en `MODULES`, `SUIVI`, `BUILD`; drawer mobile titre "Tous les modules"; le QG expose les limites economie au lieu de les cacher.
    Avancement 2026-05-20: `index.html` separe maintenant marketing, apercu invite, dashboard connecte et documentation. Le dashboard XP/credits/missions est masque pour les visiteurs non connectes; les ressources Guide/Premiers pas/Transmissions/Installer sont deplacees en scroll profond; modules secondaires du QG groupes en tiroir.

140. [ ] Guide premier lancement complet mais rapide.
    Note produit: au premier lancement, expliquer la boucle: sport reel -> XP/credits serveur -> coach -> radar -> boss -> journal -> social/guilde -> Elite.
    Gratuit: parcours de 3 a 5 etapes, choix sport principal, premiere mission, explication cloud/Supabase, rappel privacy.
    Elite: expliquer clairement ce qui est bonus avance sans donner l'impression que le gratuit est incomplet.
    Donnees Supabase: etat onboarding sauvegarde via `titan_save_profile_state`, pas seulement localStorage.
    UI: skippable, reprenable depuis Guide/Service, pas de popups repetitives.
    Avancement 2026-05-19: guide premier lancement passe a 6 repères courts (QG, Sport, Aventure, Progres, Modules, Cloud) et sauvegarde maintenant `firstRunGuideSeen` avec `forceCloud: true` pour les comptes connectes. Reste bouton explicite "revoir le guide" depuis Service.

141. [x] Carte des fonctionnalites accessible.
    Note produit: aucune fonctionnalite importante ne doit etre cachee. Le joueur doit pouvoir voir ce qui existe, ce qui est gratuit, ce qui est Elite, et ou y acceder.
    Actions: page ou panneau "Modules TITAN": Sport, Coach, Aventure, Stats, Profil, Social, Guilde, Journal, Talents, Boutique, Sante.
    Statuts: actif, a debloquer, Elite, bientot, necessite connexion.
    Donnees Supabase: statut progression/deblocage synchronise via `game_state`.
    Garde-fou: cette carte oriente; elle ne doit pas devenir une page marketing.
    Avancement 2026-05-19: la navigation secondaire et le guide rendent les modules moins caches, mais la vraie carte "Modules TITAN" reste a construire.
    Avancement 2026-05-20: `service.html` contient une carte des fonctionnalites avec statuts actif/Elite/bientot: QG, Sport OS, Aventure, Progression, Social/guildes, Boutique, Elite, Bestiaire et Beta publique.

142. [ ] Budget de charge cognitive par page.
    Note produit: plus on ajoute de systemes, plus il faut limiter ce qui est affiche simultanement.
    Regles: afficher le signal principal, puis details repliees; limiter les jauges concurrentes; ne pas mettre coach + radar + boss + guildes + boutique dans le meme bloc.
    UI: cartes simples, tabs quand necessaire, sections nommees clairement, microcopy courte.
    Garde-fou: un joueur doit comprendre la page en moins de 5 secondes.
    Avancement 2026-05-19: debut de reduction du bruit via labels courts, CSS plus calme, encarts economie compacts et briefing chat concis. Reste a traiter chaque page riche une par une.
    Avancement 2026-05-20: index applique la regle une audience par etat: visiteur = hero/features/CTA/aperçu statique; connecte = QG applicatif; FAQ/guide = scroll profond ou pages dediees.

143. [ ] Supabase-first pour toute nouvelle feature.
    Note produit: toute feature qui touche progression, social, guilde, journal, boss, talents, rewards, onboarding ou preference doit avoir son chemin Supabase avant d'etre consideree finie.
    Regle technique: migration SQL + RLS + RPC si ecriture sensible + grants explicites + test authenticated/anon + fallback local uniquement cache/offline non critique.
    Interdit: reward critique valide uniquement dans le navigateur; guilde/chat/amis uniquement localStorage; Elite decide par `game_state` seul.
    QA: tester cross-device: changer de navigateur/appareil doit conserver etat, progression, metier, journal, guilde et preferences.
    Avancement 2026-05-20: migrations v65/v66 appliquees dans Supabase et objets critiques verifies. Front evite les inserts directs chat/guilde connectes; boutique, messages, creation guilde et plafonds hebdo passent par RPC/colonnes serveur. Reste a tester en compte reel cross-device avant de cocher "verifie pour chaque feature".

144. [ ] Etats vides, loading et erreurs lisibles partout.
    Note produit: avec Supabase-first, il faut des etats propres quand la base est lente, indisponible, vide ou refuse une action.
    Actions: standardiser empty/loading/error/success sur toutes les pages; messages courts; bouton action suivant; aucun message SQL brut cote joueur.
    Mobile: les etats doivent tenir sans pousser l'action principale hors ecran.
    Garde-fou: le joueur doit comprendre si le probleme vient de connexion, droits, compte invite, suspension ou donnees vides.

145. [ ] Checklist "feature publique" obligatoire.
    Note produit: avant de marquer une nouveaute done, passer une checklist unique.
    Checklist: valeur joueur claire, emplacement logique, statut gratuit/Elite clair, migration Supabase si besoin, RLS verifiee, anon bloque si sensible, test compte reel, test cross-device, test mobile, etat vide/loading/error, texte comprehensible, pas de doublon avec module existant.
    Garde-fou: aucune nouvelle couche Sport/RPG ne doit rendre l'app plus confuse.

### Economie globale et boutique - ajoute 2026-05-20

146. [x] Modele economie global v66.
    Avancement: `TITAN_ECONOMY` fixe une boucle longue: plafonds hebdo XP/credits, bonus Elite limite a +20%, creation guilde couteuse, messages payants, paris bornes, charges combat limitees et primes pub plafonnees.
    Gain lisibilite: les regles importantes sont affichees dans le QG et la boutique au lieu d'etre cachees dans le code.
    Garde-fou: Elite augmente l'analyse, les limites et les cosmetiques; pas de multiplicateur de puissance cache.

147. [x] Boutique polie et regulee.
    Avancement: panneau economie boutique, cartes plus compactes mobile, details par objet, notes `Regule`, cooldowns visibles, cosmetiques Elite clairement non pay-to-win.
    Gain lisibilite: le joueur voit pourquoi un objet est limite avant de cliquer.
    Garde-fou: les charges combat sont limitees globalement a 2/semaine, pas par objet; les pubs restent volontaires.

148. [x] RPC boutique v66 preparee.
    Avancement: `sql/titan_shop_economy_balance_v66.sql` remplace `titan_purchase_shop_item(...)` avec prix normalises, cooldowns serveur, limite globale charges, limites pubs, historique cout/reward, refus Elite et grants explicites.
    Statut: applique a Supabase le 2026-05-20; a verifier avec compte reel apres redeploy.

149. [x] Hotfix grants RPC economie v66.
    Avancement: `sql/titan_economy_rpc_anon_revoke_v66.sql` retire explicitement `EXECUTE` a `anon`/`public` sur les RPC sensibles economie, chat, guilde, boutique et rewards.
    Verification: `anon_can_chat=false`, `anon_can_economy_status=false`, `anon_can_purchase=false`, `anon_shop_history_select=false`; audit RLS sans ligne `fix_*` / `review_*`.

### Decoupage conseille des sprints produit

Sprint Produit A - Sport OS fondation:
- [x] Coach adaptatif simple sur QG. V66: conseil du jour, raison, prudence, prochain cap et GO.
- [x] Objectifs par discipline v1. V66: objectifs derives de l'historique sport et visibles sans ouvrir la biometrie.
- [x] Radar Physique v1. V66: radar utilise pour classe, metier, role guilde, fraicheur et boss miroir.
- [x] Debrief post-seance enrichi. V66: XP, credits, signaux, records, badges, titres, prochain objectif.
- [x] Carnet de signaux corporels propre et prudent. V66: recovery/check-ins prudents, sans promesse medicale.
- [x] Retour apres absence. V66: detection apres absence et reprise douce proposee.
- [x] Score de fraicheur. V66: statut PRET/STABLE/PRUDENT/RECUPERATION.
- [x] Calendrier de charge visuel. V66: mini calendrier 7 jours repos/leger/normal/intense.

Sprint Produit B - RPG identitaire:
- [x] Classes hybrides v1 derivees du radar. V66: archetype + sous-classe recalibres.
- [x] Reputation joueur. V66: traits selon regularite, boss, recovery, guilde et profil sportif.
- [x] Bestiaire statistique mobs/boss. V66: mobs statistiques, boss uniques archives.
- [x] Boss mechanics v1 avec faiblesses credibles. V66: mecanique liee force/cardio/recovery/technique/outdoor.
- [x] Journal d'aventure automatique v1. V66: classe, metier, records et alertes coach generent des entrees.
- [x] Metiers de campagne v1. V66: 7 metiers de lore derives du radar et de l'historique.
- [x] Titres evolutifs. V66: titres par comportement, records, variete et boss.
- [x] Cartes boss uniques. V66: carte souvenir par boss avec niveau, faiblesse, mecanique et detail premium.

Sprint Produit C - Profondeur/Elite:
- [x] Coach adaptatif avance Elite. V66: contexte supplementaire sans noyer le QG.
- [x] Plan multi-jours adaptatif Elite. V66: plan J+1 a J+5 selon radar/fraicheur/alertes.
- [x] Analyse des seances similaires Elite. V66: `personalRivals` compare des traces proches.
- [x] Rapport mensuel Elite. V66: `monthlyReports` archive mois, XP, meilleure seance, classe, reputation.
- [ ] Talents profonds v1 avec serveur pour effets critiques.
- [x] Competition personnelle avancee. V66: rivalite contre anciennes traces + Boss 10 miroir.
- [ ] Guild raids serveur.
- [ ] Integrations sportives externes en beta privee.

Sprint Produit D - Version suivante:
- [x] Loot cosmetique et reliques. V66: reliques visuelles de boss, limite gratuite/Elite.
- [x] Saisons de campagne. V66: cycle Ferrite suit la progression boss.
- [x] Cartes bestiaire premium. V66: detail premium sur cartes boss.
- [x] Themes visuels et effets non pay-to-win. V66: cosmetiques Elite sans bonus de puissance.
- [x] Boss a phases a partir du boss 5. V66: phases progressives visibles en combat.
- [x] Boss 10 duel contre soi-meme. V66: L'Archive Inverse resiste au point fort dominant.
- [x] Roles sportifs de guilde avances. V66: Ancre, Eclaireur, Briseur, Cadenceur.

Sprint Produit Transversal - UX publique:
- [x] Passe couleur/CSS.
- [ ] QA mobile complete.
- [x] Guide premier lancement.
- [x] Carte des fonctionnalites.
- [x] Architecture d'information et charge cognitive.
- [ ] Supabase-first verifie pour chaque feature.

## Selection recommandee pour le prochain sprint

## Sprint audit general / public-ready - ajoute 2026-06-03

P0 - Securite, donnees et paiement:
1. [x] Traiter les advisors Supabase security: allowlist v87 archivee dans `SUPABASE_SECURITY_REVIEW_V87.md`; 25 RPC authentifiees verifiees (auth.uid, search_path, grants) et helpers internes/admin fermes.
2. [ ] Activer la protection Supabase Auth contre les mots de passe compromis dans le dashboard.
3. [ ] Tester un compte reel complet: inscription, confirmation email, login, reset, premiere seance cloud, achat/checkout Paddle test, suspension, export, suppression compte.
4. [ ] Verifier le webhook Paddle en environnement reel/sandbox: signature, idempotence, product/price allowlist, renouvellement, annulation, impaye, remboursement, logs sans fuite inutile de `user_id`.
5. [ ] Valider les reglages privacy en compte reel et cross-device: profil public/prive, stats masquees, presence sociale, classement amis, chat/guilde et RPC sociales sans fuite d'historique sportif prive.
6. [ ] Tester les redirects/headers Netlify en production apres redeploy: `/sql/*`, `/tools/*`, docs internes, `.env*`, `.git/*`, `/sys_core_override_99.html`, headers CSP/HSTS/X-Robots. Note: verification distante Netlify bloquee le 2026-06-03 par reauth 401.

P1 - Contenu public, legal et acquisition:
1. [ ] Completer les mentions legales France/UE avec l'identite juridique reelle, adresse/immatriculation/TVA si applicable, sans inventer de donnees.
2. [x] Publicite desactivee tant que la ligne editeur Adcash n'est pas disponible: `adsEnabled=false`, aucun preconnect/script et CSP resserree.
3. [ ] Soumettre le sitemap actuel dans Search Console et verifier les exclusions `noindex`, notamment pages app privees et pages publiques `/`, `/algorithme`, `/guide`, `/service`, legal, changelog.
4. [ ] Ajouter des captures/visuels reels du produit sur la page publique et/ou le Service Hub, sans transformer l'app en landing marketing.
5. [ ] Nettoyer les docs obsoletes: remplacer les references Lemon Squeezy restantes par Paddle dans les zones non historiques, corriger le README ancien/mojibake, clarifier `functions/webhook.mjs`.

P1 - Netlify, build et exploitation:
1. [ ] Reauth Netlify puis verifier le site lie, les variables d'environnement (`PADDLE_WEBHOOK_SECRET`, `PADDLE_ELITE_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), les deploys et les formulaires/desactivations inutiles.
2. [x] `netlify.toml` et `_redirects` alignes, y compris `/algorithme`, `/partenariats` et une vraie reponse 404.
3. [x] Bundler Netlify Functions configure en `esbuild`; tests locaux webhook v87 ajoutes. Test deploye a refaire apres publication.
4. [x] Headers de cache bornes et revalidables pour CSS, JS et images; runtime/cache-busters/SW alignes en v87.
5. [x] Chemin explique: `TITAN_V0.5` est une jonction Windows vers `Downloads\\Titan`; le build reste dans le meme workspace physique.

P2 - Supabase performance et dette DB:
1. [ ] Traiter les advisors performance: index FK manquants sur tables admin/social/profils, policies permissives redondantes, index dupliques `messages_created_at_idx/messages_created_idx` et `profiles_friend_code_unique/profiles_friend_code_unique_idx`.
2. [ ] Creer ou migrer vers une cle Supabase publishable moderne `sb_publishable_...` quand disponible; le projet expose aujourd'hui seulement la cle legacy `anon`.
3. [ ] Rejouer un audit RLS/readiness apres cleanup advisors et archiver le resultat dans `PUBLIC_RELEASE_SQL_ORDER.md` ou un rapport dedie.

P2 - Frontend, securite navigateur et performance:
1. [ ] Refactorer progressivement les scripts inline et `onclick` vers listeners/modules pour retirer `unsafe-inline` de la CSP.
2. [ ] Continuer l'audit `innerHTML`: separer templates statiques, donnees DB, donnees utilisateur et chemins admin; imposer `textContent`/escape central partout ou possible.
3. [x] Supabase JS aligne et fige en `2.111.0` stable sur le front et la fonction; Chart.js `4.5.0`, Leaflet `1.9.4`, Remixicon `3.5.0`.
4. [x] Images boss/avatar compressees et redimensionnees sans changement de DA: environ 330 Mio a 122 Mio. Variantes WebP/AVIF restent optionnelles.
5. [x] QA navigateur v87: 32 pages desktop + parcours critiques mobile 360 px, aucune image cassee, aucun overflow ni erreur JS observee. Offline reel reste a verifier en production.
6. [x] Passe accessibilite v87: textes alternatifs dynamiques, libelles des boutons icone, ranges, select et import GPX completes. Revue clavier manuelle approfondie reste recommandee.

P3 - Produit, UX et contenu applicatif:
1. [ ] Harmoniser etats loading/empty/error/success sur toutes les pages denses: training, stats, social, chat, boutique, journal, talents, admin.
2. [ ] Reprendre la charge cognitive page par page: une action principale visible, details repliees, microcopy courte, pas de mur de stats.
3. [ ] Finaliser les parcours sportifs par discipline dans `disciplines.html`, les raids de guilde serveur, talents profonds valides serveur et integrations sportives externes en beta privee.
4. [ ] Finaliser les features Elite non pay-to-win: plan multi-jours, analyse de seances similaires, rapport mensuel premium.
