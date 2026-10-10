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
| `premium_activated` | Statut actif après le marqueur local de checkout historique | `source = atelier` |
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

La clé n’est mémorisée qu’après une insertion acceptée ; hors ligne/échec laisse une tentative explicite ultérieure possible. Deux appels simultanés de la même clé n’insèrent pas deux lignes. Aucun replay automatique, file d’attente persistante ou mécanisme global exactement-une-fois : une réponse perdue après commit peut provoquer un doublon lors d’une nouvelle tentative, et un autre appareil dispose de sa propre mémoire. Ces événements mesurent l’usage, jamais une preuve comptable ou d’accès.

Le funnel de conversion existant reste à renforcer : son marqueur de checkout est lié au navigateur, pas explicitement au propriétaire. Recette réelle de paiement, attribution entre appareils, suivi public historique et dashboard DATA08 restent ouverts. Les nouveaux événements ne changent ni Paddle ni le statut Premium.

Références techniques contrôlées : [session Supabase](https://supabase.com/docs/reference/javascript/auth-getsession), [insertion](https://supabase.com/docs/reference/javascript/insert), [configuration et fetch personnalisé](https://supabase.com/docs/reference/javascript/initializing), [changelog](https://supabase.com/changelog). Client verrouillé à `2.111.0`, API/table/grants/RLS inchangés. Les tests de transport chargent réellement le SDK vendored et simulent uniquement ses frontières d’authentification/HTTP. `sql/tests/300_analytics_events.sql` vérifie, sous vrais rôles API sur réplique transactionnelle, les lignes minimales acceptées, le refus d’un compte étranger et l’absence de lecture côté client.
