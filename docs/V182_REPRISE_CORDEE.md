# V1.8.2 — Reprise et relais facultatifs

Le groupe continue quand un membre est indisponible ou quitte la Cordée. Tout reste sur la Grande Cordée et sur « Le relais de la
Sentinelle » (V1.8.1, `docs/V181_RELAIS_CORDEE.md`) : aucun nouveau groupe, aucun nouveau compte de longueurs. Migration
`supabase/migrations/20261125090000_cordee_reprise.sql` (paquet `supabase/release-v22`, **non appliqué**), drapeau serveur
`screens.cordee_reprise` (absent = fermé, déploiement par compte) pour la prise en charge et la passation.

## Règles

| Situation | Ce que fait le serveur | Refus explicites |
|---|---|---|
| **Prendre le relais** (facultatif) | Une fois le passage ouvert, un membre qui peut le recevoir (encordé, pas celui qui a ouvert, compte non suspendu, aucun blocage avec celui qui a ouvert) le réserve **72 h au plus** (jamais au-delà de la fin de la cordée). Tant qu’il est réservé, seul ce membre le reçoit. Sans prise en charge, tout membre éligible peut le recevoir, comme en V1.8.1 | `RELAY_HELD`, `RELAY_OWN`, `RELAY_UNAVAILABLE` |
| **Passer la main** (volontaire) | Le membre qui tient le relais le propose à **un membre qu’il voit et qui peut le prendre**, ou à **toute la cordée** (le premier qui accepte). L’offre dure **48 h au plus** ; le relais reste réservé pendant ce temps ; elle peut être retirée (même drapeau fermé) | `RELAY_NOT_HOLDER`, `RELAY_HANDOVER_TARGET` (sans dire pourquoi), `RELAY_HANDOVER_PENDING`, `RELAY_GROUP_TOO_SMALL` |
| **Reprendre le relais** (accepter) | Verrou de ligne sur la cordée : **deux acceptations simultanées donnent un seul porteur**, la seconde attend le verrou puis reçoit `RELAY_HANDOVER_TAKEN`. Accepter réserve le relais 72 h ; il reste à le recevoir avec **sa propre séance confirmée**, un autre jour que l’ouverture et enregistrée après elle | `RELAY_HANDOVER_TAKEN`, `RELAY_NO_HANDOVER`, `RELAY_HANDOVER_SELF` |
| **Passation jamais acceptée** | L’offre expire ; la réservation de son auteur s’arrête avec elle ; le passage reste ouvert et redevient libre pour tout membre éligible. L’ouverture, les longueurs et l’historique sont conservés | — |
| **Départ** (quitter, ou être sorti par un blocage) | La réservation et les offres de ce membre ou pour lui tombent aussitôt. Les longueurs apportées **avant** le départ (séances confirmées enregistrées avant) restent acquises, plafonnées à 1,5 × la part, avec leurs familles de sport ; **sa part de l’objectif se referme à ce qu’il a apporté** (jamais plus d’une part) ; il compte parmi les « deux contributeurs » s’il a apporté une longueur. Un membre parti sans rien apporter sort de l’objectif comme avant (comme une invitation restée sans réponse). Le membre parti ne voit plus la cordée, n’est plus nommé, ne reçoit pas le titre de route | — |
| **Blocage** entre deux membres | Une offre entre eux tombe, chacun devient « Membre de la cordée » pour l’autre ; un blocage avec celui qui a ouvert empêche de prendre ou de recevoir le relais | `RELAY_UNAVAILABLE` |
| **Compte suspendu** | Ne peut ni prendre, ni passer, ni accepter, ni recevoir ; sa réservation tombe | `ACCOUNT_SUSPENDED` |
| **Groupe devenu trop petit** | Celui qui a ouvert, seul encordé, lit « Il faut un autre membre encordé… invite un ami par lien : le passage reste ouvert ». La règle du sommet ne change pas : deux contributeurs dès que deux personnes ont pris part (membres partis avec une longueur compris) | `RELAY_GROUP_TOO_SMALL` |
| **Limites** | Une réservation et une offre en attente par cordée ; 8 prises et passations au plus par cordée ; plafond 1,5 ×, 10 membres, 3 cordées créées par jour inchangés | `RELAY_TURN_LIMIT` |

**Aucune avance gratuite** : une prise en charge, une passation, un départ ou un blocage n’ajoutent ni longueur, ni XP, ni crédit, ni
titre, et ne valident jamais le relais. **Aucune raison** n’est demandée ni stockée (aucune colonne) pour une pause ou un départ ; les
vues partagées montrent l’état du jeu : qui tient le relais (règle de nommage de la Cordée) et qu’une passation est en cours. Le
destinataire d’une passation n’est visible que de son auteur et de lui-même. Aucune notification automatique : les seules relances
sont les actions que le serveur propose dans `relay.turn`.

## Ce que chacun voit (`titan_cordees_v1 → cordees[i]`)

- `kept` : longueurs acquises grâce à des membres partis (un nombre, jamais qui ni pourquoi) ; `needs`, `target`, `contributors` en tiennent compte.
- `relay.holder` (`{ name, me, family: null }` ou `null`), `relay.holdUntil`, `relay.handover` (`{ pending, mine, forMe, open, to, expiresAt }`,
  `open` et `to` seulement pour l’auteur et le destinataire), `relay.turn` (`take`, `handover`, `withdraw` ou `accept`), `relay.choices`
  (membres que le porteur peut désigner, seulement avec `handover`).
- Nouveaux `relay.hint` : `held`, `offered`, `holder`, `holder_session`, `paused`, `alone`. Les phrases viennent du module partagé
  `js/core/cordee.js` (`relay`, `turnResult`, `RELAY_MESSAGES`, `LEAVE`), copié tel quel dans l’application Android.

## Historique, export, effacement, mesure

- `private.titan_cordee_relay_turns` : chaque prise en charge (`take`, `held`) et chaque passation (`pending`, puis `accepted`,
  `withdrawn`, `expired`, `cancelled` ou `closed`). `public.titan_challenge_members.left_at` (déclencheur) date un départ.
- Export du compte : clé `cordeeRelayTurns` (son rôle seulement : `took`, `offered`, `accepted`, `offered_to_me`), sans l’autre membre.
- Effacement : l’historique reste, sans personne (`on delete set null`).
- Mesure du pilote (rôle de service) : `private.titan_cordee_reprise_measure(depuis)` → prises, offres, acceptations, expirations,
  groupes qui reprennent (relais reçu par le membre qui a accepté la passation), départs et départs avec longueurs acquises.

## Preuves

`sql/tests/300_cordee_reprise.sql` (trois cordées synthétiques, annulées en fin de test), `tools/db/test-cordee-reprise-concurrency.sh`
(deux connexions réelles), `tests/cordee.test.mjs`, `tests/e2e/cordee-reprise.e2e.mjs`, `docs/v182/*.png` ; Android :
`mobile/__tests__/cordeeReprise.test.tsx`.
