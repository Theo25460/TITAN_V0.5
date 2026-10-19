# RPG08 / RPG12 / RPG15 — objectifs personnels

Lot101, sur PR100. Conception et plan dans docs/superpowers. Aucun déploiement, fusion ou donnée réelle.

Les nouveaux chapitres figent leur objectif principal depuis le profil serveur des 28 derniers jours admissibles. Chapitres1–8 : minimum entre jours du profil et cible catalogue. Gardien : deux à trois jours distincts, effort = jours × cible personnelle15–45, donc30–135minutes. Plafond90minutes/jour conservé ; aucun sport spécifique, aucun record à battre, aucune échéance. Insignes identiques et aucun bonus XP/crédits.

Migration20261019062757_adventure_personal_targets_v4.sql : main_objective version1 pour les nouveaux départs ; version0 pour conserver exactement les conditions des chapitres actifs (dont gardien3/150). Dates/routes/chapitres/profil de quêtes/insignes/sources/soldes intacts. Snapshotv4 et claim utilisent les mêmes valeurs figées sous verrou/révision existants. Réapplication sans écraser les contrats.

Mission, détails du chapitre courant et gardien lisent les valeurs serveur. Futur personnel : cible annoncée au départ ; passé : aucune reconstruction. Explication des cibles figées et contrat historique. Découverte et ancien serveur gardent leurs conditions fixes ; copie publique distingue ces modes. Message de refus sans chiffre150 imposé. Versions du moteur avancées sur les pages consommatrices ; Profil laissé au chantier actif.

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important confirmé par la revue indépendante. La remise exige la CI finale verte, avec ses trois logs lus sur la tête exacte ; les références finales sont dans la PR101 et le CDC.

## NON BLOQUANT – BACKLOG FINITION

Autres systèmes d'objectifs, recette compte/appareil réel, PWA installé et lecteur physique hors lot. Profil et son accroche/cache restent au chantier actif. Avertissements existants non traités. Minor différé de revue : le panneau de gardien historique sans effort_target mentionne encore le plafond90minutes, sans effet sur les conditions de validation (les autres panneaux expliquent que cette épreuve arrive plus tard). Matrice SQL temps comprimé et déplacements administratifs synthétiques : ne prouve pas36chapitres en une journée réelle. Aucun objectif médical ni équivalence physiologique déduite du volume déclaré.

## EXIGENCE OU MACRO-BLOC SUIVANT

Reprendre un macro-bloc RPG encore libre selon les statuts actuels et respecter le checkpoint après huit PR empilées. RPG08/RPG12/RPG15 restent partiels pour les systèmes hors chapitres Aventure.

## Preuves

Avant implémentation : SQL RED snapshot4 dans les deux voies de run39210064663 ; trois RED navigateur et un RED message de refus. Local217/217 tests, build108 ressources, audit0erreur/16avertissements existants. 17/17navigateurs ciblés verts, dont les trois nouveaux cas avec deux largeurs. Revue indépendante : aucun Critical/Important,43/43unitaires rejoués ; un Minor différé. Preuves SQL et CI complète datées dans la PR/CDC.

## Décisions d'exécution

Suivi initial manuel, puis helpers task-start/task-done/review-package utilisés dès que les skills sont devenus exécutables. Les jugements production/médicaux/fichiers étrangers exclus par la revue restent hors lot ; SQL/CI et rendu sont vérifiés par le coordinateur. Risque restant : absence de certification sur compte/appareil réel.
