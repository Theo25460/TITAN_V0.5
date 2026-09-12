# TITAN — Refonte 102

Livraison préparée les 11 et 12 septembre 2026 depuis le dépôt `Theo25460/TITAN_V0.5`.

## Point de départ

L’audit fourni portait sur `main` au commit `a34b56d`. La production Netlify était déjà en version 101, en avance sur GitHub (déploiement `6aa3455ab615274a0861061b`). Ses corrections ont été récupérées avant la refonte afin de conserver le travail précédent. Le document d’audit a servi de référence de comparaison ; le périmètre vient de la demande du propriétaire.

## Expérience livrée

- Nouvelle identité éditoriale : accueil photographique, marque flèche TITAN, typographie Manrope, palette cyan et fonds sombres, présentation des sports et démonstration interactive explicitement fictive.
- Système visuel commun, navigation latérale sur ordinateur et navigation basse sur mobile. Suppression des anciens délais d’ouverture et du conflit entre les deux barres latérales.
- Page Aujourd’hui : activité de la semaine, objectif personnel réglable, derniers efforts, reprise du sport et planning hebdomadaire récurrent.
- Saisie : brouillon par utilisateur, chronomètre persistant, routines nommées, séries de musculation détaillées avec charge, répétitions et RIR.
- Journal : filtres et calendrier conservés ; correction, duplication, archivage et restauration. Les corrections locales survivent au rechargement. Une ancienne mesure GPX ou un résumé enregistré ne masque plus une mesure corrigée.
- Statistiques : séances, durées et distances déclarées, couverture explicite des données manquantes et graphiques annuels regroupés pour rester lisibles.
- Bilan : filtres, tableau des séances, export CSV et impression/PDF. Pour les coachs, partage volontaire par l’utilisateur d’un bilan personnel.
- Pages publiques dédiées aux offres, aux coachs, à la course, à la musculation et à l’escalade ; titres, descriptions, URL canoniques, données structurées et sitemap.
- Polices, icônes et SDK Supabase hébergés localement ; images WebP adaptées ; cache PWA versionné. Le bouton de mise à jour est placé au-dessus de la navigation mobile.

## Répartition des offres

| Fonction | Classique | TITAN+ |
|---|---|---|
| Journal multisport, saisie, correction, duplication, archives | Inclus | Inclus |
| Brouillon, chronomètre, objectif et semaine type | Inclus | Inclus |
| Exercices, séries, charge, répétitions, RIR | Inclus | Inclus |
| Routines personnelles proposées dans l’interface | 5 | 20 |
| Statistiques, CSV et bilan imprimable/PDF | Inclus | Inclus |
| Comparaison détaillée entre deux périodes, répartition par sport, charge déclarée durée × RPE | — | Calcul serveur réservé à un abonnement actif |
| Personnalisation et collections premium existantes | Selon collection | Selon droits existants |

Les récompenses sportives ne sont pas augmentées par l’abonnement. La facturation Paddle existante est conservée. La page des offres distingue clairement les fonctions disponibles des usages envisagés.

## Comparaison avec l’audit

| Points de l’audit | État repris / amélioration |
|---|---|
| B01, B05 : atomicité et idempotence | Correctifs serveur 101 conservés : reçu durable et récompense autoritaire ; le client exige un identifiant confirmé par le serveur. Ajout d’un envoi lié au jeton du propriétaire de la file, même en cas de changement de compte. |
| B02–B04 : trophées, combat, inventaire | Correctifs 101 conservés : critères de trophées au serveur, récompenses de combat déclarées par le client neutralisées, inventaire autoritaire. Pas de certification exhaustive de tous les anciens mécanismes ludiques. |
| B06–B07 : file et historique | IndexedDB par propriétaire, migration répétable, aucun plafond silencieux de 50 opérations, reprise/export des erreurs, historique paginé ; tests de panne et de persistance. |
| B08 : sauvegarde du profil | Version et liste autorisée de préférences du correctif 101 conservées ; pas de réécriture globale de tout le modèle de profil. |
| B09 : défis | RPC de création et transitions contrôlées du correctif 101 conservées ; mises financières désactivées. |
| F01, F05 : mesures | Durée d’escalade et données manquantes explicites ; le journal ne transforme plus une valeur positive en kilomètres quel que soit le sport. Charge calculée uniquement avec durée et RPE renseignés. |
| F02 : catalogue | Recherche et catalogue conservés ; communication recentrée sur un suivi multisport sans prétendre à 260 modèles spécialisés validés. |
| F03 : édition | Correction des mesures, duplication, archives/restauration et révisions serveur. Pour changer les séries d’une séance terminée : duplication, modification puis archivage éventuel de l’original ; pas d’altération indépendante du volume calculé. |
| F04, F06–F07 : interface | Synthèse centrée sur les efforts, nouveau système visuel, labels, focus, menu modal, commandes tactiles et prise en compte des animations réduites. Contrôles de navigateur, sans déclaration de conformité WCAG complète. |
| A01–A02 : maintenance et chargement | Extraction des grandes sections inline de saisie et de journal ; modules séparés pour routine, export, bilan, planning et stockage. Des modules historiques globaux subsistent. |
| A03–A05 : migrations, tests, PWA | SQL des changements 102–104 versionné, tests transactionnels, nouvelle version du cache et gestion de mise à jour sans recouvrir la navigation. Le snapshot 101 dans `sql/applied` documente une migration déjà appliquée : ne pas le rejouer. |
| A06–A07 : contenu, dépendances | Accueil statique indexable et cohérent avec les offres ; dépendances principales hébergées localement, licences incluses. La CSP garde les besoins des anciennes intégrations. |
| B10–B11, A08 : couverture restante | Pas de suppression aveugle des anciennes policies ni de certification exhaustive des 63 tables ; aucun achat réel, cycle complet d’annulation/remboursement ou test de charge de production. |

