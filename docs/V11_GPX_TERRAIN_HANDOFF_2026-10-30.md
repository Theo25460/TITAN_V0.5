# V1.1 — GPX : terrain, couleurs et arrêts — 30 octobre 2026

Code sur branche isolée, non fusionné et non déployé. Base exacte : PR #120, commit 0a683139e613caf3a22a81bef12de4675df45a99 (après #119 et #118). Complément partiel de GPX-02/04 et REC-05.

## Livraison

- Coloration du parcours schématique selon vitesse moyenne des portions ou pente estimée, avec choix Tracé/Vitesse/Pente, légende fixe et données absentes en gris. Aucun fond cartographique externe ni appel réseau.
- Vitesse seulement sur une trace enregistrée entièrement horodatée ; les itinéraires prévus n'obtiennent pas de vitesse depuis leurs heures planifiées. Pente disponible si l'altitude existe, même sur un itinéraire, sans crédit d'activité.
- Montée principale estimée : plus grand gain net dans une portion d'altitude continue, au moins 20 m de gain sur 100 m parcourus, fin après une descente de 10 m. Ni segment distinct, ni altitude absente, ni saut d'altitude à l'arrêt ne créent une montée artificielle.
- Arrêts estimés : au moins 20 secondes consécutives à moins de 0,4 m/s (1,44 km/h), sur trace enregistrée à temps complet. Les doublons exacts de même heure ne les interrompent pas. Les intervalles entre segments et les déplacements échantillonnés à au moins 300 secondes sont du temps non observé, distingué des arrêts.
- Résumés relus dans le Journal : montée, total/nombre d'arrêts et détail des 50 premiers, sans latitude/longitude ni heures absolues. La liste est bornée sans tronquer le total des arrêts.
- `screens.gpxterrain` éteint par défaut : l'aperçu GPX précédent reste disponible. Aucun drapeau distant créé ou activé. Les calculs restent locaux ; le drapeau gouverne l'affichage enrichi.

## Calcul et limites

Métadonnées facultatives `terrainVersion: gpx-terrain-v1`, compatibles avec l'analyse existante `gpx-v2`. Aucun changement aux totaux précédents, au calcul de durée de séance ou aux récompenses. Les mesures originales sont distinguées des corrections manuelles de la séance.

Les couleurs sont des moyennes sur les portions du tracé réduit (320 points maximum), pas une mesure instantanée. La vitesse utilise la distance réellement parcourue entre les échantillons, pas le raccourci en ligne droite. Une coupure d'horodatage dans l'intervalle désactive la couleur vitesse. La pente exige au moins 20 m parcourus et aucune altitude manquante dans l'intervalle ; les pentes hors +/-100% sont indisponibles. Le profil original reste borné à 160 points et conserve ses coupures.

Échelle vitesse : <5 / 5–15 / 15–30 / >=30 km/h. Échelle pente : <-3 / -3 à 3 / 3–8 / >=8%. Ces seuils servent à la lecture, pas à classer les sportifs. Une marche très lente peut être comptée comme arrêt, explicitement indiqué. L'altitude du fichier reste non corrigée, sans MNT/DEM ni certification. La montée principale est un repère heuristique, pas une liste exhaustive de cols ni un jugement d'effort.

Les coordonnées et couleurs du tracé restent en mémoire pendant l'import : `previewSegments` et `previewMetrics` sont absents du brouillon et de la séance. Seuls les résumés numériques bornés passent la liste blanche du stockage client ; champs arbitraires/coordonnées injectés sont rejetés, statut toujours non vérifié.

## Vérification

`pnpm run verify` vert sur le code final : 397 tests unitaires, types du noyau, build, audit de publication et garde de release. Avertissements éditoriaux existants de l'audit inchangés, pas de validation SEO.

42 parcours navigateur ciblés : 9 GPX (dont 4 nouveaux), 11 hub, 4 endurance, 7 Journal, 7 mesures dont les 260 sports à 360 px, 4 smoke GPX. Tests de bascule/clavier/focus, axe A/AA sur l'aperçu enrichi, absence de débordement à 360 px, sauvegarde/relecture, absence de coordonnées persistées, schémas invalides et limite de 50 arrêts. Aperçu couleur inspecté visuellement.

Revue indépendante : deux défauts reproduits puis corrigés rouge/vert — récupération d'un saut d'altitude à l'arrêt créant une fausse montée ; doublon horodaté coupant un arrêt continu. Suite unitaire complète et parcours ciblés repassés après correction.

Pas de test de migration additionnel (aucune migration nouvelle), ni de recette de synchronisation réelle, Safari/iPhone ou Android. Suite navigateur globale non exécutée.

## Reste à faire

Fond de carte, correction d'altitude externe, comparaison/favoris/export consenti, captation GPS native, Garmin/Health Connect réels, déduplication serveur inter-sources et FIT/TCX restent ouverts. Ne pas clôturer GPX-02/04 globalement. Audits FIN-CHEAT/FIN-SEC/FIN-SEO toujours différés. Aucun main, production, secret, SQL distant, Android ni travaux parallèles modifiés. Intégration et publication demandent la recette sur les branches réunies puis validation explicite.
