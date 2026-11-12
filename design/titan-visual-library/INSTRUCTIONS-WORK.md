# INSTRUCTIONS-WORK — TITAN VISUAL LIBRARY

## Source de vérité
Lire `README.md`, `CHARTER.md` et `registry/sports-lot-01.json` **avant toute sélection d'asset**.

## Sélection
1. Identifier le `sport_id` réel via `js/core/sports-catalog.js` / `Sports` ; ne pas utiliser le slug supposé à la place.
2. Rechercher un asset marqué `approved_for_library` dans le registre ; vérifier son `id` et sa version.
3. S'assurer que la représentation distingue bien la discipline (VTT ≠ gravel).
4. Si aucun asset approuvé n'existe, conserver temporairement l'icône actuelle. Ne jamais faire de génération ou de remplacement automatique en production.

## Intégration Android / Web
- Android : préparer une table de correspondance explicite entre les IDs du catalogue et des images embarquées, sans casser `SportPicker.tsx` ni le mode hors ligne.
- Web : utiliser la même table sémantique et des variantes correctement optimisées.
- Dans les puces compactes, contrôler la lisibilité à 32/48/64 px, cadrage et contraste. Ces WebP ne possèdent PAS de transparence : les afficher sur un fond sombre compatible ou proposer une variante validée.
- Conserver un fallback fonctionnel pour les sports sans asset, les erreurs et les lecteurs d'écran ; l'asset décoratif ne remplace pas le nom du sport.
- Éviter toute modification des règles d'XP, de paiement, des données et des identifiants sportifs.
- Tester au moins un écran Android réel ou un rendu vérifiable avant d'utiliser ces fichiers dans une release.

## Ajout d'un lot
1. Proposer exactement 10 éléments avec IDs et usages.
2. Obtenir l'approbation explicite (individuelle ou du lot si le propriétaire le dit clairement).
3. Stocker sous `sports/lot-XX/icons/` avec noms stables `NN-slug.webp`.
4. Ajouter le registre JSON et le README du lot, formats, empreintes et statut.
5. Commit dédié sur une branche `design/...`, PR et contrôle visuel ; ne pas déployer automatiquement.
6. Une correction ultérieure crée `v2` et conserve la traçabilité, sans écraser sans revue.

## Interdictions
- Modifier les visuels des abonnements.
- Mélanger pictogrammes 3D validés et images IA de sportifs génériques.
- Traiter un recadrage 160px comme un fichier maître haute définition.
- Déployer des éléments encore `pending`, `rejected` ou non répertoriés.
