# Handoff — tests de faux positifs du risque par séance (CHEAT20, Claude, 19/10/2026)

`sql/tests/300_false_positives.sql` (banc de migrations, rollback complet) rejoue huit profils légitimes sur `private.titan_session_risk` et exige qu'aucune séance n'atteigne la revue humaine (score ≥ 8) :
débutant, athlète avancé (24 jours à 15–16 km/h), très gros volume (triathlon longue distance, 11 h sans chevauchement : au plus « à surveiller »), reprise après pause (200 jours de silence), import historique (40 doublons marqués historiques), sport atypique (escalade en minutes, marche, natation lente), progression nette (+37 % de vitesse), double séance dans la journée.
Sensibilité vérifiée : porter la séance de progression à 20 km/h (×2,5) fait échouer le test sur `speed_jump`, comme voulu.

Limites assumées : un bond de vitesse ≥ ×2 par rapport à la médiane personnelle (au moins 5 séances) reste une revue humaine, même pour une vraie progression ; un seuil trop bas serait un faux positif massif, un seuil plus haut raterait les copies. Le signal est explicable et ne déclenche aucune action automatique. Un recours côté joueur (CHEAT19) n'existe pas encore.

## BLOQUANT À CORRIGER MAINTENANT
Aucun.
## NON BLOQUANT – BACKLOG FINITION
Profils importés avec dates non historiques, sports à vitesse très variable (trail dénivelé vs plat), calibrage sur données réelles agrégées (jamais individuelles).
## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE
CHEAT19 (procédure de recours), CHEAT15 strict (retenue des récompenses), build Android.
