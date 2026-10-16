# Handoff — contrat serveur des insertions analytics

Branche `codex/web-analytics-server-cdc`, suite de la PR #33 ouverte/non fusionnée. Base locale `79875d53fbb32b601d35ef9688b1d1a4dacc7e27`, parent publié `33b4afb2108a6188120eab0cbe36f5c66445532c`, même arbre parent `8c895bc9118c741453ddb885a76dbfcd7953cc40`. Unique revue indépendante du code `cb96f794ccd913f3924ed7ce754df3d5580df6f4` ; seul ajout ultérieur : ce handoff.

## Résultat

La policy historique acceptait tout nom et payload si le compte était nul ou propre à l'appelant. La migration préparée `20261010163122_analytics_payload_contract_v300.sql` ajoute une policy INSERT restrictive pour `anon` et `authenticated`. Les vingt-deux noms du collecteur, l'objet JSON v300/consent et les propriétés bornées deviennent un contrat serveur. Le pathname doit commencer par `/`, sans query, fragment ou caractère de contrôle ; référent nul et source limitée. Analyses et contenu public gardent leurs payloads minimaux. Les entiers JSON `12` et `12.0` sont équivalents, sans arrondir une fraction.

Le prédicat privé est pur, immutable, invoker, avec `search_path = pg_catalog` ; aucun accès aux tables, SQL dynamique ou droit de lecture ajouté. EXECUTE accordé aux deux rôles API, retiré de PUBLIC ; aucun nouveau USAGE sur le schéma privé. La policy vérifie indépendamment que `user_id` correspond à `auth.uid()`, même si une future policy permissive accepte tout. Une déclaration `anonymous` exige une requête sans UID authentifié. L'accord sans session reste valide avec une identité nulle ; avec session, l'identité doit être celle de l'appelant.

La migration ne lit ni ne réécrit l'historique ; elle n'ajoute pas de CHECK rétroactif. Ownership permissif existant, SELECT admin, colonnes, grants métier, SDK, collecteur et frontend restent inchangés. Le runner conserve sa transaction ; réapplication de la policy atomique dans son bloc DO.

## Preuves et revue

- RED réel avant correction : 35 payloads anon et cinq authenticated acceptés à tort. La branche locale isolant les essais authenticated saute uniquement le premier bloc anon déjà rouge. Un entier JSON représenté avec décimales a ensuite reproduit un refus injustifié ; `trim_scale` corrige sa représentation sans arrondir les fractions.
- PGlite final : suite analytics de rôles existante ; 68 lignes acceptées couvrant les vingt-deux noms, types et bornes ; 39 cas anon et six authenticated refusés. SQL réellement exécuté sous les rôles API ; utilisateurs synthétiques et transactions annulées.
- Réapplication du vrai fichier de migration deux fois, conservation exacte d'une ligne historique incompatible, paramètres et marqueur de transaction caller, policy permissive supplémentaire, retrait des deux nouveaux objets et rollback de test vérifiés sur la réplique mémoire.
- Limites du harness : bootstrap sans l'extension pgcrypto non supportée ; garde du nom de base native retirée seulement dans le harness, car PGlite expose `template1`. Le fichier psql publié conserve sa garde `titan_test_*`. Le compteur précédant BEGIN est envoyé séparément, comme psql ; un premier batch unique le faisait annuler involontairement. Correction du harness, aucun changement du test SQL pour masquer cet échec.
- Vérification finale locale : `pnpm run verify` 136/136, build/audit sans erreur, seize avertissements SEO préexistants ; `git diff --check` réussi. Aucun nouveau code frontend ; les 92 parcours navigateur seront rejoués par la CI, sans les revendiquer comme exécutés localement sur ce HEAD.
- CLI Supabase 2.120.0 : fichier créé avec `migration new`. Advisors `--local` essayé, connexion 54322 refusée faute de Supabase native locale. Aucun advisor distant appelé et aucun résultat de sécurité global revendiqué.
- Unique revue indépendante GPT-6.1 Sol, effort high, sur `79875d53..cb96f794` : aucun Critical, Important ou Minor nécessitant une modification. Le reviewer a rejoué le harness avec succès et inspecté les résultats 136/136 ; il n'a pas relancé le build. Aucun changement de production après cette revue et aucune seconde revue.
- Publication conditionnée aux trois jobs verts sur le HEAD GitHub final : 136 tests, 92 E2E et deux voies PostgreSQL 16 sur répliques vides, migrations individuelles ou bundle historique + correctifs. Les dix-huit suites SQL par voie incluent les deux nouveaux fichiers ; la garde de nom et les contrats concurrents doivent être lus dans leurs logs natifs. SHA, arbre, PR et CI finale sont consignés dans la PR de cette branche et le [cahier](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M).

