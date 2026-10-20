# Contrats de sécurité web — plan

> **For agentic workers:** Use superpowers:executing-plans, systematic-debugging and test-driven-development. The master spec already authorizes the security work; this is a continuation of that scope.

**Objectif :** prouver l'isolation et l'autorité serveur avec des identités synthétiques, puis corriger uniquement les écarts reproduits. Cahier maître : SEC01/SEC02/SEC03 et QA04.

**Base :** `e903ac3`, branche `codex/web-securite-cdc`, indépendante de la navigation PR #19. Production en lecture seule. Aucun changement de paiement, Android ou données réelles.

**Constat initial :** le helper privé `titan_card_settings_json` est invoker, sans search_path fixé ; advisor 0011. Les anciennes RPC combat et réconciliation sont accessibles, mais la lecture montre respectivement récompenses nulles et rapport sans mutation : les tests doivent le prouver, pas inventer une faille.

**Architecture :** suites `sql/tests/300_*.sql` dans le banc éphémère existant et migration créée par Supabase CLI 2.120.0. Une fixation du search_path ne doit changer ni signature, ni droits, ni contenu des cartes. Les tests utilisent les rôles `authenticated`/`anon`, les claims JWT et deux propriétaires, dans des transactions annulées. Le banc CI remplace PostgreSQL indisponible dans ce conteneur.

## Task 1 — Contrats adverses et reproduction

- [x] Couvrir lecture/édition/archive d'une séance d'autrui, profils, inventaire et achats d'autrui, export limité au propriétaire.
- [x] Couvrir objectifs : création chez autrui, transfert de propriétaire, mutation non autorisée et parcours valide.
- [x] Tenter une sauvegarde client de crédits/XP/Premium/inventaire/identité et vérifier les valeurs serveur ; version périmée et types invalides.
- [x] Vérifier combat avec multiplicateurs extrêmes et réconciliation falsifiée sans récompense ni mutation.
- [x] Vérifier les refus anonymes/suspendus et l'absence de privilèges issus de user_metadata.
- [x] Reproduire le search_path hérité en plaçant un objet synthétique homonyme dans un schéma contrôlé du banc ; le JSON de la carte doit rester canonique.
- [x] Exécuter ces tests sur la réplique et conserver l'échec avant correction (CI 37768052478).

## Task 2 — Correction minimale et vérification

- [x] Fixer le search_path du helper avec une migration compatible ; corriger toute autre erreur uniquement après preuve et test.
- [x] Rejouer les suites SQL et les contrôles web existants ; vérifier cartes activées/désactivées, contenus masqués et rétention inchangés (CI 37768637113).
- [x] Faire relire les droits, gardes, fixtures et rollback. Aucun constat bloquant ; deux assertions de couverture renforcées.
- [x] Documenter l'audit, la migration non appliquée et les limites ; synchroniser le cahier avant commit.
- [x] Créer la PR #20 avec une première CI verte, préserver la PR #19 et préparer le handoff final. La libération du périmètre sera inscrite dans le cahier après les checks de la tête finale.

## Review Focus

Le banc doit réellement exécuter sous un rôle restreint, pas sous superuser avec des assertions de catalogue seulement. Les fixtures ne doivent pas ouvrir des droits applicatifs permanents. Les exceptions attendues doivent être précises ; aucune assertion échouée ne doit être avalée par un `when others`. Une migration ne modifie aucune ligne utilisateur et garde signature, grants, invoker et résultat. Ne pas fermer SEC01/SEC03 globalement pour une couverture partielle.
