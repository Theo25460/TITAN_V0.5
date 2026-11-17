# Paquet de production V1.3.1 (généré)

> **Appliqué en production le 16 novembre 2026**, fichiers `01` à `10` dans l'ordre, chacun confirmé par le propriétaire. Après
> application : empreinte des fonctions identique à la réplique (`private 91 bae05c10ca57 d52d12beba17`,
> `public 293 db4eeb91a3d2 8f112d92ff21`), registre `20261110140000` → `20261116110000`, postflight V1.3.1 54/54 et V1.3 42/42 vrais,
> empreintes des comptes, profils, journal, aventure et consentements inchangées. Le seul conseiller de sécurité restant à traiter
> est la protection des mots de passe compromis (tableau de bord).

Généré par `node tools/db/build-production-bundle.mjs` depuis `supabase/migrations/`. **Ne pas modifier à la main** : le test
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. Régénérer après tout changement de migration.

État de la production relevé le 16 novembre 2026 (lecture seule) : registre terminé à `20261110130137`, aucune dérive de registre
(74 versions identiques au dépôt), une dérive de corps connue (D1, `private.titan_export_extras_before_rpg_v1`, export de compte
cassé pour les comptes liés à Garmin ou à un binôme), réparée par le fichier `07`. Le fichier `09` borne les rapports de démarrage (D11) et le seau `avatars` (D8) ; le fichier `10` limite la recherche par code ami (D11). La faille d'amitié forcée est ouverte :
`authenticated` peut insérer dans `public.friendships` (fermée par le fichier `02`). 0 amitié, 0 lien Garmin, 2 droits d'accès.

## Procédure (éditeur SQL Supabase ou `psql`, dans l'ordre des noms)

1. Sauvegarde du jour confirmée dans le tableau de bord. Aucun déploiement en cours, produits Google Play inactifs.
2. `00-check-before.sql` : `public` doit être `ok = true` ; `private` affiche `a8ec1799e8ca` (dérive D1 attendue en production).
3. `01` à `10`, un fichier à la fois. Chaque fichier est une transaction : la garde refuse un fichier déjà inscrit ou appliqué
   hors ordre, et toute erreur annule le fichier entier, qui peut être rejoué tel quel (`lock_timeout` de 5 s inclus).
4. `99-check-after.sql` : les deux lignes `ok = true`. Une ligne fausse signale un corps différent du dépôt : ne pas exposer
   les services concernés, comparer fonction par fonction (`docs/v131/lot1-securite.md` § 6).
5. `tools/db/postflight-v13.sql` et `tools/db/postflight-v131.sql` : toutes les lignes vraies.

Répétition prouvée le 16 novembre 2026 sur une réplique construite depuis le dépôt (PostgreSQL 16) : empreinte finale exacte,
second passage refusé. Retour arrière par migration : tableau du § 6 de `docs/v131/lot1-securite.md`. Les migrations ne
modifient aucune ligne existante hors `friendships.status` nul (0 ligne en production).
