# Déploiement et reprise

## Sources de vérité

| Sujet | Source |
| --- | --- |
| Code publié | branche GitHub `main` |
| Entrée web | `index.html` |
| Build Netlify | `netlify.toml` et `tools/build-public.mjs` |
| Sortie générée | `dist/` — jamais committé |
| Fonction de paiement | `functions/webhook.mjs` via `netlify/functions/webhook.mts` |
| Ordre SQL | `PUBLIC_RELEASE_SQL_ORDER.md` |
| Vérification publique | `PUBLIC_RELEASE_QA_CHECKLIST.md` |
| Exploitation détaillée | `PUBLIC_RELEASE_RUNBOOK.md` |

L'application publique est [https://titan-app.fr](https://titan-app.fr). L'ouverture de cette URL ne garantit pas à elle seule que GitHub, Netlify et Supabase utilisent le même état ; comparer le commit déployé avant une intervention.

## Configuration Netlify

Netlify doit utiliser :

- commande de build : `node tools/build-public.mjs` ;
- dossier publié : `dist` ;
- fonctions : `netlify/functions` ;
- bundler : `esbuild`.

Variables serveur requises :

- `PADDLE_WEBHOOK_SECRET` ;
- `SUPABASE_URL` ;
- `SUPABASE_SECRET_KEY`, ou temporairement `SUPABASE_SERVICE_ROLE_KEY` ;
- `PADDLE_ELITE_PRODUCT_IDS` et/ou `PADDLE_ELITE_PRICE_IDS` fortement recommandées.

Copier uniquement les noms depuis `.env.example`. Les vraies valeurs restent dans le gestionnaire de secrets Netlify. Le dossier local `.netlify/` est généré et ignoré : il n'est jamais une source de vérité portable.

## Publication standard

1. Créer une branche et une pull request.
2. Exécuter `pnpm run verify` localement et attendre la CI GitHub verte.
3. Faire relire les changements sensibles : `js/state.js`, `js/main.js`, `sw.js`, `functions/`, `netlify.toml` et `sql/`.
4. Fusionner dans `main`.
5. Vérifier que Netlify construit le SHA fusionné et que le déploiement termine sans erreur.
6. Exécuter les smoke tests de `PUBLIC_RELEASE_QA_CHECKLIST.md` sur `titan-app.fr`.
7. Pour une modification PWA, tester une installation neuve puis une mise à jour depuis l'ancienne version.

## Supabase

Un push GitHub n'applique aucun fichier de `sql/`. Avant d'exécuter un script :

1. vérifier son état dans `PUBLIC_RELEASE_SQL_ORDER.md` ;
2. relire les rôles, RLS, grants, `SECURITY DEFINER` et `search_path` ;
3. sauvegarder la base avec une méthode approuvée ;
4. tester avec un compte standard, puis un compte admin si nécessaire ;
5. documenter le résultat et le rollback.

Ne jamais supposer qu'un fichier présent dans le dépôt est déjà actif en production.

## Retour arrière

- Front : redéployer dans Netlify le dernier commit validé, puis vérifier le cache PWA.
- Fonction : revenir au commit précédent et rejouer un événement Paddle de test signé dans un environnement sûr.
- Base : utiliser le rollback documenté pour le script concerné ; ne jamais restaurer ou supprimer des données sans cible et sauvegarde vérifiées.

Après un rollback, contrôler connexion, enregistrement d'une séance, Journal, Stats, entitlement TITAN+ et mise à jour du service worker.
