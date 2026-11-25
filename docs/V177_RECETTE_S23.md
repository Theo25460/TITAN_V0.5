# V1.7.7 — Recette sur Galaxy S23 : protocole pas à pas

Ce protocole vérifie sur un vrai téléphone ce que les tests automatiques ne peuvent pas prouver : le GPS réel, l’arrière-plan,
l’écran verrouillé, la batterie, les permissions et la synchronisation. Rien de ce qui suit n’a été exécuté dans le conteneur de
développement (aucun appareil n’y est attaché) : chaque ligne est **à tester**, et son résultat est à noter dans l’onglet V1.7.7.

Durée : environ 2 h 30 dehors (une sortie vélo ou gravel de 20 à 30 km suffit ; la sortie de 55 km est la recette complète),
plus 30 min à la maison. Matériel : S23 chargé à 100 %, un second appareil (PC ou téléphone) connecté au même compte, un fichier
GPX d’un parcours connu d’environ 10 km qui passe près du point de départ.

## 0. Préparation (à la maison, 15 min)

| # | Action | Résultat attendu | OK / écart |
|---|---|---|---|
| 0.1 | Installer le build Android de la branche `claude/gifted-brahmagupta-mg28j8` (workflow `android-native.yml`), se connecter avec le compte de test. | L’application s’ouvre, version affichée dans Réglages. | |
| 0.2 | Réglages Android › Applications › TITAN › Batterie : laisser « Optimisée » (réglage d’usine). Noter le réglage. | — | |
| 0.3 | Noter le niveau de batterie et l’heure. | — | |
| 0.4 | Séance › Mes parcours › Importer un GPX : choisir le fichier. | Aperçu : carte, distance, D+ seulement si le fichier a une altitude partout, nombre de points. Choix « Enregistrer » / « Suivre maintenant » / « Annuler ». | |
| 0.5 | Enregistrer le parcours sous le nom « Recette S23 ». Le renommer « Recette S23 bis », puis revenir au premier nom. | Le nom change dans la liste ; sur le second appareil (site, Journal › Mes parcours) après rechargement. Si le serveur n’a pas la migration V1.7.7, le message dit que le nom reste sur le téléphone. | |
| 0.6 | Importer un fichier qui n’est pas un GPX (une photo renommée en `.gpx`). | Refus avec une raison lisible, rien n’est enregistré. | |
| 0.7 | Séance › Mes points : ajouter « Fontaine test » à ma position, type Point d’eau. | Le point apparaît ; il est privé. | |

## 1. Départ et permissions (sur place, 5 min)

| # | Action | Résultat attendu | OK / écart |
|---|---|---|---|
| 1.1 | Retirer l’autorisation de position de TITAN dans Android, puis Séance › Suivre ma sortie en GPS › sport Gravel › Démarrer. | TITAN explique pourquoi avant la demande d’Android. Refuser : message clair, « Saisir la séance à la main » reste possible. | |
| 1.2 | Démarrer à nouveau, accepter « Pendant l’utilisation ». Accepter la notification. | L’enregistrement démarre, notification « TITAN enregistre ta séance » visible. | |
| 1.3 | Avant de bouger, attendre 30 s. | Pastille de signal : « Recherche » puis « Signal GPS (± x m) ». Pas de distance qui grimpe à l’arrêt. La ligne d’état dit « À l’arrêt ». | |
| 1.4 | Choisir « Parcours à suivre : Recette S23 », objectif « Être rentré pour » (heure + 2 h), réglages par défaut. | Le parcours prévu s’affiche en ambre, distinct de la trace en cyan. | |

## 2. Rouler et lire l’écran (30 à 40 min)

