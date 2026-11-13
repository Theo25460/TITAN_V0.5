# TITAN — Bibliothèque visuelle globale v2 (propositions)

**État : non approuvé, non déployé.** Branche : `design/titan-illustrations-global-v2-20261113`.

## Livraison vérifiée
- **157 propositions** = **138 masters SVG originaux** + **15 remasters PNG** d'images TITAN historiques + **4 alternatives photographiques** originales au sens de nouvelles sources de la collection (photographies tierces Unsplash sous licence, non créées par TITAN).
- **157 exports PNG**, **318 WebP** adaptés à Web/Android, **11 planches de contact**, dont la planche de vérification 32/48/64 px.
- **613 chemins master + exports présents dans l'arbre GitHub**, 486 fichiers image passés dans le rapport QA, aucune absence ni erreur de SHA-256.
- Script automatique : `tools/download-world-photos.mjs`, `tools/rebuild-ui-plates.mjs`, `tools/render.mjs`, `tools/validate-proposals.mjs`.
- Quatre JPEG photographiques conservés comme sources avec leurs auteurs et références de licence.
- Aucune modification des imports/règles Web/Android. La bibliothèque reste dans `proposed`.

## Fichiers de contrôle et revue
- [Galerie de 11 planches](../preview/GALLERY.md)
- [Rapport de QA avec empreintes, dimensions et similarités](../preview/QA-REPORT.json)
- [Registre des 157 éléments](../registry/assets.json)
- [Manifest des photographies et licence](../sources/photographic-worlds.json)
- [Empreintes des photographies sources](../sources/photographic-worlds.lock.json)

## Ce que ce dépôt **ne prouve pas**
- Les 4 paysages photo sont des images sous licence fournies par des photographes, **pas des environnements Renaissance générés sur mesure**.
- Les portraits des 4 gardiens et 6 avatars sont conservés et retouchés. Les 4 gardiens-objets et 6 tokens de rôle sont des **alternatives vectorielles**, pas des portraits photoréalistes de remplacement.
- Le contrôle d'image sur vrais téléphones, l'acceptation des scènes et la comparaison des UI en production exigent encore une validation. Aucun déploiement n'est autorisé avant approbation.

## Reproduire la génération (Node 22)

```bash
npm install --prefix design/titan-visual-library/global-v2/tools/.deps --no-save --no-package-lock sharp@0.34.5
node design/titan-visual-library/global-v2/tools/download-world-photos.mjs
node design/titan-visual-library/global-v2/tools/rebuild-ui-plates.mjs
node design/titan-visual-library/global-v2/tools/render.mjs
node design/titan-visual-library/global-v2/tools/validate-proposals.mjs
```

Les nouvelles illustrations ne remplacent pas automatiquement les assets en production. Les abonnements, le logo, les pictogrammes sportifs et toutes les règles métier sont exclus.
