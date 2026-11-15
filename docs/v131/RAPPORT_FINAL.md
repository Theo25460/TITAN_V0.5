# TITAN V1.3.1 · Rapport final de l'Opération Renaissance

Branche `claude/titan-v131-finalization-9g6jjo` · PR [#148](https://github.com/Theo25460/TITAN_V0.5/pull/148) (brouillon) · base `main` `67e17c7`.
Candidat recetté : `414533b`. Rien n'a été publié : ni Netlify, ni Google Play, ni migration ou écriture sur la base de production.
Détail ligne à ligne : [`REGISTRE.md`](REGISTRE.md) et les matrices `lot*.md`.

## Verdict

**NO-GO pour une publication grand public aujourd'hui. GO pour un candidat de recette (test fermé) dès que les trois décisions P0 ci-dessous sont prises.**

Le code du candidat est vert sur toute la chaîne automatique. Ce qui empêche la publication n'est pas dans le dépôt :

| # | Blocage P0 | Qui peut le lever |
|---|---|---|
| 1 | Les 10 migrations ne sont pas appliquées en production : la faille d'amitié forcée y est encore ouverte et aucun achat Google Play ne peut ouvrir d'accès | Propriétaire : sauvegarde, répétition sur copie, application dans l'ordre du runbook ([`lot1-securite.md`](lot1-securite.md)) |
| 2 | La chaîne d'achat n'a jamais été prouvée de bout en bout : aucun achat, réel ou de licence, n'a été fait | Propriétaire : configuration Netlify `PLAY_*`, droits du compte de service, banc de recette ([`lot2-paiements.md`](lot2-paiements.md)) |
| 3 | Les clients V1.2.1 (1301) installés peuvent payer sans contrôle préalable si les produits sont actifs avant le serveur | Propriétaire : garder les produits inactifs dans la Play Console jusque-là, puis retirer 1301 |

Et quatre points P1 demandent une décision ou une validation humaine avant le grand public : validation juridique (éditeur, vendeur, rétractation, médiateur, âge minimal), illustrations manquantes, tests avec de nouveaux utilisateurs, déploiement du site avant l'activation des produits (le site en ligne affiche encore d'anciens prix et d'anciennes conditions).

## 1. Fonctionnalités réellement finalisées

| Domaine | État | Preuve |
|---|---|---|
| Achat Google Play côté application : reprise automatique d'un achat non confirmé, contrôle serveur avant paiement, prix avec période, messages exacts | Réalisé, non testé en conditions réelles | `lot2-paiements.md` |
| Imports Garmin et Santé Connect sans doublon de séance ni de récompense | Réalisé, non testé en conditions réelles | `lot2-integrations.md`, migration `20261114180000` |
| GPS natif (longues sorties, enregistrement illisible), compteur de pas, GPX | Réalisé et vérifié par tests ; non testé sur appareil | `lot2-integrations.md` |
| Couche sociale : consentement, blocages, confidentialité des défis | Réalisé et vérifié sur réplique locale | `../V131_FINALISATION_2026-11-14.md` § 3 |
| Export de compte complet et réparé ; signalements anonymes bornés | Réalisé et vérifié sur réplique locale | `lot1-securite.md`, migration `20261114170000` |
| Stabilité Web : profil, cache hors ligne, changement de compte, double clic, retour arrière | Vérifié conforme ou corrigé | `lot3-8-web-ux-performance.md` § 3 |

## 2. Écrans réellement refondus

- **Android** (22 routes modifiées sur 45) : QG, Aventure, résultat de séance, onglet Séance, Profil, et les écrans liés (confidentialité et coaching, communauté, abonnement, suppression de compte, Garmin, GPS). 16 paires avant/après : `mobile/docs/avant-apres/v131/`.
- **Web** : QG, résultat de séance, Aventure, Profil ; première connexion débarrassée d'une ancienne fenêtre. 11 paires avant/après : `docs/v131/captures-web/`.
- **Contrôlés sans changement** : 21 routes Android et les pages Web Séance (choix du sport), Progrès, Journal, Records, Carrière, Objectifs, Prévoir, Communauté, Coaching, connexion.
- Les captures viennent de l'aperçu navigateur des vrais écrans, pas d'un téléphone.

## 3. Illustrations

| Catégorie | État |
|---|---|
| Approuvées et intégrées | 4 blasons : Éclaireur, Explorateur, Sentinelle, Gardien (Web et Android) |
| Produites pendant ce chantier | Aucune qui soit enregistrée. Un candidat « Champion » a été généré, jamais vu ni contrôlé, non enregistré |
| En attente de production | Blasons Champion, Titan, Légende ; récompenses et leurs états ; balises ; paliers ; états vides ; onboarding |
| Propositions vectorielles de la PR #147 | 153, toujours « proposed », non intégrées (elles ne répondent pas à la direction photoréaliste) |
| Fiche Play | 6 captures régénérées depuis les écrans refondus |

Blocage : crédits insuffisants sur le générateur pour les modèles de qualité, hôte de téléchargement `res-prod.buzzy.now` non autorisé dans la session, bac à sable du générateur non inclus dans l'offre.

## 4. Anomalies corrigées

34 lignes d'anomalies au registre. Corrigées dans le candidat : paiements (reprise, contrôle avant paiement, délais, prix), amitié et défis (consentement, blocage, anonymisation), suppression de compte au-delà de 30 amis, export de compte, doublons d'import, GPS et pas, GPX, fenêtre héritée couvrant le QG Web (P0), mise à jour du cache hors ligne, retour arrière de la page Séance, focus clavier du profil, textes contradictoires (publicité, disponibilité, capacités Coach), pages d'aide et d'escalade.

## 5. Vulnérabilités examinées

- 209 fonctions exécutables par un joueur connecté attaquées sur une réplique locale : les 52 fonctions d'administration refusent, aucune lecture ni écriture entre comptes, aucun auto-octroi d'XP, de crédits, de niveau ou d'abonnement.
- Parcours coach : rien avant consentement, périmètre respecté, retrait effectif.
- Corrigé : amitié forcée (migration existante, non appliquée en production), fuite des noms et progressions dans les défis, duel hérité sans consentement, signalements anonymes non bornés, `search_path` modifiable.
- Laissé à décision : compartiment `avatars` public et inscriptible, compte administrateur sans double authentification, protection « mots de passe compromis » désactivée, insertions anonymes sans limite sur deux tables.
- Non vérifié : liste des schémas exposés par l'API et réglages d'authentification (non lisibles en SQL), fonctions Netlify autres que le paiement et Garmin.

## 6. Problèmes commerciaux et juridiques

- Corrigés dans le candidat : publicité (le Web n'en a pas, l'offre gratuite Android peut en afficher, jamais pour un abonné), disponibilité des offres dite au conditionnel, capacités Coach alignées sur le serveur, données réellement traitées déclarées, deux notes de chantier publiées retirées. Conditions version 8, confidentialité version 12.
- « Paddle » : absent des 11 pages en ligne contrôlées ; le résultat de recherche est un cache périmé.
- **Le site en ligne est encore l'ancien** : prix Coach affichés sans mention TTC, conditions version 6, « pas de publicité ».
- En attente de validation humaine : identité de l'éditeur et vendeur, rétractation, médiateur, âge minimal, inversion 20 / 5 / 15 sportifs suivis, outils Coach non réservés aux offres, déclaration « contient des annonces » de la fiche Play.
- Cette relecture n'est pas une certification juridique.

## 7. Référencement

- Audit par URL de la production et du candidat ; `/service` et `/suivi-escalade` réécrites ; maillage interne ; données structurées ; deux nouveaux guides ; sitemap de 25 à 27 URL ; section ajoutée à l'Observatoire.
- Aucun connecteur Search Console, Windsor ou Analytics n'était disponible : les chiffres viennent de l'Observatoire. Rien n'est mesurable avant déploiement.
- AdSense : approbation non confirmée ; aucune affirmation n'est faite.

## 8. Performance avant / après (Web, Chromium, téléphone émulé)

| Page, première visite | LCP avant | LCP après |
|---|---|---|
| Aventure | 4,9 s | 2,8 s |
| QG | 3,0 s | 3,0 s |
| Séance | 2,6 s | 2,7 s |
| Profil | 3,0 s | 3,1 s |

Seule l'Aventure progresse. Les autres pages restent fixées par environ 275 Ko de scripts. Android : aucune mesure de lancement, mémoire ou batterie n'a pu être faite ici (pas d'appareil ni d'émulateur local) ; la CI exécute un parcours sur émulateur.

## 9. Résultats de recette sur `414533b`

| Vérification | Local (15 novembre) | CI sur `414533b` |
|---|---|---|
| Typage Web, tests unitaires Web | 588 tests, 0 échec | Succès |
| Build du site, audit, garde de release | Succès (143 fichiers hors ligne) | Succès |
| Parcours navigateur, suite complète | 1 033 sur 1 034 : un parcours clavier de l'Aventure échoue par intermittence sous charge, y compris sur `main` (registre, A34) | Succès |
| Migrations, les deux chaînes, tous les tests SQL et contrats concurrents | Succès (PostgreSQL 16) | Succès (PostgreSQL 17.6) |
| Typage Android, tests unitaires Android | 808 tests, 78 suites, 0 échec | Succès |
| Bundle Android de production (facturation activée) | Généré | — |
| Parcours réel sur émulateur Android (réplique locale du serveur) | Non exécutable ici | Succès |
| APK et AAB (clé d'essai) | Non exécutable ici | Succès |
| Contrôle `render` de la bibliothèque graphique | Succès sur une copie | Succès (`3ff33c4`) |

Aucun test n'a été supprimé ni désactivé. Trois tests ont changé de formulation pour suivre un texte corrigé à l'identique d'intention, et un test du passeport accepte désormais le blason approuvé.

## 10. Tests réels non exécutés

Achat Google Play (réel ou de licence), restauration et renouvellement réels ; téléphone Android physique ; TalkBack et lecteur d'écran ; Garmin et Santé Connect réels ; e-mails de production ; retour Google OAuth réel ; tests avec 5 à 10 nouveaux utilisateurs (protocole prêt : `lot3-4-ux-android.md`) ; mesures Search Console après déploiement.

## 11. PR, commits, SHA

- PR #148 (brouillon), branche `claude/titan-v131-finalization-9g6jjo`.
- PR #147 (brouillon, illustrations) : registre et contrôle `render` mis à jour, `3ff33c4`.
- Commits par lot : voir la colonne « Commits » de [`REGISTRE.md`](REGISTRE.md).

## 12. Builds disponibles

| Build | Où | État |
|---|---|---|
| Android signé `1.3.1 (1303)`, clé d'envoi, facturation et connexion Google activées, publicités désactivées (envoi partiel assumé) | Artefact `titan-android-1303-upload` de l'[exécution n° 206](https://github.com/Theo25460/TITAN_V0.5/actions/runs/43705392551) sur `414533b` (APK et AAB, 105 Mo, conservé jusqu'au 15 décembre 2026) | Construit et contrôlé par la CI (identifiant, versions, permissions, signature). **Non envoyé à Google Play** |
| Parcours sur émulateur Android 14, schéma de production puis schéma après migrations | Artefacts `titan-android-e2e-preuves-production` et `titan-android-e2e-preuves-after-migrations` de la même exécution | Succès |
| Site | Artefact `titan-public-<sha>` du job « Tests et build public » ; aperçu Netlify de la PR #148 | Construit, **non déployé en production** |

Le build signé embarque la facturation : tant que le serveur de production n'est pas configuré et migré, l'écran d'abonnement indique que le service est indisponible et n'ouvre pas Google Play.

## 13. Migrations et déploiements encore nécessaires

1. Base : `20261104085851` (déjà présente hors registre), `20261105213712`, `20261110130137`, `20261110140000`, `20261110142656`, `20261110152700`, `20261110152800`, `20261110152900`, `20261114160000`, `20261114170000`, `20261114180000`, puis `tools/db/postflight-v13.sql` et `postflight-v131.sql`.
2. Netlify : variables `PLAY_*` et `PLAY_RTDN_*`, autorisation du SHA dans `TITAN_APPROVED_RELEASE_SHA`, déploiement du site.
3. Réglages serveur `screens.activityhub` et `screens.garmin` si les voies GPX et Garmin doivent être visibles sur le Web.
4. Google Play : build signé `1.3.1 (1303)`, fiche, déclarations, puis activation des produits en dernier.

## 14. Validations humaines en attente

Mise en production des migrations ; configuration et recette d'achat ; validation juridique ; approbation des illustrations à produire ; décisions produit (20 / 5 / 15 sportifs, outils Coach, nom « Gratuit » ou « Classique ») ; réglages de sécurité Supabase (double authentification, mots de passe compromis, compartiment `avatars`) ; tests utilisateurs ; fusion de la PR et déploiements.

## 15. Lecture du verdict

- **Réalisé et vérifié** : sécurité sociale et export sur réplique, stabilité Web, refonte des écrans (tests et captures), textes publics, CI complète.
- **Réalisé, non testé en conditions réelles** : paiements, imports Garmin et Santé Connect, GPS et pas sur appareil.
- **En attente d'approbation** : migrations, déploiements, décisions produit et juridiques.
- **Bloqué par un accès externe** : générateur d'images, Play Console, consoles Search Console, AdSense et GA4.
- **Non terminé** : illustrations manquantes, tests utilisateurs, allègement des scripts Web, générateur de `service.html`.
