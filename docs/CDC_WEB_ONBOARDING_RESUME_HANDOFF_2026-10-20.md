# Reprise de l’onboarding — 20 octobre 2026

Priorité ACT03 / ACT08 / UX10. Base figée : PR108, HEAD `95eb0dcd1571eababd103d0fc0eda7e7a91fd252`. Aucune nouvelle tête externe absorbée. Aucun merge main, déploiement ni migration réelle.

## Comportement livré

Les sports, le rythme et l’étape sont repris après rechargement ou retour d’une autre page. Le brouillon local version1 contient uniquement propriétaire, génération d’onboarding, horodatage, étape, sports et objectif hebdomadaire. Validité48h, tolérance d’horloge future5min ; un brouillon invalide est retiré à sa prochaine lecture. Ce délai ne promet pas une purge physique automatique à48h.

Le brouillon reste distinct des préférences finales. Aucun consentement n’y est conservé : le réglage effectif actuel est relu au montage. Aucune inscription, connexion externe, sélection de sport ou aventure n’est imposée. Le parcours direct séance/QG et l’aventure facultative restent disponibles. Une indisponibilité du stockage est annoncée sans bloquer la fin locale.

Le brouillon est conservé à la déconnexion et effacé pour son seul propriétaire par la suppression locale, y compris si IndexedDB échoue ou manque. La fin acceptée l’efface. Les vues capturent propriétaire, client et epoch ; une action devenue obsolète est ignorée et relance le bon contexte. Les changements de compte annulant une attente et les résultats tardifs ne terminent pas le nouveau compte. Même sans événement de transition, une réponse tardive détecte le contexte invalide et déverrouille le nouveau parcours.

## Périmètre et cache

Onboarding.js300.4→300.5 ; training-store.js ajoute uniquement le préfixe conservé et la clé propriétaire à supprimer. Scripts cachés7jours : tous ses consommateurs HTML passent300.2→300.3. Exception technique profile.html explicitement enregistrée au cahier avant modification : seul ce jeton partagé change. Aucun js/app/profil.js, tests/e2e/smoke.e2e.mjs, écran Profil, contrat saveState, SQL, règle RPG, économie ou source Android modifié.

La nouvelle suite est enregistrée dans test:e2e, couverte par le contrat générique d’exhaustivité. Pas de nouveau plan/spec séparé pour ce lot borné.

## Preuves avant publication

Baseline278/278. RED des tests de conservation/suppression du nouveau préfixe puis16/16verts. RED de reprise contre l’ancienne implémentation. Cas additionnel RED : changement de propriétaire silencieux pendant la fin, ancien écran toujours occupé ; après correctif, parcours du nouveau compte disponible sans navigation tardive.

Version finale : verify278/278, build/audit/garde de publication verts (16 avertissements éditoriaux préexistants). Nouvelle suite11cas + activation6cas :17/17 ; gardes existantes de fin/consentement12/12 sans modification de leur source. Nettoyage propriétaire16/16, y compris IndexedDB absent/défaillant. Diff sans erreur d’espacement.

Couverture navigateur sous CSP exacte de production : reprise aux largeurs360/1280, pas d’écriture finale anticipée, consentement exclu, retour depuis autre page, parcours sans sport/RPG obligatoire, effacement après fin ; syntaxe/version/propriétaire/génération/âge/étape/objectif/sports invalides ; stockage bloqué ; A→B→A ; changements silencieux de propriétaire/client/epoch ; résultat tardif avec ou sans événement de compte.

Une revue indépendante bornée et sa vérification du dernier correctif n’ont trouvé aucun Critical/Important. Les comptes et transitions sont synthétiques, le service worker est désactivé dans ces nouveaux tests. Pas de preuve de compte réel, appareil/PWA installé, compréhension humaine ou reprise cloud réelle ; les limites de fin non atomique et du plafond cloud2,5s restent celles du lot précédent.

## Clôture et suite

Avant PR prête : lire les contrôles CI du HEAD publié, y compris navigateur complet, deux voies natives PostgreSQL17.6 et APK d’essai si déclenché. Les23migrations héritées restent non appliquées en production ; aucune nouvelle migration dans ce lot.

ACT03 est couvert sur le périmètre web automatisé : questions facultatives, aucune connexion externe imposée, reprise des choix, sport seul possible. ACT08 et UX10 restent partiels pour leur périmètre transversal et les vérifications réelles/humaines. Prochain macro-bloc : recette de confiance et reprise authentifiée après interruption réseau, selon claims disponibles ; éviter un nouveau lot de micro-polissage de l’onboarding.
