# Navigation Records et Maîtrise — plan d’implémentation

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Retrouver un sport en quelques secondes dans Records et Maîtrise, avec 2 ou 200 sports, sans changer les résultats sportifs.

**Architecture:** Un sélecteur pur commun filtre et pagine des groupes de sports ; une vue commune fournit les contrôles accessibles. Records conserve ses cartes et leurs détails ; le profil conserve les paliers de maîtrise et affiche tous les sports via pagination plutôt que les huit premiers.

**Tech Stack:** JavaScript navigateur sans nouvelle dépendance, node:test, Playwright.

**Spec:** Cahier maître Google Drive `1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M`, section 7, NAV01–NAV10, doctrine « Statistiques, Records et Maîtrise », DATA06 et QA07. Lecture actuelle avant chaque commit significatif.

## Contraintes

- Branche isolée `codex/web-stabilisation-cdc`, base `e903ac3` ; production et données réelles en lecture seule.
- Garder la DA Ascension, les records et leur séance source, les paliers existants et les anciens liens `?sport=`.
- Favoris communs : `state.user.favoriteSports`, enregistré par le mécanisme existant.
- Recherche sans accents, noms et alias ; filtres favoris/récents/famille ; tri alphabétique/récent et maîtrise dans le profil.
- Masquer les sports sans données par défaut ; permettre de les consulter sans fabriquer de record ni de maîtrise.
- Au plus 12 groupes de sports lourds par page ; navigation bornée et remise à la première page après changement de filtre.
- Mesurer uniquement le type de filtre et des comptes, jamais le texte recherché ni les séances dans les événements analytics.

## Review Focus

- Historique corrigé/archivé : aucun sport ne reste affiché avec un faux résultat ; la page est ramenée dans ses bornes.
- Favoris sans données et anciens sports absents du catalogue : demeurent retrouvables avec le réglage adapté.
- Frappe/clavier : le champ conserve le focus et le curseur ; les labels et boutons sont utilisables à 360 px.
- Historique actualisé pendant la consultation : les filtres choisis ne disparaissent pas.
- Requête ressemblant à du HTML : texte échappé, aucun code interprété et aucune donnée libre envoyée à l’analytics.

## Task 1: Navigation partagée et intégration

**Files:** Create `js/core/sport-navigation.js`, `js/app/sport-browser.js`, `tests/sport-navigation.test.mjs`. Modify `js/app/records.js`, `js/app/profil.js`, `js/app/analytics.js`, `records.html`, `profile.html`, `css/ascension-app.css`, `package.json`, `tests/e2e/smoke.e2e.mjs`.

**Interfaces:** `TitanSportNavigation.select(entries, options) -> {items,total,page,pages}` ; entries `{sport,label,family,hasData,last,level?,aliases?}` ; options `{query,scope,family,sort,hideEmpty,page,pageSize,favorites,now,sport}`. Le navigateur expose `create(id, options)` avec `settings`, `select(entries)`, `controls()`, `footer(result)`, `handle(event)` et `preserveFocus(render)`.

- [x] Reproduire dans Chromium l’absence de recherche et l’inaccessibilité du 9e sport de maîtrise avec 200 sports.
- [x] Écrire les tests purs : 200 sports paginés à 12, recherche accent/alias, filtre combiné, favoris sans données, récents avec date limite/futur invalide, ordre stable, page hors bornes, ancien sport et absence de mutation.
- [x] Exécuter les tests et constater leur échec avant le sélecteur.
- [x] Implémenter le sélecteur et les contrôles communs ; les favoris réutilisent la sauvegarde existante.
- [x] Intégrer les deux vues sans changer les calculs ; conserver les détails Records, les paliers et les sections du profil.
- [x] Ajouter événements `sport_navigation_searched` et `sport_navigation_filtered` limités aux métadonnées autorisées ; vérifier leur payload en test.
- [x] Exécuter `pnpm run verify` et `pnpm run test:e2e`. Expected: suite verte ; 200 sports accessibles, rendu borné, petits comptes et hors ligne toujours fonctionnels.
- [x] Faire relire le diff, corriger les erreurs importantes avec une reproduction et un test.
- [x] Relire le cahier maître, synchroniser les statuts avec preuves et commit.

## Task 2: Audit de reprise et handoff

**Files:** Create `docs/CDC_WEB_HANDOFF_2026-10-08.md`. Le cahier maître reste sur Drive ; aucune copie du backlog intégral.

**Interfaces:** Consomme les résultats de la Task 1, les métadonnées Netlify et la lecture du catalogue Supabase ; produit une cartographie des écarts, l’ordre des prochains lots et les limites de validation.

- [x] Documenter architecture et parcours existants, état vérifié des migrations/CI, surface des secrets sans afficher leurs valeurs, écarts de monétisation/RPG/anti-triche et dépendances.
- [x] Distinguer preuve locale, lecture de production et parcours connecté non testé ; aucun `[x]` sur simple présence de code.
- [ ] Préparer une PR sur GitHub, attendre la CI, synchroniser le handoff et libérer le périmètre déclaré après livraison du lot.

Le chantier global demeure ouvert : Android, régies, conformité, billing et tests sur appareils réels ne sont pas réputés terminés par ce lot web.
