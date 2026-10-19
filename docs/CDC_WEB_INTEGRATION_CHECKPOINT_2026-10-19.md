# Checkpoint d'intégration web — 19 octobre2026

A08 / QA05 / ACT09. Une seule branche réunit les lots majeurs avant nouveaux chantiers. Pas de fusion main, de déploiement ou de base réelle.

## Sources figées

- Claude : `claude/titan-cahier-charges-0k7cdn`, `5a529d6ef5fbd22882b099fed40d75bca757485f`. Contient la chaîne jusqu'àPR100, suppression de compte, intégrité économique et achat, file/dossier de modération, risque par séance, garde de publication et plan de production.
- Codex : PR101, `666a686a1e5dbacce4d5682dc8d2a500ebb2f37d`, objectifs personnels figés. Trois commits locaux repris sur Claude (`11058d2`, `6533d75`, `be63c1f`), sans conflit. Les arbres sources sont identifiés dans leurs handoffs ; pas de réécriture métier des lots livrés.
- Main : `e903ac317b44c9648daaa3ba124a3e607c470c31` au démarrage. La PR agrégée cible main pour les trois jobs existants. Les PR sources restent ouvertes.

## Défauts d'intégration démontrés et correction

Les deux tests existants de production échouent avant correction : la migration RPG `20261019062757_adventure_personal_targets_v4` manque au plan ordonné et au SELECT préalable. Ajout à la place12 sur16, renumérotation des suivantes, description de l'effet, des captures et du retour arrière vers les définitionsv3 ; conditions actives et données acquises conservées. Le SELECT reste une seule instruction sans écriture. Les anciens comptages de production sont attribués au lot Claude et ne sont pas présentés comme une nouvelle lecture.

La garde de publication refuse8fichiers binaires temporaires cachés copiés dans dist par le build. Test de comportement isolé RED : un fichier d'éditeur et son dossier caché arrivent dans l'artefact ; correction : ignorer les noms cachés uniquement dans la copie des images. Les images publiques normales et les originaux temporaires restent intacts. Garde de sécurité conservée, sans exemption ajoutée ni suppression de fichier étranger.

Chromium absent après inactivité : réinstallation d'environnement, distincte d'un échec produit. Verify et navigateur exécutés séquentiellement dans ce checkout.

## Préservation des lots

`js/admin.js`, `css/admin.css`, `admin.html`, `js/training-store.js`, `js/app/profil.js`, `profile.html` et `tests/e2e/smoke.e2e.mjs` vérifiés identiques au source Claude. Le checkpoint ne change pas prix, calculs de gains, niveau de risque, modération ou contrat Aventure ; seules les régressions de publication/plan ci-dessus sont corrigées.

## Preuves et limites

Références finales du HEAD, arbre et des trois logs CI dans la description de la PR de checkpoint et le CDC. Exiger tous les jobs verts sur la tête remise : verify, suite navigateur entière, deux voies PostgreSQL16 et contrats concurrents. Les journaux RED intermédiaires ne sont pas la preuve finale.

La revue indépendante Astra élevée porte sur l'intégration et le parcours ACT09 (vitrine, inscription, première séance/résultats, retour, statistiques/Aventure). Elle doit distinguer inspection, découverte, gateways synthétiques et vrai compte : les suites automatisées ne prouvent pas la compréhension ou l'attrait pour les personnes.

## BLOQUANT À CORRIGER MAINTENANT

Avant remise : vérifier les trois jobs sur la tête finale et traiter seulement les Critical/Important confirmés de la revue en une passe RED→GREEN. Aucun succès global présumé par les résultats séparés des deux sources.

## NON BLOQUANT – BACKLOG FINITION

Backlogs des lots sources maintenus : ancien libellé du gardien, concurrence d'ouverture de dossiers, pagination/volume de modération, avertissements éditoriaux. Profil reste réservé. Android/appareil réel, restauration réelle d'une sauvegarde, rotation des clés et décision de publication restent distincts de ce checkpoint. Aucun changement source pour faire disparaître ces limites.

## EXIGENCE OU MACRO-BLOC SUIVANT

À partir de la revue ACT09, choisir les trois principales frictions utilisateur (ACT01/ACT02/ACT04 selon preuves), dans un petit nombre de PR ciblées. Pas de nouvelle boucle de finitions isolées. ACT09 reste partiel avant la recette humaine/compte réel ; A08 reste partiel pour le type-check statique, QA05 pour Android et appareils réels.
