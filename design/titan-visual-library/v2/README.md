# TITAN — Bibliothèque sportive V2 (chantier)

**Etat : production en cours, aucune intégration dans l'app.**

Cette branche repart du commit main 67e17c79 et ne conserve **aucune planche sportive historique en actif**. Les anciens fichiers sont intacts sur main et la branche de secours `design/archive-titan-sports-library-20261112`.

## Conventions
- **Source de vérité pour les IDs** : `js/core/sports-catalog.js` (260 sports).
- **Registre complet** : `registry/canonical-sports.json` (lots B01…B26).
- **Etat** : `planned`, `proposed`, `approved_reference_pending_binary`, `approved_for_library`, `integrated`, `rejected`.
- **Règle** : seules les versions `approved_for_library` ayant un fichier réel, une empreinte et une validation explicite peuvent être intégrées.
- **Sports non validés** : conserver les images/fallback de l'application, aucune substitution automatique.
- **Football V05** est la référence artistique approuvée ; son image ne doit être marquée `approved_for_library` que lorsque le binaire a effectivement été importé et vérifié.
- Chaque objet doit être spécifique au sport, sur fond transparent, avec marque TITAN discrète et test 32/48/64 px.

## Périmètre
Ce chantier n'édite pas les écrans Android/Web, les visuels des abonnements, ni les données Supabase. Une branche d'intégration distincte sera utilisée une fois les images validées.