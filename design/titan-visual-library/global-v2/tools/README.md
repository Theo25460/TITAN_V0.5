# TITAN — Générateur des candidats global-v2

Ce pipeline rend **106 masters SVG originaux** en PNG et WebP et réalise des **retouches colorimétriques prudentes de 15 images existantes** (4 mondes, 4 gardiens, 6 avatars et hero). Il produit également les neuf planches, une galerie GitHub, les SHA-256 et le contrôle automatique des dimensions/alpha.

Résultats attendus pour la version actuelle : **121 propositions**, **121 PNG**, **242 WebP**, **9 planches**.

## Lancer localement (Node 22)

```sh
npm install --prefix design/titan-visual-library/global-v2/tools/.deps --no-save --no-package-lock sharp@0.34.5
node design/titan-visual-library/global-v2/tools/render.mjs
```

Les images Renaissance sont de **simples remasters de l'existant**, pas de nouvelles scènes ou de nouveaux portraits. Le mandat de refonte photographique intégrale n'est donc pas encore rempli.

Les contrôles automatiques ne constituent ni un contrôle esthétique sur écran réel ni une preuve exhaustive d'absence de doublons perceptuels. Les images restent **proposed** ; aucune référence active du Web ou d'Android n'est modifiée. Les abonnements, le logo et les pictogrammes sportifs restent exclus. La validation explicite du propriétaire est nécessaire avant intégration et fusion.

- [Galerie de revue](../preview/GALLERY.md)
- [Contrôle technique](../preview/QA-REPORT.json)
- [Registre complet](../registry/assets.json)
