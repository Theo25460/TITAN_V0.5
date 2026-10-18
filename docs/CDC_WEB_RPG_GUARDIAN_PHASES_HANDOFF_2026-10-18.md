# Obstacles de l’Aube et phases du Veilleur — 18 octobre 2026

Lot RPG03 / RPG09 / RPG10, sur la PR97. Conception bornée au parcours Aventure existant : traduire les objectifs de campagne en rencontres lisibles, préserver leur confirmation et préparer la consolidation serveur suivante.

## Résultat

- Huit obstacles identifiés aux chapitres1–8 de la vallée : voile de brume, pont entravé, ronces du passeur, brume des cèdres, échos trompeurs, mécanisme brisé, sentier obscur et cercle scellé. Leur passage dépend des objectifs actuels du chapitre, pas des mini-quêtes facultatives.
- Au chapitre9, rencontre du Veilleur : éveil au premier jour admissible, effort lorsque le serveur fournit cet objectif, régularité sur les jours requis. Les phases racontent des conditions pouvant avancer ensemble à partir des mêmes preuves ; elles ne sont pas de nouvelles mutations ou des verrous séquentiels cachés.
- Les preuves d’une phase déjà remplie restent lisibles quand une autre manque. Un contrat historique sans effort_target garde ses seules phases de jours.
- État actif ou prêt à confirmer ; la victoire/fin de campagne reste celle du chapitre10 après la validation existante. Aucun bouton ou calcul de récompense supplémentaire.
- Panneau limité au propriétaire du snapshot, retiré immédiatement à account-changing. Autres régions, campagne non commencée et terminée conservent le parcours existant.
- Visuels de gardien et composants existants réutilisés. Nouveau module campaign-encounters300.0 ; Aventure300.3. Aucun asset créé/modifié par ce lot.

## Définition de progression — RPG10

Le modèle choisi est une **épreuve sportive à objectifs**, sans système de dégâts à gérer séparément. Le lecteur partagé campaignProgress fournit la progression : chaque objectif est borné à sa cible et le pourcentage est celui de l’objectif le moins avancé. Le panneau l’explique et expose sa valeur avec un rôle progressbar.

Exemples :3/3jours et40/150minutes →27%, épreuve encore en cours.2/3jours et150/150minutes →67%, il manque un jour.3/3 et150/150 →100%, prêt à valider. L’état100% ne déclare pas de victoire : un refus serveur ou une écriture locale échouée conserve la campagne en cours. Les phases n’attribuent ni XP, ni crédits, ni insigne ; la fonction de réclamation reste intacte.

## Vérification

- 6tests unitaires RED puis GREEN : obstacles, trois phases, effort ne remplaçant pas les jours,100% distinct de validation, contrat historique, limites de région/chapitre et absence de mutation d’entrée.
- 5nouveaux parcours navigateur RED puis GREEN : rendu360/1280 et pourcentage27, refus de validation conservant le chapitre9, historique sans effort inventé, obstacle/transition, véritable moteur découverte confirmant le chapitre10 et stockant un unique insigne final.
- Relance finale : pnpm verify205/205,64scripts,build106ressources offline,audit0erreur/16avertissements préexistants.16/16 navigateur ciblés :5nouveaux,4progression/départ,4mini-quêtes,2confirmations Aventure et1ancien cache PWA.0échec/cancelled/skipped.
- Revue indépendante unique : aucun Critical/Important confirmé ;6/6unitaires rejoués, mutations inchangées et gardes propriétaire/transition relues. Le libellé prêt indique le vrai nom du bouton existant.
- Rendus obstacle et gardien à360/1280 inspectés sans débordement horizontal. Diff check sur le lot ; fichiers étrangers exclus.

## Statuts et limites

RPG03 et RPG09 restent partiels : première région seulement, phases dérivées des preuves actuelles et non nouveau moteur de combat serveur. RPG10 est satisfait pour la définition de progression de ces rencontres ; les futurs combats doivent conserver un modèle aussi explicable et la distinction prêt/confirmé.

Les cas de refus et de rendu utilisent des snapshots synthétiques. La réussite finale utilise le vrai moteur découverte et son stockage local ; elle ne constitue pas une recette avec un compte serveur réel. Aucun nouveau test SQL, compte/provider réel, suite E2E entière ou CI distante de cette PR revendiqué. Autres moteurs, lecteur d’écran physique et Android/PWA installé restent hors validation.

## BLOQUANT À CORRIGER MAINTENANT

Aucun Important confirmé restant dans ce lot. Les règles, mutations, données sportives et récompenses sont inchangées.

## NON BLOQUANT – BACKLOG FINITION

Variantes narratives/visuelles et avertissements existants. Pas de nouvelle série de finition sur les panneaux Aventure. Les limites des missions personnelles de la PR97 restent explicites dans leur handoff.

## EXIGENCE OU MACRO-BLOC SUIVANT

**RPG04 / RPG08 / RPG13 : consolidation serveur** des quêtes, cibles adaptées et récompenses visibles. Concevoir les règles et leur migration avec conservation des chapitres/insignes existants et tests de contrat/parité/concurrence ; ne pas empiler une nouvelle couche narrative client. La restriction Titan+ de deux régions doit être résolue conjointement côté client et serveur pour respecter la campagne gratuite demandée par la doctrine.

## Dépendance et retour arrière

Parent PR97 HEAD78fd84daef90b4a05a44ac3a86191565258c9c24, arbrea0bc224b51b7462810afdf87039235d99457f4a8 identique au localb49946a626f7a10a81fa4c16448ccc023b503456. Branche codex/rpg-guardian-phases-cdc ; sept fichiers propres au lot. Pas de moteur/RPC/SQL/économie/Profil/smoke/WORK/Android ou image étrangère modifié ; aucune base réelle, fusion ou déploiement. Abandonner ce lot ne nécessite aucune annulation de données.
