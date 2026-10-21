# Handoff — lot de neuf points : détection anti-triche et surface d'administration (Claude, 19/10/2026)

Consigne de Théo : neuf points par reprise, trois terminés au minimum. Résultat : huit exigences fermées avec preuves, une (BOT06) examinée et laissée ouverte.

| Point | Statut | Preuve |
|---|---|---|
| CHEAT04 — ne jamais rejeter pour un record approché | [x] | `300_reward_holds.sql` : une séance 30 % au-dessus du rythme habituel est acceptée, récompensée, non retenue ; `300_false_positives.sql` : cas « near_record » (×1,45, juste sous le seuil 1,5) reste « normal » ; seuls les bornes physiques du garde (300 km, 24 h, 12 000 m) rejettent |
| CHEAT06 — chevauchements impossibles | [x] | signal `overlap` paire par paire (moyen : ≥ 50 % du plus court et ≥ 10 min ; élevé : ≥ 90 % et ≥ 20 min, hors instants identiques de sports différents), `sql/tests/300_session_risk.sql` |
| CHEAT07 — volumes journaliers incohérents | [x] | signal `day_volume` (12 h moyen, 16 h élevé), limite à 960 min testée |
| CHEAT08 — sauts de performance vs historique | [x] | signal `speed_jump` : ×1,5 moyen, ×2 élevé contre la médiane personnelle (≥ 5 séances du même sport, unité km) ; autres métriques au backlog |
| CHEAT10 — multisport performant non suspect | [x] | `300_false_positives.sql` : « multisport_elite » (course 15 km/h, vélo 32 km/h, natation 3,5 km/h sur les mêmes jours, puis un record personnel de +20 % dans chaque sport le même jour), « volume », « double_day » : jamais en revue |
| CHEAT11 — pas de plafond arbitraire hors sports à record | [x] | aucun plafond par sport n'existe ; seul le garde physique global (300 km, 24 h, 12 000 m) ; aucune règle de vitesse ni de distance ne lit les sports hors kilomètres, seul le volume du jour s'applique ; `300_reward_holds.sql` : la vraie RPC accepte 18 500 points de curling, non retenus ; `300_false_positives.sql` : « no_reference » |
| QA03 — tests du moteur avec cas normaux et extrêmes | [x] | `300_training_anticheat`, `300_session_risk`, `300_false_positives` (11 profils), `300_rate_limits`, `300_risk_analysis`, `300_reward_holds`, `300_session_exclusion`, `300_exclusion_effect`, `300_appeals` |
| BOT08 — aucun accès public aux outils de modération | [x] | `300_admin_surface.sql` : aucune fonction `titan_admin*`/`moderation`/`appeal`/`session_exclusion`/`session_risk` exécutable par anon ou PUBLIC ; fonctions privées d'administration gardées dans leur corps ; toutes les tables privées avec sécurité par ligne et sans droit API (sauf les vues d'analyse du joueur par politique) ; tables et vues publiques d'administration, de modération et d'audit avec sécurité par ligne et rien pour anon ; couvre aussi `titan_economy_journal_v1`, `is_admin`, `check_if_admin`. Production lue en lecture seule : anon n'a pas l'usage du schéma `private`, 0 fonction `titan_admin*` exécutable par anon |
| BOT06 — actions graduelles | [~] | aucune action, surveillance, retrait du classement (exclusion), retenue des récompenses, suspension : en place. **Manque la « demande de vérification »** (message de l'administrateur au joueur) : non simulée ; demande une extension de la table de décisions |

Défaut réel trouvé et corrigé : `private.titan_rate_events` (migration `20261019200000_rate_limits.sql`) n'avait pas la sécurité par ligne activée (droits déjà retirés) ; ajoutée.

Revue indépendante : aucun défaut bloquant ; preuves renforcées après ses remarques (CHEAT11 par la vraie RPC, record à ×1,45, record multisport, regex d'énumération élargie, tables publiques d'administration). Limites connues : le contrôle « gardé dans son corps » des fonctions privées est textuel (la seule mention du nom d'un garde suffit) ; `public.admin_whitelist` a une politique `USING (true)` inerte faute de droit SELECT (à resserrer si un droit est un jour accordé).

## BLOQUANT À CORRIGER MAINTENANT
Aucun.
## NON BLOQUANT – BACKLOG FINITION
CHEAT08 pour les sports sans distance ; BOT06 « demande de vérification » ; confirmer dans les paramètres API Supabase que le schéma `private` n'est pas exposé (non lisible en SQL) ; fonction `private.titan_admin_role_for` accessible au rôle connecté si le schéma était exposé (assistant des gardes).
## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE
CHEAT05 et CHEAT09 (performance humaine plausible, séries improbables) ; BOT06 ; formulaire de recours joueur ; premier build Android.
