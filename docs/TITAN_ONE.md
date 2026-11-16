# TITAN ONE · Vision, état réel et relais (16 novembre 2026)

Branche de référence : `claude/youthful-knuth-pgg96r` (PR #149). Ce document remplace `docs/v131/RELAIS_FABLE.md` comme point
d'entrée ; le détail historique reste dans `docs/v131/`. Consolidation GitHub : [`CONSOLIDATION_GITHUB.md`](CONSOLIDATION_GITHUB.md).

## 0. Opération Masterpiece (16 novembre 2026, après-midi et soir) — état réel

Référence visuelle : `PRODUCT.md` (vérité produit) et `DESIGN.md` (système tel que construit, Android et Web). Captures :
`docs/design/captures/android/` (simulation navigateur de l'application à 412 dp, **pas un téléphone**) et
`docs/design/captures/web/` (Chromium sans écran, 390×844 et 1440×900, avant/après de sept pages).

### Ce qui est fait et poussé

| Lot | Contenu | Commit | Preuve |
|---|---|---|---|
| 1. Migrations v14 | Fichiers 01 à 07 **appliqués en production** (TITAN LIVE, calendrier des événements, défi par lien, semaine tenue, lettres à soi-même, import d'historique, chronique de guilde) | — | Registre de production : 128 migrations, dernière `20261117150000` |
| 2. Système « Programme » | Une couleur franche par espace (citron Séance, azur Progrès, mousse Aventure, craie Profil, corail Communauté ; cyan = progression, ambre = records), Archivo seul en trois largeurs, cartes sans contour, sections sous filet, figure signature « le programme » (sports × jours) partagée Web/Android | `425047f` | `tests/program-grid.test.mjs` (8), Jest |
| 3. Android | QG, Séance, Progrès, Aventure, Profil (raccourci), fin de séance recomposés ; visite guidée avant inscription (4 étapes, facultative, reprise, sans aucune écriture) | `425047f`, `a139220`, `a921cec`, `9d2c6b4` | Jest 941 tests / 105 suites ; 12 tests de la visite |
| 4. Web | QG, Profil, Progrès, Séance, Aventure, Journal, Communauté recomposés sur téléphone et sur grand écran (deux colonnes au QG, identité en colonne fixe au Profil, journal en tableau, programme sur 26 semaines) ; les autres pages héritent du système ; Manrope retirée | `76d66a1` … `00c3e92` | `pnpm run verify` : 668 tests ; suite navigateur complète 1042/1042 (lancée sur `0f2278f` dans la copie de l'agent, avant le dernier commit qui n'ajoute qu'un test unitaire) |
| 6. Cohérence | 9 contradictions corrigées entre textes et code (confidentialité v13, CGU v9, suppression v3, crédits de la semaine tenue, sièges coach, Garmin, publicité) ; test automatique | `c4cee5a` … `f0c62d0` | `tests/coherence-offers.test.mjs` (13, 17 mutations détectées) |

### Ce qui n'est pas fait

- **Migrations 08 (chapitres de vie) et 09 (monde live dans l'export)** : la confirmation demandée par l'outil est restée sans
  réponse. Rien d'incohérent en attendant : les écrans concernés disent « pas encore disponible ». Contrôles finaux
  (`99-check-after.sql`, trois postflights, empreinte des données) à faire après elles. Empreinte des 146 tables relevée avant
  l'application : `dc39bfdfaf319fcd6d50ee0a7b4fd98c` (2 186 lignes).
- **Aucune sauvegarde restaurable** : l'organisation Supabase est sur l'offre gratuite. Les neuf fichiers sont additifs et
  transactionnels ; cela ne remplace pas une sauvegarde.
- **Illustrations** : le générateur d'images a refusé une troisième fois (« insufficient credit »). Aucun blason Champion, Titan
  ou Légende, aucune illustration nouvelle. Rien n'a été remplacé par une icône générique.
- **Publication** : rien n'est publié. La PR #149 n'est pas fusionnée, Netlify sert l'ancienne version, aucun envoi à Google Play.
- **Appareil réel** : aucun écran n'a été vu sur un téléphone ; TalkBack non testé.
- **Défauts Web connus** (détail dans `DESIGN.md`) : la barre haute du téléphone dépend de `:has()` et `color-mix()` ; la page
  Aventure montre deux fois la même peinture (en-tête et carte) ; environ 80 petits libellés subsistent au-dessus des titres ;
  largeurs 960–1099 px, texte à 200 %, survol et focus non capturés ; les pages publiques de présentation gardent leur composition.

### Les trois objectifs

| Objectif | Statut | Pourquoi |
|---|---|---|
| A. Refonte visuelle et UX | ORANGE | Android et Web refondus et testés ; aucune vérification sur appareil réel, ni Firefox ni Safari ; pages secondaires Web (Coaching, Objectifs, Défi, Recours, Atelier) non revues avec des données serveur ; rien n'est en ligne |
| B. Illustrations et immersion | ROUGE | Trois blasons manquants, aucune illustration nouvelle faute de générateur |
| C. Finalisation et publication | ORANGE | 7 migrations sur 9 appliquées ; CI « Qualite » verte sur `a139220` ; rien de publié |

### Décisions du propriétaire relevées par le contrôle de cohérence

1. `private.titan_plan_products` est vide dans les migrations : si les produits Google Play ne sont pas associés en production,
   un coach payant n'obtient ni ses sièges ni le TITAN+ inclus. À vérifier avant toute vente.
2. Âge : les textes disent 13 ans, aucun âge n'est demandé à l'inscription et la publicité n'est pas marquée « mineur ».
3. Mentions légales : identité de l'éditeur « à publier » alors que des abonnements sont décrits. Rien n'a été inventé.
4. La FAQ dit « application web installable » alors que les offres se vendent dans l'application Android ; lien Play vide.

## 1. La promesse et les trois piliers

**Tu fais du sport. TITAN transforme tes efforts en progression et en aventure.**

| Pilier | Ce qu'il doit tenir | Où il vit dans le produit |
|---|---|---|
| A. Compagnon sportif | Enregistrer vite, mesurer juste, comprendre ses progrès. Utile sans le RPG | Séance (saisie, GPS, GPX, montre), Journal, Progrès, Records, Objectifs, Carrière |
| B. RPG sportif | Objectif → effort → résultat → progression → monde qui change → nouvelle envie. L'effort réel est la seule source | XP et rangs, Aventure (4 mondes, gardiens), Sentiers, quêtes, TITAN LIVE et son Camp de base |
| C. Social | Relations réelles, équité entre niveaux, vie privée par défaut | Amis, TITAN Duo, défis par lien, clubs, saisons, coaching |

Règles qui ne se négocient pas : aucune XP ni crédit sans effort confirmé par le serveur ; rien de payant ne donne d'avance ;
aucune mécanique de pression (pas de série à ne pas casser, pas de compte à rebours) ; le RPG ne retarde jamais une saisie.

## 2. Ce que cette session a livré

| Lot | Contenu | Commit | Preuve |
|---|---|---|---|
| Consolidation | 140 branches et 46 PR classées par contenu ; 6 seulement portaient du neuf | `0858e02` | `tools/github/branch-inventory.py`, registre |
| TITAN LIVE intégré | Moteur, 20 Voies, 260 sports, séance en direct Web et Android, règlement serveur | `faae973` | 39 tests moteur, test SQL, parcours Web, Jest |
| Fonctions Android intégrées | 35 commits : découverte sans compte, quêtes, défis par lien, Rétro, lettres à soi-même, import Strava, etc. | `56bf2da` | 924 puis 928 tests Jest ; 7 tests SQL |
| « L'Expédition » | La vue aventure d'une séance en direct devient une ascension (camp, balises, sommet), géométrie partagée Web et Android ; deux volets sur grand écran ; bilan de fin | `c710e13` | 7 tests de géométrie, 4 parcours Web, 4 tests Jest, captures `docs/live/captures/` |
| Appuis perdus en direct | La page ne se reconstruit plus chaque seconde | `c710e13` | Parcours rouge sans le correctif |
| Entrée Web de TITAN LIVE | « Vivre la séance en direct » sur la page Séance, derrière `screens.live` | `c710e13` | Parcours Web |
| Export de compte | Le monde live figure dans « Exporter toutes mes données » | `88c6c80` | Test SQL rouge puis vert |
| Paquet de production v14 | 9 migrations prêtes, répétées, **non appliquées** | `0858e02`, `88c6c80` | Empreinte de départ et d'arrivée, rejeu refusé |

Sessions précédentes du même jour (Opus) : 10 migrations V1.3.1 appliquées en production et vérifiées, faille d'amitié forcée
fermée, résidus de sécurité, générateur des pages publiques, Atelier, traces GPS, texte agrandi (`docs/v131/RELAIS_FABLE.md`).

## 3. Tableau de contrôle

VERT = terminé et vérifié ; ORANGE = partiel ou validation insuffisante ; ROUGE = défaut bloquant ou risque confirmé.

| Domaine | Statut | Justification |
|---|---|---|
| Consolidation GitHub | VERT | Inventaire reproductible ; les deux branches actives fusionnées ; rien d'ancien réintroduit |
| Fonctionnalités Web (candidat) | VERT | Typage, tests unitaires, build, audit verts ; suite navigateur : voir § 5 |
| Fonctionnalités Android (candidat) | ORANGE | Typage et Jest verts ; build natif et émulateur en CI ; aucun téléphone réel |
| TITAN LIVE | ORANGE | Complet et testé derrière son réglage ; jamais joué sur un téléphone en mouvement ; illustrations de fond absentes ; migration non appliquée |
| RPG et moments forts | ORANGE | Chaîne séance → récompense → monde vérifiée par tests ; l'Expédition est la seule scène nouvelle ; premier gardien, monde terminé et record restent des écrans, pas des scènes |
| Social | ORANGE | Défis par lien, quêtes communes, saisons intégrés ; jamais testés avec de vrais groupes |
| Direction artistique | ROUGE | 4 blasons approuvés sur 7 ; aucune illustration nouvelle : générateur sans crédits (deux refus) ; propositions de la PR #147 non retenues |
| Performance Web | ORANGE | 1,4 Mo de scripts par page (300 Ko compressés), inchangé ; page live allégée en redessins |
| Sécurité (production) | VERT | Migrations V1.3.1 appliquées, contrôles 54/54 et 42/42 ; restent trois réglages de tableau de bord |
| Base de données (dépôt) | VERT | Deux chaînes de migrations et contrats concurrents verts |
| Migrations de production | ORANGE | V1.3.1 appliquée ; paquet v14 prêt, en attente de décision |
| Paiements | ORANGE | Serveur prêt ; aucun achat de licence réalisé |
| CI GitHub | ORANGE | Dernier passage complet lu : un test Android intermittent, corrigé (`dbd5b7b`) ; le passage sur la tête de branche est à lire dans la PR #149 |
| Déploiement Web | ROUGE | `titan-app.fr` sert l'ancienne version (CGU version 6) tant que #149 n'est pas fusionnée et le SHA autorisé |
| Publication Android | ROUGE | Dernier bundle distribué : 1.2.1 (1301) ; le candidat n'a pas été envoyé à Google Play |
| Textes légaux et commerciaux | ORANGE | Cohérents dans le candidat et tenus par `tests/coherence-offers.test.mjs` (offres, places, prix, publicité, TITAN LIVE, Garmin, données) ; conditions version 9, confidentialité version 13, suppression de compte version 3 (16 novembre) ; validation juridique humaine en attente |

## 4. Critères d'excellence et valeurs de référence

Seules les valeurs réellement mesurées sont chiffrées. « Non mesuré » appelle un test, pas une estimation.

| Critère | Mesure | Valeur de référence | Cible proposée |
|---|---|---|---|
| Accès à la première séance | Temps entre l'ouverture et une séance enregistrée, nouvel utilisateur | Non mesuré (aucun test utilisateur) | Moins de 90 s, à valider par test |
| Compréhension de l'onboarding | Part des testeurs qui reformulent la promesse | Non mesuré | 4 sur 5 |
| Chargement Web (LCP, téléphone émulé) | Chromium, première visite, mesure du 15 novembre (`docs/v131/RAPPORT_FINAL.md`) | QG 3,0 s · Séance 2,7 s · Profil 3,1 s · Aventure 2,8 s | Moins de 2,5 s |
| Poids des scripts par page | Somme compressée | 300 Ko (gzip) | Moins de 180 Ko |
| Fluidité de la séance en direct | Reconstructions complètes de la page par minute, séance en cours sans action | 60 avant ; 1 au plus après (quand l'élan change), `c710e13` | 1 au plus |
| Fiabilité des parcours | Suite navigateur complète | 1 échec intermittent sur 1 034 par exécution avant corrections ; voir § 5 | 0 sur 3 exécutions consécutives |
| Parité métier Web/Android | Modules partagés identiques | 23 modules, contrôle par empreinte | 100 % |
| Erreurs critiques | Groupes de plantage Play sur 28 jours | Aucun affiché, échantillon insuffisant | 0 |
| Hors ligne | Parcours de reprise et d'envoi différé | Couverts par tests ; non mesurés sur appareil | Aucune séance perdue |
| Accessibilité | axe sur les pages publiques ; texte à 200 % | axe vert ; boutons corrigés ; TalkBack non testé | Passage TalkBack sans blocage |
| Satisfaction après séance, partage, invitation | Tests utilisateurs | Non mesuré | Protocole : `docs/v131/lot3-4-ux-android.md` § test utilisateurs |

## 5. Tests de la tête de branche

| Suite | Résultat |
|---|---|
| Web : typage, tests unitaires, build, audit, garde de publication | 642 tests, 0 échec |
| SQL : deux chaînes de migrations, contrats concurrents | Vert |
| Android : typage, Jest | 928 tests, 104 suites, 0 échec après `dbd5b7b` (l'échec intermittent de `gpsRecordScreen` est expliqué et corrigé) |
| Parcours TITAN LIVE Web | 4 parcours, 12 exécutions sans échec |
| Suite navigateur complète (locale) | En cours à l'écriture de ce document ; résultat reporté dans la description de la PR #149 |
| CI sur `88c6c80` | Tests et build : vert. Migrations (PostgreSQL 17.6) : vert. Android : 1 échec sur 928 (`gpsRecordScreen`, test qui rappuyait sur un bouton encore verrouillé), corrigé dans `dbd5b7b` |

## 6. Décisions qui vous reviennent

1. **Fusionner #149** dans `main` (elle contient #148), puis autoriser le déploiement Netlify.
2. **Fermer les 43 PR obsolètes** (liste dans le registre) : leur contenu est déjà dans `main`.
3. **Appliquer le paquet v14** (`supabase/release-v14/README.md`). Deux fichiers ont un effet visible : le calendrier des événements
   collectifs et le gain de 50 crédits cosmétiques par semaine tenue.
4. **Ouvrir TITAN LIVE** (`screens.live`) à votre compte d'abord, sur téléphone, avant tout pourcentage.
5. **Direction artistique** : recharger le générateur d'images, puis trancher sur les mondes photographiques de la PR #147.
6. Réglages Supabase : mots de passe compromis, second facteur administrateur, politiques d'envoi du stockage `avatars`.

## 7. Reprise : chantiers ordonnés

1. **Scènes des moments forts** (premier niveau, premier gardien, monde terminé, record) : réutiliser la géométrie de
   `js/core/live-scene.js` et le composant `ProgressReveal` ; une scène par moment, même module partagé, mêmes tests.
2. **Fond illustré par Voie** dans l'Expédition (`docs/live/ASSETS.md`) dès que des illustrations approuvées existent.
3. **Expériences collectives de TITAN LIVE** : brancher sur expéditions et TITAN Duo existants (`docs/live/GAME_DESIGN.md` § 8).
4. **Performance Web** : isoler les trois fonctions de `js/titan_features.js` utilisées au démarrage, charger le reste à la demande ;
   premier écran du QG en HTML statique.
5. **Redessins par reconstruction** : appliquer aux pages Profil, Aventure et Atelier la règle posée sur la page live (ne redessiner
   que ce qui change) ; c'est la cause des derniers parcours intermittents.
6. **Tests réels** : téléphone (GPS, TalkBack, texte 200 %), achat de licence Google Play, 5 à 10 nouveaux utilisateurs.

## 8. Risques résiduels

- Fonctions intégrées aujourd'hui mais jamais essayées sur appareil : TITAN LIVE, annonces vocales, image de séance, import Strava.
- Économie : la semaine tenue ajoute un gain de crédits cosmétiques ; l'équilibrage n'a été vérifié que par ses tests SQL.
- Insertions anonymes de `contact_messages` et `analytics_events` sans limite par appelant (décision produit).
- Aucune garantie d'absence totale de faille : seuls les scénarios testés sont couverts.
