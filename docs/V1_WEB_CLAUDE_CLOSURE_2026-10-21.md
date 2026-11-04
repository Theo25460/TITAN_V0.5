# V1 web — fermeture des exigences par Claude Code (21/10/2026)

Branche `claude/titan-cahier-charges-0k7cdn` (PR #105, gelée dans la candidate #115). Aucune fusion, aucun déploiement, aucune migration de production, aucune donnée réelle modifiée (une lecture seule : 5 lignes de `shop_history`).
Périmètre fixé par le fondateur : V1 web sans publicité ni abonnement TITAN+ commercialisé ; Android hors périmètre.

## Ce qui est livré et prouvé

| Lot | Contenu | Exigences | Preuves |
|---|---|---|---|
| 1 | Page canonique `/titan-plus` « Bientôt disponible », 301 depuis `/tarifs`, `/tarifs.html`, `/titan-plus.html`, aucun prix ni achat, liens et libellés alignés | décision fondateur, ACT01 (clarté de l'offre) | `tests/launch-decision.test.mjs` ; CI verte sur `0c45b5c` |
| 2 | Obstacles (8 par monde) et phases de gardien dans les quatre mondes ; journal de quêtes global ; « Prochaines récompenses » dans l'Atelier ; réglage « Animations réduites » | RPG03, RPG14, RPG15, SHOP19, IDEA07, IDEA08 | `tests/campaign-encounters.test.mjs`, e2e `rpg-guardian-phases`, `smoke` (Atelier), `motion-setting` |
| 3 | Récapitulatif de la séance découverte : action « Créer un compte et garder ma séance » ; le journal reste complet sans jamais ouvrir l'aventure | ACT04, RPG19 | e2e `discovery-recap` (2 tests) |
| 4 | Aucune publicité (config, `ads.txt`, code) ; biens virtuels sans valeur monétaire | LEG12, LEG07 | `tests/launch-decision.test.mjs` |
| 5 | Titre porté (insigne ou titre d'expédition gagné), affiché dans Profil et sur la carte publique ; limites de débit carte publique/apparence ; montants de boutique non négatifs ; Assistance dans Profil | SHOP05, SHOP06, CHEAT17, SEC05, UX12 (partiel) | `sql/tests/300_displayed_title.sql`, `sql/tests/300_abuse_surface_limits.sql`, `tests/titles.test.mjs`, e2e `profile-title`, `athlete-title` |

Fermées par audit du code existant (preuves déjà en place) : RPG08, RPG09, RPG20, SHOP02, SHOP04, CHEAT20 (onze profils légitimes dans `sql/tests/300_false_positives.sql`).

## Migrations ajoutées (29 au total)

- 28 `20261021010000_displayed_title` — trois fonctions publiques, aucune table, colonne ni droit nouveau.
- 29 `20261021020000_abuse_limits_profile_surface` — deux déclencheurs de limite de débit et une contrainte de montants validée.
Plan de production et préflight mis à jour (lignes 28 et 29). Les deux voies du banc SQL (`tools/db/test-migrations.sh`, avec et sans `RELEASE_SQL`) passent.

## Reports proposés (à valider, non marqués terminés)

- SHOP10 (missions achetables, « éventuellement »), SHOP12 (raretés, « si cela améliore »), RPG16 (événements extensibles), RPG21 (pas : aucune source de données en V1 web), IDEA01–06 et IDEA09.
- CHEAT16 : le motif créer-effacer-recréer n'est pas détecté en tant que tel ; borné par les limites de création/modification et les plafonds d'XP (aucun gain possible).
- Hors périmètre V1 : ADS01–ADS18, LEG02/05/39/43 (publicité), LEG06/19–25 (offre payante), LEG14/36/37 (sources de santé), Android.

## À faire au moment de la publication

1. Appliquer les 29 migrations dans l'ordre sur la copie restaurée, puis en production, **avant** de publier le site (plan de production).
2. Retirer les ~66 mentions « après mise à jour serveur » des pages publiques et de l'application une fois la production migrée : elles deviennent fausses et sont du jargon pour le grand public.
3. Activer le formulaire d'assistance intégré : définir `TITAN_SUPPORT_ENABLED` et les clés e-mail côté Netlify, puis passer `data-support-enabled` à `true` dans `service.html` et `social.html` (le repli par e-mail reste actif d'ici là).
4. Migration 29 : `ADD CONSTRAINT` verrouille brièvement `shop_history` et `CREATE TRIGGER` verrouille brièvement `profiles` en écriture ; `lock_timeout` de 5 s, donc en cas de trafic elle échoue entièrement (rien n'est appliqué) et se rejoue sans risque (idempotente). L'appliquer à un moment calme.
5. Relecture juridique humaine (LEG13), recette sur appareils réels et suite navigateur complète en CI sur la tête finale : aucune ne peut être remplacée par un test synthétique.
