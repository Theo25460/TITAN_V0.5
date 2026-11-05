# V1.2 Équilibrage — état réel (5 novembre 2026)

Branche : `fix/equilibrage-v12`. Rien n'est déployé en production. Une prévisualisation Netlify sert à juger le rendu avant validation.

Principe : un chiffre de `tools/eq-audit.mjs` ou une capture regardée dans un vrai Chromium est une preuve ; un HTTP 200, une build verte ou un test vert n'en sont pas.

## Ce qui a été mesuré (avant → après)

| Défaut (ticket) | Cause réelle trouvée | Mesure avant | Mesure après |
|---|---|---|---|
| Pages de l'app qui sautent (EQ-001/008) | `hints.js` insérait l'astuce au DOM-ready et `shell.js` remplissait la sous-navigation après coup : le contenu descendait de ~172 px | CLS 0,14–0,25 à ≤ 390 px | 0 |
| Site public qui saute à 1440 px (EQ-001) | police Manrope non préchargée : l'en-tête et les pastilles changeaient de largeur au swap | CLS 0,248 (`/niveaux-et-xp`), 0,349 (`/debuter-titan` à 980) | 0 |
| Connexion coupée à 320 px (EQ-002/004) | colonne de carte dimensionnée par le contenu (onglets), formulaire rempli après coup | débordement 334 > 320, CLS 0,1 | 0 débordement, 0 décalage (5 passages) |
| Version ordinateur sur téléphone (EQ-004) | héros en deux colonnes dès 980 px : titre sur 4 lignes avec orpheline | 4 lignes | colonnes dès 1040 px, titre équilibré |
| Cache PWA (EQ-007) | nom de cache à bumper à la main | générations mélangeables | nom de cache = empreinte du contenu précaché |
| Shell qui se reconstruit (EQ-006) | `innerHTML` réécrit à chaque événement | nœuds remplacés à chaque rafraîchissement | aucun nœud remplacé si le balisage est identique (test e2e) |
| Jeton `--amber` (EQ-018) | variable inexistante | étoile des favoris sans couleur | `--am` + test qui interdit toute variable CSS non définie |
| Icônes (EQ-003/045) | une seule cible « Jeu & combat » pour ~80 sports | pictogramme identique partout | raquette, ballon, gant, vélo, vague, cible (précision), étincelle (danse) |
| Bandeau de consentement (EQ-045/015) | composant système hors DA, 215 px, sur le bouton principal et sur le rail | 27 % de l'écran mobile | composant TITAN, ≤ 26 % à 320 px, hors du rail, au-dessus de la barre d'onglets, pastille dans le pied de page |
| Cibles tactiles (EQ-014/016) | boutons de 32–39 px | | 44 px sur téléphone/tactile |
| Largeurs de page (EQ-002/020) | 5 largeurs de colonne différentes (720/820/860/980/1080) : le titre sautait d'une page à l'autre | | 2 largeurs (860 lecture, 1080 large) |
| Profil à 320 px | blason qui dépassait la carte | gouttière 7 px | blason sur sa propre ligne |
| QG mobile | portrait, nom, blason et niveau se chevauchaient | | deux lignes sans chevauchement |

## Résultats de contrôle

- `tools/eq-audit.mjs` (26 pages × 27 largeurs, 319 → 1920 px, dont 719/720/721, 859/860/861, 959/960/961, 979/980/981, 1039/1040/1041) : voir la PR pour le dernier passage.
- `npm test` : 498 / 498.
- E2E (`test:e2e`, Chromium) : 975 / 977. Les 2 échecs existent aussi sur `main` sans mes changements : « authenticated resume : browser offline then reload and retry at 360px » (une notification recouvre le bouton Enregistrer) et « goal views : archive and restore ».
- Contrôle de texte brut (Markdown, `undefined`, `NaN`) sur 28 pages : aucun.

## État des tickets

| Ticket | État | Preuve / limite |
|---|---|---|
| EQ-001 | Corrigé | CLS 0 sur les pages mesurées ; pas de délai artificiel |
| EQ-002 | Corrigé sur les pages mesurées | centrage ±2,5 px, gouttière ≥ 8 px sur 26 pages × 27 largeurs |
| EQ-003 | Corrigé pour les sports ; reste à relire à l'œil sur chaque écran | planche d'icônes regardée |
| EQ-004 | Corrigé en émulation navigateur | pas testé sur un vrai téléphone en « Site pour ordinateur » |
| EQ-005 | Partiel | héros du QG avec décor de monde (ordinateur) ; **compositions à valider par le propriétaire** |
| EQ-006 | Corrigé | test e2e dédié |
| EQ-007 | Corrigé côté code | non testé sur un appareil avec une ancienne version PWA installée |
| EQ-008 | Partiel | compte invité avec historique simulé ; pas de vrai compte Supabase connecté |
| EQ-009 | Non traité | surcharge du QG à arbitrer avec le propriétaire |
| EQ-010 | Ce document | captures avant/après dans la PR |
| EQ-011/012 | Partiel | hiérarchie revue sur QG, journal, séance, stats, carrière, aventure, profil |
| EQ-013 | Corrigé | héros ; audit aux largeurs charnières |
| EQ-014/015/016 | Corrigé | cibles 44 px, rail/barre d'onglets, chiffres tabulaires déjà en place |
| EQ-017 | Contrôlé | aucune image déformée ni floue détectée |
| EQ-018 | Corrigé | test |
| EQ-019/020/021 | Corrigé pour les sauts ; non revu : toutes les animations | |
| EQ-022 | Corrigé (débordement et saut) | bouton Google inchangé (garde de publication verte) ; pas de clic Google réel |
| EQ-023/024/025 | Non revus en détail | |
| EQ-026 | Corrigé | pied de page, pastille |
| EQ-027/028/029 | Partiel | zoom, paysage, accessibilité non revus à fond |
| EQ-030 | Contrôlé | aucun Markdown brut |
| EQ-031…044 | Non traités sauf EQ-045 | |
| EQ-045 | Partiel | bandeau de consentement et bouton de mise à jour PWA aux couleurs TITAN |

## Limites assumées

- Aucune validation sur un vrai téléphone, aucune vraie session Google/Supabase.
- Les décors de monde du QG et des compositions sont des propositions : elles attendent la validation visuelle du propriétaire avant production.
