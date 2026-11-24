# Synthèse des documents Google Drive — préparation campagne marketing 30 jours (TITAN Ascent)

Lecture seule effectuée le 24/11/2026. Faits uniquement, avec la section source entre crochets. Quand un chiffre n'existe pas dans les documents, il est noté « absent ».

Sources lues :
- **[AUDIT]** « TITAN — Audit produit et feuille de route vers la V2 » (fileId 19igo-D8qjLR_QMZ1gOYJh8AgrhjelX-zcdGts7by390), environ 570 000 caractères, onglets Audit et cap, V1.5 à V1.9 (30 sous-lots), V2.0 Fusion, V2.0 Simplification, V2.1 iOS et langues.
- **[SEO]** « TITAN — Observatoire SEO quotidien | V1 → V1.1 & AdSense » (fileId 1M8qm0bjqEDUUYQOQMB5FPXCCkE-bh7IzFyQ4uzrj1DY), entrées quotidiennes du 29/10 au 24/11/2026.
- **[BUDGET]** « TITAN — Budget, abonnements & rentabilité | Suivi hebdomadaire » (Google Sheet 1KJhgZ_JGi9iQYfSG4eJ5PggTxrRIPJ-BaKCBjlnbuno), onglets Pilotage, Offres, Accès, Coûts, Budget, Historique, Méthode.

---

## 1. État du produit

### 1.1 Ce qui est livré et en ligne
- **V1.4 « TITAN ONE » livrée**, en ligne sur le Web. « La sortie Android est confirmée par Théo. » Le rapport de release couvre le socle sportif, les migrations V15 à V18, le correctif des notifications Play et la recette sur émulateur. [AUDIT › Audit et cap › Constats et décisions, état au 19/11/2026]
- Référence de départ : « TITAN ONE/Android 1.4.0 », main au commit 0dae9af (19/11/2026). Supabase : 141 migrations en production, la dernière étant 20261122090000_play_notification_inbox. [AUDIT › V2.0 Fusion › §3, état au 23/11/2026]
- **Déploiement Web de production confirmé** : Netlify 6afec02bcf8ca878e98133e6, publié le 19/11/2026 à 09:24:21 UTC, SHA 0dae9af. [SEO › §32, 24/11/2026]
- Commits du 19/11 : « paiements ouverts côté serveur » (e618026) et « correction Android Play Console » (0dae9af). [SEO › §28, 20/11/2026]
- Les piliers existent déjà : enregistrement, analyses, aventure (RPG), jeu collectif (Cordée), coaching. [AUDIT › Audit et cap]
  - RPG : embranchements enregistrés, **quatre mondes** présentés sur le site (/aventures-sportives). Écart connu : dans le contrat serveur, les seuils des jalons suivants sont les mêmes pour les deux choix d'une rencontre.
  - Journal : enregistrement hors ligne et dédoublonnage. Limites connues sur certaines données Garmin, et une recette physique reste à compléter.
  - Pilotage : comparaisons, semaine type dans le QG.
  - Coopération : la Cordée a des camps, une progression commune et un plafond sur la part d'un seul ami.
  - Coaching : proposition de séance, association au journal, message, check-in (/pour-les-coachs).
- Briques existantes : favoris, sports récents, répétitions, brouillons, files d'envoi, états serveur, règles sportives communes, écran de résultat, adaptation aux grands textes, préférences de mouvement. « L'essai découverte Web fonctionne dans le parcours inspecté. » Sur Android, la découverte dépend de la configuration. [AUDIT › V2.0 Simplification › §2 Briques existantes]