## Base de données

Migrations appliquées au projet Supabase configuré :

1. `102_training_insights.sql` — analyse des seules séances du propriétaire, périodes bornées, fuseau valide et abonnement actif ; contrôle RLS conservé.
2. `103_billing_field_guard.sql` — protection supplémentaire des champs de cycle d’abonnement `elite_*`, y compris contre les modifications d’un administrateur depuis le navigateur. La policy existante interdisait déjà les mises à jour directes du profil aux comptes ordinaires.
3. `104_training_edit_consistency.sql` — synchronisation des mesures corrigées avec les champs d’affichage hérités, suppression des résumés obsolètes, rejet des révisions manquantes/concurrentes et préservation du volume issu des séries.

Les tests SQL utilisent des utilisateurs synthétiques et terminent par `ROLLBACK`. Aucun compte de test n’est conservé.

## Vérifications réalisées

- `pnpm run verify` : **35 tests passent**, analyse syntaxique de 52 scripts, références publiques vérifiées dans 62 fichiers, build réussi.
- Audit statique du build : 45 HTML, 13 CSS et 57 JS/MJS, aucune anomalie signalée par cet outil.
- Intégration SQL : propriété des données, exclusion des archives, données manquantes, périodes/fuseaux invalides, accès anonyme/classique refusé aux analyses premium, garde de facturation, correction et conflit de révision, archivage/restauration.
- Navigateur : accueil, Aujourd’hui, saisie, journal, progrès, bilan, sports, profil, boutique, offres, coachs et guide course, contrôlés à 360, 768 et 1440 px ; aucun débordement horizontal détecté. Contrôles visuels complémentaires à 390 px et sur ordinateur.
- Parcours invité local : enregistrement, correction puis rechargement, archivage/restauration, duplication, chronomètre, objectif, planning, bilan et refus explicite des analyses premium sans connexion.
- Routine synthétique : trois séries de 40 kg × 8 répétitions avec RIR 2 ; mémorisation, rechargement et restauration vérifiés, volume total 960 kg.
- Tests du webhook Paddle conservés, dont signature, rejeu d’événement et abonnements sans rapport avec TITAN+.

Ces contrôles ne constituent pas un test sur tous les appareils physiques. Aucun score Lighthouse, gain de trafic, paiement réel ou parcours Safari/iOS natif n’est revendiqué.

## Choix produit et sources consultées

Les offres et parcours de [Hevy](https://www.hevyapp.com/features/), [TrainingPeaks](https://www.trainingpeaks.com/athlete/pricing/) et [Strava](https://www.strava.com/features) ont servi à comparer journal, routines et analyses. Le choix TITAN est de garder le journal et les exports accessibles, avec des analyses supplémentaires payantes. Il s’agit d’un choix produit, pas d’une promesse de supériorité mesurée.

Le travail SEO suit les principes du [guide Google Search](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) : contenu utile, pages accessibles, maillage et métadonnées cohérentes. L’indexation et le trafic restent à observer dans Search Console après publication.

## Visuels et dépendances

Visuel original généré avec `image_gen.imagegen`, en mode nouvelle image, sans image de référence : scène panoramique de trail au lever du soleil, coureuse sur la partie droite, montagnes, palette sombre et espace à gauche pour le titre, sans texte ni logo. Livrables web : `image/editorial/hero.webp` et `hero-small.webp`. La marque flèche est un SVG du dépôt ; `tools/render-brand.mjs` produit les icônes associées. Licences des polices Manrope, icônes Remix et SDK Supabase incluses dans `licenses/`.

## Publication

Build : `pnpm run verify`. Publication Netlify du dossier `dist`, fonctions depuis `netlify/functions` et configuration du dépôt. Le build exclut SQL, outils, fichiers internes et secrets. Les migrations 102–104 sont compatibles avec le client précédent ; revenir à un déploiement antérieur n’exige pas de supprimer des données.
