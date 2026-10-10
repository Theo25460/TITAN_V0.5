# Contrat des événements de l’application TITAN

Collecteur existant : `TitanAnalytics.track(name, props)`, insertion dans `analytics_events`. Ce contrat concerne les quatorze pages d’application qui chargent `js/app/analytics.js`. Le suivi public historique de `js/content.js`, Android, les régies et leurs futurs événements restent à auditer séparément. Aucun SDK supplémentaire ni migration.

## Compatibilité et confidentialité

Les quatorze noms existants gardent leur sens ; sept noms sont ajoutés. Ne pas renommer un événement historique ni changer son unité pour une autre mesure : créer un nouveau nom et documenter sa transition. Les lignes historiques ne sont ni réécrites ni supprimées. `metadata.v = 300` reste la version de l’enveloppe actuelle ; la version de cache du script est distincte, désormais `300.2` partout dans l’application.

Enveloppe : `event_name`, `user_id`, `page` (pathname, 80 caractères maximum), `source`, `referrer = null`, `metadata`. Consentement refusé : aucun envoi. Sans réponse : compte anonyme, `user_id/source/referrer = null`, `metadata.consent = anonymous`. Accord : identité de la session courante lorsqu’elle existe et `metadata.consent = granted`. Une inscription en attente de confirmation sans session reste sans `user_id`. La session sert à attribuer le compteur ; elle ne décide jamais des droits TITAN+, récompenses ou transactions.

Pour les sept événements `analysis_*`, aucune attribution UTM n’est conservée ; seules les vues peuvent porter `kind = report | comparison`. Tout autre champ est supprimé, même si le filtre historique l’accepte ailleurs : nom/UUID de vue, sport, recherche, période, date, fuseau, nombre de séances, temps, mesure sportive, notes, GPS et paramètres complets ne sont pas transmis.

Le filtre historique conserve uniquement les clés `family`, `sport`, `step`, `source`, `plan`, `world`, `chapter`, `kind`, `count`, avec leurs bornes de format existantes. Les appels habituels ci-dessous envoient un sous-ensemble. Leur attribution UTM historique, limitée à 40 caractères, est conservée ; ce lot ne refond pas ce suivi publicitaire.

## Événements

| Nom stable | Déclenchement actuel | Propriétés du caller |
| --- | --- | --- |
| `signup` | Réponse réussie à la création de compte, propriétaire attendu provenant de cette réponse | Aucune ; contexte d’attribution séparé, jamais ajouté aux propriétés |
| `onboarding_completed` | Fin de l’onboarding | `count` des sports choisis |
| `first_session` | Premier enregistrement de séance du parcours actuel | `family` |
| `second_session` | Deuxième enregistrement de séance | `family` |
| `goal_created` | Création d’un objectif, après réponse réussie | `kind`, `family` facultative |
| `record_unlocked` | Moment indiquant un nouveau record | `kind`, `family` |
| `campaign_started` | Démarrage de campagne reconnu par le parcours | `world` |
| `campaign_progress` | Progression reconnue par le parcours | `world`, `chapter` |
| `challenge_joined` | Réponse réussie à l’acceptation du défi | Aucune |
| `weekly_recap_viewed` | Consultation du récapitulatif hebdomadaire | Aucune |
| `premium_checkout_started` | Action de souscription dans l’Atelier | `source = atelier` |
| `premium_activated` | Statut actif frais du serveur après un marqueur de checkout propre au compte et au navigateur | `source = atelier` |
| `sport_navigation_searched` | Recherche dans Records/Maîtrise | `source`, `count` ; aucun texte de recherche |
| `sport_navigation_filtered` | Modification d’un filtre | `source`, `kind`, `family`/`count` selon le filtre |
| `analysis_comparison_viewed` | Ouverture/calcul/restauration volontaire, résultat serveur valide et courant | Aucune |
| `analysis_report_viewed` | Ouverture/calcul/restauration volontaire, bilan serveur valide et courant | Aucune |
| `analysis_report_exported` | Bilan frais validé puis téléchargement CSV déclenché | Aucune |
| `analysis_view_created` | Receipt valide de création reconnu | `kind` |
| `analysis_view_renamed` | Receipt valide de renommage reconnu | `kind` |
| `analysis_view_deleted` | Receipt valide de suppression reconnu, y compris le nettoyage Free | `kind` si disponible |
| `analysis_view_opened` | Paramètres frais validés, accès autorisé, restauration demandée | `kind` |

Un rafraîchissement par timer, retour de focus, changement d’historique ou de connexion n’ajoute aucun événement de consultation des analyses. Une erreur, un refus Premium, une réponse malformée/étrangère/obsolète ou une mutation non confirmée ne compte pas comme succès. Une mutation confirmée compte avant le rafraîchissement de liste, même si celui-ci échoue. Ouvrir une vue signifie restaurer ses paramètres ; la réussite du recalcul est comptée séparément par l’événement du bilan ou de la comparaison. Un export indique son déclenchement, pas la lecture du fichier téléchargé.

## Envoi et limites

Le collecteur observe les changements d’authentification indépendamment de `state.js`, y compris sur la page de connexion. Il vérifie le consentement, son époque, l’identité du compte, les époques d’authentification/transition et le client après la récupération de session, puis au dernier point de dispatch natif. A→B→A, remplacement direct du client et refus→accord invalident une attente. Un changement de préférence dans un autre onglet l’invalide aussi via `storage`.

L’insertion emploie une instance éphémère du même SDK, avec `accessToken` capturé et un `global.fetch` qui refuse tout contexte obsolète juste avant `fetch`. Elle ne lit pas une seconde session du client partagé, ne persiste pas d’authentification, ne démarre pas de boucle de refresh et ne modifie pas ce client. Les retries SDK sont désactivés pour cette écriture. Sans accord ou session, aucun jeton de compte n’est utilisé. Une requête déjà envoyée ne peut pas être retirée rétroactivement.

