# Passation — QA14, états publics du fallback CMS

## Résultat

La page dynamique utilise la marque TITAN au lieu de TITAN OS. Le contenu en cours de lecture porte `aria-busy=true` ; une région de statut persistante, extérieure au contenu remplacé, annonce chargement, réussite ou indisponibilité sans déplacer le focus. L'état final rétablit `aria-busy=false`. L'absence de slug/client/contenu, l'erreur de lecture et le rejet d'initialisation du client conduisent au fallback explicite.

Le rejet de `getClient()` était auparavant en dehors du `try` : il pouvait laisser le chargement affiché avec une rejection non gérée. L'attente se trouve désormais dans le `try` existant. Le fallback conserve son titre Page introuvable, corrige ses accents et propose Retour à l'accueil et Assistance. Sans JavaScript, le chargement décoratif est masqué et une explication avec les mêmes actions apparaît ; aucun faux contenu CMS n'est montré.

Région de statut cachée visuellement selon une classe locale, actions alignées avec les liens existants ; aucune refonte. CSS dynamique 300.1 et JS dynamique 300.2 dans leur consommateur. Métadonnées/JSON-LD/robots/canonical, slug, filtre published, contenu HTML CMS de confiance et analytics existants gardent leur contrat. Ce lot ne remplace pas un audit de sanitation/autorisation du CMS ni une qualification globale d'accessibilité.

Références techniques : [état aria-busy](https://www.w3.org/TR/wai-aria-1.2/#aria-busy) et [rôle status](https://www.w3.org/TR/wai-aria-1.2/#status). Les tests vérifient le DOM et les interactions ; aucun lecteur d'écran réel ni certification WCAG revendiqué.

## Périmètre et coordination

- Branche `codex/web-cms-fallback-cdc`, base de travail PR #51 publiée `b47f1263714aeee0dc85f72d23de9feb04646374`, locale `24ff253b9117b1b50d8f6c302a4ae40eed6be6bb`, arbre commun `3e33c77cde800094811f6a9dbeceece7ce68e0c3`.
- Cinq fichiers : `dynamic-page.html`, `css/dynamic-page.css`, `js/dynamic-page.js`, section CMS/SEO de `tests/e2e/smoke.e2e.mjs`, présente passation.
- Lot indépendant des workers radios/labels dans des worktrees séparés. Ajouts au fichier E2E commun dans des sections distinctes et intégration séquentielle par coordinateur. Le test PWA global complète les générations antérieures des lots intégrés.
- Claim CODEX CMS natif avant écriture, CSS ajoutée au périmètre avant sa modification. Aucun compte/base/provider réel, backend/SQL, contenu CMS distant, économie/récompense/Premium, collecte nouvelle, image étrangère, Android, fusion ou déploiement.
- QA14 avance seulement en `[~]` : un résidu visuel public précis corrigé et fallback qualifié ; autres placeholders/configurations et vraie release restent à auditer. UX06/UX09/QA13 restent partiels. 307 formulations et 42 ajouts juridiques conservés ; WORK/Play Console et RPG01 intacts.

## Vérification

Baseline verify : 183 tests réussis, build 101 ressources hors ligne et 16 avertissements préexistants sans erreur.

Quatre régressions RED sur le parent : busy absent, initialisation rejetée sans fallback, état final non déclaré, absence d'explication sans JavaScript. Après correction : 9/9 ciblés (quatre nouveaux et cinq vérifications CMS/SEO existantes), sans erreur de page, chargement/réussite/rejet/no-JS à 360 et 1280 px ; statut DOM conservé au remplacement et récupération clavier via Retour à l'accueil. Lecture CMS manquante/500 via SDK réel avec transports fictifs, cohérence des métadonnées et absence d'exécution des chaînes de test préservées.

Chromium absent après reprise du runtime : installation unique partagée par le worker radios, puis vraie reproduction RED. Pas de changement de dépendance/lockfile ou de code pour contourner l'environnement. Suites complètes, rendu, revue indépendante unique et CI exacte restent à consigner après vérification.

Premier run complet : 240/241, unique échec d’un ancien sélecteur `.dynamic-back[href='/']` désormais partagé avec la nouvelle récupération. Contrôle borné à `.dynamic-nav`, sans changement produit. Les suites finales après intégration et cette précision doivent réussir avant remise.

Intégration séquentielle : lot labels repris comme parent local `94675906bd4e84d739464b35ca27747f65fe5895`, PR #52 publiée `cc1ec41aa9df78fa85d5d2c08cfe213de03474e7`. Ajouts CMS appliqués sans écraser ses sections/HTML. Le test PWA global inclut maintenant shell300.3 et dynamique300.1 dans les anciennes générations ; consommateurs shell300.4 et dynamique300.2 présents. Revue unique a validé l’ancien sélecteur borné, 1/1 rejoué ; 15/15 CMS/SEO/analytics ciblés réussis.

Validation finale après intégration labels : pnpm verify183/183, build101 hors ligne, audit0erreur/16 avertissements existants ; E2E244/244, zéro échec/skipped. Quatre états (chargement, publié, indisponible, sans JavaScript) inspectés sur quatre captures réparties360/1280. Revue indépendante unique Sol6.1high sur24ff253..888dd9f sans Critical/Important/Minor, 9/9 rejoués ; ajustement du sélecteur historique revalidé1/1 par le même réviseur. Métadonnées, contrat CMS et analytics préservés.
