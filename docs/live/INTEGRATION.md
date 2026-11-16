# TITAN LIVE — intégration, déploiement et retour arrière

Branche : `claude/titan-rpg-multisport-larhou`. **Ne pas fusionner dans `main` avant la fin de la V1.3.1** et les tests
physiques ci-dessous. Tout est inerte tant que le flag serveur `screens.live` n'existe pas.

## 1. Ce que contient le chantier

| Zone | Fichiers | Effet sans le flag |
|---|---|---|
| Moteur partagé | `js/core/live-voies.js`, `live-engine.js`, `live-world.js` (+ copies identiques `mobile/src/core/web/`) | Aucun : chargé seulement par la page live et par Android. |
| Serveur | `supabase/migrations/20261117090000_live_rpg_v1.sql` | Tables privées vides ; les RPC répondent `LIVE_DISABLED`. |
| Web | `seance-live.html`, `js/app/live.js`, `css/live.css` ; 2 ajouts dans `js/app/seance.js` | Page « Bientôt disponible » ; `seance.js` inchangé sans brouillon live. |
| Android | `screens/live/*`, `components/LiveTrail.tsx`, `LiveSettleCard.tsx`, `data/live.ts`, `lib/liveCompanion.ts`, `lib/liveCells.ts`, `core/live.ts`, `core/liveJournal.ts` ; ajouts dans `RecordScreen`, `AdventureScreen`, `SessionResultScreen`, `RootNavigator`, `App`, `core/session.ts` ; dépendance `expo-speech` | Aucune entrée visible ; `LiveSettleCard` ne rend rien sans journal ; `details.live` absent. |
| Outils et docs | `tools/build-live-matrix.mjs`, `build-live-sql.mjs`, `simulate-live.mjs`, `docs/live/*` | — |
| Tests | `tests/live-*.test.mjs`, `tests/e2e/live-web.e2e.mjs`, `sql/tests/300_live_rpg.sql`, `mobile/__tests__/live.test.tsx` | — |

Fichiers de la V1.3.1 touchés (diffs courts, relus) : `js/app/seance.js`, `mobile/src/core/session.ts`,
`mobile/src/screens/session/RecordScreen.tsx`, `mobile/src/screens/adventure/AdventureScreen.tsx`,
`mobile/src/screens/session/SessionResultScreen.tsx`, `mobile/src/navigation/{types,RootNavigator}.ts(x)`,
`mobile/src/App.tsx`, `mobile/scripts/sync-web-core.mjs`, `mobile/src/core/web/manifest.json`, `package.json`,
`mobile/package.json` / `package-lock.json` (expo-speech). En cas de conflit avec la V1.3.1, la version V1.3.1 prime et
les ajouts live se réappliquent : ils sont additifs.

## 2. Ordre de mise en production