### 1.2 Ce qui est cassé ou faible pour un nouvel utilisateur (onboarding)
Ces constats viennent d'une session Web en mode découverte sur ordinateur, observée le 19/11/2026 (sans compte, sans séance enregistrée). [AUDIT › V2.0 Simplification › §2 Failles déjà localisées, et §10 Captures]
- **OBS-01 Arrivée** : sélection du sport et barre « Étape 1 sur 4 » avant toute saisie. Le bouton « Passer » ne dit pas où il mène.
- **OBS-02 Préparation** : « Préparer ma séance » saute à « Étape 4 sur 4 », puis montre une démo d'aventure et trois directions avant le formulaire. C'est un détour.
- **OBS-03 Formulaire de course** : chargé dès l'entrée. Cadence, FC moyenne et fractions apparaissent avant les détails facultatifs. Trois champs de durée coexistent avec un chrono, un import et un ressenti.
- **OBS-04 Faux brouillon (défaut reproduit)** : le simple fait d'ouvrir le formulaire, sans rien saisir, fait apparaître « Ton brouillon de course à pied » dans le QG, qui annonce des mesures à retrouver.
- **OBS-05 Accueil** : le grand bandeau et le niveau passent avant la carte d'action, dont le bouton arrive en bas de l'écran.
- **OBS-06 Journal** : rangé sous Progrès → Journal. L'utilisateur doit deviner la catégorie.
- **OBS-07 Repères verbaux** : « Progrès » mène à « Ta semaine » puis à « Ma semaine, mon chapitre ». « Communauté » mène à « Avancer ensemble ».
- **OBS-08 Aventure** : quatre mondes, neuf balises, deux chemins, chapitre, quêtes, sentiers, carnet et gardien sont exposés dès l'entrée. La densité est forte.
- **OBS-09 Compte et social** : le retour après connexion et les invitations n'ont pas été testés.
- **CODE-10 Import GPX sur Android** : « Importer un fichier GPX » ouvre le formulaire de séance, puis il faut retrouver le bouton sous les mesures.
- **CODE-11** : sur Android, analyses, coaching, analyse GPX, exports et planning détaillé renvoient vers le site Web.
- **CODE-12** : la correction de séance est désactivée hors ligne. Cela impose un test d'interruption, sans preuve de perte réelle.

### 1.3 Principaux risques produit avant d'envoyer du trafic
- **Aucune validation sur des personnes.** Les lots V1.5 à V1.8 répètent « Tests observés sur des personnes : aucun ». La V2.0 Simplification note que « la validation humaine, Android sur appareil et les parcours connectés restent ouverts ». [AUDIT › comptes rendus V1.5.x et suivants ; V2.0 Simplification › §9]
- Sont encore à mesurer : « l'adoption sur appareil, le volume réel par fonction et la fréquence des frictions ». [AUDIT › Audit et cap › Ce qu'il reste à mesurer]
- Les corrections de la V2.0 Simplification sont un **cahier des charges, pas des corrections livrées** : « sans annoncer que les corrections sont déjà livrées ». [AUDIT › V2.0 Simplification › en-tête et §9]
- Le travail V1.5 à V1.8 est **sur des branches, pas en production**. Les paquets SQL v21 à v26 ne sont pas appliqués. Aucun AAB n'a été produit et Android n'a pas tourné sur appareil pour ces lots. Les lots V1.8 sont derrière des drapeaux serveur fermés par défaut. [AUDIT › comptes rendus V1.5.0 à V1.8.5 ; V2.0 Fusion › §3]
- Il existe un **conflit de migrations** : deux migrations portent l'identifiant 20261123090000 (chaînes V1.5 et V1.6). [AUDIT › V2.0 Fusion › §5.4]
- Le document recommande de « traiter les incidents de paiement, de perte de données ou de confidentialité dès qu'ils sont établis ». [AUDIT › Ce qu'il reste à mesurer]
- **AdSense refusé** le 31/10/2026 (courriel officiel « Vous devez résoudre certains problèmes… »). Le motif exact n'a pas été relevé, la console n'ayant pas été consultée. Aucune approbation retrouvée au 24/11. [SEO › §8 ; §32]
- La sortie V1.1 n'est toujours pas confirmée par une preuve de version précise au 24/11, selon l'observatoire. [SEO › §32]

