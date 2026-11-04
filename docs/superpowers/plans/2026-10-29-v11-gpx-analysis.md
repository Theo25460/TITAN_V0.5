# V1.1 — lecture et aperçu GPX

**Référence :** cahier Google Docs, onglet V1.1, GPX-01/02/04 et REC-05/08 (décisions du 29/10/2026). Continuer la PR #118 sur une branche empilée, sans publication.

**Architecture :** lecteur déterministe partagé navigateur/Node, sans service cartographique ni dépendance ajoutée. Analyse locale avant toute sauvegarde ; statistiques disponibles distinguées des données absentes. Aperçu schématique du parcours et profil altimétrique, sans prétendre offrir un fond cartographique ni une altitude corrigée par DEM. Aucune certification de l'effort par un fichier. Aucun tracé GPS brut persisté ou envoyé.

- [x] Tests rouges puis lecteur borné : traces/routes, segments distincts, données partielles, horodatages invalides, téléportation puis récupération, altitude absente, limites, XML avec entités refusé.
- [x] Temps actif/écoulé et pauses explicites, splits kilométriques uniquement avec horodatage complet et cohérent ; profil et aperçu bornés. Ne pas combler les coupures par une ligne ni attribuer une durée à un itinéraire.
- [x] Tests navigateur puis aperçu d'import dans la saisie existante : absence indiquée, nouvelle importation ne conserve pas les chiffres du fichier précédent, itinéraire sans temps refusé comme preuve d'activité, possibilité de revenir à une saisie manuelle explicite.
- [x] Persister seulement des statistiques sans coordonnées, version/provenance et disponibilité ; consultation du profil dans le Journal et compatibilité des anciennes séances.
- [x] Vérifier types/tests/build puis parcours ciblés sans reconstruire dist pendant leur exécution. Revue indépendante, PR et cahier actualisés.

**Hors lot :** captation Android, fond cartographique, stockage/export de la trace, routes favorites, comparaison d'itinéraires, FIT/TCX, déduplication inter-fournisseurs serveur. Ces exigences restent ouvertes. Audits finaux toujours différés. Aucun changement de V1, production, secrets, migrations ou mobile/.

## Résultat

388 tests unitaires et 20 parcours navigateur ciblés verts. Revue indépendante suivie de corrections XML et brouillons anciens vérifiées en rouge puis vert ; garde des réponses tardives par propriétaire/client/epoch. Bilan : docs/V11_GPX_HANDOFF_2026-10-29.md. Les exigences globales GPX restent partielles, selon les exclusions ci-dessus.
