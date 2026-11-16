# TITAN LIVE — intégration, déploiement et retour arrière

Branche : `claude/titan-rpg-multisport-larhou`. **Ne pas fusionner dans `main` avant la fin de la V1.3.1** et les tests
physiques ci-dessous. Tout est inerte tant que le flag serveur `screens.live` n'existe pas.

## 1. Ce que contient le chantier

| Zone | Fichiers | Effet sans le flag |
|---|---|---|
| Moteur partagé | `js/core/live-voies.js`, `live-engine.js`, `live-world.js` (+ copies identiques `mobile/src/core/web/`) | Aucun : chargé seulement par la page live et par Android. |
| Serveur | `supabase/migrations/20261116090000_live_rpg_v1.sql` | Tables privées vides ; les RPC répondent `LIVE_DISABLED`. |
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
2. **Migration** `20261116090000_live_rpg_v1` : additive, rejouable, sans `begin/commit` (l'appelant tient la
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

- [ ] **Export RGPD global** : la chaîne `private.titan_export_extras_v1` n'a pas été modifiée, car les gardes postflight
      V1.1/V1.3 figent sa forme. À la fusion : chaîner `titan_live_export_v1` dans l'export global (renommage
      `..._before_live_v1`), puis mettre à jour `tools/db/postflight-v11.sql` et `postflight-v13.sql` pour accepter ce
      maillon. En attendant, `public.titan_live_export_v1()` donne l'export complet du monde live au joueur.
- [ ] Tests physiques (section 5) sur au moins trois téléphones Android (dont un d'entrée de gamme).
- [ ] Validation graphique des emplacements d'illustration ([ASSETS.md](ASSETS.md)) par le chantier visuel.
- [ ] Lien « Séance live » dans la navigation Web (aujourd'hui accès direct `/seance-live` et depuis le QG Android).
- [ ] Expériences collectives (section 8 du game design) : à brancher sur les expéditions et binômes existants.

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
