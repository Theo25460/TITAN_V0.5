# Reprise du cahier maître — lot web du 8 octobre 2026

Le [cahier maître Google Drive](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M/edit) est la source fonctionnelle. Cet audit décrit la base `main` **e903ac3** et le lot `codex/web-stabilisation-cdc`. Le chantier global reste ouvert : ce lot ne valide ni Android, ni les régies, ni tous les parcours connectés.

## Résultat livré

Records et Maîtrise proposent une recherche par nom/alias sans accents, les favoris, les sports pratiqués depuis 30 jours, les catégories et les tris. Les sports sans données sont masqués par défaut et consultables sans résultat inventé. Le rendu est limité à **12 groupes de sports par page** ; le 200e sport est accessible par recherche ou pagination. Les liens `?sport=` et les séances sources des records sont conservés. Les seuils de maîtrise et les calculs sportifs ne changent pas.

Les favoris réutilisent `state.user.favoriteSports` et la sauvegarde existante. Un ancien favori sorti du catalogue reste accessible, même après l'archivage de sa dernière séance. Les recherches conservent le focus et le curseur lors du rendu. Le catalogue chargé en ligne conserve les alias du catalogue de secours.

Deux événements first-party, `sport_navigation_searched` et `sport_navigation_filtered`, sont ajoutés derrière le consentement analytics existant. Ils transmettent la vue (`records`/`mastery`), le type de contrôle et le nombre de résultats. **Aucun texte recherché, séance ou note libre** n'est envoyé. La recherche est temporisée à 400 ms.

Fichiers : `js/core/sport-navigation.js`, `js/app/sport-browser.js`, `js/core/sports.js`, `js/app/records.js`, `js/app/profil.js`, `js/app/analytics.js`, `records.html`, `profile.html`, `css/ascension-app.css`, `package.json` et les tests. Les références des ressources affectées passent à `300.1` pour éviter qu'une PWA installée utilise les anciennes ressources à la première navigation. Le cache et le pipeline de construction existants sont conservés.

**Aucune migration, modification de configuration serveur, mutation de données de production ou publication n'a été effectuée.** Le lot se livre en PR ; sa présence sur cette branche ne signifie pas qu'il est déjà en ligne.

## Preuves de validation

| Contrôle | Résultat et portée |
| --- | --- |
| Référence avant changement | `pnpm run verify` : 60/60 ; E2E : 6/6 |
| Vérification finale | `pnpm run verify` : **71/71**, syntaxe de 54 scripts, build public avec 87 ressources hors ligne, audit statique sans erreur bloquante |
| Parcours Chromium | `pnpm run test:e2e` : **10/10**, dont les 6 parcours existants, 200 sports, petits comptes, états vides et PWA avec ancien cache |
| Pure logique | Recherche accents/alias, filtres combinés, favoris sans données, date limite des récents, ordre stable, pages bornées, absence de mutation |
| Régressions de relecture | Alias avec catalogue en ligne ; favori ancien sans historique ; CSS/analytics d'une PWA déjà installée : reproduites puis corrigées et couvertes |
| Rendu inspecté | Records à 360 et 1280 px ; Maîtrise à 360 px ; aucun débordement horizontal |
| Événements | Payload vérifié par client de test : champs libres exclus ; événements acceptés par l'allowlist |
| Base / CI | Non exécutée localement, sans PostgreSQL ; CI verte sur `174196f`, avec neuf migrations Ascension et six suites SQL sur réplique vide |

L'audit statique conserve des avertissements existants de longueur de titres/descriptions et de `h1` générés par JavaScript. Le contrôle de syntaxe n'est **pas** un type-check. Ne pas fermer A08 sur cette seule preuve.

La relecture indépendante a demandé trois corrections importantes, toutes traitées ci-dessus. Restent non exercés : sauvegarde de favoris entre deux appareils connectés, annonces avec lecteur d'écran réel et saisie IME mobile. Les E2E utilisent des données éphémères et coupent les services tiers ; ils ne prouvent pas un parcours connecté Supabase/Paddle réel.

## Architecture et surface de régression (A01/A02)

