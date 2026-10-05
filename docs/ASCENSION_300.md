# TITAN 300 — Ascension

Document de conception **vivant** de la release 300. Il fixe les décisions structurantes, les règles chiffrées et l'état d'avancement. L'audit qui la précède : [`AUDIT_REPRISE_2026-10.md`](AUDIT_REPRISE_2026-10.md).

## 1. Promesse

> Fais du sport. TITAN le transforme en progression.

La boucle à servir en permanence : **je prévois → je bouge → j'enregistre → je comprends → je progresse → le monde réagit → je reviens.**

Le sport réel est le produit. Le jeu amplifie la motivation sans jamais remplacer la valeur sportive : quelqu'un qui ignore toute la couche RPG doit trouver TITAN utile (journal, analyses, records, objectifs).

Les cinq piliers non négociables : tracker multisport excellent, progression longue et gratifiante, univers identifiable, mobile exceptionnel, **zéro pay-to-win**.

## 2. Architecture de l'information

Cinq territoires, identiques sur mobile (barre basse) et ordinateur (rail latéral) :

| Territoire | Question | Contenu |
|---|---|---|
| **QG** `/aujourdhui` | Qu'est-ce qui compte maintenant ? | Une action dominante, la semaine (cadence), la dernière séance, la progression, un repère expliqué. |
| **Progrès** `/stats` | Est-ce que je progresse ? | Semaine (récap), Journal, Analyses, Records, Objectifs. |
| **Séance** `/training` | Comment j'enregistre mon effort ? | Saisie rapide par famille de sport, chrono, routines, brouillon, puis moment de résultat. |
| **Aventure** `/adventure` | Que débloque mon effort ? | Monde en cours, chapitre, épreuve du gardien, expéditions, collection. |
| **Profil** `/profile` | Qui suis-je dans TITAN ? | Personnage, rang, TITAN DNA, collection, communauté, carte publique, réglages. |

### Choix structurants

- **Chat global retiré de la navigation.** C'est du bruit et une charge de modération sans valeur sportive. Le canal de guilde reste.
- **Arbre de talents, combat client, capaciteur et mobs retirés.** C'était l'ancien RPG, où cliquer pouvait rapporter plus que bouger. Les boss reviennent sous forme d'**épreuves de gardien** et d'**expéditions** alimentées par l'effort normalisé.
- **Paris de crédits sur les défis supprimés.** Un défi entre amis est un repère sportif, pas un pari.
- **Trophées, insignes, avatars, titres et cadres fusionnés** dans une seule **Collection**.
- **Boutique → Atelier.** Uniquement cosmétique.
- **Mode découverte** : identifiant local stable, données clairement marquées « sur cet appareil », proposition d'import au moment de créer le compte. La démo marketing reste explicitement fictive.

## 3. Progression (règles chiffrées)

Quatre couches visibles, pas plus.

### 3.1 Effort normalisé et XP (serveur, `sport-effort-v300`)

L'XP mesure le **temps d'effort pondéré par l'intensité**, identique pour tous les sports :

- `minutes` = durée déclarée. À défaut, une estimation par famille (distance ÷ vitesse type du sport, séries × 2,5 min…), signalée comme estimée.
- `minutes comptées` = `min(m, 90) + 0,5 × min(max(m − 90, 0), 90)`, soit 135 au maximum.
- `intensité` = `0,6 + 0,08 × RPE` (RPE absent = 5 → 1,0 ; bornes 0,68 à 1,4).
- `XP = arrondi(minutes comptées × intensité × 10)` : 1 minute d'effort modéré ≈ 10 XP.
- Plafonds : 1 800 XP par jour, 9 600 XP par semaine. Crédits = 10 % de l'XP. **Identiques avec ou sans TITAN+.**
- Séance datée de plus de 30 jours : acceptée dans le journal comme **historique**, sans XP ni crédit ni contribution d'aventure.

Effets : 10 km de course en 55 min (RPE 6) = 594 XP ; 1 500 m de natation en 40 min = 432 XP ; 45 min de musculation à RPE 7 = 522 XP. Plus de prime absurde pour une unité.

### 3.2 Rang TITAN (global, très long terme)

- Niveau suivant : `req(L) = arrondi(500 × L^1,3)`. Cumul : niv 3 = 1 731 ; niv 6 = 10 900 ; niv 10 = 38 473 ; niv 15 = 101 867 ; niv 25 = 340 569 ; niv 40 = 1 021 813.
- Rangs : Éclaireur 1 · Explorateur 3 · Sentinelle 6 · Gardien 10 · Champion 15 · Titan 25 · Légende 40.
- Simulation (`node tools/simulate-progression.mjs`) :

| Profil | 1 mois | 3 mois | 1 an | 2 ans | 5 ans |
|---|---|---|---|---|---|
| Débutant 1,5 × 35 min | 3 | 4 | 8 | 11 | 16 |
| Régulier 3 × 45 min | 4 | 7 | 13 | 17 | 26 |
| Actif 5 × 60 min | 6 | 10 | 18 | 25 | 37 |
| Intensif 7 × 75 min | 8 | 13 | 24 | 32 | 48 |

- Les comptes existants gardent leur **XP totale**. Leur niveau est recalculé sur la nouvelle courbe, et personne ne descend.

### 3.3 Maîtrise par discipline

Une progression par sport, fondée sur la **pratique**, jamais sur la performance (on ne compare pas les talents) :

