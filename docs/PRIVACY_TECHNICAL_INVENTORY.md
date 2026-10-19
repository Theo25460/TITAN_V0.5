# Inventaire technique des tiers, traceurs et données (LEG40, LEG29, LEG03)

Relevé du **comportement réel du code** au 19/10/2026 (branche `claude/titan-cahier-charges-0k7cdn`). C'est une base de travail technique, **pas une qualification juridique** : base légale, mentions, durées et transferts doivent être validés par une personne compétente (LEG13, LEG57). Toute valeur marquée « à confirmer » n'a pas pu être établie depuis le dépôt. Les hôtes sont tenus à jour dans `docs/third-party-hosts.json` ; `tests/third-party-hosts.test.mjs` échoue si un hôte apparaît ou disparaît des fichiers livrés sans mise à jour, ou si une page contacte un tiers au chargement.

## 1. Tiers contactés (LEG40, LEG29)

| Tiers | Rôle | Contacté par | Quand | Données transmises | Localisation |
|---|---|---|---|---|---|
| Netlify | hébergement du site et des fonctions | navigateur, fonctions | toujours | adresse IP et requêtes HTTP (journaux d'hébergement) | à confirmer (paramètres du site) |
| Supabase (projet `oubmftfufwwzwpgvrcag`) | authentification, base de données, temps réel | navigateur | pages avec compte, synchronisation | compte, séances, profil, économie, social, assistance, mesure d'audience (§3) | région `eu-west-1` (Irlande), établie par l'API du projet |
| Paddle | paiement TITAN+ (marchand officiel à confirmer, LEG25) | navigateur, webhook | seulement à l'ouverture du paiement (script chargé à la demande) ; le webhook appelle nos fonctions | identité de paiement côté Paddle ; chez nous : identifiants d'événement, d'offre, d'abonnement (`titan_billing_events`) | à confirmer |
| Resend | envoi des e-mails d'assistance | fonctions seulement | demande d'assistance (si le service est activé) | adresse de réponse et texte saisis par la personne | à confirmer |
| GitHub | code source, intégration continue | développeurs | jamais par le navigateur du joueur | aucune donnée de joueur | — |
| Discord | lien communautaire | clic du joueur | seulement s'il clique | — | hors du site |
| Adcash (`acscdn.com`) | régie publicitaire **désactivée** | — | jamais : `adsEnabled` est faux et l'hôte n'est pas dans la CSP | — | — |

Aucun autre script, pixel, SDK d'analyse ou de publicité tiers n'est chargé : polices et icônes sont **hébergées sur le site** (`css/fonts`), le client Supabase est embarqué (`js/vendor`). Aucune page ne contacte un tiers au chargement hors Supabase (test), après retrait de trois préconnexions inutiles vers `cdn.jsdelivr.net` (`admin.html`, `dynamic-page.html`, `sys_core_override_99.html`).

**Recommandation (non appliquée, en-tête de production)** : la CSP de `netlify.toml` autorise encore `cdn.jsdelivr.net`, `unpkg.com`, `fonts.googleapis.com` et `fonts.gstatic.com` alors que rien ne s'y charge ; les retirer réduit la surface d'injection de scripts et évite tout contact involontaire avec ces hôtes. À faire dans un lot de déploiement dédié avec contrôle des pages en navigateur. La CSP n'autorise pas non plus le script Adcash : activer les publicités demandera un changement de CSP **et** du consentement (ADS03, LEG41).

## 2. Stockages locaux et cookies (LEG40)

**Aucun cookie** n'est posé ou lu par le code (`document.cookie` absent). Tout se trouve dans `localStorage`, `sessionStorage`, `IndexedDB` et le cache du service worker, sur l'appareil.

| Clé / stockage | Contenu | Finalité | Nécessaire au service demandé ? |
|---|---|---|---|
| `titan_supabase_auth_v1` | session d'authentification | rester connecté | oui (compte demandé) |
| `titan_os_v12_save`, `titan_data_cache_v2`, `titan_progression_snapshot_v1` | copie locale de l'état de jeu et de la progression | fonctionnement, hors ligne | oui |
| `titan_pending_training_logs_v1`, IndexedDB `titan-training` | séances en attente d'envoi, brouillons et séances invité | ne pas perdre une séance hors ligne | oui |
| `titan_seance_draft_v3:<compte>`, `titan_seance_timer_v3:<compte>` | brouillon et chronomètre de séance | reprise après fermeture | oui |
| `titan_guest_device_id_v1`, `titan_guest_imported_v1` | identifiant d'appareil invité aléatoire, marqueur d'import | séances invité et import vers le compte | oui |
| `titan_journal_prefs_v3`, `titan_goals_v1:<compte>`, `titan_adventure_v1:<compte>` | préférences et objectifs locaux | confort d'usage | oui (préférences) |
| `titan_first_run_guide_*`, `titan_last_news_version`, `titan_twa` | marqueurs d'affichage (guide vu, nouveautés vues, coque Android) | ne pas répéter une aide | oui |
| `titan_checkout_started_v3:<compte>` | marqueur d'ouverture du paiement | réconcilier un paiement interrompu | oui |
| `titan_privacy_v1` | choix de consentement (mesure d'audience) | mémoriser le choix | oui (preuve du choix) |
| `titan_analytics_once_v1` | marqueurs « événement déjà envoyé » | éviter les doublons de mesure | lié à la mesure : seulement avec consentement accordé (à confirmer dans le code avant publication) |
| `titan_front_errors_v1`, `titan_front_perf_v1`, `titan_profile_sync_diag_v1`, `titan_training_sync_diag_v1` | diagnostics locaux d'erreurs et de performance | aide au support ; **restent sur l'appareil** (aucun envoi automatique relevé ; un rapport d'assistance volontaire peut en reprendre des extraits, à confirmer) | à confirmer |
| Cache du service worker (`titan-os-v300-ascension`) | pages et ressources du site | fonctionnement hors ligne | oui |

Les clés suffixées par un compte (`:<compte>`) contiennent l'identifiant du compte, donc des données de ce compte sur l'appareil. À la suppression de compte, `titanForgetOwnerDrafts` efface les brouillons et chronomètres de séance et la file d'envoi du compte ; **les autres clés suffixées (objectifs, aventure, marqueur de paiement) ne sont pas toutes effacées par ce chemin : à vérifier avant d'affirmer l'effacement complet de l'appareil (LEG10, LEG41).**

## 3. Données collectées côté serveur (LEG03, LEG26)

Les durées de conservation **ne sont pas fixées** dans le dépôt (Q-002, LEG31) ; la colonne est donc volontairement vide de chiffres.

| Catégorie | Tables principales | Finalité | Conservation |
|---|---|---|---|
| Compte et profil | `auth.users`, `profiles` (pseudo, avatar, code ami, niveau, XP, crédits, statut, vie privée) | compte, jeu, social | à décider (Q-002) |
| Séances sportives | `training_logs`, `training_revisions`, `training_receipts`, `sport_goals` ; le champ `details` peut contenir durée, distance, dénivelé, **tracé GPS** (`gpxPath`) et notes | fonction principale, statistiques, progression | à décider (Q-002) |
| Économie et achats | `shop_history`, `shop_items`, `premium_access`, `titan_economy_journal` (journal immuable), `titan_billing_events` (événements Paddle) | boutique, TITAN+, sécurité de l'économie | à décider ; le journal est immuable par conception |
| Social | `friendships`, `guilds`, `guild_members`, `guild_messages`, `messages`, `titan_moments`, `titan_challenges`, `titan_public_cards` | fonctions sociales, carte publique | à décider |
| Coaching | `coach_links`, `coach_assignments` (partage choisi des détails et des notes) | relation coach / athlète | à décider |
| Mesure d'audience | `analytics_events` (nom, page, source, métadonnées minimales ; contrat dans `docs/ANALYTICS_EVENTS_V300.md`) | amélioration du produit ; envoi seulement après consentement accordé | à décider |
| Assistance | `titan_support_requests` (privée), `contact_messages` et `bug_reports` (tables présentes dans le schéma ; usage actuel à confirmer : nom, e-mail, message, captures éventuelles) | répondre aux demandes | à décider (LEG15) |
| Sécurité et modération | `titan_suspicious_actions`, `titan_moderation_decisions`, `titan_rate_events`, `titan_admin_audit`, `audit_logs`, `admin_logs` | prévention de la fraude, traçabilité des actions d'administration | à décider |
| Concours et prospection | `contest_entries`, `contest_draws`, `influencers` (**nom, e-mail de contact de personnes externes**), `referrals` | opérations promotionnelles (LEG50, LEG51) | à décider ; `influencers` concerne des tiers non joueurs |

Points d'attention pour la revue humaine : le tracé GPS et le dénivelé sont des données de localisation et d'activité (LEG14, LEG36) ; `influencers` contient des données de personnes qui n'ont pas de compte ; `audit_logs` conserve des copies de lignes (`old_data`, `new_data`) qui peuvent contenir des données personnelles ; l'anonymisation d'un compte supprimé conserve volontairement des historiques d'administration sans identité du joueur.

## 4. Ce qui n'est pas établi ici

Localisation exacte de l'hébergement Netlify, de Paddle et de Resend ; contrats de sous-traitance ; base légale de chaque traitement ; durées de conservation ; statut de marchand officiel ; usage réel des anciennes tables (`contact_messages`, `friends`, `items`…) ; contenu des variables d'environnement. Ces points restent à traiter par une personne compétente et à répercuter dans la politique de confidentialité (LEG28).