| Surface | État technique lu | Ce qu'une future refonte doit préserver |
| --- | --- | --- |
| Web | Site statique multipage sans framework ; modules purs `js/core/`, UI `js/app/`, design Ascension | Routes publiques/privées, navigation mobile, chargement ordonné des globals |
| Données sportives | `state.js`, `main.js`, file IndexedDB et `training-store.js` ; RPC et reçus idempotents | Propriétaire de chaque événement, import invité, édition/archive, historique complet, reprise hors ligne |
| Sport et profil | Journal, semaine, records sourcés, objectifs, routines, maîtrise, cadence, ADN, collection | Calculs comparables, champs spécifiques aux sports, exports, préférences, choix de confidentialité |
| Aventure/social | Chapitres, gardiens, expéditions ; amis par consentement, Moments, défis sans mise, guildes, coaching | Progression et récompenses serveur, plafonds, inscriptions explicites, droits et suppression |
| Paiement | Paddle → `netlify/functions/webhook.mts` → `functions/webhook.mjs` → RPC Supabase | Signature, idempotence, ordre des événements, produit autorisé, droits de fin d'abonnement |
| PWA | `sw.js`, cache Ascension, précache généré au build, ressources versionnées | Installation, première ouverture, passage hors ligne et mise à jour depuis un ancien cache |
| Livraison | pnpm verrouillé, build `dist`, CI tests/build + Chromium + SQL ; Netlify | SHA reproductible, aucune publication depuis un arbre non vérifié, rollback front/PWA |
| Analytics/SEO | Événements first-party derrière consentement, pages privées `noindex`, pages publiques indexables | Aucun contenu sportif libre dans les événements ; cohérence sitemap/canonical/métadonnées |
| Android | Pipeline TWA décrit dans `docs/ANDROID.md`, aucun fichier Android changé ici | Choix d'architecture et identité du package avant intégration des fonctions natives |

Dépendances npm : Supabase JS 2.111.0 ; outils de test Playwright 1.56.1 et fake-indexeddb. Aucune dépendance ajoutée ni mise à jour du lockfile dans ce lot.

## Lecture de production, sans mutation

**Netlify** : site `titano-app`, ID `0a553bc3-458a-415d-9173-538faa0ac1e6`, URL `https://titan-app.fr`. Déploiement courant `6ac3e212c48091d1e9774a6d`, `ready`, daté du 5 octobre 2026 à 17:45 UTC. `commit_ref` et `commit_url` sont absents. La base Git auditée ne peut donc pas être déclarée identique à l'archive live sur la seule métadonnée. Ne pas redéployer pour résoudre ce manque de traçabilité pendant un autre chantier.

**Supabase** : projet `oubmftfufwwzwpgvrcag`, healthy, Postgres 17.6. Le catalogue déclare 46 migrations, y compris les neuf migrations Ascension jusqu'à `20261005230000`. Ce constat de présence ne remplace pas une comparaison intégrale des corps SQL.

Lecture des policies/grants critiques : les séances sont lisibles par leur propriétaire ou un administrateur, pas modifiables librement par un utilisateur standard ; profils et inventaire/achats passent par les mécanismes autorisés. Les RPC critiques lues refusent `anon` et fixent `search_path=public,pg_temp`. `titan_save_profile_state` vérifie l'identité, la version et une liste autorisée de préférences incluant `favoriteSports`, tout en protégeant XP/crédits/inventaire/rôle. La carte publique est une exception intentionnelle en lecture anonyme, activée explicitement.

**SEC01 reste partiel** : la lecture du catalogue n'est pas un test complet croisé de deux comptes. Les advisors signalent notamment `private.titan_card_settings_json` avec search_path mutable et la protection contre mots de passe compromis désactivée. La fonction privée est invoker et non exécutable par `anon` dans les droits lus ; prévoir un durcissement testable séparé. Les alertes génériques sur les RPC SECURITY DEFINER ne prouvent pas une faille sans examen de leurs gardes. Huit tables RLS sans policy sont à analyser dans leur contexte RPC, pas à ouvrir par défaut.

Trois tâches cron sont actives, dont la rétention Ascension des comptes réellement inactifs et les purges social/analytics. Le lot n'a ni lancé ni changé ces tâches existantes. Les anciennes mentions de cron désactivé dans les documents de release décrivent une étape antérieure.

## Données et secrets (A03)

Surface sensible : sessions/Auth, identité et e-mail, séances et notes, historique sportif, préférences et relations sociales, droits de paiement, données locales IndexedDB et exports. Aucun contenu individuel de production n'a été extrait pour ces tests.

L'URL Supabase et la clé JWT publique du client sont visibles volontairement ; le rôle décodé est `anon`. Les identifiants Paddle client ne remplacent pas les secrets de webhook. Les noms de secrets serveur sont documentés dans `.env.example` et `docs/DEPLOYMENT.md` : `PADDLE_WEBHOOK_SECRET`, `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`, identifiants produit/prix autorisés. Les vraies valeurs restent côté serveur.

