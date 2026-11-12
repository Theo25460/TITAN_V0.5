# INSTRUCTIONS-WORK — Sports V2

## Sécurité
- Travailler sur la branche `design/titan-sports-library-consolidation-20261112` ou une branche dérivée, **jamais directement main**.
- Lire `v2/CHARTER.md`, `v2/registry/canonical-sports.json`, puis le catalogue réel des 260 sports.
- Ne pas modifier les anciens assets en production avant qu'un remplaçant soit approuvé et qu'un rollback soit préparé.

## Workflow
1. Sélectionner un `sport_id` canonique, non un libellé approximatif. Renseigner l'objet visuel attendu.
2. Générer individuellement : une image source = un sport. Les planches ne servent qu'aux revues, jamais comme source haute résolution.
3. Exporter PNG maître transparent puis WebP compressés 512, 256, 96. Vérifier les dimensions et le canal alpha.
4. Soumettre au propriétaire : capture à 48px, objet entier et rendu 512px. Sans accord explicite, statut `proposed`.
5. Après validation, archiver l'image sous `v2/approved/BXX/<sport_id>/`, ajouter SHA-256, version et date, statut `approved_for_library`.
6. Pour Android/Web, mapper `sport_id` vers l'asset validé ; conserver un fallback pour tout sport sans asset. Vérifier taille, performance, accessibilité et hors ligne.
7. Une modification visuelle substantielle exige une nouvelle version et validation. Aucune publication de l'application sans gate QA final.

## Interdictions
- Modifier TITAN+, Coach, Coach Ultra, paiement ou règles de progression.
- Déduire les ID de noms d'assets antérieurs.
- Déployer des visuels `planned`, `proposed`, `rejected` ou `approved_reference_pending_binary`.
- Affirmer qu'un fichier existe sur GitHub sans vérifier son chemin et son blob.
