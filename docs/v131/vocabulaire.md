# TITAN V1.3.1 · Vocabulaire de référence

Référence unique pour tous les textes (site, application Web, application Android, fiche Google Play, e-mails, notifications).
Chaque notion a **un** terme, une casse, des synonymes interdits et, pour les sujets sensibles, **une** phrase canonique.
Dérivé du code et des règles serveur (sources citées), pas des textes marketing. Matrice de contrôle : [`lot6-textes-juridique.md`](lot6-textes-juridique.md).

Règles d’écriture communes : tutoiement, apostrophe typographique « ’ », espace insécable avant `: ; ? !` et à l’intérieur des guillemets « », nombres à la française (`1 800`, `4,99 €`), pas de jargon interne (`elite`, `premium`, `entitlement`, `seat`, `flag`, `RPC`).

## 1. Marque et espaces

| Notion | Terme retenu | Casse | À ne pas écrire | Source |
|---|---|---|---|---|
| Le produit | **TITAN** | Capitales, toujours | Titan (réservé au rang), TITAN OS, Titan App | `tools/lib/public-template.mjs`, `mobile/app.config.ts` |
| Écran d’accueil connecté | **QG** | Capitales, masculin : « ton QG » | Quartier général, Accueil, Dashboard, Aujourd’hui (nom de route, pas de libellé) | `js/app/qg.js`, `HomeScreen.tsx` |
| Espace des analyses | **Progrès** | Majuscule quand c’est le nom de l’onglet | Stats, Statistiques (sauf « statistiques d’usage », notion distincte) | `js/app/shell.js` |
| Espace social | **Communauté** | Majuscule pour l’onglet | Social, Réseau | `js/app/communaute.js` |
| Boutique cosmétique | **Atelier** | Majuscule | Boutique, Shop, Magasin | `js/app/atelier.js`, `AtelierScreen.tsx` |
| Fiche personnelle | **Profil** ; **profil public** (carte d’athlète accessible par lien) | Majuscule pour l’onglet | Compte (réservé au compte d’accès) | `js/app/profil.js`, `js/app/athlete.js` |
| Santé Connect | **Santé Connect** (nom français de Health Connect) | Deux majuscules | Health Connect dans un texte destiné à l’utilisateur | `HealthConnectScreen.tsx` |

## 2. Sport et journal

| Notion | Terme retenu | À ne pas écrire | Règle réelle |
|---|---|---|---|
| Unité du journal | **séance** | entraînement, activité, workout, session (sauf « activité Garmin » : ce que Garmin envoie avant de devenir une séance) | Une séance = un sport, une date, des mesures. Comptée une seule fois quelle que soit sa source. |
| Le carnet | **journal** | historique (réservé aux séances saisies plus de 30 jours après leur date), log | |
| Séance modèle | **routine** | programme, template | 5 en Gratuit, 20 avec TITAN+ (`PLUS` dans `tools/build-public-site.mjs`) |
| Intensité | **ressenti** (de 1 à 10) | RPE dans un texte grand public | Sans ressenti : 5 |
| Unité de l’effort | **minutes d’effort** | points d’effort, charge | Minutes comptées (90 pleines, 90 à moitié, rien au-delà) × intensité |
| Jour avec au moins une séance | **jour actif** | jour d’entraînement | |
| Rythme hebdomadaire choisi | **cadence** (de 1 à 7 jours actifs) | série, streak, flamme | Une semaine en pause ne compte ni pour ni contre |
| Difficulté en escalade | **cotation** | grade, niveau | Le mot « grade » n’est jamais affiché |
| Tracé GPS enregistré | **parcours** | trace, itinéraire, route | Android seulement ; bibliothèque privée |
| Pas quotidiens | **pas** | steps | Ne sont jamais des séances, ne donnent ni XP ni crédit |
| Utilisateur suivi par un coach | **sportif** / **sportive** | athlète (réservé à « carte d’athlète »), élève, client | |

## 3. Progression