## Huit sujets écartés : décisions de l'exécuteur

1. Preuve de préférence navigateur : limite acceptée et documentée. Le serveur valide une déclaration ; un client fabriqué peut affirmer `granted`. Aucun registre durable de consentement ajouté dans ce lot. DATA09 reste partiel.
2. Action, paiement ou droit réel : les analytics ne constituent pas une preuve métier, comptable ou d'autorisation. Aucune modification de prix, Premium, reward ou paiement ; recette réelle encore ouverte.
3. Owner/service/BYPASSRLS : contrat limité aux deux rôles API. Les écritures privilégiées restent distinctes ; aucun durcissement global inventé ni privilège élargi.
4. Limitation de débit, déduplication entre appareils, acquittements perdus et rétention : comportements inchangés, suivis séparés. Un payload valide peut être fabriqué ou dupliqué. Aucune garantie globale exactement-une-fois ni nouveau ledger.
5. Vieux CMS brut et requête anonyme avec JWT de compte : refus intentionnel. Déployer le collecteur actualisé de la PR #33 avant cette migration ; anciens onglets ou clients doivent être pris en compte lors de la recette de rollout. Aucun historique revalidé.
6. Déploiement, sauvegarde/restauration réelles et advisors distants : restent à vérifier avant application réelle. Aucun service de production contacté par les tests et aucune migration réelle appliquée.
7. CI native complète, concurrence et navigateur : gate de publication conservée ; succès local PGlite insuffisant pour les conclure. Lire les trois logs du HEAD final avant de rendre la PR prête et de libérer le claim.
8. Trois PNG étrangers : exclus du patch et de la revue, préservés. Avatar_1 `6c86828561cda015dcac2cb9f2b95486fb080083826474def604c1093a52029b`, avatar_2 `591984a1f7a7722bf0ec9d3d3d33c32e067f85598d5373d60ef0f71f68ac2581`, mob_9 `d4e744f9bffa0430cce91e44207d023fc34b0d0f4052e27b9e85063e48838c2f`.

Aucun finding bloquant reporté. Contrat détaillé : [ANALYTICS_EVENTS_V300.md](ANALYTICS_EVENTS_V300.md).

## Rollout, retour arrière et reprise

Appliquer uniquement après le collecteur actuel et les migrations antérieures, avec sauvegarde et restauration réelles vérifiées. Retour arrière opérationnel testé : retirer `analytics_events_contract_insert_v300`, puis `private.titan_analytics_payload_valid_v300(text,text,text,text,jsonb)` ; la policy d'ownership et SELECT admin restent en place, lignes conservées. Ce retrait rétablit aussi l'ancienne validation permissive ; il ne constitue pas une garantie de confidentialité.

257 formulations conservées : 29[x], 21[~], 207[ ]. DATA07/DATA09 restent [~], DATA08 [ ]. Les autres surfaces publiques, contrats natifs et dashboard restent ouverts. WORK Play Console intact. Claim Codex à libérer après lecture de la CI finale ; aucune fusion, déploiement ou opération Android/Play Console. Reprendre les exigences ouvertes : le CDC global n'est pas terminé.
