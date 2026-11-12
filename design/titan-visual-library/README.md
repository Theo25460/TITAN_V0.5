# TITAN — Bibliothèque visuelle officielle

Bibliothèque versionnée des assets **explicitement approuvés** pour TITAN. Source de vérité des décisions graphiques avant intégration Android (priorité) puis Web.

## État
- **Lot 01 — Sports 3D : 10/10 validés pour la bibliothèque** (12 novembre 2026).
- **Intégration Android/Web : non lancée.** Aucun changement d'écran ou de composant dans ce commit.
- **Abonnements TITAN+ / Coach / Coach Ultra : exclus de la refonte.**
- Objectif ultérieur : iconographie individuelle des 260 sports, par lots de 10 avec validation explicite.

## Navigation
- [Charte](CHARTER.md)
- [Catalogue JSON](registry/sports-lot-01.json)
- [Lot 01 et aperçu](sports/lot-01/README.md)
- [INSTRUCTIONS-WORK](INSTRUCTIONS-WORK.md)

## Règle d'approbation
Le fichier peut exister dans `proposals/` avant validation, mais **seuls les assets dans `sports/lot-XX/icons/` répertoriés `approved_for_library` sont réutilisables**. Les demandes de modifications génèrent une nouvelle version ; aucune substitution silencieuse. La validation d'une direction artistique n'approuve pas automatiquement les illustrations ultérieures.

## Organisation cible
`sports/lot-XX/icons/`, `ui-icons/`, `rpg/`, `rewards/`, `states/`, `marketing/`, `registry/`, `proposals/`. Ne pas multiplier les copies dans `image/`, `assets/`, `mobile/assets/` avant intégration contrôlée.
