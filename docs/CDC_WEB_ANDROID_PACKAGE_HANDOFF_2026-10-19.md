# Handoff — alignement du paquet Android (Q-001, AND02)

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `85736ab`. Aucune fusion, aucun déploiement, aucune construction Android, aucune action dans Play Console, aucune empreinte de signature inventée.

## Correction d'un oubli

Le cahier donne **Q-001 résolue** (Théo, 19/10/2026 : le paquet définitif est `fr.titanapp.app`, le dépôt doit s'aligner). Mes passations précédentes (ADR-001, inventaire des tiers, secrets, comptes rendus de session) la traitaient comme **ouverte** : c'était faux, j'avais lu l'état du cahier trop tôt. L'ADR-001 et sa passation sont corrigés ; les autres passations citent Q-001 seulement comme rappel et n'ont pas de conséquence.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| AND02 — un package Android stable et définitif | `[x]` | `fr.titanapp.app` dans `android/twa-manifest.json`, dans la valeur par défaut de `assetlinks.json` (`tools/build-public.mjs`, variable `TWA_PACKAGE_ID` conservée), dans `docs/ANDROID.md` et la donnée de test ; `tests/android-identity.test.mjs` (3 tests, dans `pnpm test`) échoue si un fichier actif nomme un autre paquet `fr.titanapp.*`. Le workflow `android-twa.yml` ne cite aucun paquet (Bubblewrap lit le manifeste). |
| AND01, AND03 | inchangés | Aucune construction réalisée. |

## Limites

`assetlinks.json` reste écrit seulement quand `TWA_SHA256_FINGERPRINTS` est défini (aucune empreinte inventée) ; la première construction et la vérification du lien d'application restent à faire. Mettre à jour la fiche Play Console n'est pas du ressort de ce lot.

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert.

## NON BLOQUANT / BACKLOG FINITION

Première construction du paquet et test de mise à jour (AND03, AND16) ; empreintes de signature dans Netlify (`TWA_SHA256_FINGERPRINTS`) ; étude de faisabilité de l'ADR-001.

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

Matrice de conservation proposée pour Q-002 (sans purge ni page publique) ; effacement complet des clés à la suppression de compte.

## Retour arrière

Remettre `fr.titanapp.twa` dans les quatre fichiers et retirer `tests/android-identity.test.mjs` de `package.json` (déconseillé : le paquet Play ne peut plus changer).