| Niveau | Nom | Heures | Semaines pratiquées |
|---|---|---|---|
| 1 | Découverte | 0 | 0 |
| 2 | Initiation | 2 | 2 |
| 3 | Pratique | 6 | 4 |
| 4 | Régularité | 12 | 8 |
| 5 | Solidité | 20 | 12 |
| 6 | Expérience | 32 | 20 |
| 7 | Expertise | 50 | 30 |
| 8 | Maîtrise | 75 | 45 |
| 9 | Excellence | 110 | 65 |
| 10 | Référence | 160 | 90 |

Les deux seuils sont requis. L'affichage est toujours explicable : « Course à pied · Maîtrise 4 · 14 h · 9 semaines ».

### 3.4 Cadence (remplace toute notion de streak)

- L'utilisateur choisit sa **semaine type** : 1 à 7 jours actifs (3 par défaut).
- Une semaine est **tenue** quand ce nombre de jours actifs est atteint. Le repos ne coûte rien, seul le compte hebdomadaire importe.
- **Cadence = semaines tenues sur les 8 dernières** (8 encoches). Le compteur « semaines tenues » à vie ne baisse jamais.
- Une semaine déclarée **en pause** (vacances, blessure) sort de la fenêtre au lieu de compter comme ratée.
- Un **retour après une pause** de 14 jours ou plus est un moment positif, jamais un reproche.

### 3.5 Aventure

- Le modèle serveur Renaissance est conservé : jours actifs admissibles, une contribution par jour, révisions, récompenses cosmétiques uniques.
- Le **chapitre 9 de chaque monde devient l'épreuve du gardien** : jours actifs **et** minutes d'effort normalisées (plafond de 90 par jour), barre de résolution du gardien.
- Les textes sont réécrits : courts, concrets, avec un fil narratif et des révélations. La carte du monde s'illumine chapitre après chapitre.
- **Expéditions** (événements) : objectif commun en minutes d'effort normalisées, contribution plafonnée par personne et par jour, inscription explicite, uniquement des séances postérieures à l'inscription. Portées : monde (tous), guilde, amis. Récompenses : insignes, titres, souvenirs.

### 3.6 Collection

Portraits, titres, cadres, insignes de chapitre, trophées de jalons (sessions, heures, semaines tenues, maîtrises), souvenirs d'expédition. **Dérivés des données serveur**, jamais réclamés par le navigateur. Les crédits n'achètent que du cosmétique à l'Atelier.

## 4. Valeur sportive

- **Familles de saisie** : endurance (distance, durée, dénivelé, allure ou vitesse), force (exercices, séries, charge, répétitions, RIR, volume, e1RM), escalade (système de cotation, bloc ou voie, essais, réussites), poids du corps (mouvements, répétitions ou maintien, variantes), pratique (durée, RPE, champs du sport).
- **Records** : uniquement entre valeurs comparables (même sport, même famille, même distance repère, même exercice et même nombre de répétitions, même système de cotation et contexte), toujours reliés à la séance source.
- **Repères (insights)** : moteur déterministe, chaque message porte son **pourquoi** et sa source. Pas de « continue champion ».
- **Récap hebdomadaire** : volume, comparaison avec la moyenne des 4 semaines précédentes, sport dominant, records, objectifs, déblocages, prochaine action. Court, beau, partageable.
- **TITAN DNA** : répartition réelle par famille, maîtrises, cadence, records marquants, horaires préférés, jalons. Aucun score inventé.

## 5. Architecture technique

- Pas de framework. Des **modules cœur purs** dans `js/core/` (testables sous Node : effort, sports, cadence, maîtrise, records, repères, récap, DNA) et de l'UI en scripts classiques organisés par page.
- **Design system Ascension** (`css/ascension.css`) : tokens, typographie, composants. Les nouvelles pages n'utilisent plus `style.css`.
- Le moteur de synchronisation existant (file IndexedDB, `client_event_id`, reçus serveur) est conservé et durci.
- Build : copie publique puis **minification** JS et CSS.
- Supabase : migrations versionnées dans `supabase/migrations/`, testées en transaction annulée avant application, compatibles avec le front déployé jusqu'au déploiement final unique.

## 6. Langage visuel

Sombre, froid, cinématographique, sportif. Fonds bleu nuit presque noirs, gris acier, **cyan comme accent de marque** (actions et progression uniquement), ambre réservé aux records et aux moments rares. Typographie forte : un caractère étroit et gras pour les titres et les chiffres, Manrope pour le texte. Motif graphique propre à TITAN : **lignes de niveau et profils d'altitude** (l'ascension), plutôt que des halos et des dégradés. Peu de cartes, de vraies zones, de la respiration. Une seule chose domine chaque écran.

## 7. Avancement

- [x] Migrations rebasées sur la production (37/37, MD5)
- [ ] P0 intégrité : guildes, policies, grants, `SECURITY DEFINER`, séances de plus de 30 jours, catalogue hors ligne, mode découverte
- [ ] XP v300, recalcul des niveaux, maîtrise, cadence, collection serveur
- [ ] Design system et shell (navigation)
- [ ] QG, onboarding, login
- [ ] Séance par famille et moment de résultat
- [ ] Progrès : semaine, journal, analyses, records, objectifs, repères
- [ ] Aventure : textes, carte, gardiens, expéditions
- [ ] Profil : DNA, collection, carte publique et QR
- [ ] Communauté : amis, défis, guilde, moments
- [ ] Coaching : workspace
- [ ] Landing, SEO, cartes partageables, analytics avec consentement
- [ ] PWA, Android (TWA), accessibilité, performance
- [ ] Tests E2E, QA 4 largeurs, PR