Scan des fichiers versionnés et du build public : aucune clé privée, JWT à rôle serveur, clé `sb_secret`, jeton GitHub ou identifiant AWS de forme reconnue trouvé. Le build public n'embarque pas la logique serveur du webhook. C'est un audit du contenu disponible, pas une attestation de tous les secrets ou paramètres des consoles externes.

## Écarts et ordre des prochains lots (A06)

Le cahier maître récent prime sur les choix du document historique `ASCENSION_300.md`. Ne pas marquer conformes les fonctionnalités simplement parce qu'elles existaient dans cette release.

| Ordre | Lot et dépendances | Écart concret / validation attendue |
| --- | --- | --- |
| 1 | Fiabilité web et sécurité, avec environnement de test connecté | Terminer les tests cross-user, reprise de sync, comptes ancien/neuf/Premium, export/suppression ; durcir les advisors ; ajouter un vrai type-check progressif avant les changements métier sensibles |
| 2 | Doctrine économique/Premium et migrations additives sur staging | L'offre actuelle annonce 5 €/mois, campagnes supplémentaires et 4 pièces TITAN+ ; le cahier exige tous les cosmétiques gagnables gratuitement, statistiques approfondies et aucun avantage compétitif. Cartographier et corriger chaque verrou serveur/UI, préserver les possessions et droits existants |
| 3 | Publicité web, consentement, validation des récompenses serveur | `adsEnabled=false` et textes « aucune publicité » : aucun moteur de régie opérationnel dans cette base. Besoin des identifiants réels, CMP, événements vérifiables serveur, cap 1 rewarded/jour et 1 interstitiel/5 séances après sauvegarde ; supprimer toutes les pubs pour Premium ; aligner légal et analytics lors de l'activation |
| 4 | Anti-triche et quêtes | L'autorité serveur, l'idempotence et les plafonds existent. Restent audit complet des limites par sport, scoring de risque, revue de faux positifs, file de modération, quêtes multisport adaptatives et rendement dégressif |
| 5 | RPG et contenu | Les chapitres/gardiens et expéditions existent ; cela ne valide pas exploration, monstres, mini-quêtes, boss en phases, adaptation à l'activité et endgame extensible du nouveau cahier. Écrire les contrats et tests serveur avant d'étendre l'UI |
| 6 | Validation web avant Android | Parcours connectés, Lighthouse/CWV, accessibilité avec aides réelles, revue sécurité, traçabilité exacte de la version live et rollback ; aucune validation Android implicite |
| 7 | Android et Play, après base web validée | Réconcilier TWA/Capacitor et package `fr.titanapp.twa` dans le dépôt contre `fr.titanapp.app` revendiqué dans Play Console ; intégrer achats/ads natifs, consentement, liens et mise à jour ; suivre le chantier WORK existant |

Stratégie : branches distinctes `codex/web-*`, `codex/economie-*`, `codex/anticheat-*`, `codex/rpg-*`, puis `codex/android-*`. Une PR cohérente par lot, CI et preuves avant fusion, aucune modification des modules revendiqués par un autre modèle sans coordination. Les migrations futures exigent sauvegarde/restauration démontrée, tests hors production et rollback spécifique ; aucun besoin de migration pour ce lot.

## Statuts à reporter dans le cahier

- A01/A02/A03/A06 : audit et cartographie documentés avec les limites ci-dessus.
- NAV01–NAV10 : implémentés et vérifiés sur cette branche, pas encore publiés.
- DATA06 : événements implémentés et payload vérifié ; l'analyse de trafic attend leur publication et des usages réels.
- QA07 : fixture locale 200 sports vérifiée, pas un compte réel de production ni une mesure sur appareil physique.
- A08/SEC01 : restent en cours ; QA01 validé sur ce lot par la CI incluant la base. Les critères de fin globale restent ouverts.

Le handoff final sur Drive doit référencer la PR et l'état exact de ses trois jobs CI. La priorité n'est libérée qu'après cette synchronisation. Toute reprise doit relire le cahier et les changements de la branche avant d'utiliser ce bilan.

## Livraison GitHub

[PR #19](https://github.com/Theo25460/TITAN_V0.5/pull/19), commit produit `174196f786725878ac9574e5ee01a39ac96a8519`. [CI Qualite 37765297170](https://github.com/Theo25460/TITAN_V0.5/actions/runs/37765297170) : les trois jobs tests/build, Chromium et SQL ont réussi. La finalisation documentaire ne modifie pas le code testé ; la CI de la tête finale doit aussi rester verte avant fusion. La production reste inchangée.
