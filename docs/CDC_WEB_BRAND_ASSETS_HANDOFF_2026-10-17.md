# SEO02 / SEO03 / SEO05 — identité, icônes et partage — 17 octobre 2026

## Résultat

Le document `PUBLIC_SEARCH_PREVIEW.md` conservait le titre TITAN OS Sport, une ancienne description et l'image de partage `og-titan-os.png`, alors que les pages publiques utilisent l'identité actuelle. Il reprend maintenant les métadonnées de l'accueil de la branche et renvoie au runbook Search Console. Il distingue les balises demandées de l'apparence effective des résultats et des caches sociaux.

Les images existantes restent inchangées. Leur identité visuelle a été inspectée sur logo.png, logo-512.png et og-titan.jpg ; les contrôles automatiques portent sur les références, les dimensions, le décodage et la géométrie des masques, pas sur une appréciation esthétique.

Base : PR #66, `e363c78b66158cb04908c51c3e4f3641068dfa91`. Branche isolée, sans reprise du chantier actif de validation du nom Profil. Le test navigateur est isolé dans brand-assets.e2e.mjs, avec raccordement dans package.json : smoke.e2e.mjs est identique au parent afin de préserver le fichier partagé du chantier Profil. Aucun changement de code applicatif, générateur, métadonnées HTML, manifest, binaire, configuration de production, base, Android ou déploiement.

## Les trois exigences

| Exigence | Vérification obtenue | Limites |
| --- | --- | --- |
| SEO02 | Prévisualisation documentaire actualisée ; contrat sur les 23 pages publiques : image de partage actuelle, liens favicon/apple-touch/manifest ; assets publics identiques octet pour octet aux sources. | Ne démontre pas le rafraîchissement des caches Google et sociaux ni tous les écrans natifs ; l'ancien fichier peut rester pour les liens historiques. |
| SEO03 | Manifeste courant HTTP200 ; PNG192/512 déclarés et décodés dans Chromium, Apple180, favicon48 ; marques maskable opaques et contenues dans le cercle de sécurité. | Pas d'installation physique iOS/Android, ni de preuve d'affichage de l'icône dans chaque lanceur ou onglet. |
| SEO05 | Deux nouveaux contrats unitaires : prévisualisation synchronisée et cohérence des heads publics. Titres/descriptions OG et Twitter égaux à ceux de la page, URL OG canonique, image1200×630 actuelle avec alt et références d'icônes attendues. Image effectivement décodée. | Contrôle des balises sources/générées et des assets servis ; aucune garantie d'apparence dans un réseau social tiers. |

Ces exigences restent `[~]` pour la recette sur appareils et services tiers. Aucun succès distant d'indexation, d'installation ou de partage n'est déduit des contrôles locaux.

## Assets publics vérifiés

Sept GET anonymes HTTP200 : favicon.ico, logo.png, logo-192.png, logo-512.png, apple-touch-icon.png, og-titan.jpg et manifest.json. Les sept réponses sont identiques aux fichiers de la branche, par comparaison des octets et SHA256 ; les six images sont décodables par Pillow en lecture seule. Aucun compte ni token utilisé.

| Asset | Dimensions |
| --- | --- |
| favicon.ico | une entrée ICO48×48, PNG intégrée |
| logo.png | 512×512, RGBA |
| logo-192.png | 192×192, RGB |
| logo-512.png | 512×512, RGB |
| apple-touch-icon.png | 180×180, RGB |
| og-titan.jpg | 1200×630, JPEG |

Preuve horodatée : `CDC_WEB_BRAND_ASSET_EVIDENCE_2026-10-17.json`. Pas de copie d'image nouvelle ni de modification binaire. Cette comparaison ne prouve pas que tous les autres fichiers du même commit sont déployés.

## Tests et diagnostic favicon

- Baseline : `pnpm verify` 186/186, build et audit réussis avec16avertissements préexistants.
- RED : la prévisualisation obsolète échoue sur le titre actuel ; dix autres tests public-offer passent. GREEN après la correction documentaire :11/11.
- Verify final :188/188 tests, build et audit sans erreur,16avertissements préexistants. Deux tests unitaires et un navigateur ajoutés ; le nouveau fichier navigateur est raccordé au script test:e2e existant. Le workflow CI reste inchangé.
- Navigateur ciblé :8/8 cas avec le filtre `SEO metadata|SEO branding|private pages are noindex` ; décodage réel des icônes/OG, taille déclarée, opacité et marque maskable. Pas de suite E2E complète ni de tests SQL nouvellement revendiqués.
- Premier contrôle navigateur bloqué sur favicon.ico : le problème a été isolé dans Playwright1.56, pas dans le fichier. La source installée marque comme favicon les URL finissant par `/favicon.ico` (`lib/server/network.js`) et les abandonne lorsque le routage est actif (`lib/server/frames.js`). Sans routage, et en dataURL avec les mêmes octets, Chromium décode l'ICO48×48.
- Le test conserve le blocage des requêtes externes : APIRequest vérifie la réponse du chemin canonique, puis compare ses octets à une variante avec query avant le décodage par Image. Le serveur local sert exactement le même fichier pour cette variante. Aucun changement du favicon ou du serveur destiné à masquer un défaut.
- Le contrôle maskable est adapté aux deux PNG Titan actuels à fond uniforme : premier pixel comme fond, contraste RGB supérieur à24 pour repérer la marque, aucun pixel repéré hors du cercle de rayon40% de la plus petite dimension ; tous les pixels opaques et marque non vide. Ce n'est pas un détecteur universel de logos ni une preuve d'intégration à un OS.
- Contre-exemples indépendants : titre OG d'une page publique incohérent et taille manifest any192 changée en191 détectés par les bonnes assertions. Le premier essai de taille, effectué avant résolution du blocage favicon, était inconclusif et n'est pas compté comme preuve ; il a été rejoué après un baseline vert.

La revue indépendante ne relève plus de Critical/Important/Minor après résolution du blocage Playwright. Le reviewer a rejoué11/11 tests public-offer, le nouveau test isolé1/1 et les sept cas SEO précédents. Sa tentative combinée de huit cas dans la suite partagée a expiré : elle ne constitue pas une seconde preuve de notre propre exécution finale8/8. Aucun fichier partagé modifié pendant la revue.

## Reprise

Après intégration autorisée et déploiement validé, contrôler l'installation et les masques sur appareils physiques, puis les aperçus Google et sociaux avec leurs outils propres. Les preuves publiques collectées ici ne nécessitent aucune publication du site.

Référence géométrique relue : [W3C Web Application Manifest, section Icon masks and safe zone](https://www.w3.org/TR/appmanifest/#icon-masks). Le texte consulté est un Working Draft du16/10/2026 ; son cercle central de rayon40% sert de référence au contrôle de ces assets, sans prétendre une certification de conformité complète.