| Notion | Terme retenu | Casse | À ne pas écrire | Règle réelle (source) |
|---|---|---|---|---|
| Points de progression | **XP** | Capitales, invariable, féminin : « l’XP est calculée » | points, expérience (réservé à la maîtrise), exp | `XP = minutes comptées × (0,6 + 0,08 × ressenti) × 10` ; plafonds 1 800 par jour, 9 600 par semaine, identiques pour tous (`js/core/effort.js`) |
| Palier d’XP | **niveau** | minuscule | level, lvl | Niveau suivant : `500 × niveau^1,3` XP ; ne se perd jamais |
| Titre lié au niveau | **rang** | minuscule ; noms avec majuscule | grade, ligue, palier, tier | Sept rangs, dans l’ordre (`TitanCodex.ranks`) |
| Les sept rangs | **Éclaireur** (niv. 1), **Explorateur** (3), **Sentinelle** (6), **Gardien** (10), **Champion** (15), **Titan** (25), **Légende** (40) | Majuscule initiale, accent sur Éclaireur et Légende ; « rang Titan » s’écrit en minuscules, « TITAN » est le produit | Eclaireur, Legende, TITAN pour le rang, Gardienne pour le rang | `js/renaissance-catalog.js` |
| Expérience dans un sport | **maîtrise** (dix paliers : Découverte … Référence) | minuscule | niveau de sport, mastery | Heures **et** semaines de pratique ; ne rapporte rien |
| Monnaie de jeu | **crédits** | minuscule | pièces (réservé aux pièces cosmétiques), coins, or, monnaie | 10 % de l’XP de la séance, mêmes plafonds ; jamais achetables avec de l’argent (`tests/no-currency-purchase.test.mjs`) |
| Objet cosmétique de l’Atelier | **pièce** (cadre, ambiance, carte, style) | minuscule | skin, item, objet | Les pièces acquises avec des crédits restent acquises |
| Distinction gagnée | **insigne** | minuscule | badge, trophée, médaille (sauf « trophées du club », notion distincte) | Cosmétique, ne se perd pas |
| Image du rang | **blason** | minuscule | écusson, badge de rang | 4 visuels approuvés, 3 vectoriels en attente |
| Personnage choisi | **personnage** | minuscule ; noms propres : L’Éclaireuse, Le Passeur, La Gardienne, L’Artisan, La Navigatrice, La Sentinelle | avatar dans un texte utilisateur | Débloqués aux niveaux 1, 1, 3, 6, 10, 15 |
| Séance saisie tard | **historique** | | séance rétroactive | Plus de 30 jours après sa date : journal, records et maîtrise, sans XP |
| Essai sans compte | **mode découverte** | minuscule | mode invité, démo | Données sur l’appareil, progression estimée |

Homonymes à surveiller : **Gardien** (rang, niveau 10) et **gardien** (adversaire d’un monde) ; **Sentinelle** (rang, niveau 6), **La Sentinelle** (personnage, niveau 15) et **La Sentinelle du ciel** (gardien des Aurores). Toujours écrire « le rang Gardien », « le gardien de la vallée », « le personnage La Sentinelle » quand le contexte ne tranche pas.

## 4. Aventure

| Notion | Terme retenu | Casse | À ne pas écrire | Règle réelle |
|---|---|---|---|---|
| L’ensemble narratif | **l’aventure** ; onglet **Aventure** | | RPG, mode histoire, jeu | |
| Un des quatre lieux | **monde** | minuscule | région, zone, carte, univers | Quatre mondes, tous gratuits (`tier: "free"`) |
| Parcours d’un monde | **campagne** | minuscule | saison (notion distincte), histoire | 9 chapitres + gardien par monde, 36 chapitres au total |
| Les quatre mondes | **La vallée de l’Aube**, **L’archipel des Marées**, **Les forges d’Obsidienne**, **La citadelle des Aurores** | Nom commun en minuscule, nom propre avec majuscule ; dans une phrase : « la vallée de l’Aube » | Vallée de l’aube, Forges (seul), Aurores (seul, réservé à la pièce de l’Atelier « Aurores »), Archipel des marées | `TitanCodex.worlds` |
| Étape d’une campagne | **chapitre** | minuscule | niveau, mission, étape | Un à trois jours actifs, sans échéance |
| Marque d’un chapitre terminé | **balise** (« allumer une balise ») | minuscule | checkpoint, phare, point | 36 balises |
| Adversaire final d’un monde | **gardien** : Le Veilleur de pierre, La Gardienne des courants, L’Artisan de braise, La Sentinelle du ciel | minuscule pour le nom commun | boss, ennemi, monstre | Demande 2 à 3 jours actifs et 30 à 135 minutes d’effort, 90 minutes au plus par jour |
| Objectif facultatif hebdomadaire ou mensuel | **quête** (quête de la semaine, quête du mois, quête commune) | minuscule | mission, défi (notion distincte), challenge | Donne un souvenir cosmétique, jamais d’XP ni de crédits (`js/app/quetes-periodiques.js`) |
| Événement collectif de saison | **expédition** | minuscule | raid, événement, saison (28 jours, notion distincte) | Toute la communauté face à un gardien de saison |
| Progression par les pas vérifiés | **Sentiers du Titan** | Majuscules | | Pas Santé Connect ou Garmin autorisés séparément |

