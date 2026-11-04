# TITAN V1.1 — revue monétisation du 2 novembre 2026

Périmètre : code Android AdMob, règles de fréquence, consentement, tutoriel, arrêt des publicités pendant l'effort ; vérification serveur Google Play, RTDN et réconciliation. Travail local sur `codex/v11-finalization-20261102`, base `6b4bcaa`. Aucun paiement réel, annonce réelle, déploiement, modification de paramètres externes ni migration de production.

## Corrections confirmées

| ID | Composant / classification | Problème reproduit | Correctif | Validation locale |
|---|---|---|---|---|
| MON-01 | AdMob / défaut de pression publicitaire | Première annonce possible à la troisième séance, malgré le plafond d'une annonce pour cinq séances confirmées. | Première éligibilité à cinq séances ; les deux premières restent explicitement protégées. Intervalle de cinq séances, trente minutes et deux annonces par jour conservés. | Tests de politique et du hook : échec avant correction, succès après. |
| MON-02 | AdMob / défaut de placement | Un résultat historique pouvait afficher une annonce déjà chargée lorsque le compteur était éligible ; `countable` empêchait seulement le comptage. | Confirmation et caractère comptabilisable obligatoires aussi au moment de montrer l'annonce. État lié au compte et à l'événement courant. | Régressions résultat historique et changement de compte, rouges puis vertes. |
| MON-03 | AdMob / défaut de concurrence et durabilité | Deux résultats simultanés perdaient une incrémentation ; une erreur d'écriture du compteur n'empêchait pas l'annonce. | Opérations lecture-modification-écriture sérialisées par compte ; échec d'écriture propagé et publicité supprimée. Appuis répétés protégés pendant l'affichage. Aucun affichage retardé en attendant de charger l'état depuis le disque. | Régressions concurrence, disque indisponible et appuis répétés. |
| MON-04 | AdMob / défaut de parcours | Le tutoriel ouvrait de vrais écrans contenant des bannières sans les supprimer. | Suppression par compte pendant toute la durée de présence de `GuideScreen` dans la pile, y compris ses visites des vrais écrans ; libération à la fermeture. | Test de rendu du vrai Guide avec visite Sports puis fermeture : rouge puis vert. |
| MON-05 | AdMob / défaut pendant l'effort | Seul le GPS était pris en compte ; le chronomètre d'une séance en cours ou en pause autorisait encore des bannières. Une erreur de lecture GPS était traitée comme une absence de séance. | Blocage si chronomètre lancé, durée déjà accumulée ou état des brouillons non chargé. État GPS inconnu/non lisible bloquant, lecture liée au compte. | Tests séance active/en pause, état non chargé, échec de lecture GPS : rouges puis verts. |
| MON-06 | UMP / défaut de consentement concurrent | Le démarrage du SDK pouvait terminer après un retrait de consentement et rétablir `canRequestAds=true`. | Les opérations de consentement plus anciennes ne peuvent plus écraser une décision plus récente. | Régression démarrage en attente puis refus dans les options : rouge puis verte. |
| PAY-01 | Google Play / défaut confirmé d'ordre des lectures, gravité moyenne | Une réponse ACTIVE issue d'une ancienne requête retardée pouvait obtenir une date plus récente, après une vérification EXPIRED, et réaccorder l'accès dans le registre simulé. Reproduit pour vérification client, RTDN et réconciliation. | Date serveur capturée avant la requête Google dans les trois lecteurs, y compris les réponses 404/410 et le remplacement de jeton. Les dates des notifications ne deviennent pas une source de vérité. | Trois régressions serveur rouges avant correction, vertes après ; registre simulant la condition SQL existante `last_event_at <= event_at`. |

La correction PAY-01 traite l'inversion causée par la latence de réponse. Elle ne constitue pas un verrou distribué : deux lectures datées de la même milliseconde ou une divergence d'horloge entre instances restent une limite du mécanisme existant. Une garantie totale d'ordre nécessite une révision monotone attribuée par la base avant la lecture Google, à concevoir et valider sur copie avant modification du contrat SQL. La réconciliation et l'expiration restent nécessaires.

## Contrôles existants revus

