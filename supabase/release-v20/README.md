# Paquet de production v20 (généré) — boîte de réception des notifications Google Play

Généré par `node tools/db/build-production-bundle.mjs --bundle v20` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.

Contexte : incident du 18 novembre 2026. `play-notifications` répondait `503` à chaque notification Google Play tant que
`PLAY_BILLING_ENABLED` était absent sur Netlify ; Pub/Sub renvoyait chaque message pendant des jours (≈ 40 000 appels par jour, tous en 503).
La fonction corrigée **garde** chaque notification (jeton d'achat et type seulement, dédoublonnés par l'identifiant du message Pub/Sub),
l'acquitte, et `play-reconcile` la traite une fois la facturation ouverte. Un achat déjà payé n'est donc pas perdu.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` boîte de réception | Table privée `private.titan_play_notification_inbox` (RLS, aucun accès `anon`/`authenticated`), trois fonctions réservées au rôle serveur : garder une notification (`new` / `duplicate` / `done` / `full`, au plus 5 000 lignes non authentifiées en attente), réserver les lignes dues avec un délai croissant (5 min → 24 h) **avant** traitement, clore ou laisser en attente (abandon après 30 essais ; le balayage horaire des droits relit toujours chaque jeton connu) | Non. Effet indirect : un achat dont la notification arrivait pendant que la facturation était fermée sera attribué à l’ouverture. `titan_play_checkout_ready_v1` exige désormais la boîte (V20) et le balayage des accès (V18) : la vente ne peut pas ouvrir sur un serveur en retard |

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v18 ; v19, décision PR #155, ne fait pas partie de la chaîne).
2. `01-…` (garde d'ordre : refusé s'il est rejoué ou si `20261121130000` manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.

Empreintes mesurées sur une réplique vierge (`tools/db/test-migrations.sh`) : avant = état v18 attendu (identique), après = `public` 324 fonctions.
Répétition : `sql/tests/300_play_notification_inbox.sql`.

Retour arrière : en-tête de la migration (trois `drop function` puis `drop table`). La fonction déployée tolère l'absence de la table
(elle répond alors `503`, comme avant) : déployer la fonction **après** ce paquet.
