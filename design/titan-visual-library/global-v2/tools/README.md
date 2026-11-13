# Rendu des assets TITAN global-v2

Le pipeline GitHub Actions de cette branche exporte les 58 sources SVG en PNG/WebP, réalise une retouche non destructive des 15 anciens visuels Renaissance/hero, crée 8 planches, la galerie Markdown, le registre et des contrôles techniques.

Commande locale (Node 22):
- npm install --prefix design/titan-visual-library/global-v2/tools/.deps --no-save --no-package-lock sharp@0.34.5
- node design/titan-visual-library/global-v2/tools/render.mjs

Les retouches de 15 anciens assets ne valent pas nouvelle création d'image. Les masters restent non intégrés, en attente d'approbation. Pas de changement de code Web/Android, d'abonnements ou de catalogue sportif.