1. **Fusion** après la V1.3.1, par PR vers `main` (la CI `verify` + e2e + base s'exécute sur la PR).
2. **Migration** `20261117090000_live_rpg_v1` : additive, rejouable, sans `begin/commit` (l'appelant tient la
   transaction), aucune écriture sur `profiles` ou `training_logs`. Sauvegarde préalable comme pour toute migration.
3. **Web** : déploiement Netlify habituel (la page est `noindex`, hors sitemap, hors précache du service worker).
4. **Android** : build avec `expo-speech` (module natif : nouvelle version de l'application).
5. **Flag** : `titan_admin_feature_flag_set_v1('screens.live', true, 5, 'TITAN LIVE')` pour 5 % des comptes, puis 25,
   50, 100 % en surveillant : erreurs `titan_live_settle_v1`, taux `missionsIgnored`, temps de réponse, retours.

## 3. Retour arrière

- **Immédiat** : `titan_admin_feature_flag_set_v1('screens.live', false)`. Les clients masquent tout au prochain
  rafraîchissement des flags (≤ 10 min) ; les RPC refusent (`LIVE_DISABLED`). Les séances déjà envoyées gardent
  `details.live`, sans effet.
- **Complet** : supprimer les fonctions `public.titan_live_*`, `private.titan_live_*` et les tables
  `private.titan_live_*`. Aucune autre donnée n'en dépend ; XP, crédits, séances et aventure sont intacts.

## 4. Étapes restantes avant ouverture

- [x] **Export RGPD global** : `20261117170000_live_in_account_export` ajoute le monde live à « Exporter toutes mes données »
      sans renommer la chaîne d'export (même méthode que la V1.3.1) ; test `sql/tests/300_v14_live_account_export.sql`
      (rouge avant, vert après ; rien d'un autre compte ; effacement avec le compte). Non appliquée en production.
- [ ] Tests physiques (section 5) sur au moins trois téléphones Android (dont un d'entrée de gamme).
- [ ] Validation graphique des emplacements d'illustration ([ASSETS.md](ASSETS.md)) par le chantier visuel.
- [x] Entrée Web : « Vivre la séance en direct » en tête de la page Séance, visible seulement quand `screens.live` est ouvert pour le compte, ajoutée ou retirée sans redessiner la page (`js/app/seance.js`, parcours `tests/e2e/live-web.e2e.mjs`).
- [ ] Expériences collectives (section 8 du game design) : à brancher sur les expéditions et binômes existants.

## 4 bis. « L'Expédition » (16 novembre 2026)

La vue aventure n'est plus une ligne de points : c'est une ascension du camp de base vers un sommet, à travers trois lignes de crête
dont le relief dépend du sport. Chaque temps fort de la Voie allume une balise, le voyageur (le chevron TITAN) se tient sur la
dernière, un disque monte dans le ciel avec l'élan du jour, et le drapeau du sommet passe à l'ambre quand le plan ou l'objectif est
atteint. La géométrie est partagée (`js/core/live-scene.js`, copiée à l'identique dans `mobile/src/core/web/`) : la même séance
dessine la même scène sur le site et sur le téléphone. Elle ne fait que montrer ce que le moteur a décidé.

- Web : deux volets côte à côte à partir de 960 px (saisie sportive et expédition), un volet à la fois sur téléphone ; le bilan de
  fin s'ouvre sur l'expédition et trois chiffres. Captures avant/après : `docs/live/captures/`.
- Android : `components/LiveTrail.tsx` dessine la même scène avec `react-native-svg`.
- Correctif d'usage : la page ne se reconstruit plus à chaque seconde, seulement quand quelque chose change. Un appui tombant
  pendant une reconstruction pouvait être perdu.
- Tests : `tests/live-scene.test.mjs` (déterminisme, cadre, plan court, sommet), `tests/e2e/live-web.e2e.mjs` (4 parcours),
  `mobile/__tests__/liveExpedition.test.tsx`.
- Reste à faire : illustration de fond par Voie (emplacements dans `ASSETS.md`), rendu sur téléphone réel.

## 5. Tests physiques (documentés, non bloquants pour un déploiement de test)

À faire sur appareil réel, flag activé pour le compte de test uniquement. Noter appareil, version Android, résultat.

| # | Scénario | Attendu |
|---|---|---|
| P1 | Course 30 min, écran verrouillé, immersion Notifications | Une seule notification « TITAN LIVE » remplacée, jamais empilée ; carte réelle et bornes cohérentes. |
| P2 | Vélo sur route, immersion Audio | Aucune demande de toucher en roulant ; voix ≤ 1 message / 5 min ; aucune incitation à accélérer. |
| P3 | Musculation 45 min, 10 séries | Repos décompté même écran éteint ; haptique de fin de repos ; brouillon complet dans le formulaire. |
| P4 | Escalade bloc, 12 essais dont projet | Chutes = prises révélées ; projet cédé raconté ; rien à toucher pendant la grimpe. |
| P5 | Badminton en match, tableau de score | Points saisis entre les échanges ; sets reportés dans le formulaire. |
| P6 | Match de football, téléphone dans le sac | Aucune sollicitation ; périodes notées à la mi-temps (pause) ; rapport en 20 s. |
| P7 | Yoga 30 min, Silencieux | Rien pendant ; gêne avant/après ; récit final. |
| P8 | Kitesurf / ski alpin | Immersion bloquée sur Silencieux avec explication ; missions choisies avant. |
| P9 | Tuer l'application pendant une séance, rouvrir 10 min plus tard | « Séance retrouvée » ; choix « J'étais à l'arrêt » retire le trou. |
| P10 | Mode avion pendant et après la séance | Séance enregistrée localement ; règlement automatique au retour réseau (Camp ou démarrage). |
| P11 | Batterie : séance de 2 h non GPS | Consommation comparable au chronomètre existant (une minuterie à 1 s, aucun capteur). |
| P12 | Changement de compte avec une séance live en cours | La séance n'apparaît pas sur l'autre compte. |

## 6. Vérifications automatiques à relancer

```bash
pnpm run typecheck && pnpm test                       # dont live-engine, live-matrix, live-balance
pnpm run build && node --test --import ./tests/e2e/_no-consent-banner.mjs tests/e2e/live-web.e2e.mjs
pnpm run test:db                                       # dont sql/tests/300_live_rpg.sql
(cd mobile && npm run typecheck && npm test)           # dont __tests__/live.test.tsx
node tools/build-live-matrix.mjs --check && node tools/build-live-sql.mjs --check
node tools/simulate-live.mjs 52                        # équilibrage
```

Une migration livrée est immuable : si le moteur change ses sports, missions ou trouvailles après la mise en
production, `build-live-sql.mjs --check` échoue et il faut une **nouvelle** migration avec le nouveau seed.
