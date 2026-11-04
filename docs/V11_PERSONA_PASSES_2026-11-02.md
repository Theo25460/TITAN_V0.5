# Passes testeurs V1.1 — 2 novembre 2026

Cinq passes (plus des passes bonus) menées avec un profil de testeur différent. Chaque passe dit ce qui a été **mesuré**, ce qui a été **corrigé** et ce qui reste **non vérifié**. Les mesures Web sont automatisées (`tests/e2e/personas.e2e.mjs`) ; aucune n'est une validation sur appareil réel.

| # | Profil | Écran | Mesuré | Défauts trouvés → corrigés |
|---|---|---|---|---|
| 1 | Débutant qui veut simple | 320×568, 360×640, tactile | 14 pages : débordement, texte coupé, texte < 11 px, erreurs de page, cibles tactiles | Liens du pied de page de 22 px, cases et boutons radio de 18 px, résumés pliables de 21 px → 40–44 px |
| 2 | Sportif de haut niveau | tablette 768×1024 et 1024×768, tactile | idem | Liens de navigation de 22 px → 40 px |
| 3 | Coach | Chromebook 1366×768, souris | idem + axe déjà en place | Aucun défaut de mise en page ; navigation clavier couverte par les tests de focus existants |
| 4 | Particulier gratuit | 320×533, réseau coupé | idem ; publicités (règles) | Textes légaux faux sur la publicité (voir plus bas) |
| 5 | Premium, téléphone pliant | couverture 280×653 et déplié 673×841 | idem | **Écran de couverture** : le QG élargissait la page à 294 px (bouton « Enregistrer ma première séance » sur une ligne, grille qui ne rétrécit pas, nom de rang qui débordait) → boutons qui passent à la ligne, grille `min-width: 0`, barre du haut compacte |
| + | Malvoyant (texte 200 %) | 320 et 360 px | 12 pages | Aucun débordement |

## Texte légal et publicité (passe 4)
La politique de confidentialité et les conditions affirmaient « aucune publicité ». Faux dès que l'application Android gratuite affiche Google AdMob. Corrigé : aucune publicité **sur le site** ; AdMob **dans l'application Android gratuite**, après consentement, jamais pendant l'effort, aucune avec TITAN+ et les offres Coach ; le seul prestataire publicitaire est nommé (confidentialité version 9). `service.html` et les autres pages générées n'ont pas été régénérées : les fichiers HTML contiennent des retouches manuelles plus récentes que `tools/build-public-docs.mjs` — **ne pas régénérer ces pages avec l'outil sans reporter ces retouches**.

## Contradictions encore ouvertes (décision du propriétaire)
1. **Coach** : le site dit « 3 sportifs gratuits, 20 avec TITAN+ » ; les offres V1.1 disent Coach 5 places TITAN+ incluses, Coach Pro 15. Les deux modèles ne sont pas décrits de la même façon.
2. **Pages d'offre du site** : « TITAN+ n'est pas en vente, aucun prix » est exact aujourd'hui ; ce texte doit changer **le jour de l'ouverture de la vente**, avec le prix de TITAN+ (non défini).

## Non vérifié
Affichage réel sur pliant et tablette, claviers physiques, gestes, lecteur d'écran (TalkBack), annonces de test, consommation de batterie. Tout cela relève de la recette sur appareils réels.
