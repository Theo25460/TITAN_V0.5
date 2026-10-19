# Images : chargement QR et reprise — 17/10/2026

Lot de trois points du cahier vivant : UX06 / QA08 / QA13, tous encore partiels.
Branche `codex/web-card-qr-recovery-cdc`, empilée sur PR #77, parent
`66381749a89a4d3b5505a30fce4b80bc8780ba90`.

## Problème et comportement obtenu

Lorsque le chargement du générateur QR local échouait, son résultat null restait en cache.
Le dessin continuait avec la case QR cochée, le libellé « Mon profil TITAN » mais aucun QR,
et autorisait cet export. Une requête bloquée pouvait aussi laisser la création en attente.

Le chargement conserve son contrat public factory/null pour le consommateur Profil :
les appels simultanés partagent une requête, tout échec libère la promesse et retire le script,
et un délai de huit secondes termine une requête bloquée. Chaque reprise utilise une URL
avec un compteur local : retirer un script ne suffit pas à empêcher Chromium de réutiliser
sa requête encore en vol. Le générateur vendored et l’URL de profil encodée sont inchangés.

Un dessin demandant un QR échoue explicitement si le générateur manque. La feuille existante
bloque alors les exports et propose de réessayer ou décocher le QR. L’utilisateur peut reprendre
sans rouvrir la feuille. Les gardes de génération et de fermeture du lot précédent restent actives.

## Validation

- Avant correction : `pnpm verify`, 188/188 tests de base, build et audit sans erreur.
- RED réel sur le parent : 5/8 nouveaux scénarios échouent ; les trois témoins passent.
  Un premier lancement sans Chromium installé est exclu de cette preuve.
- Un premier correctif passe 7/8 ; le test de requête bloquée révèle la coalescence de la
  nouvelle requête avec l’ancienne. Diagnostic : un seul appel réseau et aperçu toujours occupé.
  L’URL de reprise distincte corrige cette cause.
- GREEN : `node --test --test-concurrency=1 tests/e2e/card-qr-recovery.e2e.mjs tests/e2e/card-preview-sequence.e2e.mjs tests/e2e/card-export-recovery.e2e.mjs` : 29/29.
- Final : `pnpm verify`, 188/188 tests, build/audit sans erreur ; 16 avertissements préexistants.
- `git diff --check` réussi.
- Revue indépendante dans une copie isolée : 29/29 tests navigateur, aucun constat Critical/Important/Minor.

Les huit nouveaux cas couvrent échec réseau et vraie reprise (360 et 1280 px), choix sans QR
après erreur, HTTP 200 sans générateur, attente bloquée puis reprise, appels simultanés,
erreur ancienne après nouveau choix, fermeture pendant l’attente et absence de requête QR
sans profil public. Vrai canvas, vrai script QR local, comparaison PNG aperçu/export ;
requêtes contrôlées par Playwright, horloge accélérée pour le délai, réception du profil public
et identité en mémoire simulées. Les liens de téléchargement sont interceptés.

## Coordination et limites

Card300.3 sur Progrès/Records. `profile.html` reste card300.0 et shell300.4 dans son chantier
réservé ; coordonner card300.3 et shell300.6 avant intégration. `js/app/profil.js`, `profile.html`
et `tests/e2e/smoke.e2e.mjs` intacts. Aucun changement serveur, SQL, identité réelle ou règles
publiques. Transitions de compte, révocation, partage OS effectif, téléchargement OS effectif,
PWA installée/Android et suite E2E entière hors validation. CI distante non revendiquée.
Aucune fusion ni aucun déploiement.