| # | Action | Résultat attendu | OK / écart |
|---|---|---|---|
| 2.1 | Rouler 5 min. Regarder la vue Compteur au soleil, bras tendu. | Vitesse et distance lisibles d’un coup d’œil ; moyenne en mouvement cohérente avec un compteur de référence (± 1 km/h). | |
| 2.2 | Passer en vue Carte puis Mixte d’une main (pouce). | Le changement est immédiat ; la position reste centrée ; aucun bouton ne cache la route devant soi. | |
| 2.3 | Faire glisser la carte, puis « Recentrer ». Zoomer + et −. | La carte se décale puis revient sur la position ; l’échelle change. | |
| 2.4 | Suivre le parcours prévu pendant 2 km. | Bandeau « Reste x km » qui diminue ; estimation d’arrivée en fourchette après 5 min. | |
| 2.5 | Quitter volontairement le parcours de plus de 100 m pendant 30 s, puis y revenir. | « Hors parcours · x m » apparaît après une dizaine de secondes (pas à la première position), une vibration si les alertes sont actives ; l’alerte disparaît au retour. | |
| 2.6 | S’arrêter 30 s à un carrefour (feu). | La ligne d’état passe à « À l’arrêt » ; pas de message « signal faible » pendant l’arrêt (défaut de la version précédente). | |
| 2.7 | Verrouiller l’écran, ranger le téléphone, rouler 10 min. | Au déverrouillage : la trace est continue, la distance a augmenté, aucun « enregistrement interrompu ». | |

## 3. L’arrêt de 20 minutes (25 min)

| # | Action | Résultat attendu | OK / écart |
|---|---|---|---|
| 3.1 | Noter la moyenne en mouvement et le temps en mouvement. S’arrêter 20 min **sans** appuyer sur Pause (téléphone verrouillé, dans la poche, quelques pas autour du vélo autorisés). | — | |
| 3.2 | Repartir, rouler 2 min, regarder le Compteur. | Temps en mouvement ≈ valeur notée + 2 min (pas + 22). « À l’arrêt » ≈ 20 min. Moyenne en mouvement inchangée à ± 0,3 km/h. Distance : pas plus de 50 m gagnés pendant l’arrêt. | |
| 3.3 | Appuyer sur Pause 3 min, marcher 100 m, Reprendre. | Le temps de pause s’affiche à part ; la marche pendant la pause n’est ni tracée ni comptée ; la trace n’a pas de ligne droite entre les deux points. | |

## 4. Réseau coupé et retour (30 à 40 min)

| # | Action | Résultat attendu | OK / écart |
|---|---|---|---|
| 4.1 | Activer le mode Avion (le GPS reste actif), rouler 10 min. | L’enregistrement continue ; la trace et le parcours suivi restent affichés (fond neutre). | |
| 4.2 | Plus › Retour au départ. | Deux options expliquées : « Par le même chemin » (distance, fourchette de temps) et « Itinéraire calculé » indisponible sans réseau ni service configuré. La distance à vol d’oiseau est donnée comme une indication, jamais tracée comme une route. | |
| 4.3 | Activer « Par le même chemin » et rentrer. | Le chemin du retour s’affiche ; « Reste x km » diminue ; le départ visé est le vrai point de départ de cette sortie. | |
| 4.4 | Regarder l’objectif « Être rentré pour ». | Le message dit s’il reste de la marge, avec une fourchette, et rappelle que le relief n’est pas pris en compte. | |
| 4.5 | Pendant le retour, forcer l’arrêt de TITAN (Applications récentes › balayer), attendre 2 min en roulant, rouvrir TITAN. | « Enregistrement interrompu » : ce qui était enregistré est gardé, la trace reprend dans un nouveau tronçon, les 2 min sont comptées « en pause / interrompu », pas comme effort. | |
| 4.6 | Plus › Ajouter un point ici : « Banc recette », type Autre. | Le point est ajouté sans réseau. | |

## 5. Fin, bilan et synchronisation (15 min)

