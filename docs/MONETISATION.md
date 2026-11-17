# TITAN ONE · Monétisation fiable — état, preuves, recette (21 novembre 2026)

Branche `feat/titan-monetisation-excellence`, partie de la tête de la PR #153 (`4238c32`, elle-même sur #152 et #151) : tous les travaux
sportifs, RPG et sociaux sont conservés. Rien n'est publié, aucune migration n'est appliquée, aucun prix Play Console n'est modifié,
aucune transaction (réelle ou de licence) n'a été faite.

**Niveau de preuve.** Tests automatiques avec un Google et un Supabase simulés, rejeu SQL sur une réplique vierge du schéma de production
(PostgreSQL 16), parcours navigateur, lecture seule de la production. **Un test simulé ne prouve pas un achat Google Play réel** : la chaîne
réelle reste à prouver avec le protocole du § 7.

## 1. Anomalie héritée (non masquée)

CI Android de la PR #153 au commit `4238c32` : « Parcours réel sur émulateur » **rouge** — `expected at least 3 sessions for A, got 1`
(`e2e/verify-backend.sh`, exécution 44127885455). Cet échec précède ce chantier et n'est pas corrigé ici : les séances concernées passent par
la file hors ligne et le parcours progression/aventure, que ce chantier ne touche pas. À reprendre dans le chantier sportif.

## 2. Offres et droits vérifiés

| Offre | Produit Play | Clé serveur | Prix de référence | Ce que le serveur accorde | Contrôle serveur |
|---|---|---|---|---|---|
| Gratuit | — | — | 0 € | Journal, statistiques de base, progression, 4 campagnes, Communauté, Atelier ; 5 routines ; 3 sportifs suivis | `titan_coach_capacity` (3), plafond routines (v18) |
| TITAN+ | `titan01` | `titan_plus` | 4,99 €/mois | `is_elite` : comparaisons 4/12/26 sem., bilans + CSV, 10 vues, 20 routines, 4 pièces de l'Atelier en accès temporaire, pas de publicité Android ; **20 sportifs suivis** (règle héritée publiée, voir § 5) | `titan_compare_periods`, `titan_practice_report`, `titan_mutate_analysis_view`, `titan_cosmetic_owned` (lisent `is_elite` + échéance) ; routines : v18 |
| Coach | `titan02` | `coach` | 19,99 €/mois | TITAN+ pour le coach ; 5 places, chacune avec TITAN+ inclus pour le sportif rattaché | `titan_coach_plan` (5), places : v18 |
| Coach Ultra | `titan03` | `coach_pro` | 39,99 €/mois | Même suite ; 15 places | `titan_coach_plan` (15), places : v18 |

- **Production (lecture seule, 21/11)** : catalogue `titan01/02/03 → titan_plus/coach/coach_pro` présent ; 0 achat Google Play, 2 accès
  offerts (`manual`), 0 lien coach ; `titan_apply_play_entitlement_v1` et `titan_play_checkout_ready_v1` présentes.
- **Période** : le serveur n'ouvre l'achat que pour un forfait de base **actif et mensuel** (`P1M`, `functions/play-billing.mjs`). Un essai
  ou une offre d'introduction s'affiche tel que Google le renvoie (« Essai gratuit, puis 4,99 € / mois »), jamais comme le prix.
- **Web / Android** : le site ne vend rien ; l'application n'écrit aucun montant (test « no price or amount is written in the app »). Les
  avantages et capacités du site, des CGU, de l'Atelier et des cartes Android sont liés au SQL par `tests/coherence-offers.test.mjs`.
- **Pas d'avantage de jeu** : `titan_economy_limits` donne les mêmes plafonds à tous (`eliteCapMultiplier` = 1) ; un achat ne crédite
  jamais de crédits ni d'XP (`support_elite` paie 0) ; la boutique ne prend que des crédits gagnés.

### Prix 5,99 / 23,99 / 47,99 € — cause

Relevé Play Console France du 10 novembre (`0b32ca2`) : 5,99 €, 23,99 € et 47,99 €. Les trois valent **exactement le prix de référence × 1,20**
(4,99 × 1,2 = 5,988 ; 19,99 × 1,2 = 23,988 ; 39,99 × 1,2 = 47,988), soit la TVA française à 20 % ajoutée à un prix déjà pensé TTC. Aucun
code TITAN n'ajoute de taxe (recherche « tva/vat/tax » vide ; l'application affiche le prix formaté par Google). Cause la plus probable :
le prix a été saisi comme **prix par défaut hors taxes**, et la Play Console a converti et taxé le prix local français. **Rien n'a été
modifié** : la Play Console n'est pas lisible depuis ce poste. Décision du propriétaire : saisir 4,99 / 19,99 / 39,99 € comme prix local
France TTC (ou assumer les montants actuels et aligner le cahier des charges).

