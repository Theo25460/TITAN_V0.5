# Audits finaux V1.1 (FIN-SEC, FIN-CHEAT, FIN-SEO) — 2026-11-02

> ÉTAT HISTORIQUE, SUPPLANTÉ le 2 novembre par `V11_FINALIZATION_REPORT_2026-11-02.md`, `V11_SQL_SECURITY_REVIEW_2026-11-02.md`, `V11_MONETIZATION_REVIEW_2026-11-02.md` et `V11_SEO_FINAL_2026-11-02.md`. Deux défauts SQL de confidentialité et plusieurs défauts Android/paiement ont depuis été reproduits puis corrigés sur candidate. La conclusion ci-dessous « aucun correctif nécessaire » ne représente donc plus l’état actuel. Décision actuelle : NO-GO publication.

Faits relevés dans le dépôt à la tête de branche, **après** le développement. Rien n'a été déployé ni appliqué en production.

## FIN-SEC

| Point | Résultat | Preuve |
|---|---|---|
| Fonctions SQL des migrations 56–59 | Toutes `SECURITY DEFINER` avec `set search_path = ''` (les écarts de comptage sont des commentaires) | contrôle par script sur chaque `security definer` de code |
| Tables privées (`titan_routes`, sièges Coach, outils Coach, droits) | RLS activée, aucun droit API (`revoke all … from public, anon, authenticated`) | migrations 56–59, bancs SQL `300_*.sql` |
| Fonctions publiques parcours | `revoke … from public, anon`, `grant … to authenticated`, 10 contrôles `auth.uid()` | migration 59 |
| Parcours : confidentialité | privé par construction ; partage GPX sans début ni fin (`SHARE_TRIM_M`) ; suppression et export de compte | tests `routes`, `gpsTrack`, SQL |
| Secrets | aucun secret dans le dépôt ; identifiants AdMob = identifiants publics ; clés de service Play/Garmin/Google uniquement en variables d'environnement | `run_secret_scanning` à relancer avant fusion ; tests d'hôtes tiers |
| Billing | vérification serveur (subscriptionsv2), liaison à l'identifiant de compte obfusqué, RTDN authentifiée (OIDC ou jeton), dernier événement gagne | `tests/play-*.test.mjs` |
| AdMob | consentement UMP avant `initialize()`, permissions AD_ID/ADSERVICES retirées, jamais d'annonce Premium, éteint par défaut | `mobile/src/ads/*`, tests `ads*` |
| Dépendances Web (`pnpm audit --prod`) | aucune vulnérabilité | exécuté |
| Dépendances Android (`npm audit --omit=dev`) | 24 signalements, tous transitifs de l'outillage Expo (`@expo/cli`, `node-forge`, `zod`) ; code de build, **pas embarqué dans l'APK** ; correctif = montée de version Expo, à planifier hors de cette livraison | exécuté |

Aucune vulnérabilité exploitable démontrée dans le code V1.1 : aucun correctif de sécurité supplémentaire n'a été nécessaire.

## FIN-CHEAT

| Vecteur | Statut |
|---|---|
| Distance GPS falsifiée | Un parcours **ne crée ni XP, ni crédit, ni récompense** (la séance le fait par la fonction habituelle, inchangée). Filtres précision ≤ 30 m, vitesse ≤ 28 m/s ; D+ seulement si altitude fiable. |
| Doublons / imports répétés | Parcours idempotents par `client_route_id` ; liaison séance unique ; import Garmin dédoublonné (Garmin éteint). |
| Pas (santé) | Aucun XP pour les pas passifs ; pas fusionnés par jour sans double comptage avec les séances GPS. |
| Durées / valeurs impossibles | Bornes serveur existantes + limites de taille des parcours. |
| Classements, quêtes, défis | Moteur d'XP non modifié ; règles serveur existantes. |
| Multi-comptes, abus d'API | Limitation de débit `private.titan_rate_limit` sur les fonctions d'écriture. |
| Publicité | Aucune récompense liée aux annonces (pas de rewarded). |

Limite assumée : un parcours GPS simulé par téléphone (mock location) ne peut pas être détecté côté serveur ; il ne rapporte rien en lui-même.

## FIN-SEO

Préparation seulement, rien de déployé. Aucune publicité sur le Web, aucun AdSense. Le rapport quotidien « Observatoire SEO TITAN » n'est pas accessible depuis cette session : aucune modification SEO supplémentaire n'a été faite. `app-ads.txt` est prêt dans le dépôt (à déployer sur accord du propriétaire).
