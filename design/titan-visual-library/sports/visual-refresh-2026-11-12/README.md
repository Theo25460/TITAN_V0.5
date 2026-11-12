# TITAN — Migration visuelle après revue du 12 novembre 2026

## État actuel
Le registre [visual-review-2026-11-12.json](../../registry/visual-review-2026-11-12.json) relie **50 éléments des cinq planches approuvées** et **20 nouvelles propositions** aux véritables IDs des 260 sports. Le **pack source et ses images ne sont pas encore déposés dans GitHub** ; ce commit ne prétend pas les y avoir intégrés.

- Sources A–E : 5 planches déjà approuvées, 10 disciplines chacune
- Nouveaux concepts NEW-20 : 1 planche de 20 sports distincts, **à approuver**
- 2 anciens assets hors catalogue retirés de `lot-02` : `Canoë`, `Trottinette freestyle`
- Les autres versions anciennes restent en place **jusqu'à la présence vérifiée des nouvelles images**, afin d'éviter des références orphelines

## Séquence obligatoire pour Work
1. Récupérer les sources PNG et les icônes WebP depuis le pack validé par l'utilisateur dans la conversation.
2. Vérifier l'empreinte et le visuel de chaque image à 32 / 48 / 64 px, les recadrages et les styles.
3. Importer les PNG master et les WebP individuels sous `sports/lot-03/` et `sports/lot-04/` (ordre fondé sur les IDs canoniques, **pas les numéros des anciennes planches**).
4. Inscrire le chemin effectif dans `registry/visual-review-2026-11-12.json` et mettre `binary_in_github:true` après vérification.
5. Seulement ensuite supprimer les variantes effectivement remplacées, actualiser le registre et vérifier qu'aucun composant ne pointe sur un fichier supprimé.
6. Ne pas changer l'app Android/Web, le système de paiement ou les visuels d'abonnements pendant l'archivage.

## Qualité
La validation d'une planche n'implique pas que toutes ses découpes sont des masters 3D : ce sont des recadrages d'une seule planche générée. Pas de faux logo TITAN sur les objets. La référence officielle est `image/titan-mark.svg`.