### 1.4 Feuille de route V2 : éléments et dates
- **Ordre de priorité** [AUDIT › Audit et cap › Priorités de lancement] :
  1. V2.0 UX et facilité d'utilisation (« priorité immédiate », Android puis Web).
  2. V2.1 iOS et langues, après la validation UX.
  3. Ensuite, dans l'ordre : V1.5 RPG, V1.6 Journal et imports, V1.7 Pilotage, V1.8 Coopération, V1.9 Coaching.
- **Calendrier** : « Reconfirmer la fenêtre iOS après la recette UX. » La date de lancement de la V2.1 dépend de la recette UX, du portage et de la revue Apple. **Aucune date de sortie publique n'est fixée.** [AUDIT › Règle de planification ; Périmètre élargi]
- **Incohérence interne à signaler** : l'onglet « V2.0 — Fusion générale & stabilisation », daté du 23/11/2026, impose que la V2.0 se fasse « APRÈS LA FIN COMPLÈTE DE LA V1.9 », avec le statut « PLANIFIÉ ». L'onglet Audit et cap, daté du 19/11, place au contraire la V2.0 UX en priorité immédiate, avant les V1.5 à V1.9. [AUDIT › V2.0 Fusion › §0 et §12]
- **Cibles de sortie de la V2.0 Simplification** (seuils proposés, aucun n'est atteint) [AUDIT › V2.0 Simplification › §7] :
  - première séance simple en 60 s pour au moins 4 novices sur 5 ;
  - séance répétée en 30 s ;
  - départ GPS en 3 actions ;
  - facilité perçue médiane d'au moins 8/10.
- Chantiers internes : 18 chantiers SIM-01 à SIM-18 regroupés en lots A à D, et 30 scénarios de recette REC-01 à REC-30. [AUDIT › V2.0 Simplification › §5 à §7]
- **État d'avancement des lots** [AUDIT › comptes rendus] :
  - V1.5.0 à V1.5.5 codés sur branches les 19 et 23/11 ;
  - V1.6.1 à V1.6.6 codés sur branches le 23/11 ;
  - V1.7.1 à V1.7.5 codés le 23/11, V1.7.6 le 24/11 ;
  - V1.8.1 à V1.8.5 codés le 24/11, derrière des drapeaux fermés ;
  - V1.8.6 et V1.9.1 à V1.9.6 : conception seulement, sans compte rendu de réalisation.
- **Contenu prévu de la V2.1** : iPhone (connexion, première séance, journal, synchronisation, RPG, suppression de compte) et langues FR, EN, DE. Sont reportés après le lancement iOS : HealthKit, GPS en arrière-plan, publicités, nouvelles offres Coach, extensions sociales. Le lancement iOS vise un parcours gratuit. [AUDIT › V2.1]

---

## 2. Chiffres disponibles, avec leur date et leur source

### 2.1 Utilisateurs, installations, revenus
| Indicateur | Valeur | Date | Source |
|---|---|---|---|
| Comptes enregistrés (profils en base, **pas des utilisateurs actifs**) | 25 → 25 → 24 → 23 | relevés des 05/11, 09/11, 16/11, 23/11/2026 | [BUDGET › Historique ; Pilotage] |
| Clients payants (TITAN+, Coach, Coach Ultra) | 0 | 23/11/2026 | [BUDGET › Pilotage ; Offres] |
| Accès premium gratuits | 2 (1 compte fondateur/admin, 1 compte de revue Google Play) | 05/11 → 23/11 | [BUDGET › Accès] |
| Chiffre d'affaires brut mensuel | 0 € | 23/11/2026 | [BUDGET › Pilotage] |
| Événements de facturation de mai 2026 | 3, tous en test_mode=true, exclus | — | [BUDGET › Pilotage ; Méthode] |
| Installations Play Store | **absent** | — | — |
| Utilisateurs actifs (DAU/MAU) | **absent** | — | — |
| Chiffres Play Console (installations, notes, rétention) | **absent** (« Google Play financier non vérifiable ») | — | [BUDGET › Historique 23/11] |
| Trafic Google Analytics / GA4 | **absent** (GA4 n'est cité que comme consentement à tester) | — | [AUDIT › V2.0 Fusion › §8] |
| Sources de trafic (hors Search Console) | **absent** | — | — |

### 2.2 Search Console (propriété https://titan-app.fr/, via Windsor.ai)
**Historique mensuel** [SEO › §3, extraction du 29/10] :

| Période | Impressions | Clics | CTR | Position moyenne |
|---|---|---|---|---|
| Juillet 2026 | 27 | 2 | — | 8,11 |
| Août 2026 | 63 | 1 | — | 36,89 |
| Septembre 2026 | 200 | 10 | 5,0 % | 9,27 |
| Octobre 2026 (01 au 27) | 227 | 23 | 10,1 % | 6,96 |

**Autres agrégats** :
- Capture globale initiale, sur une fenêtre plus large non précisée : 61 clics, 614 impressions, CTR 9,9 %, position 10,8. [SEO › §3]
- Trois mois du 09/08 au 08/11 : 39 clics et 612 impressions. [SEO › Référence V1.3.1 du 10/11]

**Fenêtres de 28 jours** :

| Période | Impressions | Clics | CTR | Position | Source |
|---|---|---|---|---|---|
| 12/10 au 08/11 | 268 | 22 | 8,21 % | — | [SEO › §18] |
| 21/10 au 17/11 | 302 | 15 | 4,97 % | 6,45 | [SEO › §27] |
| 25/10 au 21/11 | 328 | 15 | 4,57 % | 6,79 | [SEO › §31] |
| 26/10 au 22/11 (le plus récent) | 326 | 15 | 4,60 % | 6,82 | [SEO › §32, collecte du 24/11] |

L'audit cite la fenêtre du 21/10 au 17/11 sous la forme « 302 impressions et 15 clics Google sur les 28 jours terminés le 17 novembre, avant TITAN ONE ». [AUDIT › Ce qu'il reste à mesurer]

**Fenêtres de 7 jours, les plus récentes** [SEO › §32] :

| Période | Impressions | Clics | CTR | Position |
|---|---|---|---|---|
| 09/11 au 15/11 | 88 | 1 | 1,14 % | 7,77 |
| 16/11 au 22/11 | 85 | 7 | 8,24 % | 7,16 |

**Derniers jours connus** [SEO › §29 ; §31 ; §32] :
- 19/11 : 12 impressions, 4 clics, tous sur « titan app » ;
- 20/11 : 8 impressions, 0 clic ;
- 21/11 : 19 impressions, 0 clic ;
- 22/11 (provisoire) : 10 impressions, 0 clic, position 6,4 ;
- 23/11 : non disponible.

**Appareils et pays**, une seule mesure, du 21 au 27/10 [SEO › §7] :
- mobile 29 impressions et 3 clics, ordinateur 25 et 2, tablette 2 et 1 ;
- France 45 impressions et les 6 clics.

### 2.3 Indexation et sitemap
- **GSC en direct, rapport du 06/11** (relevé le 10/11) : 20 pages indexées et 28 exclues, dont 21 en noindex, 3 redirections et 4 explorées non indexées. /suivi-escalade est indexée. Le rapport Sitemap affiche 9 pages découvertes, avec une dernière lecture Google le 24/05/2026. [SEO › Référence V1.3.1 du 10/11]
- **Sitemap servi** : 25 URL (audits HTTP des 14/11 et 18/11). La branche candidate en contient 27, avec deux nouvelles pages, /suivi-velo et /defis-sportifs, qui répondaient 404 en production le 18/11. [SEO › audit du 14/11 ; Opération SEO du 18/11]
- **Windsor** : 18 URL soumises, 0 erreur (le chiffre a alterné entre 18 et 36 selon les relevés, ce que l'observatoire juge non fiable). Le champ « indexed » est déprécié. [SEO › §8 à §32]
- Le contrôle de production du 18/11 donnait 29 contrôles SEO conformes sur 38. [SEO › Opération SEO V1.3.1 du 18/11]

### 2.4 Pages principales
Fenêtre la plus récente, du 16/11 au 22/11, comparée à la semaine du 09/11 au 15/11 [SEO › §32] :

| Page | Impressions / clics (16–22/11) | Semaine précédente |
|---|---|---|
| Accueil | 60 / 7 | 40 / 1 |
| /service | 18 / 0 | 37 / 0 |
| /aventures-sportives | 3 / 0 | — |
| /niveaux-et-xp | 3 / 0 | — |
| /debuter-titan | 1 / 0 | — |

- /suivi-sportif, /fonctionnalites et /tarifs n'ont pas de ligne récente.
- Sur 28 jours (relevé du 20/11) : /debuter-titan 17/0, /suivi-sportif 5/0, /carnet-musculation 3/0, /journal-entrainement 3/0. [SEO › §28]
- **/suivi-escalade** : 61 impressions du 25 au 30/09, 11 du 01 au 03/10, puis aucune ligne. Sa position était d'environ 5 à 7 quand elle apparaissait, sans aucun clic. La cause n'est pas établie, et la chute précède la V1 du 21/10. [SEO › §7 ; §32]
- Sur la période du 01/09 au 27/10 : accueil 291 impressions et 32 clics (CTR 11,0 %, position 8,65) ; /suivi-escalade 72/0 ; /debuter-titan 25/0 ; /service 24/0 ; /carnet-musculation 11/0. [SEO › §3]

### 2.5 Requêtes principales
- Du 01/09 au 27/10 [SEO › §3] :
  - « titan app » : 30 impressions, 17 clics, position 2,6 ;
  - « titan application » : 46 impressions, 2 clics ;
  - « application titan » : 40 impressions, 0 clic ;
  - « escalade bloc cotation » : 45 impressions, 0 clic, position 5 ;
  - « cotation escalade bloc » : 16/0 ;
  - « cotation bloc escalade » : 10/0.
- Du 16/11 au 22/11 [SEO › §32] :
  - « titan app » : 12 impressions, 5 clics ;
  - « titan application » : 12/1 ;
  - « application titan » : 8/0.
  - 95,35 % des impressions de requêtes visibles contiennent « titan ». 42 impressions sur 85 ne peuvent pas être classées (requêtes masquées).
- Requêtes hors marque visibles, sans pertinence sportive ni clic : « application sport digitalisation » (position 69), « sos dépannage voiture », « application sport multi ecrans simultanes » (position 83). [SEO › §29 ; §32]
- **Conclusion répétée de l'observatoire** : « acquisition hors marque sportive non démontrée ». Des homonymes « Titan » polluent les requêtes (« titan summit app », « titanlink connexion », « sav marque titan »). [SEO › §25 à §32]

### 2.6 Tendance
Les volumes restent très faibles, d'environ 80 à 90 impressions par semaine. Les impressions sont stables et les clics très volatils (de 1 à 8 par semaine), portés par la marque. La position moyenne se dégrade (de 5,6 à environ 7 à 8). [SEO › §27 à §32]

### 2.7 Recommandations SEO non encore réalisées (backlog au 24/11)
[SEO › §32, avec reprise des §25 à §31]
- **P0** : prendre le 19/11 comme repère de production. Vérifier les titles, canoniques et sitemap réellement servis, puis mesurer les 14 à 28 jours suivants.
- **P1** : inspecter /suivi-escalade et « escalade bloc cotation » dans GSC (canonique, couverture, liens, comparaison septembre/octobre).
- **P2** : renforcer le maillage et l'intention des pages sportives (/carnet-musculation, /journal-entrainement, /suivi-sportif, /debuter-titan). Analyser /service, qui a des impressions sans clic et souffre d'homonymes.
- Faire relire le sitemap par Google (aucune soumission depuis le 19/05) et inspecter les URL orphelines ou explorées non indexées. [SEO › §25, §26]
- Consulter AdSense › Sites pour connaître le motif du refus, puis demander un nouvel examen. [SEO › §8 P0]
- **Corrections candidates dont la mise en ligne n'est pas prouvée** (PR #148 fusionnée via #149 le 17/11 ; PR #162 ouverte le 18/11, non fusionnée) [SEO › audit du 14/11 ; Opération SEO du 18/11] :
  - title de l'accueil « TITAN — Application de suivi sportif multisport et gratuite » ;
  - title de /service ;
  - réécriture de /suivi-escalade (« Cotations de bloc en escalade : Fontainebleau et V-scale ») ;
  - six guides enrichis (de 190 mots à 340–410 mots) ;
  - nouvelles pages /suivi-velo et /defis-sportifs ;
  - 14 fils d'Ariane ;
  - JSON-LD WebApplication.
- Pages orphelines en production au 14/11 : /progression-sportive, /motivation-sport, /partenariats. Quatre guides font moins de 200 mots. [SEO › audit du 14/11]
- Mesure de performance (candidat V1.3.1) : Lighthouse mobile sur l'accueil, LCP de 2,409 s à 2,258 s, poids −11 %, CLS 0. [SEO › Référence V1.3.1]

---

## 3. Marketing, comptes, plateformes, prix

- **Actions marketing déjà réalisées** : aucune campagne, aucun outreach et aucun achat publicitaire documentés. L'observatoire prévoit d'« inscrire les campagnes/outreach » mais n'en consigne aucune. Les lignes « Acquisition / publicités » et « Création / contenus » sont vides (« À confirmer »). [SEO › §2 ; BUDGET › Coûts]
- **Comptes de réseaux sociaux** : **absent**. Aucun compte Instagram, TikTok, YouTube, Discord, Reddit ou autre n'est mentionné. « Social » désigne uniquement les fonctions sociales internes à l'app (Amis, Moments, Cordées, clubs).
- **iOS** : non disponible. La V2.1 est planifiée après la validation UX de la V2.0, sans date. Il faut d'abord vérifier l'adhésion Apple Developer, l'accès App Store Connect et un iPhone de test, puis passer par TestFlight. [AUDIT › V2.1 › Jalons]
- **Play Store** : la sortie Android est « confirmée par Théo ». Un compte de revue Google Play dispose d'un accès TITAN+ offert. Un correctif Android lié à la Play Console a été commité le 19/11. **La piste exacte (production, test fermé ou test interne) est absente des documents.** L'envoi à Google Play est manuel (commit a4dc113 du 17/11). [AUDIT › Constats ; BUDGET › Accès ; SEO › §26, §28]
- **Tarifs** (catalogue Google Play) [BUDGET › Offres] :

  | Offre | ID Play | Prix |
  |---|---|---|
  | TITAN+ | titan01 | 4,99 €/mois |
  | Coach | titan02 | 19,99 €/mois |
  | Coach Ultra | titan03 | 39,99 €/mois |

  La page /titan-plus affiche « Bientôt disponible » (décision du 21/10, à basculer quand l'achat ouvrira). [SEO › audit du 14/11] Côté serveur, les paiements sont ouverts depuis le commit du 19/11. [SEO › §28] Les documents imposent de ne modifier ni les prix ni les offres sans accord. [AUDIT › V2.0 Fusion › §5.3 et §9]
- **Budget et coûts** [BUDGET › Budget ; Coûts] :
  - plafond proposé de 75 €/mois, non engagé : 50 € pour l'infrastructure, **25 €/mois pour l'acquisition et le marketing** (« Petits tests d'acquisition mesurables · Attendre que l'application soit stable »), 0 € pour l'IA ;
  - coûts confirmés : 0 € ;
  - à confirmer : Netlify Personal 7,85 €/mois (sans facture), domaine titan-app.fr 10 €/an, inscription Google Play Console 25 € (coût unique) ;
  - Supabase est sur le plan gratuit.

---

## 4. Direction de marque et de design, utile pour les visuels

- « La DA TITAN reste identifiable. » Il faut harmoniser composants, espacements, titres, icônes et unités. La simplification ne demande aucune nouvelle bibliothèque d'illustrations. [AUDIT › V2.0 Simplification › SIM-17]
- **Registre graphique** : tout nouvel asset final doit être validé dans le « Registre TITAN » (Google Sheet 1CugS-FafZMWm-m19F0pZq5q6Fn6KcSLs71J901HNmio, non lu ici). Il faut réutiliser les visuels approuvés, dont l'illustration approuvée du gardien de chaque monde, et réserver les nouvelles illustrations aux scènes qui le justifient. Les candidates graphiques en attente de validation ne doivent pas être réintroduites sans accord. [AUDIT › V1.5 Règles de conception ; V1.5.3 ; V2.0 Fusion › §4]
- **Noms et univers de marque** : TITAN ONE (V1.4), QG (accueil dans l'univers), LIVE (« Séance en direct »), Atelier (« Personnalisation »), Cordée, TITAN Duo, Veilleur et Gardienne (gardiens). [AUDIT › SIM-02 ; SEO › audit du 14/11]
  - Les quatre mondes : Vallée de l'Aube, Îles des Marées, Forge(s), Hauts des Aurores.
  - Le nom « TITAN Ascent » n'apparaît pas tel quel. On trouve « TITAN 300 — Ascension » (commits du 05/10) et le fichier css/ascension-app.css. [SEO › §4 ; AUDIT]
  - Le document recommande d'expliquer les noms de marque à la première rencontre (« Atelier — Personnalisation », « LIVE — Séance en direct ») et d'utiliser « Accueil » comme repère fonctionnel. [AUDIT › SIM-02]
- **Positionnement formulé dans les documents** :
  - « Une application évidente à utiliser, avec toute la profondeur de TITAN » [AUDIT › V2.0 Simplification] ;
  - promesse RPG : « Deux sportifs qui ont exactement le même nombre de jours actifs peuvent vivre deux aventures différentes » [AUDIT › V1.5] ;
  - règles du RPG : effort équivalent quel que soit le sport, pas de malus en cas de pause [AUDIT › V1.5 Règles] ;
  - défis « sans mise » [SEO › audit du 14/11] ;
  - title candidat « application de suivi sportif multisport et gratuite » [SEO › 18/11].
- **Concurrents cités comme références UX** (guides officiels, sans comparaison chiffrée) : Strava, Hevy, Runna, Apple Forme. [AUDIT › V2.0 Simplification › §3]
- **Sports et disciplines cités** : course, vélo, gravel, VTT, natation, musculation, escalade (bloc et voie), badminton. Connecteurs : Garmin, Santé Connect, GPX. [AUDIT › SIM-06, REC-05 ; SEO › audit du 14/11]
- **Accessibilité** à respecter dans les créations : contraste de 4,5:1 pour le texte et 3:1 pour les grands éléments, mouvement réduit. [AUDIT › SIM-17]

---

## 5. Données absentes, à collecter avant ou pendant la campagne
- Installations Play, utilisateurs actifs, rétention, notes et avis du Play Store.
- Piste Play Store (production ou test).
- Trafic GA4 et sources de trafic.
- Comptes de réseaux sociaux.
- Historique d'actions marketing.
- Motif du refus AdSense.
- Date de sortie de la V2.0 et de la V2.1.
- Contenu du Registre graphique TITAN (non lu).
