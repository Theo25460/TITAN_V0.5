# V1.8.1 — Relais de cordée

Une étape jouable sur une route existante de la Grande Cordée : **« Le relais de la Sentinelle »**, sur la route pilote
**« Les crêtes de l’Aube »**, derrière le drapeau serveur `screens.cordee_relay` (absent = fermé, déploiement par compte).

## Règle

| Action | Qui | Condition vérifiée par le serveur (`public.titan_cordee_relay_v1`) |
|---|---|---|
| **Transmettre** (ouvrir le passage) | un membre **encordé** (`joined`) | une séance **confirmée** de ce membre dans la cordée (`private.titan_confirmed_sessions` : ni retenue, ni annulée, ni suspecte, ni archivée, ni historique, tamponnée par le serveur), sur une journée qui apporte au moins une longueur (12 min d’effort compté) ; cordée en cours ; une seule ouverture par cordée |
| **Confirmer** (recevoir le relais) | un **autre** membre encordé | même définition de séance confirmée, **un autre jour** (Paris) que la séance d’ouverture et **enregistrée après** l’ouverture ; pas de blocage entre les deux membres ; cordée en cours ; une seule confirmation |

- Le membre qui a ouvert ne peut jamais confirmer (`RELAY_OWN`). Un second membre ne peut pas rouvrir (`RELAY_ALREADY_OPEN`).
- Répéter sa propre action ne change rien et répond `changed: false` (« Déjà fait »).
- Deux transmissions simultanées : verrou de ligne sur la cordée, une seule réussit (`tools/db/test-cordee-relay-concurrency.sh`).
- Le relais n’ajoute **aucune longueur**, ni XP, ni crédit, ni titre : part, plafond 1,5 ×, deux contributeurs et sommet inchangés.
- Réutilisé tel quel : invitations et liens (`/defi?t=…`), appartenance, blocages, plafonds de la Cordée (3 créées par jour, 3 en cours, 10 membres).

## Ce que chacun voit (`titan_cordees_v1 → cordees[i].relay`)

`status` (`waiting`, `opened`, `confirmed`), `can` (`transmit`, `confirm` ou rien), `hint` (`transmit`, `session`, `own`, `confirm`,
`other_day`, `join`, `done`, `closed`), `opener` et `receiver` : `{ name, me, family }` sous la règle de nommage de la Cordée (soi, amis,
partenaires de lien, jamais à travers un blocage), sinon « Membre de la cordée » sans famille. Jamais la séance, son sport, sa date,
sa durée ou sa distance. Les phrases viennent du module partagé `js/core/cordee.js` (`relay`, `relayResult`, `relayMessage`),
copié tel quel dans l’application Android.

## Entrée par lien

- Web : `/defi?t=…` (page existante) présente la cordée sans nom, puis « S’encorder » après connexion.
- Android : `https://titan-app.fr/defi?t=…` est revendiqué par l’application (filtre d’intention `pathPrefix /defi`) et ouvre
  Communauté › Défis avec une carte d’invitation native (aperçu, puis « S’encorder » sur un geste explicite). Sans App Link vérifié
  (`assetlinks.json`), Android ouvre le site, qui fonctionne de la même façon.

## Mesure

`private.titan_cordee_relay_measure(since)` (rôle de service) : cordées de la route pilote, parties à deux membres, passages ouverts,
relais confirmés par un autre membre.

## Fichiers

`supabase/migrations/20261130104100_cordee_relay.sql`, `supabase/release-v21/`, `sql/tests/300_cordee_relay.sql`,
`tools/db/test-cordee-relay-concurrency.sh`, `js/core/cordee.js`, `js/app/cordee.js`, `css/one-communaute.css`,
`tests/cordee.test.mjs`, `tests/e2e/cordee-relay.e2e.mjs`, `docs/v181/*.png` ; Android : `mobile/src/core/web/cordee.js`,
`mobile/src/screens/community/CordeePanel.tsx`, `mobile/src/screens/community/ChallengeLinkCard.tsx`, `mobile/src/navigation/linking.ts`,
`mobile/src/lib/invite.ts`, `mobile/app.config.ts`, `mobile/__tests__/cordeeRelay.test.tsx`.
