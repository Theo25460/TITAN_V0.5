# V1.3 — Préparation de release

**Aucune application en production n’est autorisée par ce plan.** Les essais locaux établissent la compatibilité du code testé. Le déploiement de la base et des clients demande sa propre décision.

| Ordre | Migration | Effet attendu | Retour arrière |
| --- | --- | --- | --- |
| 1 | `20261105213712_journey_v13` | Configuration versionnée des quatre mondes et de la carrière. Journal cosmétique, lecture du snapshot, synchronisation explicite et export du journal. | Restaurer le client précédent et suspendre les nouvelles révélations si nécessaire. Conserver le journal et ses configurations. |
| 2 | `20261110130137_entitlement_profile_consistency` | Résumé TITAN+ calculé à partir du droit d’accès encore valide. Réconcilie les profils concernés sans modifier le registre des droits. | Corriger le calcul par migration compensatrice en conservant le registre des droits et la réception des événements de facturation. |

L’appelant contrôle la transaction. L’installation crée le catalogue et laisse le journal vide. Les comptes existants acquièrent les souvenirs éligibles lors d’une synchronisation explicite. Le lot V1.1 suit son plan historique `docs/V11_RELEASE_PLAN.md`.

## Préparation de la base

1. Identifier le SHA, le projet et la base cible. Lire l’historique `supabase_migrations.schema_migrations` et les catalogues. Vérifier les fondations `private.titan_daily_activity`, `private.titan_source_consents`, `private.titan_garmin_links`, `public.profiles` et l’export de compte. Si le schéma et l’historique divergent, interrompre la procédure et préparer leur rapprochement.
2. Obtenir un **snapshot de sauvegarde et vérifier sa restauration** sur une base isolée. Consigner son identifiant, son périmètre, son horodatage et le résultat de la restauration.
3. Consigner avant intervention les versions, fonctions, droits, RLS et définitions d’export. Relier ce relevé au SHA et au snapshot. Garder les données de comptes hors des journaux publics.
4. La lecture de production du 10 novembre a retrouvé les cinq implémentations du correctif `20261104085851` en `PT409` et son entrée d’historique manquante. Après restauration vérifiée de la sauvegarde et relecture des cinq clauses sur la cible, préparer la réparation de cette seule entrée historique avec le statut `applied`. Répéter sur la copie et consigner le résultat avant la décision de déploiement. Toute divergence de définition demande un rapprochement séparé.
5. Rejouer le lot sur la copie restaurée. Exécuter `tools/db/postflight-v13.sql`, `sql/tests/300_journey.sql` et `sql/tests/300_entitlement_profile_consistency.sql`. Exécuter le banc `tools/db/test-migrations.sh` sur PostgreSQL natif. Voir les résultats et limites du banc embarqué dans `docs/V13_SERVER_VALIDATION.md`.
6. Vérifier la recette Web et Android avec source refusée, réseau indisponible, changement de compte, vrai zéro et absence de données. Valider le flux de pas quotidien d’un fournisseur connecté avant de présenter les découvertes de marche comme disponibles. Le rôle serveur doit pouvoir attester un relevé provenant de ce flux. L’import Santé Connect alimente l’aperçu.
7. Présenter la cible, le SHA, la restauration, la recette et le retour arrière pour la décision de déploiement.

## Recette après application autorisée

Lire les versions enregistrées et exécuter `tools/db/postflight-v13.sql` en lecture seule. Chaque ligne avec `blocking=true` doit retourner `ok=true`. Vérifier qu’un seul catalogue est actif, que les rôles applicatifs peuvent atteindre les fonctions privées dont dépendent leurs RPC et que les fonctions privées d’export et de recalcul du droit d’accès restent inaccessibles aux clients. Toute erreur du contrôle ou tout écart entre le catalogue, les droits et l’historique bloque la publication du client.

Avec un compte de recette, appeler `titan_journey_snapshot_v1()` et contrôler le propriétaire, la source, la date et l’absence d’acquisition causée par la lecture. Planifier séparément l’écriture de recette `titan_journey_sync_v1()`. Vérifier les dates, l’idempotence et la stabilité des XP et crédits. Publier le client depuis le SHA validé selon sa procédure de release.

## Retour arrière avec conservation des acquis

Restaurer le client précédent si le problème vient de l’interface. Si le serveur produit des acquisitions incorrectes, une migration compensatrice peut suspendre les nouvelles révélations en révoquant temporairement `EXECUTE` pour `authenticated` sur les deux fonctions de synchronisation, publique et privée. Conserver la lecture du snapshot et l’export. Rétablir les droits après vérification du correctif.

**Conserver `private.titan_journey_acquisitions`**, contenus figés, versions et premières dates, ainsi que les configurations référencées. Une correction de catalogue publie et active atomiquement une nouvelle version. Une correction de fonction conserve les acquis. Rapprocher schéma et historique avant toute reprise à partir d’une sauvegarde.

Après retour arrière, vérifier le snapshot, l’export, la connexion, l’enregistrement sportif, les XP et crédits et l’accès aux campagnes. Les essais sur téléphone, la recette utilisateurs et les validations juridiques et commerciales font partie de la décision de release complète.
