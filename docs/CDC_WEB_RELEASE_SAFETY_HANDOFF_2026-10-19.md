# Handoff — contrôles de publication (SEC07, SEC09, QA14)

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `f93841b75b807b2d93d3f8def6791c4f6427ca9a`. Aucune fusion, aucun déploiement, aucune migration, aucune donnée réelle. Aucun fichier du produit, du SQL, du service worker ni du manifeste Android modifié. Transparence : le code a été commencé avant la déclaration du chantier dans le cahier (oubli de l'ordre) ; il est resté local jusqu'à la déclaration.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| SEC07 — pas de secret dans le bundle Android, le frontend ou les variables publiques | `[x]` | `pnpm run verify` échoue si un secret serveur apparaît dans un fichier suivi par git ou dans `dist/` : clé de rôle service (JWT décodé, jamais l'anon), `sb_secret_`, clé privée, clé ou secret Paddle, clé AWS/GitHub/Slack/Stripe, mot de passe de base de données, secret serveur ou mot de passe de keystore affecté à une valeur littérale (noms entre guillemets, valeurs sans guillemets, options de ligne de commande). Résultat sur le dépôt : 0 secret dans 708 fichiers et dans `dist/`. Un projet Android n'embarque que `android/twa-manifest.json`, sans mot de passe. |
| SEC09 — permissions Android au strict nécessaire | `[~]` | Le manifeste est verrouillé : notifications désactivées, aucune fonction (localisation, facturation), pas de dépendance alpha, domaines de confiance limités à `titan-app.fr`, clé de signature hors du dépôt. La liste réelle des permissions de l'`AndroidManifest.xml` généré par Bubblewrap n'a **pas** été inspectée : le workflow n'a jamais tourné ici (pas de SDK). À vérifier au premier build. |
| QA14 — aucun placeholder, clé de test, faux prix ou contenu de démonstration | `[~]` | Le contrôle détecte les identifiants publicitaires de test Google, les identifiants d'éditeur publicitaire quand `adsEnabled` est faux (lu dans `js/config.js`), les jetons de paiement bac à sable, « lorem ipsum » et les valeurs à remplacer. Résultat : 0 occurrence dans les fichiers livrés. Non couvert : faux prix et contenus de démonstration en langage naturel, qui demandent une relecture humaine. |

## Fonctionnement

- `tools/lib/release-safety.mjs` (détection, testée) et `tools/check-release-safety.mjs` (commande), branchés sur `pnpm run verify` (donc la CI) via `pnpm run release-check`, avec les 8 tests de `tests/release-safety.test.mjs` dans `pnpm test`.
- Échoue fermé : checkout git absent, `android/` sans manifeste, fichier non lisible comme texte ou trop gros (hors formats binaires connus : images, polices, médias, archives) ⇒ échec explicite. Le message ne répète jamais le secret (fichier, ligne et type seulement).
- Fichiers de signature (`.keystore`, `.jks`, `.aab`, `.apk`, `.p12`, `.pfx`, `.p8`, `.pem`, `.key`, leurs sauvegardes) et fichiers d'environnement (hors `.example`, `.sample`, `.template`) : refusés s'ils sont suivis ; `.gitignore` doit ignorer keystore, bundle, apk et `.env` (règles équivalentes acceptées, évaluées comme git).
- Exemptions documentées : `tests/` et `docs/` (qui citent de faux secrets) pour la recherche de secrets ; exemples contenant `[...]`, `<...>` ou `...` ; références `${...}`, `$VAR`, `process.env`.

## Vérifications

- 8 tests : positifs et négatifs pour chaque famille, la commande dans des dépôts temporaires (propre, fuite, sans git, android sans manifeste, fichier opaque, image, publicité activée ou non, identifiant de test). Les quatre tests de durcissement échouent contre la première version et passent avec la version finale.
- Injection volontaire sur le vrai dépôt (clé de rôle service, notifications Android, localisation, identifiant publicitaire de test) : quatre échecs signalés, fichiers restaurés.
- `pnpm run verify` : 227/227 tests, build et audit sans erreur (16 avertissements préexistants), contrôle de publication OK. Aucun parcours navigateur modifié.
- Une revue de code unique : 10 remarques, toutes traitées (valeurs entre guillemets et sans guillemets, échec fermé, fichiers ignorés, mots de passe en ligne de commande, règles `.gitignore` équivalentes, autres types de fichiers secrets, parsing des origines, activation des publicités, manifeste absent, message de succès exact).

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert. Rappels : `profile.html` charge encore `training-store.js?v=300.0` ; le test `assistance labels` de `smoke.e2e.mjs` est instable (hors de ce lot).

## NON BLOQUANT / BACKLOG FINITION

- Vérifier les permissions de l'`AndroidManifest.xml` généré au premier build du workflow (ajouter alors un contrôle sur ce fichier).
- L'identité du paquet reste `fr.titanapp.twa` dans le dépôt contre `fr.titanapp.app` revendiqué côté Play Console (Q-001) : non tranché ici.
- Le contrôle cherche des formes connues de secrets : il ne remplace pas la rotation (SEC08) ni une analyse de l'historique git, non faite ici.
- Les variables d'environnement Netlify (hors dépôt) ne sont pas lues.

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

SEC08 (plan de rotation des clés, documentaire) peut suivre ; sinon CHEAT12/CHEAT13, Android après réponse à Q-001, ou monétisation. RPG réservé à Codex.

## Retour arrière

Retirer `release-check` du script `verify` et `tests/release-safety.test.mjs` du script `test` dans `package.json`, puis supprimer `tools/lib/release-safety.mjs`, `tools/check-release-safety.mjs` et `tests/release-safety.test.mjs`. Aucune donnée ni produit concerné.
