# Couverture des parcours Android

Cette matrice suit les destinations de `src/navigation/types.ts` depuis les actions de l’application. Elle complète l’inventaire historique du 2 novembre. La colonne « Preuve » nomme des suites de `mobile/__tests__` sans extension. Une suite de rendu exerce un écran avec des données de test. La mention « émulateur » désigne un parcours Maestro exécuté sur la base de la PR #157, avec une réplique locale du serveur. Les mentions « à vérifier » indiquent les limites de ces preuves. [Inventaire historique](INVENTAIRE.md) · [CI de référence](https://github.com/Theo25460/TITAN_V0.5/actions/runs/44259476282)

## Entrée et navigation

| Fonction et destination | Accès et interaction | Hors ligne, indisponibilité ou limite | Preuve |
|---|---|---|---|
| Lancement, visite, accueil — `Tour`, `Welcome` | Premier lancement, visite facultative, puis choix d’un mode de connexion. Relecture depuis Assistance. | Visite locale. Démarrage à froid à mesurer séparément de la navigation à chaud. | firstVisit, tour, écrans d’accueil sur émulateur |
| Identité — `Login`, `Signup`, `Forgot` | Accueil → connexion / inscription → récupération par courriel. | Connexion réseau pour le compte distant. Google exige le drapeau de compilation, le fournisseur et le retour OAuth configurés. | screens, googleAuth, profileRecovery, connexion sur émulateur |
| Accueil sportif — `Onboarding` | Première connexion → préférences → choix d’une première séance. | Les données appartiennent au compte courant. | onboardingFirstSession, changement de compte sur émulateur |
| Barre native — `Tabs`, `QG` | Cinq destinations, QG avec niveau, semaine, prochaine action, brouillon ou séances en attente. | Les actions du QG changent selon le cache, le réseau et l’historique. Tester TalkBack et grand texte en situation. | screens, sinceVisit, navigationMotion, tabLabels, reprise sur émulateur |
| Mode découverte — `SaveAccount` | Bannière du QG et du résultat → sauvegarde du compte de découverte. | Conversion et récupération nécessitent une identité valide. | discovery, authTransition |

## Sport, LIVE et reprise

| Fonction et destination | Accès et interaction | Hors ligne, indisponibilité ou limite | Preuve |
|---|---|---|---|
| Catalogue — `Record`, `Sports` | Séance → favoris/récents, recherche avec alias, familles. Profil → sports favoris. | Catalogue embarqué. | sportFamilyPicker, recordPaths, picker, clavier à 320 et 800 dp sur émulateur |
| Saisie — `SessionForm` | Sport → mesures essentielles, mesures facultatives, séries, répétitions/charges/maintiens, repos, cotations ou distances selon discipline. Bouton GPX sur les sports compatibles. | Brouillon par compte, trace protégée, durée inconnue et valeur nulle distinctes, validation du chevauchement. | sportMetrics, session, gpxImport, gradeLadder, lastPerformance, restTimer, draftIsolation, saisie sur émulateur |
| Suivi GPS — `GpsRecord` | Séance → suivre ma sortie → permission → démarrer, pause, reprendre, terminer. | Service au premier plan, position précise nécessaire. Vérifier autonomie, écran verrouillé et redémarrage sur téléphone. | gpsRecorder, gpsNative, gpsTrack, gpsRecordScreen, scénario GPS sur émulateur |
| Traces — `Routes`, `Route` | Journal → mes parcours → tracé, segments, export GPX privé ou partage volontaire avec extrémités retirées. | Boîte d’envoi locale. Fond cartographique conditionné au fournisseur de tuiles et au choix de l’athlète. | routes, tiles, routeOutboxIntegrity, routeRequestOwner |
| Séance guidée — `LiveSession` | Séance → mode direct → intention, objectif ou exploration → saisie sportive ou aventure → rapport et validation. Reprise depuis Séance. | Drapeau LIVE. Chronomètre et état local, GPS selon consentement. Les gains dépendent du reçu. Longue sortie physique à valider. | live, liveIntents, liveExpedition, voiceCoach |
| Bilan — `SessionResult` | Validation → performance, records, XP, niveau, impact sur le chapitre, partage et prochain objectif. | Confirmation, vérification différée, erreur et attente ont des états distincts. Partage social soumis au choix du joueur. | moment, sessionAdventureImpact, receiptIsolation, shareCard, bilan et vérification SQL sur émulateur |
| File — `Pending` | Séance en attente depuis le QG, Séance, le bilan ou la fiche → corriger ou renvoyer. | Persistance par compte, identifiant idempotent. | queue, draftIsolation, mode avion puis relance et envoi unique sur émulateur |

