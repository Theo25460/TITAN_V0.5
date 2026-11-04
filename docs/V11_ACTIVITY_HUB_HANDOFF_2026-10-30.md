# V1.1 — Hub web « Ajouter une activité » — 30 octobre 2026

Statut : code testé sur branche isolée, non fusionné et non déployé. Suite de la PR #119 (GPX), elle-même suite de #118 (mesures des 260 sports). Base exacte : e95383e260e5c201a44c1d6de6bd6404b7a5569f. Ce lot couvre une partie de WEB-SPORT-01/02/03 et REC-01, pas leur recette globale.

## Comportement

- Drapeau `screens.activityhub`, défaut false. Sans drapeau, ancien parcours conservé ; aucune création distante de drapeau dans ce lot.
- Hub avec import GPX et choix explicite parmi les sports compatibles. GPX de 15 Mo maximum ; FIT/TCX explicitement non pris en charge.
- Lecture et analyse du fichier avant remplacement du brouillon. Fichier malformé, trop volumineux ou format refusé : brouillon inchangé. Remplacement d'un brouillon soumis à confirmation ; annulation et reprise disponibles.
- Saisie manuelle gratuite : bouton visible, choix du sport puis formulaire existant. Lien direct `/training?mode=manual` depuis le Journal, même sans séance.
- Liens sport, duplication, reprise après rechargement et stockage durable existants conservés. Visiter le hub n'efface pas le brouillon ; écriture immédiate avant navigation interne.
- Garmin seulement vers le parcours de profil/consentement existant lorsque `screens.garmin` est activé indépendamment et hors invité. Sinon indisponibilité explicite. Ce lot ne prouve pas une connexion Garmin fonctionnelle. Ancre `#sources` ajoutée au profil.
- Santé Connect explicitement réservé à Android, pas d'accès navigateur simulé. Aucun nouveau fournisseur, jeton ou consentement créé par le hub.
- Import et résumé GPX conservant les protections de #119 : import non vérifié, route sans activité/XP automatique, absence de données non remplacée par zéro, coordonnées précises non persistées.
- Réponses tardives protégées ; sortie du hub invalide la lecture, rafraîchissement des drapeaux conserve sport et focus, changement de compte retire le brouillon de l'ancien utilisateur et recharge celui du nouveau.

## Vérifications exécutées sur l'arbre final

`pnpm run verify` : 388/388 tests unitaires, contrôle de types du noyau, build, audit de publication et garde de release réussis. Les avertissements éditoriaux existants de l'audit ne sont pas une validation SEO.

38 tests navigateur ciblés verts, exécutés sur le build final sans reconstruction concurrente :

| Fichier | Tests |
| --- | ---: |
| activity-hub | 11 |
| gpx-analysis | 5 |
| endurance-entry | 4 |
| journal-calendar-filters | 7 |
| sport-measures | 7 |
| smoke, filtre GPX | 4 |

Le lot inclut clavier/focus, viewport 360 px sans débordement, axe WCAG A/AA sur le hub, sauvegarde/import/relecture, fichiers refusés, annulation, rechargement, actualisation tardive des drapeaux et isolation du brouillon au changement de compte. Aperçu mobile inspecté visuellement.

Revue indépendante : un défaut confirmé, sport GPX et focus réinitialisés par mise à jour des drapeaux. Régression reproduite rouge puis corrigée verte. Une vérification complémentaire a reproduit puis corrigé la persistance en mémoire du brouillon d'un autre compte. Aucun autre défaut significatif confirmé par la revue. Pas de nouveau test SQL : aucune migration ni contrat serveur changé.

## Périmètre restant

- Recette réelle Safari/iPhone et Android, capture GPS native et intégration Health Connect : non réalisées par ce lot.
- Garmin réel et son habilitation : aucune activation ni validation additionnelle.
- Déduplication serveur inter-sources, fond cartographique, correction d'altitude et itinéraires réutilisables restent ceux listés dans #119.
- Suite navigateur globale et audits finaux FIN-CHEAT/FIN-SEC/FIN-SEO : non exécutés ici et toujours différés selon le cahier.
- Les ajouts parallèles de la branche Claude depuis la base de #118 ne sont pas fusionnés ici. Intégrer les branches dans l'ordre et refaire la recette d'intégration avant publication. Ce lot n'altère pas leurs fichiers distants.

## Publication future

Aucune publication autorisée par ce lot : V1/main, production, base distante, secrets et Android préservés. Après décision explicite de mise en production et intégration de #118/#119, le propriétaire pourra créer/activer `screens.activityhub` pour une recette limitée. Ne pas activer Garmin sur la seule preuve de ce hub.
