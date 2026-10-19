# Handoff — img-src fermé (LEG40, LEG41, SEC03)

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `48062b1`. Aucune fusion, aucun déploiement : l'en-tête ne change en production qu'au prochain déploiement.

## Audit (lecture seule de la production, comptages par colonne et par hôte)

Colonnes examinées : `dynamic_pages.cover_image_url`, `mobs.image_url`, `bosses.image_url`, `creatures.image_url`, `shop_items.image_url`, `content_blocks.image_url`, `lore_chapters.image_url`. Résultat : **aucun hôte externe** — tout est relatif ou vide (24 boss, 13 monstres, 10 objets avec chemin relatif ; 25 objets et 4 blocs sans image ; pages dynamiques, créatures et chapitres vides). Les avatars de l'application sont des fichiers locaux (`/assets/renaissance/*.webp`, `/image/avatar/*`) ; le stockage public Supabase (`js/ui.js`, `getAvatarUrl`) ne sert qu'aux anciens fichiers téléversés de la forme `nom_chiffres.ext`. Seuls deux endroits placent une URL de la base dans `src` : `js/dynamic-page.js` (`cover_image_url`) et `js/content.js` (`content_blocks.image_url`) ; les `image_url` des monstres, boss et créatures ne sont pas affichés aujourd'hui. Aucune donnée personnelle lue.

## Décision

`img-src 'self' data: blob: https://oubmftfufwwzwpgvrcag.supabase.co https://*.paddle.com` au lieu de `… https:`. Une image externe saisie plus tard par l'administration (champs « Image URL » du centre de contrôle) serait **bloquée** par le navigateur : l'héberger sur le site ou dans le stockage Supabase.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| LEG40 | reste `[~]` | Plus aucune autorisation ouverte dans la CSP (`openAllowances` vide dans `docs/third-party-hosts.json`, comparé à la CSP par test). |
| LEG41 | reste `[ ]` | Surface réseau seulement ; le CMP n'est pas traité. |
| SEC03 | reste `[~]` | Un contenu injecté ne peut plus charger d'image (ni pixel espion) depuis un hôte arbitraire. |

## Vérifications

`tests/e2e/csp-browser.e2e.mjs` : RED d'abord (2 échecs), puis vert — zéro violation sur les 44 pages **déconnectées** ; la sonde montre que la politique laisse passer l'hôte Supabase et refuse un hôte tiers (elle ne prouve pas que l'application affiche une telle image) ; la politique ne contient plus `https:` seul dans `img-src`. L'autorisation `*.paddle.com` pour les images n'a aucun usage démontré dans le dépôt : elle est conservée par prudence (le cadre de paiement a sa propre politique) et pourra être retirée si la recette sandbox n'en a pas besoin. `pnpm run verify` : voir clôture.

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert.

## NON BLOQUANT / BACKLOG FINITION

- Parcours connectés non rejoués sous la CSP ; vérifier après déploiement que avatars, images de boutique et du jeu s'affichent (console).
- *Fait après la revue* : les champs « Image URL » / « Image couverture » du centre de contrôle refusent à l'enregistrement tout hôte autre que le site et le stockage du projet (`window.titanAdminValidators.imageUrlProblem`, test navigateur à 12 cas, `js/admin.js` 300.4).
- Si le projet Supabase change de référence ou de domaine, `netlify.toml` (codé en dur) et `getPublicUrl` doivent suivre ensemble.
- Relancer l'audit des colonnes d'images juste avant le déploiement : il date du 19/10/2026.
- Si Paddle ou un autre prestataire affiche des images dans notre page depuis un autre hôte, les ajouter explicitement.

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

Consentement (LEG41/CMP) ; nonces pour retirer `'unsafe-inline'`.

## Retour arrière

Remettre `https:` dans `img-src` de `netlify.toml` et l'entrée `openAllowances` dans `docs/third-party-hosts.json`.
