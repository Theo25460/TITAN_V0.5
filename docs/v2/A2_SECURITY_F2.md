# TITAN V2.0 — Porte F2 : données et sécurité (mission A2)

Relevé le 26/11/2026 sur la tête candidate de `integration/v2.0-all-versions`. Statuts : **PASS** (vérifié par une commande rejouable),
**PARTIEL**, **NON TESTÉ**, **BLOQUÉ**. Aucun contrôle non exécuté n'est présenté comme réussi. Aucune donnée réelle : comptes et
valeurs synthétiques uniquement ; aucune connexion à la base de production pendant A2.

## 1. Base et migrations

| Contrôle | Statut | Preuve |
|---|---|---|
| Partir de l'historique réel de production (141 migrations, tête `20261122090000`) | PASS | registre lu par A1 ; `tools/db/production-head.txt` ; test `v2-migration-map` (aucun des 141 fichiers modifié) |
| Collisions de versions et de paquets supprimées | PASS | 26 migrations canoniques uniques, 8 paquets ; `tests/v2-migration-map.test.mjs`, `tests/production-bundle.test.mjs` |
| Rejouable sur base vierge | PASS | `pnpm run test:db` vert (toutes les migrations, tous les tests `sql/tests/300_*`, contrats de concurrence) |
| Rejouable sur réplique représentative (anciens comptes, abonnement, journal, RPG, données privées, coaching) | PASS (synthétique) | `tools/db/v2-replica-rehearsal.sh` : 94 contrôles, 0 échec. Réplique **synthétique**, pas une copie anonymisée de production : A2 n'exporte aucune donnée utilisateur (voir § 5) |
| Nombre de lignes et sommes de contrôle des données existantes | PASS | toutes les tables `public`/`private` : nombre et somme MD5 sur les colonnes d'origine, avant = après |
| Index, RPC, RLS, GRANT des nouveaux objets | PASS | 18 nouvelles tables : RLS, aucun droit direct `anon`/`authenticated` ; 48 nouvelles fonctions publiques fermées à `anon` ; toutes les `SECURITY DEFINER` fixent `search_path` ; aucune fonction privée nouvelle ouverte à `anon` ; deux fonctions privées ouvertes à `authenticated`, toutes deux `SECURITY DEFINER` avec contrôle `auth.uid()` (motif de `main` : enveloppe publique `SECURITY INVOKER`) |
| Idempotence / retry | PASS | chaque fichier de paquet rejoué est refusé (« already registered ») et ne change rien ; chaque migration est une transaction gardée |
| Verrouillage / concurrence | PASS (base vierge) | contrats à deux connexions réelles de `test:db` : économie, droits, imports multi-sources, retrait de consentement, aventure, coach (suivi, revue, programmes, cycles, groupes), historique |
| Restauration | PARTIEL | points de restauration Git `a2/rp-00` … `a2/rp-10` ; retour arrière documenté par paquet ; **la restauration d'une sauvegarde de production n'a pas été répétée** (A3, avec PITR) |
| Export complet (RPG, sources, GPS, club/coach) | PASS | 22 nouvelles clés d'export ; ajout par v2-08 de `importBatches` (V1.6.4) et `sourceRuns` (V1.6.5), absents des lots ; garde v2-08 qui refuse le paquet si l'une des 44 + 8 sections manque |
| Suppression / révocation | PASS (tests des lots) | `sql/tests/300_*` des lots (retrait de consentement, révocation de lien coach, suppression de compte avec import concurrent) rejoués par `test:db` ; tables nouvelles en `on delete cascade` / `set null` documentés dans la politique |
| Deux comptes non liés, rôles incompatibles (IDOR) | PASS | réplique : un compte non lié et `anon` refusés sur le lien coach (séances, propositions, messages, dossier de suivi) ; les tests SQL des lots jouent un tiers non lié (`Malo`, etc.) |
| Drapeaux | PASS (serveur) | aucun drapeau de lot créé ni ouvert par les paquets ; côté client, absent = fermé (`=== true`) pour AdMob ; **défaut fermé de chaque drapeau client à prouver par A3** |
| Aucune `service_role` ni secret côté client | PASS | `pnpm run release-check` (2 987 fichiers et `dist/`) ; recherche `service_role` / `SERVICE_ROLE_KEY` dans `js/`, `mobile/src/`, HTML : aucune |

## 2. Audit OWASP adapté

| Thème | Constat | Statut |
|---|---|---|
| Authentification, sessions | aucune modification par les lots ni par A2 (Supabase Auth, Google) | inchangé |
| Injection SQL | aucune requête dynamique (`execute format`, `execute '…'`) dans les 26 migrations ; RPC paramétrées ; `search_path` vide | PASS |
| XSS / CSP | `pnpm test` : `csp-inline`, `check-inline-scripts` (235 scripts) ; échappement des modules lots couvert par leurs tests | PASS (automatique) |
| CSRF | jetons Bearer (pas de cookie de session) ; fonctions `route-plan` / `poi-nearby` : origine vérifiée, Bearer obligatoire | non applicable / PASS |
| Accès direct / IDOR | § 1 | PASS |
| Limitation de débit | quotas par compte des fonctions carte (30/h, 150/j ; 60/h, 300/j) demandés avec le jeton de l'athlète ; `titan_rate_limit` dans les actions coach | PASS (tests des lots) |
| Dépendances | `pnpm audit --prod` : 0 ; Android `npm audit --omit=dev` : 3 modérées (`glob`/`minimatch` via `@expo/fingerprint`, outil de build), lockfile inchangé depuis `main` | P2 |
| Permissions Android | seule modification : le lien vérifié `/defi` (V1.8.1) ; aucune nouvelle permission | PASS |
| Intégrité des achats / notifications | aucun fichier de paiement, droits, prix ou offres modifié (`play-*`, `titan_plan_products`, entitlements) ; `coherence-offers` vert | PASS |
| Fonctions Netlify nouvelles | `route-plan`, `poi-nearby` : désactivées tant que `ROUTING_PROVIDER` / `ROUTING_API_KEY` ne sont pas posés ; aucune clé de service | PASS |

## 3. Menaces résiduelles et remédiations

| Gravité | Menace | Remédiation |
|---|---|---|
| — | aucune faille critique ou haute constatée | — |
| P2 | défaut d'`EXECUTE` à `PUBLIC` d'une fonction trigger V1.6.5 | **corrigé** (v2-08) |
| P2 | export incomplet (lots d'import, synchronisations des sources) | **corrigé** (v2-08) |
| P2 | 3 vulnérabilités modérées dans un outil de build Android | à traiter hors fusion (mise à jour Expo) |
| P1 (procédure) | nouveau client publié avant les paquets SQL : appels à des fonctions absentes | ordre de publication documenté (`A2_CLIENT_SERVER_COMPAT.md`) ; essai réel en A3 |

## 4. Non testé ou bloqué

- Copie **anonymisée** de production : non faite (aucune donnée utilisateur n'est exportée par A2) ; remplacée par une réplique synthétique.
- Restauration d'une sauvegarde réelle, essais sur appareil, essai du nouveau client contre l'ancien serveur : A3.
- Play Console, AdMob, Search Console : pas d'accès (inchangé depuis A1).
