# TITAN WEB — consolidation et validation finale

Mission du 21 octobre 2026 : terminer le WEB existant avant toute reconstruction Android. Le cahier Google Drive reste la vérité fonctionnelle ; ce dossier conserve les preuves techniques sur des révisions figées.

## Version candidate

- Base publique Git : `main` `e903ac317b44c9648daaa3ba124a3e607c470c31`.
- Source Work : PR #114 `95d901530816855af5aeba8c89deff418c6f784d`, contenant toutes les autres PR ouvertes sauf #105.
- Source Claude : PR #105 `02311a5c98ebffb9fab9336b494a6c5c699dd181`.
- Branche d'intégration indépendante : `codex/final-web-rc-20261021`. Les branches des contributeurs restent intactes. Aucun suivi implicite de leurs futures têtes.
- Conflits : conserver `data.js` 300.1 de Work et `shell.js` 300.9 de Claude ; conserver toutes les suites des deux packages, le contrôle de types et PostgreSQL 17.6 ; régénérer les pages publiques depuis les générateurs fusionnés.

## Lots et portes de validation

- [x] Télécharger le cahier entier (2341 paragraphes) et répartir sa lecture exhaustive ; séparer exigence, historique et statut de publication.
- [x] Cartographier les 94 PR par ascendance réelle, en commençant par #105.
- [x] Réserver le chantier de coordination dans le cahier ; respecter les réservations Claude (public/offre/CSS), Work (Journal) et Profil/RPG.
- [x] Réunir les deux sources, exécuter typecheck, tests, build, audit, release-check et recherche de secrets sur la version réunie.
- [x] Corriger les défauts de release démontrés : transaction de la migration 24, préflight ambigu, purge destructive mal décrite, suivi d'historique et postflight distincts.
- [ ] Rejouer les deux voies PostgreSQL 17.6 et les contrats concurrents sur la candidate, avec test rouge puis vert pour la transaction.
- [ ] Rejouer tous les tests navigateur de la candidate ; produire les captures publiques et connectées 360/390/1280 et l'audit d'accessibilité, puis analyser les résultats.
- [ ] Répéter une sauvegarde réellement restaurée dans une préproduction isolée ; vérifier notamment les effets de purge, les droits TITAN+ et les contrats RPG existants.
- [ ] Effectuer les parcours avec deux comptes de test et de vraies sessions/API, vérifier emails, synchronisation entre appareils, reprise réseau et mise à jour PWA.
- [ ] Clore les problèmes critiques/importants et produire une décision GO/NO-GO traçable ; actualiser le cahier à chaque lot.

## Critères bloquants du GO

1. Tous les critères indispensables de la matrice V1 ont une preuve sur le même SHA et le même schéma candidat. Un statut `[x]` historique ou une CI d'une autre branche ne suffit pas.
2. Aucun échec de test, aucun défaut critique/important non résolu. Les limites manuelles restent explicitement ouvertes.
3. Aucune donnée d'un compte ne devient visible ou modifiable par un autre ; récompenses et droits restent autoritaires côté serveur, sans doublon à la reprise.
4. Toutes les pages et tous les parcours annoncés sont utilisables sur mobile et desktop ; aucun paiement WEB actif, Paddle reste désactivé ; les droits TITAN+ existants restent utilisables.
5. Sauvegarde datée restaurée avec succès sur une copie, migrations répétées et purge évaluée sur cette copie ; retour arrière explicite sans perdre les contrats RPG ouverts ni les récompenses en retenue.
6. Mentions et politique de confidentialité cohérentes avec le comportement réellement déployé ; décisions humaines non inventées.
7. Préproduction isolée validée avant la bascule. Les tests avec API synthétiques ne remplacent pas une recette intégrée réelle.

Le site public actuellement observé est le déploiement Netlify `6ac3e212c48091d1e9774a6d` publié le 5 octobre 2026, sans SHA associé. La base de production s'arrête à `20261005230000`. Les 29 migrations suivantes ne sont pas appliquées. Le préflight lu le 21 octobre est favorable sur les invariants existants, mais ne prouve ni sauvegarde, ni restauration, ni compatibilité complète du lot.

## Périmètre V1 confirmé au cahier le 21 octobre

La décision fondatrice exclut de la V1 WEB les publicités et toute vente ou souscription TITAN+. La page canonique `/titan-plus` indique « Bientôt disponible » ; les dons et droits manuels existants sont conservés. Toutes les autres exclusions restent des propositions tant qu’elles ne sont pas validées.

## Reportables hors chemin critique WEB

Reconstruction Android, Play Console/Billing natif et diffusion du binaire ; activation de nouvelles régies publicitaires ; extensions de catalogue non promises comme disponibles ; typage global au-delà du noyau existant. Les décisions exactes et leurs identifiants seront conservés dans la matrice, sans transformer une proposition de report en décision fondatrice.
