# TITAN · Registre de consolidation GitHub

Relevé du 16 novembre 2026 sur `Theo25460/TITAN_V0.5` : **140 branches**, **46 pull requests ouvertes**, aucun tag.
Référence du produit : la branche `claude/youthful-knuth-pgg96r` (PR #149), qui contient `main`, la PR #148, TITAN LIVE et
les fonctions Android. Ce registre évite de refaire la recherche : il se régénère avec

```bash
git fetch --unshallow origin '+refs/heads/*:refs/remotes/origin/*'   # un clone partiel masque l'historique commun
python3 tools/github/branch-inventory.py inventaire.json
```

**Méthode.** Les fusions par écrasement rendent l'ascendance des commits trompeuse ici. L'outil compare donc les contenus : pour
chaque fichier modifié par une branche depuis son point de départ, la version de la branche est soit *identique* à celle de la
référence (intégrée), soit une *ancienne version* de ce fichier dans l'historique de la référence (remplacée), soit *unique*
(jamais passée sur la ligne de référence : contribution à examiner). Une branche sans fichier unique n'a plus rien à récupérer.

## 1. Résultat d'ensemble

| Catégorie | Branches | Décision |
|---|---|---|
| Tête déjà ancêtre de la référence (dont 124 déjà dans `main`) | 128 | Déjà intégré. Conservées comme archives. |
| Contenu identique ou plus ancien que la référence | 6 | Remplacé. Conservées comme archives. |
| Contenu unique | 6 | Voir § 2. |

Aucune branche n'a été supprimée. Aucune ancienne version n'a été réintroduite : seules les deux branches actives du
16 novembre ont été fusionnées, et leurs conflits tranchés en faveur de l'état le plus récent et le plus sûr.

## 2. Travaux à contenu unique

| Origine | Contenu | État dans le produit | Décision | Justification | Reprise | Tests |
|---|---|---|---|---|---|---|
| `claude/titan-rpg-multisport-larhou` (6 commits) | TITAN LIVE : moteur partagé, 20 Voies, matrice des 260 sports, séance en direct Android et Web derrière `screens.live`, règlement serveur | Intégré | **Intégré** | Fonction signature, complète et testée ; additive | `faae973` | `tests/live-*.test.mjs` (39), `tests/e2e/live-web.e2e.mjs`, `mobile/__tests__/live.test.tsx`, `sql/tests/300_live_rpg.sql` |
| `ccr-dfa5e93f-je1kju` (35 commits) | Découverte sans compte, quêtes et événements sur téléphone, défi ouvert par lien, TITAN Rétro, image de séance 9:16, semaine tenue, lettres à soi-même, import d'historique Strava, chronique de guilde, chapitres de vie, annonces vocales, raccourcis, lots habitudes et communauté | Intégré | **Intégré, adapté** | Valeur d'usage quotidienne ; quatre désaccords avec la V1.3.1 tranchés (QG, offres, onglet Séance, textes de l'Aventure) | `56bf2da` | 924 tests Jest (103 suites), 7 tests SQL `300_*`, contrôles de production vrais sur réplique |
| `design/titan-illustrations-global-v2-20261113` (PR #147, 667 fichiers `design/`) | 4 blasons approuvés ; 153 propositions : médaillons de récompenses, paliers, états, balises, alternatives photographiques des mondes | Les 4 blasons approuvés sont intégrés (Web et Android) | **Conserver comme propositions** | Médaillons : icône vectorielle simple dans un anneau, en dessous du niveau des blasons sculptés. Mondes photographiques : qualité réelle, mais remplacent l'art actuel et leur licence reste à établir : décision de direction artistique du propriétaire | — | Contrôle `render` de la bibliothèque |
| `design/titan-sports-library-consolidation-20261112` (179 fichiers `design/`) | Consolidation de la bibliothèque des pictogrammes de sport | Lots 01 et 02 approuvés déjà dans `main` (#143 à #145) ; pictogrammes par famille de sport dans l'application via `ccr-…` | **Conserver comme archive de travail** | Fichiers de bibliothèque, pas de code produit ; rien d'approuvé n'y manque à l'application | — | — |
| `fix/v1-profile-conflict-storm-20261102` (PR #129) | Correctif V1 des boucles de sauvegarde du profil | Remplacé par la variante V1.1 (`fix/v11-profile-conflict-storm-20261102`, dans `main`) | **Déjà intégré (variante plus récente)** | Les 32 identifiants ajoutés par le correctif existent dans `js/state.js` ; 25 tests de synchronisation contre 19 dans la branche | — | `tests/profile-sync-backoff.test.mjs` |
| `codex/v11-google-oauth-20261102`, `codex/v11-integration-recovery-20261102`, `claude/gracious-turing-57vfqi` | Première connexion Google Android ; note de reprise ; ancienne recette en ligne | Remplacés par `mobile/src/lib/googleAuth.ts` (PKCE, 3 commits ultérieurs), `docs/v131/`, `audit-live.yml` et `probe-prod.yml` | **Abandonner (archives)** | Implémentations antérieures à celles en service | — | `googleAuth.test.tsx` |

## 3. Pull requests ouvertes (46)

| PR | Tête | État | Décision |
|---|---|---|---|
| #149 | `claude/youthful-knuth-pgg96r` | Référence ; contient #148, TITAN LIVE et les fonctions Android | À fusionner dans `main` par le propriétaire |
| #148 | `claude/titan-v131-finalization-9g6jjo` | Entièrement contenue dans #149 | À fermer à la fusion de #149 (ne pas fusionner deux fois) |
| #147 | `design/titan-illustrations-global-v2-20261113` | Propositions graphiques | Laisser ouverte en brouillon jusqu'à décision de direction artistique |
| #129 | `fix/v1-profile-conflict-storm-20261102` | Remplacée par la variante V1.1 | À fermer sans fusion |
| #65 à #98, #117, #119 à #124, #131, #133 (42 PR) | Piles `codex/web-*-cdc`, `codex/rpg-*-cdc`, `codex/v11-*`, `claude/titan-finition-web`, `codex/v12-android-compact-rpe-ux`, `fix/supabase-stability-audit` | Leur tête est déjà un ancêtre de `main` : tout leur contenu est publié dans `main` par les points d'intégration | À fermer sans fusion (PR empilées les unes sur les autres, bases obsolètes) |

Fermer une PR ne supprime ni sa branche ni son historique. La fermeture des 43 PR obsolètes est laissée à la décision du
propriétaire (action visible sur GitHub).

## 4. Anciennes implémentations volontairement écartées

- Formules d'XP, boutique, talents et bestiaire de la génération V42 à V89 : remplacés par le moteur Ascension (V300).
- Paiement Web Paddle et Lemon Squeezy : conservés pour les droits existants, aucune nouvelle vente Web.
- Application Android TWA : remplacée par l'application React Native ; les workflows TWA restent pour l'historique.
- Premières versions du QG à trois tuiles doublant la barre d'onglets : remplacées le 16 novembre (voir `56bf2da`).
- Libellés d'offres vagues (« Analyses plus poussées », « Mesures avancées pour chaque sport ») : remplacés par les avantages précis.

## 5. Migrations SQL

| Plage | État |
|---|---|
| Jusqu'à `20261116110000` | Appliquées en production le 16 novembre 2026, empreinte identique au dépôt (`supabase/release-v131/README.md`) |
| `20261117090000` (TITAN LIVE) et `20261117100000` à `20261117160000` (7 migrations des fonctions Android) | **Non appliquées.** Additives, vertes sur réplique. Renumérotées après la dernière migration de production pour que l'ordre de rejeu soit le même partout. Paquet prêt et répété : `supabase/release-v14/` (son `README.md` dit ce qui devient visible à l'application). D'ici là, les écrans concernés affichent « pas encore disponible » |

## 6. Règles pour les prochaines sessions

1. Partir de la branche de référence, jamais d'une PR empilée.
2. Dater toute nouvelle migration **après** la dernière migration appliquée en production.
3. Relancer l'inventaire avant de chercher « une correction perdue » : une branche sans contenu unique n'en contient pas.
4. Ne jamais fusionner une branche antérieure à novembre 2026 : n'en reprendre qu'une idée, réécrite sur l'architecture actuelle.