## Progression et aventure

| Fonction et destination | Accès et interaction | Hors ligne, indisponibilité ou limite | Preuve |
|---|---|---|---|
| Semaine, tendances, maîtrises — `Progress` | Onglet Progrès → vue par période et discipline → journal filtré. Distance, allure, charge ou cotation dépendent du sport. | Affichage dépendant des données du journal. Aucune performance déduite d’une mesure manquante. | screens, progression, lineChart, trois vues sur émulateur |
| Journal et fiche — `Journal`, `SessionDetail`, `SessionEdit` | Progrès ou Profil → journal → détail → refaire, corriger, archiver/restaurer. | Historique mis en cache par compte. Conflits de révision lors des corrections. | sessionEdit, undoArchive, repeatLast, journal sur émulateur |
| Records et carrière — `Records`, `Career`, `Retro` | Progrès → records, jalons, carrière puis bilan du mois ou de l’année. | Dépendent de l’historique disponible. Export d’image à vérifier dans une vraie application destinataire. | recordBook, careerScreen, milestones, retro |
| Intentions à venir — `Goals`, `Plan` | Progrès → objectifs, cadence, semaine type et pauses. | Changements de suivi distants soumis à la révision serveur. | screens, progression, reminderPlan |
| Mondes — `Adventure`, `World` | Onglet Aventure → choisir un monde, suivre son chapitre, franchir les obstacles/rencontres, allumer la balise, voir insigne, carnet et personnages. | Accès et progression selon instantané serveur. Les anciens schémas peuvent limiter les mondes ouverts. | adventureAccess, adventureRpg, adventureEncounters, worldStory, worldPathMap, récompense SQL sur émulateur |
| Camp — `Camp` | Aventure → Camp de base → consulter ce que les séances LIVE ont fait avancer. | Drapeau et services d’expédition requis. | liveExpedition, live |
| Marche — `Steps`, `Sentiers` | Progrès → mes pas → Sentiers du Titan. | Compteur local et totaux serveur distingués. Sources selon appareil, autorisation et synchronisation. | pedometerStore, stepLedger, stepsAccount, stepsCard |

## Communauté, profil et services

