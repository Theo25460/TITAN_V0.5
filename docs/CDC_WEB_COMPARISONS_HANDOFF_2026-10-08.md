# Handoff — comparaisons personnelles TITAN+

Branche `codex/web-comparisons-cdc`, base locale PR #25 `e981595e0668da19c3b7f02a6f5ec5b3e182853d`, base distante `3e32c210cb4c59432280a95fdb16d37bf1ff5488`, arbre commun `8ca8e14d6384f5c69e3b8924d25c81b98f91eae8`. Aucune production, migration appliquée à un projet réel, Android, fusion de main, modification de prix/paiement ou changement de récompenses.

## Résultat sur branche

- PREM04 : comparer 4/12/26 semaines calendaires complètes à la période précédente, tous sports ou un sport ; séances, jours actifs, minutes, séries hebdomadaires et cinq sources maximum par période.
- RPC `titan_compare_periods(integer,text,text)` de lecture stable, SECURITY INVOKER, search_path vide, RLS plus propriétaire auth.uid() explicite. Le serveur vérifie is_elite, expiration, remboursement et suspension à chaque demande ; aucune autorisation par drapeau client.
- Durées recalculées avec titan_effort_v300, estimations indiquées. Les séances signalées restent dans leur journal privé ; archives/semaine courante et données étrangères exclues. Aucun GPS, note, santé, XP ou crédit dans la réponse.
- Panneau secondaire replié dans Progrès, recherche limitée à douze suggestions, vraie valeur zéro distincte d'une valeur absente, aucune proportion sans référence. Historique serveur synchronisé, pas de calcul depuis un cache local incomplet.
- Les états invité/Free/serveur ancien/erreur/hors ligne restent lisibles. Résultats non persistés, retirés au changement de compte, fermeture, visibilité ou erreur. Revalidation au retour, aux événements d'historique et chaque minute visible avec résultat actif. Une réponse obsolète ne remplace ni résultat ni état de chargement plus récent.
- Les sources anciennes hors cache ouvrent le vrai journal via une lecture RLS limitée au propriétaire, sans alimenter le cache. Dialogue fermé si le compte change. Les opérations normales du journal et les statistiques gratuites restent accessibles.
- Offre/générateur/FAQ/JSON-LD alignés : comparaisons supplémentaires, base gratuite, disponibilité conditionnée à la migration serveur. Expiration retire l'accès aux comparaisons sans enlever le journal ou les acquisitions permanentes.
- Calendriers hebdomadaires concernés corrigés : déplacement local par date, semaine au changement d'heure, même jour/heure locale pour référence partielle. Fenêtres glissantes et autres analyses hors périmètre.

## Vérification locale avant revue

`pnpm run verify` : 85 tests, zéro échec ; build public et audit réussis, 16 avertissements SEO préexistants. `PLAYWRIGHT_BROWSERS_PATH=/tmp/titan-playwright TITAN_QA_SCREENSHOTS=1 pnpm run test:e2e` : 31/31. Rendus du panneau 360/1280 px inspectés ; aucune largeur débordante. La barre de navigation fixe sur la capture longue mobile est un effet de capture ; le contenu reste défilable.

RED→GREEN : récap/fin de semaine DST et même heure locale (UTC/Paris/New York/São Paulo), RPC absent, droits serveur et 52 dimanches tardifs, sources hors cache/changement de compte, offre avancée auparavant absente, panneau auparavant absent, volume zéro et réponse ancienne qui terminait à tort le nouveau chargement.

La suite SQL dédiée passe sur PostgreSQL WASM jetable (PGlite 0.3.14, hors dépendances du dépôt), avec baseline et les treize migrations. Les binaires PostgreSQL natifs installés localement ne pouvaient pas créer un utilisateur système dans cet environnement ; aucune expérimentation sur Supabase. Le moteur WASM ne charge pas pgcrypto, non utilisé par ce RPC : cette vérification n'est pas un substitut aux suites PostgreSQL natives des deux chemins en CI, obligatoires avant livraison.

## Migration et retour arrière

`supabase migration new advanced_comparisons_v300` a créé `supabase/migrations/20261008180429_advanced_comparisons_v300.sql`. Elle ajoute uniquement une fonction/permissions/commentaire ; aucun DDL de table, index ou mutation de données. Les index existants couvrent les lectures propriétaire/date et propriétaire/sport/date. Le client ancien ne l'utilise pas ; le client nouveau sans fonction affiche l'attente serveur. Retour arrière fonctionnel : client précédent, puis révocation de l'exécution de ce RPC si nécessaire après coordination. Ne pas revenir sur les migrations historiques ou les données.

Documentation primaire Supabase consultée : changelog courant, [fonctions](https://supabase.com/docs/guides/database/functions), [changements PostgreSQL](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes). Ce RPC n'utilise aucun des index ltree/btree_gist, chiffrements historiques pgcrypto ou opérateurs personnalisés concernés ; aucun audit global d'extension de production n'est prétendu.

## Limites et reprise

Ce lot livre une comparaison de pratique personnelle, pas une preuve de performance, un conseil d'entraînement ou une comparaison compétitive. PREM06 reste partiel (autres widgets/vues personnalisées), PREM07/PREM08 restent ouverts pour les rapports et le confort ; PREM11–15 ne sont pas validés par ce RPC. L'état billing vient du profil serveur existant : intégration paiement réelle, restauration/résiliation/refund et recette cible restent nécessaires avant déploiement. Pas de résultat Premium hors ligne ; historique gratuit préservé.

Revue indépendante Sol 6.1, CI native, statut de PR et notes de décisions à renseigner avant handoff final. Le fichier avatar déjà modifié hors de ce lot reste exclu.
