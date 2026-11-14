# TITAN V1.3.1 · Opération Renaissance finale — registre de travail

Branche : `claude/titan-v131-finalization-9g6jjo` (PR #148, brouillon). Point de départ et premiers lots : [`../V131_FINALISATION_2026-11-14.md`](../V131_FINALISATION_2026-11-14.md).

- [`REGISTRE.md`](REGISTRE.md) : registre central (anomalies, corrections, preuves, statut, SHA).
- `lot*.md` : matrices détaillées par lot, une ligne par élément contrôlé.

## Format des matrices (obligatoire pour chaque lot)

`| Élément | Attendu | Réalité constatée | Écart | Gravité | Correction | Preuve | Statut |`

- **Gravité** : `P0` (sécurité, perte de données, paiement, confidentialité, parcours critique impossible, blocage de publication), `P1` (défaut fonctionnel important, UX majeure, promesse commerciale incorrecte, incohérence juridique, SEO technique sérieux), `P2` (finition), `—` (conforme).
- **Statut**, un seul parmi : `Vérifié conforme` · `Corrigé et vérifié` · `Corrigé, non testé en conditions réelles` · `En attente d'approbation` · `Bloqué par un accès externe` · `Non terminé`.
- **Preuve** : fichier:ligne, nom du test, commande et résultat, capture, ou requête. Jamais « relu » sans référence.
- Un problème non reproduit n'est pas « résolu » : l'écrire tel quel.

## Règles communes à tous les intervenants

1. Ne rien publier : ni Netlify, ni Google Play, ni migration ou écriture sur la base de production (`oubmftfufwwzwpgvrcag` : lecture seule).
2. Ne pas modifier les règles d'XP, l'économie, les prix, ni les droits commerciaux. Ne pas supprimer ni désactiver un test pour le faire passer.
3. Ne pas toucher aux logos et visuels d'abonnement, aux pictogrammes sportifs approuvés, ni remplacer une image active par un visuel non approuvé. Aucun SVG ou dégradé présenté comme une illustration photoréaliste.
4. Palette : `#05070A`, `#0E141A`, `#1B2530`, cyan `#3DD9E8` (accent fonctionnel), ambre `#F4BB54` (accomplissements). Utiliser les jetons existants (`css/ascension.css`, `mobile/src/theme/tokens.ts`).
5. Aucune commande git qui écrit (commit, push, checkout, stash, reset). Les commits sont faits par le responsable de la branche, par lot.
6. Chaque intervenant ne modifie que les fichiers de son périmètre ; un besoin hors périmètre est noté dans sa matrice, colonne Correction, avec la mention « à faire par : … ».
7. Ne pas lancer `tools/build-public.mjs` ni `pnpm run test:e2e` (le dossier `dist/` est partagé) : tests unitaires ciblés uniquement, la recette complète est faite à l'intégration.
8. Français soigné dans l'interface : tutoiement, apostrophes typographiques « ’ », espaces insécables avant « : ; ? ! », pas de jargon interne.
