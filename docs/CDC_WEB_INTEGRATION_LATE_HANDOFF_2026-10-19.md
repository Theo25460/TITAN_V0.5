# Checkpoint sécurité et activation — 19 octobre 2026

Priorité : A08 / QA05 / ACT09. Sources figées : PR104 `58abfce0c1b05ec149542f2d94a6769e118b52c7` et Claude `3970e34` (CSP, inventaire technique du consentement, faux positifs). Les deux historiques sont conservés. CHEAT19 (`95552c3`, `71721d9`) reste hors de ce checkpoint ; aucune nouvelle tête absorbée implicitement.

## Résultat

Les deux conflits de fusion conservent les suites navigateur des deux parents et les versions `moment300.2` / `sessions300.4`. Les vingt migrations et leurs inventaires restent intacts. Aucun changement de règles produit, de gains ou de données réelles.

La CI SQL utilise l'image officielle immuable `postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3`, correspondant à la version de production rapportée dans le cahier. Le banc exige réellement `server_version_num=170006` avant toute fixture. Les deux voies (migrations puis bundle historique et correctifs) et les tests de concurrence restent exécutés. Python est installé dans le conteneur pour les contrats à deux connexions.

Les six cas d'activation appliquent désormais la CSP exacte de netlify.toml aux documents, enregistrent les erreurs JavaScript et les refus CSP, et bloquent le réseau externe. Ils couvrent offre, choix d'aventure, QG, récapitulatif invité et navigation vers l'inscription aux deux largeurs360/1280. L'enregistrement invité utilise la vraie fonction logActivity, sans soumission du formulaire sportif ni confirmation de compte réel.

## Preuves locales

- `pnpm run verify` :255/255, build et garde de publication verts ; audit0erreur et16avertissements existants.
- Contrat CI : RED avec l'ancien PostgreSQL16 puis GREEN3/3 avec l'image17.6.
- `bash -n tools/db/test-migrations.sh` : réussi.
- Activation avec CSP réellement injectée :6/6 ; suite CSP séparée et activation avant renforcement :9/9.
- Revue bornée indépendante Astra élevée : aucun Critical/Important ; inventaires/rollback/CI6/6. Sa réserve sur l'absence de CSP dans les tests d'activation est corrigée et les six cas repassent.

## Limites et suite

La CI native complète du checkpoint reste à lire avant de déclarer la PR prête. Une configuration d'image ne prouve pas son exécution. Le banc PostgreSQL ordinaire ne couvre pas les branches pg_cron du fournisseur. Aucun typecheck ajouté, restauration réelle, recette humaine, appareil Android ou compte connecté réel certifié. ACT01/ACT04 restent partiels ; ACT09 n'est pas un nouvel audit global.

Bloquant avant PR prête : CI complète et logs SQL17.6 des deux voies. Non bloquant : pg_cron après application réelle, qualification juridiqueQ-002, tests humains. Prochain macro-bloc : intégrer le lot de recours uniquement après libération explicite de sa réservation, puis traiter ses interfaces selon le cahier. Pas de nouvelle micro-PR de libellés d'activation. Aucune fusion main, migration réelle ou publication du site.
