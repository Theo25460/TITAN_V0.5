# TITAN · Relais pour la session Fable (16 novembre 2026, phases 1 et 2)

> **Suite :** la session Fable du même jour (consolidation GitHub, TITAN LIVE, fonctions Android, l'Expédition) est décrite dans
> [`../TITAN_ONE.md`](../TITAN_ONE.md), qui est désormais le point d'entrée.

Branche `claude/youthful-knuth-pgg96r`, PR #149 (brouillon), partie de la tête de la PR #148 (`6295e49`, au-dessus de `main` `67e17c7`).
Ce document complète [`RAPPORT_FINAL.md`](RAPPORT_FINAL.md) et [`REGISTRE.md`](REGISTRE.md) sans les répéter : ce qui a changé, ce
qui est prouvé, par quoi reprendre. Aucun nouvel audit général n'est nécessaire.

Travaux parallèles repérés (ne pas écraser) : `claude/titan-rpg-multisport-larhou` (TITAN LIVE derrière `screens.live`, 48 fichiers,
basé sur `main`) et `ccr-dfa5e93f-je1kju` (fonctions Android, 131 fichiers, basé sur `main`, touche `mobile/src/lib`, `components`,
`supabase/migrations`). Les deux devront être rebasés sur cette branche une fois fusionnée ; leurs migrations doivent passer après
`20261116110000`.

## 1. Production Supabase : état exact

**Les 10 migrations V1.3.1 sont appliquées en production depuis le 16 novembre** (`20261110140000` → `20261116110000`), fichier par
fichier depuis `supabase/release-v131/`, chacun confirmé par le propriétaire.

| Contrôle après application | Résultat |
|---|---|
| Empreinte des fonctions (corps et droits) | Identique à la réplique : `private 91 bae05c10ca57 d52d12beba17`, `public 293 db4eeb91a3d2 8f112d92ff21` |
| `tools/db/postflight-v131.sql` | 54 / 54 vrais |
| `tools/db/postflight-v13.sql` | 42 / 42 vrais |
| Données | Empreintes inchangées pour comptes, profils, journal, aventure, consentements ; `titan_entitlements` change seulement par ses 2 colonnes ajoutées |
| Faille d'amitié forcée | Fermée (`authenticated` n'a plus `INSERT`, politique fautive supprimée, aides Coach fermées) |
| Dérive D1 (export de compte cassé) | Réparée |
| Conseiller de sécurité | Reste `auth_leaked_password_protection` (tableau de bord) et les avertissements génériques sur les RPC `SECURITY DEFINER` |

## 2. Corrections réalisées (commits de cette branche)

| Commit | Changement | Preuve |
|---|---|---|
| `057664c` | Paquet de production généré depuis les fichiers, garde d'ordre, contrôles d'empreinte | Test `production-bundle.test.mjs` ; répétition sur réplique |
| `a2547d9`, `8096885` | Sécurité : rapports de démarrage plafonnés (20/24 h) et conservés 90 jours ; seau `avatars` borné (2 Mo, images) ; recherche par code ami limitée (30/h) | Tests SQL rouge puis vert ; appliqués en production |
| `3ba65ec`, `d155043` | Registres : A1, A17, A19, A23, A24 actualisés avec preuves | Requêtes de production en lecture seule |
| `2ebe2dc` | E2E `journey-v13` stabilisé (le reçu injecté passait par la mémoire seule) | 40 exécutions sous charge, 0 échec |
| `6d36b67` | E2E du reçu d'achat inter-onglets stabilisé. Cause : la propagation `localStorage` entre onglets est asynchrone, le verrou Web ne la garantit pas | 25 exécutions sous charge, 0 échec (4 sur 20 avant) |
| `5f958ea` | Le générateur des pages publiques ne réécrit plus `/service` (centre d'assistance) par une ancienne version | Test `public-generators.test.mjs` : 28 pages régénérées à l'identique ; rouge sur l'ancien générateur |
| `c465054` | Android : 6 modules natifs Expo alignés sur Expo 57.0.32 (GPS inclus) | 31 modules, 0 écart |
| `137e5f0` | Android : l'Atelier dit si une pièce échangée est équipée ou non (l'échec était avalé) ; une trace GPS en attente peut être retirée (la file de 20 pouvait rester bloquée) | Premiers tests de l'Atelier (rouges sur l'ancien écran) ; tests de retrait |
| `1faedaa` | Android : les libellés de bouton ne sont plus coupés en texte agrandi (A22) | `buttonResponsive.test.tsx` à 1,5× et 2× |

