# Handoff — lot de neuf points : détection restante et sécurité structurante (Claude, 20/10/2026)

| Point | Statut | Preuve |
|---|---|---|
| CHEAT05 — performance humaine impossible | [x] | signal `beyond_human` (sévérité élevée, donc retenue 24 h des gains et revue humaine, jamais de rejet) : course > 30 km/h, marche > 16 km/h, natation > 7 km/h (kilomètres ou mètres : la natation est enregistrée en mètres) tenus au moins 15 minutes, très au-delà des records du monde correspondants ; sports pouvant être motorisés ou en descente (vélo, ski…) volontairement exclus ; `sql/tests/300_risk_signals_extra.sql` (plafond testé, mutation vérifiée) |
| CHEAT09 — séries de performances extraordinaires | [x] | signal `extraordinary_series`, **niveau « à surveiller » seulement** (moyen, jamais de retenue à lui seul) : au moins 3 séances de dates distinctes d'un sport à propulsion humaine (course, marche, natation) en 14 jours, d'au moins 20 minutes, à ≥ 1,5 × la médiane personnelle du sport (≥ 8 séances) ; un progressant régulier, deux records isolés et un athlète qui reprend (+50 %) n'atteignent jamais la revue ; mutation vérifiée |
| SEC01 — RLS et isolation | [x] | `sql/tests/300_rls_coverage.sql` : toute table publique a la sécurité par ligne, aucune politique d'écriture ouverte à tous ; conseillers de sécurité Supabase lus sur la production : aucune table sans RLS, aucune politique « toujours vraie » ; isolation par fonctionnalité déjà testée (suppression de compte, social, économie, support) |
| SEC02 — le client ne modifie pas coins, XP, Premium, inventaire, sanctions, revue des séances | [x] | `sql/tests/300_client_writes.sql` : 23 écritures directes (profils, séances, historique d'achats, inventaire, Premium, succès, facturation, signaux) refusées ou sans effet ; contrôle de non-vacuité (instruction cassée détectée, permissions ouvertes → test rouge) ; complète `300_economy_attacks.sql` ; **deux défauts réels trouvés par la revue et corrigés** (migration `20261020010000_client_write_hardening.sql`, 23e) : `contest_entries` (le joueur choisissait `is_eligible` et le motif d'exclusion) et `titan_moderation_reports` (un signalement pouvait être créé déjà résolu) |
| SEC04 — idempotence des opérations sensibles | [x] | reçu rejouable des séances (et test à deux connexions), achat cosmétique unique (index) et achats concurrents, événements de facturation uniques (`tests/webhook.test.mjs`), vues d'analyse et support (rejeu = un seul enregistrement), exclusion/recours/retenues (règlement une seule fois), suppression de compte rejouable |
| SEC09 — permissions Android minimales | [~] | architecture TWA : aucune notification ni fonction (localisation, facturation) activée, contrôlé à chaque `release-check` ; le manifeste Android réel n'existe pas avant le premier build (AND03) : à relire alors |
| QA14 — aucun placeholder/clé de test en production | [~] | contrôle de build en place (identifiant de test publicitaire, jeton bac à sable, lorem ipsum, marqueurs non remplis) ; reste « faux prix » et contenu de démonstration (revue manuelle de la boutique) |
| BOT06 — actions graduelles | [~] | inchangé : manque la « demande de vérification » ; aucun canal lisible par le joueur n'existe (`admin_messages` est fermé et non lu) ; voir Q-005 |
| Maintenance | — | `sql/tests/300_social.sql` ne dépend plus de l'heure (les deux séances portent la même date) |

Interface : l'écran de modération affiche les deux nouveaux signaux (`js/admin.js` v300.7).

Constat de configuration (action humaine) : le conseiller Supabase signale « protection contre les mots de passe divulgués » **désactivée** (réglage Auth du tableau de bord).

Revue indépendante : (1) la natation n'était pas couverte (unité en mètres) — corrigé et testé ; (2) faux positifs possibles de la série — niveau abaissé à « à surveiller », sports motorisés exclus, dates distinctes ; (3) deux tables à écriture client choisie — corrigé par migration et testé ; (4) preuves renforcées dans `300_client_writes.sql` (comptage de refus, codes d'erreur de test cassé). Restent non couverts : lectures ouvertes dans `300_rls_coverage.sql` (seules les politiques d'écriture littéralement vraies sont vues), `speed_jump` pour la natation en mètres désormais couverte via la même colonne.

## BLOQUANT À CORRIGER MAINTENANT
Aucun.
## NON BLOQUANT – BACKLOG FINITION
Activer la protection contre les mots de passe divulgués (réglage Supabase) ; plafonds `beyond_human` pour d'autres sports ; relire le manifeste Android au premier build ; faux prix et démonstration (QA14) ; Premium accordé par l'administrateur non idempotent (`titan_admin_grant_premium_v1`).
## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE
BOT06 (après Q-005) ; formulaire de recours joueur ; premier build Android.
