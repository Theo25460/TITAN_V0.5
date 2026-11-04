# TITAN — refonte UX : web complet, Android compagnon, une même identité (4 nov. 2026)

## 1. Deux produits, un compte
| | **Web (titan-app.fr / PWA)** | **Android natif** |
|---|---|---|
| Rôle | **TITAN au complet** : tout ce qui a été développé, sur grand écran | **Le compagnon de poche** : enregistrer, capteurs, « aujourd'hui », rappels |
| Moments | Analyser, planifier, comparer, coacher, exporter, administrer | Bouger → enregistrer en quelques gestes → voir ce que ça a changé |
| Entrée | Navigation latérale (QG, Progrès, Séance, Aventure, Profil + modules) | 5 onglets, une action principale par écran |
| Capteurs | Import GPX/Garmin ; aucun capteur du navigateur | **Compteur de pas TITAN**, GPS natif, Santé Connect, notifications locales |
| Densité | Dense, multi-colonnes, tableaux et graphiques larges | Une colonne, cartes courtes, détails à la demande |

**Règle d'accès** : rien n'est inaccessible depuis l'Android. Ce qui n'est pas reconstruit en natif (analyses et comparaisons, espace coach, analyse GPX détaillée, exports complets, prévision détaillée) s'ouvre depuis **Profil → TITAN sur le site**, avec le même compte. L'Android ne copie pas le site : il retrouve les mêmes termes, les mêmes règles (XP, crédits, quêtes confirmés par le serveur) et la même progression.

## 2. Ce que l'on retient de la concurrence (principes, pas écrans)
- **Garmin Connect / Apple Fitness** — anneaux du jour d'un coup d'œil → tuiles **Pas** et **Semaine** côte à côte au QG.
- **Strava** — l'effort rappelé à côté de son objectif → le résultat dit ce que la séance a fait avancer.
- **Hevy** — enregistrer vite → « Refaire ma dernière séance », saisie Express, valeurs précédentes.
- **Nike Run Club** — un grand geste clair, ton direct → une action dominante au QG, libellés courts.
- **Duolingo / Habitica** — monde et récit comme récompense, jamais comme barrière → l'aventure suit l'effort confirmé, aucune série punitive.
- **Google Fit / Samsung Health** — compteur de pas en direct → notre **compteur TITAN** (capteur du téléphone, sans tiers).

## 3. Grammaire de l'identité TITAN (inchangée, appliquée partout)
Fond presque noir `#05070A`, **cyan = action et progression**, **ambre = exploit rare**, rouge = destructif seulement ; titres TitanDisplay, texte Manrope ; cartes `bg2` à bordure fine, rayon 18 ; grille 4 px ; cibles ≥ 48 dp ; un anneau pour toute progression d'une journée ; micro-animations courtes et désactivables ; ton direct (« Tu avances »).
États toujours dits : *en direct / mis à jour à… / en attente / à réparer / indisponible* — jamais un zéro inventé.

## 4. Ce qui a été fait dans cette refonte (Android)
- **QG** : priorité du jour → *Refaire ma dernière séance* → **tableau du jour** (pas en direct + semaine) → ascension → visite guidée → un repère → dernières séances. Le premier écran à 360×740 tient priorité, refaire, pas et semaine.
- **Pas** : compteur TITAN (module natif Kotlin), carte à anneau « En direct », écran **Mes pas** (objectif, semaine, sources), fusion sans addition avec Santé Connect.
- **Sources et capteurs** : un écran, un vocabulaire (autorisé / reçu / intégré).
- **TITAN sur le site** : porte vers tout le reste.
- **Cohérence** : dialogues TITAN, actions annulables, onglets lisibles de 320 à 1200 dp, raccourcis sans troncature.

## 5. Limites assumées (voir aussi `V12_CHANTIERS_RESTANTS_2026-11-04.md`)
Aucun parcours n'est validé sur téléphone réel ; le module du compteur n'a pas été exécuté sur un capteur matériel (la compilation est vérifiée par la CI, le comportement par 17 tests sur capteur simulé) ; les pas TITAN restent locaux tant que le serveur n'accepte pas cette source (décision serveur, Astra) ; ils ne nourrissent pas le RPG.
