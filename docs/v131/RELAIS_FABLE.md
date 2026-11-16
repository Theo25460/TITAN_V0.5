# TITAN · Relais pour la session Fable (16 novembre 2026)

Branche `claude/youthful-knuth-pgg96r`, partie de la tête de la PR #148 (`6295e49`, elle-même au-dessus de `main` `67e17c7`).
Ce document complète [`RAPPORT_FINAL.md`](RAPPORT_FINAL.md) et [`REGISTRE.md`](REGISTRE.md) sans les répéter : il dit ce qui a
changé depuis, ce qui a été prouvé aujourd'hui et par quoi reprendre. Aucun nouvel audit général n'est nécessaire.

## 1. Ce qui a été fait dans cette session

| Commit | Changement | Preuve |
|---|---|---|
| `057664c` | Paquet de production `supabase/release-v131/` généré **depuis les fichiers** (jamais ressaisi), garde d'ordre, registre, contrôles d'empreinte avant/après ; générateur `tools/db/build-production-bundle.mjs` | Répétition sur une réplique dans l'état de la production : empreinte finale exacte, second passage refusé ; test `tests/production-bundle.test.mjs` (le paquet doit rester identique au générateur) |
| `a2547d9` | D11 : rapports de démarrage `titan_submit_cache_reconciliation` plafonnés à 20 par compte et 24 h (déclencheur, RPC et réponse inchangés), conservés 90 jours (règle de rétention publiée dans la matrice et la politique de confidentialité). D8 : seau `avatars` borné à 2 Mo, PNG/JPEG/WebP | `sql/tests/300_v131_abuse_bounds.sql`, rouge sans le déclencheur (30 rapports au lieu de 20), vert avec ; lignes postflight |
| `8096885` | D11 : `titan_find_profile_by_friend_code` limité à 30 recherches par heure (même corps, limiteur commun) | `sql/tests/300_v131_friend_code_rate_limit.sql`, rouge avec l'ancien corps, vert avec le nouveau ; test hérité de confidentialité intact |
| `2ebe2dc` | Test E2E `journey-v13` stabilisé : le reçu injecté passe par la copie locale que l'application relit (course sous charge, 1 033/1 034) | 40 exécutions du fichier sous charge CPU, 0 échec ; assertions inchangées |
| `c465054` | Android : 6 modules natifs Expo alignés sur la table d'Expo 57.0.32 (dont `expo-location` et `expo-task-manager`, utilisés par le GPS) | Contrôle hors ligne contre `expo/bundledNativeModules.json` : 31 modules, 0 écart ; typage et 808 tests Jest |

**Mise à jour, phase 2** : les 10 fichiers du paquet ont été appliqués en production le 16 novembre (voir `supabase/release-v131/README.md` pour les preuves : empreinte identique à la réplique, postflights 54/54 et 42/42, données inchangées). La faille d'amitié forcée est fermée en production.

## 2. Production observée aujourd'hui (lecture seule)

- Supabase `oubmftfufwwzwpgvrcag`, PostgreSQL 17.6 : registre terminé à `20261110130137`. Les 74 versions depuis `20261005150000`
  correspondent exactement au dépôt. `journey_v13` et `entitlement_profile_consistency` y sont désormais (le rapport final les
  disait absentes).
- **Faille ouverte confirmée** : `authenticated` a `INSERT` sur `public.friendships` et la politique `friendships_insert_own` ne
  contrôle pas le statut (amitié pré-acceptée forgeable) ; `authenticated` exécute `private.titan_coach_seats_sweep()`.
  Impact mesuré : 0 amitié, 24 comptes, 2 droits d'accès, 0 lien Garmin.
- **Dérive D1 confirmée** : seul corps différent du dépôt, `private.titan_export_extras_before_rpg_v1` (export de compte cassé
  pour un compte lié à Garmin ou à un binôme). Réparée par le fichier `07` du paquet.
- Conseiller Supabase : `auth_leaked_password_protection` désactivé (réglage du tableau de bord) ; `function_search_path_mutable`
  (corrigé par `07`).
- Site `titan-app.fr` : sert encore les **CGU version 6** (le candidat est en version 8). Netlify n'est pas consultable d'ici.

L'application des migrations a été tentée : l'outil Supabase exige une confirmation humaine pour chaque écriture, elle a expiré,
rien n'a été écrit (vérifié ensuite). Instantané du schéma de production (sans données) pris avant la tentative.

## 3. Tableau de contrôle

VERT = démontré par un contrôle réussi aujourd'hui ; ORANGE = incomplet ou dépendant d'une action extérieure ; ROUGE = défaut
bloquant ou risque confirmé.

