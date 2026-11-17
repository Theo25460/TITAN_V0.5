# Paquet de production v19 (généré) — DÉCISION DU PROPRIÉTAIRE, NON APPLIQUÉ

Généré par `node tools/db/build-production-bundle.mjs --bundle v19`. **Ne pas modifier à la main.**

Une seule migration, `20261121140000_titan_plus_coach_capacity` : un TITAN+ personnel ne donne plus de places de suivi coach (règle héritée
de la V1 : 20) ; sans offre Coach, la capacité est celle du Classique (3), avec ou sans TITAN+. Seules les offres Coach (5) et Coach Ultra
(15) donnent des places. Aucune suppression ni révocation : les liens au-delà de 3 d'un compte TITAN+ sont mis en pause (v18) et reprennent
avec une offre Coach. Au 21 novembre 2026, la production n'a aucun lien coach ni aucun TITAN+ payant.

Les textes publics (accueil, `/titan-plus`, `/pour-les-coachs`, CGU § 4.2 bis, partenariats, Atelier, espace coach) changent dans le même
commit. **Les CGU modifiées demandent une relecture juridique avant publication.**

Procédure : `00-check-before.sql` (fin de v18, deux `ok = true`), `01-…`, `99-check-after.sql`, puis les postflights v11, v13, v131.
Retour arrière : réappliquer `private.titan_coach_capacity` de `20261102090000`.
