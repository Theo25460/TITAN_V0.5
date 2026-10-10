# Handoff — corrections d’interface des vues sauvegardées

Branche `codex/web-analysis-views-ux-cdc`, suite de la PR #28 ouverte et non fusionnée. Base locale `96133fe379d2290c042313aa605aa3139024b527`, parent publié `6a9a59f102b677ae387b4de2ebb13174de5ba12d` : même arbre `5e0decac918a2a6f8172f06b8fe90ca45580bded`. Commit de code relu : `43b03dd81bee71b6aaf9e190b873b2bb03d00188`.

## Changements

Les trois Minor du handoff PREM08 du 09/10 sont corrigés :

- Pendant une requête, Annuler est désactivé et son handler garde l’opération en cours. Après une réponse de sauvegarde incertaine, le formulaire et son nom restent disponibles ; Annuler est réactivé. L’interface ne prétend pas annuler une écriture serveur en vol.
- Renommer retire la confirmation de suppression affichée avant d’ouvrir le formulaire et de focaliser son nom.
- Annuler une suppression au clavier rend le focus au bouton Supprimer de la même carte, qui peut être réactivé par Entrée.

Chargement de `vues.js` porté à `300.1`. Changements limités à `js/app/vues.js`, `stats.html`, trois nouveaux E2E et ce handoff. Aucun changement SQL, contrat RPC, abonnement, prix ou récompense.

## Vérifications

- Socle initial : 101/101 tests. Tests de régression écrits avant correction : trois échecs attendus, puis 3/3 réussites. Ils utilisent l’UI réelle et simulent uniquement les réponses RPC externes.
- Chaque nouveau scénario passe à 360 et 1280 px : brouillon préservé après réponse incertaine, confirmation retirée au renommage, navigation Tab/Entrée et retour du focus sur la deuxième carte.
- `pnpm verify` : 101/101 tests, build public réussi, audit sans erreur ; 16 avertissements SEO préexistants.
- `pnpm test:e2e` : suite complète Chromium 55/55, zéro échec. `git diff --check` réussi.
- Unique revue indépendante GPT-6.1 Sol sur `96133fe3..43b03dd8` : aucun Critical, Important ou nouveau Minor ; les trois E2E relancés indépendamment, 3/3 aux deux largeurs. Aucun changement de code après cette revue.
- SHA GitHub, égalité de l’arbre publié et CI finale : preuves canoniques renseignées dans la PR associée à cette branche et le [cahier](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M), après vérification des trois jobs du dernier HEAD. La CI du parent ne vaut pas preuve du livrable.

Trois PNG étrangers conservés et exclus des commits : avatar_1 `6c86828561cda015dcac2cb9f2b95486fb080083826474def604c1093a52029b`, avatar_2 `591984a1f7a7722bf0ec9d3d3d33c32e067f85598d5373d60ef0f71f68ac2581`, mob_9 `d4e744f9bffa0430cce91e44207d023fc34b0d0f4052e27b9e85063e48838c2f`.

## Limites examinées par la revue

- Audit accessibilité global UX09 : hors de cette correction ciblée ; décision de le laisser ouvert en `[~]`. Contrastes, tailles tactiles, labels, lecteurs d’écran et autres écrans restent à auditer.
- Garanties du backend réel, SQL et autorisation Premium en production : hors du diff ; décision de conserver les contrats existants et de faire rejouer leurs contrôles par la CI sur réplique vide. Aucune preuve de production tirée des RPC simulées.

Aucun des trois comportements demandés n’a été laissé sans jugement. Le lot suit l’autonomie autorisée sur branche isolée ; aucune validation supplémentaire pour ces corrections réversibles. Pas de méthodologie de conception lourde pour ces trois défauts bornés.

## Cahier et suite

247 formulations inchangées. UX09 passe de `[ ]` à `[~]` pour ce travail ciblé, état 29 `[x]`, 19 `[~]`, 199 `[ ]` ; PREM06 et l’audit global restent ouverts. Claim WORK Play Console préservé. Claim Codex libéré après livraison de la PR et lecture de sa CI finale.

Aucune fusion, mise en production, migration appliquée à un projet réel ou action Android/Play Console. Retour arrière : retirer ce seul patch d’interface et la version de cache associée ; aucune donnée à restaurer. Les PR précédentes restent à intégrer selon l’autorisation de livraison du cahier, avec recette réelle et audit global Astra maximal avant le déploiement majeur.
