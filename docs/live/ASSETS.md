# TITAN LIVE — emplacements réservés pour les futurs assets

Le chantier graphique parallèle (`design/titan-visual-library`) reste seul maître des illustrations : **aucun visuel
n'a été créé ni remplacé ici**. TITAN LIVE fonctionne aujourd'hui avec les tokens Ascension et le motif des lignes de
niveau. Les emplacements ci-dessous sont prévus dans le code ; un asset approuvé s'y branche sans changer la logique.

| Emplacement | Où | Format attendu | Remarque |
|---|---|---|---|
| `live/voie/<voie>.webp` (20) | Fond de la vue aventure (`LiveTrail`, `.live-trail`) | 640 × 300, fond sombre, horizon bas, zone calme au centre pour le sentier | Une illustration par Voie (Traversée, Forge, Paroi…). Pas de texte. |
| `live/guardian/<voie>.webp` (20) | Marches, gardien prêt | 320 × 320, silhouette lisible à 64 px | Gardiens nommés dans `live-voies.js`. |
| `camp/<batiment>-<niveau>.webp` (6 × 6) | Cartes des bâtiments (`data-slot="camp/<id>-<niveau>"` sur le Web) | 640 × 360, même point de vue pour les six niveaux | Niveaux 0 (en ruine) à 5 (légendaire). |
| `live/find/<voie>-<index>.webp` (120) | Trouvailles du Camp | 160 × 160, charte des pictogrammes 3D | Six par Voie, les deux derniers « rares » (liseré ambre). |
| `live/cordee/<chapitre>.webp` (10) | Chapitres de la Cordée | 960 × 400 | Lien narratif avec les quatre mondes existants. |

Règles reprises de la charte : matériaux crédibles, cyan seulement en accent, ambre réservé aux moments rares, aucun
rendu « gaming » générique, vérification à petite taille, WebP optimisé. Tant qu'un asset n'est pas
`approved_for_library`, l'emplacement reste vide et l'interface garde son rendu actuel.
