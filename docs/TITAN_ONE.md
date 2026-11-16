# TITAN ONE · Vision, état réel et relais (16 novembre 2026)

Branche de référence : `claude/youthful-knuth-pgg96r` (PR #149). Ce document remplace `docs/v131/RELAIS_FABLE.md` comme point
d'entrée ; le détail historique reste dans `docs/v131/`. Consolidation GitHub : [`CONSOLIDATION_GITHUB.md`](CONSOLIDATION_GITHUB.md).

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
