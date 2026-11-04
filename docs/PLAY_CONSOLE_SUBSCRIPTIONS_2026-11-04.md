# TITAN — Produits Google Play (déclarations propriétaire, 04/11/2026)

> État : fiches configurées ou en cours dans Google Play Console par le propriétaire. **Aucun achat réel, plan de base actif, prix effectif ni publication commerciale n'est vérifié par cette note.** Ne pas utiliser d'identifiant issu d'une ancienne proposition à la place des IDs réellement créés.

| Offre | ID de produit Google Play | Nom console | Public saisi par le propriétaire | Prix prévu au cahier |
| --- | --- | --- | --- | --- |
| TITAN+ | `titan01` | `TITAN+` | Non communiqué | À confirmer |
| Coach | `titan02` | `Coach` | 18 ans et plus | 20 €/mois, **à confirmer dans Play Console** |
| Coach Pro | Non communiqué | Offre prévue, non déclarée créée | Non communiqué | 40 €/mois (projet) |

## Coach — contenu de fiche proposé

- Jusqu’à 5 sportifs suivis
- TITAN+ inclus pour coach et sportifs
- Programmes et objectifs personnalisés
- Messagerie et bilans de progression

L’offre prévoit 5 sportifs rattachés avec TITAN+ inclus pour les sportifs et le coach, tant que les droits et les consentements sont valides. Les programmes, la messagerie et les bilans doivent être validés réellement avant d’être promis commercialement. Les données privées des sportifs ne deviennent pas automatiquement visibles au coach.

Description proposée : « Accompagne jusqu’à 5 sportifs avec TITAN Coach : programmes, objectifs, échanges et bilans de progression, avec TITAN+ inclus pour toi et tes sportifs suivis. »

Le réglage **« 18 ans et plus »** est une décision de configuration rapportée par le propriétaire, à vérifier avec les déclarations de public cible et la conformité Play. Il n'apporte pas à lui seul un avantage fiscal, financier ou une dispense de conformité.

## Identité visuelle

- TITAN standard : logo cyan historique, **inchangé**.
- TITAN+ : orange dégradé sur fond noir, asset SVG `image/titan-plus-logo.svg`. Le PNG de référence 1024 × 1024 est inséré dans le cahier des charges.
- Coach : vert dégradé sur fond noir, mot-symbole TITAN blanc, cartouche COACH vert, asset SVG `image/titan-coach-logo.svg`. Le **PNG validé 1024 × 1024** est inséré dans le cahier des charges. Le SVG est une adaptation vectorielle, pas une copie pixel par pixel du PNG.

## À faire avant d'activer les achats

1. Confirmer dans Play Console les IDs de forfaits de base, prix, territoires, renouvellement et statut de publication ; conserver les vrais IDs `titan01` et `titan02`.
2. Aligner les product IDs codés côté Android, les validations Google Play Developer API, le serveur et les droits Supabase (anciens libellés envisagés : `titan_plus`, `coach`, etc.).
3. Vérifier les licences de test, les jetons d'achat, accusés de réception, restauration, expiration, annulation, remboursement, synchronisation et isolation des comptes.
4. Vérifier les fonctionnalités réellement livrées et les informations légales/politiques du public ciblé avant toute commercialisation.

Référence de suivi détaillé : cahier des charges Google Docs « Titan — Cahier des charges vivant Codex — Android, monétisation, RPG & sécurité », section BILL-04 / COACH.
