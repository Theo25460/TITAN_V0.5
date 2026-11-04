# Prévoir : clavier et erreurs de saisie — 17/10/2026

Trois points du cahier vivant : UX09 / QA05 / QA13. Les exigences globales restent partielles.
Branche `codex/web-planner-keyboard-cdc`, parent distant PR #78,
`80e50e33585d6bdc5d14c1c6eb047673523f38d1`.

## Comportement corrigé

Choisir un sport remplaçait le bouton actif et perdait le focus clavier ; choisir un résultat
de recherche ne donnait plus de point de départ clair pour poursuivre. Enregistrer ou libérer
un jour reconstruisait aussi la grille/liste après la fermeture, avec perte de focus.
Les erreurs du formulaire ne désignaient pas leur champ et n’y plaçaient pas le focus.
Une saisie numérique incomplète (`e`) était vue comme une durée facultative vide.

- La sélection remet le focus sur la nouvelle puce du sport choisi si le bouton activé avait le focus.
- Le rendu conserve le jour et la surface d’origine (grille ou liste) ; la fermeture retrouve
  aussi ce contrôle s’il a été remplacé pendant l’ouverture. Les gardes empêchent de prendre
  le focus d’un autre élément ou d’une fenêtre ouverte.
- L’alerte existante est masquée hors erreur, reliée au champ par `aria-describedby` et
  `aria-invalid`, et le champ reçoit le focus. L’édition ou le choix du sport efface l’erreur
  pertinente, en préservant les éventuelles autres descriptions du champ.
- `validity.badInput` empêche la sauvegarde d’un nombre partiellement saisi. La durée reste
  facultative ; la plage existante 5 à 600 minutes et les règles d’arrondi existantes restent inchangées.

Aucun changement dans le stockage ou l’API de planning : vrai `TitanData.setPlanDay` et
`saveState` dans les tests, puis rechargement du navigateur pour vérifier la persistance locale.

## Validation

- Baseline `pnpm verify` : 188/188 tests, build/audit sans erreur, 16 avertissements préexistants.
- RED : les neuf nouveaux scénarios échouent sur le parent avec les assertions attendues.
- Premier GREEN : 9/9 nouveaux tests navigateur.
- Validation finale : `pnpm verify`, 188/188 tests et build/audit sans erreur (16 avertissements préexistants) ; 25/25 tests navigateur ciblés (9 Prévoir +10 retour des fenêtres +6 bilan hebdomadaire).
- Revue indépendante dans une copie isolée : 9/9 nouveaux tests et `git diff --check` réussis, aucun constat Critical/Important/Minor.

Neuf scénarios : sélection rapide (360/1280 px), résultat de recherche, sport manquant,
durées hors plage, nombre incomplet, sauvegarde et rechargement depuis grille/liste aux deux
largeurs, remise d’un jour au repos, fermeture après remplacement du déclencheur et focus
lors d’un rendu (jour actif, navigation extérieure, champ d’une fenêtre ouverte).

## Coordination et limites

`prevoir.html` référence `prevoir.js?v=300.1`. Fichiers réservés Profil et smoke partagé intacts.
Contrôles Chromium sur largeurs 360/1280 px ; aucune revendication de lecteur d’écran réel,
PWA installée, Android ou autres moteurs. Données locales invitées ; aucun compte réel,
backend, synchronisation multiappareil, récompense/XP ou migration modifié/validé.
Suite E2E entière et CI distante non revendiquées. Aucun merge ni déploiement.
