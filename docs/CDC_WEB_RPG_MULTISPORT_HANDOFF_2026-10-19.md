# Équité multisport — RPG05 / RPG06 / RPG07 — 19 octobre 2026

## Objectif et méthode

Le lot reprend la PR99 et vérifie les règles existantes, sans ajouter une fonctionnalité ni modifier arbitrairement l’équilibre pour cocher le cahier. Une seule pratique doit permettre de terminer les quatre campagnes et leurs mini-quêtes ; la variété reste facultative. La parité compare des durées et intensités déclarées équivalentes, pas des kilomètres, mètres nagés ou kilos soulevés artificiellement assimilés.

Périmètre : nouveaux tests de contrat Node, SQL et navigateur, inscription dans les commandes de recette et ce handoff. Aucun code produit, migration ou règle économique modifié. La recette est une caractérisation : les contrats sont censés passer sur la PR99 ; aucun RED artificiel n’est revendiqué.

## Matrice de preuve

- Node utilise les vrais modules catalogue, effort, progression, quêtes et moteur découverte avec une horloge contrôlée. Natation seule, course seule, musculation seule et pratique variée terminent les 36chapitres de chaque chemin Rythme/Observation. Chaque étape compare objectifs, jours, effort, progression, XP/crédits et collection ; les36insignes persistent sans doublon.288validations locales complètes.
- Les260sports du catalogue reçoivent le même effort calculé lorsque50minutes et RPE5 sont déclarés. C’est un contrôle du calcul, pas une mesure physiologique de l’effort réel ni une égalité entre distances/charges différentes.
- SQL appelle réellement titan_submit_training_session, titan_adventure_snapshot et titan_adventure_action sous authenticated. Quatre pratiques ×deux chemins ×36chapitres =288validations, avec cibles, trois missions facultatives et gains confirmés identiques à chaque étape.36insignes et108souvenirs par parcours complet. Les profils sont synthétiques et toute la transaction est annulée.
- Un autre parcours SQL soumet trois séances et bat réellement le gardien avec chacun des sports du catalogue. Cela verrouille l’absence de liste cachée de disciplines autorisées dans les preuves de campagne.
- Une séance longue de120minutes sur un jour reste plafonnée à90minutes de preuve et ne remplace pas les trois jours du gardien, en Node, SQL et navigateur, pour chacune des trois pratiques seules.
- Playwright exerce les vrais boutons et le moteur découverte à360/1280, avec quatre profils de pratique et les quatre gardiens. Chaque célébration est fermée par son bouton Continuer. Les gardiens sont prépositionnés au chapitre9 pour ce test d’interface ; seuls quatre insignes de gardien sont donc attendus dans ce stockage de recette. La preuve du parcours complet36chapitres appartient aux matrices Node/SQL, pas à cette fixture navigateur. La découverte ne fabrique pas les souvenirs de comptes serveur.
- Les préparatifs hebdomadaires conservent les mêmes mesures et objectifs avec un seul sport ou plusieurs. Le parcours varié n’obtient aucun avantage de progression de campagne à effort/dates identiques ; la maîtrise propre à chaque discipline reste naturellement différente et hors comparaison.

## Limites des fixtures SQL

La recette complète comprime le temps : un administrateur jetable repositionne le départ de chaque chapitre quatre jours avant les séances, puis retire les anciennes sources synthétiques entre étapes. Cela évite plusieurs mois d’attente et les limites d’ingestion réelles, sans désactiver les gardes des RPC ni inventer leurs réponses. Les cibles figées et les validations/récompenses restent exécutées par le vrai serveur. Ce test ne signifie pas qu’un utilisateur peut parcourir36chapitres en une journée, ne constitue pas une nouvelle preuve d’anti-farming et ne certifie pas une chronologie de production continue. La conservation après modification des sources et la concurrence sont déjà couvertes par la PR99 et restent rejouées.

Les durées manquantes suivent toujours les estimations existantes, propres aux unités/profils. Les résultats n’établissent pas qu’une distance ou charge égale correspond au même effort réel. Pas de compte réel, provider, Android/PWA installé, appareil physique ou grand benchmark certifié.

## Vérification et livraison

Les commandes de référence sont pnpm verify, la suite navigateur intégrée et les deux voies PostgreSQL16 jetables de tools/db/test-migrations.sh. La PR contient les suites de recette ; le résultat sur sa tête publiée et sa référence sont consignés dans le cahier vivant et ses checks GitHub après achèvement. Aucune garantie de CI verte n’est déduite de la seule lecture des tests. Le premier passage SQL a identifié un alias de recette ambigu avec une variable PL/pgSQL ; il est renommé sans suppression ni affaiblissement de l’assertion. La revue indépendante ne relève aucun Critical/Important et rejoue les4tests Node ; elle n’exécute pas PostgreSQL/navigateur indépendamment.

## BLOQUANT À CORRIGER MAINTENANT

Aucun défaut produit confirmé lors de l’exploration et de la matrice locale. La fermeture RPG05/06/07 dépend de la réussite de la matrice serveur sur la tête publiée. Les valeurs de preuve et les gains des comptes restent exclusivement autoritaires côté serveur.

## NON BLOQUANT – BACKLOG FINITION

Coquille et accroche Profil différées dans la PR99 ; pas de reprise de finition. Variété narrative, nouveaux types de quêtes et personnalisation équipée hors lot. Les limites de fixtures et de durée estimée sont explicites ci-dessus.

## EXIGENCE OU MACRO-BLOC SUIVANT

RPG08 / RPG12 / RPG15 : adapter les objectifs principaux et les gardiens au profil, récompenser une progression personnelle soutenable et afficher ces cibles autoritaires sans perdre les acquis. Éviter une nouvelle couche de polissage client ; les quêtes facultatives adaptées et l’équité des pratiques sont désormais les fondations de ce travail.

## Coordination

Parent local c2b3005a07e2a47c3b4e37c0c1cd1224a1f9731e, parent publié a2db02c2f617f1b147355762102854f41037b3fe, même arbre eff0267bc3d04f2c7eca468685d098dcd2917e32. Branche codex/rpg-multisport-contracts-cdc. Profil/smoke, WORK/Android/PlayConsole, images étrangères, données réelles, SQL de production, prix et économie conservés. Aucune fusion ni déploiement. Une revue indépendante borne la qualité de la matrice et la portée de ses conclusions ; pas de nouvelle revue transversale web.
