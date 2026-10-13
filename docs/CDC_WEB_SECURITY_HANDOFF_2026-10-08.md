# Handoff — sécurité web — 8 octobre 2026

PR : [#20](https://github.com/Theo25460/TITAN_V0.5/pull/20). Base : `e903ac3`. Branche : `codex/web-securite-cdc`, indépendante du lot navigation [#19](https://github.com/Theo25460/TITAN_V0.5/pull/19).

Source fonctionnelle : [cahier maître Titan](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M/edit), SEC01/SEC02/SEC03 et QA04. Le cahier conserve ses exigences ; seules les preuves, notes et statuts du chantier sont mis à jour.

## Résultat

Le helper privé `private.titan_card_settings_json(public.titan_public_cards)` héritait du `search_path` de l'appelant. Un objet SQL homonyme dans le banc de test pouvait remplacer le JSON canonique par un résultat forgé. La migration fixe le `search_path` à la chaîne vide ; les fonctions internes PostgreSQL restent résolues dans `pg_catalog`.

La correction est un seul `ALTER FUNCTION`. Elle conserve le corps, la signature, le mode invoker, la volatilité et les grants. Elle ne modifie aucune ligne utilisateur. Cette reproduction prouve un défaut de résolution SQL ; elle ne démontre pas qu'un utilisateur PostgREST peut créer le schéma hostile ou exploiter ce scénario par HTTP.

Migration créée avec Supabase CLI 2.120.0 : `supabase/migrations/20261008110220_web_security_contracts.sql`. **Préparée dans la PR, non appliquée en production.**

## Contrats vérifiés sur réplique

Les nouvelles suites utilisent des identités synthétiques, de vrais rôles `authenticated` et `anon`, des claims JWT et des transactions annulées. Les fixtures de B contiennent effectivement une séance, un objectif, un achat et un inventaire historique ; leur exclusion n'est donc pas un test sur des tables vides.

| Contrat | Preuve |
| --- | --- |
| Isolation A/B | Profil, séances, objectifs, achats et inventaire de B invisibles à A ; mutations directes sans effet ; RPC d'édition/archive d'autrui refusées. |
| Export propriétaire | Identité du profil et export des collections peuplées de B ; exclusion de ces mêmes collections pour A. |
| Objectifs | Création chez autrui et transfert de propriétaire refusés ; édition autorisée avec révision incrémentée. |
| Autorité serveur | Sauvegarde client de crédits, XP, niveau, Premium, inventaire et privilèges ignorée ; préférences autorisées conservées. |
| Validation | Version périmée, objets/types invalides, état trop volumineux et patch de champs protégés refusés. |
| Anciennes RPC | Combat aux paramètres extrêmes sans récompense ; réconciliation falsifiée signalée sans modifier crédits, XP, niveau, Premium ou inventaire. |
| Parcours valides | Séance et récompenses calculées côté serveur ; édition et archive propres fonctionnelles. |
| Accès restreint | Métadonnées de signup et claims client sans autorité admin ; sauvegarde/séance suspendues et appels anonymes sensibles refusés. |
| Sérialisation carte | Schéma homonyme temporaire sans effet sur slug, activation et tous les flags de visibilité. |

## Vérification et relecture

- [CI avant correction, 37768052478](https://github.com/Theo25460/TITAN_V0.5/actions/runs/37768052478) : les suites existantes et l'isolation passent ; le test de `search_path` échoue sur le JSON forgé, comme attendu.
- [CI après correction, 37768637113](https://github.com/Theo25460/TITAN_V0.5/actions/runs/37768637113), commit `192bd4caae45e92281c840d4a902f183cc77334c` : trois jobs verts, 60 tests unitaires, 6 parcours Playwright, 10 migrations et 8 suites SQL.
- Vérification locale : `pnpm run verify`, 60/60 tests, syntaxe et build ; `pnpm run test:e2e`, 6/6 ; `git diff --check`.
- Relecture indépendante : aucun défaut critique ou important. Deux améliorations mineures intégrées : export positif/inventaire et préservation du niveau pour combat/réconciliation. Les checks GitHub de la tête finale vérifient ces assertions supplémentaires.

Les 8 suites SQL sont atelier, progression, carte publique, rétention, lockdown, social, isolation utilisateur et `search_path`. Elles sont rejouées par `tools/db/test-migrations.sh`, sur un PostgreSQL éphémère sans données de production, à partir du snapshot de structure du dépôt et des migrations en attente. Le shim Auth reproduit les rôles et les claims utiles aux tests ; ce n'est pas une instance complète de Supabase Auth/PostgREST. La CI utilise PostgreSQL 16, le projet connecté PostgreSQL 17.6 : les catalogues sensibles ont été inspectés, mais le banc ne prouve pas une équivalence exhaustive de production.

Ce lot ne contient pas les modifications de navigation de #19, d'où 60/6 ici contre 71/10 sur cette autre branche. Les deux PR doivent conserver leurs contrôles lors de leur intégration.

## Lecture du catalogue de production

Inspection limitée aux migrations, fonctions, grants, policies et advisors ; aucune donnée individuelle lue, aucun DDL/DML exécuté.

- Les tables ordinaires des schémas applicatifs `public`/`private` inspectées ont RLS activé ; aucune vue exposée sans politique n'a été trouvée dans ce relevé.
- Les lectures de profils, séances et inventaires sont liées au propriétaire, avec exceptions explicites de modération pour les tables concernées. L'export et les RPC examinées bornent l'utilisateur avec `auth.uid()`.
- Les écritures directes de l'économie sont restreintes ; les objectifs combinent policies et gardes sur le propriétaire. Les anciennes RPC combat/réconciliation ne permettent pas de fabriquer des récompenses.
- L'advisor 0011 sur le helper de carte correspond au défaut reproduit. Il restera visible en production tant que la migration ne sera pas appliquée.

## Limites et suite

**QA04** peut être marqué terminé pour l'ajout et l'exécution de ces tests d'accès croisé. **SEC01, SEC02 et SEC03 restent partiels** : les cas listés sont vérifiés, pas l'ensemble des endpoints, records, sanctions, surfaces admin et paramètres Auth.

La protection contre les mots de passe compromis reste désactivée dans le relevé Auth. Son activation demande un chantier de configuration distinct : [documentation Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Aucun réglage n'a été changé ici.

Les warnings de fonctions accessibles et de tables sans policy ne justifient pas une suppression automatique de droits : la carte publique anonyme est volontaire et certaines tables sont réservées aux RPC. Poursuivre une revue par garde et cas métier, avec preuve adverse et parcours positif pour chaque correction.

Avant application : vérifier la définition et les migrations de la cible, ne pas rejouer le snapshot sur la production, puis intégrer et appliquer uniquement via le processus de release du dépôt. Refaire les contrôles de carte publique et l'advisor après application.

Retour arrière du seul réglage :

```sql
alter function private.titan_card_settings_json(public.titan_public_cards) reset search_path;
```

Cela rétablit le contexte hérité et donc le défaut reproduit ; aucune restauration de données n'est nécessaire. Le lot n'a modifié ni Android/Play Console, ni paiement, ni UI, ni configuration ou données de production. Le périmètre est libéré après la remise finale dans le cahier maître ; le chantier Titan global reste ouvert.
