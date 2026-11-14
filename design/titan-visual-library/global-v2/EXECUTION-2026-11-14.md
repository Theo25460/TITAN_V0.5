# Reprise du chantier — 14 novembre 2026

La PR #147 contient 157 propositions, dont quatre alternatives photographiques de mondes. Les créations restent soumises à validation esthétique avant toute mise en production.

## Passe de finalisation V1.3.1 (même jour)

### Fait
- **Intégration des 4 blasons approuvés** (Éclaireur, Explorateur, Sentinelle, Gardien) sur le Web et Android, sur la branche
  `claude/titan-v131-finalization-9g6jjo` (commit `88b0ad4`, PR #148, brouillon). Copies identiques à l'octet des exports approuvés :
  `assets/ranks/` et `mobile/assets/rank/` (256 et 512 px). Écrans : bandeau du QG, carrière, profil, aventure, révélation de niveau,
  moment de séance. Champion, Titan et Légende gardent le blason vectoriel du code tant que leur visuel n'est pas approuvé.
- Registre (`registry/assets.json`) : les 4 rangs approuvés portent `integration` (branche, commit, fichiers, vérifications faites et non faites).
- **Contrôle `render` réparé** : il échouait depuis l'approbation (« master not registered » pour les 4 SVG remplacés, puis « Unauthorized
  state »). Une proposition vectorielle remplacée par un master approuvé reste archivée dans `proposed/` sans être rendue ni comptée, et
  l'état `approved` / `user_approved` est accepté quand le master est sous `approved/masters/`. Chaîne rejouée sur une copie : 0 anomalie,
  617 références vérifiées.

### Bloqué : production des illustrations manquantes
Un générateur d'images était connecté à la session (Buzzy), mais aucun visuel n'a pu être produit dans les règles de la mission :
1. `insufficient credit` pour `gpt-image-2.6-sunburst` et `Nano Banana Pro` ; seul `Nano Banana 2` (1K) a accepté une génération.
2. Les images sont servies par `res-prod.buzzy.now`, hôte refusé par la politique réseau de la session ; l'autorisation de cet hôte a été refusée.
3. Le bac à sable du générateur n'est pas inclus dans l'offre : impossible de voir ou de retoucher une image côté générateur.

Un seul candidat « Champion » a été généré avec les 4 blasons approuvés en référence. **Il n'a jamais été vu, contrôlé ni enregistré dans
ce dépôt** et n'a donc aucun statut dans le registre. La génération a été arrêtée pour ne pas dépenser de crédits sur des images invérifiables.
Aucun SVG ni dégradé n'a été fabriqué pour simuler un visuel photoréaliste.

### Reste à produire (style des 4 blasons approuvés, fonds transparents)
1. Blasons **Champion, Titan, Légende** (priorité : ils complètent l'échelle déjà intégrée).
2. 12 récompenses et leurs états, 4 balises de chapitre, paliers.
3. Illustrations d'états vides, de social, de profil, de statistiques et d'onboarding.

Les 153 propositions vectorielles restent `proposed` : elles ne répondent pas à la direction artistique photoréaliste et ne sont pas intégrées.
Mondes, gardiens et avatars actuels du produit restent en place.

### Pour reprendre
Autoriser `res-prod.buzzy.now` dans les domaines autorisés de l'environnement et recharger les crédits du générateur. Pour chaque rang
approuvé ensuite : déposer master et exports sous `approved/`, mettre à jour le registre, puis ajouter l'identifiant à `BADGES`
(`js/app/crest.js`) et à `rankImages` (`mobile/src/core/images.ts`) avec ses deux fichiers.
