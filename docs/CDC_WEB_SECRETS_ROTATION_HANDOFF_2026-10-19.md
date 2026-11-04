# Handoff — rotation des secrets et historique git (SEC08, SEC07, A03)

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `5a529d6`. Aucune fusion, aucun déploiement, aucune rotation réelle, aucune valeur de secret lue ou affichée, aucun accès aux gestionnaires de secrets.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| SEC08 — prévoir la rotation des clés/secrets | `[x]` pour le plan, avec réserve | `docs/SECRETS_ROTATION_PLAN.md` : inventaire des secrets réellement utilisés (clé de rôle serveur Supabase, secret webhook Paddle, clé e-mail Resend, signature Android, mot de passe de base, secret JWT, jeton de déploiement), impact d'une compromission, procédure sans coupure (créer, poser, redéployer, vérifier, révoquer), déclencheurs et calendrier proposé. Aucune rotation n'est nécessaire à ce jour : aucune exposition détectée. Réserve : les valeurs posées chez Netlify/GitHub/fournisseurs n'ont pas été vérifiées. |
| SEC07 — pas de secret dans le bundle, le frontend ou les variables publiques | reste `[x]` | Nouvel outil `node tools/scan-git-history.mjs` (`pnpm run history-scan`) : toutes les versions de tous les fichiers sous tous leurs chemins, toutes branches (1727 contenus texte distincts) avec les règles du contrôle de publication. Résultat : 0 secret serveur ; 21 valeurs factices citées par `tests/`. |
| A03 — identifier secrets, clés API et variables d'environnement | reste `[x]` | Inventaire complet relevé dans le code (`functions/*.mjs`, workflows, outils) : voir §2 du plan. |

## Outil

`tools/lib/history-scan.mjs` (logique) et `tools/scan-git-history.mjs` (commande) : lecture seule, échoue fermé hors dépôt git (code 2), code 1 si un secret serveur est trouvé hors `docs/` et `tests/` (message : fichier, ligne, type, premier commit, jamais la valeur), les citations dans `docs/` et `tests/` sont listées sans faire échouer. `tests/git-history-scan.test.mjs` (6 tests, dans `pnpm test`) : secret supprimé de l'arbre mais présent dans l'historique, secret sur une autre branche, historique propre, citation en documentation, hors dépôt, clone superficiel refusé, même contenu sous plusieurs chemins (déplacé dans `tests/` puis ré-ajouté : tous les chemins listés, **premier** commit rapporté), valeur jamais affichée. Mutations détectées : historique limité à `HEAD`, exemption de tout fichier, commit le plus récent au lieu du premier, renommages mal lus.

## Vérifications

Revue de code unique : 5 remarques sur l'outil, toutes traitées — la plus importante : un même contenu présent sous plusieurs chemins n'était attribué qu'à un seul (fuite masquée par une copie dans `tests/`), et le premier commit rapporté était en fait le dernier. L'outil échoue maintenant fermé (code 2) sur un clone superficiel, un objet manquant ou un fichier texte de plus de 5 Mo, lit les contenus avec un seul `git cat-file --batch`. Remarques sur le plan (variable de repli Supabase propre au webhook, assistance qui exige aussi la clé publique, absence de jeton Netlify stocké, limites d'un événement Paddle de bac à sable) corrigées. `pnpm run verify` : voir clôture.

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert.

## NON BLOQUANT / BACKLOG FINITION

- L'outil n'est **pas** branché sur `pnpm run verify` ni la CI (8 secondes, dépend de l'historique complet ; une clone superficielle de CI donnerait une fausse assurance). À décider : étape de CI avec `fetch-depth: 0`.
- Formes de secrets connues seulement ; pas de recherche des fichiers supprimés non référencés (objets orphelins) ni d'un ancien dépôt.
- Valeurs réelles chez Netlify, GitHub et les fournisseurs non vérifiées ; calendrier de rotation à valider par une personne ; clé de signature Android dépend de Q-001.
- `package.json` : un script et un fichier de test ajoutés (conflit trivial possible avec le checkpoint d'intégration).

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

Décisions humaines : CHEAT14/15 (moment d'exclusion), Q-001, Q-002. Sans collision : CHEAT16/17 (limites de débit sur les points d'entrée sensibles) ou monétisation après décision sur les gains.

## Retour arrière

Supprimer `tools/lib/history-scan.mjs`, `tools/scan-git-history.mjs`, `tests/git-history-scan.test.mjs`, `docs/SECRETS_ROTATION_PLAN.md`, retirer le script `history-scan` et le fichier de test de `package.json`. Aucune donnée concernée.