## 5. Communauté

| Notion | Terme retenu | À ne pas écrire | Règle réelle |
|---|---|---|---|
| Partage choisi d’un fait sportif | **Moment** (majuscule, pluriel « Moments ») | post, publication, story | Partagé un par un, aux amis acceptés |
| Compétition amicale | **défi** (« défi sans mise ») | duel dans un texte utilisateur (nom interne du lien d’invitation), challenge, pari | Minutes d’effort ou jours actifs ; aucun crédit en jeu ; ne donne rien |
| Engagement à deux sur 14 jours | **TITAN Duo** ; la personne : **binôme** | partenaire, buddy, coéquipier | Entre amis acceptés, un seul binôme à la fois (`js/app/binome.js`) |
| Groupe à objectif d’effort hebdomadaire | **guilde** | clan, équipe | Objectif commun + discussion (messages gardés 72 h) |
| Espace privé d’un club réel | **club** | guilde (notion distincte), groupe | Annonces et modération par ses administrateurs ; au plus cinq clubs rejoints, trois créés (`js/app/clubs.js`) |
| Relation réciproque | **ami** (« amis par consentement ») | abonné, follower, contact | Demande acceptée par les deux |
| Suivi à deux | **coaching** ; **coach** et **sportif** | entraîneur, élève, client, athlète | Partage après accord explicite du sportif, révocable |

## 6. Offres

Noms internes interdits dans tout texte : `elite`, `premium`, `Coach Pro`, `coach_pro`, `titan01/02/03`, « Classique » hors du site tant que l’arbitrage ci-dessous n’est pas rendu.

| Offre | Terme retenu | À ne pas écrire | Ce que le serveur accorde (source) |
|---|---|---|---|
| Sans abonnement | **Gratuit** (application Android, pastilles des mondes) ; le site écrit encore « Classique » : **un seul nom à choisir, voir la matrice (D-08)** | Free, Basique, Standard, « Classique » et « Gratuit » dans une même page | 5 routines, 3 sportifs suivis ; tout le journal, la progression, les quatre campagnes |
| Abonnement individuel | **TITAN+** | Titan+, TITAN Plus, Premium, Elite, Pass | Droit actif au registre → `is_elite` ; comparaisons, bilans, 10 vues, 20 routines, accès temporaire à 4 pièces, aucune publicité sur Android ; **20 sportifs suivis** (règle héritée, `private.titan_coach_capacity`) |
| Abonnement coach, 5 places | **Coach** | TITAN Coach, Coach Standard | TITAN+ pour le coach ; 5 sportifs suivis, chacun avec TITAN+ tant qu’il est rattaché (`private.titan_coach_plan`) |
| Abonnement coach, 15 places | **Coach Ultra** | Coach Pro, Coach+, Coach Premium | Mêmes fonctions que Coach ; 15 places |
| TITAN+ reçu d’un coach | **place** (« une place TITAN+ ») | siège, licence, seat | Active tant que le lien est accepté et que l’offre du coach est active ; ne compte pas pour la capacité du sportif |

## 7. Phrases canoniques (une seule formulation par fait)

Ces phrases sont celles à reprendre telles quelles. Toute variante doit dire la même chose, ni plus ni moins.

