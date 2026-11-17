# Paquet de production v14 (généré) — APPLIQUÉ EN PRODUCTION (16 et 17 novembre 2026)

Généré par `node tools/db/build-production-bundle.mjs --bundle v14` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.

Contenu : TITAN LIVE (`01`), les sept migrations des fonctions Android et sociales des 15 et 16 novembre 2026 (`02` à `08`)
et l'ajout du monde live à l'export de compte (`09`).
Toutes additives : aucune fonction durcie par la V1.3.1 n'est redéfinie, aucune ligne existante n'est modifiée.

| Fichier | Effet | Visible pour les joueurs dès l'application ? |
|---|---|---|
| `01` TITAN LIVE | Tables privées et règlement serveur d'une séance en direct, jamais d'XP ni de crédits | Non : tout répond `LIVE_DISABLED` tant que le réglage `screens.live` est éteint |
| `02` calendrier des événements | Garde le calendrier collectif rempli | **Oui** : crée des événements collectifs ; décision de publication |
| `03` défi ouvert par lien | Défi sans amitié préalable | Seulement avec un client qui le propose |
| `04` semaine tenue | 50 crédits cosmétiques, une fois par semaine tenue | **Oui pour l'économie** : nouveau gain de crédits ; décision d'équilibrage |
| `05` lettres à soi-même, `08` chapitres de vie, `07` chronique de guilde | Nouvelles tables privées et RPC | Seulement avec un client qui les propose |
| `09` export de compte | « Exporter toutes mes données » contient le monde TITAN LIVE du joueur | Oui, sans effet tant que le joueur n'a pas de monde live (clés vides) |
| `06` import d'historique | Import d'un export Strava en séances historiques (sans XP) | Seulement avec un client qui le propose |

## État en production

- `01` à `07` : appliqués le 16 novembre 2026. `08` et `09` : appliqués le 17 novembre 2026 (registre : 130 migrations, dernière
  `20261117170000`).
- `99-check-after.sql` : les deux lignes `ok = true`, empreintes identiques à la répétition
  (`private 103 78dde17392e0 4f6481c4b912`, `public 309 5eb4c4873e06 95c0de5e6ce0`).
- Postflights : `postflight-v11.sql` 328 lignes vraies sur 328, `postflight-v13.sql` 42 sur 42, `postflight-v131.sql` 54 sur 54.
- Conseils Supabase : aucun niveau ERROR. Restent des réglages de tableau de bord (protection contre les mots de passe compromis
  désactivée) et les avertissements attendus sur les fonctions `security definer` appelables par un compte connecté.
- Aucune sauvegarde restaurable n'existait (offre gratuite) : chaque fichier donne sa procédure de retour en en-tête.
- Rejouer un fichier est refusé par sa garde d'ordre. La procédure ci-dessous est conservée pour mémoire.

## Procédure

1. Sauvegarde du jour confirmée ; aucun déploiement en cours.
2. `00-check-before.sql` : les deux lignes `ok = true` (état laissé par le paquet V1.3.1 le 16 novembre 2026).
3. `01` à `09`, un fichier à la fois. Chaque fichier est une transaction avec garde d'ordre : une erreur annule le fichier entier.
4. `99-check-after.sql` : les deux lignes `ok = true`.
5. `tools/db/postflight-v11.sql`, `postflight-v13.sql`, `postflight-v131.sql` : toutes les lignes vraies.

Répétition du 16 novembre 2026 sur une réplique placée dans l'état de la production (PostgreSQL 16) : contrôle de départ vrai,
empreinte finale `private 103 78dde17392e0 4f6481c4b912`, `public 309 5eb4c4873e06 95c0de5e6ce0`, rejeu refusé.

Avant l'application, les écrans Android concernés affichaient « Cette fonction n'est pas encore disponible »
(`mobile/src/lib/errors.ts`) ; ils répondent maintenant.
