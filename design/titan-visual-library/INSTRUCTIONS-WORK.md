# INSTRUCTIONS-WORK — Mission iconographie TITAN (260 sports)

## Périmètre et état réel
Travailler **uniquement** sur `design/titan-sports-library-consolidation-20261112` ou une branche dérivée. Les anciens lots d'assets ont **déjà été nettoyés sur cette branche** : ne pas répéter le nettoyage. `main` et l'archive restent inchangés. Aucun visuel V2 n'est intégré à Android/Web.

## Source de vérité
- `js/core/sports-catalog.js` : IDs canoniques.
- `design/titan-visual-library/v2/registry/canonical-sports.json` : 260 sports répartis en 26 lots.
- `design/titan-visual-library/CHARTER.md` : règles artistiques.
- `design/titan-visual-library/v2/examples/football-v05-160.webp` : **aperçu artistique approuvé**, pas un master.
- Master Football V05 : `a_clean_isolated_product_style_render_transparent.png`, 1254×1254 RGBA, à récupérer depuis la conversation d'origine, puis contrôler avant publication.

## Mission
1. Respecter la charte et identifier l'objet spécifique du sport à partir de son vrai `sport_id`.
2. Récupérer le master original Football V05 ; ne pas agrandir l'aperçu 160px.
3. Générer les autres sports **un par un**, présentés par petits lots de 10 maximum.
4. Montrer le rendu à 512px et 48px ; contrôler transparence, matière, ergonomie mobile, unicité, exactitude des objets.
5. Demander **une approbation explicite pour chaque version**. En attendant : `proposed`. Refus : `rejected`, nouvelle version obligatoire.
6. Après accord, conserver master indépendant, WebP 512/256/96, SHA-256, prompt, version, date/trace d'accord et ID canonique dans `v2/approved/BXX/<sport_id>/` ; statut `approved_for_library` seulement après vérification.
7. Intégrer ultérieurement sur une branche **distincte**, avec mapping des vrais IDs et fallback Android/Web, vérification hors ligne, taille, performances et accessibilité ; jamais de déploiement automatique.

**Interdictions** : fichiers fantômes, masters issus de découpes de planches, doublons, grosses marques, fonds intégrés, modifications des abonnements, paiements, XP, données ou app sans mandat.
