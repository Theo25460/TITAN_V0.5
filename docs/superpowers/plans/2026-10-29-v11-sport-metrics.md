# V1.1 — métriques et formulaires sportifs

**Objectif :** avancer V11-09R et REC-07 suivant les décisions déjà validées du cahier Google Docs, onglet V1.1 (29/10/2026), sans publication.

**Architecture :** catalogue de métriques versionné partagé entre l'instantané hors ligne et une migration additive préparée. Conserver les identifiants historiques et les champs avancés ; aucune modification du calcul de progression. Le catalogue effectif lu en production comporte 260 sports. Les protections courantes sont conservées ; les audits globaux FIN-CHEAT/SEC/SEO restent différés.

**Exécution :** directe dans une branche isolée `codex/v11-sport-metrics-20261029`, dérivée de la branche V1.1 `claude/titan-cahier-charges-0k7cdn`. Aucun changement de main, production, secrets ou travaux Android concurrents.

## Lots

- [x] Tester puis compléter les métriques des 260 sports avec des associations explicites par discipline, des unités, bornes et priorités ; produire la matrice et un contrôle reproductible de couverture.
- [x] Rendre les champs disponibles hors ligne et sur les formulaires spécialisés ; supprimer la limite qui masque définitivement les détails au-delà de huit champs. Garder les données absentes absentes.
- [x] Vérifier des parcours réels avec le catalogue généré (sans injection de faux champs), les conditions, les anciennes séances, la sauvegarde et les petits écrans.
- [x] Préparer et tester la migration du catalogue sur base jetable ; lancer les contrôles web, documenter les limites et ouvrir une PR de continuation.

## Points de revue

Catalogue serveur antérieur, champs conditionnels, absence de capteurs, variantes de sports de précision/aquatiques, plus de onze métriques, absence d'écriture production. La couverture des schémas web ne vaut pas validation des 260 sports par des athlètes ni recette Android réelle.

## Résultat

376 tests unitaires et 28 parcours navigateur ciblés verts, dont les 260 formulaires à 360 px. SQL vérifié sur PostgreSQL/PGlite (catalogue, RPC réelle, permissions, révision, ancien schéma et idempotence) ; le banc natif complet reste à exécuter en intégration. Revue indépendante : validation serveur et catalogue de secours corrigés ; tests rouges puis verts. Android et production non modifiés. Bilan détaillé : docs/V11_SPORT_METRICS_HANDOFF_2026-10-29.md.