## 3. Défauts trouvés et corrigés

| Lot | Défaut réel | Impact | Correction | Preuve | Statut |
|---|---|---|---|---|---|
| A | Un jeton inconnu n'était lu chez Google que sur la notification d'achat (type 4) | Si Pub/Sub abandonne la 1ʳᵉ notification, achat payé sans accès jusqu'à la réouverture de l'app | Renouvellement (2), reprise (1), redémarrage (7) relisent aussi Google ; compte lié par Google obligatoire | `tests/play-notifications.test.mjs` | VERT (simulé) |
| A | L'écran cachait toutes les offres dès que `is_elite` était vrai | Un sportif avec une place coach ne pouvait ni devenir Coach ni prendre son TITAN+ | L'écran demande au serveur l'origine de l'accès (`titan_my_plan_v1`) | `titanPlusScreen.test.tsx` | VERT (simulé) |
| A | Abonnement Play d'un autre compte TITAN → conseil « Restaurer » impossible | Impasse pour l'utilisateur | Code `OTHER_ACCOUNT` et message exact | `playBilling.test.ts` | VERT |
| B | `is_elite` restait vrai après l'échéance sans événement | Publicités coupées, écran d'achat bloqué pour un abonné expiré, résumé faux | Balayage horaire SQL (accès offerts sans échéance intacts) + écran : résumé périmé ne bloque plus | `300_monetisation_lifecycle.sql`, `titanPlusScreen` | VERT ; ORANGE en production (v18) |
| B | Achats en attente / suspendus / en pause jamais relus par le rapprochement | Paiement confirmé plus tard oublié si la notification se perd | Relecture toutes les 6 h | `300_monetisation_lifecycle.sql`, `play-reconcile.test.mjs` | VERT ; ORANGE en production |
| B | Catalogue produit → formule absent des migrations | Base reconstruite : Coach vendu sans places | Semé (`on conflict do nothing`) | idem | VERT |
| C | La suite coach ne vérifiait la capacité qu'aux invitations | Coach Ultra 1 mois → 15 sportifs suivis gratuitement ensuite ; rétrogradation sans effet | Liens au-delà des places **en pause** des deux côtés, sans suppression, reprise automatique | `300_monetisation_coach_capacity.sql` | VERT ; ORANGE en production |
| C | Limite 5/20 routines seulement dans le navigateur | Contournement de TITAN+ par appel direct | Le serveur refuse d'agrandir au-delà ; rien n'est coupé | `300_monetisation_routines.sql` | VERT ; ORANGE en production |
| D | Succès calculés sur toutes les séances non archivées | Crédits cosmétiques (jusqu'à 5 000 par succès) depuis des séances historiques gratuites, retenues ou exclues | Seules les séances confirmées comptent ; séances antérieures au tampon serveur conservées | `300_monetisation_economy.sql` (rouge sur l'ancien code) | VERT ; ORANGE en production |
| D | Libération horaire des récompenses retenues : séance archivée payée, lecture sans verrou | Archiver une séance retenue la sort de la revue et la paie 24 h après ; course avec une exclusion | Verrou et relecture de la séance ; archivée / exclue / rejetée → annulée ; en revue → attend | idem | VERT ; ORANGE en production |

