# Paquet de production v24 (généré) — V1.6.5 Centre des sources connectées — NON APPLIQUÉ

Généré par `node tools/db/build-production-bundle.mjs --bundle v24` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. **Décision du propriétaire requise avant application.**
**Prérequis : les paquets v21 (V1.6.2), v22 (V1.6.3) et v23 (V1.6.4) appliqués.**

Contenu : une migration additive. Une table privée (`private.titan_source_runs`), une colonne nullable sur
`private.titan_source_consents` (`revoked_by`, remplie par un déclencheur), aucun droit sur une table, aucune ligne existante modifiée.
Les règles d'import (une seule fois par source et identifiant, aucune séance du journal réécrite), d'XP et de récompense ne changent pas.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` centre des sources | `titan_source_run_v1` (le téléphone ouvre puis ferme une lecture Santé Connect ; refusée après un retrait, sauf l'enregistrement du refus), `titan_source_center_v1` (consentement et qui l'a retiré, compteurs, sports et champs reçus, liaison Garmin, 10 dernières lectures, dernier lot d'historique). `titan_garmin_ingest_v1` garde, par compte et par jour, ce que chaque envoi Garmin a importé, rattaché, trouvé déjà importé ou ignoré (avec le motif déjà rendu) ; `titan_garmin_deregister_v1` marque le retrait comme venant de Garmin | Oui : « Centre des sources » du profil Web et écran « Sources et capteurs » d'Android |

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v23, tête `20261123150000`).
2. `01-…sql` (garde d'ordre : refusé s'il est rejoué ou si `20261123150000` manque).
3. `99-check-after.sql` : deux lignes `ok = true` (`private 134 a169f5d6f104 cab0356b841d`, `public 334 17bc75638e34 b7cb2e7aff2e`),
   puis les postflights v11, v13 et v131.

Empreintes mesurées le 23 novembre 2026 sur une réplique vierge construite depuis le dépôt jusqu'à `20261123150000` : avant = état v23
attendu (identique) ; le fichier `01` appliqué sur cette réplique donne l'état « après » ; un second passage est refusé.
Répétition : `pnpm run test:db` (toutes migrations, `sql/tests/300_source_center.sql`).

Ordre de déploiement : appliquer ce paquet **avant** de publier le site et l'application qui appellent ces fonctions. Sans lui, le
centre affiche l'état déjà connu (`titan_sources_v1`) avec « Le suivi des synchronisations n'est pas encore ouvert sur le serveur »,
et rien d'autre ne change.

Retour arrière : en-tête de `supabase/migrations/20261124090000_source_center.sql`.
