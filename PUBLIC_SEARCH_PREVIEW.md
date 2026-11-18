# Aperçus de recherche et de partage — TITAN

Cette référence reprend les métadonnées de l'accueil dans la branche de travail. Ce n'est pas une capture des résultats Google ni une preuve de déploiement. Google peut réécrire le titre ou l'extrait selon la requête et le contenu visible.

Changement du 18/11/2026 (Opération SEO V1.3.1, `docs/seo/OPERATION_SEO_V131.md`) : le titre et la description disent d'emblée que TITAN est une application de suivi sportif. Les requêtes de marque visibles dans Search Console (« titan application », « application titan », « titan app ») sont partagées avec d'autres produits nommés Titan ; le mot « application » et le mot « sport » tiennent dans les 60 premiers caractères (test `tests/seo-crawl.test.mjs`). Ancien titre : « TITAN — Journal sportif multisport, progression et aventure ».

```text
TITAN — Application de suivi sportif multisport et gratuite
https://titan-app.fr/
Application gratuite de suivi sportif en français : un journal pour 260 sports, tes statistiques, tes records et une progression façon RPG. Privé par défaut.
```

Aperçu demandé pour le partage social :

```text
TITAN — Application de suivi sportif multisport et gratuite
Application gratuite de suivi sportif en français : un journal pour 260 sports, tes statistiques, tes records et une progression façon RPG. Privé par défaut.
Image: https://titan-app.fr/image/og-titan.jpg
Favicon Google: https://titan-app.fr/favicon.ico
```

L'image de partage courante mesure 1 200 × 630 pixels. Les icônes courantes sont `/favicon.ico`, `/image/apple-touch-icon.png` (180 × 180), `/image/logo-192.png` et `/image/logo-512.png`. Le manifeste est `/manifest.json`. L'ancien fichier de partage peut rester disponible pour les liens historiques ; il n'est plus la référence des métadonnées publiques.

Après un déploiement validé, suivre [la procédure Search Console](docs/SEARCH_CONSOLE_RELEASE_RUNBOOK.md) : comparer les métadonnées réellement servies, contrôler le sitemap, inspecter les URL modifiées et demander une nouvelle exploration lorsque pertinent. Une demande ne garantit ni indexation, ni délai, ni aperçu identique. Les réseaux sociaux peuvent aussi conserver leurs propres caches ; leur rendu doit être vérifié séparément.