| Fonction et destination | Accès et interaction | Hors ligne, indisponibilité ou limite | Preuve |
|---|---|---|---|
| Cercle — `Community` | Profil → communauté, invitation ou lien profond → code ami, demande, acceptation/refus, activités partagées, encouragement. | Écriture distante et périmètre des amis. Une séance privée reste privée. | socialFriends, communityInvite, linkingInvite, circleDigest |
| Jeux collectifs — `Community` | Défis, Duo, club/guilde et messagerie, expédition, Grande Cordée et camps dans l’espace communautaire ; relais de la Sentinelle (V1.8.1, `screens.cordee_relay`) et invitations `/defi?t=…` ouvertes nativement dans Communauté › Défis ; prise en charge et passation du relais (V1.8.2, `screens.cordee_reprise`), longueurs acquises des membres partis. | Disponibilité selon les RPC et droits du compte. Deux comptes réels nécessaires pour une recette complète. | duo, cordee, cordeeRelay, cordeeReprise, communityLot8 |
| Quêtes et saisons — `Events` | QG → quêtes et événements → objectifs, participation et récompenses. | État vide si rien de prévu. Mutations et récompenses serveur. | events |
| Passeport — `Profile`, `PublicCard`, `Capsules` | Onglet Profil → sports, rang, collections, records, cosmétiques, carte publique et lettres à soi-même. | Le partage public demande une activation. Les lettres suivent leur échéance. | profilePassport, capsule, screens |
| Boutique en crédits — `Atelier` | Profil → cosmétiques → catalogue, aperçu, acquisition et équipement. | Solde, propriété et droits issus du serveur. Vérifier refus, crédit insuffisant et retour après perte de réseau. | atelierScreen, rpgVisuals |
| Services connectés — `Sources`, `Garmin`, `HealthConnect`, `HistoryImport` | Profil → sources → Garmin, Santé Connect, archive Strava. Lecture/import sur demande et révocation. | Consentement par source. Vérifier Santé Connect sur appareil, Garmin avec montre et backend activé. | sources, nativeConnectionsScreen, healthConnectScreen, historyImport |
| Offre et abonnement — `TitanPlus` | Profil → TITAN+ → offres TITAN+, Coach et Coach Ultra selon catalogue, restauration et gestion dans Play. | Build et service de facturation activés, produits publiés, compte testeur requis. Un achat réel reste à valider. | titanPlusScreen, playBilling, billingRecovery |
| Compte — `Account`, `DeleteAccount` | Profil → compte → nom, mot de passe, export CSV/JSON ou suppression avec confirmation. | Le CSV utilise le journal synchronisé. Export complet et suppression exigent le service distant. | exportFile, screens, profileSync |
| Confidentialité — `Privacy` | Profil → confidentialité, choix de partage/consentement publicitaire et informations sur le suivi coach. | Contrat coach et UMP soumis respectivement au service et au SDK disponibles. | screens, adsPolicy, adsManager |
| Préférences — `Settings`, `Notifications` | Profil → affichage et préférences, rappels, récapitulatif hebdomadaire, haptique. | Animations selon Android. Rappels locaux soumis à permission. Le push communautaire nécessite un service supplémentaire. | notificationChannels, reminderPlan, theme, textAccessibility |
| Assistance — `Help`, `Guide`, `Feedback` | Profil → assistance → visite, guide facultatif, retour préparé pour le client courriel. | Progression locale, application courriel nécessaire pour envoyer. | tour, feedback, screens |
| Informations — `Legal`, `About` | Profil → informations légales et à propos. | Les textes publiés ouvrent le navigateur, connexion requise. | screens, contrôle des routes |
| Services Web — `WebHub` | Profil → TITAN sur le site → analyses enregistrées, tableau multi-athlètes, analyse GPX détaillée, exports, calendrier complet. | Lien sortant avec le compte du site. Le suivi sportif natif, l’import GPX et l’export utilisateur ont aussi leurs entrées Android. | webHub |

## Dépendances et recette restante

Le calendrier avancé, les vues d’analyse enregistrées et le tableau multi-athlètes restent des candidats à un développement Android. Avant de porter les opérations de coaching, vérifier les droits coach/élève et les API de consentement disponibles. Les groupes, événements, promotions de mondes, expéditions LIVE et sources distantes suivent les capacités annoncées par le serveur. La disponibilité de chaque fonction en production doit être vérifiée avec le schéma et le compte visés. Les choix d’un fournisseur cartographique, de mise en vente des produits Play et d’activation des nouvelles illustrations relèvent du propriétaire.

Les notifications locales, les bannières et l’interstitiel de fin de séance traversent plusieurs écrans. Les tests notificationChannels, adBanner, adsPolicy et sessionInterstitial vérifient leurs conditions. La recette physique reste ouverte pour le rendu d’une notification sur écran verrouillé, le consentement UMP, la lecture TalkBack, les retours haptiques et la consommation pendant une séance longue.

La référence Web place la semaine avant le détail au QG, sépare les vues d’Aventure et présente le coût de l’objet dans l’aperçu de l’Atelier. Ces décisions guident la hiérarchie Android. Les mesures d’accessibilité ou de fluidité du navigateur ne valident pas le client natif. [Référence visuelle du QG](https://github.com/Theo25460/TITAN_V0.5/blob/1948f82dccee955ab03f185142264df3e24171ea/docs/design/captures/signature/entree/avant-apres--qg-390.jpg) · [Atelier de référence](https://github.com/Theo25460/TITAN_V0.5/tree/1948f82dccee955ab03f185142264df3e24171ea/docs/design/captures/signature/profil-atelier)
