# Handoff — offre Titan+ web

Suite isolée de la PR #24 (`b3430bcc80b6ac58ce4bb436d69427dbd25e42f5`), sans fusion de main ni déploiement. PREM01 et PREM10 traités ; PREM02 reste partiel. L’audit et la suite proposée se trouvent dans `CDC_WEB_PREMIUM_AUDIT_2026-10-08.md`.

## Changements

- Générateur public : les styles sont gagnables gratuitement ; accès Titan+ temporaire et possession acquise permanente sont distincts, y compris dans la FAQ JSON-LD. L’accueil et les tarifs partagent la même source d’offre.
- `/tarifs#concret` : capacités de routines et coaching visualisées, deux vrais visuels de campagne, liens d’explication et confirmation explicite que les analyses actuelles restent gratuites. Les deux états Titan+ de l’Atelier proposent un lien de consultation sans lancer le checkout.
- Cache : CSS public `300.1` sur les huit pages régénérées, script Atelier `300.4` et script de progression `300.1` sur les quatorze pages applicatives. Les autres ressources conservent leurs versions.
- Validation : les tests ont exposé une erreur de cadence antérieure au lot en fuseau UTC négatif. Une date de pause `YYYY-MM-DD` était interprétée à minuit UTC et pouvait tomber dans la semaine précédente localement. La soustraction de sept jours de 24 h pouvait également sauter un lundi au passage à l’heure d’été. Interprétation locale des pauses et soustraction calendaire corrigées, sans modification des XP/crédits.

## Preuves locales

| Vérification | Résultat |
|---|---|
| Ancienne régénération | Trois tests rouges : ancienne règle d’expiration, promesse de styles exclusifs, divergence source/HTML |
| Pages concrètes et liens avant implémentation | Deux tests E2E rouges : zone et liens absents |
| Pauses avant correction | Test existant vert en UTC, rouge à São Paulo ; test DST rouge à Paris |
| Tests après correction | `pnpm run verify` : 76 tests verts, build/audit sans erreur bloquante ; avertissements SEO préexistants |
| Calendrier | Tests dédiés en UTC, Paris, New York et São Paulo ; semaines consécutives et pauses conservées |
| Navigateur | 23 E2E verts ; bénéfices à 360/1280 px et liens au clavier dans les deux états d’abonnement |
| Reproductibilité | Générateur réellement exécuté en dossier temporaire ; accueil/tarifs identiques aux fichiers versionnés ; FAQ visible/structurée cohérente |
| Rendu | Inspection des captures des bénéfices à 360/1280 px ; aucun débordement horizontal |
| Revue indépendante | Une revue Sol 6.1, 76 tests et 23 E2E réexécutés ; aucun Critical/Important ; Minor de précision sur le consentement analytics corrigé |

La preuve du test de consultation a aussi été renforcée après revue : un espion du point d’entrée `openEliteCheckout` compte directement les appels, au lieu de s’appuyer seulement sur un marqueur qui pouvait disparaître au retour vers l’Atelier. Pas de seconde revue.

## Décisions sur les sujets laissés hors du lot

| Sujet examiné par la revue | Décision de l’exécuteur |
|---|---|
| Prix, valeur commerciale et conversion réelle | Pas de taux inventé ; audit fondé sur les fonctions, hypothèses explicitement distinguées des résultats. PREM11/PREM15 restent ouverts |
| Analyses avancées | Non livrées et non annoncées. PREM02 reste partiel ; PREM04 à réaliser après vérification des calendriers et droits serveur |
| Disponibilité des nouveaux styles en production | Migrations précédentes toujours préparées et non appliquées. Leur préflight et déploiement final restent nécessaires ; fallback ancien serveur maintenu |
| Quotas et autorité Premium complets | Aucune nouvelle autorisation payante. Limite client des routines connue ; PREM13/PREM14 restent ouverts |
| Autres calculs calendaires | `weekLogs`, récap et comparaisons contiennent encore des durées fixes ; à auditer avec DST avant le futur lot statistiques. Le traitement visuel d’une pause de semaine en cours reste à vérifier ; aucune garantie générale de calendrier donnée par cette correction ciblée |
| Preuve absence de checkout | Espion direct ajouté ; assertion du marqueur faite avant tout retour/rechargement |
| Accessibilité globale | Structure, clavier, noms accessibles et mobile contrôlés pour ce lot. Contraste, zoom et lecteurs d’écran complets restent dans QA13 |
| Paiement Paddle réel et Android Billing | Inchangés, non testés en production. PREM12 et parcours réels restent ouverts |

## Continuité et reprise

Main, production, Android, paiements, données utilisateur et migrations ne sont pas modifiés. Le changement préexistant d’avatar du workspace est conservé et exclu des commits de ce lot.

Rollback : revenir aux commits de la branche de ce lot, en conservant les correctifs d’équité précédents. Ne pas régénérer les anciennes sources pour annuler une correction isolée. Le futur déploiement doit embarquer ensemble les prérequis déjà livrés et cette suite, après recette réelle et audit Astra maximal de la version complète.

La priorité suivante recommandée est le moteur de comparaison de périodes personnelles, avec données sources, dates locales et validation d’abonnement serveur. Le chantier global reste ouvert.
