# Progression RPG et départ de campagne — 18 octobre 2026

Lot RPG01 / RPG15 / RPG17, premier lot après checkpoint95. Le diagnostic manquant est finalisé dans CDC_WEB_RPG_AUDIT_2026-10-11.md ; la date de finalisation réelle est explicite.

## Résultat

- Lecteur commun TitanProgress.campaignProgress : objectifs provenant du snapshot confirmé, valeurs bornées, reste et état prêt. La progression globale suit la condition la moins avancée ;3/3 jours et40/150 minutes donnent27%, pas100%. Les cibles historiques sans effort_target restent en jours seulement.
- QG et Aventure utilisent cette même lecture et montrent le reste. Le bouton existant de validation reste dépendant de toutes les conditions ; aucune validation ou récompense automatique ajoutée.
- Guide au départ de campagne : commencer avant la prochaine séance, historique conservé, sport libre, chemin Observation, retour pour valider, insigne distinct des XP/coins de séance, mode local ou serveur. Pas de nouvel écran ou de préférence persistée.
- Core progress300.3 sur les deux pages concernées, QG300.2, Aventure300.1. Les autres consommateurs restent compatibles ; aucun moteur/RPC/SQL/règle économique ou fichier Profil modifié.

## Vérifications

- RED : trois tests unitaires sur la lecture absente, quatre parcours navigateur sur les informations manquantes du QG/Aventure/départ et la route annotée historique. Les erreurs attendues ont été observées avant implémentation.
- GREEN : pnpm verify191/191,62 scripts analysés, build104 ressources offline, audit0erreur/16 avertissements préexistants ;16 tests progress inclus dans cette base.
-21/21 navigateur :4 nouveaux parcours RPG,14 contexte QG existants,2 confirmations Aventure et1 ancien cache PWA existants.0échec/cancelled/skipped. Les quatre nouveaux cas sont raccordés à test:e2e. Deux contrôles RED supplémentaires issus du rendu ont vérifié le résumé non tronqué et la conservation du guide ouvert après rafraîchissement ; correctifs inclus dans la relance finale.
- Revue indépendante unique : aucun Critical/Important confirmé ;16/16 tests progress rejoués par le reviewer. Les détails facultatifs ne rouvrent pas un audit transversal.
- Rendu QG et guide ouvert à360/1280px ; contrôle de débordement et inspection des captures. Diff check.

## Statuts et limites

RPG01 peut être fermé pour l’audit demandé ; les conclusions ne constituent pas une étude du ressenti. RPG17 peut être fermé pour l’explication de la boucle actuelle au départ. RPG15 reste partiel : les objectifs actuels sont cohérents, mais les futures quêtes/combats devront se brancher sur leur source autoritaire propre.

Scénarios avec snapshots synthétiques et modules réels ; aucun compte ni backend réel. Pas de nouvelle validation SQL, d’équilibrage, de règle d’accès, de difficulté adaptative ou de récompense. Android/appareils/PWA installés, lecteurs d’écran et autres moteurs non certifiés. Suite E2E entière et CI distante de cette nouvelle PR non exécutées ; les665 cas du checkpoint parent restent une preuve du parent, pas du présent lot.

## BLOQUANT À CORRIGER MAINTENANT

Aucun Important confirmé restant dans ce lot.

## NON BLOQUANT – BACKLOG FINITION

Variantes de confort et avertissements existants ; pas de seconde PR de polissage de ces écrans.

## EXIGENCE OU MACRO-BLOC SUIVANT

RPG02 / RPG04 / RPG08 : première zone, mini-quêtes et adaptation au profil. Le verrou Titan+ existant sur deux campagnes est un écart à résoudre dans leur conception client/serveur ; ne pas le masquer côté interface. Audit borné désormais livré, pas à refaire avant ce lot sans changement concret.

## Dépendance et retour arrière

Parent PR95 HEAD26a9caf64d169777252ad9fde8cd9f9df825be09, arbre7cc1b741957e273f64589860b0357d39de8112c9 identique au local003060677c0911a98632402e509c230261674d56. Branche codex/rpg-progression-onboarding-cdc, PR vers la branche du checkpoint. Pas de fusion/déploiement ; aucun compte/base/provider réel ou fichier étranger touché. Pour abandonner le lot, fermer sa PR ; aucune écriture de données à annuler.