Vérifié conforme sans changement : vérification serveur `subscriptionsv2` (aucun accès sur la seule parole du client), rattachement par
`obfuscatedAccountId`, jeton à un seul compte (`ENTITLEMENT_OWNED_BY_OTHER`), acquittement après écriture et relance horaire, ordre des lectures
(une lecture plus ancienne n'écrase jamais une plus récente), remplacement atomique lors d'un changement d'offre, séparation `google_play`
/ `manual` / `coach` / achats de test (`provider_is_test`, refusés sur la base publique), achats cosmétiques uniques (verrou + index unique),
séances rejouées (`client_event_id`), TITAN LIVE (portefeuille propre, réglé une fois, séances non confirmées refusées), Grande Cordée / Duo /
expéditions / objectif de club (aucun crédit ni XP), aucune RPC économique sur le compte d'autrui.

## 4. Parcours d'achat : cas couverts

| Cas | Comportement | Preuve |
|---|---|---|
| Achat réussi | Contrôle serveur avant Google ; jeton vérifié chez Google ; accès écrit ; acquittement ; confirmation avec le nom de l'offre | `play-billing.test.mjs`, `titanPlusScreen` |
| Paiement en attente | Aucun accès ; message honnête ; reprise automatique (app, rapprochement 6 h, notification) | `playBilling`, `billingRecovery`, `300_monetisation_lifecycle` |
| Achat refusé / annulé | Aucun accès, aucun message d'erreur pour une annulation | `playBilling` |
| Perte de connexion | Abandon après 20 s, profil relu, reprise au retour du réseau | `playBilling`, `billingRecovery` |
| Application fermée pendant l'achat | Notification serveur (type 4, ou suivante si perdue) ; reprise au premier plan | `play-notifications`, `billingRecovery` |
| Redémarrage après paiement | Reprise silencieuse à la connexion | `billingRecovery` |
| Achat déjà possédé | Remplacement de l'offre, jamais un second abonnement | `titanPlusScreen` |
| Même achat présenté plusieurs fois | Une ligne par jeton, rien de doublé | `300_monetisation_lifecycle`, `play-concurrency` |
| Changement de compte TITAN | Achat jamais rattaché à un autre compte ; message `OTHER_ACCOUNT` | `playBilling`, SQL |
| Changement de téléphone / réinstallation | « Restaurer mes achats » + reprise automatique | `playBilling` |
| Montée / descente d'offre | Ancien jeton « remplacé » dans la même écriture ; places 5 ↔ 15 ; liens au-delà en pause | `300_monetisation_lifecycle`, `300_monetisation_coach_capacity` |
| Annulation / expiration / remboursement / révocation | Accès jusqu'à l'échéance ; retiré à l'expiration (balayage), au remboursement révoqué et à la révocation | `play-notifications`, `play-reconcile`, SQL |

## 5. Décisions qui reviennent au propriétaire

1. **TITAN+ = 20 sportifs suivis, Coach = 5** (règle V1 publiée : accueil, `/titan-plus`, `/pour-les-coachs`, CGU § 4.2 bis). Impact : une
   offre à 4,99 € suit quatre fois plus de sportifs que Coach à 19,99 € (sans TITAN+ pour eux) ; un abonné TITAN+ qui passe à Coach voit
   15 de ses suivis mis en pause. Correction préparée **sans nouvelle politique** (TITAN+ suit autant que Classique : 3, seules les offres
   Coach donnent des places) dans une PR brouillon séparée, fondée sur cette branche, à fusionner ou fermer.
2. **Prix France** (§ 2) : saisir les prix TTC dans la Play Console.
3. **Remboursements contestés** : Google envoie désormais `pendingRefundReviewNotification` (rétrofacturation à instruire sous 24 h via
   `orders.reviewRefund`) ; TITAN l'acquitte sans réponse, Google décide seul. À traiter si le volume le justifie.
4. **Textes juridiques** : la règle de pause des places figure dans le guide coach et la page TITAN+ ; les CGU § 4.2 bis sont cohérentes
   mais doivent être relues par un juriste ; identité de l'éditeur dans les mentions légales et âge minimal restent à trancher (relevés
   antérieurs, `docs/TITAN_ONE.md` § 0 bis).

## 6. Migrations et actions restantes

- **Paquet v18** (`supabase/release-v18/`, généré, non appliqué) : 4 migrations additives, empreintes mesurées avant (= fin v17) et après.
  Prérequis : v15, v16, v17, **non appliqués en production au 21 novembre** (registre : 130 migrations, dernière `20261117170000`).
- **Netlify** : `PLAY_BILLING_ENABLED=true`, `PLAY_PRODUCT_IDS=titan01,titan02,titan03`, `PLAY_PACKAGE_NAME`, `PLAY_SERVICE_ACCOUNT_JSON`
  (lecture des achats **et** du catalogue), `PLAY_RTDN_AUDIENCE` + `PLAY_RTDN_SERVICE_ACCOUNT` (ou `PLAY_RTDN_TOKEN` ≥ 24 caractères),
  `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`. `PLAY_CHECKOUT_ENABLED=false` met la vente en pause en gardant
  restauration et notifications. Sans ces variables, l'achat reste fermé (réponse 503 du contrôle préalable, l'app n'ouvre pas Google Play).
