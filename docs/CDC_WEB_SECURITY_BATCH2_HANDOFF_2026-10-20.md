# Handoff — lot de neuf points : détection restante et sécurité structurante (Claude, 20/10/2026)

| Point | Statut | Preuve |
|---|---|---|
| CHEAT05 — performance humaine impossible | [x] | signal `beyond_human` (sévérité élevée, donc retenue 24 h des gains et revue humaine, jamais de rejet) : course > 30 km/h, marche > 16 km/h, natation > 7 km/h tenus au moins 15 minutes, très au-delà des records du monde correspondants ; sports pouvant être motorisés ou en descente (vélo, ski…) volontairement exclus ; `sql/tests/300_risk_signals_extra.sql` (plafond testé, mutation vérifiée) |
| CHEAT09 — séries de performances extraordinaires | [x] | signal `extraordinary_series` : au moins 3 séances d'un sport en 14 jours à ≥ 1,5 × la médiane personnelle du sport (≥ 8 séances) ; un progressant régulier (+3 %/semaine) et deux records isolés ne déclenchent rien ; mutation vérifiée |
| SEC01 — RLS et isolation | [x] | `sql/tests/300_rls_coverage.sql` : toute table publique a la sécurité par ligne, aucune politique d'écriture ouverte à tous ; conseillers de sécurité Supabase lus sur la production : aucune table sans RLS, aucune politique « toujours vraie » ; isolation par fonctionnalité déjà testée (suppression de compte, social, économie, support) |
| SEC02 — le client ne modifie pas coins, XP, Premium, inventaire, sanctions, revue des séances | [x] | `sql/tests/300_client_writes.sql` : 23 écritures directes (profils, séances, historique d'achats, inventaire, Premium, succès, facturation, signaux) refusées ou sans effet ; contrôle de non-vacuité (instruction cassée détectée, permissions ouvertes → test rouge) ; complète `300_economy_attacks.sql` |
| SEC04 — idempotence des opérations sensibles | [x] | reçu rejouable des séances (et test à deux connexions), achat cosmétique unique (index) et achats concurrents, événements de facturation uniques (`tests/webhook.test.mjs`), vues d'analyse et support (rejeu = un seul enregistrement), exclusion/recours/retenues (règlement une seule fois), suppression de compte rejouable |
| SEC09 — permissions Android minimales | [~] | architecture TWA : aucune notification ni fonction (localisation, facturation) activée, contrôlé à chaque `release-check` ; le manifeste Android réel n'existe pas avant le premier build (AND03) : à relire alors |
| QA14 — aucun placeholder/clé de test en production | [~] | contrôle de build en place (identifiant de test publicitaire, jeton bac à sable, lorem ipsum, marqueurs non remplis) ; reste « faux prix » et contenu de démonstration (revue manuelle de la boutique) |
| BOT06 — actions graduelles | [~] | inchangé : manque la « demande de vérification » ; aucun canal lisible par le joueur n'existe (`admin_messages` est fermé et non lu) ; voir Q-005 |
| Maintenance | — | `sql/tests/300_social.sql` ne dépend plus de l'heure (les deux séances portent la même date) |

Interface : l'écran de modération affiche les deux nouveaux signaux (`js/admin.js` v300.7).

Constat de configuration (action humaine) : le conseiller Supabase signale « protection contre les mots de passe divulgués » **désactivée** (réglage Auth du tableau de bord).

## BLOQUANT À CORRIGER MAINTENANT
Aucun.
## NON BLOQUANT – BACKLOG FINITION
Activer la protection contre les mots de passe divulgués (réglage Supabase) ; plafonds `beyond_human` pour d'autres sports ; relire le manifeste Android au premier build ; faux prix et démonstration (QA14) ; Premium accordé par l'administrateur non idempotent (`titan_admin_grant_premium_v1`).
## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE
BOT06 (après Q-005) ; formulaire de recours joueur ; premier build Android.