`signup`, `onboarding_completed`, `first_session`, `second_session`, `premium_activated` sont dédupliqués dans ce navigateur et pour la clé de compte capturée. Avec accord, une session authentifiée fournit cette clé ; pour une inscription sans session, le propriétaire du receipt fournit seulement la clé locale. Le troisième argument `track('signup', {}, {owner})` provient de `signUp`, ne sert pas à autoriser un compte et n’est jamais copié dans la ligne. Une session étrangère est refusée. Deux comptes distincts sur `/login` ne partagent donc plus `anon:signup`.

La clé n’est mémorisée qu’après une insertion acceptée ; hors ligne/échec laisse une tentative explicite ultérieure possible. Deux appels simultanés de la même clé n’insèrent pas deux lignes. Le collecteur ne fait aucun replay automatique et ne possède aucune file d’attente persistante ou mécanisme global exactement-une-fois : une réponse perdue après commit peut provoquer un doublon lors d’une nouvelle tentative, et un autre appareil dispose de sa propre mémoire. Ces événements mesurent l’usage, jamais une preuve comptable ou d’accès.

## Attribution du checkout dans l’Atelier

`premium_checkout_started` garde son unité historique : clic sur la souscription, y compris si le SDK ne peut pas ouvrir le paiement. Il ne signifie ni écran effectivement chargé ni paiement réussi. Le helper retourne `true` après l’appel à `Paddle.Checkout.open()` ; juste avant cet appel, compte, client et époque de transition doivent encore correspondre au contexte capturé, sans transition active. Un aller-retour A→B→A invalide aussi une attente du SDK.

Le marqueur `titan_checkout_started_v2:<owner>` est écrit uniquement après ce retour `true`, dans le même contexte. Il contient version, propriétaire, instant et état de notification. La clé v1 sans propriétaire est supprimée sans conversion attribuée : elle ne peut pas être migrée avec certitude. Un marqueur malformé, étranger à sa clé, futur ou vieux d’au moins trois jours est rejeté. Les marqueurs des autres comptes restent intacts.

Une réponse fraîche de `titan_atelier`, ou la lecture de profil de compatibilité, doit confirmer le statut actif. Compte/client/époque et ordre des lectures sont contrôlés après chaque attente ; une ancienne réponse ne confirme aucun droit ni événement. La confirmation visuelle est indépendante du consentement et donnée une seule fois par marqueur. Un refus de mesure au moment de cette confirmation supprime le marqueur sans envoi ni reprise après accord.

L’Atelier conserve le marqueur après un échec de mesure et peut retenter `premium_activated` lors d’une nouvelle confirmation fraîche du serveur. Il le consomme après un ack accepté, uniquement si le compte reste courant et si le contenu du marqueur est encore exactement celui de la tentative ; un ancien ack n’efface pas un nouveau checkout. Les rafraîchissements simultanés sont regroupés dans cet onglet. Ce comportement appartient au caller Atelier, sans queue générale dans le collecteur. La déduplication historique de `premium_activated` reste une fois par clé locale de compte, pas une fois par renouvellement : un marqueur d’un abonnement ultérieur peut donc rester jusqu’à expiration. Cette mémoire locale est bornée, sans ledger durable. Une requête reçue par le serveur dont l’ack est perdu peut compter deux fois ; la coordination entre onglets n’est pas une garantie exactement-une-fois.

La suppression sur refus vaut lorsque ce refus est observé à la confirmation ou au retour de la tentative. Le marqueur ne conserve pas un historique complet des préférences : refus→accord entre deux confirmations, ou pendant une tentative dont l’ack échoue, peut laisser une nouvelle confirmation sous accord retenter la mesure. Le collecteur protège toujours les attentes avant dispatch, mais la suppression persistante après toute révocation passée reste à traiter séparément. Cette limite est acceptée pour ce correctif borné, pas présentée comme une garantie générale de non-reprise.

Le marqueur est un indice d’attribution local, jamais une preuve financière ou une autorisation Premium. Il ne relie pas une transaction précise à un abonnement ; le SDK peut encore échouer après son invocation, et un paiement peut être abandonné. Cette correction ne ferme pas un overlay déjà ouvert lors d’un changement ultérieur de compte. Recette réelle de paiement, attribution entre appareils, renouvellements, suivi public historique et dashboard DATA08 restent ouverts. Les prix, le webhook et les droits serveur restent inchangés. Versions de cache : `main.js` 300.2 sur les treize pages qui le chargent, `atelier.js` 300.5 dans l’Atelier.

Références Paddle : [ouverture du checkout](https://developer.paddle.com/paddle-js/methods/paddle-checkout-open/), [checkout terminé](https://developer.paddle.com/paddle-js/events/checkout-completed/), [webhooks](https://developer.paddle.com/webhooks/).

Références techniques contrôlées : [session Supabase](https://supabase.com/docs/reference/javascript/auth-getsession), [insertion](https://supabase.com/docs/reference/javascript/insert), [configuration et fetch personnalisé](https://supabase.com/docs/reference/javascript/initializing), [changelog](https://supabase.com/changelog). Client verrouillé à `2.111.0`, API/table/grants/RLS inchangés. Les tests de transport chargent réellement le SDK vendored et simulent uniquement ses frontières d’authentification/HTTP. `sql/tests/300_analytics_events.sql` vérifie, sous vrais rôles API sur réplique transactionnelle, les lignes minimales acceptées, le refus d’un compte étranger et l’absence de lecture côté client.
