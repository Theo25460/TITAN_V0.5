# Contrôle statique du noyau sportif — 20 octobre 2026

Priorité A08 / AND13 / AND14. Base figée PR110 `ed42d895d2aa192f92ef980829014760448390be`, arbre `d2756ab4b3464324a83bea1cdafd8cbfebf34389`. Aucun nouveau parent externe absorbé ; aucune fusion main, migration réelle ou mise en production.

## Garde ajoutée

TypeScript5.9.3 est une dépendance de développement exacte, verrouillée, non chargée par le navigateur. `pnpm run typecheck` contrôle la vraie source `js/core/effort.js` avec allowJs/checkJs, strict, noUncheckedIndexedAccess et noEmit. `pnpm run verify` l’exécute avant tests/build ; le job CI existant exécute déjà verify, sans nouveau workflow.

Les annotations JSDoc décrivent les valeurs numériques acceptées, détails de durée/GPX/ressenti/exercices, résultat normalisé, rangs et niveaux. Les métadonnées supplémentaires restent possibles via unknown, sans rendre les champs contrôlés any. Le tableau de rangs est déclaré non vide. Une déclaration globale relie l’API du navigateur aux exports inférés de la source, sans recopier une API fictive. Le contrat consommateur vérifie des usages valides et refuse XP chaîne, ressenti liste, propriété inventée et mauvais type de rang. Les ts-expect-error concernent uniquement ces usages négatifs du fichier de test ; aucune suppression de diagnostic dans la source produit.

Périmètre réel : ce noyau critique et son contrat, pas tous les scripts historiques, le DOM, l’authentification ou le backend. Cette première garde ne justifie pas une affirmation de typage intégral du dépôt. Sources officielles : https://www.typescriptlang.org/tsconfig/checkJs.html et https://www.typescriptlang.org/docs/handbook/compiler-options.html.

## Règles conservées

Seules des annotations et l’explicitation `Number(num(val))*60` remplacent la coercition implicite `num(val)*60`. Number(null)=0 conserve le comportement antérieur ; aucun seuil, arrondi, plafond, formule XP/niveau, gain ou règle serveur changé. Aucun HTML/Profil/smoke, main/state, SQL ou Android modifié. Pas de nouveau jeton de cache nécessaire : aucun comportement public changé.

Comparaison ancienne/nouvelle source dans des VM distinctes :6769 cas identiques (sports/unités/valeurs valides, invalides, absentes, infinies, durée explicite/GPX/ressenti/exercices, rangs/niveaux et dates). Les tests de parité serveur existants restent dans verify.

## Preuves

RED du contrôle sur la source non annotée : entrées implicitement any et contrats insuffisants. GREEN après annotations avec tous les réglages stricts maintenus. Mutation jetable XP numérique→chaîne : verify échoue dès typecheck, TS2322, avant tests/build ; source exacte restaurée puis contrôle vert.

Test permanent dans ci-config.test.mjs : copie jetable de la configuration, source, déclaration et contrat ; détérioration du vrai retour XP ; le compilateur doit refuser la source même si la déclaration de résultat reste numérique. Détecte notamment une désactivation de checkJs qui laisserait passer ce corps de fonction. Nettoyage temporaire en finally.

verify279/279, build/audit/garde verts,16avertissements éditoriaux préexistants. La suite navigateur ciblée progression et formulaire/reçu passe8/8. Revue indépendante bornée sans Critical/Important ; couverture de la vraie source, coercition équivalente et absence de besoin de jeton validées. CI finale du HEAD publié à lire avant PR prête. Les nouvelles annotations ne remplacent pas les tests dynamiques ni les deux voies SQL17.6 héritées.

## Rattachement des réserves fonctionnelles

AND13 : PR110 a ajouté six preuves avec vrai SDK local et session synthétique persistée, vrai formulaire5km/30min, file IndexedDB, indisponibilité serveur/accusé perdu/navigateur réellement hors ligne, navigation puis rechargement en attente et retry. AND14 : identifiant/propriétaire/payload complet stables, ligne unique lors de la réconciliation et après reçu, absence de crédit provisoire. Le crédit unique de l’autorité HTTP synthétique prouve le contrat client ; les vrais contrats SQL de rejeu/concurrence restent une preuve distincte.

AND13 et AND14 restent partiels : aucun téléphone/coque TWA, compte réel ou reload PWA entièrement hors ligne certifié ; les autres actions critiques restent à recouper. A08 peut être clôturé pour la mise en place effective de lint/type-check/tests/build CI, avec cette couverture volontairement bornée. Les23migrations héritées restent non appliquées en production.

Prochain macro-bloc : AND17 sources d’activité, avec conception séparée et critères de doublons/permissions avant intégration de fournisseurs ; ne pas poursuivre par une série de PR d’annotations sans enjeu démontré.