## 3. Tableau de contrôle

VERT = démontré par un contrôle réussi aujourd'hui ; ORANGE = incomplet ou dépendant d'une action extérieure ; ROUGE = défaut
bloquant ou risque confirmé.

| Domaine | Statut | Justification |
|---|---|---|
| Fonctionnalités Web (candidat) | VERT | 593 tests unitaires ; suite navigateur complète (voir § 5) |
| Fonctionnalités Android (candidat) | ORANGE | Typage, 79 suites et 815 tests Jest verts ; build natif et parcours émulateur dans la CI ; aucun téléphone réel, aucun TalkBack |
| Cohérence Web/Android | ORANGE | Moteur commun testé ; niveau Carrière/QG de même source (vérifié) ; captures Android issues de l'aperçu |
| UX/UI | ORANGE | Défauts corrigés aujourd'hui (Atelier, traces GPS, texte agrandi) ; aucun test avec de nouveaux utilisateurs |
| Illustrations | ROUGE | Blasons Champion, Titan, Légende absents. Génération tentée : refusée pour **crédits insuffisants** ; réseau désormais ouvert vers l'hôte de téléchargement |
| Sécurité (code) | VERT | Résidus D8 et D11 fermés avec tests rouge/vert ; audit npm Web 0, Android 0 critique/élevée |
| Sécurité (production) | VERT | Faille d'amitié fermée, postflights 54/54 et 42/42 ; reste un réglage du tableau de bord (mots de passe compromis, second facteur administrateur, politiques `INSERT` du seau `avatars`) |
| Base de données (dépôt) | VERT | Deux chaînes de migrations et contrats concurrents verts (PostgreSQL 16 local, 17.6 en CI) |
| Migrations production | VERT | 10 appliquées, empreinte identique au dépôt |
| Paiements | ORANGE | Côté serveur prêt en production ; chaîne d'achat jamais prouvée de bout en bout (aucun achat de licence) ; produits Play à garder inactifs jusque-là |
| Tests | VERT | Web, SQL, Android verts ; deux tests intermittents corrigés sans toucher aux assertions |
| Builds | ORANGE | Build public Web vert localement ; build Android natif : voir la CI de la PR #149 sur le dernier commit |
| CI GitHub | ORANGE | À lire sur le dernier commit de #149 (les exécutions intermédiaires ont été annulées par les poussées suivantes) |
| Déploiements | ROUGE | `titan-app.fr` sert encore les CGU version 6 ; fusion et autorisation `TITAN_APPROVED_RELEASE_SHA` côté propriétaire |
| SEO | ORANGE | Audit statique sans erreur ; pages régénérées identiques ; rien de mesurable avant déploiement |
| Textes légaux | ORANGE | Version 8/12 dans le candidat ; rétention de 90 jours des rapports techniques ajoutée ; validation juridique humaine en attente |

## 4. Performance Web : mesures et décision

Mesure du 16 novembre (Chromium, téléphone 390 px, processeur ralenti ×4) :

- Chaque page de l'application charge environ 1,4 Mo de JavaScript, soit 300 Ko compressés en gzip (33 scripts sur le QG,
  27 sur la Séance, 31 sur le Profil). Les plus lourds : `js/core/sports-catalog.js` (416 Ko bruts, 32 Ko gzip),
  `js/titan_features.js` (223 Ko, 49 Ko gzip), `js/vendor/supabase-2.111.0.js` (211 Ko, 54 Ko gzip).
- Temps d'exécution par script : moins de 60 ms chacun. Le coût est le **téléchargement** : l'élément LCP du QG (`p.asc-lead`), de
  la Séance (`h1`) et du Profil est rendu par JavaScript, donc après tous les scripts différés.
- Minification esbuild essayée hors dépôt : −14 % seulement en Brotli (246 → 212 Ko sur le QG). **Non intégrée** : les tests et
  la clé `?rev=` comparent les octets servis à ceux des sources ; le gain ne justifie pas de toucher au système de révision.