- Trois seuls placements de bannière dans le code : QG (`hq`), Journal (`journal`), Statistiques (`stats`), une occurrence chacun. Aucun placement dans les écrans de compte, santé, achat ou modification de séance. Le bloc natif réservé n'est pas utilisé.
- Identifiants publics AdMob correspondant au cahier des charges. `app-ads.txt` local contient la ligne demandée ; cette revue ne certifie pas la réponse HTTPS de production.
- Annonces désactivées sans `EXPO_PUBLIC_TITAN_ADS=1`. Ce seul indicateur utilise les unités de test Google. Les unités réelles exigent aussi le commutateur LIVE et sont exclues en développement. Aucun indicateur n'a été activé par ce travail.
- Droits inconnus, `is_elite` fourni par le profil serveur, consentement refusé, SDK non prêt, absence de réseau, effort ou tutoriel : affichage bloqué. Aucune donnée GPS/santé n'est transmise dans les paramètres de requête publicitaire examinés.
- UMP précède l'initialisation du SDK ; refus sans initialisation, erreurs sans exception propagée, nouvelle tentative limitée, options de confidentialité disponibles. Les tests simulent UMP, sans exécuter le composant Android natif.
- L'interstitiel n'attend pas le chargement de l'annonce à « Terminer ». Une annonce absente ou un état de fréquence non prêt est ignoré. Le composant de bannière se rétracte après erreur ou délai de chargement.
- Google Play : authentification Supabase du compte, refus des anonymes, lecture auprès de Google, liste serveur des produits, vérification de l'identité de compte associée par Google, enregistrement serveur avant acquittement. Le client ne modifie pas lui-même le droit Premium.
- Jeton inconnu, réutilisé, lié à un autre compte, non lié, abonnement expiré/en attente/en pause/suspendu, panne Google, annulation et délai d'acquittement : tests unitaires ou tests serveur simulés présents. Les tests RTDN couvrent signature Google, audience, e-mail de compte de service, expiration, mauvais secret, remboursement et relecture de l'état Google plutôt que confiance dans le type de notification.
- La réconciliation relit les jetons dus ; elle retire les états expirés/inconnus et conserve l'état existant pendant une panne Google. La propriété des jetons et les droits du registre dépendent aussi des fonctions SQL : se référer à la campagne SQL séparée, pas à ces seuls mocks.

## Exécution

| Commande | Résultat observé dans ce chantier |
|---|---|
| `cd mobile && npm test -- --runInBand __tests__/adsPolicy.test.ts __tests__/adsManager.test.ts __tests__/adBanner.test.tsx __tests__/sessionInterstitial.test.tsx` | 39 tests, 4 suites réussis. |
| `cd mobile && npm run typecheck` | Réussi. |
| `node --test tests/play-concurrency.test.mjs tests/play-billing.test.mjs tests/play-notifications.test.mjs tests/play-reconcile.test.mjs` | 23 tests réussis. Réseau et comptes entièrement simulés. |
| `cd mobile && npm test -- --runInBand` | Première exécution parallèle : 210 réussis, 2 échecs sur `routeOutboxIntegrity` et `routeRequestOwner`. Nouvelle exécution avec `--forceExit` : 215 réussis, 1 échec sur la nouvelle régression GPS `routes.test.tsx` « a pending route is exportable to GPX even while offline ». Le responsable confirme que cette régression était volontairement rouge avant son correctif en cours. Aucune suite monétisation en échec. Attendre la nouvelle campagne consolidée après fin des autres chantiers ; ces résultats ne constituent pas la validation finale. Avertissements React/Expo et processus Jest restant ouvert, déjà présents. |
| `git diff --check` | Réussi au contrôle local ; à répéter sur la candidate finale. |

Le script principal `npm test` inclut désormais aussi `play-concurrency`, `play-reconcile` et le test existant `routes-web`, précédemment omis de sa liste explicite.

## Conditions de sortie encore non démontrées

NO-GO pour activer les achats ou publicités réels sur la seule base de cette revue. Restent requis sur la candidate exacte :

1. Build Android signé et appareil physique : unités de test, UMP selon les pays et choix, navigation/bouton retour, premier lancement, reprise, erreurs réseau et non-interruption d'un effort.
2. Tests Google Play avec comptes autorisés : prix réels du catalogue, paiement différé/refusé, achat/restauration, changement de compte, renouvellement, remboursement, révocation, interruption avant acquittement et RTDN authentifiées reçues effectivement.
3. Test de bout en bout des expirations, doublons et notifications hors ordre sur une base isolée et la candidate déployée hors production. Validation des places Coach par la campagne SQL et parcours Coach.
4. Contrôler les limites de fréquence après redémarrage réel. Le compteur est local au téléphone, limité à soixante identifiants récents ; il ne constitue pas un plafond global multiappareils et un ancien résultat hors de cette fenêtre peut être recompté. Un effacement des données du téléphone réinitialise ce compteur.
5. Réexécuter toutes les suites après intégration, puis conserver l'identifiant du commit et les preuves de recette physique. Aucun score de sécurité global n'est déduit de ces tests locaux.
