# Handoff — comparaisons personnelles TITAN+

Branche `codex/web-comparisons-cdc`, base locale PR #25 `e981595e0668da19c3b7f02a6f5ec5b3e182853d`, base distante `3e32c210cb4c59432280a95fdb16d37bf1ff5488`, arbre commun `8ca8e14d6384f5c69e3b8924d25c81b98f91eae8`. Aucune production, migration appliquée à un projet réel, Android, fusion de main, modification de prix/paiement ou changement de récompenses.

## Résultat sur branche

- PREM04 : comparer 4/12/26 semaines calendaires complètes à la période précédente, tous sports ou un sport ; séances, jours actifs, minutes, séries hebdomadaires et cinq sources maximum par période.
- RPC `titan_compare_periods(integer,text,text)` de lecture stable, SECURITY INVOKER, search_path vide, RLS plus propriétaire auth.uid() explicite. Le serveur vérifie is_elite, expiration, remboursement et suspension à chaque demande ; aucune autorisation par drapeau client.
- Durées recalculées avec titan_effort_v300, estimations indiquées. Les séances signalées restent dans leur journal privé ; archives/semaine courante et données étrangères exclues. Aucun GPS, note, santé, XP ou crédit dans la réponse.
- Panneau secondaire replié dans Progrès, recherche limitée à douze suggestions, vraie valeur zéro distincte d'une valeur absente, aucune proportion sans référence. Historique serveur synchronisé, pas de calcul depuis un cache local incomplet.
- Les états invité/Free/serveur ancien/erreur/hors ligne restent lisibles. Résultats non persistés, retirés au changement de compte, fermeture, visibilité ou erreur. Revalidation au retour, aux événements d'historique et chaque minute visible avec résultat actif. Une réponse obsolète ne remplace ni résultat ni état de chargement plus récent.
- Les sources anciennes hors cache ouvrent le vrai journal via une lecture RLS limitée au propriétaire, sans alimenter le cache. Détail, correction et confirmation fermés dès le signal de changement de session, avant les attentes de profil/historique ; actions dérivées et réponses tardives liées au propriétaire et à la génération de session. Une source étrangère ne peut pas être enregistrée dans un nouvel historique invité. Les opérations normales du journal et les statistiques gratuites restent accessibles.
- Offre/générateur/FAQ/JSON-LD alignés : comparaisons supplémentaires, base gratuite, disponibilité conditionnée à la migration serveur. Expiration retire l'accès aux comparaisons sans enlever le journal ou les acquisitions permanentes.
- Calendriers hebdomadaires concernés corrigés : déplacement local par date, semaine au changement d'heure, même jour/heure locale pour référence partielle. Fenêtres glissantes et autres analyses hors périmètre.

## Vérification locale et revue

`pnpm run verify` final après corrections : 86 tests, zéro échec ; build public et audit réussis, 16 avertissements SEO préexistants. `PLAYWRIGHT_BROWSERS_PATH=/tmp/titan-playwright TITAN_QA_SCREENSHOTS=1 pnpm run test:e2e` : 35/35 après corrections (résultat vérifié avant le commit de livraison). Rendus du panneau 360/1280 px inspectés ; aucune largeur débordante. La barre de navigation fixe sur la capture longue mobile est un effet de capture ; le contenu reste défilable.

RED→GREEN : récap/fin de semaine DST et même heure locale (UTC/Paris/New York/São Paulo), RPC absent, droits serveur et 52 dimanches tardifs, sources hors cache/changement de compte, offre avancée auparavant absente, panneau auparavant absent, volume zéro et réponse ancienne qui terminait à tort le nouveau chargement.

