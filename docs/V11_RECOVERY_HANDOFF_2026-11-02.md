# TITAN V1.1 — Reprise GitHub du 2 novembre 2026

## Rôle de cette branche

Branche de récupération **non déployée**, créée pour vérifier puis rétablir l'écriture GitHub après le blocage signalé lors de la tentative de sauvegarde de la candidate locale `codex/v11-completion-20261102`.

**Point de départ vérifié :** `codex/v11-coach-workspace-20261031`, SHA `20345891eb90f6580a7c5241dd56a96d2e78eb45` (PR #124). Cette branche ne prétend pas inclure la candidate locale `a0ee9c4` du 02/11, qui n'est pas visible sur GitHub.

## Sources à récupérer avant intégration finale

- Chaîne de travaux web V1.1 : PR #118, #119, #120, #121, #122, #123, #124.
- Android natif : PR #116, tête connue `72fb3948f73021f6f04397ee63bf621258a6eeda`.
- Travaux communautaires Claude et candidate locale mentionnés dans le cahier des charges TITAN : retrouver leurs branches et vérifier les SHA avant intégration.
- Cahier des charges vivant dans Google Drive : la section « REPRISE DU 2 NOVEMBRE 2026 — CANDIDATE LOCALE, NON PUBLIÉE » décrit la candidate `codex/v11-completion-20261102` et les tests effectués localement.

## État de récupération

- Branche distante de reprise créée par le connecteur GitHub.
- Une écriture de ce fichier constitue un test réel du droit d'écriture sur la branche isolée.
- **Non récupéré par ce seul commit :** les ajouts locaux Santé Connect, tutoriel Android, formulaire de retour d'expérience et l'intégration complète du commit local `a0ee9c4`.
- Les tests décrits dans le cahier des charges portent sur la candidate locale, pas sur cette branche distante.

## Garde-fous

1. Ne pas fusionner dans `main` ni modifier la V1 publiée sans autorisation.
2. Ne pas publier sur Netlify, ni appliquer de migration Supabase production, ni publier sur Google Play sans feu vert explicite.
3. Ne jamais placer de secrets, de tokens ou de clés privées dans GitHub.
4. Réintégrer les sources par étapes, résoudre les conflits, exécuter les tests puis préparer une PR V1.1 unique.
5. Conserver les branches sources existantes et séparer « codé », « testé », « intégré » et « publié ».

## Prochaine étape de développement

Récupérer la candidate locale `a0ee9c4` depuis l'environnement de l'agent qui l'a produite si elle existe encore, ou reconstituer ses différences à partir des sources GitHub. Ne pas affirmer sa présence sur cette branche avant vérification.
