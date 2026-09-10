# Contribuer à TITAN OS Sport

## Mise en route

Prérequis : Node.js 22 ou plus récent et pnpm 11.19.0.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Le serveur source écoute par défaut sur `http://127.0.0.1:8080`. Pour tester exactement le contenu publié :

```bash
pnpm run build
pnpm run preview
```

Le dossier `dist/` est généré. Il ne doit jamais être édité ni committé.

## Flux de contribution

1. Partir de `main` à jour et créer une branche courte.
2. Modifier les sources à la racine, dans `js/`, `css/`, `image/`, `functions/` ou `sql/`.
3. Ajouter un test de régression pour toute correction de logique.
4. Exécuter `pnpm run verify`.
5. Ouvrir une pull request en expliquant le risque et le retour arrière.

Les scripts navigateur utilisent des variables globales. Préserver l'ordre de chargement documenté dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Une modification de `js/config.js`, `js/state.js`, `js/main.js`, `js/ui.js`, du service worker ou d'une page à script inline exige une vérification des cinq écrans principaux.

## Règles de sécurité

- Ne jamais committer `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PADDLE_WEBHOOK_SECRET`, `SUPABASE_DB_URL`, un cookie ou un export de données.
- Les identifiants navigateur de `js/config.js` sont publics par nature. Ils ne remplacent jamais RLS, les autorisations RPC et les contrôles serveur.
- Toute récompense, permission admin ou entitlement payant doit être décidé côté serveur.
- Toute donnée utilisateur insérée dans du HTML doit être échappée.
- Un changement SQL doit préciser RLS, rôles, `search_path`, ordre d'application et stratégie de retour arrière.

## Commandes de maintenance

| Commande | Rôle |
| --- | --- |
| `pnpm dev` | Sert les sources localement, sans émuler Netlify. |
| `pnpm test` | Parse les scripts, vérifie les assets et lance les tests Node. |
| `pnpm run build` | Reconstruit `dist/`. |
| `pnpm run preview` | Sert le dernier `dist/` sur le port 4173. |
| `pnpm run audit` | Audite le build local. Ne pas confondre avec `pnpm audit`. |
| `pnpm run verify` | Lance la validation complète utilisée par la CI. |
| `pnpm relaunch` | Réécrit de nombreuses pages et le SEO ; utiliser seulement sur une branche dédiée et relire tout le diff. |

Pour une modification visuelle, vérifier au minimum mobile et bureau, la navigation au clavier, le zoom, les textes alternatifs et l'installation PWA.
