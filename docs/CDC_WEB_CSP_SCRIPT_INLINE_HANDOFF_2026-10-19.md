# Handoff — CSP sans `'unsafe-inline'` dans `script-src` (Claude, 19/10/2026)

## Livré
- `script-src 'self' https://cdn.paddle.com` : plus d'exécution de script ou de gestionnaire en ligne. `style-src` garde `'unsafe-inline'` (attributs `style=` partout).
- Gestionnaires en ligne remplacés : `js/ui.js` (attributs `data-act` / `data-img-fallback` + écouteurs délégués `click` et `error` en capture), `js/main.js` (panneau d'outils de développement : `data-dev` + `data-args`, noms limités à `dev[A-Z]…`), `js/admin.js` (suppression de `onsubmit="return false"`, `submit` empêché par un écouteur), `network-error.html` (le bouton « Réessayer » devient un lien `href=""`, qui recharge la page sans script, donc fonctionne hors ligne).
- Jetons de version : `ui.js?v=300.1`, `main.js?v=300.4`, `admin.js?v=300.5` (les anciens fichiers en cache contiendraient des gestionnaires désormais bloqués). `profile.html` touché pour ce seul jeton (claim Codex, changement mécanique).
- Tests : `tests/csp-inline.test.mjs` (RED avant : directive et 21 gestionnaires ; GREEN après) ; `tests/e2e/csp-browser.e2e.mjs` (+1 test : actions déléguées et repli d'avatar sous la politique réelle).

## À savoir
- Le gestionnaire de carte d'historique appelait `openSessionModal`, qui n'est défini nulle part : il était déjà sans effet, comportement conservé.
- Les gestionnaires de `ui.js` pour le menu mobile sont hérités : `js/app/shell.js` redéfinit l'en-tête mobile.
- Les 24 blocs inline des pages publiques sont du JSON-LD (non exécuté).

## BLOQUANT À CORRIGER MAINTENANT
Aucun.
## NON BLOQUANT – BACKLOG FINITION
`style-src 'unsafe-inline'` (attributs `style=`) ; retirer le code mort de `ui.js` ; vérifier en production (rapport CSP) après publication.
## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE
CMP/consentement (LEG41), CHEAT15 strict, CHEAT19, premier build Android.
