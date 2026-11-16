# TITAN LIVE

Chaque séance devient une expérience propre à son sport, branchée sur un monde persistant. Chantier isolé derrière le
flag `screens.live`.

- [Game design](GAME_DESIGN.md) : intentions, moteur, 20 Voies, sécurité, compagnon, monde persistant, social,
  interfaces, équilibrage, anti-triche, hors ligne.
- [Matrice des 260 sports](MATRICE_260_SPORTS.md) : générée depuis le moteur (`node tools/build-live-matrix.mjs`).
- [Intégration](INTEGRATION.md) : contenu, mise en production, retour arrière, tests physiques, étapes restantes.
- [Emplacements d'assets](ASSETS.md).

Code : `js/core/live-*.js` (partagé Web et Android), `supabase/migrations/20261116090000_live_rpg_v1.sql`,
`seance-live.html` + `js/app/live.js`, `mobile/src/screens/live/`.