- **Play Console** : forfaits de base mensuels actifs pour les trois produits ; prix France TTC ; notifications temps réel vers
  `/functions/play-notifications` (Pub/Sub, push authentifié) ; testeurs de licence ; produits **inactifs** tant que la recette n'est pas
  passée (les clients 1.2.1 installés n'ont pas le contrôle préalable) ; retirer la version 1301.

## 7. Protocole de recette réelle (achat de licence)

Le service public **refuse volontairement** un achat de test (`TEST_PURCHASE_REFUSED`), et le flux de publication Android refuse tout
bundle qui pointe ailleurs que vers la production. Deux voies, au choix du propriétaire :

- **Voie A — banc isolé, compte testeur de licence (aucun argent).** Projet Supabase distinct (jamais `oubmftfufwwzwpgvrcag`), migrations
  jusqu'à v18 ; déploiement Netlify de cette branche avec les variables du § 6, plus `PLAY_ALLOW_TEST_PURCHASES=true` et
  `PLAY_TEST_SUPABASE_URL` = l'URL du banc. Build **local** signé avec la clé d'envoi, avec `EXPO_PUBLIC_TITAN_BILLING=1`,
  `EXPO_PUBLIC_TITAN_E2E_SUPABASE_URL`, `EXPO_PUBLIC_TITAN_E2E_SUPABASE_ANON_KEY` et `EXPO_PUBLIC_TITAN_E2E_BILLING_URL` (URL HTTPS du
  déploiement de banc), envoyé sur une piste de test **fermée** (même `applicationId`, Play n'accepte la facturation que pour une app
  installée depuis Play) ; compte testeur de licence France.
- **Voie B — production, vrai paiement remboursé.** Après application de v15 → v18 et pose des variables Netlify : flux « Android natif »
  (`workflow_dispatch` sur la branche fusionnée, `signing=upload`, `billing=true`, `ads=off`, `partial_release=true`), AAB sur la piste de
  test interne, compte Google **non testeur** du propriétaire, puis remboursement avec révocation depuis la Play Console.

Puis, dans les deux cas :

3. `GET /functions/play-billing?product_id=titan01` (puis 02, 03) authentifié : `204`.
4. Pour chaque cas, noter heure, prix affiché par Google, résultat dans TITAN et ligne `private.titan_entitlements` :
   achat de chaque offre ; fermeture de l'app pendant le paiement puis réouverture ; mode avion juste après le paiement ; carte « paiement
   en attente » (testeur : « Slow test card, approves/declines after a few minutes ») ; refus de carte ; second compte TITAN sur le même
   compte Google (message « autre compte TITAN », aucun accès) ; réinstallation + « Restaurer mes achats » ; second téléphone ; TITAN+ →
   Coach → Coach Ultra → Coach (deux liens au-delà de 5 en pause, puis reprise après départ d'un sportif) ; annulation (accès jusqu'à
   l'échéance) ; renouvellement accéléré de licence (5 min) ; expiration ; remboursement avec révocation depuis la Play Console (accès retiré
   en moins de 2 minutes, places des sportifs fermées).
5. **Échec bloquant** : une transaction acceptée sans accès ouvert dans les 2 minutes (application ouverte) ou dans l'heure (application
   fermée) ; un accès ouvert sans transaction ; un accès rattaché au mauvais compte.

## 8. Tests du candidat

| Suite | Résultat |
|---|---|
| Web `pnpm run verify` (typage, 743 tests unitaires, build, audit, garde de publication) | 743/743 |
| SQL `tools/db/test-migrations.sh` (chaîne complète + contrats concurrents + 4 tests `300_monetisation_*`) | Vert |
| Android `tsc` + Jest | 991/991, 111 suites |
| Parcours navigateur : achat Play (TWA), coaching, outils coach, analyses, routines, Atelier | 87/87 |
| CI Android émulateur | Rouge hérité (§ 1) |

## 9. Limites connues

- Les valeurs `val` et `date` d'une séance confirmée restent modifiables dans les bornes du garde-fou : un succès « tonnage » ou « série »
  peut encore être avancé par édition. Correction possible : figer les valeurs tamponnées par le serveur (`details.effort`).
- « Semaine tenue » (+50 crédits) compte aujourd'hui les séances retenues : corrigé dans le paquet **v17** (séances confirmées seulement),
  donc effectif seulement après son application.
- `titan_coach_unread_v1` peut compter des messages d'un lien en pause, sans permettre de les lire.