- Piste réelle, transversale (pour Fable) : `titan_features.js` expose plus de 50 fonctions globales héritées de la V42, dont seules
  trois servent au démarrage (`titanEnhanceSportsConfig` dans `state.js`, `titanGetActiveTitle` dans `ui.js`,
  `titanSanitizeSessionDetails` dans `main.js`) ; isoler ces trois fonctions et charger le reste à la demande, et servir
  le premier écran du QG en HTML statique, sont les deux leviers mesurables.

## 5. Tests exécutés

| Suite | Résultat |
|---|---|
| `pnpm run verify` (typage, 593 tests, build, audit, garde de release) | Vert |
| E2E Playwright complet, tête finale (local) | 1 033 / 1 034 : un échec intermittent `public card actions… SDK rollover` (6/6 en isolé, code non modifié) |
| CI sur `60ca46b` | Android vert (tests, bundle, APK/AAB, émulateur) ; Web : migrations 17.6, tests et build verts, parcours navigateur 1 033 / 1 034 (`profile-title`, bouton injecté par le test effacé par un redessin ; test renforcé dans le commit suivant, 2 échecs sur 50 passes locales sous charge ensuite) |
| Contrôles ciblés sous charge CPU | `journey-v13` 40/40, reçus d'achat 25/25, onglets de l'Aventure (A34) 12/12 sans reproduire l'échec |
| `tools/db/test-migrations.sh` et variante `RELEASE_SQL` | Verts |
| Android `tsc --noEmit`, Jest | Vert, 79 suites, 815 tests |
| Production (lecture seule) | Empreinte, postflights 54/54 et 42/42, données inchangées |

## 6. Illustrations

| Catégorie | État |
|---|---|
| Intégrées | 4 blasons approuvés (Éclaireur, Explorateur, Sentinelle, Gardien), Web et Android |
| À produire | Blasons Champion (accent `#F4BB54`), Titan (`#F7C96B`), Légende (`#FFE7A8`), 3 chevrons chacun (`js/app/crest.js`) ; récompenses, balises, paliers, états vides, onboarding (`REGISTRE.md` A4) |
| PR #147 | 153 propositions vectorielles, non intégrées (hors direction photoréaliste) |
| Contraintes techniques | Référence de style : `assets/ranks/gardien-512.webp` ; fond magenta uni pour le détourage ; sorties `assets/ranks/<rang>-256.webp` et `-512.webp` en RGBA ; ajouter le rang à `BADGES` (`js/app/crest.js`) et au composant `mobile/src/components/Crest.tsx` ; approbation humaine avant intégration |
| Blocage | Générateur Buzzy : crédits insuffisants (tâche refusée le 16/11). L'hôte `res-prod.buzzy.now` est autorisé dans l'environnement `titan-v0-5` |

## 7. Par quoi reprendre (ordre recommandé)

1. **Fusionner** #149 (contient #148), puis déployer le site avec l'autorisation du SHA ; vérifier que les CGU en ligne passent en version 8.
2. Tableau de bord Supabase : protection des mots de passe compromis, second facteur administrateur, politiques `INSERT` et objet
   orphelin du seau `avatars` (A17, A18).
3. Chaîne d'achat Google Play sur banc isolé (`lot2-paiements.md`), puis activation des produits en dernier ; retirer le build 1301.
4. Blasons manquants dès que des crédits sont disponibles (§ 6).
5. Performance (§ 4), tests avec 5 à 10 nouveaux utilisateurs, recette sur téléphone réel (texte 200 %, TalkBack, GPS).
6. Rebaser les deux branches parallèles sur cette branche.

## 8. Risques résiduels

- **Tests navigateur intermittents (environ 1 sur 1 034 par exécution, jamais le même)** : `adventure-rpg` (A34), `public card actions`, `profile-title`. Mécanisme commun : la page redessine ses boutons (`innerHTML`) quand un chargement tardif arrive ; un clic qui tombe pendant ce redessin vise un élément détaché. Correctif durable pour Fable : mettre à jour les listes au lieu de les reconstruire, ou rendre la délégation de clic indépendante des nœuds remplacés.

- Les insertions anonymes de `contact_messages` et `analytics_events` restent sans limite par appelant (décision produit, D9).
- La mesure d'audience d'une activation TITAN+ peut se perdre si un autre onglet remplace le reçu au même instant (propagation
  `localStorage` asynchrone) ; la confirmation fonctionnelle reste affichée.
- Aucune garantie d'absence totale de faille : les contrôles ci-dessus couvrent les scénarios testés et les dérives mesurées.
