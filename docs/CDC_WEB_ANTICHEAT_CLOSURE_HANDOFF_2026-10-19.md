# Handoff — lot de neuf points : détection anti-triche et surface d'administration (Claude, 19/10/2026)

Consigne de Théo : neuf points par reprise, trois terminés au minimum. Résultat : huit exigences fermées avec preuves, une (BOT06) examinée et laissée ouverte.

| Point | Statut | Preuve |
|---|---|---|
| CHEAT04 — ne jamais rejeter pour un record approché | [x] | `300_reward_holds.sql` : une séance 30 % au-dessus du rythme habituel est acceptée, récompensée, non retenue ; `300_false_positives.sql` : cas « near_record » (+25 %) reste « normal » ; seuls les bornes physiques du garde (300 km, 24 h, 12 000 m) rejettent |
| CHEAT06 — chevauchements impossibles | [x] | signal `overlap` paire par paire, `300_session_risk.sql`, revues |
| CHEAT07 — volumes journaliers incohérents | [x] | signal `day_volume` (12 h moyen, 16 h élevé), limite à 960 min testée |
| CHEAT08 — sauts de performance vs historique | [x] | signal `speed_jump` contre la médiane personnelle (≥ 5 séances) pour les sports de distance ; autres métriques au backlog |
| CHEAT10 — multisport performant non suspect | [x] | `300_false_positives.sql` : « multisport_elite » (course 15 km/h, vélo 32 km/h, natation 3,5 km/h sur les mêmes jours), « volume », « double_day » : jamais en revue |
| CHEAT11 — pas de plafond arbitraire hors sports à record | [x] | aucun plafond par sport n'existe ; seul le garde physique global ; « no_reference » (curling, 5 000 à 18 500 points) jugé sur son propre historique |
| QA03 — tests du moteur avec cas normaux et extrêmes | [x] | `300_training_anticheat`, `300_session_risk`, `300_false_positives` (11 profils), `300_rate_limits`, `300_risk_analysis`, `300_reward_holds`, `300_session_exclusion`, `300_exclusion_effect`, `300_appeals` |
| BOT08 — aucun accès public aux outils de modération | [x] | `300_admin_surface.sql` : aucune fonction `titan_admin*`/`moderation`/`appeal`/`session_exclusion`/`session_risk` exécutable par anon ou PUBLIC ; fonctions privées d'administration gardées dans leur corps ; toutes les tables privées avec sécurité par ligne et sans droit API (sauf les vues d'analyse du joueur par politique). Production lue en lecture seule : anon n'a pas l'usage du schéma `private`, 0 fonction `titan_admin*` exécutable par anon |
| BOT06 — actions graduelles | [~] | aucune action, surveillance, retrait du classement (exclusion), retenue des récompenses, suspension : en place. **Manque la « demande de vérification »** (message de l'administrateur au joueur) : non simulée ; demande une extension de la table de décisions |

Défaut réel trouvé et corrigé : `private.titan_rate_events` (migration `20261019200000_rate_limits.sql`) n'avait pas la sécurité par ligne activée (droits déjà retirés) ; ajoutée.

## BLOQUANT À CORRIGER MAINTENANT
Aucun.
## NON BLOQUANT – BACKLOG FINITION
CHEAT08 pour les sports sans distance ; BOT06 « demande de vérification » ; confirmer dans les paramètres API Supabase que le schéma `private` n'est pas exposé (non lisible en SQL) ; fonction `private.titan_admin_role_for` accessible au rôle connecté si le schéma était exposé (assistant des gardes).
## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE
CHEAT05 et CHEAT09 (performance humaine plausible, séries improbables) ; BOT06 ; formulaire de recours joueur ; premier build Android.