La suite SQL dédiée passe sur PostgreSQL WASM jetable (PGlite 0.3.14, hors dépendances du dépôt), avec baseline et les treize migrations. Les binaires PostgreSQL natifs installés localement ne pouvaient pas créer un utilisateur système dans cet environnement ; aucune expérimentation sur Supabase. Le job natif de la première CI [37825389065](https://github.com/Theo25460/TITAN_V0.5/actions/runs/37825389065) passe les treize migrations individuelles, ainsi que le bundle historique avec quatre correctifs, et treize suites SQL par voie ; rollback appelant, refus de base non-test et deux scénarios concurrents sont également verts. Le moteur WASM ne charge pas pgcrypto, non utilisé par ce RPC : cette vérification n'est pas un substitut aux suites PostgreSQL natives des deux chemins en CI, obligatoires avant livraison.

## Migration et retour arrière

`supabase migration new advanced_comparisons_v300` a créé `supabase/migrations/20261008180429_advanced_comparisons_v300.sql`. Elle ajoute uniquement une fonction/permissions/commentaire ; aucun DDL de table, index ou mutation de données. Les index existants couvrent les lectures propriétaire/date et propriétaire/sport/date. Le client ancien ne l'utilise pas ; le client nouveau sans fonction affiche l'attente serveur. Retour arrière fonctionnel : client précédent, puis révocation de l'exécution de ce RPC si nécessaire après coordination. Ne pas revenir sur les migrations historiques ou les données.

Documentation primaire Supabase consultée : changelog courant, [fonctions](https://supabase.com/docs/guides/database/functions), [changements PostgreSQL](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes). Ce RPC n'utilise aucun des index ltree/btree_gist, chiffrements historiques pgcrypto ou opérateurs personnalisés concernés ; aucun audit global d'extension de production n'est prétendu.

## Limites et reprise

Ce lot livre une comparaison de pratique personnelle, pas une preuve de performance, un conseil d'entraînement ou une comparaison compétitive. PREM06 reste partiel (autres widgets/vues personnalisées), PREM07/PREM08 restent ouverts pour les rapports et le confort ; PREM11–15 ne sont pas validés par ce RPC. L'état billing vient du profil serveur existant : intégration paiement réelle, restauration/résiliation/refund et recette cible restent nécessaires avant déploiement. Pas de résultat Premium hors ligne ; historique gratuit préservé.

Une seule revue indépendante Sol 6.1 : aucun Critical, deux Important corrigés en une passe RED→GREEN, aucune seconde revue. I1 : résultats/détail anciens pendant adoption du compte avant la fin de pagination, et SIGNED_OUT sans invalidation ; signal synchrone d’identité, annulation des réponses et blocage pendant la transition. I2 : correction ouverte depuis une source perdant la garde du détail ; contexte propriétaire/génération transmis à correction et confirmation, actions et notifications tardives ignorées, défense de propriété dans TitanSessions.update. Quatre nouveaux scénarios navigateur et une régression de sauvegarde invité passent. Les deux attentes de clic fragiles de la première CI E2E utilisaient un bouton déjà désactivé par une revalidation légitime ; les tests de réponses différées déclenchent maintenant explicitement le retour de focus, sans forcer un clic désactivé.

PR [#26](https://github.com/Theo25460/TITAN_V0.5/pull/26) créée draft. Le passage prêt et la libération du périmètre sont conditionnés aux trois jobs verts sur la tête corrigée, dont les deux voies SQL ; la tête et le lien de cette CI finale seront consignés dans le cahier vivant et la description de PR après exécution. La première CI E2E rouge n’est pas une preuve de livraison. Le fichier avatar déjà modifié hors de ce lot reste exclu.

## Décisions de revue et coûts différés

| Constat ou partie non jugée | Décision et coût restant |
|---|---|
| Minor : RPC pouvant rester en attente | Différé : retrait/fermeture/changement de filtres restent utilisables ; un délai et une annulation automatiques pourront compléter le confort réseau. |
| Minor : validation client limitée aux types/bornes et structure | Différé : le RPC contrôle le calendrier/totaux ; ajouter les invariants croisés côté client réduira le risque d’un futur contrat serveur incohérent. |
| 1. Déploiement et rollback réel | Hors lot ; procédure préparée, coordination et recette production à faire avant publication. |
| 2. Main, états de PR et CI externe | Main préservé ; PR isolée, vérification effective des trois jobs exigée avant handoff, intégration ultérieure. |
| 3. PostgreSQL/Supabase global, extensions et deux voies natives | Deux voies de ce lot vérifiées par CI ; aucun audit global d’extensions ni certification d’un projet réel. |
| 4. Paiements, webhooks, restauration/résiliation/remboursement réel | Profil serveur vérifié ici ; orchestration billing et recette réelle restent un lot séparé. |
| 5. Android, prix, récompenses et progression | Hors lot, inchangés ; validations globales restent requises. |
| 6. Autres tableaux de bord, rapports et vues | PREM06 partiel et PREM07/PREM08 ouverts ; aucune livraison supplémentaire annoncée. |
| 7. Autres fenêtres glissantes/helpers | Seuls calendriers modifiés examinés ; audit du reste à conserver pour la recette globale. |
| 8. Avatar étranger au lot | Exclu et conservé sans mutation ni staging. |
| 9. Appareils physiques, lecteur d’écran réel et gros volumes | Structure sémantique et Chromium 360/1280 px vérifiés ; recette appareils/accessibilité et charge réelle différées avant production. |

Arbitrages courants Sol 6.1 ; audit global Astra maximal uniquement après intégration des lots. Aucun coût différé ci-dessus ne permet de marquer les paiements, la production ou Android comme validés.