| Domaine | Statut | Justification |
|---|---|---|
| Fonctionnalités Web (candidat) | VERT | 591 tests unitaires ; suite navigateur complète 1 033/1 034 puis le seul échec corrigé (voir § 4 pour la dernière exécution) |
| Fonctionnalités Android (candidat) | ORANGE | Typage et 808 tests Jest verts ; parcours émulateur et build natif dans la CI ; aucun téléphone réel, aucun TalkBack |
| Cohérence Web/Android | ORANGE | Moteur commun testé (`ascension-parity`, `sport-navigation`) ; captures Android issues de l'aperçu navigateur, pas d'appareil |
| UX/UI | ORANGE | Refonte des écrans clés faite par la session précédente ; aucun test avec de nouveaux utilisateurs (protocole prêt dans `lot3-4-ux-android.md`) |
| Illustrations | ROUGE | Blasons Champion, Titan, Légende absents (le code retombe sur le dessin vectoriel). Génération tentée : refusée pour **crédits insuffisants** ; l'hôte de téléchargement `res-prod.buzzy.now` est désormais autorisé dans l'environnement |
| Sécurité (code) | VERT | 3 résidus fermés aujourd'hui avec tests rouge/vert ; audit npm Web 0, Android 0 critique/élevée (3 modérées, 9 faibles) |
| Sécurité (production) | ROUGE | Amitié forcée et fonctions Coach internes encore exposées tant que le paquet n'est pas appliqué |
| Base de données (dépôt) | VERT | Deux chaînes de migrations et tous les tests SQL et contrats concurrents verts sur PostgreSQL 16 local |
| Migrations production | ROUGE | 10 en attente ; paquet prêt et répété ; application bloquée sur la confirmation du propriétaire |
| Paiements | ORANGE | Chaîne jamais prouvée de bout en bout (aucun achat de licence) ; produits Play à garder inactifs |
| Tests | VERT | Web, SQL, Android verts ; un test intermittent corrigé sans toucher aux assertions |
| Builds | ORANGE | Build public Web vert ; build Android natif à relire dans la CI de la PR |
| CI GitHub | ORANGE | Verte sur `6295e49` (#148) ; à relire sur la tête de cette branche |
| Déploiements | ROUGE | Site en ligne ancien (CGU v6) ; fusion et autorisation `TITAN_APPROVED_RELEASE_SHA` requises côté propriétaire |
| SEO | ORANGE | Audit statique sans erreur ; avertissements restants = pages privées `noindex` dont le `h1` existe au rendu (vérifié dans Chromium) ; rien de mesurable avant déploiement |
| Textes légaux | ORANGE | Version 8/12 dans le candidat ; validation juridique humaine en attente ; politique de confidentialité complétée (rapports techniques 90 jours) |

## 4. Tests exécutés dans cette session

| Suite | Résultat |
|---|---|
| `pnpm run verify` (typage, 591 tests, build, audit, garde de release) | Vert |
| E2E Playwright complet (Chromium) sur `6295e49` | 1 033 / 1 034 ; l'échec (`journey-v13`, course) corrigé et rejoué 40 fois sous charge |
| E2E complet sur la tête finale | Voir le message de fin de session (relancé après le dernier commit) |
| `tools/db/test-migrations.sh` et variante `RELEASE_SQL=supabase/release-300.sql` | Verts (PostgreSQL 16) |
| Paquet de production, 10 fichiers, réplique neuve | Empreinte finale `private 91 bae05c10ca57 d52d12beba17`, `public 293 db4eeb91a3d2 8f112d92ff21`, rejeu refusé |
| Android `tsc --noEmit`, Jest | Vert, 78 suites, 808 tests |
| Audits de dépendances | Web 0 ; Android 0 critique/élevée |

## 5. Par quoi reprendre (ordre recommandé)

1. **Appliquer le paquet** `supabase/release-v131/` (procédure dans son `README.md`) dans une session où le propriétaire confirme
   les écritures, puis `99-check-after.sql` et les deux postflights. C'est ce qui ferme la faille de production.
2. **Fusionner** cette branche (elle contient #148), déployer le site avec l'autorisation du SHA, vérifier que les CGU en ligne
   passent en version 8.
3. **Blasons manquants** : recharger des crédits du générateur, puis produire Champion, Titan, Légende avec le blason Gardien comme
   référence (fond magenta uni pour le détourage, 256 et 512 px WebP dans `assets/ranks/`, ajout à `BADGES` dans `js/app/crest.js`
   et au composant `mobile/src/components/Crest.tsx`). Approbation humaine avant intégration (voir #147).
4. Tableau de bord Supabase : retirer les deux politiques `INSERT` du seau `avatars` et supprimer l'objet orphelin (D7/D8),
   activer la protection des mots de passe compromis et le second facteur du compte administrateur (D10).
5. Chaîne d'achat Google Play sur banc isolé (`lot2-paiements.md`), puis activation des produits en dernier.
6. Chantiers longs : allègement des ~275 Ko de scripts Web (LCP du QG, de la Séance et du Profil inchangé), générateur de
   `service.html` (le régénérer réécrit la page : non fait ici), tests avec 5 à 10 nouveaux utilisateurs, téléphone réel.

## 6. Risques résiduels

- Tant que le paquet n'est pas appliqué : amitié forgeable, aides Coach exécutables, export de compte en échec pour certains comptes.
- Les insertions anonymes de `contact_messages` et `analytics_events` restent sans limite par appelant (décision produit, D9).
- Aucune garantie d'absence totale de faille : les contrôles ci-dessus couvrent les scénarios testés et les dérives mesurées.
