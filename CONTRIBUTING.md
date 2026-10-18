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

1. Lire le cahier et ses chantiers actifs ; choisir trois points cohérents et annoncer leur périmètre avant de modifier les sources. Au moins deux doivent fermer une exigence partielle ou avancer directement un gros bloc incomplet (RPG/progression, Android, intégrations, monétisation, conformité, sécurité structurante ou intégration finale). Un seul peut concerner une finition UX/accessibilité non bloquante, sauf défaut Critical/Important reproduit.
2. Partir de `main` ou du dernier checkpoint d’intégration vérifié. Si le lot dépend de PR non fusionnées, partir de leur tête exacte et déclarer ces dépendances ; ne pas recopier des fichiers à la main.
3. Créer une branche et un checkout isolés par macro-bloc : `codex/rpg-*`, `codex/android-*`, `codex/monetisation-*`, `codex/anticheat-*` ou `codex/web-*`. Un lot ne modifie pas les fichiers réservés à un autre chantier.
4. Faire des commits cohérents, ajouter les tests de régression utiles et lancer `pnpm verify`, puis les parcours concernés. Toute modification commune à plusieurs lots exige leur validation ensemble.
5. Ouvrir une PR vers sa dépendance, ou une PR de checkpoint vers `main` pour vérifier l’ensemble. Les PR sources restent ouvertes ; une PR de checkpoint n’autorise ni fusion ni déploiement.
6. Après **huit PR empilées au maximum** depuis le dernier checkpoint, arrêter l’empilage : reprendre les têtes nécessaires sur une branche isolée, résoudre les conflits éventuels et vérifier la cohérence de l’ensemble. Enregistrer têtes, arbre, base, commandes et limites dans un handoff.
7. Après deux PR d’une même famille de micro-améliorations, fermer l’exigence si ses critères sont satisfaits ou transférer les détails non bloquants dans [`docs/BACKLOG_FINITION.md`](docs/BACKLOG_FINITION.md), puis changer de macro-bloc. Un blocage fonctionnel/sécurité/données confirmé reste prioritaire.
8. Avant un déploiement, garder un checkpoint validé comme point de retour ; si une régression apparaît, revenir à la version connue plutôt que modifier des données pour masquer le défaut. Toute migration garde son propre plan de sauvegarde et de rollback.

Une phase est suffisamment stable quand ses parcours critiques et vérifications utiles passent et qu’aucun défaut important connu ne menace les données, comptes, paiements ou récompenses. Les limites de QA finale ne doivent pas relancer une boucle de polissage. La stratégie s’applique aussi aux branches Android, monétisation, RPG et anti-triche ; elle ne suppose pas que ces blocs sont déjà terminés.

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