| # | Action | Résultat attendu | OK / écart |
|---|---|---|---|
| 5.1 | Terminer › annuler la confirmation, puis Terminer › confirmer. | L’annulation laisse l’enregistrement tourner. | |
| 5.2 | Lire le bilan. | Temps total = en mouvement + à l’arrêt + en pause + sans position (à la minute près). Moyenne en mouvement et moyenne globale différentes et cohérentes (distance ÷ temps). D+ affiché avec sa provenance, ou la phrase « pas assez fiable ». La frise du temps montre l’arrêt de 20 min et la pause. « Comment c’est calculé » donne les seuils. | |
| 5.3 | Exporter la trace GPX et l’ouvrir dans une autre application (ou la réimporter dans TITAN › Mes parcours). | Le fichier est lu ; un tronçon par période d’enregistrement ; distance identique à ± 1 %. | |
| 5.4 | Toujours en mode Avion : Enregistrer la séance. | La séance apparaît « En attente » ; la durée proposée est le temps en mouvement. | |
| 5.5 | Désactiver le mode Avion. Attendre la synchronisation. | La séance passe à « Confirmée », XP attribuée **une fois**. Le parcours apparaît dans Mes parcours. « Banc recette » est envoyé. | |
| 5.6 | Sur le second appareil : Journal. | La même séance, une seule fois, mêmes chiffres ; le bilan GPS (mouvement / total / arrêt) est identique. | |
| 5.7 | Sur le téléphone : tirer pour rafraîchir deux fois, fermer et rouvrir l’application. | Aucune séance en double, XP inchangée. | |
| 5.8 | Aventure : ouvrir le monde en cours. | L’effort de la sortie est compté une fois (plafond quotidien respecté) ; aucun lieu réel n’apparaît. | |
| 5.9 | Noter la batterie et l’heure. | Consommation à rapporter en % par heure d’enregistrement. | |

## 6. À la maison : cas limites (15 min)

| # | Action | Résultat attendu | OK / écart |
|---|---|---|---|
| 6.1 | Mes parcours › la sortie du jour › « Comparer mes sorties sur ce parcours ». | Avec une seule sortie : « il faut au moins deux sorties comparables », pas de record. Refaire le même parcours un autre jour pour voir la comparaison. | |
| 6.2 | Créer un parcours (planification). | Tant qu’aucun service de routage n’est configuré : panneau explicatif, aucun faux itinéraire. | |
| 6.3 | Points utiles autour de moi. | Tant qu’aucun service n’est configuré : état explicite. Sinon : source OpenStreetMap, horaires « non vérifiés ». | |
| 6.4 | Démarrer une séance d’un sport en salle (musculation). | Aucun GPS proposé ni demandé. | |
| 6.5 | Séance structurée : échauffement 2 min, 2 × (effort 200 m + récupération 1 min), retour au calme « au signal ». Marcher dehors, écran verrouillé. | Vibration à chaque changement d’étape (si activée) ; « Étape suivante » passe l’étape ; le bilan liste les tours réels ; interrompre avant la fin garde la séance. | |
| 6.6 | Retirer l’autorisation de position pendant un enregistrement. | L’enregistrement s’arrête proprement (interrompu), le message explique comment la rendre ; rien n’est perdu. | |
| 6.7 | Se déconnecter puis se connecter avec un autre compte pendant une pause d’enregistrement. | La trace du premier compte n’est ni visible ni continuée par le second. | |
| 6.8 | Zoom du texte Android à 130 %. | Les chiffres principaux restent entiers ; les boutons Pause / Terminer restent accessibles. | |

## 7. Sur le Web (téléphone, navigateur Chrome), 20 min

| # | Action | Résultat attendu | OK / écart |
|---|---|---|---|
| 7.1 | Ouvrir `/sortie` (drapeau `screens.gps` actif sur l’environnement de recette). | L’avertissement sur l’écran verrouillé et l’arrière-plan est affiché avant le départ. | |
| 7.2 | Démarrer, marcher 5 min écran allumé. | Trace, distance et allure s’affichent ; l’écran reste allumé si le navigateur le permet, sinon le message le dit. | |
| 7.3 | Verrouiller l’écran 2 min en marchant, déverrouiller. | La période sans position est comptée « sans position », jamais inventée ; la trace n’est pas reliée par une droite. | |
| 7.4 | Recharger la page en cours de sortie. | « Une sortie est en cours sur cet appareil » : Reprendre garde les chiffres. | |
| 7.5 | Terminer, lire le bilan, Enregistrer deux fois de suite (double appui). | Une seule séance au journal. | |

## Ce qu’il faut rapporter

Pour chaque écart : numéro de ligne, capture d’écran, heure, ce qui était attendu, ce qui s’est produit. Joindre le GPX exporté de
la sortie de recette : il permet de rejouer les calculs dans les tests (`tests/gps-engine.test.mjs`) et de corriger un seuil avec
une preuve.
