# Handoff — intégration web — 8 octobre 2026

La branche `codex/web-integration-cdc` réunit les quatre lots web précédemment livrés séparément. Elle part de `main e903ac317b44c9648daaa3ba124a3e607c470c31` ; aucune fusion de main, publication ou migration de production n'est effectuée. Les quatre PR historiques restent ouvertes.

| Lot | Tête intégrée | Handoff détaillé |
| --- | --- | --- |
| [#19 — navigation](https://github.com/Theo25460/TITAN_V0.5/pull/19) | `ddfeeda974c0fd8f59aca3e188c0b044f5dc3e4d` | `CDC_WEB_HANDOFF_2026-10-08.md` |
| [#20 — isolation](https://github.com/Theo25460/TITAN_V0.5/pull/20) | `edefe39cbdf1fb20da73e1135d86fac7c6a032fa` | `CDC_WEB_SECURITY_HANDOFF_2026-10-08.md` |
| [#21 — économie](https://github.com/Theo25460/TITAN_V0.5/pull/21) | `3c0dcaafb91efe0be9cf0cab6f6e07118b851d4c` | `CDC_WEB_ECONOMY_HANDOFF_2026-10-08.md` |
| [#22 — cosmétiques](https://github.com/Theo25460/TITAN_V0.5/pull/22) | `0d85eb594e43545c33928277f973f05f9be2ce48` | `CDC_WEB_COSMETIC_HANDOFF_2026-10-08.md` |

Leurs fonctions, tests et preuves RED→GREEN sont conservés. La fusion locale a un seul conflit textuel : le nom du second step CI des PR #21 et #22. Le step « Verifier le bundle historique et ses migrations correctives » reste présent une seule fois, avec sa condition et sa commande inchangées. Les ajouts Playwright se combinent sans conflit ; le runner SQL conserve le rejeu des correctifs **et** les contrôles de concurrence/transaction.

## Défaut découvert à l'intégration

Les ressources `state.js`, `shell.js` et `atelier.js` du lot #22 gardaient leurs URL `v=300.0`. Le service worker sert les ressources depuis le cache avant de les rafraîchir : une PWA installée pouvait recevoir les anciennes fonctions d'apparence et d'acquisition lors de sa première navigation, même si une visite suivante utilisait les nouvelles.

Le vrai test PWA a été étendu avec des corps de scripts valides portant un marqueur d'ancienne génération, placés dans le cache `v=300.0`. **RED** : `first navigation loads the new appearance resolver`, `true !== false`. La première tentative de fixture avait elle-même provoqué un rafraîchissement en arrière-plan ; les corps sont désormais obtenus côté runner puis injectés directement dans le cache, sans cette course.

Correction : références `v=300.2` de ces trois ressources dans les 14 pages qui les chargent. Le build existant génère le précache à partir des URL HTML ; aucun changement de politique de cache ni de logique sportive. **GREEN** : première navigation Records charge les nouveaux state/shell et première visite Atelier charge ses nouveaux contrôles ; CSS/analytics `v=300.1` restent vérifiés.

Le parcours d'achat Free à 360 et 1280 px inclut maintenant un profil avec 200 sports, recherche du dernier sport et filtre favoris. Le vrai avatar garde le cadre acheté pendant les rerendus Maîtrise. Les réponses tardives et la préférence empruntée expirée restent couvertes.

## Vérification combinée

- Baseline main : 60 tests verts.
- Local : `pnpm run verify`, **71/71** tests, syntaxe, build de 87 ressources hors ligne, audit sans erreur bloquante ; `git diff --check` et `bash -n` verts. Les avertissements SEO existants ne constituent pas un type-check.
- Chromium : **15/15** E2E, incluant tous les parcours des quatre branches, offline et mise à jour PWA ; comptes/RPC synthétiques, aucun appel d'écriture réel.
- Ascendance : les quatre têtes sont ancêtres de l'intégration. La publication GitHub doit conserver ces quatre parents, pas seulement recopier leur arbre.
- SQL combiné attendu en CI : **12 migrations** (neuf historiques + trois correctifs), **12 suites** ; deux voies, migrations individuelles et bundle historique suivi de tous les correctifs absents. Rollback appelant, refus sur base non-test et deux vraies connexions concurrentes à conserver dans chaque voie.
- CI et relecture indépendante : à enregistrer après leur exécution, avant passage en revue.

## Livraison et limites

Cette PR d'intégration remplace le besoin de fusionner séparément #19 à #22 pour obtenir cet arbre. Elle ne les ferme pas automatiquement ; ne pas appliquer une seconde fois leurs migrations ni publier depuis une autre branche sans revoir les têtes et l'historique effectifs.

Les trois correctifs restent séparés, dans l'ordre `20261008110220`, `20261008113411`, `20261008120931`. `supabase/release-300.sql` et le snapshot de structure restent inchangés. Les procédures compatibles, préflights et limites de rollback propres à chaque correctif figurent dans les handoffs respectifs et `docs/DEPLOYMENT.md`. Avant release réelle : sauvegarde/restauration démontrée, concordance de la cible, recette connectée et audit final Astra maximal de la version complète. Un rollback global vers main masquerait des pièces acquises par Free ; ne pas revenir à l'ancien helper après des acquisitions réelles.

Les 247 exigences restent en place. QA01 demeure vérifié pour cette branche ; A07/A08, QA02/QA05/QA06 et les exigences sécurité/économie partielles restent ouvertes selon leur portée. Android/Play Console appartiennent au chantier WORK ; paiement, publicité, quêtes/RPG étendus, type-check et validation complète des comptes/appareils réels ne sont pas livrés ici. Aucune promesse de conformité globale ou de déploiement.
