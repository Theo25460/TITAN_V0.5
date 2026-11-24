# V1.8.3 — Un groupe qui se retrouve

Un groupe qui termine une Cordée propose un nouvel itinéraire privé et repart avec les membres qui acceptent. Tout reste la Grande
Cordée : la nouvelle ascension est une cordée ordinaire (`titan_challenges`, `kind = 'cordee'`), ses membres des membres de défi, ses
comptes ceux de la Cordée. Migration `supabase/migrations/20261126090000_cordee_suite.sql` (paquet `supabase/release-v23`, **non
appliqué**), drapeau serveur `screens.cordee_suite` (absent = fermé, déploiement par compte) pour proposer et répondre.

## Règles

| Situation | Ce que fait le serveur (`public.titan_cordee_suite_v1`) | Refus explicites |
|---|---|---|
| **Le groupe** | Les membres encore encordés à la fin de la cordée (`joined`). Un membre parti, ou sorti par un blocage du créateur, n’en fait plus partie. Fenêtre : **14 jours** après la fin (la cordée terminée reste listée pendant ce temps) | `CHALLENGE_NOT_FOUND`, `SUITE_NOT_FINISHED`, `SUITE_CLOSED` |
| **Proposer** | Une des **quatre routes existantes**, une des **trois allures éprouvées** (douce, régulière, soutenue), 7, 14, 21 ou 28 jours. Proposer vaut acceptation. La proposition dure **72 h** au plus. Aucun texte libre, personne hors du groupe. Limites de création de la Cordée pour celui qui propose (3 créations par jour, 3 cordées en cours en comptant ses propositions ouvertes) | `CORDEE_INVALID`, `SUITE_PENDING` (une proposition ouverte par personne), `SUITE_LIMIT` (3 ouvertes), `SUITE_GROUP_TOO_SMALL`, `CORDEE_LIMIT_3`, `SOCIAL_RATE_LIMIT` |
| **Répondre** | Chaque autre membre accepte ou décline, et peut changer d’avis. Un membre bloqué avec celui qui propose ne voit pas la proposition et ne peut pas y répondre ; une acceptation cesse de compter dès qu’un blocage survient. Compte suspendu : rien | `SUITE_UNAVAILABLE`, `SUITE_OWN`, `ACCOUNT_SUSPENDED` |
| **Départ** | Dès **deux acceptations** (celui qui propose et un autre), une **nouvelle cordée part maintenant**, compteurs à zéro (nouvelle ligne, `starts_at = now()` : seules les séances confirmées enregistrées après le départ comptent). Ceux qui ont accepté sont encordés ; ceux qui n’ont pas répondu sont invités (ils peuvent encore s’encorder ou décliner) ; ceux qui ont décliné ne sont pas ajoutés. Accepter une proposition déjà partie encorde aussitôt (10 membres au plus) | `SUITE_FULL` |
| **Deux propositions en même temps** | Chaque action verrouille la ligne de la cordée terminée. Même route, allure et durée : **une proposition canonique** (le second proposant l’accepte, `canonical: true`). Propositions distinctes : elles coexistent et **chacun choisit explicitement** — une acceptation à la fois (en accepter une autre la déplace), celui qui propose et accepte une autre proposition s’y rallie (la sienne devient « ralliée »), un membre déjà reparti doit quitter cette cordée avant d’en choisir une autre | `SUITE_ALREADY_IN` |
| **Retirer** | Celui qui propose retire sa proposition ouverte (même drapeau fermé). Une proposition sans réponse expire au bout de 72 h ; celle dont l’auteur part, est suspendu ou effacé se ferme | `SUITE_NOT_MINE` |

**Aucune avance gratuite** : proposer, accepter ou repartir n’ajoute ni longueur, ni XP, ni crédit, ni titre ; les anciens compteurs ne
passent jamais dans la nouvelle cordée (relais de la Sentinelle compris : une nouvelle cordée de l’Aube a son propre relais).

## Ce que chacun voit (`titan_cordees_v1 → cordees[i]`)

- `story` (cordée terminée, membre encordé) : **étapes partageables** — formée (nombre de membres), suite de (route), passage ouvert et relais
  reçu (nom sous la règle de la Cordée, famille de sport en libellé de jeu), camps atteints, sommet ou fin — et **décisions du groupe** —
  chaque proposition (qui, sous la règle de nommage ; itinéraire ; nombre d’acceptations et de refus ; issue) et le départ (effectif).
  Jamais une séance, un sport, une date d’entraînement, une durée ou une distance ; un refus est un nombre, jamais un nom.
- `suite` (cordée terminée) : `can` (`propose`), `hint` (`propose`, `answer`, `mine`, `in`, `full`, `alone`, `closed`, `suspended`), `choice`,
  `previous` (route, allure, durée, sommet), `proposals[]` (`route`, `pace`, `days`, `status`, `by`, `mine`, `myAnswer`, `yes`, `no`, `eligible`,
  `waiting`, `accepted` nommés et `others` comptés, `expiresAt`, `startedId`, `joined`, `turn` : `accept`, `decline`, `withdraw`).
- `follows` (nouvelle cordée) : la cordée qu’elle suit, close et lisible (route, sommet ou longueurs, effectif, qui a proposé).
- **Visibilité** : les partenaires de lien d’une cordée restent nommés l’un pour l’autre dans les cordées qui la suivent
  (`private.titan_member_named` suit la chaîne des propositions, 8 étapes au plus) ; les blocages masquent toujours ; personne d’autre.
- **« Depuis ta dernière visite »** (`titan_social_digest_v1`) : `cordees[i].follows` et `suites` ; le Web et Android disent la réponse que
  le groupe attend (une proposition, ou deux à choisir), l’état de sa propre proposition, et l’invitation de la cordée repartie. Jamais de
  relance à quelqu’un qui a décliné, aucune notification.
- Phrases dans le module partagé `js/core/cordee.js` (`suite`, `story`, `follows`, `nextPace`, `suiteResult`, `SUITE_MESSAGES`) et
  `js/core/social-digest.js`, copiés tels quels dans l’application Android. L’allure conseillée suit la route vécue : la même après un
  sommet, un cran plus douce sinon.

## Historique, export, effacement, mesure

- `private.titan_cordee_suites` (propositions) et `private.titan_cordee_suite_answers` (réponses) ; déclencheur
  `titan_challenge_members_suite` : s’encorder ou décliner l’invitation de la nouvelle cordée est enregistré comme réponse.
- Export du compte : clé `cordeeSuites` (ses propositions et ses réponses, jamais celles d’un autre membre).
- Effacement : la proposition reste dans l’histoire du groupe, sans personne (`on delete set null`) ; les réponses partent avec le compte.
- Mesure du pilote (rôle de service) : `private.titan_cordee_suite_measure(depuis)` → groupes ayant terminé une cordée (2 membres ou plus),
  propositions, refus, expirations, **groupes redevenus actifs ensemble sous 14 jours**, **effectifs** (répartition des membres encordés) et
  **première participation** (nouvelles cordées où au moins un, puis deux membres ont apporté une longueur). Des nombres seulement.

## Preuves

`sql/tests/300_cordee_suite.sql` (quatre cordées synthétiques, annulées en fin de test), `tools/db/test-cordee-suite-concurrency.sh`
(deux connexions réelles), `tests/cordee.test.mjs`, `tests/social-digest.test.mjs`, `tests/e2e/cordee-suite.e2e.mjs`, `docs/v183/*.png` ;
Android : `mobile/__tests__/cordeeSuite.test.tsx`.