| Sujet | Phrase canonique | Vérité vérifiée dans |
|---|---|---|
| Gratuit | « Le journal, les analyses de base, la progression, les quatre campagnes, la Communauté et l’Atelier sont gratuits, sans limite de durée. » | `FREE` (`tools/build-public-site.mjs`), `FREE_PLAN` (`playBilling.ts`) |
| TITAN+ | « TITAN+ ajoute des comparaisons de périodes, des bilans, des vues sauvegardées, plus de routines et un accès temporaire à quatre pièces de l’Atelier. Il ne donne ni XP, ni crédits, ni avance. » | `PLUS`, `js/core/effort.js` (mêmes plafonds) |
| Coach | « Coach : toi et 5 sportifs suivis, qui ont TITAN+ tant qu’ils sont rattachés à toi. » | `titan_coach_plan` (5), `PLANS` |
| Coach Ultra | « Coach Ultra : toi et 15 sportifs suivis, avec exactement les mêmes fonctions que Coach. » | `titan_coach_plan` (15), `PLANS` |
| Capacité de suivi | « Sans abonnement, tu peux suivre 3 sportifs ; 20 avec TITAN+ ; 5 avec Coach et 15 avec Coach Ultra, TITAN+ inclus pour eux. » | `private.titan_coach_capacity` — inversion 20 / 5 à arbitrer (matrice D-01) |
| Publicité | « Le site et l’application Web n’affichent aucune publicité. L’application Android gratuite affiche des publicités Google AdMob, après ton accord et jamais pendant une séance ; TITAN+, Coach et Coach Ultra n’en affichent aucune. » | `js/config.js` (`adsEnabled: false`), `mobile/src/ads/policy.ts`, `android-native.yml` |
| Forme courte (pied de page, accroche) | « Site sans publicité » — jamais « Sans publicité » seul | idem |
| Paiement | « Les abonnements s’achètent uniquement dans l’application Android, avec Google Play. Le site ne vend rien et n’encaisse aucun paiement. » | `js/config.js` (`webCheckout: false`), `functions/play-billing.mjs` |
| Disponibilité (vraie avant et après l’ouverture) | « Tant que l’achat n’est pas ouvert dans l’application Android, TITAN+ n’est pas encore en vente et aucun paiement n’est possible. Une fois ouvert, le prix et les conditions sont ceux que Google Play affiche avant toute validation. » | `BILLING_BUILD`, contrôle serveur avant paiement (`titan_play_checkout_ready_v1`) |
| Prix | Aucun montant sur le site ni dans le code : « Tarif affiché par Google Play ». Prix de référence en France, pour la fiche Play et la recette seulement : 4,99 € (TITAN+), 19,99 € (Coach), 39,99 € (Coach Ultra) par mois, TTC. | `tests/launch-decision.test.mjs`, `docs/V13_LEGAL_REVIEW.md` |
| Anciens abonnements | « Un abonnement souscrit autrefois sur le site reste géré par le prestataire indiqué sur ton reçu. » (ne jamais nommer ce prestataire comme vendeur actuel) | `functions/webhook.mjs`, `tests/launch-decision.test.mjs` |
| Résiliation | « L’abonnement se résilie dans Google Play ; l’accès reste actif jusqu’à la fin de la période payée. Supprimer ton compte TITAN ne résilie pas l’abonnement. » | `legal_cgu.html` § 4.3 |
| Coaching | « Le coach ne voit que ce que le sportif accepte de partager, propose des séances et ne modifie jamais le journal. Le sportif peut tout arrêter à tout moment. » | `js/app/coaching.js`, `public.coach_links` |
| Santé | « TITAN est un journal et un outil de motivation, pas un dispositif médical. » | `legal_cgu.html` |
| Données | « Privé par défaut. Tu peux exporter ou supprimer tes données depuis Profil, à tout moment. » | `js/app/profil.js`, `supprimer-mon-compte.html` |

## 8. Typographie des montants, durées et unités

- Prix : `4,99 €` (virgule, espace insécable avant €), « par mois » en toutes lettres dans une phrase, « / mois » dans une étiquette.
- « TTC » : uniquement à côté d’un prix réellement affiché ; jamais sur le site tant qu’aucun prix n’y figure.
- Durées : `45 min`, `5 h 20`, `1,5 an` (singulier en dessous de 2), `4,5 ans`.
- Grands nombres : `1 800`, `9 600` (espace fine insécable).
- Pourcentages : `62 %`.
- Sigles : XP, QG, GPS, GPX, CSV, JSON, RGPD ; « e-mail », « hors ligne », « en ligne ».
