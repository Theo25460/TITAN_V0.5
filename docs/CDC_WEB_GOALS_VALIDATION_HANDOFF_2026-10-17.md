# Objectifs : validation accessible du formulaire — lot démarré le 17/10/2026

Trois points du cahier vivant : UX09 / UX10 / QA13 ; exigences globales encore partielles.
Branche `codex/web-goals-validation-cdc`, parent PR #80,
`71fcc0f67d3410d5faf2768b1b88bf82121eec53`.

## Problème et correction

Les messages de validation de l’éditeur d’objectifs n’identifiaient pas leur champ pour les
technologies d’assistance et ne plaçaient pas le focus sur la saisie à corriger. Le message
restait après une correction ou un changement de mesure/période pertinent.

L’alerte existante possède maintenant un identifiant unique par éditeur et reste masquée
hors erreur. Les validations du nom, de la cible et des dates y associent le champ fautif
avec aria-invalid/aria-describedby puis y placent le focus. Effacer une erreur retire
uniquement sa description, en conservant un éventuel autre indice déjà lié au champ.

Modifier le champ efface son erreur. Une erreur de période s’efface lorsqu’on change l’une
des deux dates ou choisit un raccourci ; une erreur de cible s’efface aussi au changement de
mesure. La cible trop élevée indique la limite existante de 1 000 000. Date de début ou fin
absente et fin antérieure au début désignent séparément le champ pertinent.

Les règles existantes restent identiques : cible >0 et <=1 000 000, séances/jours entiers,
distance fractionnaire autorisée, dates obligatoires dans l’ordre (même jour autorisé),
différence maximale 730 jours. Ajout du contrôle explicite badInput sans modifier la plage
acceptée. Calculs de progression, presets de calendrier et code de sauvegarde intacts.
Une erreur de sauvegarde reste affichable sans rendre un champ valide artificiellement invalide.

## Validation

- Baseline pnpm verify : 188/188 tests, build/audit sans erreur et 16 avertissements préexistants.
- RED : 8/9 nouveaux scénarios échouent sur parent ; le témoin de sauvegarde en erreur puis
  reprise passe déjà et reste couvert après changement de visibilité de l’alerte.
- Premier GREEN : 9/9 nouveaux tests.
- Validation finale : pnpm verify, 188/188 tests et build/audit sans erreur (16 avertissements préexistants) ; 24/24 tests navigateur ciblés (9 nouveaux +6 calendriers Objectifs +9 planning).
- Revue indépendante en copie isolée : build et 15/15 tests (9 validation +6 calendriers) réussis, git diff --check réussi, aucun constat Critical/Important/Minor.

Neuf scénarios : nom composé d’espaces, cibles vides/non positives/trop élevées ou saisie
incomplète, cibles entières selon la mesure, dates manquantes/inversées ou trop éloignées,
correction par l’autre date/preset, conservation d’une description existante, erreur locale
de stockage et reprise, modification invalide ne remplaçant pas l’objectif enregistré puis
ajustement avec révision incrémentée et annulation laissant un nouvel éditeur propre.

Vrais formulaire, TitanData et localStorage invités ; création et ajustement aux largeurs
360/1280 px avec rechargement prouvant la persistance. Requêtes externes bloquées. Échec de
stockage volontairement injecté uniquement pour la clé des objectifs ; aucun compte réel utilisé.

## Coordination et limites

`objectifs.html` référence `objectifs.js?v=300.2`. Profil, profile.html et smoke partagé intacts.
Compte authentifié, transitions de compte, autorisation/RLS, synchronisation backend, rendu
avec lecteur d’écran réel, autres moteurs, PWA installée/Android et suite E2E entière non
validés par ce lot. Le planning, le moteur de progression/XP et les règles métier ne changent pas.
CI distante non revendiquée. Aucun merge ni déploiement.
